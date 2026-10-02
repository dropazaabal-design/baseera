import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FsStore } from '../lib/studio/node/fsStore.js';
import { MemoryStore } from '../lib/studio/store.js';
import { buildDesign, openStudio } from '../lib/studio/studio.js';
import { plan } from '../lib/studio/router.js';
import { runCommand } from '../lib/studio/commands.js';
import { KITABWBS_PRESET } from '../lib/studio/memory.js';
import { findSecrets } from '../lib/studio/workflows.js';
import { CanvaAdapter, canvaCapabilities, editabilityFor, planCreate, verifyCanva } from '../lib/studio/adapters/canva.js';
import { utf8 } from '../lib/studio/util.js';

const STARTER = 'claude-plugin/skills/arabic-carousel/assets/starter';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));

function seed(studio) {
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const manifest = JSON.parse(fs.readFileSync(path.join(STARTER, 'manifest.json'), 'utf8'));
  const ids = {};
  for (const a of manifest.assets) ids[a.file] = studio.assets.add(new Uint8Array(fs.readFileSync(path.join(STARTER, a.file))), { tags: a.tags, provenance: manifest.provenance, name: a.file }).record.id;
  return ids;
}

const REQUEST = 'بوست مفرد لحساب كتاب وبس عن ست عادات تجعلك تقرأ أكثر';
const spec = (ids, art) => ({
  brief: 'ست عادات للقراءة',
  brandId: 'kitabwbs',
  intent: { mode: 'post', format: 'portrait', pages: 1 },
  pages: [
    {
      composition: 'post',
      variant: 'illustrated',
      content: {
        hook: 'ست عادات *تجعلك* تقرأ أكثر',
        points: ['اقرأ ١٠ صفحات قبل النوم', 'احمل كتابًا أينما ذهبت', 'دوّن فكرة من كل فصل', 'اختر كتبًا تحبها', 'انضم إلى نادي قراءة مثل @kitabwbs', 'أغلق الإشعارات ٢٥ دقيقة'],
        cta: 'احفظ المنشور',
        itemArt: [art ?? ids['hourglass.svg'], ids['books-stack.svg'], ids['notebook-pencil.svg'], ids['bookmark.svg'], ids['reading-club.svg'], ids['phone-focus.svg']],
      },
    },
  ],
});

const aiCalls = (studio, since) => studio.ledger.rows({ since }).filter((r) => r.kind.startsWith('ai.'));

test('first design uses AI and stores result and assets; the same request then comes from valid caches', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);

  const first = plan(REQUEST, { ...studio, brandId: 'kitabwbs' });
  assert.equal(first.route, 'new', 'empty library → new direction');
  assert.equal(first.copy.source, 'ai');
  assert.ok(first.expectedAiCalls['ai.copy'] === 1 && first.expectedAiCalls['ai.asset'] >= 1);

  // The assistant writes the copy and draws the hero; both are recorded.
  studio.ledger.record({ kind: 'ai.copy', tool: 'assistant' });
  const hero = studio.assets.add(utf8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10" fill="#1D4ED8" data-token="accent"/></svg>'), { tags: ['قراءة', 'reading'], provenance: { kind: 'generated', source: 'assistant SVG' }, prompt: 'hero' });
  studio.ledger.record({ kind: 'ai.asset', tool: 'assistant', note: hero.record.id });
  const built = buildDesign(studio, spec(ids, hero.record.id), { request: REQUEST, concepts: ['reading', 'habits'] });
  assert.equal(built.quality.passed, true, JSON.stringify(built.quality.issues));
  assert.equal(built.layoutCache, 'miss');
  assert.equal(studio.library.meta(built.doc.id).status, 'candidate');
  assert.ok(studio.assets.verify(hero.record.id).ok);

  const t = new Date().toISOString();
  const again = plan(REQUEST, { ...studio, brandId: 'kitabwbs' });
  assert.equal(again.copy.source, 'cache', 'identical request → cached copy');
  assert.deepEqual(again.copy.value.pages[0].content, spec(ids, hero.record.id).pages[0].content);
  const rebuilt = buildDesign(studio, spec(ids, hero.record.id), { request: REQUEST });
  assert.equal(rebuilt.reused, true, 'returns the stored design instead of a duplicate');
  assert.equal(rebuilt.doc.id, built.doc.id);
  assert.equal(studio.library.list().length, 1);
  assert.deepEqual(aiCalls(studio, t), [], 'no AI call on the repeat');
  const report = studio.ledger.report({ since: t });
  assert.ok(report.cache.hits >= 2);
  assert.equal(report.tokens, 'غير متاح', 'no invented token counts');
});

