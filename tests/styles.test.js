import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MemoryStore } from '../lib/studio/store.js';
import { buildDesign, openStudio } from '../lib/studio/studio.js';
import { KITABWBS_PRESET } from '../lib/studio/memory.js';
import { STYLES } from '../lib/studio/styles/catalog.js';
import { SOURCES } from '../lib/studio/styles/sources.js';
import { evaluate, pageModes, pageRole, styleById, styleTheme, validateStyle } from '../lib/studio/styles.js';
import { pageTheme, themeFromBrand } from '../lib/studio/theme.js';
import { contrastRatio } from '../lib/contrast.js';
import { extractDesignRules } from '../lib/studio/styleCompiler.js';
import { SAMPLES } from '../lib/studio/library/samples.js';
import { QA_ART, seedQaArt, withArt } from '../lib/studio/library/art.js';
import { claims, pairFingerprint, pairStatus, styleClaimProblems } from '../lib/studio/library/matrix.js';
import { documentHtml } from '../lib/studio/htmlPreview.js';

function build(pages, { style = null, format = 'portrait' } = {}) {
  const studio = openStudio(new MemoryStore());
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const ids = seedQaArt(studio);
  return buildDesign(studio, { brandId: 'kitabwbs', brief: 'style test', ...(style && { style: { id: style } }), intent: { mode: pages.length > 1 ? 'carousel' : 'post', format, pages: pages.length, platform: 'instagram' }, pages: pages.map(([composition, content]) => ({ composition, content: withArt(content, ids) })) }, { save: false });
}

// A style with both modes, for the theme tests (not in the catalog).
const TWO_MODES = {
  ...STYLES[0],
  id: 'two-modes-test',
  tokens: { light: { bg: '#FFFFFF', surface: '#F3F6FA', text: '#111827', muted: '#4B5563' }, dark: { bg: '#0E2A5C', surface: '#16386F', text: '#F8FAFC', muted: '#C3CEDD' } },
};

test('every catalog style is valid data with provenance, a status and pinned sources', () => {
  assert.ok(STYLES.length >= 1);
  for (const s of STYLES) {
    assert.deepEqual(validateStyle(s), [], s.id);
    for (const p of s.provenance) {
      if (!p.source) continue;
      const pinned = SOURCES.find((x) => x.repo === p.source.repo && x.path === p.source.path);
      assert.ok(pinned, `${s.id}: source ${p.source.path} is pinned`);
      assert.equal(p.source.blob, pinned.blob);
      assert.match(p.source.commit, /^[0-9a-f]{40}$/);
    }
  }
  const ids = STYLES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
});

test('validateStyle rejects broken records', () => {
  const bad = { ...STYLES[0], id: 'Bad Id', status: 'done', tokens: { light: { bg: 'white' } }, decor: { hero: [{ shape: 'star' }] }, provenance: [] };
  const paths = validateStyle(bad).map((p) => p.path);
  for (const p of ['id', 'status', 'tokens.light.bg', 'tokens.light.text', 'decor.hero', 'decor.hero[0].shape', 'decor.hero[0].x', 'provenance']) assert.ok(paths.includes(p), p);
});

