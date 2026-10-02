import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { MemoryStore } from '../lib/studio/store.js';
import { openStudio, buildDesign } from '../lib/studio/studio.js';
import { KITABWBS_PRESET } from '../lib/studio/memory.js';
import { plainText } from '../lib/studio/measure.js';
import { pageTheme, resolveColor } from '../lib/studio/theme.js';
import { utf8 } from '../lib/studio/util.js';
import { TOOLS } from '../lib/studio/canva/tools.js';
import { CanvaCapabilityRegistry, schemaFacts } from '../lib/studio/canva/registry.js';
import { CanvaJournal, classifyError } from '../lib/studio/canva/journal.js';
import { buildPptx, readPptxTexts, EMU_PER_PX } from '../lib/studio/canva/pptx.js';
import { unzip, zipStore } from '../lib/studio/canva/zip.js';
import { MOTION_EFFECTS, REEL_LIMITS } from '../lib/studio/canva/reel.js';
import { probeMp4 } from '../lib/studio/canva/media.js';
import { arcToCubics, parsePathToSubpaths, bounds } from '../lib/studio/canva/geometry.js';
import { svgToShapes } from '../lib/studio/canva/svgshapes.js';
import { ConnectClient } from '../lib/studio/canva/connect.js';
import { canvaAlign, canvaText } from '../lib/studio/adapters/canva.js';
import { detectDialect, normalizeToolName, translateStep } from '../lib/studio/canva/dialect.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/canva-schema-2026-10-02.json'), 'utf8'));
const STARTER = path.join(ROOT, 'claude-plugin/skills/arabic-carousel/assets/starter');

function memCtx(env = {}) {
  const store = new MemoryStore();
  const files = new Map();
  return {
    store,
    studio: openStudio(store),
    env,
    files,
    join: (...p) => p.join('/'),
    tmpDir: '/tmp',
    readJson: (p) => JSON.parse(new TextDecoder().decode(files.get(p))),
    readBytes: (p) => files.get(p),
    writeFile: (p, b) => files.set(p, typeof b === 'string' ? utf8(b) : b),
    sleep: async () => {},
    inflateRaw: zlib.inflateRawSync,
  };
}

// A three-page «كتاب وبس» carousel: Western digits, Arabic with a handle,
// one recolourable illustration.
function kitabwbsDesign(ctx) {
  const { studio } = ctx;
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const { record: art } = studio.assets.add(fs.readFileSync(path.join(STARTER, 'open-book.svg')), { tags: ['كتاب', 'قراءة'], provenance: { kind: 'generated', source: 'starter pack' } });
  const { doc, quality } = buildDesign(
    studio,
    {
      brandId: 'kitabwbs',
      brief: 'عادات القراءة',
      intent: { mode: 'carousel', format: 'portrait', pages: 3, platform: 'instagram' },
      pages: [
        { composition: 'hero', variant: 'art', keepArt: true, content: { kicker: 'دليل القارئ', title: '3 عادات *تضاعف* قراءتك', subtitle: 'خطوات صغيرة تصنع فرقًا كبيرًا.', art: art.id, artAlt: 'كتاب مفتوح' } },
        { composition: 'list', variant: 'cards', content: { title: 'ابدأ *بخطوات* صغيرة', items: ['اقرأ 10 صفحات قبل النوم', 'احمل كتابًا أينما ذهبت', 'دوّن فكرة من كل فصل'] } },
        { composition: 'outro', content: { title: 'هل كان المحتوى *مفيدًا*؟', subtitle: 'احفظه وتابع @kitabwbs لمزيد من الأفكار.', save: 'احفظه', follow: 'تابعنا', socials: ['@kitabwbs'] } },
      ],
    },
    { save: true },
  );
  return { doc, quality, art };
}

// What read-design returns for our document after a build (same shape as
// the live connector: textRegions with characters and formatting).
function readbackOf(doc, { designId = 'DAHWtest001', transactionId = 'tx1', edit } = {}) {
  return {
    transaction: { transaction_id: transactionId },
    page_metadata: doc.pages.map((p, i) => ({ id: `PB${i + 1}`, index: i + 1, dimensions: { width: p.widthPx, height: p.heightPx } })),
    design_content: {
      title: doc.brief,
      pages: doc.pages.map((p, i) => {
        const { colors } = pageTheme(doc, p);
        const els = [{ id: 'LBbg', type: 'shape', top: 0, left: 0, width: p.widthPx, height: p.heightPx, locator_id: `PB${i + 1}-LBbg` }];
        p.elements
          .filter((e) => !e.hidden)
          .sort((a, b) => a.z - b.z)
          .forEach((e, k) => {
            const base = { id: `LB${k}`, top: e.frame.y, left: e.frame.x, width: e.frame.width, height: e.frame.height, rotation: e.rotation ?? 0, opacity: e.opacity ?? 1, locator_id: `PB${i + 1}-LB${k}` };
            if (e.kind === 'text') els.push({ ...base, type: 'text', textRegions: [{ characters: canvaText(e.text), formatting: { fontSize: e.style.fontSize, color: resolveColor(e.style.color, colors).toUpperCase(), textAlign: canvaAlign(e), fontRef: 'X,0' } }] });
            else els.push({ ...base, type: e.kind === 'image' ? 'rect' : 'shape' });
          });
        const page = { type: 'fixed', id: `PB${i + 1}`, dimensions: { width: p.widthPx, height: p.heightPx }, elements: els, isEditable: true, locator_id: `PB${i + 1}` };
        return edit ? edit(page, i) : page;
      }),
    },
    design_id: designId,
  };
}

const loadedRegistry = (ctx) => TOOLS.canva_capabilities(ctx, { schemas: SCHEMA });

// ---------------------------------------------------------------------------
// 1. A multi-page Arabic carousel.

