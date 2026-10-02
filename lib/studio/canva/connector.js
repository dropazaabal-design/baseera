import { canvaAlign, planCreate } from '../adapters/canva.js';
import { pageTheme, resolveColor, resolveFont } from '../theme.js';
import { plainText } from '../measure.js';
import { fontName } from './pptx.js';

// Connector plans: tool calls the assistant runs with the Canva connector,
// built from our document and the capability registry. Plans name every
// value they need from an earlier result as "$name" and never include a
// commit without the creator's approval of the preview.

const px = (n) => Math.round(n * 10) / 10;
const stripMarkers = (t) => String(t).replace(/\*/g, '');

// Registry → the capability flags planCreate understands.
export function capsFromRegistry(registry) {
  const ok = (cap) => ['supported', 'partial'].includes(registry.entry(cap, 'connector').status);
  const exportTypes = ['png', 'pdf'].filter((t) => ok(`export.${t}`));
  return {
    createDesign: ok('design.create'),
    insertText: ok('text.add'),
    updateText: ok('text.edit'),
    setFontFamily: registry.entry('text.font-family', 'connector').status === 'supported',
    insertAsset: ok('image.insert'),
    positionElements: ok('text.add'),
    preview: ok('preview'),
    exportFormats: exportTypes,
    insertShape: ok('shape.insert'),
    exactSize: ok('design.size'),
  };
}

const FORMAT_NAME = (w, h) => (h / w > 1.7 ? 'Instagram Story' : h === w ? 'Instagram Post (Square)' : 'Instagram Post (Portrait)');

// Build plan. base: { designId } of a cleared single-page design we made
// before (copying it needs no generation); otherwise create-design is used
// once and counted as a generation call. uploads: { key → mediaId } of
// files already in Canva (the journal), so nothing is uploaded twice.
export function planConnectorBuild(doc, registry, { title, assetFiles = {}, artFiles = {}, uploadKeys = {}, uploads = {}, base = null, notes = null, mode = 'native' } = {}) {
  const caps = capsFromRegistry(registry);
  const plan = planCreate(doc, caps, { mode, title, assetFiles, artFiles });
  if (!plan.ok) return { ...plan, generation: { expected: 0 } };
  const first = doc.pages[0];
  let steps = plan.steps;
  let generation = 0;
  if (base?.designId) {
    steps = [
      { tool: 'copy-design', args: { design_id: base.designId, page_numbers: [1] }, save: 'designId', note: 'نسخة من قاعدة فارغة سابقة: لا توليد.' },
      ...(base.width === first.widthPx && base.height === first.heightPx ? [] : [{ tool: 'resize-design', args: { design_id: '$designId', design_type: { type: 'custom', width: first.widthPx, height: first.heightPx } }, save: 'designId', note: 'نسخة جديدة بالمقاس المطلوب بالضبط.' }]),
      ...steps.slice(2),
    ];
  } else {
    steps[0] = { ...steps[0], args: { brief: `${title ?? 'تصميم'}: صفحة فارغة بخلفية ${doc.theme.colors.bg} بلا نصوص ولا صور`, format: FORMAT_NAME(first.widthPx, first.heightPx) }, generation: true, note: 'لا يوجد إنشاء فارغ في الموصل: هذه عملية توليد واحدة، وعناصرها تُحذف بعد قليل.' };
    generation = 1;
  }
  // Files already uploaded: drop their upload steps and use the media id.
  const known = {};
  for (const [key, hash] of Object.entries(uploadKeys)) if (uploads[hash]) known[`$media:${key}`] = uploads[hash].mediaId;
  steps = steps.filter((s) => !(s.tool === 'create-upload-url' && known[`$${s.save}`]));
  const replaceRefs = (v) => (typeof v === 'string' && known[v] ? known[v] : Array.isArray(v) ? v.map(replaceRefs) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceRefs(x)])) : v);
  steps = steps.map((s) => replaceRefs(s));
  // Title and per-page notes (a reel's timing and motion plan travels with
  // the design) go in before the read-back.
  const readIdx = steps.findIndex((s) => s.save === 'readback');
  const extra = [];
  extra.push({ tool: 'edit-design', args: { transaction_id: '$transactionId', page_index: 1, finalize: 'keep_open', operations: [{ type: 'update_title', title: title ?? doc.brief ?? 'تصميم' }] } });
  if (notes?.length && registry.entry('speaker-notes', 'connector').status === 'supported') {
    notes.forEach((text, i) => {
      if (text) extra.push({ tool: 'edit-design', args: { transaction_id: '$transactionId', page_index: i + 1, finalize: 'keep_open', operations: [{ type: 'replace_speaker_notes', page_id: `$page:${i + 1}`, notes: text.slice(0, 5000) }] } });
    });
  }
  steps.splice(readIdx, 0, ...extra);
  steps = steps.map((s, i) => ({
    ...s,
    ...(s.save === 'readback' && { note: 'احفظ الرد في readback.json، ثم canva_record (event: edit) لكل دفعة أضافت نصوصًا إن لم تُسجَّل، ثم canva_validate_arabic (design + readback، snapshot عند النجاح).' }),
    n: i + 1,
  }));
  return {
    ...plan,
    steps,
    generation: { expected: generation, note: generation ? 'create-design يُحسب عملية توليد واحدة.' : 'لا توليد.' },
    uploads: { reused: Object.keys(known).length, new: steps.filter((s) => s.tool === 'create-upload-url').length },
  };
}