test('editing text locally generates no images; changing one drawing regenerates only that one', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  const { doc } = buildDesign(studio, spec(ids), {});
  const t = new Date().toISOString();
  const pageId = doc.pages[0].id;
  const edited = runCommand(doc, 'غيّر الخطاف إلى «سبع عادات للقراءة»', { pageId });
  assert.equal(edited.local, true);
  const before = doc.pages[0].elements.filter((e) => e.kind === 'image').map((e) => e.assetId);
  const after = edited.doc.pages[0].elements.filter((e) => e.kind === 'image').map((e) => e.assetId);
  assert.deepEqual(after, before);
  assert.deepEqual(aiCalls(studio, t), []);

  const fourth = runCommand(edited.doc, 'غيّر الرسم الرابع فقط', { pageId });
  assert.equal(fourth.needs, 'asset');
  assert.equal(fourth.target.elementId, 'point-4-art');
  // Recolouring needs no generation either: colours are theme tokens.
  const blue = runCommand(edited.doc, 'حوّل الخلفية إلى الأزرق من هويتي', { pageId, brand: KITABWBS_PRESET });
  assert.equal(blue.intent, 'theme');
  assert.deepEqual(blue.doc.pages[0].elements.filter((e) => e.kind === 'image').map((e) => e.assetId), before);
});

test('an idea the library does not cover is routed to new generation; "something new" forces it', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  buildDesign(studio, spec(ids), { concepts: ['reading', 'habits'] });
  const related = plan('بوست مفرد عن عادات القراءة اليومية', { ...studio, brandId: 'kitabwbs' });
  assert.notEqual(related.route, 'new', JSON.stringify(related.reasons));
  const other = plan('بوست مفرد عن الاستثمار والادخار والميزانية', { ...studio, brandId: 'kitabwbs' });
  assert.equal(other.route, 'new');
  const fresh = plan('بوست مفرد عن عادات القراءة، أريد شيئًا جديدًا', { ...studio, brandId: 'kitabwbs' });
  assert.equal(fresh.route, 'new');
  assert.ok(fresh.art.some((a) => a.source === 'ai'));
});

