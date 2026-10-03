// ArabicText verification in Chromium (the engine that draws):
//
//   node scripts/arabic-text-check.mjs [--out docs/arabic-text/check]
//
// For every case in lib/arabic-text/fixtures.js:
//   - typesets it at preview scale (1) and export scale (2) and compares the
//     two layouts (lines, word boxes): measurements must not move
//   - the text in the page equals the stored text, which equals the approved
//     text (code point by code point)
//   - letters join (the paragraph measures differently with joiners broken)
//   - visual order: on a one-line RTL paragraph, words from right to left
//     are the stored words in order (handles, numbers, quotes in place)
//   - ink stays inside the layer (no cut mark or tail), diacritics are drawn
//   - motion: canvas adapter and HTML adapter frames at the start, middle
//     and end; the last frame equals the static render, the first is empty
// and for every failure case, the expected error code (no fallback render).
// Writes report.json and images for a human look (Arabic is checked by eye
// on the zoomed sheets; no OCR is used as evidence).
import fs from 'node:fs';
import path from 'node:path';
import { createChromiumTypesetter } from '../lib/arabic-text/node/chromium.js';
import { alphaBounds, compareImages, decodePng, encodePng } from '../lib/arabic-text/node/png.js';
import { APPROVED, CASES, FAILURES } from '../lib/arabic-text/fixtures.js';
import { compareStoredText, normalizeSpec } from '../lib/arabic-text/spec.js';
import { frameHtml } from '../lib/arabic-text/htmlMotion.js';
import { frameState, planMotion } from '../lib/arabic-text/motion.js';
import { wordsOf } from '../lib/arabic-text/runs.js';

const root = path.resolve(import.meta.dirname, '..');
const outArg = process.argv.indexOf('--out');
const outDir = path.resolve(root, outArg > 0 ? process.argv[outArg + 1] : 'docs/arabic-text/check');
fs.mkdirSync(outDir, { recursive: true });

const ts = await createChromiumTypesetter({ extraFaces: FAILURES.filter((f) => f.extraFace).map((f) => f.extraFace) });
const report = { renderer: ts.env.renderer, fontsHash: ts.env.fonts, generatedAt: new Date().toISOString().slice(0, 10), cases: [], failures: [], summary: {} };

const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;
const sameBox = (a, b) => (!a && !b) || (a && b && near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height));

// Canvas adapter frame, drawn in the typesetter page from the static raster.
async function canvasFrame(rasterPng, layout, state) {
  const url = await ts.evaluate(
    async ({ b64, layout, state }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const L = layout.layer;
      const c = document.createElement('canvas');
      c.width = Math.round(L.width);
      c.height = Math.round(L.height);
      globalThis.ArabicText.drawArabicTextFrame(c.getContext('2d'), { image: img, scale: 1, layout }, state, { x: -L.x, y: -L.y });
      return c.toDataURL('image/png');
    },
    { b64: Buffer.from(rasterPng).toString('base64'), layout, state },
  );
  return Buffer.from(url.split(',')[1], 'base64');
}

const crop = (img, w, h) => {
  if (img.width === w && img.height === h) return img;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < Math.min(h, img.height); y++) data.set(img.data.subarray(y * img.width * 4, y * img.width * 4 + Math.min(w, img.width) * 4), y * w * 4);
  return { width: w, height: h, data };
};
const diff = (pa, pb) => {
  const a = decodePng(pa);
  const b = decodePng(pb);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  return { ...compareImages(crop(a, w, h), crop(b, w, h)), size: [a.width, a.height, b.width, b.height] };
};
const emptyPng = (png) => decodePng(png).data.every((v, i) => i % 4 !== 3 || v === 0);

// A strip of images side by side on white, for the human look.
function strip(pngs, file) {
  const imgs = pngs.map(decodePng);
  const gap = 16;
  const width = imgs.reduce((t, i) => t + i.width + gap, gap);
  const height = Math.max(...imgs.map((i) => i.height)) + gap * 2;
  const data = new Uint8Array(width * height * 4).fill(255);
  let x0 = gap;
  for (const img of imgs) {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const s = (y * img.width + x) * 4;
        const d = ((y + gap) * width + x0 + x) * 4;
        const a = img.data[s + 3] / 255;
        for (let c = 0; c < 3; c++) data[d + c] = Math.round(img.data[s + c] * a + 255 * (1 - a));
      }
    }
    // a thin grey frame around each image: the layer's bounds
    for (let x = 0; x < img.width; x++) for (const y of [gap - 1, gap + img.height]) data.set([200, 200, 200, 255], (y * width + x0 + x) * 4);
    for (let y = gap; y < gap + img.height; y++) for (const x of [x0 - 1, x0 + img.width]) data.set([200, 200, 200, 255], (y * width + x) * 4);
    x0 += img.width + gap;
  }
  fs.writeFileSync(path.join(outDir, file), encodePng({ width, height, data }));
}

