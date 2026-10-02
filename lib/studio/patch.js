import { ContractError, validatePatch, validateStylePayload } from './contracts.js';
import { composePage, getContentAt, setContentAt } from './document.js';
import { clone, now } from './util.js';

// Applies DesignPatch lists to a document. A batch is atomic: if any patch
// is invalid nothing changes and every problem is reported. Edits are stored
// as page overrides (or as content, for text and art that come from the
// page's content), then the touched pages are re-laid out.
//
// `scope` guards intent: a graphic command ("replace the fourth drawing")
// runs with scope 'graphic' and can never rewrite approved text, and a text
// command runs with scope 'text' and can never swap artwork.

const GRAPHIC_ONLY = new Set(['replace_text']);
const TEXT_ONLY = new Set(['replace_asset']);

export function applyPatches(doc, patches, { scope = 'any', measure, label } = {}) {
  const problems = [];
  patches.forEach((p, i) => problems.push(...validatePatch(p, `patches[${i}]`)));
  if (problems.length) throw new ContractError('patch', problems);

  const pages = new Map(doc.pages.map((p) => [p.id, clone(p)]));
  let assets = doc.assets ?? {};
  const touched = new Set();
  const changed = [];

  patches.forEach((patch, i) => {
    const where = `patches[${i}]`;
    const page = pages.get(patch.pageId);
    if (!page) return problems.push({ path: `${where}.pageId`, message: `no page "${patch.pageId}"` });
    const el = page.elements.find((e) => e.id === patch.elementId);
    if (!el) return problems.push({ path: `${where}.elementId`, message: `no element "${patch.elementId}" on page ${patch.pageId}` });
    if (scope === 'graphic' && GRAPHIC_ONLY.has(patch.action)) return problems.push({ path: where, message: 'a graphic edit cannot change text' });
    if (scope === 'text' && TEXT_ONLY.has(patch.action)) return problems.push({ path: where, message: 'a text edit cannot replace artwork' });
    const force = patch.payload.force === true;
    if (el.locked && !force && !['lock', 'replace_text'].includes(patch.action)) {
      return problems.push({ path: where, message: `element "${el.id}" is locked; unlock it first` });
    }
    if (el.locked && patch.action === 'replace_text' && !force) {
      return problems.push({ path: where, message: `text "${el.id}" is locked; an explicit edit must pass force: true` });
    }
    page.overrides = page.overrides ?? {};
    const o = (page.overrides[el.id] = { ...page.overrides[el.id] });
    const { payload } = patch;

    switch (patch.action) {
      case 'replace_text': {
        if (el.kind !== 'text') return problems.push({ path: where, message: `"${el.id}" is not a text element` });
        if (el.slot) page.content = setContentAt(page.content, el.slot, payload.text);
        else o.text = payload.text;
        break;
      }
      case 'move': {
        const x = payload.x ?? el.frame.x + (payload.dx ?? 0);
        const y = payload.y ?? el.frame.y + (payload.dy ?? 0);
        o.frame = { ...o.frame, x, y };
        break;
      }
      case 'resize': {
        const width = payload.width ?? el.frame.width * (payload.scale ?? 1);
        const height = payload.height ?? el.frame.height * (payload.scale ?? 1);
        // Scale around the centre, so "bigger" does not drift the element.
        o.frame = { ...o.frame, x: el.frame.x - (width - el.frame.width) / 2, y: el.frame.y - (height - el.frame.height) / 2, width, height };
        break;
      }
      case 'update_style': {
        const { force: _force, ...style } = payload;
        const bad = validateStylePayload(el.kind, style, `${where}.payload`);
        if (bad.length) return problems.push(...bad);
        o.style = { ...o.style, ...style };
        break;
      }
      case 'replace_asset': {
        if (el.kind !== 'image' && el.role !== 'art-placeholder') return problems.push({ path: where, message: `"${el.id}" is not an image` });
        if (!assets[payload.assetId]) return problems.push({ path: `${where}.payload.assetId`, message: `asset "${payload.assetId}" is not in the document` });
        // Art that comes from content (art, itemArt.3, photo) is replaced at
        // the source; anything else (a logo, a free image) by override.
        if (el.slot) page.content = setContentAt(page.content, el.slot, payload.assetId);
        else o.assetId = payload.assetId;
        break;
      }
      case 'delete': {
        const [key, index] = (el.slot ?? '').split('.');
        if (el.slot && index !== undefined && Array.isArray(page.content?.[key]) && el.kind === 'text') {
          const list = [...page.content[key]];
          list.splice(Number(index), 1);
          page.content = { ...page.content, [key]: list };
        } else if (el.slot && el.kind === 'text' && el.role !== 'item') {
          page.content = setContentAt(page.content, el.slot, '');
        } else o.deleted = true;
        break;
      }
      case 'lock':
        o.locked = payload.locked;
        break;
      case 'hide':
        o.hidden = payload.hidden;
        break;
      case 'layer': {
        const zs = page.elements.map((e) => e.z);
        if (Number.isInteger(payload.z)) o.z = payload.z;
        else if (payload.to === 'front') o.z = Math.max(...zs) + 1;
        else if (payload.to === 'back') o.z = Math.min(...zs) - 1;
        else {
          const sorted = [...page.elements].sort((a, b) => a.z - b.z);
          const at = sorted.findIndex((e) => e.id === el.id);
          const other = sorted[payload.to === 'forward' ? at + 1 : at - 1];
          if (other) {
            o.z = other.z;
            page.overrides[other.id] = { ...page.overrides[other.id], z: el.z };
          }
        }
        break;
      }
      default:
    }
    if (!Object.keys(o).length) delete page.overrides[el.id];
    touched.add(page.id);
    changed.push({ pageId: page.id, elementId: el.id, action: patch.action });
  });
  if (problems.length) throw new ContractError('patch', problems);

  const next = { ...doc, revision: doc.revision + 1, updatedAt: now(), assets, pages: doc.pages.map((p) => pages.get(p.id)) };
  next.pages = next.pages.map((p, i) => (touched.has(p.id) ? composePage(next, p, i, { measure }) : doc.pages[i]));
  return { doc: next, changed, label: label ?? summarize(changed) };
}

