import { DIFF_LABEL, canonicalText, compareText } from '../arabic.js';
import { validateCapabilities } from '../contracts.js';
import { ellipsePath, rectPath } from '../paths.js';
import { checkDesign } from '../quality.js';
import { pageTheme, resolveColor } from '../theme.js';
import { hashOf } from '../util.js';

// Canva destination adapter, built on the tools the Canva connector
// actually exposes (checked against its schemas):
//   create-design       generates a design from a brief (there is no blank
//                       create): the plan clears its elements first. In the
//                       real test it came out 1080×1440 with generated
//                       artwork, hence the exact resize and the clear step
//   resize-design       exact pixel size (custom width × height)
//   read-design         page sizes, element content, thumbnails; opens the
//                       editing transaction
//   edit-design         add_text, format_text (size, colour, bold/normal,
//                       line height, alignment, but no font family),
//                       insert_shape (SVG path M/L/H/V/C/S/A/Z), insert_fill
//                       (uploaded image at a position and size),
//                       position/resize/layer/delete, add_page (w × h),
//                       replace_text; "commit" saves, after the user approves
//   create-upload-url   one-shot URL to POST a file's raw bytes
//   export-design       png / pdf / jpg …
//
// The CLI cannot call these tools: the adapter returns a step-by-step plan
// the assistant executes, then verifies the read-back against the document
// (sizes, page count, every text letter by letter). Geometry stays in page
// pixels; `pageSize` converts when Canva reports a different size.

export const CANVA_EDIT_OPS = [
  'add_text',
  'format_text',
  'replace_text',
  'insert_shape',
  'insert_fill',
  'update_fill',
  'position_element',
  'resize_element',
  'layer_element',
  'delete_element',
  'add_page',
  'update_opacity',
  'rotate_element',
  'recolor_element',
];
// format_text's formatting keys in the connector schema (no font family).
export const CANVA_FORMAT_FIELDS = ['color', 'decoration', 'font_size', 'font_style', 'font_weight', 'line_height', 'link', 'list_level', 'list_marker', 'strikethrough', 'text_align'];

// Capability set from the connector's tool names (any prefix, e.g.
// "mcp__Canva__edit-design") and, optionally, its edit operation types and
// format_text fields as read from the schema.
export function canvaCapabilities({ tools = [], editOps = CANVA_EDIT_OPS, formatFields = CANVA_FORMAT_FIELDS } = {}) {
  const has = (name) => tools.some((t) => t === name || t.endsWith(`__${name}`) || t.endsWith(`.${name}`));
  const edit = has('edit-design') && has('read-design');
  const caps = {
    createDesign: has('create-design') || has('generate-design'),
    insertText: edit && editOps.includes('add_text'),
    updateText: edit && editOps.includes('replace_text'),
    setFontFamily: edit && formatFields.some((f) => /font_?family/.test(f)),
    insertAsset: edit && has('create-upload-url') && editOps.includes('insert_fill'),
    positionElements: edit && (editOps.includes('position_element') || editOps.includes('add_text')),
    preview: has('read-design'),
    exportFormats: has('export-design') ? ['png', 'pdf'] : [],
  };
  caps.insertShape = edit && editOps.includes('insert_shape');
  caps.exactSize = has('resize-design') || (edit && editOps.includes('add_page'));
  return caps;
}