test('a corrupt or missing asset never yields a successful result', () => {
  const dir = tmp();
  const studio = openStudio(new FsStore(dir));
  const ids = seed(studio);
  const id = ids['bookmark.svg'];
  const record = studio.assets.get(id);
  fs.writeFileSync(path.join(dir, record.storageRef), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1"/>');
  assert.deepEqual([studio.assets.verify(id).ok, studio.assets.verify(id).code], [false, 'corrupt']);
  assert.throws(() => buildDesign(studio, spec(ids)), /hash mismatch/);
  fs.rmSync(path.join(dir, studio.assets.get(ids['hourglass.svg']).storageRef));
  assert.equal(studio.assets.verify(ids['hourglass.svg']).code, 'missing');
  // Cached layouts that point at an asset no longer embeddable are dropped.
  const s2 = openStudio(new MemoryStore());
  const ids2 = seed(s2);
  buildDesign(s2, spec(ids2));
  s2.assets.remove(ids2['phone-focus.svg']);
  assert.throws(() => buildDesign(s2, spec(ids2)), /not in the library/);
});

test('reference images (inspiration) cannot be placed in a design', () => {
  const studio = openStudio(new MemoryStore());
  const { record } = studio.assets.add(utf8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" width="5" height="5"/>'), { usage: 'reference', provenance: { kind: 'user_upload', source: 'competitor post' } });
  assert.throws(() => studio.assets.embed([record.id]), /reference/);
  assert.throws(() => studio.assets.add(utf8('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><script>alert(1)</script></svg>')), /script/);
});

test('memory and library persist across restarts of the CLI', () => {
  const home = tmp();
  const cli = (...args) => {
    const r = spawnSync(process.execPath, ['scripts/studio-cli.js', ...args, '--home', home], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  cli('brand', 'preset', 'kitabwbs');
  const rec = cli('memory', 'remember', 'text.density', 'short', '--brand', 'kitabwbs', '--evidence', 'قال: أفضّل نصًا قصيرًا لكتاب وبس');
  assert.equal(rec.origin, 'explicit_feedback');
  // A new process sees what the previous one stored.
  const profile = cli('memory', 'show');
  assert.ok(profile.preferences.some((p) => p.key === 'text.density' && p.value === 'short'));
  assert.ok(cli('brand', 'list').some((b) => b.id === 'kitabwbs'));
  const resolved = cli('memory', 'resolve', '--brand', 'other');
  assert.equal(resolved.applied['text.density'], undefined);
});

test('resuming a project restores its text, assets and notes', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  const project = studio.projects.create({ name: 'حملة القراءة', brief: 'سلسلة منشورات عن القراءة', brandId: 'kitabwbs' });
  const s = { ...spec(ids), projectId: project.id };
  const { doc } = buildDesign(studio, s);
  studio.projects.setCopy(project.id, { hook: s.pages[0].content.hook });
  studio.projects.addAssets(project.id, s.pages[0].content.itemArt);
  studio.projects.note(project.id, 'الخط صغير في البند الخامس', { designId: doc.id, elementIds: ['point-5'] });
  studio.projects.decide(project.id, 'نعتمد الأزرق الليلي لكل السلسلة');
  const r = studio.projects.resume(project.id, studio);
  assert.equal(r.designs[0].doc.pages[0].content.hook, s.pages[0].content.hook);
  assert.equal(r.assets.length, 6);
  assert.ok(r.assets.every((a) => a.ok));
  assert.equal(r.project.notes[0].elementIds[0], 'point-5');
  assert.equal(r.project.decisions.length, 1);
  assert.deepEqual(r.problems, []);
});

test('a saved workflow runs on new inputs without repeating the example, and refuses credentials', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  const { doc } = buildDesign(studio, spec(ids));
  const wf = studio.workflows.save(studio.workflows.fromDesign(doc, { name: 'بوست نقاط لكتاب وبس', fixed: { cta: 'احفظ المنشور' } }));
  const missing = studio.workflows.run(wf.id, {});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ['hook']);
  const run = studio.workflows.run(wf.id, { hook: 'ثلاث *روايات* لعطلتك', points: ['رواية قصيرة', 'رواية تاريخية', 'رواية خيال علمي'] });
  assert.equal(run.ok, true);
  const json = JSON.stringify(run.spec);
  for (const old of doc.pages[0].content.points) assert.ok(!json.includes(old), `example text leaked: ${old}`);
  assert.equal(run.spec.pages[0].content.cta, 'احفظ المنشور', 'fixed phrases stay');
  assert.deepEqual(run.assetSlots.map((a) => a.slot), ['itemArt.0', 'itemArt.1', 'itemArt.2'], 'tells which art the new items need');
  assert.equal(buildDesign(studio, { ...run.spec }, { save: false }).quality.passed, false, 'missing art blocks delivery');
  // Reuse step: library art for each new item (here, books for novels).
  run.spec.pages[0].content.itemArt = [ids['books-stack.svg'], ids['open-book.svg'], ids['lightbulb.svg']];
  const built = buildDesign(studio, { ...run.spec, brandId: 'kitabwbs' });
  assert.equal(built.quality.passed, true);
  assert.throws(() => studio.workflows.save({ ...wf, id: undefined, notes: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }), /credentials/);
  assert.deepEqual(findSecrets({ api_key: 'x', nested: { token: 'y' } }), ['api_key', 'nested.token']);
});

test('the Canva adapter declares the editability its capabilities allow', () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  const { doc } = buildDesign(studio, spec(ids));
  const all = ['create-design', 'resize-design', 'read-design', 'edit-design', 'create-upload-url', 'export-design'];
  const full = canvaCapabilities({ tools: all.map((t) => `mcp__Canva__${t}`) });
  assert.equal(full.setFontFamily, false, 'format_text has no font family');
  const native = editabilityFor(doc, full);
  assert.equal(native.editability, 'native');
  assert.ok(native.limitations.some((l) => l.includes('الخط')));
  const noShapes = editabilityFor(doc, canvaCapabilities({ tools: all, editOps: ['add_text', 'replace_text', 'insert_fill', 'position_element'] }));
  assert.equal(noShapes.editability, 'partial');
  const noUpload = editabilityFor(doc, canvaCapabilities({ tools: all.filter((t) => t !== 'create-upload-url') }));
  assert.equal(noUpload.editability, null, 'images cannot be delivered: says so instead of pretending');
  const imagesOnly = editabilityFor(doc, canvaCapabilities({ tools: all, editOps: ['insert_fill'] }));
  assert.equal(imagesOnly.editability, 'flattened');
});

