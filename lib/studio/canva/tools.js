import { renderArtSvg } from '../svg.js';
import { recolorSvg } from '../render.js';
import { checkDesign } from '../quality.js';
import { runCommand } from '../commands.js';
import { applyPatches } from '../patch.js';
import { pageTheme } from '../theme.js';
import { base64Encode, dataUrlToBytes, sha256, utf8 } from '../util.js';
import { validateDocument } from '../contracts.js';
import { CanvaCapabilityRegistry } from './registry.js';
import { CanvaJournal, classifyError } from './journal.js';
import { normalizeReadback } from './readback.js';
import { forDialect, mapReadback, planConnectorBuild, planConnectorPatch, textFormat } from './connector.js';
import { dialectSummary } from './dialect.js';
import { buildPptx } from './pptx.js';
import { buildReel, reelStatus, sceneNotes } from './reel.js';
import { validateTransfer } from './validate.js';
import { probeFile } from './media.js';
import { ConnectClient } from './connect.js';

// The plugin's Canva tools. Each one does real work (plans from the live
// capability registry, files, checks against what Canva returned) and says
// exactly what state it reached:
//   planned        tool calls ready for the assistant to run; nothing in
//                  Canva changed yet
//   file-ready     a file was written locally (e.g. an editable .pptx)
//   done / passed / verified    checked against Canva's own answer
//   needs-input    something only the session can provide (tool schemas,
//                  a read-back, a downloaded file)
//   blocked        stopped on purpose (external change, approval, quota)
//   unsupported    no route can do this here; alternatives are listed
// ctx: { store, readJson(path), writeFile(path, bytes), readBytes(path),
//        join(...), env, fetch, studio (ledger, memory) }

const ok = (tool, status, fields = {}) => ({ ok: !['unsupported', 'failed', 'blocked', 'needs-input'].includes(status), tool, status, ...fields });

function load(ctx, value, what) {
  if (value === undefined || value === null) throw new Error(`${what} is required`);
  return typeof value === 'string' ? ctx.readJson(value) : value;
}

function loadDoc(ctx, value) {
  const doc = load(ctx, value, 'design');
  const problems = validateDocument(doc);
  if (problems.length) throw new Error(`design is not a valid studio document: ${problems.slice(0, 3).map((p) => `${p.path} ${p.message}`).join('; ')}`);
  return doc;
}

const registryOf = (ctx) => new CanvaCapabilityRegistry({ store: ctx.store, connectApi: Boolean(ctx.env?.CANVA_ACCESS_TOKEN) });
const brandOf = (ctx, doc, brandId) => (brandId ? ctx.studio?.memory.brand(brandId) : null) ?? (doc.brandId ? ctx.studio?.memory.brand(doc.brandId) : null) ?? doc.brandKit ?? null;
const record = (ctx, tool, extra = {}) => ctx.studio?.ledger.record({ kind: `canva.${tool}`, ...extra });

// Files to upload for the design's images: illustrations recoloured to the
// design's theme, so Canva shows them as the studio does.
function uploadFiles(ctx, doc, outDir) {
  const files = {};
  const keys = {};
  for (const page of doc.pages) {
    const { colors } = pageTheme(doc, page);
    for (const el of page.elements) {
      if (el.kind !== 'image' || el.hidden || files[el.assetId]) continue;
      const asset = doc.assets?.[el.assetId];
      const decoded = asset?.dataUrl ? dataUrlToBytes(asset.dataUrl) : null;
      if (!decoded) continue;
      let bytes = decoded.bytes;
      const ext = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[asset.mediaType] ?? 'bin';
      if (asset.colorable && asset.mediaType === 'image/svg+xml') bytes = utf8(recolorSvg(new TextDecoder().decode(bytes), colors));
      const file = ctx.join(outDir, 'uploads', `${el.assetId}.${ext}`);
      ctx.writeFile(file, bytes);
      files[el.assetId] = file;
      keys[el.assetId] = sha256(bytes);
    }
  }
  return { files, keys };
}

// ---------------------------------------------------------------------------

export async function canva_capabilities(ctx, args = {}) {
  const reg = registryOf(ctx);
  let changed = [];
  if (args.schemas || args.schemasFile) changed = reg.loadSchemas(args.schemas ?? ctx.readJson(args.schemasFile)).changed;
  if (args.record) reg.record(args.record);
  record(ctx, 'capabilities');
  if (args.capability) return ok('canva_capabilities', 'done', { factsAt: reg.factsAt, ...(reg.factsAt && { dialect: dialectSummary(reg.dialect) }), capability: reg.get(args.capability) });
  const table = reg.table();
  const count = (route) => table.reduce((acc, r) => ((acc[r[route]?.status ?? 'n/a'] = (acc[r[route]?.status ?? 'n/a'] ?? 0) + 1), acc), {});
  return ok('canva_capabilities', 'done', {
    factsAt: reg.factsAt,
    ...(reg.factsAt && { dialect: dialectSummary(reg.dialect) }),
    changedTools: changed,
    connector: count('connector'),
    ...(reg.factsAt ? {} : { note: 'لم تُقرأ مخططات أدوات Canva في هذه الجلسة: قدرات الموصل كلها «لم يُتحقق». مرّر schemas (أسماء الأدوات ومخطط edit-design وexport-design).' }),
    ...(changed.length && { warning: `تغيّر مخطط ${changed.join('، ')} منذ آخر جلسة: نتائج الاختبارات الحية لهذه الأدوات صارت قديمة وتحتاج تحققًا.` }),
    table,
  });
}