for (const c of CASES) {
  const spec = normalizeSpec(c.spec);
  const plainHighlight = c.motion.some((m) => m.effect === 'highlight');
  const marks = plainHighlight ? 'none' : 'static';
  const preview = await ts.typeset(spec, { scale: 1, marks });
  const exportR = await ts.typeset(spec, { scale: 2, marks });
  const staticR = plainHighlight ? await ts.typeset(spec, { scale: 1, marks: 'static' }) : preview;
  const L = preview.layout;
  const checks = {};
  checks.typeset = preview.ok && exportR.ok;
  const approved = APPROVED[c.id] ?? APPROVED.procrastinate;
  checks.storedEqualsApproved = compareStoredText(spec.text, approved).equal;
  checks.pageEqualsStored = !preview.errors.some((e) => e.code === 'text.mismatch') && L.words.map((w) => w.text).join(' ') === wordsOf(spec.text).map((w) => w.text).join(' ');
  checks.lettersJoin = L.joining.holds === true;
  checks.previewEqualsExport = L.lines.length === exportR.layout.lines.length && L.words.every((w, i) => sameBox(w.box, exportR.layout.words[i].box)) && L.fontSize === exportR.layout.fontSize;
  if (L.lines.length === 1) checks.visualOrder = [...L.words].sort((a, b) => (spec.direction === 'rtl' ? b.box.x - a.box.x : a.box.x - b.box.x)).map((w) => w.text).join(' ') === (c.order ?? wordsOf(spec.text).map((w) => w.text)).join(' ');
  checks.noClippedInk = !preview.raster.clipped && !exportR.raster.clipped;
  const ri = preview.raster.ink;
  checks.inkInsideLayer = Boolean(ri) && ri.x >= L.layer.x && ri.y >= L.layer.y && ri.x + ri.width <= L.layer.x + L.layer.width && ri.y + ri.height <= L.layer.y + L.layer.height;
  checks.inkEstimateCoversRaster = Boolean(ri && L.ink) && L.ink.x <= ri.x + 2 && L.ink.y <= ri.y + 2 && L.ink.x + L.ink.width >= ri.x + ri.width - 2 && L.ink.y + L.ink.height >= ri.y + ri.height - 2;
  if (c.id === 'diacritics') {
    // Marks drawn: the same words without them have a smaller ink box.
    const bare = await ts.typeset({ ...spec, text: spec.text.replace(/\p{M}/gu, '') }, { scale: 1 });
    checks.diacriticsDrawn = bare.raster.ink.height < ri.height - 4;
    checks.diacriticsKeptInText = [...spec.text.matchAll(/\p{M}/gu)].length === [...APPROVED.diacritics.matchAll(/\p{M}/gu)].length && [...spec.text.matchAll(/\p{M}/gu)].length > 0;
  }
  fs.writeFileSync(path.join(outDir, `${c.id}.png`), exportR.raster.png);

  // Motion: frames through both adapters.
  const plan = planMotion(L, c.motion, { spans: spec.spans });
  const motion = { motion: c.motion, warnings: plan.warnings, endFrame: plan.endFrame };
  if (plan.ok) {
    const first = Math.min(...plan.tracks.map((t) => t.start));
    const frames = { start: first, middle: Math.round(plan.endFrame / 2), end: plan.endFrame };
    const imgs = {};
    for (const [name, f] of Object.entries(frames)) {
      const state = frameState(plan, f);
      imgs[`canvas-${name}`] = await canvasFrame(preview.raster.png, L, state);
      imgs[`html-${name}`] = await ts.renderHtml(frameHtml(spec, L, state, { marks }), { width: Math.round(L.layer.width), height: Math.round(L.layer.height) });
    }
    motion.firstFrameEmpty = c.motion.some((m) => m.effect !== 'highlight' && m.effect !== 'reveal') ? emptyPng(imgs['canvas-start']) && emptyPng(imgs['html-start']) : 'n/a';
    if (c.motion.some((m) => m.effect === 'reveal')) motion.firstFrameEmpty = emptyPng(imgs['canvas-start']);
    motion.endCanvasVsStatic = diff(imgs['canvas-end'], staticR.raster.png);
    motion.endHtmlVsStatic = diff(imgs['html-end'], staticR.raster.png);
    // HTML draws text as vectors (crisp under scale and opacity), canvas
    // moves the bitmap: pixels differ at anti-aliased edges, so the middle
    // frames are compared by where the ink is and by the mean difference.
    motion.middleHtmlVsCanvas = diff(imgs['html-middle'], imgs['canvas-middle']);
    const ba = alphaBounds(decodePng(imgs['html-middle']));
    const bb = alphaBounds(decodePng(imgs['canvas-middle']));
    motion.middleInkHtmlVsCanvas = ba && bb ? Math.max(Math.abs(ba.x - bb.x), Math.abs(ba.y - bb.y), Math.abs(ba.x + ba.width - bb.x - bb.width), Math.abs(ba.y + ba.height - bb.y - bb.height)) : null;
    motion.middleNotEmpty = !emptyPng(imgs['canvas-middle']);
    // Same plan at every frame: the layout never moves underneath.
    motion.layoutStable = JSON.stringify(frameState(plan, frames.end).segments.map((s) => s.slot)) === JSON.stringify(frameState(plan, frames.start).segments.map((s) => s.slot));
    strip([staticR.raster.png, imgs['canvas-start'], imgs['canvas-middle'], imgs['canvas-end'], imgs['html-middle'], imgs['html-end']], `${c.id}.motion.png`);
  }
  report.cases.push({ id: c.id, title: c.title, text: spec.text, ok: Object.values(checks).every(Boolean), checks, errors: preview.errors, warnings: preview.warnings.map((w) => w.code), lines: L.lines.length, fontSize: L.fontSize, layer: L.layer, inkOverflow: L.inkOverflow, bidi: L.bidi, key: preview.key, motion });
}