test('carousel: connector plan from the live schema, editable .pptx with RTL text, fonts and coloured words, and no duplicate on retry', async () => {
  const ctx = memCtx();
  const { doc, quality } = kitabwbsDesign(ctx);
  assert.equal(quality.passed, true, JSON.stringify(quality.issues.filter((i) => i.severity === 'error')));
  assert.equal(doc.theme.numerals, 'latn', 'the identity uses Western digits');

  // Without this session's schemas, no plan is invented.
  const blind = await TOOLS.canva_build_design(ctx, { design: doc, outDir: '/out' });
  assert.equal(blind.status, 'needs-input');

  await loadedRegistry(ctx);
  const r = await TOOLS.canva_build_design(ctx, { design: doc, outDir: '/out' });
  assert.equal(r.status, 'planned');
  assert.equal(r.editability, 'native');
  assert.equal(r.generation.expected, 1, 'create-design is counted as one generation');
  const tools = r.steps.map((s) => s.tool ?? s.action);
  assert.ok(tools.includes('resize-design') && tools.includes('read-design'));
  assert.equal(r.steps.filter((s) => s.tool === 'edit-design' && s.args.operations?.some((o) => o.type === 'add_page')).length, 2, 'two added pages');
  const commit = r.steps.find((s) => s.args?.finalize === 'commit');
  assert.equal(commit.requiresApproval, true, 'saving waits for the creator');
  assert.ok(r.limitations.some((l) => /الخط/.test(l)), 'states that the connector cannot set the font');

  // The native file carries what the connector cannot.
  const pptx = buildPptx(doc);
  const files = unzip(pptx.bytes);
  const pres = new TextDecoder().decode(files.get('ppt/presentation.xml'));
  assert.match(pres, new RegExp(`cx="${1080 * EMU_PER_PX}" cy="${1350 * EMU_PER_PX}"`));
  const slides = readPptxTexts(files);
  assert.equal(slides.length, 3);
  for (const [i, page] of doc.pages.entries()) {
    for (const el of page.elements.filter((e) => e.kind === 'text' && !e.hidden)) {
      const found = slides[i].texts.find((t) => t.name === el.id);
      assert.ok(found, `${el.id} on slide ${i + 1}`);
      assert.equal(found.text, canvaText(el.text), 'text kept letter by letter (handles in Arabic carry their LRM)');
      assert.equal(found.rtl, el.style.direction !== 'ltr');
    }
  }
  const slide1 = new TextDecoder().decode(files.get('ppt/slides/slide1.xml'));
  assert.match(slide1, /<a:cs typeface="Cairo"\/>/);
  assert.match(slide1, /<a:cs typeface="Tajawal"\/>/);
  const accent = doc.theme.colors.accent.slice(1).toUpperCase();
  assert.match(slide1, new RegExp(`<a:srgbClr val="${accent}"/></a:solidFill><a:latin typeface="Cairo"/><a:ea typeface="Cairo"/><a:cs typeface="Cairo"/></a:rPr><a:t>تضاعف</a:t>`), 'the starred word is its own accent-coloured run');
  assert.equal(pptx.report.native.vectorGroup, 1, 'the illustration is native vector shapes, not a picture');
  assert.match(slide1, /<p:grpSp>/);

  // Retry after the design was created: resume, never a second design.
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DAHWtest001', relation: 'resize', sourceDesignId: 'DAHWsrc0001', buildKey: r.buildKey });
  const again = await TOOLS.canva_build_design(ctx, { design: doc, outDir: '/out' });
  assert.equal(again.status, 'resume');
  assert.equal(again.designId, 'DAHWtest001');
});

// ---------------------------------------------------------------------------
// 2. Bigger title and another font, without regenerating any image.

test('edit: a bigger title maps to one format_text; a font change is local, the connector part is reported with its alternatives; no image is touched', async () => {
  const ctx = memCtx();
  const { doc, art } = kitabwbsDesign(ctx);
  await loadedRegistry(ctx);
  ctx.files.set('/d.json', utf8(JSON.stringify(doc)));
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DAHWtest001', relation: 'created' });
  await TOOLS.canva_record(ctx, { design: doc, event: 'locators', readback: readbackOf(doc) });
  const aiBefore = ctx.studio.ledger.report().aiCalls;

  const r = await TOOLS.canva_apply_patch(ctx, { design: '/d.json', commands: ['كبّر العنوان', 'غيّر خط العنوان إلى تجوال'], readback: readbackOf(doc) });
  assert.equal(r.status, 'planned', JSON.stringify(r));
  assert.deepEqual(r.applied.map((a) => a.intent), ['resize_text', 'font']);
  const ops = r.calls.flatMap((c) => c.args.operations);
  const title = doc.pages[0].elements.find((e) => e.id === 'title');
  const titleLoc = new CanvaJournal(ctx.store, doc.id).locator(doc.pages[0].id, 'title');
  const fmt = ops.find((o) => o.type === 'format_text' && o.locator_id === titleLoc && o.formatting.font_size);
  assert.ok(fmt, 'a format_text with the new size on the title element');
  assert.ok(ops.filter((o) => o.locator_id === titleLoc).every((o) => o.type === 'format_text' || o.type === 'position_element' || o.type === 'resize_element'), 'only format/position/size on the title');
  assert.ok(fmt.formatting.font_size > title.style.fontSize, 'bigger');
  assert.equal(r.calls[0].args.page_index, 1);
  assert.ok(!ops.some((o) => ['insert_fill', 'update_fill'].includes(o.type)), 'no image operation');
  assert.equal(r.generation.expected, 0);
  assert.ok(r.unsupported.some((u) => /Tajawal/.test(u.what) && u.alternatives.some((a) => a.route === 'manual')), 'font family: unsupported in the connector, with the manual and native-file routes');
  assert.deepEqual(r.preview.calls[0].args.filter.thumbnail_pages, r.calls.map((c) => c.args.page_index).filter((v, i, a) => a.indexOf(v) === i), 'preview only the affected pages');

  const edited = JSON.parse(new TextDecoder().decode(ctx.files.get('/d.json')));
  assert.equal(edited.theme.fonts.heading, 'tajawal');
  assert.deepEqual(Object.keys(edited.assets), [art.id], 'same asset, nothing regenerated');
  assert.equal(edited.assets[art.id].contentHash, art.contentHash);
  assert.equal(ctx.studio.ledger.report().aiCalls, aiBefore, 'no AI call');
  // The native file of the edited design carries the new font.
  const slide = new TextDecoder().decode(unzip(buildPptx(edited).bytes).get('ppt/slides/slide1.xml'));
  assert.match(slide, /<p:cNvPr id="\d+" name="title"[\s\S]*?<a:cs typeface="Tajawal"\/>/);
});

// ---------------------------------------------------------------------------
// 3. Carousel → reel.