test('style compiler keeps explicit values, flags vague and non-Arabic rules, invents nothing', () => {
  // SYNTHETIC fixture in the DESIGN.md shape of the pinned sources.
  const md = [
    '# Sample editorial',
    '## 1. Colour',
    '- **Background:** `#FAF7F2` (paper)',
    '- **Accent:** `#C0512F` — one hero element per page',
    '- **Muted:** `#8A817A` — Token from style foundations',
    '## 2. Typography',
    '- **Display:** GT Sectra (serif)',
    '- **Body:** Söhne, sans',
    '- **Scale (px):** 12 · 14 · 16 · 20 · 28 · 40',
    '- **Spacing scale:** 4/8/12/16/24',
    '- Line-height: 1.6 for body, 1.2 for display',
    '- Headings use letter-spacing -0.02em and Title Case',
    '## 3. Layout',
    '- Never use border-radius above 24px or border-radius below 8px',
    '- Let whitespace breathe',
    '- 12-column grid, 1200px max-width, 24px gutters',
  ].join('\n');
  const r = extractDesignRules(md, { repo: 'synthetic' });
  assert.equal(r.explicit.colors.background.hex, '#FAF7F2');
  assert.equal(r.explicit.colors.accent.hex, '#C0512F');
  assert.equal(r.explicit.colors.muted.note, undefined, 'template boilerplate is not a note');
  assert.equal(r.boilerplate, true);
  assert.deepEqual(r.explicit.typeScale, [12, 14, 16, 20, 28, 40]);
  assert.deepEqual(r.explicit.spacing.scale, [4, 8, 12, 16, 24], 'spacing is not read as a type scale');
  assert.deepEqual(r.explicit.lineHeight, { body: 1.6, display: 1.2 });
  assert.deepEqual({ max: r.explicit.radius.max, min: r.explicit.radius.min }, { max: 24, min: 8 });
  assert.deepEqual(r.explicit.grid, { columns: 12, maxWidth: 1200, gutter: 24 });
  assert.equal(r.explicit.fonts.display.category, 'serif');
  assert.equal(r.explicit.fonts.display.arabic, false);
  assert.ok(r.notForArabic.some((n) => /letter-spacing/.test(n.text)));
  assert.ok(r.notForArabic.some((n) => /Latin face/.test(n.why)));
  assert.ok(r.ambiguous.some((a) => /whitespace/.test(a.text)), 'vague rule is ambiguous');
  assert.equal(r.explicit.weights, null, 'absent values stay absent');
});

test('style theme: brand accent replaces the source accent; white labels get a derived darker fill, recorded', () => {
  const style = styleById('quiet-editorial');
  const theme = styleTheme(style, { brand: KITABWBS_PRESET });
  assert.equal(theme.colors.bg, '#FFFFFF', 'the brand keeps its white background');
  assert.notEqual(theme.colors.accent, '#C0512F');
  assert.ok(contrastRatio('#FFFFFF', theme.colors.accent) >= 4.5);
  assert.equal(theme.colors.onAccent, '#FFFFFF');
  assert.deepEqual(theme.derived.map((d) => [d.role, d.mode, d.from]), [['accent', 'light', '#2E7BC5']]);
  assert.ok(contrastRatio(theme.colors.text, theme.colors.bg) >= 4.5);
  assert.ok(contrastRatio(theme.colors.muted, theme.colors.bg) >= 4.5);
  // Same rule without a style, and recorded the same way.
  const plain = themeFromBrand(KITABWBS_PRESET);
  assert.ok(contrastRatio('#FFFFFF', plain.colors.accent) >= 4.5);
  assert.deepEqual(plain.derived.map((d) => [d.role, d.from, d.to]), [['accent', '#2E7BC5', plain.colors.accent]]);
});

test('dark and alternating modes: pages read their mode, colours stay legible', () => {
  const theme = styleTheme(TWO_MODES, { brand: KITABWBS_PRESET });
  assert.ok(theme.dark);
  assert.equal(theme.dark.bg, '#0E2A5C', 'the brand dark colour is the dark background');
  assert.ok(contrastRatio(theme.dark.text, theme.dark.bg) >= 4.5);
  assert.ok(contrastRatio(theme.dark.onAccent, theme.dark.accent) >= 4.5);
  assert.deepEqual(pageModes(TWO_MODES, 4, 'alternate'), ['dark', 'light', 'dark', 'light']);
  assert.deepEqual(pageModes({ ...TWO_MODES, alternateStart: 'light' }, 3, 'alternate'), ['light', 'dark', 'light']);
  assert.deepEqual(pageModes(STYLES[0], 3, 'alternate'), ['light', 'light', 'light'], 'a light-only style cannot alternate');
  const doc = { theme, pages: [] };
  assert.equal(pageTheme(doc, { styleMode: 'dark' }).colors.bg, theme.dark.bg);
  assert.equal(pageTheme(doc, { styleMode: 'light' }).colors.bg, theme.colors.bg);
});