test('Canva plan: exact page size, supported operations only, read-back verified letter by letter', async () => {
  const studio = openStudio(new MemoryStore());
  const ids = seed(studio);
  const { doc } = buildDesign(studio, spec(ids));
  const adapter = new CanvaAdapter({ tools: ['create-design', 'resize-design', 'read-design', 'edit-design', 'create-upload-url', 'export-design'] });
  const result = await adapter.create(doc, { assetFiles: Object.fromEntries(Object.keys(doc.assets).map((id) => [id, `${id}.svg`])) });
  const { plan: p } = result;
  assert.equal(result.saved, false, 'a plan is not a saved design');
  assert.equal(p.editability, 'native');
  const resize = p.steps.find((s) => s.tool === 'resize-design');
  assert.deepEqual(resize.args.design_type, { type: 'custom', width: 1080, height: 1350 });
  const ops = p.steps.filter((s) => s.tool === 'edit-design').flatMap((s) => s.args.operations ?? []);
  const allowed = new Set(['add_text', 'insert_shape', 'insert_fill', 'add_page']);
  assert.ok(ops.every((o) => allowed.has(o.type)), [...new Set(ops.map((o) => o.type))].join());
  assert.ok(ops.filter((o) => o.type === 'insert_shape').every((o) => /^[MmLlHhVvCcSsAaZz0-9,.+\-eE\s]+$/.test(o.path)));
  const texts = ops.filter((o) => o.type === 'add_text');
  assert.equal(texts.length, doc.pages[0].elements.filter((e) => e.kind === 'text' && !e.hidden).length);
  assert.ok(texts.every((o) => !o.text.includes('*')), 'accent markers are not sent');
  assert.ok(texts.every((o) => o.width > 0), 'fixed width: Canva re-anchors width-less text when its size changes');
  assert.ok(p.steps.at(-1).requiresApproval, 'commit only after the user approves');

  const sent = doc.pages[0].elements.filter((e) => e.kind === 'text' && !e.hidden);
  const readback = { pageCount: 1, pages: [{ index: 0, width: 1080, height: 1350, texts: sent.map((e) => ({ text: e.text.replace(/\*/g, '') })) }] };
  assert.equal(verifyCanva(doc, readback, p).passed, true);
  readback.pages[0].texts[0].text = readback.pages[0].texts[0].text.replace('عادات', 'عدااات');
  readback.pages[0].width = 1080;
  const broken = verifyCanva(doc, { ...readback, pages: [{ ...readback.pages[0], texts: [...readback.pages[0].texts.slice(1), { text: 'ست عادات تجعلك تقرا اكثر' }] }] }, p);
  assert.equal(broken.passed, false);
  assert.ok(broken.issues.some((i) => i.code.startsWith('readback.changed')));
  assert.equal(broken.delivery.saved, false);
});