export async function canva_inspect(ctx, args = {}) {
  const rb = normalizeReadback(load(ctx, args.readback, 'readback'), { designId: args.designId });
  const designId = args.designId ?? rb.designId;
  const out = {
    design: {
      designId,
      title: rb.title,
      pageCount: rb.pageCount,
      transactionId: rb.transactionId,
      pages: rb.pages.map((p) => ({ index: p.index + 1, pageId: p.pageId, size: p.width && p.height ? `${p.width}×${p.height}` : null, editable: p.editable, elements: p.elements.length, texts: p.elements.filter((e) => typeof e.text === 'string').map((e) => ({ locator: e.locator, text: e.text })) })),
    },
  };
  if (args.design) {
    const doc = loadDoc(ctx, args.design);
    const j = new CanvaJournal(ctx.store, doc.id);
    out.externalChanges = designId ? j.externalChanges(designId, rb) : { checked: false };
    const { map, unmatched } = mapReadback(doc, rb);
    let adopted = 0;
    for (const [key, loc] of Object.entries(map)) {
      const [pageId, elementId] = key.split('/');
      if (!j.locator(pageId, elementId)) {
        j.setLocator(pageId, elementId, loc);
        adopted++;
      }
    }
    rb.pages.forEach((p) => doc.pages[p.index] && p.pageId && j.setPage(doc.pages[p.index].id, p.pageId));
    if (rb.transactionId && designId && !j.data.transactions.some((t) => t.transactionId === rb.transactionId)) j.openTransaction(designId, rb.transactionId);
    out.mapping = { matched: Object.keys(map).length, adopted, unmatched };
    out.openTransactions = j.openTransactions();
    out.journal = j.summary();
  }
  record(ctx, 'inspect');
  const blocked = out.externalChanges?.changed?.length || out.externalChanges?.removed?.length;
  return ok('canva_inspect', blocked ? 'blocked' : 'done', {
    ...out,
    ...(blocked && { code: 'external-change', message: 'تغيّرت عناصر في Canva منذ آخر كتابة لنا. اعرض التغييرات على المستخدم قبل أي تعديل، ولا تكتب فوقها دون موافقته.' }),
  });
}

export async function canva_build_design(ctx, args = {}) {
  const doc = loadDoc(ctx, args.design);
  const reg = registryOf(ctx);
  const j = new CanvaJournal(ctx.store, doc.id);
  const outDir = args.outDir ?? ctx.join(ctx.tmpDir ?? '.', `canva-${doc.id}`);
  const files = [];
  // The native file is always written: it carries the fonts and coloured
  // words the connector cannot set, as an alternative the creator imports.
  const pptx = buildPptx(doc, { title: args.title });
  const pptxPath = ctx.join(outDir, `${doc.id}.pptx`);
  ctx.writeFile(pptxPath, pptx.bytes);
  files.push({ kind: 'native-file', path: pptxPath, editability: 'native', report: pptx.report });
  const route = args.route ?? 'auto';
  record(ctx, 'build_design', { designId: doc.id });

  if (route === 'native-file') {
    return ok('canva_build_design', 'file-ready', {
      route: 'native-file',
      files,
      importOptions: importOptions(reg),
      next: 'بعد الاستيراد: canva_inspect ثم canva_validate_arabic على التصميم الجديد.',
      limitations: ['الاستيراد ينشئ تصميمًا جديدًا في Canva.', ...pptx.report.limitations],
    });
  }
  if (!reg.factsAt) {
    return ok('canva_build_design', 'needs-input', { route: 'connector', files, message: 'مرّر مخططات أدوات Canva لهذه الجلسة إلى canva_capabilities أولًا؛ لا أبني خطة على قدرات لم تُتحقق.' });
  }
  const key = CanvaJournal.buildKey(doc, 'connector', { w: doc.pages[0].widthPx, h: doc.pages[0].heightPx });
  const begin = j.beginBuild(key, { route: 'connector' });
  if (begin.resume && (begin.build.designId || begin.build.state === 'planned')) {
    const designId = begin.build.designId;
    if (designId) {
      return ok('canva_build_design', 'resume', {
        route: 'connector',
        buildKey: key,
        designId,
        message: `هذا التصميم نفسه بُني من قبل في ${designId}: لا تنشئ نسخة أخرى. افتحه بـ read-design (open_transaction) وأكمل أو تحقق منه.`,
        files,
      });
    }
  }
  const { files: assetFiles, keys: uploadKeys } = uploadFiles(ctx, doc, outDir);
  // Partial mode places each page's graphics as one image under live text.
  const artFiles = {};
  if (args.mode === 'partial') {
    for (const page of doc.pages) {
      const file = ctx.join(outDir, 'uploads', `page-${page.id}.svg`);
      const bytes = utf8(renderArtSvg(doc, page));
      ctx.writeFile(file, bytes);
      artFiles[page.id] = file;
      uploadKeys[`page-${doc.pages.indexOf(page) + 1}`] = sha256(bytes);
    }
  }
  const plan = planConnectorBuild(doc, reg, { title: args.title ?? doc.brief, assetFiles, artFiles, uploadKeys, uploads: j.data.uploads, base: args.base ? (typeof args.base === 'string' ? { designId: args.base } : args.base) : j.data.base ?? null, notes: args.notes ?? null, mode: args.mode ?? 'native' });
  if (!plan.ok) return ok('canva_build_design', 'unsupported', { route: 'connector', limitations: plan.limitations, files, alternatives: importOptions(reg) });
  const blocking = (plan.dialectIssues ?? []).filter((i) => i.severity === 'error');
  if (blocking.length) {
    return ok('canva_build_design', 'unsupported', { route: 'connector', code: 'connector-dialect', issues: plan.dialectIssues, dialect: dialectSummary(reg.dialect), files, alternatives: importOptions(reg), message: 'خطوات لا يقابلها في موصل هذه الجلسة أداة أو حقل: لا أرسلها بأسماء مخمّنة.' });
  }
  j.updateBuild(key, { state: 'planned', steps: plan.steps.length });
  const fontLimit = reg.entry('text.font-family', 'connector').status !== 'supported';
  return ok('canva_build_design', 'planned', {
    route: 'connector',
    buildKey: key,
    editability: plan.editability,
    limitations: plan.limitations,
    generation: plan.generation,
    uploads: plan.uploads,
    steps: plan.steps,
    ...(plan.dialectIssues?.length && { issues: plan.dialectIssues }),
    dialect: dialectSummary(reg.dialect),
    files,
    ...(fontLimit && { fontsInFile: pptx.report.fonts, alternative: 'الملف الأصلي (.pptx) يحمل الخطوط والكلمات الملوّنة؛ استيراده ينشئ تصميمًا جديدًا.' }),
    record: 'سجّل كل معرّف حقيقي بـ canva_record: design (بعد الإنشاء/النسخ/تغيير المقاس)، transaction، upload، ثم locators من القراءة الراجعة.',
  });
}

function importOptions(reg) {
  return ['connector', 'connect-api', 'manual'].map((r) => reg.entry('import.native-file', r)).filter(Boolean).map(({ route, status, via, executor, verified, note }) => ({ route, status, via, executor, ...(note && { note }), ...(verified?.note && { evidence: verified.note }) }));
}

