import { hashOf, now } from '../util.js';
import { detectDialect, dialectFromFacts, dialectSummary, normalizeToolName } from './dialect.js';

// CanvaCapabilityRegistry: what can be done in Canva, by which route, how
// sure we are, and at what cost to editability. Built from three sources:
//
//   schema   the Canva connector's tool schemas as this session sees them
//            (tool names, edit-design operation types, format_text fields,
//            export types…). Recomputed every session: the skill never
//            hard-codes one session's tool list.
//   evidence dated results with their source: a live test in a real Canva
//            account, Canva's Help Center, the Connect API docs, a route
//            probe. Live evidence is tied to a fingerprint of the tool it
//            tested; when that tool's schema changes the evidence goes
//            stale and the capability must be re-verified.
//   default  everything else is "unverified", never assumed.
//
// Routes:
//   connector    the Canva connector's tools, run by the assistant
//   native-file  a .pptx built by the studio and imported into Canva (new
//                design); the import itself is done by the creator in
//                Canva or through the Connect API
//   connect-api  Canva's REST API with the creator's own OAuth token
//   manual       a step the creator does in the Canva editor (the
//                assistant gives exact steps; it never drives a browser
//                session it has not been given)

export const STATUSES = ['supported', 'partial', 'unsupported', 'unverified'];
export const ROUTES = {
  connector: { label: 'أدوات موصل Canva', executor: 'assistant' },
  'native-file': { label: 'ملف PowerPoint أصلي يُستورد في Canva', executor: 'user' },
  'connect-api': { label: 'Canva Connect API بتفويض المستخدم', executor: 'assistant' },
  manual: { label: 'خطوة يدوية في محرر Canva', executor: 'user' },
};

export const CAPABILITIES = {
  'design.create': 'إنشاء تصميم',
  'design.copy': 'نسخ تصميم',
  'design.size': 'مقاس مطابق بالبكسل',
  'brand.kit': 'قراءة هوية العلامة (Brand Kit)',
  'page.add': 'إضافة صفحة',
  'page.reorder': 'ترتيب الصفحات',
  'page.delete': 'حذف صفحة',
  'page.duplicate': 'نسخ صفحات',
  'text.add': 'إضافة مربع نص',
  'text.edit': 'تعديل نص',
  'text.read': 'قراءة النص من التصميم',
  'text.format': 'تنسيق النص (الحجم، اللون، الوزن، المحاذاة، المسافة بين الأسطر)',
  'text.font-family': 'اختيار عائلة الخط',
  'text.rich-color': 'تلوين كلمة داخل النص',
  'text.rtl': 'نص عربي من اليمين لليسار',
  'media.upload': 'رفع وسائط إلى Canva (صور، فيديو)',
  'image.insert': 'إدراج صورة',
  'image.replace': 'استبدال صورة أو قصّها',
  'video.insert': 'إدراج فيديو',
  'shape.insert': 'إدراج شكل متجه',
  'shape.edit': 'تعديل شكل (لون، حد، مسار)',
  'layer.order': 'ترتيب الطبقات',
  group: 'تجميع العناصر',
  'motion.animate': 'حركة العناصر',
  'motion.transition': 'انتقالات الصفحات',
  'timing.duration': 'مدة كل مشهد',
  'audio.add': 'إضافة صوت',
  preview: 'معاينة الصفحات',
  save: 'حفظ التعديلات (commit)',
  'speaker-notes': 'ملاحظات الصفحة (خطة المشهد)',
  'export.png': 'تصدير PNG',
  'export.jpg': 'تصدير JPG',
  'export.pdf': 'تصدير PDF',
  'export.mp4': 'تصدير فيديو MP4',
  'export.gif': 'تصدير GIF',
  'export.pptx': 'تصدير PowerPoint',
  'import.native-file': 'استيراد ملف تصميم أصلي (PPTX)',
};

