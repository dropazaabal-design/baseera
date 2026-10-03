// The ArabicText demo reel (1080×1920, 30 fps), made with the project's
// own reel engine in Chromium:
//
//   node scripts/arabic-text-reel.mjs [--out docs/arabic-text/reel]
//
// 1. Every case is typeset and checked first with the Chromium typesetter
//    (same engine, local fonts); its box size places it on the scene.
// 2. A page holds the scenes as .slide-root nodes; lib/video.js captures
//    each scene once (html-to-image) and, for text with an ArabicText
//    motion, measures the shaped paragraph (lib/arabic-text/video.js). The
//    caption is an ordinary data-anim layer: both paths of the engine run.
// 3. Frames are drawn by frame number and encoded with WebCodecs into MP4
//    (H.264 when the browser has an encoder, else VP9 in MP4).
// Writes reel.mp4, keyframes (start / middle / end of each motion, drawn by
// the same drawFrame), a contact sheet, a preview page and reel.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { createChromiumTypesetter } from '../lib/arabic-text/node/chromium.js';
import { fontFaceCss } from '../lib/arabic-text/node/fontCss.js';
import { arabicTextHtml } from '../lib/arabic-text/html.js';
import { CASES, FAILURES } from '../lib/arabic-text/fixtures.js';
import { normalizeSpec } from '../lib/arabic-text/spec.js';
import { planMotion } from '../lib/arabic-text/motion.js';

const root = path.resolve(import.meta.dirname, '..');
const outArg = process.argv.indexOf('--out');
const outDir = path.resolve(root, outArg > 0 ? process.argv[outArg + 1] : 'docs/arabic-text/reel');
fs.mkdirSync(path.join(outDir, 'keyframes'), { recursive: true });

const W = 1080;
const H = 1920;
const FPS = 30;
const SCENE = 3; // seconds
const ENTER = 0.25; // the text enters 0.25 s into its scene
const INSET = { top: 250, bottom: 320 }; // Instagram's UI over a story

const label = (text) => normalizeSpec({ text, font: { family: 'Tajawal', weight: 700 }, fontSize: 40, width: 900, lineHeight: 1.5, color: '#0C855D', align: 'start' });
const caption = (text) => normalizeSpec({ text, font: { family: 'Tajawal', weight: 400 }, fontSize: 40, width: 900, lineHeight: 1.6, color: '#4A515A', align: 'start' });

const NOTES = {
  procrastinate: 'الكلمات تتحرك كاملة، والحروف متصلة في كل إطار.',
  saved: '«25%» و«3» معزولتان بالترميز: لا تنقلب النسبة ولا يتحرك الرقم.',
  follow: 'المعرّف بين الكلمتين كما كُتب، والقناع يكشف السطر من اليمين.',
  price: '«1,250.50» بترتيبه، والنقطتان بعد «السعر» في مكانهما.',
  quote: 'علامتا التنصيص في موضعيهما، والتظليل خلف «ابدأ الآن» وحدها.',
  diacritics: 'الضمة والفتحة والشدّة والسكون والكسرة محفوظة، ولا يُقص شيء فوق الحروف أو تحتها.',
  paragraph: 'فقرة بمعرّف لاتيني: كل سطر يصعد وحده، والتخطيط لا يتغيّر.',
  narrow: 'صندوق ضيق: يلتف النص ولا يُصغَّر، والفحص ينبّه إلى الكلمة الوحيدة في آخر سطر.',
};

const ts = await createChromiumTypesetter({ extraFaces: FAILURES.filter((f) => f.extraFace).map((f) => f.extraFace) });

// The report scene lists what the component refused to draw, with why.
const refused = [];
for (const f of FAILURES) {
  const r = await ts.typeset(f.spec, { raster: false });
  const e = r.errors[0];
  const how = e?.suggestions?.map((s) => (s.kind === 'expand-width' ? `توسيع العرض إلى ${s.to}` : s.kind === 'expand-height' ? `ارتفاع ${s.to}` : 'تقسيم النص')).join(' أو ');
  refused.push({ id: f.id, code: e?.code, line: `${f.title}: رُفض${how ? ` (اقتراح: ${how})` : ''}.` });
}

const intro = {
  id: 'intro',
  title: 'النص العربي في الفيديو',
  spec: { text: 'النص العربي\nفي الفيديو', font: { family: 'Cairo', weight: 800 }, fontSize: 104, width: 900, lineHeight: 1.4, color: '#14181F' },
  motion: [{ effect: 'fade', unit: 'block', duration: 18 }],
  note: 'يُشكَّل النص مرة واحدة ثم يتحرك: كتلة أو سطرًا أو كلمة، لا حرفًا حرفًا، ولا تباعد حروف.',
};
const report = {
  id: 'refused',
  title: 'ما رفضه المكوّن بدل أن يرسم بديلًا',
  spec: { text: refused.map((x) => x.line).join('\n'), font: { family: 'Tajawal', weight: 500 }, fontSize: 40, width: 900, lineHeight: 1.7, color: '#14181F' },
  motion: [{ effect: 'rise', unit: 'line', duration: 12, stagger: 6 }],
  note: 'كل حالة تعيد سببها: لا خط بديل صامت، ولا وزن صناعي، ولا تصغير تحت الحد المعتمد.',
};
const scenes = [intro, ...CASES.map((c) => ({ ...c, note: NOTES[c.id] })), report];