export async function canva_apply_patch(ctx, args = {}) {
  const before = loadDoc(ctx, args.design);
  const reg = registryOf(ctx);
  const j = new CanvaJournal(ctx.store, before.id);
  const link = j.current();
  const brand = brandOf(ctx, before, args.brandId);
  // Edits made in Canva since our last write are never overwritten silently.
  let readback = null;
  if (args.readback) {
    readback = normalizeReadback(load(ctx, args.readback, 'readback'), { designId: link?.designId });
    const ext = j.externalChanges(readback.designId ?? link?.designId, readback);
    if ((ext.changed.length || ext.removed.length) && !args.force) {
      return ok('canva_apply_patch', 'blocked', { code: 'external-change', externalChanges: ext, message: 'عُدّلت عناصر في Canva بعد آخر كتابة لنا. اعرضها على المستخدم؛ لا أطبّق فوقها إلا بموافقته (force).' });
    }
  }
  // Each command is a step with its own before/after, so a step Canva
  // cannot carry (a font family) never drags the others with it.
  let doc = before;
  const applied = [];
  const pending = [];
  const steps = [];
  for (const text of [].concat(args.commands ?? [])) {
    const r = runCommand(doc, text, { brand });
    if (r.local && r.doc !== doc) {
      steps.push({ label: text, before: doc, after: r.doc });
      doc = r.doc;
      applied.push({ command: text, intent: r.intent, reply: r.reply });
    } else pending.push({ command: text, intent: r.intent, needs: r.needs ?? null, reply: r.reply, ...(r.targets && { targets: r.targets }), ...(r.target && { target: r.target }) });
  }
  if (args.patch) {
    const patches = load(ctx, args.patch, 'patch');
    const next = applyPatches(doc, Array.isArray(patches) ? patches : patches.patches, { label: 'canva_apply_patch' }).doc;
    steps.push({ label: 'patch', before: doc, after: next });
    doc = next;
    applied.push({ patch: Array.isArray(patches) ? patches.length : patches.patches.length });
  }
  if (!applied.length) return ok('canva_apply_patch', pending.length ? 'needs-input' : 'done', { applied, pending, message: pending.length ? 'لا تعديل محلي: الطلبات تحتاج المساعد (إعادة صياغة، أصل جديد، توضيح).' : 'لا شيء تغيّر.' });
  const quality = checkDesign(doc, { brand, expectedFormat: doc.intent?.format });
  const outPath = args.out ?? (typeof args.design === 'string' ? args.design : null);
  if (outPath) ctx.writeFile(outPath, utf8(JSON.stringify(doc, null, 1)));
  record(ctx, 'apply_patch', { designId: doc.id, note: applied.map((a) => a.intent ?? 'patch').join(',') });
  if (!link) {
    return ok('canva_apply_patch', 'done', { scope: 'local', applied, pending, revision: doc.revision, quality: summarizeQuality(quality), saved: outPath, message: 'طُبّق على التصميم المحلي؛ لا تصميم مرتبط في Canva بعد.' });
  }
  const pageIndexOf = (pageId) => doc.pages.findIndex((p) => p.id === pageId) + 1;
  const scale = readback?.pages?.[0]?.width ? readback.pages[0].width / doc.pages[0].widthPx : 1;
  const plan = { calls: [], operations: 0, affectedPages: [], unsupported: [], unmapped: [], notes: [], withheld: [], generation: { expected: 0, note: 'تعديلات الخط والحجم والموقع واللون لا تولّد شيئًا.' } };
  for (const step of steps) {
    const p = planConnectorPatch(step.before, step.after, { locator: (pg, e) => j.locator(pg, e), pageIndexOf, registry: reg, scale, transactionId: readback?.transactionId ?? '$transactionId' });
    plan.unsupported.push(...p.unsupported);
    plan.unmapped.push(...p.unmapped.filter((u) => !plan.unmapped.some((x) => x.pageId === u.pageId && x.elementId === u.elementId)));
    plan.notes.push(...p.notes);
    if (p.unsupported.some((u) => u.font)) {
      // Moving elements to make room for a font Canva will not get would
      // leave the design wrong in both fonts: this step stays local.
      plan.withheld.push({ step: step.label, operations: p.operations, why: 'عائلة الخط لا تُطبّق عبر الموصل، فلا أحرّك العناصر لأجلها في Canva.' });
      continue;
    }
    plan.calls.push(...p.calls);
    plan.issues = [...(plan.issues ?? []), ...(p.dialectIssues ?? [])];
    plan.operations += p.operations;
    plan.affectedPages = [...new Set([...plan.affectedPages, ...p.affectedPages])].sort((a, b) => a - b);
  }
  let nativeFile = null;
  if (plan.withheld.length) {
    const pptx = buildPptx(doc, { title: doc.brief });
    nativeFile = ctx.join(args.outDir ?? ctx.join(ctx.tmpDir ?? '.', `canva-${doc.id}`), `${doc.id}-r${doc.revision}.pptx`);
    ctx.writeFile(nativeFile, pptx.bytes);
  }
  const status = plan.calls.length ? 'planned' : plan.unsupported.length ? 'unsupported' : 'done';
  return ok('canva_apply_patch', status, {
    designId: link.designId,
    applied,
    pending,
    revision: doc.revision,
    saved: outPath,
    quality: summarizeQuality(quality),
    calls: plan.calls,
    operations: plan.operations,
    unsupported: plan.unsupported,
    unmapped: plan.unmapped,
    notes: plan.notes,
    withheld: plan.withheld,
    ...(nativeFile && { nativeFile: { path: nativeFile, note: 'الملف الأصلي يحمل الخط الجديد؛ استيراده ينشئ تصميمًا جديدًا. أو غيّر الخط في Canva يدويًا (تحديد النصوص ← الخط) فيبقى التصميم نفسه.' } }),
    generation: plan.generation,
    ...(plan.issues?.length && { issues: plan.issues }),
    preview: plan.affectedPages.length ? { calls: forDialect([{ tool: 'read-design', args: { design_id: link.designId, transaction_id: readback?.transactionId ?? '$transactionId', filter: { fields: ['thumbnails'], thumbnail_pages: plan.affectedPages } } }], reg).steps, note: 'معاينة الصفحات المتأثرة فقط.' } : null,
    approval: 'اعرض المعاينة؛ الحفظ (commit) بعد موافقة المستخدم الصريحة فقط.',
    ...(plan.unmapped.length && { next: 'عناصر بلا مرجع في Canva: شغّل canva_inspect مع design وreadback لربطها.' }),
  });
}