// Tool schemas (full, as the session lists them, or names only, or compact
// facts) → normalised facts and the connector dialect. Tool names may carry
// MCP/app prefixes and "_" separators. Unknown stays null, never false.
export function schemaFacts(input = {}) {
  if (input.kind === 'canva-schema-facts') {
    if (input.dialect?.kind === 'canva-dialect') return input;
    const withDialect = { ...input, dialect: dialectFromFacts(input) };
    return { ...withDialect, fingerprints: toolFingerprints(withDialect) };
  }
  const list = Array.isArray(input) ? input : input.tools ?? [];
  const full = list.some((t) => t && typeof t === 'object' && (t.inputSchema || t.input_schema || t.parameters));
  const byName = {};
  for (const t of list) {
    const name = normalizeToolName(typeof t === 'string' ? t : t?.name);
    if (name) byName[name] = typeof t === 'string' ? {} : t;
  }
  let dialect = detectDialect(list);
  const schemaOf = (raw) => {
    const t = byName[normalizeToolName(raw)];
    return t?.inputSchema ?? t?.parameters ?? t?.input_schema ?? null;
  };
  const opsKnown = dialect.edit?.ops && !Object.values(dialect.edit.ops).some((o) => o.passthrough);
  const facts = {
    kind: 'canva-schema-facts',
    tools: Object.keys(byName).sort(),
    editOps: opsKnown ? Object.keys(dialect.edit.ops).sort() : input.editOps ?? null,
    formatFields: opsKnown ? (dialect.edit.ops.format_text?.nested?.formatting ?? []).slice().sort() : input.formatFields ?? null,
    insertFillTypes: (opsKnown && dialect.edit.ops.insert_fill?.enums?.asset_type) || input.insertFillTypes || null,
    exportTypes: (dialect.export && schemaOf(dialect.export.tool)?.properties?.format?.properties?.type?.enum) || input.exportTypes || null,
    resizeCustom: dialect.resize ? dialect.resize.custom ?? input.resizeCustom ?? null : input.resizeCustom ?? null,
    mergeOps: (dialect.merge && (schemaOf(dialect.merge.tool)?.properties?.operations?.items?.anyOf ?? []).map((v) => v?.properties?.type?.const).filter(Boolean).sort()) || null,
    importExcludesGenerated: dialect.import?.url ? (dialect.import.source === 'schema' ? dialect.import.url.excludesGenerated : input.importExcludesGenerated ?? null) : input.importExcludesGenerated ?? null,
    uploadKinds: dialect.upload?.description ? ['image', 'video', 'audio', 'pdf'].filter((k) => new RegExp(k, 'i').test(dialect.upload.description)) : input.uploadKinds ?? null,
  };
  if (!facts.mergeOps?.length) facts.mergeOps = input.mergeOps ?? null;
  if (!full) dialect = dialectFromFacts({ ...facts, importExcludesGenerated: facts.importExcludesGenerated });
  facts.dialect = dialect;
  facts.fingerprints = toolFingerprints(facts);
  return facts;
}

// Per-role fingerprints of what the registry depends on. Keys keep the
// names of Claude's tools (live evidence is stored against them); another
// connector's dialect is part of the hash, so evidence never crosses over.
export function toolFingerprints(f) {
  const fp = (v) => (v === null || v === undefined ? null : hashOf(v).slice(0, 12));
  const d = f.dialect ?? dialectFromFacts(f);
  const other = d.id !== 'edit-design' ? { dialect: d.id, fingerprint: d.fingerprint } : {};
  return {
    'edit-design': d.edit ? fp({ ops: f.editOps, format: f.formatFields, fill: f.insertFillTypes, ...other }) : null,
    'export-design': d.export ? fp(f.exportTypes) : null,
    'create-upload-url': d.upload ? fp(f.uploadKinds) : null,
    'create-design': d.create ? 'present' : null,
    'resize-design': d.resize ? fp(f.resizeCustom) : null,
    'merge-designs': d.merge ? fp(f.mergeOps) : null,
    'import-design': d.import ? fp({ url: d.import.url && { excl: d.import.url.excludesGenerated ?? null }, file: d.import.file?.kind ?? null, ...other }) : null,
  };
}

// ---------------------------------------------------------------------------
// Connector route, from the facts and the dialect (which real tool plays
// each role in this session).