// ---------------------------------------------------------------------------
// Patch: what changed between two revisions of our document → edit-design
// operations on the elements already in Canva (by locator). Text, size,
// colour, weight, alignment, position, width, opacity, rotation, shape
// colour and image changes map to operations; a font family change does not
// (the connector cannot set it) and is reported with its alternatives.

export function textFormat(el, colors, k) {
  return {
    color: resolveColor(el.style.color, colors).toUpperCase(),
    font_size: Math.max(1, Math.round(el.style.fontSize * k)),
    font_weight: el.style.weight >= 600 ? 'bold' : 'normal',
    line_height: Math.min(2.5, Math.max(0.5, Math.round(el.style.lineHeight * 100) / 100)),
    text_align: canvaAlign(el),
  };
}

export function planConnectorPatch(before, after, { locator, pageIndexOf, registry, scale = 1, transactionId = '$transactionId' } = {}) {
  const perPage = new Map();
  const unsupported = [];
  const unmapped = [];
  const notes = [];
  const add = (pageIndex, op) => {
    if (!perPage.has(pageIndex)) perPage.set(pageIndex, []);
    perPage.get(pageIndex).push(op);
  };
  const k = scale;
  for (const [pi, page] of after.pages.entries()) {
    const old = before.pages.find((p) => p.id === page.id);
    if (!old) {
      unsupported.push({ what: `صفحة جديدة ${pi + 1}`, why: 'أضفها بخطة بناء الصفحات (add_page) لا بتعديل.', route: 'connector' });
      continue;
    }
    const pageIndex = pageIndexOf ? pageIndexOf(page.id) : pi + 1;
    const ca = pageTheme(after, page).colors;
    const cb = pageTheme(before, old).colors;
    if (ca.bg !== cb.bg) {
      const bgLoc = locator(page.id, 'page-bg');
      if (bgLoc) add(pageIndex, { type: 'recolor_element', locator_id: bgLoc, color: ca.bg.toUpperCase() });
      else unmapped.push({ pageId: page.id, elementId: 'page-bg' });
    }
    // Elements the new revision no longer has (e.g. a re-layout replaced a
    // variant): removed from Canva too, and said out loud.
    for (const prev of old.elements.filter((e) => !e.hidden && !page.elements.some((x) => x.id === e.id))) {
      const loc = locator(page.id, prev.id);
      if (!loc) continue;
      add(pageIndex, { type: 'delete_element', locator_id: loc });
      notes.push(`«${prev.name ?? prev.id}» لم يعد في التصميم بعد إعادة التوزيع، فسيُحذف من Canva.`);
    }
    const fontsBefore = before.theme.fonts;
    const fontsAfter = after.theme.fonts;
    for (const el of page.elements) {
      const prev = old.elements.find((e) => e.id === el.id);
      const loc = locator(page.id, el.id);
      if (!prev) {
        if (!el.hidden) unsupported.push({ what: `عنصر جديد «${el.name ?? el.id}»`, why: 'العناصر الجديدة تضاف بخطة بناء (add_text / insert_shape / insert_fill).', pageId: page.id, elementId: el.id });
        continue;
      }
      const changed = [];
      if (el.hidden && !prev.hidden) {
        if (loc) {
          add(pageIndex, { type: 'delete_element', locator_id: loc });
          notes.push(`«${el.name ?? el.id}» سيُحذف من Canva (لا إخفاء في الموصل).`);
        } else unmapped.push({ pageId: page.id, elementId: el.id });
        continue;
      }
      if (el.hidden) continue;
      if (!loc) {
        const differs = JSON.stringify({ ...el, z: 0 }) !== JSON.stringify({ ...prev, z: 0 }) || resolveFont(el.style?.fontFamily, fontsAfter) !== resolveFont(prev.style?.fontFamily, fontsBefore);
        if (differs) unmapped.push({ pageId: page.id, elementId: el.id });
        continue;
      }
      if (el.kind === 'text') {
        if (stripMarkers(el.text) !== stripMarkers(prev.text)) changed.push(['replace_text', { type: 'replace_text', locator_id: loc, text: stripMarkers(el.text) }]);
        else if (el.text !== prev.text) notes.push(`«${el.name ?? el.id}»: تغيّر تمييز كلمة، والموصل يلوّن النص كله بلون واحد.`);
        const fa = textFormat(el, ca, k);
        const fb = textFormat(prev, cb, k);
        const diff = Object.fromEntries(Object.entries(fa).filter(([key, v]) => fb[key] !== v));
        if (Object.keys(diff).length) changed.push(['format_text', { type: 'format_text', locator_id: loc, formatting: diff }]);
        const fontA = resolveFont(el.style.fontFamily, fontsAfter);
        const fontB = resolveFont(prev.style.fontFamily, fontsBefore);
        if (fontA !== fontB) {
          const entry = registry?.entry('text.font-family', 'connector');
          if (entry?.status === 'supported') changed.push(['format_text', { type: 'format_text', locator_id: loc, formatting: { font_family: fontName(fontA) } }]);
          else unsupported.push({ what: `خط «${el.name ?? el.id}» إلى ${fontName(fontA)}`, why: 'format_text في الموصل لا يقبل عائلة الخط.', pageId: page.id, elementId: el.id, font: fontName(fontA), alternatives: registry?.alternatives('text.font-family') ?? [] });
        }
      }
      const f = el.frame;
      const g = prev.frame;
      // Texts sit in Canva exactly as the build placed them: single-line
      // labels keep their 25% slack, anchored on their alignment edge.
      const box = el.kind === 'text' ? canvaTextBox(el, k) : { left: px(f.x * k), top: px(f.y * k), width: px(f.width * k) };
      const moved = Math.abs(f.x - g.x) > 0.5 || Math.abs(f.y - g.y) > 0.5;
      const resized = Math.abs(f.width - g.width) > 0.5 || (el.kind !== 'text' && Math.abs(f.height - g.height) > 0.5);
      if (resized) {
        if (el.kind === 'text') changed.push(['resize_element', { type: 'resize_element', locator_id: loc, width: box.width }]);
        else changed.push(['resize_element', { type: 'resize_element', locator_id: loc, width: px(f.width * k), height: px(f.height * k), preserve_aspect_ratio: false }]);
        // A resized picture keeps its old image box (it gets cropped, seen
        // live): reset the box to the new frame.
        if (el.kind === 'image') changed.push(['crop_media', { type: 'crop_media', locator_id: loc, top: 0, left: 0, width: px(f.width * k), height: px(f.height * k) }]);
      }
      if (moved || (resized && el.kind === 'text' && el.style.nowrap)) changed.push(['position_element', { type: 'position_element', locator_id: loc, top: box.top, left: box.left }]);
      if ((el.opacity ?? 1) !== (prev.opacity ?? 1)) changed.push(['update_opacity', { type: 'update_opacity', locator_id: loc, opacity: el.opacity ?? 1 }]);
      if ((el.rotation ?? 0) !== (prev.rotation ?? 0)) changed.push(['rotate_element', { type: 'rotate_element', locator_id: loc, rotation: el.rotation ?? 0 }]);
      if (el.kind === 'shape') {
        const fillA = el.fill === 'none' ? null : resolveColor(el.fill, ca);
        const fillB = prev.fill === 'none' ? null : resolveColor(prev.fill, cb);
        if (fillA && fillA !== fillB) changed.push(['recolor_element', { type: 'recolor_element', locator_id: loc, color: fillA.toUpperCase() }]);
        const sA = el.stroke ? resolveColor(el.stroke, ca) : null;
        const sB = prev.stroke ? resolveColor(prev.stroke, cb) : null;
        if (sA !== sB || (el.strokeWidth ?? 0) !== (prev.strokeWidth ?? 0)) changed.push(['update_stroke_properties', { type: 'update_stroke_properties', locator_id: loc, ...(sA && { color: sA.toUpperCase() }), weight: Math.min(100, px((el.strokeWidth ?? 0) * k)) }]);
      }
      if (el.kind === 'image' && el.assetId !== prev.assetId) changed.push(['update_fill', { type: 'update_fill', locator_id: loc, asset_type: 'image', asset_id: `$media:${el.assetId}`, alt_text: el.alt ?? '' }]);
      if (el.z !== prev.z) {
        const others = page.elements.filter((e) => e.id !== el.id && !e.hidden);
        const top = others.every((e) => e.z < el.z);
        const bottom = others.every((e) => e.z > el.z);
        if (top || bottom) changed.push(['layer_element', { type: 'layer_element', locator_id: loc, position: top ? 'front' : 'back' }]);
        else notes.push(`ترتيب «${el.name ?? el.id}» بين الطبقات لا يُنقل بدقة: الموصل يدعم الأمام أو الخلف فقط.`);
      }
      for (const [, op] of changed) add(pageIndex, op);
    }
  }
  const calls = [];
  for (const [pageIndex, ops] of [...perPage.entries()].sort((a, b) => a[0] - b[0])) {
    for (let s = 0; s < ops.length; s += 20) calls.push({ tool: 'edit-design', args: { transaction_id: transactionId, page_index: pageIndex, finalize: 'keep_open', operations: ops.slice(s, s + 20) } });
  }
  const opCount = calls.reduce((n, c) => n + c.args.operations.length, 0);
  return {
    calls,
    operations: opCount,
    affectedPages: [...perPage.keys()].sort((a, b) => a - b),
    unsupported,
    unmapped,
    notes,
    generation: { expected: 0, note: 'تعديلات الخط والحجم والموقع واللون لا تولّد شيئًا.' },
    uploadsNeeded: [...new Set(calls.flatMap((c) => c.args.operations.filter((o) => typeof o.asset_id === 'string' && o.asset_id.startsWith('$media:')).map((o) => o.asset_id.slice(7))))],
  };
}