test('reel: hook first, 1080×1920 scenes, timed by text, whole-element motion, and an honest status at every step', async () => {
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  await loadedRegistry(ctx);
  const r = await TOOLS.canva_build_reel(ctx, { source: doc, outDir: '/reel', brandId: 'kitabwbs' });
  assert.equal(r.status, 'planned');
  const plan = JSON.parse(new TextDecoder().decode(ctx.files.get(r.files.plan)));
  const reelDoc = JSON.parse(new TextDecoder().decode(ctx.files.get(r.files.design)));
  assert.ok(reelDoc.pages.every((p) => p.widthPx === 1080 && p.heightPx === 1920));
  assert.equal(plan.scenes[0].role, 'hook');
  assert.ok(plain(plan.scenes[0].content.title).split(/\s+/).length <= REEL_LIMITS.hookWords);
  assert.equal(plan.scenes.at(-1).role, 'cta');
  assert.ok(plan.scenes.every((s) => s.seconds >= 1.8 && s.seconds <= REEL_LIMITS.maxScene));
  assert.equal(Math.round(plan.scenes.reduce((a, s) => a + s.seconds, 0) * 10) / 10, plan.totalSeconds);
  assert.ok(plan.scenes[0].motion.some((m) => m.at === 0), 'the hook is on screen from the first frame');
  for (const s of plan.scenes) for (const m of s.motion) {
    assert.ok(MOTION_EFFECTS.includes(m.effect));
    assert.ok(m.elementId, 'motion targets a whole element');
  }
  const kinds = plan.scenes.map((s) => `${s.composition}:${s.variant}`);
  assert.ok(kinds.every((k, i) => i < 2 || !(k === kinds[i - 1] && k === kinds[i - 2])), 'no three identical compositions in a row');
  assert.equal(r.quality.passed, true, JSON.stringify(r.quality.issues));
  assert.deepEqual(Object.fromEntries(Object.entries(r.progress).map(([k, v]) => [k, v.state])), { scenes: 'created-locally', file: 'not-exported', size: 'unverified', totalDuration: 'unverified', sceneTiming: 'unverified', motion: 'not-applied', transitions: 'not-applied', audio: 'none', video: 'not-exported' });
  assert.ok(r.connector.steps.some((s) => s.args?.operations?.some((o) => o.type === 'replace_speaker_notes')), 'the scene plan goes in the page notes');
  const slide = new TextDecoder().decode(unzip(ctx.files.get(r.files.pptx)).get('ppt/slides/slide1.xml'));
  assert.match(slide, new RegExp(`advTm="${Math.round(plan.scenes[0].seconds * 1000)}"`));

  // Motion: the connector has no operation for it — said plainly.
  const m = await TOOLS.canva_apply_motion(ctx, { reel: plan });
  assert.equal(m.ok, false);
  assert.equal(m.status, 'unsupported');
  assert.equal(m.manualSteps.length, plan.scenes.length);
  assert.ok(m.alternatives.find((a) => a.route === 'speaker-notes').calls.length === plan.scenes.length);
  assert.equal(plan.numerals, 'latn');
  assert.ok(m.manualSteps.every((t) => !/[٠-٩]/.test(t)), 'the brand\'s Western digits carry into the notes');

  // A downloaded video is measured, not trusted.
  const defaultLength = mp4({ seconds: plan.scenes.length * 5, width: 1080, height: 1920 });
  ctx.files.set('/v1.mp4', defaultLength);
  const v1 = await TOOLS.canva_export(ctx, { file: '/v1.mp4', reel: plan });
  assert.equal(v1.status, 'verified');
  assert.equal(v1.reel.totalDuration.state, 'mismatch');
  assert.match(v1.reel.totalDuration.note, /الافتراضية/, 'pages at Canva\'s default length: timing was not applied');
  assert.equal(v1.reel.sceneTiming.state, 'mismatch');
  ctx.files.set('/v2.mp4', mp4({ seconds: plan.totalSeconds, width: 1080, height: 1920 }));
  const v2 = await TOOLS.canva_export(ctx, { file: '/v2.mp4', reel: plan });
  assert.equal(v2.reel.totalDuration.state, 'verified');
  assert.equal(v2.reel.size.state, 'verified');
  assert.equal(v2.reel.video.state, 'exported-verified');
  // The total matching says nothing about how it is split between scenes.
  assert.equal(v2.reel.sceneTiming.state, 'unverified');
  assert.match(v2.reel.sceneTiming.reason, /حدود المشاهد/);
  assert.equal(v2.reel.audio.state, 'absent-in-file');

  // Same total, scenes split differently (cuts detected in the file): the
  // total passes, scene timing does not.
  const ends = [];
  let t = 0;
  for (const s of plan.scenes) ends.push(Math.round((t += s.seconds) * 100) / 100);
  const shifted = ends.slice(0, -1).map((e, i) => (i === 0 ? e + 1.2 : e));
  const v4 = await TOOLS.canva_export(ctx, { file: '/v2.mp4', reel: plan, sceneCuts: shifted });
  assert.equal(v4.reel.totalDuration.state, 'verified');
  assert.equal(v4.reel.sceneTiming.state, 'mismatch');
  assert.deepEqual(v4.reel.sceneTiming.scenes.filter((x) => !x.ok).map((x) => x.n), [1, 2]);
  // Cuts where the plan puts them: verified, scene by scene.
  const v5 = await TOOLS.canva_export(ctx, { file: '/v2.mp4', reel: plan, sceneCuts: ends.slice(0, -1).join(',') });
  assert.equal(v5.reel.sceneTiming.state, 'verified');
  assert.ok(v5.reel.sceneTiming.scenes.every((x) => x.ok));
  // A detector that found nothing proves nothing.
  const v6 = await TOOLS.canva_export({ ...ctx, detectSceneCuts: () => ({ cuts: [], source: 'test' }) }, { file: '/v2.mp4', reel: plan });
  assert.equal(v6.reel.sceneTiming.state, 'unverified');
  ctx.files.set('/v3.mp4', mp4({ seconds: plan.totalSeconds, width: 1080, height: 1350 }));
  const v3 = await TOOLS.canva_export(ctx, { file: '/v3.mp4', reel: plan });
  assert.equal(v3.status, 'failed');
});

const plain = (t) => String(t).replace(/\*/g, '');

// Minimal MP4: ftyp + moov(mvhd + trak(tkhd + mdia(hdlr vide))).
function mp4({ seconds, width, height }) {
  const box = (type, ...parts) => {
    const body = Buffer.concat(parts);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(width * 65536, 76);
  tkhd.writeUInt32BE(height * 65536, 80);
  const hdlr = Buffer.alloc(24);
  hdlr.write('vide', 8, 'latin1');
  return new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('mdia', box('hdlr', hdlr))))]));
}

// ---------------------------------------------------------------------------
// 4. Mixed Arabic, numbers and a Latin handle through a transfer.