function connectorEntry(cap, f) {
  const d = f.dialect ?? dialectFromFacts(f);
  const roles = {
    edit: d.edit?.tool,
    read: d.read?.content?.tool,
    upload: d.upload?.tool,
    copy: d.copy?.tool,
    resize: d.resize?.tool,
    create: d.create?.tool,
    merge: d.merge?.tool,
    export: d.export?.tool,
    thumbnails: d.read?.thumbnails?.tool,
  };
  const has = (r) => Boolean(roles[r]);
  const op = (name) => (f.editOps ? f.editOps.includes(name) : null);
  const viaOf = (rs, ops) => `${rs.map((r) => roles[r]).join(' + ')}${ops.length ? `: ${ops.join(', ')}` : ''}`;
  const need = (rs, ops = [], extra = {}) => {
    const missing = rs.filter((r) => !has(r));
    if (missing.length) return { status: 'unsupported', missingTool: true, note: `لا أداة لدور ${missing.join('، ')} في هذه الجلسة.` };
    const known = ops.map(op);
    if (known.includes(null)) return { status: 'unverified', note: 'الأداة موجودة لكن مخطط عملياتها لم يُقرأ في هذه الجلسة.', via: viaOf(rs, ops) };
    if (!known.every(Boolean)) return { status: 'unsupported', note: `العملية ${ops.filter((o) => !op(o)).join('، ')} ليست في مخطط ${roles.edit}.` };
    return { status: 'supported', via: viaOf(rs, ops), ...extra };
  };
  const editable = { target: 'in-place', approval: 'preview-before-commit', editability: 'native' };
  switch (cap) {
    case 'design.create':
      if (has('copy') && has('resize')) {
        return { status: 'partial', via: `${roles.copy} (قاعدة فارغة) + ${roles.resize}${has('create') ? `، أو ${roles.create} أول مرة` : ''}`, target: 'new-design', approval: 'none', editability: 'native', limits: ['لا يوجد إنشاء تصميم فارغ: create-design يولّد محتوى (عملية توليد) يجب مسحه، ونسخ قاعدة فارغة لا يحتاج توليدًا.', 'خلفية الصفحة المولّدة لا تُحذف بالأدوات: تُغطّى بشكل بلون الخلفية.'] };
      }
      return has('create') ? { status: 'partial', via: roles.create, target: 'new-design', approval: 'none', editability: 'native', limits: ['يولّد تصميمًا من وصف؛ لا إنشاء فارغ.'] } : { status: 'unsupported', missingTool: true };
    case 'design.copy':
      return has('copy') ? { status: 'supported', via: roles.copy, target: 'new-design', approval: 'none', editability: 'native', limits: ['ينشئ تصميمًا جديدًا ويترك الأصل كما هو.'] } : { status: 'unsupported', missingTool: true };
    case 'design.size':
      if (!has('resize')) return { status: 'unsupported', missingTool: true };
      if (f.resizeCustom === null) return { status: 'unverified', via: roles.resize };
      return f.resizeCustom ? { status: 'supported', via: `${roles.resize} (custom width × height)`, target: 'new-design', approval: 'none', editability: 'native', limits: ['ينشئ نسخة جديدة بالمقاس ويترك الأصل كما هو.'] } : { status: 'unsupported' };
    case 'brand.kit': {
      const kit = f.tools.find((t) => /brand-kits?$|list-brand-kits/.test(t));
      return kit ? { status: 'partial', via: kit, target: 'read-only', approval: 'none', editability: null, limits: ['قراءة هويات العلامة فقط؛ تطبيقها على العناصر بعمليات التحرير.'] } : { status: 'unsupported', missingTool: true };
    }
    case 'page.add':
      return { ...need(['edit'], ['add_page']), ...editable, limits: ['الصفحة الجديدة بمقاس وخلفية لونية.'] };
    case 'page.reorder':
      return { ...need(['edit'], ['reorder_page']), ...editable };
    case 'page.delete':
      if (!has('merge')) return { status: 'unsupported', note: 'أداة التحرير لا تحذف صفحات.' };
      if (f.mergeOps && !f.mergeOps.includes('delete_pages')) return { status: 'unsupported' };
      return { status: f.mergeOps ? 'partial' : 'unverified', via: `${roles.merge}: delete_pages`, target: 'in-place', approval: 'explicit-before-call', editability: 'native', limits: ['يحتاج موافقة صريحة على العملية نفسها قبل التنفيذ، والحذف نهائي.'] };
    case 'page.duplicate':
      return has('copy') ? { status: 'partial', via: `${roles.copy} (page_numbers)`, target: 'new-design', approval: 'none', editability: 'native', limits: ['ينسخ الصفحات إلى تصميم جديد؛ الدمج في التصميم نفسه عبر merge-designs بموافقة صريحة.'] } : { status: 'unsupported' };
    case 'text.add':
      return { ...need(['edit', 'read'], ['add_text']), ...editable, limits: ['بلا عرض يأخذ النص مقاسًا طبيعيًا يتغيّر مع خط Canva: نعطي كل نص عرضًا ثابتًا.'] };
    case 'text.edit':
      return { ...need(['edit', 'read'], ['replace_text']), ...editable };
    case 'text.read':
      return has('read') ? { status: 'supported', via: roles.read, target: 'read-only', approval: 'none', editability: null, ...(d.read.style === 'separate' && !d.read.content.transaction && { limits: ['يقرأ النسخة المحفوظة فقط: تعديلات المعاملة المفتوحة تُتحقق من رد أداة التحرير.'] }) } : { status: 'unsupported', missingTool: true };
    case 'text.format': {
      const e = need(['edit'], ['format_text']);
      const fields = f.formatFields;
      return { ...e, ...editable, limits: [fields ? `الحقول: ${fields.join(', ')}` : 'حقول التنسيق غير مقروءة', 'الوزن عادي أو عريض فقط.'] };
    }
    case 'text.font-family': {
      if (!has('edit')) return { status: 'unsupported', missingTool: true };
      if (!f.formatFields) return { status: 'unverified', via: `${roles.edit}: format_text` };
      const field = f.formatFields.find((x) => /font_?family|typeface/.test(x));
      return field ? { status: 'supported', via: `${roles.edit}: format_text.${field}`, ...editable } : { status: 'unsupported', note: 'format_text لا يقبل عائلة الخط.' };
    }
    case 'text.rich-color':
      if (!f.formatFields) return { status: 'unverified' };
      return { status: 'unsupported', note: 'format_text يطبّق اللون على النص كله؛ لا نطاق لكلمة واحدة.' };
    case 'text.rtl':
      return { ...need(['edit'], ['add_text']), ...editable, limits: ['Canva يكتشف اتجاه العربية من النص نفسه.'] };
    case 'media.upload':
      if (has('upload')) return { status: 'supported', via: `${roles.upload} ثم POST للبايتات الخام`, inputType: 'local-bytes', target: 'library', approval: 'none', editability: null, limits: ['للوسائط (صور، فيديو، صوت)؛ ليس استيراد تصميم: لا يحوّل PPTX أو PDF إلى تصميم.'] };
      if (d.uploadFromUrl) return { status: 'partial', via: d.uploadFromUrl.tool, inputType: 'public-url', target: 'library', approval: 'none', editability: null, requires: ['رابط HTTPS عام للوسائط'], limits: ['لا يقبل ملفًا محليًا ولا مولّدًا.'] };
      return { status: 'unsupported', missingTool: true };
    case 'image.insert':
      if (!has('upload') && d.uploadFromUrl) return { ...need(['edit'], ['insert_fill']), ...editable, status: need(['edit'], ['insert_fill']).status === 'supported' ? 'partial' : need(['edit'], ['insert_fill']).status, limits: [`الرفع من رابط عام فقط (${d.uploadFromUrl.tool}).`] };
      return { ...need(['edit', 'upload'], ['insert_fill']), ...editable, limits: ['ارفع البايتات الخام إلى رابط الرفع (مرة واحدة لكل رابط) ثم أدرج mediaId.'] };
    case 'image.replace':
      return { ...need(['edit'], ['update_fill']), ...editable };
    case 'video.insert': {
      const e = need(['edit', 'upload'], ['insert_fill']);
      if (e.status !== 'supported') return e;
      if (!f.insertFillTypes) return { status: 'unverified', via: `${roles.edit}: insert_fill` };
      return f.insertFillTypes.includes('video') ? { ...e, via: `${roles.edit}: insert_fill (asset_type video)`, ...editable } : { status: 'unsupported' };
    }
    case 'shape.insert':
      return { ...need(['edit'], ['insert_shape']), ...editable, limits: ['مسار SVG بأوامر M/L/H/V/C/S/A/Z فقط (لا Q/T).'] };
    case 'shape.edit':
      return { ...need(['edit'], ['recolor_element']), ...editable };
    case 'layer.order':
      return { ...need(['edit'], ['layer_element']), ...editable, ...(op('layer_element') && { status: 'partial' }), limits: ['إلى الأمام أو الخلف فقط؛ الترتيب الدقيق بترتيب الإضافة.'] };
    case 'group':
      return { ...need(['edit'], ['group_elements']), ...editable };
    case 'motion.animate':
    case 'motion.transition':
    case 'timing.duration': {
      if (!has('edit')) return { status: 'unsupported', missingTool: true };
      if (!f.editOps) return { status: 'unverified' };
      const found = f.editOps.find((o) => (cap === 'motion.animate' ? /anim/ : cap === 'motion.transition' ? /transition/ : /duration|timing/).test(o));
      return found ? { status: 'supported', via: `${roles.edit}: ${found}`, ...editable } : { status: 'unsupported', note: `لا عملية لها في مخطط ${roles.edit}.` };
    }
    case 'audio.add':
      if (!f.insertFillTypes) return { status: 'unverified' };
      return f.insertFillTypes.includes('audio') ? { status: 'supported', via: 'insert_fill audio', ...editable } : { status: 'unsupported', note: 'يمكن رفع ملف صوت، لكن insert_fill يقبل صورة أو فيديو فقط.' };
    case 'preview':
      return has('thumbnails') ? { status: 'supported', via: `${roles.thumbnails} (thumbnails)`, target: 'in-place', approval: 'none', editability: null } : { status: 'unsupported', missingTool: true };
    case 'save':
      return d.commit ? { status: 'supported', via: d.commit.inline ? `${d.commit.tool} (${d.commit.field}: ${d.commit.value})` : d.commit.tool, target: 'in-place', approval: 'explicit-before-call', editability: 'native', limits: ['بعد موافقة المستخدم الصريحة على المعاينة فقط؛ لا رجعة فيه.', ...(d.cancel ? [] : ['لا أداة إلغاء: المعاملة غير المحفوظة تنتهي وحدها.'])] } : { status: has('edit') ? 'unverified' : 'unsupported', note: 'لا طريقة معروفة لحفظ المعاملة في هذه الجلسة.' };
    case 'speaker-notes':
      return { ...need(['edit'], ['replace_speaker_notes']), ...editable };
    case 'import.native-file':
      return importEntry(d);
    default:
      if (cap.startsWith('export.')) {
        const type = cap.slice(7);
        if (!has('export')) return { status: 'unsupported', missingTool: true };
        if (!f.exportTypes) return { status: 'unverified', via: roles.export };
        return f.exportTypes.includes(type)
          ? { status: 'supported', via: `${d.exportFormats?.tool ?? 'get-export-formats'} ثم ${roles.export} (${type})`, target: 'file', approval: 'none', editability: 'flattened', limits: ['تحقق أولًا من الصيغ المتاحة لهذا التصميم.', ...(type === 'mp4' ? ['يحتاج quality مثل vertical_1080p؛ الحركة والمدد تأتي من التصميم كما ضُبطت فيه.'] : [])] }
          : { status: 'unsupported' };
      }
      return { status: 'unverified' };
  }
}