const summarizeQuality = (q) => ({ passed: q.passed, errors: q.errors, warnings: q.warnings, issues: q.issues.slice(0, 12).map((i) => `${i.severity}: ${i.message}`) });

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// Import through the session's connector, read from its import tool: a
// file field (design_file or similar) gets the .pptx itself; a URL field
// never gets a local path. Returns null when there is no import tool.
function connectorImport(reg, { file, bytes, title, isReel }) {
  const im = reg.factsAt ? reg.dialect.import : null;
  if (!im) return null;
  const entry = reg.entry('import.native-file', 'connector');
  if (im.file && ['host-file', 'base64', 'binary', 'path'].includes(im.file.kind)) {
    const attach = ['host-file', 'binary'].includes(im.file.kind);
    const value = im.file.kind === 'base64' ? base64Encode(bytes) : im.file.kind === 'path' ? file : { $attach: file };
    const a = { [im.file.field]: value };
    if (im.nameField) a[im.nameField] = title;
    if (im.typeField?.values) {
      const want = isReel ? 'instagram_reel' : 'instagram_post';
      if (im.typeField.values.includes(want)) a[im.typeField.field] = want;
    }
    return {
      entry,
      call: {
        tool: im.tool,
        args: a,
        save: 'newDesignId',
        ...(attach && { attach: { field: im.file.field, path: file, mediaType: PPTX_MIME, how: 'أرفق هذا الملف كما يطلب المضيف، ثم مرّر مرجع الملف الذي يعطيه المضيف في هذا الحقل؛ لا مسارًا محليًا ولا رابطًا عامًا.' } }),
        note: 'استدعاء واحد ينشئ تصميمًا واحدًا: إن انقطع الرد فاقرأ قائمة التصاميم قبل أي إعادة، ولا تستورد مرتين.',
      },
    };
  }
  return { entry, call: null };
}

export async function canva_import_editable(ctx, args = {}) {
  const doc = loadDoc(ctx, args.design);
  const reg = registryOf(ctx);
  const j = new CanvaJournal(ctx.store, doc.id);
  const outDir = args.outDir ?? ctx.join(ctx.tmpDir ?? '.', `canva-${doc.id}`);
  const timing = args.reel ? load(ctx, args.reel, 'reel').scenes.map((s) => ({ seconds: s.seconds, transition: s.transition?.type ?? 'cut' })) : undefined;
  const pptx = buildPptx(doc, { title: args.title, timing });
  const file = ctx.join(outDir, `${doc.id}.pptx`);
  ctx.writeFile(file, pptx.bytes);
  record(ctx, 'import_editable', { designId: doc.id });
  const source = j.current();
  const isReel = Boolean(args.reel) || doc.pages[0].heightPx / doc.pages[0].widthPx > 1.7;
  const viaConnector = args.route === 'connect-api' || args.execute ? null : connectorImport(reg, { file, bytes: pptx.bytes, title: args.title ?? doc.brief ?? 'تصميم', isReel });
  if (viaConnector?.call) {
    const verify = forDialect([{ tool: 'read-design', args: { design_id: '$newDesignId', filter: { fields: ['page_metadata', 'design_content', 'thumbnails'] } } }], reg);
    return ok('canva_import_editable', 'planned', {
      route: 'connector',
      file,
      report: pptx.report,
      capability: { status: viaConnector.entry.status, via: viaConnector.entry.via, limits: viaConnector.entry.limits ?? [] },
      ids: { localDocId: doc.id, sourceDesignId: source?.designId ?? null, newDesignId: '$newDesignId' },
      calls: [viaConnector.call],
      record: { event: 'design', relation: 'import', designId: '$newDesignId', sourceDesignId: source?.designId ?? null, route: 'connector', tool: viaConnector.call.tool },
      verify: {
        calls: verify.steps,
        expect: { pages: doc.pages.length, width: doc.pages[0].widthPx, height: doc.pages[0].heightPx },
        then: 'canva_validate_arabic (design + readback): كل نص حرفيًا، وعدد الصفحات ومقاسها؛ ثم معاينة كل صفحة للمظهر (الخط والاتجاه والمحاذاة).',
      },
      honesty: `لم يُستورد شيء بعد. الاستيراد ينشئ تصميمًا جديدًا ولا يعدّل الأصل${source ? ` ${source.designId}` : ''}. لا نجاح قبل القراءة الراجعة والمعاينة.${viaConnector.entry.status === 'unverified' ? ' مخطط أداة الاستيراد لا يذكر PowerPoint صراحة.' : ''}`,
    });
  }
  if (args.execute) {
    const token = ctx.env?.CANVA_ACCESS_TOKEN;
    if (!token) return ok('canva_import_editable', 'needs-input', { file, message: 'الاستيراد الآلي يحتاج Canva Connect API بتفويض المستخدم (CANVA_ACCESS_TOKEN). البديل: يرفع المستخدم الملف في Canva بنفسه.', importOptions: importOptions(reg) });
    const client = new ConnectClient({ token, fetch: ctx.fetch, sleep: ctx.sleep });
    try {
      const designs = await client.importDesign(pptx.bytes, { title: args.title ?? doc.brief ?? 'تصميم' });
      const created = designs[0];
      if (!created?.id) return ok('canva_import_editable', 'failed', { file, message: 'انتهت مهمة الاستيراد بلا تصميم.' });
      j.link({ designId: created.id, relation: 'import', sourceDesignId: source?.designId ?? null, route: 'connect-api', url: created.urls?.edit_url ?? null, title: created.title ?? null });
      j.op({ tool: 'connect-api:imports', args: { file }, result: { designId: created.id } });
      reg.record({ capability: 'import.native-file', route: 'connect-api', status: 'supported', note: `استيراد .pptx أنشأ ${created.id}`, source: 'live' });
      return ok('canva_import_editable', 'done', {
        file,
        newDesignId: created.id,
        sourceDesignId: source?.designId ?? null,
        relation: 'import',
        message: `أُنشئ تصميم جديد ${created.id}${source ? `؛ الأصل ${source.designId} لم يُعدّل` : ''}.`,
        next: 'تحقق: read-design للتصميم الجديد ثم canva_validate_arabic.',
      });
    } catch (err) {
      const c = err.class ?? classifyError(err);
      j.op({ tool: 'connect-api:imports', args: { file }, error: err.message });
      return ok('canva_import_editable', c.action === 'stop' ? 'blocked' : 'failed', { file, error: err.message, errorClass: c });
    }
  }
  return ok('canva_import_editable', 'file-ready', {
    file,
    report: pptx.report,
    ...(viaConnector && { connector: { status: viaConnector.entry.status, via: viaConnector.entry.via ?? null, why: viaConnector.entry.note ?? null } }),
    importOptions: importOptions(reg),
    steps: ['في Canva: Create a design ← Import file (أو اسحب الملف إلى الصفحة الرئيسية).', 'افتح التصميم الجديد وانسخ رابطه.', 'canva_record design (relation import) ثم canva_inspect وcanva_validate_arabic على القراءة الراجعة.'],
    honesty: 'لم يُستورد شيء بعد. الاستيراد ينشئ تصميمًا جديدًا ولا يعدّل تصميمًا قائمًا.',
  });
}