// What a capability set can honestly deliver for this document.
export function editabilityFor(doc, caps, requested = 'native') {
  const hasImages = doc.pages.some((p) => p.elements.some((e) => !e.hidden && e.kind === 'image'));
  const hasShapes = doc.pages.some((p) => p.elements.some((e) => !e.hidden && e.kind === 'shape'));
  const limitations = [];
  if (!caps.createDesign) return { editability: null, mode: null, limitations: ['الموصل لا يستطيع إنشاء تصميم.'] };
  if (!caps.insertText || !caps.positionElements) {
    if (!caps.insertAsset) return { editability: null, mode: null, limitations: ['الموصل لا يضيف نصوصًا ولا صورًا: لا يمكن بناء التصميم في Canva.'] };
    limitations.push('الموصل لا يضيف نصوصًا مستقلة: كل صفحة صورة واحدة غير قابلة لتحرير النص.');
    return { editability: 'flattened', mode: 'image', limitations };
  }
  let mode = requested;
  if (mode === 'native' && ((hasImages && !caps.insertAsset) || (hasShapes && !caps.insertShape))) {
    if (!caps.insertAsset) {
      return { editability: null, mode: null, limitations: ['التصميم فيه رسوم والموصل لا يرفع صورًا: لا يمكن نقله كاملًا.'] };
    }
    mode = 'partial';
    limitations.push('الأشكال تُرفع ضمن صورة الخلفية لأن الموصل لا يرسم أشكالًا.');
  }
  if (mode === 'partial' && !caps.insertAsset) mode = 'native';
  if (!caps.setFontFamily) limitations.push('الموصل لا يختار الخط: النصوص بخط Canva الافتراضي. غيّرها يدويًا إلى خط التصميم.');
  if (doc.pages.some((p) => p.elements.some((e) => e.kind === 'text' && /\*[^*]+\*/.test(e.text)))) {
    limitations.push('تلوين كلمة داخل نص غير مدعوم في الموصل: كل نص بلون واحد، والكلمات المميزة تفقد لونها.');
  }
  return { editability: mode === 'native' ? 'native' : mode === 'partial' ? 'partial' : 'flattened', mode, limitations };
}

const px = (n) => Math.round(n * 10) / 10;
const stripMarkers = (t) => t.replace(/\*/g, '');