// Importing a design file is its own capability, read from the import
// tool's schema: a public URL field and a file field have different rules.
// Uploading media (create-upload-url) never counts as an import.
function importEntry(d) {
  const im = d.import;
  const base = { target: 'new-design', approval: 'none', editability: 'native' };
  if (!im) return { status: 'unsupported', missingTool: true, note: 'لا أداة استيراد تصميم في هذه الجلسة؛ رفع الوسائط ليس استيرادًا.', ...base };
  if (im.file && ['host-file', 'base64', 'binary', 'path'].includes(im.file.kind)) {
    return {
      ...base,
      status: im.acceptsPptx ? 'supported' : 'unverified',
      via: `${im.tool}: ${im.file.field}`,
      inputType: `local-file (${im.file.kind})`,
      limits: ['ينشئ تصميمًا جديدًا؛ الأصل لا يتغيّر.', ...(im.acceptsPptx ? [] : ['المخطط لا يذكر PowerPoint صراحة: نتيجة الاستيراد تُفحص قبل أي ادعاء.']), ...(im.file.kind === 'host-file' ? ['المضيف يمرّر الملف المرفق إلى هذا الحقل.'] : [])],
      ...(im.file.kind === 'host-file' && { requires: ['مضيف يمرّر ملفًا محليًا إلى حقل الملف (file param)'] }),
    };
  }
  if (im.file) return { ...base, status: 'unverified', via: `${im.tool}: ${im.file.field}`, note: 'حقل ملف بنوع لا يوضحه المخطط.' };
  if (im.url) {
    if (im.url.excludesLocal || im.url.excludesGenerated) {
      return { ...base, status: 'unsupported', via: `${im.tool}: url`, inputType: 'public-url', note: 'يقبل رابط HTTPS عامًا فقط، ويستثني الملفات المحلية والخاصة والمولّدة؛ ملف PPTX الذي نبنيه ملف مولّد محلي.', limits: ['لا يُرسل مسار محلي إلى حقل رابط، ولا يُنشر ملف المستخدم علنًا للحصول على رابط.'] };
    }
    return { ...base, status: 'partial', via: `${im.tool}: url`, inputType: 'public-url', requires: ['رابط HTTPS عام للملف، بإذن المستخدم'], limits: ['لا يُنشر ملف المستخدم علنًا دون إذنه.'] };
  }
  return { ...base, status: 'unverified', via: im.tool, note: 'مخطط أداة الاستيراد لم يُقرأ في هذه الجلسة.' };
}