test('page role comes from the composition, not the position', () => {
  assert.equal(pageRole({ role: 'hook', type: 'cover' }), 'cover');
  assert.equal(pageRole({ role: 'cta', type: 'outro' }), 'cta');
  assert.equal(pageRole({ role: 'content', type: 'post' }), 'content');
  const { doc } = build([['post', SAMPLES.post.short]], { style: 'quiet-editorial' });
  assert.ok(doc.pages[0].elements.some((e) => e.id === 'style-content-0'), 'a single post gets content decoration, not a cover bar');
});

test('style expressions: arithmetic over page variables, nothing else', () => {
  const vars = { W: 1080, H: 1350, T: 0, B: 0, M: 96, R: 170 };
  assert.equal(evaluate('W-2*M', vars), 888);
  assert.equal(evaluate('(W-M)/2', vars), 492);
  assert.equal(evaluate('R-32', vars), 138);
  assert.equal(evaluate(-12, vars), -12);
  for (const bad of ['W+', 'Z', 'alert(1)', 'W;1']) assert.throws(() => evaluate(bad, vars), /bad style expression/);
});

test('documents without a style render as before; a style replaces composition decoration', () => {
  const content = SAMPLES.list.short;
  const plain = build([['list', content]]).doc;
  const styled = build([['list', content]], { style: 'quiet-editorial' }).doc;
  assert.equal(plain.style, undefined);
  assert.ok(!plain.pages[0].elements.some((e) => e.id.startsWith('style-')));
  assert.deepEqual(styled.style, { id: 'quiet-editorial', version: 1, mode: 'light' });
  const decorLayer = styled.pages[0].elements.filter((e) => e.z < 10);
  assert.ok(decorLayer.length && decorLayer.every((e) => e.id.startsWith('style-')), 'the decoration layer holds only the style decoration');
  assert.ok(plain.pages[0].elements.filter((e) => e.z < 10).every((e) => !e.id.startsWith('style-')));
  // Outlined cards and plain accent numbers (no badge circles) in this style.
  const cards = styled.pages[0].elements.filter((e) => e.kind === 'shape' && /item-\d+-card/.test(e.id));
  assert.ok(cards.length && cards.every((c) => c.fill === 'none' && c.stroke), 'outlined cards');
  assert.ok(!styled.pages[0].elements.some((e) => e.kind === 'shape' && e.shape === 'ellipse' && /badge/.test(e.id)));
  assert.notDeepEqual(plain.pages[0].elements.map((e) => e.id), styled.pages[0].elements.map((e) => e.id));
});

test('quiet-editorial decoration sits above the content in every format and starts at the reading start', () => {
  for (const format of ['portrait', 'square', 'story']) {
    for (const [comp, content] of [['list', SAMPLES.list.long], ['statement', SAMPLES.statement.long], ['hero', SAMPLES.hero.long], ['outro', SAMPLES.outro.long]]) {
      const { doc } = build([[comp, content]], { style: 'quiet-editorial', format });
      const page = doc.pages[0];
      const decor = page.elements.filter((e) => e.id.startsWith('style-'));
      const content0 = Math.min(...page.elements.filter((e) => e.z >= 10 && e.z < 100).map((e) => e.frame.y));
      assert.ok(decor.length, `${comp}/${format} has style decoration`);
      for (const d of decor) {
        assert.ok(d.frame.y + d.frame.height <= content0 - 8, `${comp}/${format}: ${d.id} clears the content (${d.frame.y + d.frame.height} vs ${content0})`);
        assert.equal(Math.round(d.frame.x + d.frame.width), page.widthPx - 96, `${comp}/${format}: ${d.id} starts at the right margin`);
      }
    }
  }
});

test('short content grows to the style cap; unstyled keeps the composition cap', () => {
  const plain = build([['quote', SAMPLES.quote.short]]).doc.pages[0];
  const styled = build([['quote', SAMPLES.quote.short]], { style: 'quiet-editorial' }).doc.pages[0];
  assert.ok(plain.layout.scale <= 1.1 + 1e-9);
  assert.ok(styled.layout.scale > plain.layout.scale && styled.layout.scale <= styleById('quiet-editorial').layout.maxScale + 1e-9);
});