export async function canva_build_reel(ctx, args = {}) {
  const source = args.source ? loadDoc(ctx, args.source) : load(ctx, args.idea, 'idea (or source)');
  const brand = args.brandId ? ctx.studio?.memory.brand(args.brandId) : null;
  const numerals = args.numerals ?? brand?.numerals ?? source.theme?.numerals ?? 'arab';
  const { plan, doc } = buildReel(source, { numerals, brandId: args.brandId, title: args.title, theme: args.theme });
  const quality = checkDesign(doc, { brand, expectedFormat: 'story' });
  const notes = plan.scenes.map((s) => sceneNotes(s, { numerals }));
  const outDir = args.outDir ?? ctx.join(ctx.tmpDir ?? '.', `reel-${doc.id}`);
  const docPath = ctx.join(outDir, `${doc.id}.json`);
  const planPath = ctx.join(outDir, `${doc.id}.reel.json`);
  ctx.writeFile(docPath, utf8(JSON.stringify(doc, null, 1)));
  ctx.writeFile(planPath, utf8(JSON.stringify(plan, null, 1)));
  const pptx = buildPptx(doc, { title: plan.title, timing: plan.scenes.map((s) => ({ seconds: s.seconds, transition: s.transition?.type ?? 'cut' })) });
  const pptxPath = ctx.join(outDir, `${doc.id}.pptx`);
  ctx.writeFile(pptxPath, pptx.bytes);
  const reg = registryOf(ctx);
  const connector = reg.factsAt ? planConnectorBuild(doc, reg, { title: plan.title, notes, ...uploadPlanArgs(ctx, doc, outDir) }) : null;
  record(ctx, 'build_reel', { designId: doc.id, note: `${plan.scenes.length} scenes, ${plan.totalSeconds}s` });
  return ok('canva_build_reel', 'planned', {
    reel: { scenes: plan.scenes.map(({ n, role, composition, variant, seconds, words, content }) => ({ n, role, composition, variant, seconds, words, title: content.title ?? content.quote ?? '' })), totalSeconds: plan.totalSeconds, issues: plan.issues },
    quality: summarizeQuality(quality),
    files: { design: docPath, plan: planPath, pptx: pptxPath },
    connector: connector ? { steps: connector.steps, editability: connector.editability, limitations: connector.limitations, generation: connector.generation } : { status: 'needs-input', message: 'مرّر مخططات أدوات Canva لبناء المشاهد في Canva.' },
    progress: reelStatus(plan, { localDocId: doc.id }),
    honesty: 'هذه مشاهد ثابتة بخطة توقيت وحركة، وليست فيديو متحركًا بعد. الحركة والمدد تُطبّق في Canva ثم يُصدّر الفيديو ويُتحقق منه.',
  });
}

function uploadPlanArgs(ctx, doc, outDir) {
  const { files, keys } = uploadFiles(ctx, doc, outDir);
  const j = new CanvaJournal(ctx.store, doc.id);
  return { assetFiles: files, uploadKeys: keys, uploads: j.data.uploads };
}

export async function canva_apply_motion(ctx, args = {}) {
  const plan = load(ctx, args.reel, 'reel plan');
  const reg = registryOf(ctx);
  const needs = ['motion.animate', 'motion.transition', 'timing.duration'].map((c) => reg.entry(c, 'connector'));
  const supported = needs.filter((e) => e.status === 'supported');
  record(ctx, 'apply_motion', { note: needs.map((e) => `${e.capability}:${e.status}`).join(',') });
  const notes = plan.scenes.map((s) => sceneNotes(s, { numerals: args.numerals ?? plan.numerals ?? 'arab' }));
  const notesCalls = reg.entry('speaker-notes', 'connector').status === 'supported' ? forDialect(plan.scenes.map((s, i) => ({ tool: 'edit-design', args: { transaction_id: '$transactionId', page_index: i + 1, finalize: 'keep_open', operations: [{ type: 'replace_speaker_notes', page_id: `$page:${i + 1}`, notes: notes[i] }] } })), reg).steps : [];
  if (supported.length === needs.length) {
    return ok('canva_apply_motion', 'needs-input', { message: `الموصل صار يعرض ${supported.map((e) => e.via).join('، ')}: اقرأ مخطط هذه العملية وطبّق الخطة؛ لا أخمّن معاملاتها.`, plan: notes });
  }
  return ok('canva_apply_motion', 'unsupported', {
    code: 'no-motion-in-connector',
    evidence: needs.map(({ capability, status, note, verified }) => ({ capability, status, note: note ?? verified?.note ?? null })),
    alternatives: [
      { route: 'manual', executor: 'user', how: 'في Canva: Animate لكل عنصر (الحركة للعنصر كاملًا)، ومؤقت كل صفحة، والانتقال بين الصفحات. الخطوات لكل مشهد في manualSteps.' },
      { route: 'speaker-notes', executor: 'assistant', how: 'أكتب خطة كل مشهد في ملاحظات صفحته داخل Canva حتى تبقى مع التصميم.', calls: notesCalls },
      { route: 'local-video', executor: 'user', how: 'محرر بصيرة المحلي يصدّر MP4 بالحركة والمدد نفسها، لكنه فيديو مسطّح غير قابل للتحرير في Canva.' },
      { route: 'native-file', executor: 'user', how: 'ملف .pptx يحمل المدد والانتقالات لـ PowerPoint وKeynote، لكن Canva لا يستوردها (مركز مساعدة Canva).' },
    ],
    manualSteps: notes,
    progress: reelStatus(plan, { canvaDesignId: args.designId ?? null }),
  });
}

