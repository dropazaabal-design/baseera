// Style × composition QA (Design Library V2).
//
//   node scripts/style-qa.mjs [--styles a,b] [--compositions x,y] [--formats portrait,story]
//                             [--render] [--zoom hero/long,list/long] [--out docs/library]
//
// For every pair and every Arabic sample (short, long; in light and dark for
// styles with both modes) it builds the design
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
import { SAMPLES, sampleOf } from '../lib/studio/library/samples.js';
import { seedQaArt, withArt } from '../lib/studio/library/art.js';
import { documentHtml } from '../lib/studio/htmlPreview.js';
import { FONTS } from '../lib/fonts.js';
import { ROLE_OF, claims, declinedWhy, pairFingerprint, pairStatus, sequenceFingerprint, sequenceKey, sequencePages, sequenceReviewKey, sequencesFor } from '../lib/studio/library/matrix.js';

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

function build(styleId, compositionId, size, format, mode = null) {
  const studio = openStudio(new MemoryStore());
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const sample = sampleOf(compositionId, size);
  const content = withArt(sample.content, seedQaArt(studio));
  const pages = [{ composition: compositionId, content, ...(sample.variant && { variant: sample.variant }) }];
  const { doc, quality } = buildDesign(studio, { brandId: 'kitabwbs', brief: `qa ${styleId ?? 'classic'}/${compositionId}/${size}`, ...(styleId && { style: { id: styleId, ...(mode && { mode }) } }), intent: { mode: 'post', format, pages: 1, platform: 'instagram' }, pages }, { save: false });
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
    // Formats the style does not declare are not tested (nor counted).
    for (const format of formats.filter((f) => style.formats.includes(f))) {
      const claimed = claims(style, compositionId, format);
      const pair = { ...(!claimed && { why: declinedWhy(style, compositionId) }), style: styleId, styleVersion: style.version, composition: compositionId, compositionVersion: COMPOSITIONS[compositionId]?.version ?? null, format, claimed, fingerprint: pairFingerprint(style, compositionId), samples: {} };
      // A style with light and dark pages is checked in both modes: the
      // same composition must work wherever the sequence puts it.
      const modes = style.tokens.light && style.tokens.dark ? ['light', 'dark'] : [null];
      // short and long, then any other layout the samples carry.
      for (const [size, mode] of Object.keys(SAMPLES[compositionId]).flatMap((z) => modes.map((m) => [z, m]))) {
        const sample = mode ? `${size}-${mode}` : size;
        const { doc, quality } = build(styleId, compositionId, size, format, mode);
        pair.samples[sample] = { errors: quality.errors, warnings: quality.warnings, issues: quality.issues.filter((i) => i.severity === 'error').map((i) => i.code), chars: JSON.stringify(sampleOf(compositionId, size).content).length };
        // A sample that fails the same way without the style is a limit of
        // the composition in this format (too much text for the page), not a
        // style defect: recorded as such, with the gate's own suggestion.
        if (quality.errors) {
          const base = build(null, compositionId, size, format).quality;
          if (base.errors && JSON.stringify(errorCodes(base)) === JSON.stringify(errorCodes(quality))) {
            pair.samples[sample].limit = { sameWithoutStyle: true, fix: quality.issues.find((i) => i.code === 'layout.overflow')?.message ?? null };
          }
        }
        if (claimed) (sheets[`${styleId}.${format}`] ??= []).push({ doc, label: `${compositionId} · ${sample} · ${format}`, key: `${compositionId}/${sample}/${format}` });
      }
      results.push(pair);
    }
  }
}