test('QA art is original, recolourable and free of people', () => {
  for (const a of QA_ART) {
    assert.match(a.svg, /data-token/);
    assert.doesNotMatch(a.svg, /<image|href=|<script/i, 'no external or embedded images, no script');
  }
  const { doc, quality } = build([['collage', SAMPLES.collage.long]], { style: 'quiet-editorial' });
  assert.equal(quality.errors, 0);
  const imgs = doc.pages[0].elements.filter((e) => e.kind === 'image');
  assert.equal(imgs.length, 3);
  for (const e of imgs) assert.equal(doc.assets[e.assetId].provenance.kind, 'generated');
});

test('preview text boxes never clip glyphs (the dots of a final ي)', () => {
  const { doc } = build([['list', SAMPLES.list.long]], { style: 'quiet-editorial' });
  const html = documentHtml(doc);
  assert.match(html, /\.t\{[^}]*overflow:visible/);
  assert.doesNotMatch(html, /\.t\{[^}]*overflow:hidden/);
  const editor = fs.readFileSync('components/studio/ScenePage.jsx', 'utf8');
  const textEl = editor.slice(editor.indexOf('function TextEl'), editor.indexOf('function', editor.indexOf('function TextEl') + 10));
  assert.doesNotMatch(textEl, /overflow-hidden/);
});

test('matrix: statuses are earned per pair and expire when the style changes', () => {
  const style = styleById('quiet-editorial');
  const fp = pairFingerprint(style, 'list');
  assert.equal(pairFingerprint({ ...style, status: 'reusable', name: 'x' }, 'list'), fp, 'status and names do not void a review');
  assert.notEqual(pairFingerprint({ ...style, layout: { ...style.layout, margin: 80 } }, 'list'), fp, 'a visual edit does');
  assert.notEqual(pairFingerprint(style, 'quote'), fp);
  const review = { verdict: 'ready', fingerprint: fp };
  assert.equal(pairStatus({ claimed: false, automated: true, rendered: true, review, fingerprint: fp }), 'not_claimed');
  assert.equal(pairStatus({ claimed: true, automated: false, rendered: true, review, fingerprint: fp }), 'failed');
  assert.equal(pairStatus({ claimed: true, automated: true, rendered: false, review, fingerprint: fp }), 'needs_review');
  assert.equal(pairStatus({ claimed: true, automated: true, rendered: true, review: { ...review, fingerprint: 'old' }, fingerprint: fp }), 'needs_review');
  assert.equal(pairStatus({ claimed: true, automated: true, rendered: true, review, fingerprint: fp }), 'ready');
  assert.equal(pairStatus({ claimed: true, automated: true, rendered: true, review: { ...review, verdict: 'unsuitable' }, fingerprint: fp }), 'unsuitable');
  assert.equal(claims(style, 'collage', 'portrait'), false, 'the collage is claimed only by collage styles');
});

test('a style claims preview_verified or reusable only with every claimed pair ready in the committed matrix', () => {
  const matrix = JSON.parse(fs.readFileSync('docs/library/matrix.json', 'utf8'));
  for (const s of STYLES) assert.deepEqual(styleClaimProblems(s, matrix), [], s.id);
  const pretend = { ...styleById('quiet-editorial'), layout: { ...styleById('quiet-editorial').layout, margin: 70 } };
  assert.ok(styleClaimProblems(pretend, matrix).length > 0, 'a changed style loses its claim until reviewed again');
  assert.ok(styleClaimProblems({ ...pretend, id: 'never-tested', status: 'reusable' }, matrix).length > 0);
});

// --- Batch: compositions, title wrapping, modes, treatments -----------------

import { wrapLines } from '../lib/studio/measure.js';
import { checkDesign } from '../lib/studio/quality.js';
import { SEQUENCE } from '../lib/studio/library/samples.js';

const carousel = (style, pages) => {
  const studio = openStudio(new MemoryStore());
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  const ids = seedQaArt(studio);
  return buildDesign(studio, { brandId: 'kitabwbs', brief: 'seq', style: { id: style }, intent: { mode: 'carousel', format: 'portrait', pages: pages.length, platform: 'instagram' }, pages: pages.map((p) => ({ ...p, content: withArt(p.content, ids) })) }, { save: false });
};
const byId = (page, id) => page.elements.find((e) => e.id === id);