// Typeset and check every scene's text; its box size places it.
const placed = [];
for (const [i, s] of scenes.entries()) {
  const spec = normalizeSpec(s.spec);
  const r = await ts.typeset(spec, { raster: false });
  if (!r.ok) throw new Error(`${s.id}: ${r.errors.map((e) => e.message).join('; ')}`);
  const plan = planMotion(r.layout, s.motion, { spans: spec.spans });
  placed.push({ ...s, spec, layout: r.layout, warnings: r.warnings.map((w) => w.code), motionWarnings: plan.warnings.map((w) => w.code), endFrame: plan.endFrame, key: r.key });
}
await ts.close();

const sceneHtml = (s, i) => {
  const top = Math.round((H - s.layout.box.height) / 2 - 40);
  // Each box is centred by its own width.
  const at = (y, spec, extra = '') => `<div style="position:absolute;left:${(W - spec.width) / 2}px;top:${y}px"${extra}>${arabicTextHtml(spec)}</div>`;
  return `<div class="slide-root" data-scene="${i}" style="position:relative;width:${W}px;height:${H}px;background:#FFFFFF;overflow:hidden">${at(INSET.top + 90, label(`${i + 1} · ${s.title}`))}${at(top, s.spec, ` data-anim="fade" data-text-motion='${JSON.stringify(s.motion)}'`)}${at(H - INSET.bottom - 230, caption(s.note), ' data-anim="fade"')}</div>`;
};