export async function canva_preview(ctx, args = {}) {
  if (!args.designId) throw new Error('designId is required');
  const pages = args.pages ? [].concat(args.pages).map(Number).filter((n) => n >= 1) : null;
  record(ctx, 'preview');
  const reg = registryOf(ctx);
  const t = forDialect([{ tool: 'read-design', args: { design_id: args.designId, ...(args.transactionId && { transaction_id: args.transactionId }), filter: { fields: ['thumbnails'], ...(pages?.length && { thumbnail_pages: pages }) } } }], reg);
  if (t.issues.some((i) => i.severity === 'error')) return ok('canva_preview', 'unsupported', { issues: t.issues, message: 'لا أداة معاينة في موصل هذه الجلسة.' });
  return ok('canva_preview', 'planned', {
    calls: t.steps,
    note: pages?.length ? `معاينة الصفحات ${pages.join('، ')} فقط (المتأثرة بالتعديل).` : 'معاينة كل الصفحات.',
  });
}

export async function canva_validate_arabic(ctx, args = {}) {
  const doc = loadDoc(ctx, args.design);
  const rb = normalizeReadback(load(ctx, args.readback, 'readback'), { designId: args.designId });
  const j = new CanvaJournal(ctx.store, doc.id);
  const brand = brandOf(ctx, doc, args.brandId);
  const auto = mapReadback(doc, rb).map;
  const map = { ...auto, ...j.data.locators };
  const report = validateTransfer(doc, rb, { map, brand });
  if (report.repair?.length) {
    const t = forDialect(report.repair, registryOf(ctx));
    report.repair = t.steps;
    if (t.issues.length) report.repairIssues = t.issues;
  }
  const designId = rb.designId ?? args.designId ?? j.current()?.designId;
  if (report.passed && args.snapshot && designId) j.snapshot(designId, rb);
  record(ctx, 'validate_arabic', { designId: doc.id, note: `${report.errors} errors` });
  return ok('canva_validate_arabic', report.passed ? 'passed' : 'failed', { designId, ...report });
}

export async function canva_export(ctx, args = {}) {
  record(ctx, 'export', { note: args.format });
  if (args.file) {
    const bytes = ctx.readBytes(args.file);
    const info = probeFile(bytes, { inflateRaw: ctx.inflateRaw });
    const expect = args.expect ?? {};
    const problems = [];
    if (expect.width && info.width && (info.width !== expect.width || info.height !== expect.height)) problems.push(`المقاس ${info.width}×${info.height} والمطلوب ${expect.width}×${expect.height}.`);
    if (expect.pages && info.pages !== undefined && info.pages !== expect.pages) problems.push(`عدد الصفحات ${info.pages} والمطلوب ${expect.pages}.`);
    if (expect.slides && info.slides !== expect.slides) problems.push(`عدد الشرائح ${info.slides} والمطلوب ${expect.slides}.`);
    let reel = null;
    if (args.reel) {
      const plan = load(ctx, args.reel, 'reel plan');
      // Scene boundaries: given (sceneCuts), or detected in the file when the
      // host has a detector (ffmpeg); never inferred from the total length.
      let cuts = args.sceneCuts === undefined ? null : typeof args.sceneCuts === 'string' ? args.sceneCuts.split(',').map(Number) : [].concat(args.sceneCuts).map(Number);
      let source = cuts ? 'provided' : null;
      if (!cuts && info.format === 'mp4' && ctx.detectSceneCuts) {
        const detected = ctx.detectSceneCuts(args.file);
        if (detected) ({ cuts, source } = detected);
      }
      reel = reelStatus(plan, { video: info, canvaDesignId: args.designId ?? null, sceneCuts: cuts, sceneCutsSource: source, audio: args.audio ?? false, motionApplied: args.motionApplied ?? false });
      if (info.format === 'mp4' && (info.width !== 1080 || info.height !== 1920)) problems.push(`الفيديو ${info.width}×${info.height} والمطلوب 1080×1920.`);
    }
    return ok('canva_export', problems.length ? 'failed' : 'verified', { file: args.file, info, problems, ...(reel && { reel }) });
  }
  if (!args.designId) throw new Error('designId is required');
  if (!args.formats) {
    return ok('canva_export', 'needs-input', { calls: forDialect([{ tool: 'get-export-formats', args: { design_id: args.designId } }], registryOf(ctx)).steps, message: 'اقرأ الصيغ المتاحة لهذا التصميم أولًا ثم أعد الاستدعاء مع formats.' });
  }
  const formats = load(ctx, args.formats, 'formats');
  const available = JSON.stringify(formats).toLowerCase();
  const type = args.format ?? 'png';
  if (!available.includes(`"${type}"`) && !available.includes(`${type}`)) {
    return ok('canva_export', 'unsupported', { message: `الصيغة ${type} غير متاحة لهذا التصميم حسب get-export-formats.`, formats });
  }
  const format = { type, ...(args.pages && { pages: [].concat(args.pages).map(Number) }), ...(type === 'mp4' && { quality: args.quality ?? 'vertical_1080p' }), ...(type === 'png' && args.width && { width: Number(args.width) }) };
  return ok('canva_export', 'planned', {
    calls: forDialect([{ tool: 'export-design', args: { design_id: args.designId, format } }], registryOf(ctx)).steps,
    ...(type === 'mp4' && !args.quality && { note: 'quality=vertical_1080p افتراض للتصميم العمودي: إن رفضه Canva استخدم القيمة التي يذكرها.' }),
    verify: 'نزّل الملف من رابط التصدير ثم canva_export --file <path> --expect … (والريلز: --reel plan.json) للتحقق من المقاس والمدة.',
  });
}