test('framework: tiles keep each name and explanation in its own slot; a short last row takes the full width', () => {
  const { doc, quality } = build([['framework', SAMPLES.framework.short]], { style: 'quiet-editorial' });
  assert.equal(quality.errors, 0);
  const page = doc.pages[0];
  assert.equal(byId(page, 'part-1').slot, 'parts.0');
  assert.equal(byId(page, 'part-1-body').slot, 'details.0');
  assert.equal(byId(page, 'part-1').text, 'انتبه');
  const c1 = byId(page, 'part-1-card').frame;
  const c3 = byId(page, 'part-3-card').frame;
  assert.ok(c3.width > c1.width * 1.8, 'third tile spans the row');
  assert.ok(c1.x > byId(page, 'part-2-card').frame.x, 'first tile on the right (RTL)');
  assert.ok(page.elements.every((e) => !/-link$/.test(e.id)), 'a grid has no links');
  const chain = carousel('quiet-editorial', [{ composition: 'framework', variant: 'chain', content: SAMPLES.framework.short }]).doc.pages[0];
  const links = chain.elements.filter((e) => /^part-\d-link$/.test(e.id));
  assert.equal(links.length, 2, 'a chain of three joins twice');
  assert.ok(links.every((l) => l.frame.x > chain.layout.region.x + chain.layout.region.width / 2), 'links on the reading-start side');
});

test('stat: a figure with Arabic letters gets Arabic line spacing; no source line is invented', () => {
  const { doc } = build([['stat', SAMPLES.stat.long]], { style: 'quiet-editorial' });
  const fig = byId(doc.pages[0], 'figure');
  assert.equal(fig.style.lineHeight, 1.6);
  assert.equal(byId(build([['stat', SAMPLES.stat.short]], { style: 'quiet-editorial' }).doc.pages[0], 'figure').style.lineHeight, 1.15);
  const { source, ...noSource } = SAMPLES.stat.short;
  const page = build([['stat', noSource]], { style: 'quiet-editorial' }).doc.pages[0];
  assert.ok(!byId(page, 'source') && !byId(page, 'source-rule'));
});

test('styled titles wrap stably: a lone last word moves down, the frame keeps the line count; unstyled titles are untouched', () => {
  const page = carousel('collage-cutout', [SEQUENCE.pages[3]]).doc.pages[0];
  const t = byId(page, 'title');
  const style = { font: 'cairo', weight: t.style.weight, size: t.style.fontSize, lineHeight: t.style.lineHeight };
  const lines = wrapLines(t.text.replace(/\*/g, ''), style, t.frame.width);
  assert.equal(lines.length, 2);
  assert.ok(lines.at(-1).text.trim().split(/\s+/).length >= 2, `last line «${lines.at(-1).text}»`);
  assert.ok(t.frame.width < page.layout.region.width);
  const plain = build([['numbered', SEQUENCE.pages[3].content]]).doc.pages[0];
  assert.equal(byId(plain, 'title').frame.width, plain.layout.region.width, 'classic keeps full-width titles');
});

test('page modes: by role (magazine: dark cover and closing) or alternating from a dark cover (collage)', () => {
  const pages = [SEQUENCE.pages[0], SEQUENCE.pages[1], SEQUENCE.pages[2], SEQUENCE.pages[7]].map(({ fallback, ...p }) => (p.composition === 'collage' ? { ...p, composition: 'hero', content: { title: p.content.title } } : p));
  assert.deepEqual(carousel('magazine-bold', pages).doc.pages.map((p) => p.styleMode), ['dark', 'light', 'light', 'dark']);
  assert.deepEqual(carousel('collage-cutout', pages).doc.pages.map((p) => p.styleMode), ['dark', 'light', 'dark', 'light']);
  const dark = carousel('collage-cutout', pages).doc;
  assert.equal(pageTheme(dark, dark.pages[0]).colors.bg, '#0E2A5C');
  assert.ok(contrastRatio(pageTheme(dark, dark.pages[0]).colors.accent, '#0E2A5C') >= 4.5, 'accent lightened on navy');
});

