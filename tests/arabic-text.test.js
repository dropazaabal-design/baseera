import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arabicTextHtml,
  buildRuns,
  compareStoredText,
  frameState,
  fromMarkedText,
  layoutKey,
  normalizeSpec,
  parseArabicText,
  planMotion,
  rasterKey,
  segmentsOf,
  serializeArabicText,
  toMarkedText,
  validateMotion,
  validateSpec,
  wordsOf,
  typesetters,
} from '../lib/arabic-text/index.js';

// The texts the brief asks for, stored exactly as approved.
export const CASES = ['لا تؤجّل ما تستطيع فعله اليوم', 'وفّرت 25% خلال 3 أشهر', 'تابع @kitabwbs للمزيد', 'السعر: 1,250.50 درهم', 'قال: «ابدأ الآن»', 'قُوَّةُ التَّرْكِيزِ'];
const base = (text, extra = {}) => ({ text, font: { family: 'Cairo', weight: 800 }, fontSize: 88, width: 900, lineHeight: 1.5, color: '#14181F', ...extra });

test('runs cover the stored text exactly, for every case and paragraph', () => {
  for (const text of [...CASES, 'سطر أول 2026\nسطر ثانٍ @baseera']) {
    const runs = buildRuns(base(text));
    const joined = runs.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
    assert.equal(joined, text);
    for (const p of runs.paragraphs) for (const r of p.runs) assert.equal(text.slice(r.start, r.end), r.text);
  }
});

test('mixed runs are isolated, not overridden; Arabic stays unwrapped', () => {
  const html = arabicTextHtml(base('وفّرت 25% خلال 3 أشهر'));
  assert.match(html, /<bdi dir="ltr" data-at-run="number">25%<\/bdi>/);
  assert.match(html, /<bdi dir="ltr" data-at-run="number">3<\/bdi>/);
  assert.match(html, /lang="ar" dir="rtl"/);
  assert.doesNotMatch(html, /bidi-override|unicode-bidi:\s*bidi-override|[‪-‮⁦-⁩‎‏]/);
  assert.match(arabicTextHtml(base('تابع @kitabwbs للمزيد')), /<bdi dir="ltr" data-at-run="handle">@kitabwbs<\/bdi>/);
  assert.match(arabicTextHtml(base('السعر: 1,250.50 درهم')), /<bdi dir="ltr" data-at-run="number">1,250.50<\/bdi>/);
  // Quotes, diacritics and Arabic punctuation are left to the shaping engine.
  assert.match(arabicTextHtml(base('قال: «ابدأ الآن»')), />قال: «ابدأ الآن»</);
  assert.match(arabicTextHtml(base('قُوَّةُ التَّرْكِيزِ')), />قُوَّةُ التَّرْكِيزِ</);
});

test('alignment is separate from direction', () => {
  for (const align of ['start', 'center', 'end']) {
    const html = arabicTextHtml(base('نص', { align }));
    assert.match(html, new RegExp(`text-align:${align}`));
    assert.match(html, /dir="rtl"/);
  }
  assert.match(arabicTextHtml(base('Hello', { direction: 'ltr', lang: 'en' })), /dir="ltr"/);
});

test('explicit spans decide; detection only fills the gaps', () => {
  const text = 'تابع @kitabwbs للمزيد 2026';
  const explicit = buildRuns(base(text, { bidi: 'explicit', spans: [{ start: 5, end: 14, dir: 'ltr', label: 'handle' }] }));
  assert.equal(explicit.source, 'explicit');
  assert.equal(explicit.isolates.length, 1, 'no detected run with bidi explicit');
  const mixed = buildRuns(base(text, { spans: [{ start: 5, end: 14, dir: 'ltr', label: 'handle' }] }));
  assert.equal(mixed.source, 'mixed');
  assert.deepEqual(mixed.isolates.map((s) => text.slice(s.start, s.end)), ['@kitabwbs', '2026']);
  // A span may mark an RTL isolate inside an LTR paragraph.
  const ltr = buildRuns(base('Read كتاب today', { direction: 'ltr', bidi: 'explicit', spans: [{ start: 5, end: 9, dir: 'rtl' }] }));
  assert.equal(ltr.paragraphs[0].runs[1].dir, 'rtl');
});