// Real ids and results the assistant got from Canva, into the journal.
export async function canva_record(ctx, args = {}) {
  const doc = loadDoc(ctx, args.design);
  const j = new CanvaJournal(ctx.store, doc.id);
  const reg = registryOf(ctx);
  const event = args.event;
  if (event === 'design') {
    const row = j.link({ designId: args.designId, relation: args.relation ?? 'created', sourceDesignId: args.sourceDesignId ?? null, route: args.route ?? 'connector', url: args.url ?? null, title: args.title ?? null });
    if (args.buildKey && j.data.builds[args.buildKey]) j.updateBuild(args.buildKey, { designId: args.designId, state: 'created' });
    if (args.base) j.data.base = { designId: args.designId, width: doc.pages[0].widthPx, height: doc.pages[0].heightPx };
    j.op({ tool: args.tool ?? 'create-design', args: { relation: row.relation }, result: { designId: args.designId }, generation: args.generation });
    j.save();
    return ok('canva_record', 'done', { link: row, journal: j.summary() });
  }
  if (event === 'transaction') {
    if (args.state === 'open') j.openTransaction(args.designId ?? j.current()?.designId, args.transactionId);
    else j.closeTransaction(args.transactionId, args.state);
    if (args.state === 'committed' && args.buildKey && j.data.builds[args.buildKey]) j.updateBuild(args.buildKey, { state: 'committed' });
    return ok('canva_record', 'done', { openTransactions: j.openTransactions() });
  }
  if (event === 'upload') {
    const hash = args.hash ?? (args.file ? sha256(ctx.readBytes(args.file)) : null);
    if (!hash || !args.mediaId) throw new Error('upload needs file (or hash) and mediaId');
    j.recordUpload(hash, args.mediaId, { kind: args.kind ?? 'image' });
    j.op({ tool: 'create-upload-url', result: { mediaId: args.mediaId } });
    return ok('canva_record', 'done', { uploads: Object.keys(j.data.uploads).length });
  }
  if (event === 'locators') {
    const rb = normalizeReadback(load(ctx, args.readback, 'readback'));
    const { map, unmatched } = mapReadback(doc, rb);
    for (const [key, loc] of Object.entries(map)) {
      const [pageId, elementId] = key.split('/');
      j.setLocator(pageId, elementId, loc);
    }
    rb.pages.forEach((p) => doc.pages[p.index] && p.pageId && j.setPage(doc.pages[p.index].id, p.pageId));
    const designId = rb.designId ?? args.designId ?? j.current()?.designId;
    if (designId) j.snapshot(designId, rb);
    return ok('canva_record', 'done', { mapped: Object.keys(map).length, unmatched });
  }
  if (event === 'edit') {
    // After an edit-design call from a build plan: map the new elements in
    // the response to ours (texts by their characters, others by frame),
    // record their locators, and return the follow-up format_text batch.
    const step = load(ctx, args.step, 'step');
    const response = load(ctx, args.response, 'response');
    const d = reg.dialect;
    const sa = step.args ?? {};
    const ops = sa.operations ?? step.operations ?? [];
    const pageIndex = response.document?.page_index ?? sa.page_index ?? (d.edit?.page && sa[d.edit.page]) ?? 1;
    const transactionId = sa.transaction_id ?? (d.edit?.transaction && sa[d.edit.transaction]) ?? null;
    const page = response.document?.page ?? response.page ?? response.design_content?.pages?.[0] ?? response.pages?.[0];
    if (!page) throw new Error('response has no page document (pass the result of the edit call)');
    const ourPage = doc.pages[pageIndex - 1];
    const rb = normalizeReadback({ design_content: { pages: [page] } });
    // Idempotent: an element mapped by an earlier run keeps its locator;
    // only locators of other elements are taken out of the pool.
    const mine = new Set(ops.filter((o) => o._element).map((o) => j.locator(ourPage.id, o._element)).filter(Boolean));
    const pool = rb.pages[0].elements.filter((e) => mine.has(e.locator) || !Object.values(j.data.locators).includes(e.locator));
    const near = (a, b) => a && b && Math.abs(a.x - b.left) < 2 && Math.abs(a.y - b.top) < 2 && Math.abs(a.width - b.width) < 3;
    const follow = [];
    let mapped = 0;
    for (const op of ops) {
      if (!op._element) continue;
      let hit = pool.find((e) => e.locator === j.locator(ourPage.id, op._element));
      if (hit) {
        /* already mapped */
      } else if (op.type === 'add_text') hit = pool.find((e) => typeof e.text === 'string' && e.text === op.text && !mine.has(e.locator));
      else hit = pool.find((e) => typeof e.text !== 'string' && near(e.frame, op) && !mine.has(e.locator));
      if (!hit) continue;
      pool.splice(pool.indexOf(hit), 1);
      j.setLocator(ourPage.id, op._element, hit.locator);
      mapped++;
      // The format comes from the design as it is now, not from the plan
      // (a plan written by an older version may carry stale values).
      if (op._then) {
        const el = ourPage.elements.find((e) => e.id === op._element);
        const k = (rb.pages[0].width ?? ourPage.widthPx) / ourPage.widthPx;
        follow.push({ type: 'format_text', locator_id: hit.locator, formatting: el?.kind === 'text' ? textFormat(el, pageTheme(doc, ourPage).colors, k) : op._then.formatting });
      }
    }
    if (page.id) j.setPage(ourPage.id, page.id);
    j.touchTransaction(transactionId, ops.length);
    j.op({ tool: step.tool ?? 'edit-design', args: { page: pageIndex, ops: ops.length }, result: { mapped } });
    const missing = ops.filter((o) => o._element && !j.locator(ourPage.id, o._element)).map((o) => o._element);
    return ok('canva_record', missing.length ? 'needs-input' : 'done', {
      mapped,
      missing,
      next: follow.length ? forDialect([{ tool: 'edit-design', args: { transaction_id: transactionId, page_index: pageIndex, finalize: 'keep_open', operations: follow } }], reg).steps[0] : null,
      ...(missing.length && { message: `لم أجد في الرد عناصر: ${missing.join('، ')}. اقرأ الصفحة بـ read-design وأعد المحاولة؛ لا تُضفها مرة ثانية.` }),
    });
  }
  if (event === 'op') {
    j.op({ tool: args.tool, args: args.args ?? null, result: args.result ?? null, error: args.error ?? null, generation: args.generation });
    return ok('canva_record', 'done', { generationCalls: j.generationCount() });
  }
  if (event === 'error') {
    const c = classifyError({ message: args.message, status: args.status });
    j.op({ tool: args.tool ?? 'unknown', error: args.message });
    if (args.transactionId && ['transaction-gone', 'expired-link'].includes(c.code)) j.closeTransaction(args.transactionId, 'expired');
    if (args.buildKey && j.data.builds[args.buildKey] && c.action === 'stop') j.updateBuild(args.buildKey, { state: 'failed', error: c.code });
    return ok('canva_record', 'done', { errorClass: c });
  }
  if (event === 'evidence') {
    const row = reg.record({ capability: args.capability, route: args.route ?? 'connector', status: args.status, note: args.note, via: args.via, tool: args.tool, source: 'live' });
    return ok('canva_record', 'done', { evidence: row });
  }
  throw new Error('event must be one of design, transaction, upload, locators, edit, op, error, evidence');
}

