// Style × composition QA (Design Library V2).
//
//   node scripts/style-qa.mjs [--styles a,b] [--compositions x,y] [--formats portrait,story]
//                             [--render] [--zoom hero/long,list/long] [--out docs/library]
//
// For every pair and every Arabic sample (short, long) it builds the design
// with the «كتاب وبس» identity, runs the quality gate (overflow, contrast,
// identity rules, Arabic text) and, with --render, draws the pages in
// Chromium with the real fonts, reads the text that still overflows after
// fitting, and writes one contact sheet per style. The matrix records what
// each pair proved (statuses: lib/studio/library/matrix.js): an automated
// pass is "needs_review" until a person (or the assistant) looked at the
// sheet and recorded a verdict for the pair's current fingerprint in
// review.json; only reviewed passes are "ready". Pairs a style does not
// claim are "not_claimed", never "ready".
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MemoryStore } from '../lib/studio/store.js';
import { openStudio, buildDesign } from '../lib/studio/studio.js';
import { KITABWBS_PRESET } from '../lib/studio/memory.js';
import { COMPOSITIONS } from '../lib/studio/compositions.js';
import { STYLES } from '../lib/studio/styles/catalog.js';
import { validateStyle } from '../lib/studio/styles.js';
import { SAMPLES } from '../lib/studio/library/samples.js';
import { seedQaArt, withArt } from '../lib/studio/library/art.js';
import { documentHtml } from '../lib/studio/htmlPreview.js';
import { FONTS } from '../lib/fonts.js';
import { ROLE_OF, claims, pairFingerprint, pairStatus } from '../lib/studio/library/matrix.js';

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};
const list = (v, all) => (v ? String(v).split(',') : all);
const outDir = path.resolve(root, opt('out', 'docs/library'));
const styles = list(opt('styles'), STYLES.map((s) => s.id));
const compositions = list(opt('compositions'), Object.keys(COMPOSITIONS).filter((c) => SAMPLES[c]));
const formats = list(opt('formats'), ['portrait']);
const render = Boolean(opt('render', false));
const zoom = list(opt('zoom'), []);

function fontCss() {
  const rules = [];
  const dir = path.join(root, 'node_modules/@fontsource');
  for (const [id, f] of Object.entries(FONTS)) {
    const pkg = path.join(dir, id);
    if (!fs.existsSync(pkg)) continue;
    for (const file of fs.readdirSync(path.join(pkg, 'files')).filter((n) => /-(arabic|latin)-\d+-normal\.woff2$/.test(n))) {
      const weight = Number(/-(\d+)-normal/.exec(file)[1]);
      const data = fs.readFileSync(path.join(pkg, 'files', file)).toString('base64');
      rules.push(`@font-face{font-family:${f.family.split(',')[0]};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');}`);
    }
  }
  return rules.join('\n');
}

function build(styleId, compositionId, size, format) {
  const studio = openStudio(new MemoryStore());
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const content = withArt(SAMPLES[compositionId][size], seedQaArt(studio));
  const pages = [{ composition: compositionId, content }];
  const { doc, quality } = buildDesign(studio, { brandId: 'kitabwbs', brief: `qa ${styleId ?? 'classic'}/${compositionId}/${size}`, ...(styleId && { style: { id: styleId } }), intent: { mode: 'post', format, pages: 1, platform: 'instagram' }, pages }, { save: false });
  return { doc, quality };
}

const errorCodes = (quality) => [...new Set(quality.issues.filter((i) => i.severity === 'error').map((i) => i.code))].sort();

const results = [];
const sheets = {};
for (const styleId of styles) {
  const style = STYLES.find((s) => s.id === styleId);
  const problems = validateStyle(style);
  if (problems.length) {
    results.push({ style: styleId, error: 'invalid style', problems });
    continue;
  }
  for (const compositionId of compositions) {
    for (const format of formats) {
      const claimed = claims(style, compositionId, format);
      const pair = { style: styleId, styleVersion: style.version, composition: compositionId, compositionVersion: COMPOSITIONS[compositionId]?.version ?? null, format, claimed, fingerprint: pairFingerprint(style, compositionId), samples: {} };
      for (const size of ['short', 'long']) {
        const { doc, quality } = build(styleId, compositionId, size, format);
        pair.samples[size] = { errors: quality.errors, warnings: quality.warnings, issues: quality.issues.filter((i) => i.severity === 'error').map((i) => i.code), chars: JSON.stringify(SAMPLES[compositionId][size]).length };
        // A sample that fails the same way without the style is a limit of
        // the composition in this format (too much text for the page), not a
        // style defect: recorded as such, with the gate's own suggestion.
        if (quality.errors) {
          const base = build(null, compositionId, size, format).quality;
          if (base.errors && JSON.stringify(errorCodes(base)) === JSON.stringify(errorCodes(quality))) {
            pair.samples[size].limit = { sameWithoutStyle: true, fix: quality.issues.find((i) => i.code === 'layout.overflow')?.message ?? null };
          }
        }
        (sheets[`${styleId}.${format}`] ??= []).push({ doc, label: `${compositionId} · ${size} · ${format}`, key: `${compositionId}/${size}/${format}` });
      }
      results.push(pair);
    }
  }
}