// Native file (.pptx) built by the studio. What survives an import into
// Canva comes from Canva's Help Center unless a live import says otherwise.
const HELP = { source: 'help-center', at: '2026-10-02', note: 'مركز مساعدة Canva: استيراد PowerPoint' };
function nativeFileEntry(cap) {
  const base = { target: 'new-design', approval: 'user-action', editability: 'native', verified: HELP };
  switch (cap) {
    case 'design.create':
    case 'design.size':
    case 'page.add':
    case 'page.reorder':
    case 'text.add':
    case 'text.edit':
    case 'text.format':
    case 'shape.insert':
    case 'image.insert':
    case 'layer.order':
    case 'group':
      return { ...base, status: 'partial', via: 'canva_import_editable → .pptx → يستورده المستخدم في Canva', limits: ['الاستيراد ينشئ تصميمًا جديدًا ولا يعدّل الأصل.', 'لم يُتحقق باستيراد حي بعد: افحص النتيجة بـ read-design.'] };
    case 'text.font-family':
      return { ...base, status: 'partial', via: '.pptx: typeface لكل نص', limits: ['يطابق Canva الخط إن كان لديه (Cairo وTajawal متاحان في Canva) وإلا يستبدله.'] };
    case 'text.rich-color':
      return { ...base, status: 'partial', via: '.pptx: run مستقل للكلمة المميزة', limits: ['لم يُتحقق باستيراد حي.'] };
    case 'text.rtl':
      return { ...base, status: 'partial', via: '.pptx: rtl="1" ولغة ar-SA', limits: ['مركز المساعدة: قد تحتاج المحاذاة أو الاتجاه تصحيحًا بعد الاستيراد.'] };
    case 'motion.animate':
    case 'motion.transition':
    case 'timing.duration':
      return { ...base, status: 'unsupported', note: 'مركز مساعدة Canva: الانتقالات والحركة ومدد الشرائح لا تُستورد.' };
    case 'import.native-file':
      return { ...base, status: 'partial', via: 'المستخدم يرفع الملف في Canva (Upload → استيراد) أو Connect API', limits: ['أداة رفع الموصل ترفض PPTX، فالاستيراد يدوي أو عبر Connect API.'] };
    default:
      return { status: 'unsupported', target: 'new-design', verified: { source: 'none' } };
  }
}