test('transfer: mixed Arabic, digits and a handle survive letter by letter; each kind of corruption is named', async () => {
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  const title = doc.pages[0].elements.find((e) => e.id === 'title');
  const handleText = doc.pages[2].elements.find((e) => e.kind === 'text' && /@kitabwbs/.test(e.text) && e.slot === 'subtitle');
  assert.ok(handleText);

  // The .pptx keeps every character, digits and handle included.
  const back = readPptxTexts(unzip(buildPptx(doc).bytes));
  assert.equal(back[2].texts.find((t) => t.name === handleText.id).text, canvaText(handleText.text));

  const exact = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: readbackOf(doc) });
  assert.equal(exact.status, 'passed', JSON.stringify(exact.issues));
  assert.ok(exact.texts.compared >= 10 && exact.texts.exact === exact.texts.compared);

  const corrupt = (from, to) => readbackOf(doc, { edit: (page, i) => (i === 0 || i === 2 ? { ...page, elements: page.elements.map((e) => (e.textRegions ? { ...e, textRegions: [{ ...e.textRegions[0], characters: e.textRegions[0].characters.replace(from, to) }] } : e)) } : page) });
  const cases = [
    ['3 عادات', '7 عادات', 'text.changed-number'],
    ['3 عادات', '٣ عادات', 'text.changed-digit-system'],
    ['قراءتك', 'كتءارق', 'text.reversed-word'],
    ['الأفكار', 'الافكار', 'text.changed-hamza'],
    ['مفيدًا؟', 'مفيدًا?', 'text.changed-punctuation'],
  ];
  for (const [from, to, code] of cases) {
    const r = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: corrupt(from, to) });
    assert.equal(r.status, 'failed', `${from} → ${to}`);
    assert.ok(r.issues.some((i) => i.code === code), `${code} for ${from} → ${to}: ${JSON.stringify(r.issues.map((i) => i.code))}`);
  }
  // Canva's font made the title grow into the next element.
  const grown = readbackOf(doc, { edit: (page, i) => (i === 0 ? { ...page, elements: page.elements.map((e) => (e.textRegions?.[0].characters === plainText(title.text) ? { ...e, height: e.height * 2.2 } : e)) } : page) });
  const g = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: grown });
  assert.ok(g.issues.some((i) => i.code === 'text.grew'));
  assert.ok(g.issues.some((i) => i.code === 'layout.overlap'));

  // A Latin-only label on an Arabic page: Canva aligns it by its own (LTR)
  // direction, so "start" lands on the left. Caught, with its repair.
  const handle = doc.pages[0].elements.find((e) => e.id === 'sys-brand-handle');
  assert.equal(canvaAlign(handle), 'end', '@kitabwbs alone needs "end" to sit on the right in Canva');
  const leftHandle = readbackOf(doc, { edit: (page, i) => (i === 0 ? { ...page, elements: page.elements.map((e) => (e.textRegions?.[0].characters === '@kitabwbs' ? { ...e, textRegions: [{ ...e.textRegions[0], formatting: { ...e.textRegions[0].formatting, textAlign: 'start' } }] } : e)) } : page) });
  const al = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: leftHandle });
  assert.ok(al.issues.some((i) => i.code === 'format.align' && i.elementId === 'sys-brand-handle'));
  assert.deepEqual(al.repair[0].args.operations[0].formatting, { text_align: 'end' });
  assert.equal(al.repair[0].args.page_index, 1);
  // Canva takes the direction from the first letter or digit, so an Arabic
  // title that opens with a number is LTR there too (seen live).
  const rtl = { style: { align: 'start' } };
  assert.equal(canvaAlign({ ...rtl, text: '3 عادات *تضاعف* قراءتك' }), 'end');
  assert.equal(canvaAlign({ ...rtl, text: 'خطوات صغيرة في 30 يومًا.' }), 'start');
  assert.equal(canvaAlign({ ...rtl, text: '«اقرأ» كل يوم' }), 'start', 'leading punctuation does not decide');
  assert.equal(canvaAlign({ ...rtl, text: '— …' }), 'start', 'no letter or digit: keep the design edge');

  // Identity text rules: the handle is allowed, another English word is not.
  const english = readbackOf(doc, { edit: (page, i) => (i === 2 ? { ...page, elements: page.elements.map((e) => (e.textRegions?.[0].characters.includes('@kitabwbs لمزيد') ? { ...e, textRegions: [{ ...e.textRegions[0], characters: e.textRegions[0].characters.replace('لمزيد', 'More') }] } : e)) } : page) });
  const en = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: english, brandId: 'kitabwbs' });
  const brandIssue = en.issues.find((i) => i.code === 'brand.no-latin-words');
  assert.ok(brandIssue && /More/.test(brandIssue.message) && !/kitabwbs،/.test(brandIssue.message));

  // A handle inside Arabic text without its left-to-right mark shows as
  // "kitabwbs@" in Canva (seen live): an error with its repair. The mark we
  // place is not reported as a stray direction mark.
  const inArabic = doc.pages.flatMap((p) => p.elements).find((e) => e.kind === 'text' && /[\u0600-\u06FF].*@kitabwbs|@kitabwbs.*[\u0600-\u06FF]/.test(e.text));
  assert.ok(inArabic && canvaText(inArabic.text).includes('\u200E@kitabwbs'), 'the plan sends the mark');
  const ok = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: readbackOf(doc), brandId: 'kitabwbs' });
  assert.ok(!ok.issues.some((i) => i.code === 'text.bidi-marks' || i.code === 'text.handle-order'), JSON.stringify(ok.issues));
  const flipped = readbackOf(doc, { edit: (page) => ({ ...page, elements: page.elements.map((e) => (e.textRegions ? { ...e, textRegions: [{ ...e.textRegions[0], characters: e.textRegions[0].characters.replace(/\u200E/g, '') }] } : e)) }) });
  const fl = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: flipped, brandId: 'kitabwbs' });
  const order = fl.issues.filter((i) => i.code === 'text.handle-order');
  assert.ok(order.length >= 1 && /kitabwbs@/.test(order[0].message));
  assert.ok(fl.repair.some((b) => b.args.operations.some((o) => o.type === 'find_and_replace_text' && o.find_text === '@kitabwbs' && o.replace_text === '\u200E@kitabwbs')));
  assert.equal(canvaText('@kitabwbs'), '@kitabwbs', 'a handle on its own is left-to-right already');
  assert.equal(canvaText('راسلنا a@b.com'), 'راسلنا a@b.com', 'an email is not a handle');
});

// ---------------------------------------------------------------------------
// 5. Unsupported capability, partial failure, external change.