for (const f of FAILURES) {
  const r = await ts.typeset(f.spec, { raster: false });
  const e = r.errors.find((x) => x.code === f.expect);
  report.failures.push({ id: f.id, title: f.title, expected: f.expect, ok: !r.ok && Boolean(e) && !r.raster, errors: r.errors.map(({ code, message, suggestions, available }) => ({ code, message, ...(suggestions && { suggestions }), ...(available && { available }) })), warnings: r.warnings.map((w) => w.code) });
}

// Cache: a second typeset of the same spec is served from the cache; a
// changed text, weight or width is not.
const again = await ts.typeset(CASES[0].spec, { scale: 1 });
const changed = await ts.typeset({ ...CASES[0].spec, text: `${CASES[0].spec.text}!` }, { scale: 1, raster: false });
report.cache = { sameSpecCached: Boolean(again.cached), changedTextNotCached: !changed.cached };

// The last frame must be the static render: identical for moved text
// (mean difference 0), and within anti-aliasing for a drawn band against
// the CSS band (mean difference under 1 on 0–255).
const motionOk = (m) => m.layoutStable && m.middleNotEmpty && m.firstFrameEmpty !== false && m.endCanvasVsStatic.meanDiff < 1 && m.endHtmlVsStatic.meanDiff < 1 && m.middleInkHtmlVsCanvas !== null && m.middleInkHtmlVsCanvas <= 2 && m.middleHtmlVsCanvas.meanDiff < 4;
report.summary = {
  cases: report.cases.length,
  casesPassing: report.cases.filter((c) => c.ok).length,
  motionPassing: report.cases.filter((c) => c.motion.endCanvasVsStatic && motionOk(c.motion)).length,
  failuresAsExpected: report.failures.filter((f) => f.ok).length,
  failures: report.failures.length,
  cache: report.cache.sameSpecCached && report.cache.changedTextNotCached,
};
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, (k, v) => (k === 'png' ? undefined : v), 1)}\n`);
console.log(JSON.stringify(report.summary, null, 1));
for (const c of report.cases) if (!c.ok || !motionOk(c.motion)) console.log('ATTENTION', c.id, JSON.stringify(c.checks), JSON.stringify({ end: c.motion.endCanvasVsStatic, endHtml: c.motion.endHtmlVsStatic, mid: c.motion.middleHtmlVsCanvas, midInk: c.motion.middleInkHtmlVsCanvas, first: c.motion.firstFrameEmpty }));
for (const f of report.failures) if (!f.ok) console.log('UNEXPECTED', f.id, JSON.stringify(f.errors));
await ts.close();