test('validation: presentation forms, crossing isolates, bad weights and spans are errors; bidi controls a warning', () => {
  const codes = (s) => validateSpec(s).errors.map((e) => e.code);
  assert.ok(codes(base('ﻻ تؤجل')).includes('text.presentation-forms'));
  assert.ok(codes(base('abc def', { spans: [{ start: 0, end: 5, dir: 'ltr' }, { start: 3, end: 7, dir: 'ltr' }] })).includes('spec.spans'));
  assert.ok(codes(base('نص', { font: { family: 'Cairo', weight: 650.5 } })).includes('spec.font.weight'));
  assert.ok(codes(base('نص', { spans: [{ start: 0, end: 9, dir: 'ltr' }] })).includes('spec.spans'));
  assert.ok(codes(base('نص', { minFontSize: 99 })).includes('spec.minFontSize'));
  assert.deepEqual(validateSpec(base('تابع ‎@kitabwbs')).warnings.map((w) => w.code), ['text.bidi-controls']);
  assert.deepEqual(validateSpec(base(CASES[0])).errors, []);
});

test('marked text ↔ spans round trip; the stored text never carries the markers', () => {
  const { text, spans } = fromMarkedText('قال: «*ابدأ الآن*»', { mark: 'highlight' });
  assert.equal(text, 'قال: «ابدأ الآن»');
  assert.deepEqual(spans, [{ start: 6, end: 15, mark: 'highlight' }]);
  assert.equal(toMarkedText(text, spans), 'قال: «*ابدأ الآن*»');
  assert.deepEqual(compareStoredText(text, CASES[4]), { equal: true });
  assert.equal(compareStoredText('قوة', 'قوّة').index, 2);
});

test('serialization reopens the same spec and layout; unknown versions are refused', () => {
  const spec = base(CASES[2], { motion: [{ effect: 'rise', unit: 'word' }] });
  const layout = { fontSize: 88, lines: [], words: [] };
  const back = parseArabicText(serializeArabicText({ spec, layout }));
  assert.deepEqual(back.spec, normalizeSpec(spec));
  assert.deepEqual(back.layout, layout);
  assert.throws(() => parseArabicText({ kind: 'arabic-text', version: 99, spec }));
});

test('cache keys: text, font, weight, layout and renderer change them; colour and motion do not change the layout key', () => {
  const env = { renderer: 'chromium/141', fonts: 'abc' };
  const k = layoutKey(base(CASES[0]), env);
  assert.equal(layoutKey(base(CASES[0], { color: '#FF0000', motion: [{ effect: 'fade' }] }), env), k);
  for (const variant of [base(CASES[1]), base(CASES[0], { font: { family: 'Cairo', weight: 700 } }), base(CASES[0], { width: 800 }), base(CASES[0], { lineHeight: 1.6 }), base(CASES[0], { align: 'center' })]) assert.notEqual(layoutKey(variant, env), k);
  assert.notEqual(layoutKey(base(CASES[0]), { ...env, renderer: 'chromium/142' }), k);
  assert.notEqual(layoutKey(base(CASES[0]), { ...env, fonts: 'def' }), k);
  assert.notEqual(rasterKey(base(CASES[0], { color: '#FF0000' }), env), rasterKey(base(CASES[0]), env));
  assert.notEqual(rasterKey(base(CASES[0]), env, { scale: 2 }), rasterKey(base(CASES[0]), env));
});

test('words are cut only at spaces', () => {
  assert.deepEqual(wordsOf('قال: «ابدأ الآن»').map((w) => w.text), ['قال:', '«ابدأ', 'الآن»']);
  assert.deepEqual(wordsOf('السعر: 1,250.50 درهم').map((w) => w.text), ['السعر:', '1,250.50', 'درهم']);
});

// A layout as the typesetter returns it (two lines, RTL), for the motion maths.
const LAYOUT = {
  fontSize: 80,
  direction: 'rtl',
  ascent: 120,
  descent: 50,
  layer: { x: -20, y: -20, width: 940, height: 300 },
  lines: [
    { index: 0, words: [0, 1], box: { x: 0, y: 0, width: 900, height: 130 } },
    { index: 1, words: [2], box: { x: 0, y: 130, width: 900, height: 130 } },
  ],
  words: [
    { index: 0, text: 'لا', start: 0, end: 2, line: 0, box: { x: 700, y: 0, width: 200, height: 170 }, ink: { x: 705, y: 20, width: 190, height: 100 } },
    { index: 1, text: 'تؤجّل', start: 3, end: 8, line: 0, box: { x: 300, y: 0, width: 360, height: 170 }, ink: { x: 302, y: 10, width: 356, height: 120 } },
    { index: 2, text: 'اليوم', start: 9, end: 14, line: 1, box: { x: 500, y: 130, width: 400, height: 170 }, ink: { x: 505, y: 140, width: 390, height: 110 } },
  ],
};

test('pieces tile the layer with no gap or overlap, cut between words, in reading order', () => {
  for (const unit of ['block', 'line', 'word']) {
    const segs = segmentsOf(LAYOUT, unit);
    const area = segs.reduce((t, s) => t + s.slot.width * s.slot.height, 0);
    assert.equal(area, LAYOUT.layer.width * LAYOUT.layer.height, unit);
  }
  const words = segmentsOf(LAYOUT, 'word');
  assert.deepEqual(words.map((s) => s.word), [0, 1, 2], 'reading order: first word first (rightmost in RTL)');
  assert.equal(words[0].slot.x, 680, 'cut at the middle of the space between the two words');
});

