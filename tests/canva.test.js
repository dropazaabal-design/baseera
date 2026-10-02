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
  assert.deepEqual(r.preview.args.filter.thumbnail_pages, r.calls.map((c) => c.args.page_index).filter((v, i, a) => a.indexOf(v) === i), 'preview only the affected pages');

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
  assert.deepEqual(Object.fromEntries(Object.entries(r.progress).map(([k, v]) => [k, v.state])), { scenes: 'created-locally', motion: 'not-applied', timing: 'not-set', audio: 'none', video: 'not-exported' });
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
  assert.equal(v1.reel.timing.state, 'not-set', 'pages at Canva\'s default length: timing was not applied');
  ctx.files.set('/v2.mp4', mp4({ seconds: plan.totalSeconds, width: 1080, height: 1920 }));
  const v2 = await TOOLS.canva_export(ctx, { file: '/v2.mp4', reel: plan });
  assert.equal(v2.reel.timing.state, 'verified');
  assert.equal(v2.reel.video.state, 'exported-verified');
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
  const imp = reg.entry('import.native-file', 'connector');
  assert.equal(imp.status, 'unsupported');
  assert.equal(imp.verified.source, 'live');
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
  const stale = reg.entry('import.native-file', 'connector');
  assert.ok(stale.stale?.length, 'the live PPTX rejection must be re-tested');
  assert.equal(stale.status, 'unverified');
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
