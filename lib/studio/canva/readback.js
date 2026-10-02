import { hashOf } from '../util.js';

// read-design output → one normalised shape the rest of the studio uses:
// { designId, title, pageCount, transactionId, pages: [{ index, pageId,
//   width, height, elements: [{ locator, id, type, frame, rotation,
//   opacity, text? }] }] }
// The connector's element JSON has evolved, so text is collected from the
// fields it has used ("text", runs, paragraphs, regions), never assumed.

const TEXT_KEYS = ['text', 'plainText', 'plain_text', 'content'];

function collectText(el) {
  // Current shape (checked live 2026-10-02): textRegions[].characters.
  if (Array.isArray(el.textRegions)) return el.textRegions.map((r) => r.characters ?? r.text ?? '').join('');
  for (const k of TEXT_KEYS) if (typeof el[k] === 'string') return el[k];
  for (const k of ['paragraphs', 'regions', 'runs', 'richText', 'rich_text', 'textContent']) {
    const v = el[k];
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      const parts = v.map((p) => (typeof p === 'string' ? p : collectText(p) ?? '')).filter((s) => s !== null);
      const joiner = k === 'runs' ? '' : '\n';
      const out = parts.join(joiner);
      if (out.trim()) return out;
    } else if (typeof v === 'object') {
      const out = collectText(v);
      if (out) return out;
    }
  }
  return null;
}

const frameOf = (el) => {
  const pick = (...keys) => keys.map((k) => el[k]).find((v) => typeof v === 'number');
  const x = pick('left', 'x');
  const y = pick('top', 'y');
  const width = pick('width', 'w');
  const height = pick('height', 'h');
  return [x, y, width, height].every((v) => typeof v === 'number') ? { x, y, width, height } : null;
};

function flattenElements(list, out = []) {
  for (const el of list ?? []) {
    out.push(el);
    if (Array.isArray(el.elements)) flattenElements(el.elements, out);
    if (Array.isArray(el.children)) flattenElements(el.children, out);
  }
  return out;
}

export function normalizeReadback(raw, { designId } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('read-back must be the JSON returned by read-design');
  if (raw.kind === 'canva-readback') return raw;
  const content = raw.design_content ?? raw.designContent ?? raw;
  const meta = raw.page_metadata ?? content.page_metadata;
  const metaPages = Array.isArray(meta) ? meta : [];
  const pages = (content.pages ?? []).map((p, i) => {
    const m = metaPages.find((x) => x.id === p.id) ?? metaPages[i] ?? {};
    const dims = p.dimensions ?? m.dimensions ?? {};
    return {
      index: (m.index ?? i + 1) - 1,
      pageId: p.id ?? m.id ?? null,
      locator: p.locator_id ?? p.id ?? null,
      width: dims.width ?? null,
      height: dims.height ?? null,
      type: p.type ?? 'fixed',
      editable: p.isEditable !== false,
      background: p.background ?? null,
      elements: flattenElements(p.elements).map((el) => {
        const text = collectText(el);
        return {
          locator: el.locator_id ?? el.id,
          id: el.id ?? null,
          type: el.type ?? (text !== null ? 'text' : 'unknown'),
          frame: frameOf(el),
          rotation: el.rotation ?? 0,
          opacity: el.opacity ?? 1,
          locked: Boolean(el.isLocked),
          ...(text !== null && { text }),
          ...(el.fill?.color?.color && { color: el.fill.color.color }),
          ...(typeof el.fontSize === 'number' && { fontSize: el.fontSize }),
          ...(el.textRegions?.[0]?.formatting && {
            fontSize: el.textRegions[0].formatting.fontSize,
            color: el.textRegions[0].formatting.color,
            fontRef: el.textRegions[0].formatting.fontRef,
            align: el.textRegions[0].formatting.textAlign,
            fontWeight: el.textRegions[0].formatting.fontWeight,
          }),
        };
      }),
    };
  });
  const totalPages = (Array.isArray(meta) ? null : meta?.total_pages) ?? content.page_metadata?.total_pages ?? metaPages.length ?? pages.length;
  return {
    kind: 'canva-readback',
    designId: raw.design_id ?? designId ?? null,
    title: content.title ?? raw.design_metadata?.title ?? null,
    pageCount: totalPages || pages.length,
    transactionId: raw.transaction?.transaction_id ?? raw.transaction_id ?? null,
    thumbnails: raw.thumbnails ?? null,
    pages,
  };
}

// State fingerprint of the elements we manage (by locator): used to notice
// that someone edited the design in Canva since our last write.
export function elementState(el) {
  const f = el.frame ? { x: Math.round(el.frame.x), y: Math.round(el.frame.y), w: Math.round(el.frame.width), h: Math.round(el.frame.height) } : null;
  return hashOf({ t: el.text ?? null, f, r: Math.round(el.rotation ?? 0), o: Math.round((el.opacity ?? 1) * 100) }).slice(0, 16);
}

export function snapshotOf(readback) {
  const out = {};
  for (const p of readback.pages) for (const el of p.elements) out[el.locator] = elementState(el);
  return out;
}

// Compares a fresh read-back with the snapshot taken after our last write.
// Only elements we placed (known locators) are compared; new elements the
// creator added are reported but never touched.
export function externalChanges(snapshot, readback, known = Object.keys(snapshot ?? {})) {
  if (!snapshot) return { checked: false, changed: [], removed: [], added: [] };
  const now = snapshotOf(readback);
  const changed = known.filter((loc) => now[loc] && snapshot[loc] && now[loc] !== snapshot[loc]);
  const removed = known.filter((loc) => snapshot[loc] && !now[loc]);
  const added = Object.keys(now).filter((loc) => !snapshot[loc]);
  return { checked: true, changed, removed, added };
}