let overflow = {};
if (render) {
  const require = createRequire('/opt/node22/lib/node_modules/');
  const { chromium } = require('playwright');
  const css = fontCss();
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined });
  fs.mkdirSync(path.join(outDir, 'previews'), { recursive: true });
  for (const [sheet, items] of Object.entries(sheets)) {
    // One sheet per style and format: every sample side by side, 1/4 scale.
    const styleId = sheet.split('.')[0];
    const merged = { ...items[0].doc, pages: items.flatMap((it) => it.doc.pages.map((p) => ({ ...p, id: `${it.key}` }))), assets: Object.assign({}, ...items.map((it) => it.doc.assets)) };
    const html = documentHtml(merged, { fontCss: css, gap: 40 });
    const page = await browser.newPage({ viewport: { width: 1200 * 4, height: 1400 }, deviceScaleFactor: 0.25 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
    overflow[styleId] = [...(overflow[styleId] ?? []), ...(await page.evaluate(() => window.__fit))];
    await page.screenshot({ path: path.join(outDir, 'previews', `${sheet}.png`), fullPage: true });
    await page.close();
    // Single pages at half scale, for a closer look («--zoom list/long»).
    const close = items.filter((it) => zoom.some((z) => it.key.startsWith(z)));
    if (close.length) {
      const big = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 0.5 });
      await big.setContent(documentHtml({ ...merged, pages: merged.pages.filter((p) => close.some((it) => it.key === p.id)) }, { fontCss: css, gap: 0 }), { waitUntil: 'load' });
      await big.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
      fs.mkdirSync(path.join(outDir, 'previews', styleId), { recursive: true });
      for (const it of close) await big.locator(`[data-page="${it.key}"]`).screenshot({ path: path.join(outDir, 'previews', styleId, `${it.key.replace(/\//g, '-')}.png`) });
      await big.close();
    }
  }
  await browser.close();
}

// Reviews recorded after looking at the sheets:
// { "style/composition/format": { verdict, fingerprint, note, at } }.
const reviewFile = path.join(outDir, 'review.json');
const reviews = fs.existsSync(reviewFile) ? JSON.parse(fs.readFileSync(reviewFile, 'utf8')) : {};
for (const r of results) {
  if (r.error) continue;
  const key = `${r.style}/${r.composition}/${r.format}`;
  const over = render ? (overflow[r.style] ?? []).filter((o) => o.page.startsWith(`${r.composition}/`) && o.page.endsWith(`/${r.format}`)) : null;
  r.browser = render ? { overflow: over.map((o) => ({ sample: o.page.split('/')[1], element: o.el })) } : 'not run';
  const passes = (sample) => sample.errors === 0 || sample.limit?.sameWithoutStyle;
  const automated = passes(r.samples.short) && passes(r.samples.long) && (!render || over.length === 0);
  const limits = Object.entries(r.samples).filter(([, v]) => v.limit).map(([k]) => k);
  if (limits.length) r.limits = limits.map((k) => ({ sample: k, why: 'المحتوى أطول من سعة التكوين في هذا المقاس، والنتيجة نفسها دون الأسلوب' }));
  const review = reviews[key] ?? null;
  r.review = review && { ...review, current: review.fingerprint === r.fingerprint };
  r.status = pairStatus({ claimed: r.claimed, automated, rendered: render, review, fingerprint: r.fingerprint });
}
const summary = {};
for (const r of results) if (!r.error) summary[r.status] = (summary[r.status] ?? 0) + 1;
const matrix = { kind: 'style-composition-matrix', generatedAt: new Date().toISOString().slice(0, 10), identity: 'kitabwbs', rendered: render, summary, pairs: results };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'matrix.json'), `${JSON.stringify(matrix, null, 1)}\n`);
console.log(JSON.stringify({ summary, failed: results.filter((r) => r.status === 'failed').map((r) => ({ pair: `${r.style}/${r.composition}`, short: r.samples.short.issues, long: r.samples.long.issues, overflow: r.browser?.overflow })) }, null, 1));