// Tool-call plan. "$name" values are filled by the assistant from earlier
// results (design id, transaction id, page ids, uploaded media ids, new
// element locators). `assetFiles` maps asset id → local file to upload
// (recoloured renditions are written by the CLI).
export function planCreate(doc, caps, { mode = 'native', title, pageSize, assetFiles = {}, artFiles = {} } = {}) {
  const decision = editabilityFor(doc, caps, mode);
  if (!decision.mode) return { ok: false, ...decision, steps: [] };
  const first = doc.pages[0];
  const target = pageSize ?? { width: first.widthPx, height: first.heightPx };
  const k = target.width / first.widthPx;
  const steps = [];
  const step = (s) => steps.push({ n: steps.length + 1, ...s });

  step({
    tool: 'create-design',
    args: { brief: `${title ?? 'تصميم'} — صفحة فارغة بخلفية ${doc.theme.colors.bg} للنشر على انستقرام`, format: 'Instagram Post (Portrait)' },
    save: 'designId',
    note: 'ينشئ Canva تصميمًا مولّدًا؛ ستُحذف عناصره في الخطوة التالية. استطلع get-create-design-async-job حتى يكتمل إن لم تظهر الواجهة.',
  });
  step({ tool: 'resize-design', args: { design_id: '$designId', design_type: { type: 'custom', width: first.widthPx, height: first.heightPx } }, save: 'designId', note: 'مقاس مطابق بالبكسل؛ يُنشئ نسخة بالمقاس المطلوب.' });
  step({ tool: 'read-design', args: { design_id: '$designId', open_transaction: true, filter: { fields: ['page_metadata', 'design_content', 'thumbnails'] } }, save: 'transactionId', note: 'سجّل مقاس كل صفحة ومعرّف الصفحة الأولى ومعرّفات عناصرها.' });
  step({ action: 'clear-page', page_index: 1, note: 'احذف كل عنصر في الصفحة ١ بعملية delete_element لكل locator ظهر في read-design.' });

  const uploads = new Map();
  const upload = (key, file) => {
    if (uploads.has(key)) return uploads.get(key);
    const ref = `$media:${key}`;
    step({ tool: 'create-upload-url', args: {}, then: { action: 'POST raw bytes', file, header: 'Content-Type: application/octet-stream' }, save: `media:${key}`, note: 'ارفع الملف كما هو (بايتات خام) ثم احفظ معرّف الوسائط من الرد.' });
    uploads.set(key, ref);
    return ref;
  };

  doc.pages.forEach((page, i) => {
    const pageRef = i === 0 ? '$page:1' : `$page:${i + 1}`;
    const { colors } = pageTheme(doc, page);
    const ops = [];
    if (i > 0) {
      step({ tool: 'edit-design', args: { transaction_id: '$transactionId', page_index: i, finalize: 'keep_open', operations: [{ type: 'add_page', width: page.widthPx, height: page.heightPx, background_color: colors.bg }] }, save: `page:${i + 1}`, note: 'سجّل معرّف الصفحة الجديدة.' });
    } else {
      ops.push({ type: 'insert_shape', page_id: pageRef, top: 0, left: 0, width: px(page.widthPx * k), height: px(page.heightPx * k), path: rectPath(page.widthPx, page.heightPx), view_box_width: page.widthPx, view_box_height: page.heightPx, color: colors.bg, _element: 'page-bg' });
    }
    const visible = [...page.elements].filter((e) => !e.hidden).sort((a, b) => a.z - b.z);
    if (decision.mode === 'partial' || decision.mode === 'image') {
      const file = artFiles[page.id];
      const ref = upload(`page-${i + 1}`, file);
      ops.push({ type: 'insert_fill', page_id: pageRef, asset_type: 'image', asset_id: ref, alt_text: '', top: 0, left: 0, width: px(page.widthPx * k), height: px(page.heightPx * k), _element: 'page-art' });
    }
    for (const el of visible) {
      const f = { top: px(el.frame.y * k), left: px(el.frame.x * k), width: px(el.frame.width * k), height: px(el.frame.height * k) };
      if (el.kind === 'text') {
        if (decision.mode === 'image') continue;
        // Every text gets a fixed width (Canva's BLOCK mode). Without one,
        // Canva sizes the box to its own font and re-anchors it when the
        // size changes, which moved labels out of their pills in the real
        // test. Single-line labels get 25% slack, growing away from their
        // alignment edge (RTL "start" is the right edge), so Canva's wider
        // default font does not wrap them.
        const width = el.style.nowrap ? f.width * 1.25 : f.width;
        const grow = width - f.width;
        const anchoredLeft = el.style.align === 'center' ? f.left - grow / 2 : el.style.align === 'end' ? f.left : f.left - grow;
        ops.push({
          type: 'add_text',
          page_id: pageRef,
          text: stripMarkers(el.text),
          top: f.top,
          left: px(anchoredLeft),
          width: px(width),
          ...(el.rotation && { rotation: el.rotation }),
          ...(el.opacity !== undefined && el.opacity < 1 && { opacity: el.opacity }),
          _element: el.id,
          _then: {
            type: 'format_text',
            locator_id: `$el:${page.id}/${el.id}`,
            formatting: {
              color: resolveColor(el.style.color, colors),
              font_size: Math.max(1, Math.round(el.style.fontSize * k)),
              font_weight: el.style.weight >= 600 ? 'bold' : 'normal',
              line_height: Math.min(2.5, Math.max(0.5, el.style.lineHeight)),
              text_align: el.style.align,
            },
          },
        });
      } else if (decision.mode === 'native' && el.kind === 'shape') {
        const shape = shapeOp(el, colors, k);
        if (shape) ops.push({ ...shape, page_id: pageRef, _element: el.id });
      } else if (decision.mode === 'native' && el.kind === 'image') {
        const file = assetFiles[el.assetId];
        const ref = upload(el.assetId, file);
        ops.push({ type: 'insert_fill', page_id: pageRef, asset_type: 'image', asset_id: ref, alt_text: el.alt ?? '', ...f, ...(el.rotation && { rotation: el.rotation }), ...(el.opacity !== undefined && el.opacity < 1 && { opacity: el.opacity }), _element: el.id });
      }
    }
    // Batches of up to 20 operations per edit-design call.
    for (let s = 0; s < ops.length; s += 20) {
      step({
        tool: 'edit-design',
        args: { transaction_id: '$transactionId', page_index: i + 1, finalize: 'keep_open', operations: ops.slice(s, s + 20) },
        note: 'كل add_text يتبعه format_text بالقيم في _then على العنصر الجديد؛ احفظ locator كل نص جديد باسم _element ($el:…). العناصر تُضاف بالترتيب من الخلف إلى الأمام.',
      });
    }
  });

  step({ tool: 'read-design', args: { design_id: '$designId', transaction_id: '$transactionId', filter: { fields: ['page_metadata', 'design_content', 'thumbnails'] } }, save: 'readback', note: 'اكتب readback.json ثم شغّل: studio canva verify design.json readback.json' });
  step({ tool: 'edit-design', args: { transaction_id: '$transactionId', finalize: 'commit' }, requiresApproval: true, note: 'اعرض المعاينة على المستخدم، ولا تحفظ إلا بموافقته الصريحة.' });

  return { ok: true, editability: decision.editability, mode: decision.mode, limitations: decision.limitations, scale: k, steps, fingerprint: hashOf(doc.pages.map((p) => p.elements)) };
}