// Connect API (needs the creator's own integration and OAuth token). Routes
// confirmed to exist by an unauthenticated probe (401/400, not 404).
const PROBE = { source: 'probe', at: '2026-10-02', note: 'المسار موجود (رد 401/400 بلا تفويض)؛ لم يُنفَّذ بتفويض' };
function connectApiEntry(cap) {
  const base = { status: 'unverified', approval: 'none', verified: PROBE, requires: ['تكامل Canva Connect خاص بالمستخدم', 'متغير البيئة CANVA_ACCESS_TOKEN'] };
  switch (cap) {
    case 'design.create':
    case 'design.size':
      return { ...base, via: 'POST /v1/designs (custom width/height)', target: 'new-design', editability: 'native', limits: ['تصميم فارغ بلا توليد.'] };
    case 'import.native-file':
    case 'text.font-family':
    case 'text.rich-color':
      return { ...base, via: 'POST /v1/imports (.pptx) ثم GET /v1/imports/{job}', target: 'new-design', editability: 'native' };
    case 'image.insert':
    case 'video.insert':
      return { ...base, via: 'POST /v1/asset-uploads', target: 'in-place', editability: 'native', limits: ['يرفع الأصل للمكتبة؛ وضعه في الصفحة عبر الموصل.'] };
    case 'preview':
      return { ...base, via: 'GET /v1/designs/{id}/pages', target: 'in-place', editability: null };
    default:
      if (cap.startsWith('export.')) return { ...base, via: `POST /v1/exports (${cap.slice(7)})`, target: 'file', editability: 'flattened' };
      return { status: 'unsupported', note: 'لا مسار تحرير عناصر في Connect API.', verified: { source: 'none' } };
  }
}

// Steps the creator does in the Canva editor (Help Center).
function manualEntry(cap) {
  const base = { status: 'supported', approval: 'user-action', target: 'in-place', editability: 'native', verified: { source: 'help-center', at: '2026-10-02', note: 'مركز مساعدة Canva' } };
  const steps = {
    'motion.animate': 'حدّد العنصر ← Animate ← اختر حركة (لا تختر حركة حرفًا حرفًا للعربية).',
    'motion.transition': 'حدّد الصفحة ← Animate ← Page Animations/Transitions.',
    'timing.duration': 'مؤقت الصفحة ← أدخل المدة بالثواني.',
    'text.font-family': 'حدّد النصوص ← قائمة الخط ← Cairo أو Tajawal.',
    'audio.add': 'Elements ← Audio أو ارفع ملفك (لا نضيف موسيقى تلقائيًا).',
    'import.native-file': 'Upload ← ارفع ملف .pptx ← يُفتح تصميمًا جديدًا.',
  };
  return steps[cap] ? { ...base, via: steps[cap] } : null;
}