// Where a text of ours sits in Canva (same rule as the build plan):
// a fixed width, with 25% slack for single-line labels, growing away from
// the alignment edge (RTL "start" is the right edge).
export function canvaTextBox(el, k = 1) {
  const f = { top: el.frame.y * k, left: el.frame.x * k, width: el.frame.width * k };
  const width = el.style?.nowrap ? f.width * 1.25 : f.width;
  const grow = width - f.width;
  const left = el.style?.align === 'center' ? f.left - grow / 2 : el.style?.align === 'end' ? f.left : f.left - grow;
  return { top: px(f.top), left: px(left), width: px(width) };
}

// Element-by-element mapping of our document to a read-back: texts by their
// exact text, other elements by type and frame (after the page scale).
export function mapReadback(doc, readback) {
  const map = {};
  const unmatched = [];
  readback.pages.forEach((rp) => {
    const page = doc.pages[rp.index];
    if (!page) return;
    const k = rp.width ? rp.width / page.widthPx : 1;
    const pool = rp.elements.map((e) => ({ ...e, used: false }));
    const iou = (a, b) => {
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const inter = w > 0 && h > 0 ? w * h : 0;
      return inter / (a.width * a.height + b.width * b.height - inter || 1);
    };
    for (const el of page.elements.filter((e) => !e.hidden)) {
      let best = null;
      if (el.kind === 'text') {
        const want = plainText(el.text).replace(/\s+/g, ' ').trim();
        best = pool.find((x) => !x.used && typeof x.text === 'string' && x.text.replace(/\s+/g, ' ').trim() === want);
      } else {
        const f = { x: el.frame.x * k, y: el.frame.y * k, width: el.frame.width * k, height: el.frame.height * k };
        const scored = pool.filter((x) => !x.used && x.frame && x.text === undefined).map((x) => ({ x, s: iou(f, x.frame) })).sort((a, b) => b.s - a.s);
        if (scored[0]?.s > 0.85) best = scored[0].x;
      }
      if (best) {
        best.used = true;
        map[`${page.id}/${el.id}`] = best.locator;
      } else unmatched.push({ pageId: page.id, elementId: el.id, kind: el.kind });
    }
    // The full-page background shape our build adds first.
    const bg = pool.find((x) => !x.used && x.frame && Math.abs(x.frame.x) < 2 && Math.abs(x.frame.y) < 2 && Math.abs(x.frame.width - rp.width) < 2 && Math.abs(x.frame.height - rp.height) < 2);
    if (bg) map[`${page.id}/page-bg`] = bg.locator;
  });
  return { map, unmatched };
}