// The acceptance carousel per style (portrait): the sequence, with
// pagination and light/dark alternation, built and checked like a pair.
const sequences = {};
const sequenceDefs = {};
for (const styleId of styles) {
  const style = STYLES.find((s) => s.id === styleId);
  if (!style || validateStyle(style).length || !style.formats.includes('portrait')) continue;
  for (const def of sequencesFor(style)) {
    const studio = openStudio(new MemoryStore());
    studio.memory.saveBrand('default', KITABWBS_PRESET);
    const ids = seedQaArt(studio);
    const pages = sequencePages(style, 'portrait', def).map((p) => ({ ...p, content: withArt(p.content, ids) }));
    const { doc, quality } = buildDesign(studio, { brandId: 'kitabwbs', brief: `qa sequence ${styleId} ${def.id}`, style: { id: styleId }, intent: { mode: 'carousel', format: 'portrait', pages: pages.length, platform: 'instagram' }, pages }, { save: false });
    const key = sequenceKey(styleId, def);
    sequenceDefs[key] = { styleId, def };
    sequences[key] = { sequence: def.id, fingerprint: sequenceFingerprint(style, def), pages: pages.map((p) => p.variant ? `${p.composition}/${p.variant}` : p.composition), modes: doc.pages.map((p) => p.styleMode ?? 'light'), errors: quality.errors, warnings: quality.warnings, issues: quality.issues.filter((i) => i.severity === 'error').map((i) => i.code) };
    // Sheet names: <style>.sequence (listening carousel), <style>.<id>.
    sheets[key === styleId ? `${styleId}.sequence` : `${styleId}.${def.id}`] = [{ doc, key: 'sequence', label: 'sequence', seqKey: key }];
  }
}