const ACTION_LABEL = {
  replace_text: 'تعديل نص',
  move: 'تحريك',
  resize: 'تغيير حجم',
  update_style: 'تنسيق',
  replace_asset: 'استبدال رسم',
  delete: 'حذف',
  lock: 'قفل',
  hide: 'إخفاء',
  layer: 'ترتيب الطبقات',
};

function summarize(changed) {
  const kinds = [...new Set(changed.map((c) => ACTION_LABEL[c.action]))];
  return kinds.join('، ');
}

// Element ids, texts and asset ids per page: lets callers prove an edit
// touched only what it meant to (see tests and the quality gate).
export function fingerprint(doc) {
  return Object.fromEntries(
    doc.pages.flatMap((p) =>
      p.elements.map((e) => [
        `${p.id}/${e.id}`,
        { kind: e.kind, text: e.text, assetId: e.assetId, style: e.style, fill: e.fill, locked: e.locked, hidden: e.hidden ?? false },
      ]),
    ),
  );
}

export function diffFingerprints(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (!a) out.push({ key: k, change: 'added' });
    else if (!b) out.push({ key: k, change: 'removed' });
    else {
      for (const field of ['text', 'assetId', 'locked', 'hidden', 'fill']) if (a[field] !== b[field]) out.push({ key: k, change: field });
      if (JSON.stringify(a.style) !== JSON.stringify(b.style)) out.push({ key: k, change: 'style' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Undo/redo: immutable snapshots. Documents share unchanged pages between
// revisions, so a snapshot costs little; asset records travel with the
// snapshot, so undoing an asset swap restores the old asset reference.

export function createHistory(doc, limit = 100) {
  return { past: [], present: doc, future: [], limit };
}

export function pushHistory(h, doc, label = '') {
  const past = [...h.past, { doc: h.present, label }].slice(-h.limit);
  return { ...h, past, present: doc, future: [], lastLabel: label };
}

export function undo(h) {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { ...h, past: h.past.slice(0, -1), present: prev.doc, future: [{ doc: h.present, label: prev.label }, ...h.future] };
}

export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { ...h, past: [...h.past, { doc: h.present, label: next.label }], present: next.doc, future: rest };
}

export { getContentAt };