function shapeOp(el, colors, k) {
  const fill = el.fill === 'none' ? null : resolveColor(el.fill, colors);
  const stroke = el.stroke ? resolveColor(el.stroke, colors) : null;
  const base = {
    type: 'insert_shape',
    top: px(el.frame.y * k),
    left: px(el.frame.x * k),
    width: px(el.frame.width * k),
    height: px(el.frame.height * k),
    ...(fill && { color: fill }),
    ...(stroke && { stroke_color: stroke }),
    ...(el.opacity !== undefined && el.opacity < 1 && { opacity: el.opacity }),
    ...(el.rotation && { rotation: el.rotation }),
  };
  if (el.shape === 'path') {
    const [vw, vh] = el.viewBox;
    return { ...base, path: el.path, view_box_width: vw, view_box_height: vh, ...(stroke && { stroke_weight: px((el.strokeWidth ?? 1) * (el.frame.width / vw) * k) }) };
  }
  const { width: w, height: h } = el.frame;
  const path = el.shape === 'ellipse' ? ellipsePath(w, h) : rectPath(w, h, el.radius ?? 0);
  return { ...base, path, view_box_width: px(w), view_box_height: px(h), ...(stroke && { stroke_weight: px((el.strokeWidth ?? 1) * k) }) };
}