let overflow = {};
const orphans = {};
if (render) {
  const require = createRequire('/opt/node22/lib/node_modules/');
  const { chromium } = require('playwright');
  const css = fontCss();
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined });
  fs.mkdirSync(path.join(outDir, 'previews'), { recursive: true });
  for (const [sheet, items] of Object.entries(sheets)) {
    // One sheet per style and format: every sample side by side, 1/4 scale.
    const styleId = sheet.split('.')[0];
    const merged = { ...items[0].doc, pages: items.flatMap((it) => it.doc.pages.map((p, i) => ({ ...p, id: it.doc.pages.length > 1 ? `${it.key}/${i + 1}` : `${it.key}` }))), assets: Object.assign({}, ...items.map((it) => it.doc.assets)) };
    const html = documentHtml(merged, { fontCss: css, gap: 40 });
    const page = await browser.newPage({ viewport: { width: 1200 * 4, height: 1400 }, deviceScaleFactor: 0.25 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
    const fit = await page.evaluate(() => window.__fit);
    for (const o of await page.evaluate(() => window.__orphans ?? [])) (orphans[styleId] ??= []).push({ ...o, sheet });
    if (items[0].seqKey) sequences[items[0].seqKey].browserOverflow = fit.map((o) => ({ page: o.page, element: o.el }));
    else overflow[styleId] = [...(overflow[styleId] ?? []), ...fit];
    await page.screenshot({ path: path.join(outDir, 'previews', `${sheet}.png`), fullPage: true });
    // Where each page sits on the sheet, in image pixels: lets a later run
    // be compared page by page with the sheet that was reviewed.
    const rects = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => { const r = p.getBoundingClientRect(); return { id: p.dataset.page, x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height }; }));
    fs.writeFileSync(path.join(outDir, 'previews', `${sheet}.pages.json`), `${JSON.stringify(rects.map((r) => ({ ...r, x: Math.round(r.x * 0.25), y: Math.round(r.y * 0.25), w: Math.round(r.w * 0.25), h: Math.round(r.h * 0.25) })))}\n`);
    await page.close();
    // Single pages at half scale, for a closer look («--zoom list/long»).
    const close = items.filter((it) => zoom.some((z) => it.key.startsWith(z)));
    if (close.length) {
      const big = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 0.5 });
      const wanted = merged.pages.filter((p) => close.some((it) => p.id === it.key || p.id.startsWith(`${it.key}/`)));
      await big.setContent(documentHtml({ ...merged, pages: wanted }, { fontCss: css, gap: 0 }), { waitUntil: 'load' });
      await big.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
      fs.mkdirSync(path.join(outDir, 'previews', styleId), { recursive: true });
      for (const p of wanted) await big.locator(`[data-page="${p.id}"]`).screenshot({ path: path.join(outDir, 'previews', styleId, `${p.id.replace(/\//g, '-')}.png`) });
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
  const lone = render ? (orphans[r.style] ?? []).filter((o) => o.page.startsWith(`${r.composition}/`) && o.page.endsWith(`/${r.format}`)) : [];
  r.browser = render ? { overflow: over.map((o) => ({ sample: o.page.split('/')[1], element: o.el })), loneLastWord: lone.map((o) => o.page.split('/')[1]) } : 'not run';
  const passes = (sample) => sample.errors === 0 || sample.limit?.sameWithoutStyle;
  const automated = Object.values(r.samples).every(passes) && (!render || over.length === 0);
  const limits = Object.entries(r.samples).filter(([, v]) => v.limit).map(([k]) => k);
  if (limits.length) r.limits = limits.map((k) => ({ sample: k, why: 'المحتوى أطول من سعة التكوين في هذا المقاس، والنتيجة نفسها دون الأسلوب' }));
  const review = reviews[key] ?? null;
  r.review = review && { ...review, current: review.fingerprint === r.fingerprint };
  r.status = pairStatus({ claimed: r.claimed, automated, rendered: render, review, fingerprint: r.fingerprint });
}
for (const [key, seq] of Object.entries(sequences)) {
  const review = reviews[sequenceReviewKey(sequenceDefs[key].styleId, sequenceDefs[key].def)] ?? null;
  const automated = seq.errors === 0 && (!render || (seq.browserOverflow ?? []).length === 0);
  seq.review = review && { ...review, current: review.fingerprint === seq.fingerprint };
  seq.status = pairStatus({ claimed: true, automated, rendered: render, review, fingerprint: seq.fingerprint });
}
const summary = {};
for (const r of results) if (!r.error) summary[r.status] = (summary[r.status] ?? 0) + 1;
// Per style, counted by composition (a composition is ready for a style
// only when it is ready in every format the style declares), so the count
// is never inflated by multiplying formats.
const byStyle = {};
for (const r of results) {
  if (r.error) continue;
  const st = (byStyle[r.style] ??= { formats: [], ready: [], notReady: [], notClaimed: [] });
  if (!st.formats.includes(r.format)) st.formats.push(r.format);
}
for (const [styleId, st] of Object.entries(byStyle)) {
  const rows = results.filter((r) => r.style === styleId && !r.error);
  for (const c of [...new Set(rows.map((r) => r.composition))]) {
    const cr = rows.filter((r) => r.composition === c);
    if (cr.every((r) => r.status === 'not_claimed')) st.notClaimed.push({ composition: c, why: declinedWhy(STYLES.find((x) => x.id === styleId), c) });
    else if (cr.every((r) => r.status === 'ready')) st.ready.push(c);
    else st.notReady.push(`${c} (${cr.filter((r) => r.status !== 'ready').map((r) => `${r.format}: ${r.status}`).join(', ')})`);
  }
}
// Titles of four words or more drawn with a lone last word, counted per
// style (a typographic warning: it does not fail a pair; it is reported).
const titleOrphans = Object.fromEntries(Object.entries(orphans).map(([k, v]) => [k, v.map((o) => o.page)]));
const totals = { styles: Object.keys(byStyle).length, compositions: compositions.length, readyStyleCompositionPairs: Object.values(byStyle).reduce((t, st) => t + st.ready.length, 0), possiblePairs: Object.keys(byStyle).length * compositions.length };
const matrix = { kind: 'style-composition-matrix', generatedAt: new Date().toISOString().slice(0, 10), identity: 'kitabwbs', rendered: render, sequences, titleOrphans, note: 'Reviews bind to the layout engine version, the style\'s visual fields, the composition code and the samples; changing any of them returns the pair to needs_review.', totals, summary, byStyle, pairs: results };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'matrix.json'), `${JSON.stringify(matrix, null, 1)}\n`);
console.log(JSON.stringify({ totals, summary, titleOrphans: Object.fromEntries(Object.entries(titleOrphans).map(([k, v]) => [k, v.length])), sequences: Object.fromEntries(Object.entries(sequences).map(([k, v]) => [k, `${v.status} (${v.errors} errors${v.issues.length ? `: ${v.issues.join(', ')}` : ''})`])), failed: results.filter((r) => r.status === 'failed').map((r) => ({ pair: `${r.style}/${r.composition}/${r.format}`, issues: Object.fromEntries(Object.entries(r.samples).filter(([, v]) => v.issues.length).map(([k, v]) => [k, v.issues])), overflow: r.browser?.overflow })) }, null, 1));