// Live and documented evidence, dated. `tool`/`fingerprint` tie live
// results to the schema they were obtained with.
export const BUILTIN_EVIDENCE = [
  { capability: 'media.upload', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'create-upload-url + POST', note: 'SVG رُفع وأُدرج. وليس مسار استيراد تصميم: PPTX رُفض («Unsupported file format PPTX»، HTTP 400) وPDF قُبل لكنه أعاد fileId فقط بلا تصميم.', source: 'live', at: '2026-10-02', tool: 'create-upload-url', fingerprint: 'fd378264248f' },
  { capability: 'design.create', route: 'connector', dialect: 'edit-design', status: 'partial', via: 'copy-design لقاعدة سابقة ثم resize-design', note: 'create-design أنتج 1080×1440 برسوم مولّدة؛ نسخ قاعدة سابقة لا يولّد شيئًا، وتبقى صورة خلفيتها تحت شكل الخلفية.', source: 'live', at: '2026-10-02' },
  { capability: 'design.size', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'resize-design', note: '1080×1350 → 1080×1920 أنشأ تصميمًا جديدًا وبقي الأصل كما هو؛ بلا توليد.', source: 'live', at: '2026-10-02', tool: 'resize-design', fingerprint: 'b5bea41b6c62' },
  { capability: 'text.add', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: add_text', note: 'كاروسيل 3 صفحات وريل 5 مشاهد: 54/54 نصًا طابق حرفيًا في القراءة الراجعة.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'text.format', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: format_text', note: 'الحجم واللون والوزن والمحاذاة والمسافة بين الأسطر طُبّقت وقُرئت راجعة مطابقة.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'text.rtl', route: 'connector', dialect: 'edit-design', status: 'partial', via: 'edit-design: add_text + format_text', note: 'الاتصال والترتيب من اليمين صحيحان، ولا حقل لاتجاه الفقرة: Canva يأخذه من أول حرف أو رقم، فنص يبدأ برقم أو بحرف لاتيني يحاذى يسارًا مع start (نرسل end). ولا يعزل Canva المقاطع اللاتينية: @kitabwbs داخل جملة عربية ظهر kitabwbs@ حتى أُضيفت علامة LRM غير مرئية قبل @.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'page.add', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: add_page', note: 'صفحات 1080×1350 و1080×1920 بخلفية لونية؛ معرّفاتها تُقرأ من design_content مع transaction_id.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'image.insert', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'create-upload-url + edit-design: insert_fill', note: 'SVG مرفوع أُدرج بموضعه ومقاسه.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'image.replace', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: resize_element + crop_media', note: 'بعد تكبير الإطار تُعاد الصورة كاملة بـ crop_media وإلا قُصّت.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'shape.insert', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: insert_shape', note: 'مسارات ودوائر وحبوب وأيقونات بخط فقط.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
  { capability: 'speaker-notes', route: 'connector', dialect: 'edit-design', status: 'supported', via: 'edit-design: replace_speaker_notes', note: 'خطة 5 مشاهد (المدة والحركة والانتقال) خُزّنت وقُرئت راجعة في ملاحظات كل صفحة.', source: 'live', at: '2026-10-02', tool: 'edit-design', fingerprint: '1480a76aa75b' },
];

const merge = (entry, extra) => (extra ? { ...entry, ...extra, limits: [...(entry.limits ?? []), ...(extra.limits ?? [])] } : entry);

export class CanvaCapabilityRegistry {
  // store: studio store (optional) to persist evidence and the last facts.
  // connectApi: true when the creator configured a Connect API token.
  constructor({ store = null, evidence = BUILTIN_EVIDENCE, connectApi = false } = {}) {
    this.store = store;
    this.connectApiReady = connectApi;
    const saved = store?.readJson('canva/registry.json');
    this.facts = saved?.facts ?? schemaFacts([]);
    this.factsAt = saved?.factsAt ?? null;
    this.evidence = [...evidence, ...(saved?.evidence ?? [])];
    this.schemaHistory = saved?.schemaHistory ?? [];
  }

  get dialect() {
    return this.facts.dialect?.kind === 'canva-dialect' ? this.facts.dialect : dialectFromFacts(this.facts);
  }

  // New schemas for this session. Returns the tools whose schema changed
  // since the last time (their live evidence becomes stale).
  loadSchemas(input, { at = now() } = {}) {
    const facts = schemaFacts(input);
    const before = this.facts?.fingerprints ?? {};
    const changed = Object.keys(facts.fingerprints).filter((t) => before[t] && facts.fingerprints[t] && before[t] !== facts.fingerprints[t]);
    if (this.factsAt) this.schemaHistory = [...this.schemaHistory, { at: this.factsAt, fingerprints: before }].slice(-20);
    this.facts = facts;
    this.factsAt = at;
    // Evidence recorded against an older schema of a changed tool is stale.
    for (const e of this.evidence) if (e.tool && changed.includes(e.tool) && e.source === 'live') e.stale = true;
    this.persist();
    return { changed, tools: facts.tools.length };
  }

  // A dated result from a live test (or another source).
  record({ capability, route, status, via, note, source = 'live', at = now(), tool }) {
    if (!CAPABILITIES[capability]) throw new Error(`unknown capability ${capability}`);
    if (!ROUTES[route]) throw new Error(`unknown route ${route}`);
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
    const fingerprint = tool ? this.facts.fingerprints?.[tool] ?? null : null;
    const row = { capability, route, status, ...(via && { via }), ...(note && { note }), source, at, ...(tool && { tool, fingerprint }), ...(route === 'connector' && this.factsAt && { dialect: this.dialect.id }) };
    this.evidence.push(row);
    this.persist();
    return row;
  }

  persist() {
    if (!this.store) return;
    const own = this.evidence.filter((e) => !BUILTIN_EVIDENCE.includes(e));
    this.store.writeJson('canva/registry.json', { facts: this.facts, factsAt: this.factsAt, evidence: own, schemaHistory: this.schemaHistory });
  }

  entry(capability, route) {
    let e;
    if (route === 'connector') e = { ...connectorEntry(capability, this.facts), verified: { source: this.factsAt ? 'schema' : 'none', at: this.factsAt } };
    else if (route === 'native-file') e = nativeFileEntry(capability);
    else if (route === 'connect-api') e = connectApiEntry(capability);
    else if (route === 'manual') e = manualEntry(capability);
    if (!e) return null;
    // The newest non-stale evidence for this capability and route wins over
    // the schema reading; stale evidence is reported, not applied.
    // Live evidence about a tool applies only to the same tool schema it
    // was obtained with (same fingerprint). Evidence from another or an
    // unknown schema is shown as the last known state; evidence from a
    // schema that has since changed is stale.
    const ev = this.evidence.filter((x) => x.capability === capability && x.route === route);
    const fpNow = (x) => (x.tool ? this.facts.fingerprints?.[x.tool] ?? null : null);
    // Evidence from another connector (another dialect) is neither current
    // nor stale here: it is shown as the last known state elsewhere.
    const otherConnector = (x) => route === 'connector' && this.factsAt && x.dialect && x.dialect !== this.dialect.id;
    const staleRows = ev.filter((x) => !otherConnector(x) && (x.stale || (x.tool && x.fingerprint && fpNow(x) && x.fingerprint !== fpNow(x))));
    const live = ev.filter((x) => !otherConnector(x) && !staleRows.includes(x) && (!x.tool || (x.fingerprint && x.fingerprint === fpNow(x))));
    const unconfirmed = ev.filter((x) => !staleRows.includes(x) && !live.includes(x));
    const byDate = (a, b) => (a.at < b.at ? 1 : -1);
    const latest = live.sort(byDate)[0];
    const lastKnown = unconfirmed.sort(byDate)[0];
    const out = {
      capability,
      label: CAPABILITIES[capability],
      route,
      executor: ROUTES[route].executor,
      status: 'unverified',
      target: null,
      editability: null,
      approval: 'none',
      limits: [],
      requires: [],
      ...e,
    };
    // Connector evidence counts only in a session whose schemas were read
    // and that has the tool; otherwise it is shown as the last known state.
    const sessionBlind = route === 'connector' && (!this.factsAt || out.missingTool);
    if (route === 'connector' && !this.factsAt) {
      out.status = 'unverified';
      out.note = 'لم تُقرأ مخططات أدوات Canva في هذه الجلسة.';
      // Unknown, not missing: no schemas were read.
      delete out.missingTool;
      delete out.via;
    }
    const known = (x) => ({ status: x.status, at: x.at, source: x.source, note: x.note, ...(otherConnector(x) && { connector: x.dialect, why: 'من موصل Canva آخر؛ لا يُطبّق على أدوات هذه الجلسة' }) });
    if (latest && sessionBlind) out.lastKnown = known(latest);
    else if (lastKnown && !latest) out.lastKnown = known(lastKnown);
    if (latest && !sessionBlind) {
      out.status = latest.status;
      if (latest.via) out.via = latest.via;
      out.verified = { source: latest.source, at: latest.at, note: latest.note };
      out.evidence = live.map(({ status, note, source, at }) => ({ status, note, source, at }));
    }
    const stale = staleRows;
    if (stale.length) out.stale = stale.map(({ status, note, at }) => ({ status, note, at, why: 'تغيّر مخطط الأداة منذ هذا الاختبار: أعد التحقق' }));
    if (out.status === 'unsupported' && route === 'connector') out.alternatives = this.alternatives(capability);
    return out;
  }

  alternatives(capability) {
    return ['native-file', 'connect-api', 'manual']
      .map((r) => this.entry(capability, r))
      .filter((e) => e && e.status !== 'unsupported')
      .map(({ route, status, via, target, approval, executor }) => ({ route, status, via, target, approval, executor }));
  }

  get(capability) {
    const routes = Object.fromEntries(Object.keys(ROUTES).map((r) => [r, this.entry(capability, r)]).filter(([, e]) => e));
    return { capability, label: CAPABILITIES[capability], routes, best: this.route(capability) };
  }

  // Best route for a need: what the assistant can run itself first
  // (supported, then partial), then the creator's routes. Unverified is
  // offered only when nothing better exists, and says so.
  route(capability, { exclude = [] } = {}) {
    const rank = { supported: 0, partial: 1, unverified: 2, unsupported: 3 };
    const order = ['connector', 'connect-api', 'native-file', 'manual'];
    const options = order
      .filter((r) => !exclude.includes(r))
      .map((r) => this.entry(capability, r))
      .filter((e) => e && e.status !== 'unsupported')
      .filter((e) => !(e.route === 'connect-api' && e.status === 'unverified' && !this.connectApiReady));
    options.sort((a, b) => rank[a.status] - rank[b.status] + (a.executor === 'assistant' ? 0 : 0.5) - (b.executor === 'assistant' ? 0 : 0.5));
    return options[0] ?? { capability, route: null, status: 'unsupported', label: CAPABILITIES[capability] };
  }

  table() {
    return Object.keys(CAPABILITIES).map((c) => {
      const g = this.get(c);
      return { capability: c, label: g.label, ...Object.fromEntries(Object.entries(g.routes).map(([r, e]) => [r, { status: e.status, via: e.via ?? null }])) };
    });
  }

  toJSON() {
    return { factsAt: this.factsAt, tools: this.facts.tools, dialect: dialectSummary(this.dialect), capabilities: Object.keys(CAPABILITIES).map((c) => this.get(c)) };
  }
}

// Markdown table for the skill references (generated at build time).
export function registryMarkdown(registry) {
  const mark = { supported: 'مدعوم', partial: 'جزئي', unsupported: 'غير مدعوم', unverified: 'لم يُتحقق' };
  const rows = registry.table().map((r) => `| ${r.label} | ${['connector', 'native-file', 'connect-api', 'manual'].map((k) => (r[k] ? `${mark[r[k].status]}${r[k].via ? `: ${r[k].via}` : ''}` : '—')).join(' | ')} |`);
  return ['| القدرة | الموصل | ملف أصلي | Connect API | يدوي في Canva |', '|---|---|---|---|---|', ...rows].join('\n');
}