test('motion is a function of the frame: hidden before, identity after, monotonic between', () => {
  for (const effect of ['fade', 'rise', 'scale', 'reveal']) {
    for (const unit of ['block', 'line', 'word']) {
      const plan = planMotion(LAYOUT, [{ effect, unit, start: 10, duration: 12, stagger: 4 }]);
      assert.ok(plan.ok, `${effect}/${unit}`);
      const before = frameState(plan, 9);
      assert.ok(before.hidden || effect === 'reveal', `${effect}/${unit} hidden before its start`);
      assert.ok(before.segments.every((s) => s.opacity === 0 || (s.clip && s.clip.fraction === 0)));
      const after = frameState(plan, plan.endFrame);
      assert.ok(after.settled, `${effect}/${unit} settles exactly on its last frame`);
      assert.deepEqual(frameState(plan, 15), frameState(plan, 15), 'same frame, same state');
      const mid = frameState(plan, 14).segments[0];
      const later = frameState(plan, 18).segments[0];
      if (effect === 'reveal') assert.ok(later.clip === null || later.clip.fraction >= mid.clip.fraction);
      else assert.ok(later.opacity >= mid.opacity);
      if (effect === 'rise') assert.ok(later.dy <= mid.dy && mid.dy > 0);
    }
  }
});

test('reveal uncovers from the reading start (right in RTL); highlight bands follow the words', () => {
  const plan = planMotion(LAYOUT, [{ effect: 'reveal', unit: 'line', duration: 10 }]);
  assert.equal(frameState(plan, 5).segments[0].clip.side, 'right');
  const hl = planMotion(LAYOUT, [{ effect: 'highlight', words: [0, 1], duration: 10 }]);
  assert.equal(hl.highlights[0].bands.length, 1, 'neighbouring words on one line share a band');
  const band = hl.highlights[0].bands[0].rect;
  assert.ok(band.x < 300 && band.x + band.width > 900, 'band a little wider than the words');
  assert.equal(frameState(hl, 0).bands[0].fraction, 0);
  assert.equal(frameState(hl, 10).bands[0].fraction, 1);
});

test('letter-by-letter motion and letter spacing effects are refused', () => {
  assert.deepEqual(validateMotion([{ effect: 'fade', unit: 'letter' }]).map((e) => e.code), ['motion.letters-forbidden']);
  assert.deepEqual(validateMotion([{ effect: 'typewriter' }]).map((e) => e.code), ['motion.tracking-forbidden']);
  assert.deepEqual(validateMotion([{ effect: 'fade' }, { effect: 'rise' }]).map((e) => e.code), ['motion.one-text-motion']);
  assert.deepEqual(validateMotion([{ effect: 'fade', start: 1.5 }]).map((e) => e.code), ['motion.frames']);
});

test('ink crossing into a neighbour piece is reported, not hidden', () => {
  const tight = structuredClone(LAYOUT);
  tight.words[2].ink = { x: 505, y: 100, width: 390, height: 150 }; // reaches into line 0
  const plan = planMotion(tight, [{ effect: 'rise', unit: 'line' }]);
  assert.ok(plan.warnings.some((w) => w.code === 'motion.ink-crosses-piece' && w.word === 2));
});

test('typesetters: Chromium is the engine; Pango is a reserved slot, not a silent fallback', async () => {
  const pango = typesetters().find((t) => t.name === 'pango');
  assert.equal(pango.available, false);
  const { createTypesetter } = await import('../lib/arabic-text/index.js');
  await assert.rejects(() => createTypesetter('pango'), /not installed/);
});

test('verification fixtures: approved texts unchanged, spans cover what they claim', async () => {
  const { APPROVED, CASES: FIX } = await import('../lib/arabic-text/fixtures.js');
  assert.equal(APPROVED.procrastinate, CASES[0]);
  assert.equal(APPROVED.diacritics, CASES[5]);
  const byId = Object.fromEntries(FIX.map((c) => [c.id, c]));
  const slice = (c, i = 0) => c.spec.text.slice(c.spec.spans[i].start, c.spec.spans[i].end);
  assert.equal(slice(byId.follow), '@kitabwbs');
  assert.equal(slice(byId.quote), 'ابدأ الآن');
  for (const c of FIX) assert.deepEqual(validateSpec(c.spec).errors, [], c.id);
  for (const c of FIX) assert.deepEqual(validateMotion(c.motion), [], c.id);
});