const { css } = fontFaceCss({ families: ['Cairo', 'Tajawal'], weights: [400, 500, 700, 800] });
const bundle = (await build({ entryPoints: [path.join(root, 'scripts/arabic-text/reel-entry.js')], bundle: true, write: false, format: 'iife', platform: 'browser', legalComments: 'none' })).outputFiles[0].text;
const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}
html,body{margin:0;background:#888}
bdi{unicode-bidi:isolate}
.slide-root[data-video-base] [data-anim],.slide-root[data-video-solo] *{visibility:hidden}
.slide-root[data-video-solo] [data-video-nomarks] [data-at-mark='highlight']{background:none !important}
.slide-root[data-video-solo] [data-video-show],.slide-root[data-video-solo] [data-video-show] *{visibility:visible}
</style></head><body><div id="stage">${placed.map(sceneHtml).join('')}</div><script src="/bundle.js"></script></body></html>`;

// A localhost page: WebCodecs needs a secure context.
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(bundle);
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(page);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const { createRequire } = await import('node:module');
const loadPlaywright = () => {
  for (const base of [root, '/opt/node22/lib/node_modules/']) {
    try {
      return createRequire(path.join(base, 'noop.js'))('playwright');
    } catch {}
  }
  throw new Error('playwright not available');
};
const { chromium } = loadPlaywright();
const exe = fs.readdirSync('/opt/pw-browsers').filter((n) => /^chromium-\d+$/.test(n)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const tab = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
tab.on('pageerror', (e) => console.error('page error:', e.message));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => globalThis.Reel);

const timeline = {
  duration: placed.length * SCENE,
  scenes: placed.map((s, i) => ({ role: i === 0 ? 'hook' : i === placed.length - 1 ? 'cta' : 'content', start: i * SCENE, end: (i + 1) * SCENE, layers: [{ start: i * SCENE + ENTER, length: 1 }, { start: i * SCENE + ENTER + 0.6, length: 0.6 }] })),
};
// Keyframes: the motion's first frame, its middle, its end, per scene.
const keyframes = placed.flatMap((s, i) => {
  const enter = Math.round((i * SCENE + ENTER) * FPS);
  return [
    { scene: i, name: 'start', frame: enter },
    { scene: i, name: 'middle', frame: enter + Math.round(s.endFrame / 2) },
    { scene: i, name: 'end', frame: enter + s.endFrame },
  ];
});

const result = await tab.evaluate(
  async ({ timeline, keyframes, W, H, FPS, INSET }) => {
    const nodes = [...document.querySelectorAll('.slide-root')];
    const t0 = performance.now();
    const scenes = await globalThis.Reel.captureReel(nodes, { fontId: ['cairo', 'tajawal'], background: '#FFFFFF', width: W, height: H });
    const captureMs = performance.now() - t0;
    const layers = scenes.map((s) => s.layers.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height, text: Boolean(l.text), words: l.text?.layout.words.length ?? 0, lines: l.text?.layout.lines.length ?? 0, segments: l.text?.plan.segments.length ?? 0, bands: l.text?.plan.highlights.flatMap((h) => h.bands).length ?? 0, warnings: l.text?.plan.warnings.map((w) => w.code) ?? [] })));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const frames = keyframes.map((k) => {
      globalThis.Reel.drawFrame(ctx, scenes, timeline, k.frame / FPS, { accent: '#0C855D', insetTop: INSET.top, highlight: '#D9F4EB', fps: FPS });
      return { ...k, png: canvas.toDataURL('image/png') };
    });
    // Contact sheet: every keyframe at a quarter size, a row per scene.
    const q = 4;
    const sheet = document.createElement('canvas');
    sheet.width = (W / q + 12) * 3 + 12;
    sheet.height = (H / q + 12) * scenes.length + 12;
    const sctx = sheet.getContext('2d');
    sctx.fillStyle = '#888';
    sctx.fillRect(0, 0, sheet.width, sheet.height);
    for (const [j, f] of frames.entries()) {
      globalThis.Reel.drawFrame(ctx, scenes, timeline, f.frame / FPS, { accent: '#0C855D', insetTop: INSET.top, highlight: '#D9F4EB', fps: FPS });
      sctx.drawImage(canvas, 12 + (j % 3) * (W / q + 12), 12 + f.scene * (H / q + 12), W / q, H / q);
    }
    const t1 = performance.now();
    const encoded = await globalThis.Reel.encodeReel(scenes, timeline, { width: W, height: H, accent: '#0C855D', insetTop: INSET.top, highlight: '#D9F4EB', fps: FPS, container: 'mp4' });
    const encodeMs = performance.now() - t1;
    const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { layers, frames, sheet: sheet.toDataURL('image/png'), video: btoa(bin), extension: encoded.extension, codec: encoded.codec, captureMs, encodeMs };
  },
  { timeline, keyframes, W, H, FPS, INSET },
);
await browser.close();
server.close();

const save = (file, dataUrl) => fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
for (const f of result.frames) save(`keyframes/scene-${String(f.scene + 1).padStart(2, '0')}-${f.name}.png`, f.png);
save('contact.png', result.sheet);
fs.writeFileSync(path.join(outDir, `reel.${result.extension}`), Buffer.from(result.video, 'base64'));
const meta = {
  file: `reel.${result.extension}`,
  codec: result.codec,
  size: `${W}×${H}`,
  fps: FPS,
  frames: Math.round(timeline.duration * FPS),
  duration: timeline.duration,
  bytes: fs.statSync(path.join(outDir, `reel.${result.extension}`)).size,
  captureMs: Math.round(result.captureMs),
  encodeMs: Math.round(result.encodeMs),
  scenes: placed.map((s, i) => ({ scene: i + 1, id: s.id, title: s.title, text: s.spec.text, motion: s.motion, font: s.spec.font, fontSize: s.layout.fontSize, lines: s.layout.lines.length, warnings: s.warnings, motionWarnings: s.motionWarnings, endFrame: s.endFrame, layoutKey: s.key.layout, captured: result.layers[i] })),
  refused,
  keyframes: result.frames.map(({ png, ...k }) => ({ ...k, time: +(k.frame / FPS).toFixed(3), file: `keyframes/scene-${String(k.scene + 1).padStart(2, '0')}-${k.name}.png` })),
};
fs.writeFileSync(path.join(outDir, 'reel.json'), `${JSON.stringify(meta, null, 1)}\n`);
fs.writeFileSync(
  path.join(outDir, 'preview.html'),
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>معاينة ريل ArabicText</title><style>body{font-family:system-ui,sans-serif;margin:24px;background:#f3f5f4;color:#14181F}video{height:80vh;background:#000}main{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}img{max-width:100%}</style></head><body><h1>ريل ArabicText (${W}×${H}، ${FPS} إطارًا، ${timeline.duration} ثانية)</h1><p>${meta.codec === 'avc' ? 'H.264' : meta.codec.toUpperCase()} في حاوية MP4. الإطارات المفتاحية مرسومة بالدالة نفسها التي رسمت الفيديو.</p><main><video src="${meta.file}" controls loop muted playsinline></video><img src="contact.png" alt="الإطارات المفتاحية: بداية الحركة ومنتصفها ونهايتها لكل مشهد"></main></body></html>\n`,
);
console.log(JSON.stringify({ file: meta.file, codec: meta.codec, bytes: meta.bytes, frames: meta.frames, captureMs: meta.captureMs, encodeMs: meta.encodeMs, layers: result.layers.map((l) => l[0]) }, null, 1));