test('treatments: plain kickers, centred plain lists, figures in ink', () => {
  const swiss = build([['hero', SAMPLES.hero.short]], { style: 'swiss-editorial' }).doc.pages[0];
  assert.equal(byId(swiss, 'kicker').kind, 'text');
  assert.equal(byId(swiss, 'kicker').style.color, '@accent');
  assert.ok(!byId(swiss, 'kicker-bg'), 'no pill behind a plain kicker');
  const minimal = build([['post', SAMPLES.post.short]], { style: 'quiet-minimal' }).doc.pages[0];
  const region = minimal.layout.region;
  const items = minimal.elements.filter((e) => /^point-\d$/.test(e.id));
  const left = Math.min(...items.map((e) => e.frame.x));
  const right = Math.max(...minimal.elements.filter((e) => /^point-\d-icon$/.test(e.id)).map((e) => e.frame.x + e.frame.width));
  assert.ok(Math.abs(left - region.x - (region.x + region.width - right)) < 4, 'the list block sits in the middle');
  const news = build([['stat', SAMPLES.stat.short]], { style: 'newspaper-editorial' }).doc.pages[0];
  assert.equal(byId(news, 'figure').style.color, '@text');
});

test('watermarks: the ghost number appears only on open pages and is the only text allowed under text', () => {
  const statement = build([['statement', SAMPLES.statement.long]], { style: 'magazine-bold' });
  assert.ok(statement.doc.pages[0].elements.some((e) => e.id === 'style-content-0'));
  assert.equal(statement.quality.errors, 0);
  for (const comp of ['list', 'numbered', 'framework', 'stat']) assert.ok(!build([[comp, SAMPLES[comp].long]], { style: 'magazine-bold' }).doc.pages[0].elements.some((e) => e.id === 'style-content-0'), comp);
  // The same ghost number at full opacity is a text collision.
  const doc = structuredClone(statement.doc);
  doc.pages[0].elements.find((e) => e.id === 'style-content-0').opacity = 1;
  assert.ok(checkDesign(doc).issues.some((i) => i.code === 'layout.overlap'));
});

test('carousel-only decoration: the geometric cover circle turns pale where the swipe button sits', () => {
  const single = build([['hero', SAMPLES.hero.short]], { style: 'geometric-editorial' }).doc.pages[0];
  const circle = single.elements.find((e) => e.shape === 'ellipse' && e.role === 'decor' && e.frame.width === 480);
  assert.equal(circle.fill, '@accent');
  const multi = carousel('geometric-editorial', [{ composition: 'hero', content: SAMPLES.hero.short }, SEQUENCE.pages[1]]).doc.pages[0];
  assert.equal(multi.elements.find((e) => e.shape === 'ellipse' && e.role === 'decor' && e.frame.width === 480).fill, '@surface');
});

test('style validation covers treatments, modes and declined roles', () => {
  const s = styleById('magazine-bold');
  const paths = (x) => validateStyle(x).map((p) => p.path);
  assert.ok(paths({ ...s, treatment: { ...s.treatment, pillFill: 'fill' } }).includes('treatment.pillFill'));
  assert.ok(paths({ ...s, treatment: { ...s.treatment, cardMode: 'shadow' } }).includes('treatment.cardMode'));
  assert.ok(paths({ ...s, modeByRole: { cover: 'sepia' } }).includes('modeByRole.cover'));
  assert.ok(paths({ ...s, notFor: { list: 'x' } }).includes('notFor.list'));
  assert.ok(paths({ ...s, decor: { content: [{ shape: 'rect', x: 0, y: 0, w: 1, h: 1, sequence: 'reel' }] } }).includes('decor.content[0].sequence'));
});

test('committed matrix: counts are per composition, every declined pair says why, every carousel was reviewed', () => {
  const m = JSON.parse(fs.readFileSync('docs/library/matrix.json', 'utf8'));
  assert.equal(m.totals.styles, STYLES.length);
  const ready = Object.values(m.byStyle).reduce((t, s) => t + s.ready.length, 0);
  assert.equal(m.totals.readyStyleCompositionPairs, ready);
  assert.ok(ready <= m.totals.possiblePairs);
  for (const p of m.pairs.filter((x) => !x.claimed)) assert.ok(p.why, `${p.style}/${p.composition}: declined without a reason`);
  for (const s of STYLES) if (s.status === 'reusable') assert.equal(m.sequences[s.id]?.status, 'ready', s.id);
});