test('registry: statuses come from the session schema and dated evidence; a changed schema makes old evidence stale', () => {
  const reg = new CanvaCapabilityRegistry();
  assert.equal(reg.entry('text.add', 'connector').status, 'unverified', 'no schema read in this session: nothing is assumed');
  assert.equal(reg.entry('text.add', 'connector').lastKnown.status, 'supported', 'the last live result is still shown');
  reg.loadSchemas(SCHEMA, { at: '2026-10-02T10:00:00Z' });
  assert.equal(reg.entry('text.add', 'connector').status, 'supported');
  assert.equal(reg.entry('text.font-family', 'connector').status, 'unsupported');
  assert.ok(reg.entry('text.font-family', 'connector').alternatives.some((a) => a.route === 'native-file'));
  assert.equal(reg.entry('motion.animate', 'connector').status, 'unsupported');
  assert.equal(reg.entry('motion.animate', 'native-file').status, 'unsupported', 'Canva does not import animations');
  assert.equal(reg.entry('video.insert', 'connector').status, 'supported');
  // Importing a design is read from the import tool, not from media upload:
  // Claude's import-design-from-url takes a public URL only and excludes
  // generated files, so our .pptx cannot go through it.
  const imp = reg.entry('import.native-file', 'connector');
  assert.equal(imp.status, 'unsupported');
  assert.equal(imp.verified.source, 'schema');
  assert.equal(imp.inputType, 'public-url');
  const media = reg.entry('media.upload', 'connector');
  assert.equal(media.status, 'supported');
  assert.equal(media.verified.source, 'live');
  assert.match(media.verified.note, /PPTX/);
  assert.equal(reg.entry('page.delete', 'connector').approval, 'explicit-before-call');
  assert.equal(reg.entry('design.size', 'connector').target, 'new-design', 'a resize is a new design');

  // Names only: tools exist but operations are unverified, never assumed.
  const namesOnly = new CanvaCapabilityRegistry();
  namesOnly.loadSchemas(SCHEMA.tools);
  assert.equal(namesOnly.entry('text.add', 'connector').status, 'unverified');

  // Tomorrow's schema adds an animation operation and a new upload kind.
  const next = { ...SCHEMA, editOps: [...SCHEMA.editOps, 'animate_element'], uploadKinds: [...SCHEMA.uploadKinds, 'pptx'] };
  const changed = reg.loadSchemas(next);
  assert.ok(changed.changed.includes('edit-design') && changed.changed.includes('create-upload-url'));
  assert.equal(reg.entry('motion.animate', 'connector').status, 'supported');
  const stale = reg.entry('media.upload', 'connector');
  assert.ok(stale.stale?.length, 'the live PPTX rejection must be re-tested');
  assert.equal(stale.status, 'supported', 'back to what the new schema says, with the old test listed as stale');
  assert.equal(schemaFacts(next).fingerprints['edit-design'] !== schemaFacts(SCHEMA).fingerprints['edit-design'], true);
});

test('failures: classified with the safe next step; an expired transaction is closed; quota stops instead of switching route', async () => {
  assert.equal(classifyError('Insufficient credits for this action').code, 'quota');
  assert.equal(classifyError('Insufficient credits for this action').action, 'stop');
  assert.equal(classifyError({ message: 'Too Many Requests', status: 429 }).code, 'rate-limit');
  assert.equal(classifyError('fetch failed: ECONNRESET').action, 'retry');
  assert.equal(classifyError('The upload URL has expired').code, 'expired-link');
  assert.equal(classifyError('Transaction not found').code, 'transaction-gone');
  assert.equal(classifyError('User declined the changes').code, 'approval-denied');

  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DAHWtest001', relation: 'created' });
  await TOOLS.canva_record(ctx, { design: doc, event: 'transaction', designId: 'DAHWtest001', transactionId: 'tx9', state: 'open' });
  const j = new CanvaJournal(ctx.store, doc.id);
  assert.equal(j.openTransactions().length, 1);
  const e = await TOOLS.canva_record(ctx, { design: doc, event: 'error', tool: 'edit-design', message: 'Transaction not found', transactionId: 'tx9' });
  assert.equal(e.errorClass.code, 'transaction-gone');
  assert.equal(new CanvaJournal(ctx.store, doc.id).openTransactions().length, 0, 'no transaction left hanging');

  // Partial failure: one batch applied, the next failed; only the failed
  // operations are re-planned, nothing is created again.
  await TOOLS.canva_record(ctx, { design: doc, event: 'op', tool: 'edit-design', result: { applied: 20 } });
  await TOOLS.canva_record(ctx, { design: doc, event: 'op', tool: 'edit-design', error: 'fetch failed' });
  const summary = new CanvaJournal(ctx.store, doc.id).summary();
  assert.equal(summary.failed, 2, 'the expired transaction and the network error');
  assert.equal(summary.designs.length, 1);
  assert.equal(summary.generationCalls, 1, 'create-design counted once');
});

test('external change: edits made in Canva since our last write block the patch until the creator agrees', async () => {
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  await loadedRegistry(ctx);
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DAHWtest001', relation: 'created' });
  await TOOLS.canva_record(ctx, { design: doc, event: 'locators', readback: readbackOf(doc) });
  const title = plainText(doc.pages[0].elements.find((e) => e.id === 'title').text);
  const edited = readbackOf(doc, { edit: (page, i) => (i === 0 ? { ...page, elements: page.elements.map((e) => (e.textRegions?.[0].characters === title ? { ...e, textRegions: [{ ...e.textRegions[0], characters: 'عنوان كتبه المستخدم في Canva' }] } : e)) } : page) });

  const inspect = await TOOLS.canva_inspect(ctx, { readback: edited, design: doc });
  assert.equal(inspect.status, 'blocked');
  assert.equal(inspect.externalChanges.changed.length, 1);

  const blocked = await TOOLS.canva_apply_patch(ctx, { design: doc, commands: ['كبّر العنوان'], readback: edited });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.code, 'external-change');
  const forced = await TOOLS.canva_apply_patch(ctx, { design: doc, commands: ['كبّر العنوان'], readback: edited, force: true });
  assert.equal(forced.status, 'planned');
});

// ---------------------------------------------------------------------------
// Pieces.

test('geometry: arcs become cubics on the circle; SVG illustrations become recoloured native shapes', () => {
  const segs = arcToCubics([0, 50], 50, 50, 0, 0, 1, [100, 50]);
  for (const s of segs) assert.ok(Math.abs(Math.hypot(s.to[0] - 50, s.to[1] - 50) - 50) < 1e-6);
  const b = bounds(parsePathToSubpaths('M0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z'));
  assert.ok(Math.abs(b.width - 100) < 0.01 && Math.abs(b.height - 100) < 0.01);
  assert.equal(parsePathToSubpaths('M10 10q10-10 20 0t20 0').length, 1);
  const svg = fs.readFileSync(path.join(STARTER, 'notebook-pencil.svg'), 'utf8');
  const { shapes } = svgToShapes(svg, { x: 100, y: 100, width: 480, height: 480 }, { colors: { accent: '#123456', text: '#ABCDEF', bg: '#000000', muted: '#777777', surface: '#222222', onAccent: '#FFFFFF' } });
  assert.ok(shapes.length >= 5);
  assert.ok(shapes.some((s) => s.fill?.color === '#123456'), 'data-token="accent" takes the theme accent');
  assert.ok(shapes.every((s) => s.bounds.x >= 99 && s.bounds.x + s.bounds.width <= 581));
});