export const TOOLS = {
  canva_capabilities,
  canva_inspect,
  canva_build_design,
  canva_apply_patch,
  canva_import_editable,
  canva_build_reel,
  canva_apply_motion,
  canva_preview,
  canva_validate_arabic,
  canva_export,
  canva_record,
};

const S = (description, props, required = []) => ({ description, inputSchema: { type: 'object', properties: props, required, additionalProperties: false } });
const str = (description) => ({ type: 'string', description });
const file = (description) => ({ description: `${description} (path to a JSON file, or the object)`, anyOf: [{ type: 'string' }, { type: 'object' }] });

// Descriptions and input schemas (MCP tools/list; CLI help).
export const TOOL_DEFS = {
  canva_capabilities: S(
    'What Canva can do in this session, by route (connector, native file, Connect API, manual), with status supported/partial/unsupported/unverified, the tool or path, limits, last verification and its source. Pass this session\'s Canva tool schemas first; record live results with record.',
    { schemas: { description: 'Canva tool list with input schemas, or compact facts', anyOf: [{ type: 'array' }, { type: 'object' }] }, schemasFile: str('path to the same as JSON'), capability: str('one capability id, e.g. text.font-family'), record: { type: 'object', description: '{ capability, route, status, note, via, tool } from a live test' } },
  ),
  canva_inspect: S('Reads a Canva design from a read-design result: pages, sizes, elements, texts; maps them to the studio design, reports external changes since our last write and open transactions.', { readback: file('read-design result'), design: file('studio design'), designId: str('Canva design id') }, ['readback']),
  canva_build_design: S('Builds a studio design in Canva: a connector plan (idempotent: an identical earlier build is resumed, not duplicated), plus a native .pptx carrying fonts and coloured words.', { design: file('studio design'), route: { type: 'string', enum: ['auto', 'connector', 'native-file'] }, outDir: str('folder for files'), title: str('design title'), base: str('id of a cleared base design to copy instead of generating'), mode: { type: 'string', enum: ['native', 'partial'] } }, ['design']),
  canva_apply_patch: S('Applies edits ("كبّر العنوان", "غيّر الخط إلى تجوال", a patch list) to the studio design locally, then plans the matching edit-design operations on exactly those Canva elements; blocks on external changes; reports what the connector cannot do (e.g. font family) with alternatives.', { design: file('studio design'), commands: { type: 'array', items: { type: 'string' } }, patch: file('DesignPatch list'), readback: file('fresh read-design result with an open transaction'), force: { type: 'boolean' }, out: str('where to save the edited design'), brandId: str('brand kit id') }, ['design']),
  canva_import_editable: S('Writes the design as an editable .pptx (independent Arabic text with its font, separate images, native shapes) and imports it as a NEW Canva design: through the session connector when its import tool takes a file (e.g. design_file), through the Connect API when a token is configured and execute is true, otherwise returns the file and manual steps. A local file is never sent to a public-URL field.', { design: file('studio design'), outDir: str('folder'), execute: { type: 'boolean' }, route: { type: 'string', enum: ['auto', 'connector', 'connect-api'] }, title: str('title'), reel: file('reel plan, to write slide timings') }, ['design']),
  canva_build_reel: S('Turns a carousel or an idea into a 1080×1920 reel: hook first, short phone-readable scenes, big Arabic numbers/titles, varied compositions, durations from text length, closing scene; stores per-scene text, assets, elements, duration, motion and transition. Returns the reel design, plan, .pptx and connector plan.', { source: file('carousel studio design'), idea: file('{ hook, points[], cta }'), outDir: str('folder'), brandId: str('brand kit id'), numerals: { type: 'string', enum: ['arab', 'latn'] }, title: str('title') }),
  canva_apply_motion: S('Applies the reel plan\'s motion, transitions and durations where a route supports it; today the connector has no motion operation, so it returns that clearly with the manual steps per scene and speaker-notes calls.', { reel: file('reel plan'), designId: str('Canva design id') }, ['reel']),
  canva_preview: S('Preview call for a Canva design, limited to the affected pages.', { designId: str('Canva design id'), transactionId: str('open transaction'), pages: { type: 'array', items: { type: 'integer' } } }, ['designId']),
  canva_validate_arabic: S('Checks Arabic after a transfer, letter by letter (hamzas, marks, ة/ه, ى/ي, digits, punctuation, reversed words), presentation-form glyphs, direction marks, identity text rules, and Canva geometry (clipped, overlapping, margins, reel zones, grown text).', { design: file('studio design'), readback: file('read-design result'), brandId: str('brand kit id'), snapshot: { type: 'boolean', description: 'when passed, record this state as ours (for external-change checks)' } }, ['design', 'readback']),
  canva_export: S('Plans an export in a format get-export-formats lists for the design, and verifies a downloaded file (PNG size, PDF pages, MP4 size and duration against the reel plan, PPTX slides).', { designId: str('Canva design id'), format: { type: 'string', enum: ['png', 'jpg', 'pdf', 'mp4', 'gif', 'pptx'] }, formats: file('get-export-formats result'), quality: str('mp4 quality'), pages: { type: 'array', items: { type: 'integer' } }, file: str('downloaded file to verify'), expect: { type: 'object' }, reel: file('reel plan'), sceneCuts: { description: 'scene cut times in seconds from a detector (comma list or array); without them per-scene timing stays unverified', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'number' } }] } }),
  canva_record: S('Records what Canva returned (design ids and their relation, transactions, uploads, locators, errors, live capability results) in the journal, so retries resume instead of duplicating.', { design: file('studio design'), event: { type: 'string', enum: ['design', 'transaction', 'upload', 'locators', 'edit', 'op', 'error', 'evidence'] }, step: file('the edit-design step that was run (event edit)'), response: file('the edit-design result (event edit)'), designId: str(''), relation: { type: 'string', enum: ['created', 'copy', 'resize', 'import'] }, sourceDesignId: str(''), buildKey: str(''), transactionId: str(''), state: { type: 'string', enum: ['open', 'committed', 'cancelled', 'expired'] }, file: str(''), hash: str(''), mediaId: str(''), readback: file('read-design result'), tool: str(''), message: str(''), status: {}, capability: str(''), route: str(''), note: str(''), via: str(''), generation: { type: 'boolean' }, base: { type: 'boolean' }, url: str(''), title: str('') }, ['design', 'event']),
};