// Read-back → quality issues and the honest delivery result.
// readback: { designId, designUrl, committed, pageCount, pages: [{ index,
// width, height, texts: [{ elementId?, text }] }] }. Texts read from Canva
// carry Canva's own ids, so unmapped texts are matched to ours by content
// and every difference is reported letter by letter.
export function verifyCanva(doc, readback, plan) {
  const mapped = { ...readback, pages: (readback.pages ?? []).map((p) => ({ ...p, source: 'canva', texts: (p.texts ?? []).filter((t) => t.elementId) })) };
  const issues = checkDesign(doc, { readback: mapped }).issues.filter((i) => i.code.startsWith('readback.'));
  if (plan?.mode !== 'image') {
    for (const p of readback.pages ?? []) {
      const page = doc.pages[p.index];
      const loose = (p.texts ?? []).filter((t) => !t.elementId);
      if (!page || !loose.length) continue;
      const pool = loose.map((t) => ({ text: t.text, canon: canonicalText(t.text), used: false }));
      for (const el of page.elements.filter((e) => e.kind === 'text' && !e.hidden)) {
        const sent = canonicalText(el.text);
        const exact = pool.find((x) => !x.used && x.canon === sent);
        if (exact) {
          exact.used = true;
          continue;
        }
        const sentWords = new Set(sent.split(' '));
        const scored = pool
          .filter((x) => !x.used)
          .map((x) => ({ x, overlap: x.canon.split(' ').filter((w) => sentWords.has(w)).length / Math.max(1, sentWords.size) }))
          .sort((a, b) => b.overlap - a.overlap);
        const best = scored[0];
        if (!best || best.overlap < 0.3) {
          issues.push({ code: 'readback.text-not-found', severity: 'error', pageId: page.id, elementId: el.id, message: `«${sent.slice(0, 40)}» غير موجود في Canva.` });
          continue;
        }
        best.x.used = true;
        for (const d of compareText(el.text, best.x.text)) {
          issues.push({
            code: `readback.changed.${d.kind}`,
            severity: 'error',
            pageId: page.id,
            elementId: el.id,
            message: `الصفحة ${p.index + 1}: ${d.expected && d.observed ? `«${d.expected}» صارت «${d.observed}»` : d.expected ? `«${d.expected}» ناقصة` : `«${d.observed}» زائدة`} (${DIFF_LABEL[d.kind] ?? d.kind}).`,
          });
        }
      }
    }
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  const delivery = {
    saved: Boolean(readback.committed),
    editability: plan?.editability ?? 'native',
    ...(readback.designUrl && { designUrl: readback.designUrl }),
    files: readback.designUrl ? [{ format: 'canva', storageRef: readback.designUrl }] : [],
    limitations: [...(plan?.limitations ?? []), ...(readback.committed ? [] : ['لم يُحفظ بعد: يحتاج موافقتك على المعاينة.'])],
  };
  return { passed: errors === 0, issues, delivery };
}

export class CanvaAdapter {
  constructor({ tools, editOps, formatFields } = {}) {
    this.caps = canvaCapabilities({ tools, editOps, formatFields });
    const problems = validateCapabilities(this.caps);
    if (problems.length) throw new Error(problems.map((p) => p.message).join('; '));
  }

  async capabilities() {
    return this.caps;
  }

  // Returns the plan; the assistant runs it with the Canva tools.
  async create(doc, options) {
    const plan = planCreate(doc, this.caps, options);
    return {
      saved: false,
      editability: plan.editability ?? 'flattened',
      files: [],
      limitations: plan.ok ? [...plan.limitations, 'خطة جاهزة للتنفيذ عبر أدوات Canva؛ لم يُنشأ شيء بعد.'] : plan.limitations,
      plan,
    };
  }

  // Text and position changes on an existing Canva design: maps patches to
  // edit-design operations by element locator.
  async patch(target, changes, { locators = {}, doc } = {}) {
    const ops = [];
    for (const c of changes) {
      const locator = locators[`${c.pageId}/${c.elementId}`];
      if (!locator) continue;
      if (c.action === 'replace_text') ops.push({ type: 'replace_text', locator_id: locator, text: stripMarkers(c.payload.text) });
      else if (c.action === 'move') {
        const el = doc?.pages.find((p) => p.id === c.pageId)?.elements.find((e) => e.id === c.elementId);
        if (el) ops.push({ type: 'position_element', locator_id: locator, top: el.frame.y, left: el.frame.x });
      } else if (c.action === 'delete') ops.push({ type: 'delete_element', locator_id: locator });
      else if (c.action === 'layer' && ['front', 'back'].includes(c.payload.to)) ops.push({ type: 'layer_element', locator_id: locator, position: c.payload.to });
    }
    return { saved: false, editability: 'native', files: [], limitations: ops.length < changes.length ? ['بعض التعديلات لا تقابلها عملية في الموصل.'] : [], plan: { steps: [{ tool: 'edit-design', args: { transaction_id: '$transactionId', finalize: 'keep_open', operations: ops } }], target } };
  }

  async preview(target) {
    return `read-design ${target} (thumbnails)`;
  }
}