test('zip and media probes read what they write', () => {
  const z = zipStore([{ name: 'a.txt', data: 'سلام' }, { name: 'b/c.bin', data: new Uint8Array([1, 2, 3]) }]);
  const back = unzip(z);
  assert.equal(new TextDecoder().decode(back.get('a.txt')), 'سلام');
  assert.deepEqual([...back.get('b/c.bin')], [1, 2, 3]);
  const v = probeMp4(mp4({ seconds: 12.5, width: 1080, height: 1920 }));
  assert.deepEqual([v.duration, v.width, v.height, v.hasAudio], [12.5, 1080, 1920, false]);
});

test('Connect API: import polls to a new design, rate limits wait once, the token never leaks into errors', async () => {
  const calls = [];
  let polls = 0;
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const json = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k] }, text: async () => JSON.stringify(body) });
    if (url.endsWith('/imports') && calls.filter((c) => c.url.endsWith('/imports')).length === 1) return json(429, { code: 'too_many_requests' }, { 'retry-after': '0' });
    if (url.endsWith('/imports')) return json(200, { job: { id: 'J1', status: 'in_progress' } });
    if (url.endsWith('/imports/J1')) return json(200, { job: { id: 'J1', status: ++polls < 3 ? 'in_progress' : 'success', result: { designs: [{ id: 'DAHWimported', title: 'x' }] } } });
    if (url.endsWith('/exports')) return json(403, { code: 'permission_denied', message: 'missing scope' });
    return json(404, {});
  };
  const client = new ConnectClient({ token: 'secret-token-123', fetch, sleep: async () => {} });
  const designs = await client.importDesign(new Uint8Array([1]), { title: 'عنوان' });
  assert.equal(designs[0].id, 'DAHWimported');
  const meta = JSON.parse(calls[1].init.headers['Import-Metadata']);
  assert.equal(Buffer.from(meta.title_base64, 'base64').toString(), 'عنوان');
  await assert.rejects(client.exportDesign('DAHWimported', { type: 'mp4' }), (err) => err.class.code === 'auth' && !String(err.message).includes('secret-token-123') && !JSON.stringify(err).includes('secret-token-123'));
  assert.ok(!JSON.stringify(client).includes('secret-token-123'));

  // The tool without a token: a file and the honest next step, no import.
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  const r = await TOOLS.canva_import_editable(ctx, { design: doc, outDir: '/imp', execute: true });
  assert.equal(r.status, 'needs-input');
  assert.ok(ctx.files.has(r.file));
  const withToken = memCtx({ CANVA_ACCESS_TOKEN: 't' });
  const d2 = kitabwbsDesign(withToken).doc;
  let n = 0;
  withToken.fetch = async (url) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(url.endsWith('/imports') ? { job: { id: 'J2', status: 'in_progress' } } : { job: { id: 'J2', status: ++n > 1 ? 'success' : 'in_progress', result: { designs: [{ id: 'DAHWnew0001' }] } } }) });
  await TOOLS.canva_record(withToken, { design: d2, event: 'design', designId: 'DAHWsrc0001', relation: 'created' });
  const done = await TOOLS.canva_import_editable(withToken, { design: d2, outDir: '/imp', execute: true });
  assert.equal(done.status, 'done');
  assert.equal(done.newDesignId, 'DAHWnew0001');
  assert.equal(done.sourceDesignId, 'DAHWsrc0001', 'the original is reported, not claimed as edited');
});

test('MCP server: lists the eleven tools and answers a call over stdio', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'baseera-mcp-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/canva-mcp.js')], { env: { ...process.env, BASEERA_HOME: home }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      lines.push(JSON.parse(buffer.slice(0, i)));
      buffer = buffer.slice(i + 1);
    }
  });
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  const waitFor = async (id) => {
    for (let t = 0; t < 200; t++) {
      const found = lines.find((l) => l.id === id);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`no reply ${id}`);
  };
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal((await waitFor(1)).result.serverInfo.name, 'baseera-canva');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = (await waitFor(2)).result.tools.map((t) => t.name);
  assert.equal(list.length, 11);
  assert.ok(['canva_capabilities', 'canva_inspect', 'canva_build_design', 'canva_apply_patch', 'canva_import_editable', 'canva_build_reel', 'canva_apply_motion', 'canva_preview', 'canva_validate_arabic', 'canva_export'].every((n) => list.includes(n)));
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'canva_capabilities', arguments: { schemas: SCHEMA, capability: 'text.font-family' } } });
  const res = (await waitFor(3)).result;
  assert.equal(res.structuredContent.capability.routes.connector.status, 'unsupported');
  child.kill();
  fs.rmSync(home, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 6. Two connector dialects (Claude's, and a host with separate transaction
//    tools on element_id), MCP/underscore names, and importing a design file.

const CLAUDE_TOOLS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/canva-tools-claude-2026-10-02.json'), 'utf8')).tools;
const ALT_TOOLS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/canva-tools-alt-synthetic.json'), 'utf8')).tools;
// The same Claude tools, listed by another host with "_" and a lower-case prefix.
const UNDERSCORED = CLAUDE_TOOLS.map((t) => ({ ...t, name: t.name.replace('mcp__Canva__', 'mcp__canva__').replace(/-/g, '_') }));
// Element ids as a host that names them element_id reports them.
const asElementIds = (rb) => JSON.parse(JSON.stringify(rb).replace(/"locator_id"/g, '"element_id"'));

test('dialects: tool names are normalised, roles and fields come from each schema, and the registry finds format, resize and preview wherever they are', async () => {
  assert.equal(normalizeToolName('mcp__Canva__edit-design'), 'edit-design');
  assert.equal(normalizeToolName('mcp__claude_ai_Canva__read-design'), 'read-design');
  assert.equal(normalizeToolName('canva_perform_editing_operations'), 'perform-editing-operations');
  assert.equal(normalizeToolName('mcp__canva__edit_design'), 'edit-design');

  const claude = detectDialect(CLAUDE_TOOLS);
  assert.equal(claude.id, 'edit-design');
  assert.equal(claude.edit.ops.format_text.ref, 'locator_id');
  assert.deepEqual([claude.commit.inline, claude.commit.value], [true, 'commit']);
  assert.equal(claude.open.flag, 'open_transaction');
  const under = detectDialect(UNDERSCORED);
  assert.equal(under.id, 'edit-design');
  assert.equal(under.edit.tool, 'mcp__canva__edit_design', 'calls keep the name the host lists');

  const alt = detectDialect(ALT_TOOLS);
  assert.equal(alt.id, 'transaction-tools');
  assert.equal(alt.edit.tool, 'canva_perform_editing_operations');
  assert.equal(alt.edit.ops.format_text.ref, 'element_id');
  assert.equal(alt.commit.tool, 'canva_commit_editing_transaction');
  assert.equal(alt.cancel.tool, 'canva_cancel_editing_transaction');
  assert.equal(alt.open.tool, 'canva_start_editing_transaction');
  assert.deepEqual([alt.read.content.tool, alt.read.pages.tool, alt.read.thumbnails.tool], ['canva_get_design_content', 'canva_get_design_pages', 'canva_get_design_thumbnail']);

  // The registry reads the same capabilities through either dialect.
  for (const tools of [CLAUDE_TOOLS, UNDERSCORED, ALT_TOOLS]) {
    const reg = new CanvaCapabilityRegistry();
    reg.loadSchemas(tools);
    for (const cap of ['text.format', 'design.size', 'preview', 'save', 'text.read']) assert.equal(reg.entry(cap, 'connector').status, 'supported', `${cap} with ${tools[0].name}`);
  }
  const altReg = new CanvaCapabilityRegistry();
  altReg.loadSchemas(ALT_TOOLS);
  assert.match(altReg.entry('text.format', 'connector').via, /canva_perform_editing_operations/);
  assert.match(altReg.entry('preview', 'connector').via, /canva_get_design_thumbnail/);
  assert.equal(altReg.entry('shape.insert', 'connector').status, 'unsupported', 'its schema has no insert_shape');
  assert.equal(altReg.entry('text.add', 'connector').lastKnown?.connector, 'edit-design', 'live results from Claude\'s connector are shown as another connector\'s, never applied');
  // Without the tools for a role, the capability is absent, not assumed.
  const bare = new CanvaCapabilityRegistry();
  bare.loadSchemas(ALT_TOOLS.filter((t) => !/thumbnail|resize/.test(t.name)));
  assert.equal(bare.entry('preview', 'connector').status, 'unsupported');
  assert.equal(bare.entry('design.size', 'connector').status, 'unsupported');
  // Names only: tools are there, operations unknown — unverified, and no
  // call is written with guessed fields.
  const names = new CanvaCapabilityRegistry();
  names.loadSchemas(ALT_TOOLS.map((t) => t.name));
  assert.equal(names.entry('text.format', 'connector').status, 'unverified');
  assert.equal(translateStep({ tool: 'edit-design', args: { transaction_id: 'T', page_index: 1, finalize: 'keep_open', operations: [{ type: 'format_text', locator_id: 'L1', formatting: { font_size: 90 } }] } }, names.dialect).issues[0].code, 'ops-unknown');
  // Claude's full capture keeps the fingerprint the live evidence was recorded on.
  assert.equal(schemaFacts(CLAUDE_TOOLS).fingerprints['edit-design'], schemaFacts(SCHEMA).fingerprints['edit-design']);
});

test('dialects: the same plan becomes element_id operations, separate open/commit/cancel calls and separate readers; nothing unknown is sent', async () => {
  const alt = detectDialect(ALT_TOOLS);
  const claude = detectDialect(CLAUDE_TOOLS);
  const edit = { tool: 'edit-design', args: { transaction_id: 'T1', page_index: 2, finalize: 'keep_open', operations: [{ type: 'format_text', locator_id: 'E9', formatting: { font_size: 120, font_style: 'italic' } }, { type: 'add_text', page_id: '$page:2', text: 'نص', top: 10, left: 20, width: 300, _element: 'title' }] } };
  const a = translateStep(edit, alt);
  assert.equal(a.steps[0].tool, 'canva_perform_editing_operations');
  assert.deepEqual(a.steps[0].args.operations[0], { type: 'format_text', element_id: 'E9', formatting: { font_size: 120 } });
  assert.equal(a.steps[0].args.page_index, 2);
  assert.ok(!('finalize' in a.steps[0].args), 'no finalize field in this connector');
  assert.ok(!('page_id' in a.steps[0].args.operations[1]), 'add_text here takes the page from the call');
  assert.equal(a.steps[0].args.operations[1]._element, 'title', 'our bookkeeping keys stay for canva_record');
  assert.ok(a.issues.some((i) => i.code === 'dropped-fields' && i.fields.includes('formatting.font_style')), 'a field the schema lacks is reported, not sent');
  const c = translateStep(edit, claude);
  assert.equal(c.steps[0].tool, 'mcp__Canva__edit-design');
  assert.deepEqual(c.steps[0].args.operations, edit.args.operations, 'Claude\'s connector gets the plan as written');

  const commit = { tool: 'edit-design', args: { transaction_id: 'T1', finalize: 'commit' } };
  assert.deepEqual(translateStep(commit, alt).steps[0], { ...commit, tool: 'canva_commit_editing_transaction', args: { transaction_id: 'T1' }, canonical: 'edit-design' });
  assert.equal(translateStep({ ...commit, args: { transaction_id: 'T1', finalize: 'cancel' } }, alt).steps[0].tool, 'canva_cancel_editing_transaction');
  assert.deepEqual(translateStep(commit, claude).steps[0].args, { transaction_id: 'T1', finalize: 'commit' });
  const open = translateStep({ tool: 'read-design', args: { design_id: 'D1', open_transaction: true, filter: { fields: ['design_content'] } } }, alt).steps[0];
  assert.deepEqual([open.tool, open.args], ['canva_start_editing_transaction', { design_id: 'D1' }]);
  const reads = translateStep({ tool: 'read-design', args: { design_id: 'D1', transaction_id: 'T1', filter: { fields: ['page_metadata', 'design_content', 'thumbnails'], thumbnail_pages: [1, 3] } } }, alt).steps;
  assert.deepEqual(reads.map((s) => s.tool), ['canva_get_design_content', 'canva_get_design_pages', 'canva_get_design_thumbnail', 'canva_get_design_thumbnail']);
  assert.equal(reads[0].readsSaved, true, 'this reader cannot see the open transaction: said so');
  assert.deepEqual(reads.slice(2).map((s) => s.args.page_index), [1, 3]);
  // An operation the connector does not have is an error, not a call.
  const shape = translateStep({ tool: 'edit-design', args: { transaction_id: 'T1', page_index: 1, finalize: 'keep_open', operations: [{ type: 'insert_shape', page_id: 'P', top: 0, left: 0, width: 1, height: 1, path: 'M0 0Z', view_box_width: 1, view_box_height: 1 }] } }, alt);
  assert.equal(shape.steps[0].blocked, 'untranslatable');
  assert.equal(shape.issues[0].code, 'op-missing');
  // Media from a local file cannot go to a public-URL upload.
  assert.equal(translateStep({ tool: 'create-upload-url', args: {} }, alt).issues[0].code, 'upload-needs-public-url');
});

test('dialects: an edit on a design in the other connector — «كبّر العنوان» targets element_id, previews per page, and the follow-up batch is translated too', async () => {
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  await TOOLS.canva_capabilities(ctx, { schemas: ALT_TOOLS });
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DALT0000001', relation: 'created' });
  const rb = asElementIds(readbackOf(doc, { designId: 'DALT0000001' }));
  await TOOLS.canva_record(ctx, { design: doc, event: 'locators', readback: rb });
  ctx.files.set('/d.json', utf8(JSON.stringify(doc)));
  const r = await TOOLS.canva_apply_patch(ctx, { design: '/d.json', commands: ['كبّر العنوان'], readback: rb });
  assert.equal(r.status, 'planned', JSON.stringify(r.issues ?? r));
  assert.ok(r.calls.every((c) => c.tool === 'canva_perform_editing_operations'));
  const ops = r.calls.flatMap((c) => c.args.operations);
  assert.ok(ops.length && ops.every((o) => 'element_id' in o && !('locator_id' in o)));
  assert.ok(r.preview.calls.every((c) => c.tool === 'canva_get_design_thumbnail' && Number.isInteger(c.args.page_index)));
  // The art was resized; this connector has no crop_media: said, not hidden.
  assert.ok(r.issues.some((i) => i.code === 'op-missing' && i.op === 'crop_media' && i.severity === 'error'));

  // Build-time bookkeeping with this connector's response shape.
  const step = { tool: 'canva_perform_editing_operations', args: { transaction_id: 'T9', page_index: 1, operations: [{ type: 'add_text', text: 'دليل القارئ', top: 1, left: 1, width: 10, _element: 'kicker', _then: { type: 'format_text', element_id: '$el:x/kicker', formatting: { font_size: 30 } } }] } };
  const response = { document: { page_index: 1, page: { id: 'PG1', elements: [{ type: 'text', element_id: 'EL-new-1', top: 1, left: 1, width: 10, height: 20, textRegions: [{ characters: 'دليل القارئ' }] }] } } };
  const fresh = memCtx();
  const { doc: d2 } = kitabwbsDesign(fresh);
  await TOOLS.canva_capabilities(fresh, { schemas: ALT_TOOLS });
  const rec = await TOOLS.canva_record(fresh, { design: d2, event: 'edit', step, response });
  assert.equal(rec.mapped, 1);
  assert.equal(rec.next.tool, 'canva_perform_editing_operations');
  assert.equal(rec.next.args.operations[0].element_id, 'EL-new-1');
});

test('import: a design_file field gets the .pptx directly; a public-URL field never gets a local file; both ids are kept and the result is verified after import', async () => {
  // Another host: import_design_from_url with a design_file file param.
  const ctx = memCtx();
  const { doc } = kitabwbsDesign(ctx);
  await TOOLS.canva_capabilities(ctx, { schemas: ALT_TOOLS });
  await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DSRC0000001', relation: 'created' });
  const reg = new CanvaCapabilityRegistry({ store: ctx.store });
  const entry = reg.entry('import.native-file', 'connector');
  assert.equal(entry.status, 'supported', 'the schema takes a file and names PowerPoint');
  assert.equal(entry.inputType, 'local-file (host-file)');
  assert.notEqual(reg.entry('media.upload', 'connector').via, entry.via, 'uploading media and importing a design are separate');
  const r = await TOOLS.canva_import_editable(ctx, { design: doc, outDir: '/imp' });
  assert.equal(r.status, 'planned');
  assert.equal(r.route, 'connector');
  const call = r.calls[0];
  assert.equal(call.tool, 'canva_import_design_from_url');
  assert.deepEqual(call.args.design_file, { $attach: r.file });
  assert.ok(!('url' in call.args), 'no local path in a URL field');
  assert.equal(call.attach.path, r.file);
  assert.match(call.attach.mediaType, /presentationml/);
  assert.deepEqual(r.ids, { localDocId: doc.id, sourceDesignId: 'DSRC0000001', newDesignId: '$newDesignId' });
  assert.equal(r.record.relation, 'import');
  assert.deepEqual(r.verify.calls.map((c) => c.tool), ['canva_get_design_content', 'canva_get_design_pages', 'canva_get_design_thumbnail']);
  assert.deepEqual(r.verify.expect, { pages: 3, width: 1080, height: 1350 });
  // The new design is recorded as an import of the source, which stays as it was.
  const linked = await TOOLS.canva_record(ctx, { design: doc, event: 'design', designId: 'DNEW0000001', relation: 'import', sourceDesignId: 'DSRC0000001' });
  assert.deepEqual([linked.link.designId, linked.link.sourceDesignId, linked.link.relation], ['DNEW0000001', 'DSRC0000001', 'import']);
  // After the import: text, page count and size are checked on the new design.
  const imported = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: asElementIds(readbackOf(doc, { designId: 'DNEW0000001' })) });
  assert.equal(imported.passed, true, JSON.stringify(imported.issues));
  const short = readbackOf(doc, { designId: 'DNEW0000001' });
  short.design_content.pages.pop();
  short.page_metadata.pop();
  const lost = await TOOLS.canva_validate_arabic(ctx, { design: doc, readback: short });
  assert.equal(lost.passed, false, 'a page lost in the import fails');

  // A base64 field gets the file's bytes.
  const b64 = ALT_TOOLS.map((t) => (/import_design/.test(t.name) ? { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, design_file: { type: 'string', contentEncoding: 'base64' } } }, _meta: {} } : t));
  const ctx2 = memCtx();
  const { doc: d2 } = kitabwbsDesign(ctx2);
  await TOOLS.canva_capabilities(ctx2, { schemas: b64 });
  const r2 = await TOOLS.canva_import_editable(ctx2, { design: d2, outDir: '/imp2' });
  assert.equal(Buffer.from(r2.calls[0].args.design_file, 'base64').subarray(0, 2).toString(), 'PK', 'the .pptx itself');

  // Claude's connector: import-design-from-url takes a public URL only and
  // excludes generated files — no call, the reason, and the other routes.
  const ctx3 = memCtx();
  const { doc: d3 } = kitabwbsDesign(ctx3);
  await TOOLS.canva_capabilities(ctx3, { schemas: CLAUDE_TOOLS });
  const r3 = await TOOLS.canva_import_editable(ctx3, { design: d3, outDir: '/imp3' });
  assert.equal(r3.status, 'file-ready');
  assert.equal(r3.connector.status, 'unsupported');
  assert.match(r3.connector.why, /عام|مولّد/);
  assert.ok(!r3.calls, 'nothing to call');
  assert.ok(r3.importOptions.some((o) => o.route === 'manual' && o.status === 'supported'));
});
