import { formatNumber } from '../numerals.js';
import { derivePalette, resolvePalette } from '../../plugins/palettes.js';
import { bestOn, contrastRatio, mix } from '../contrast.js';
import { STYLES } from './styles/catalog.js';

// Design Library V2 — styles.
//
// A style is the visual treatment of a design, separate from its
// composition (where text, numbers and art sit) and from the brand (whose
// colours and fonts it carries):
//   tokens     neutral colours per mode (light/dark); the accent comes from
//              the brand, so the style keeps its logic under any identity
//   type       title scale and weight, line heights for Arabic
//   treatment  how blocks are drawn: pill and card corners, card mode
//              (fill / outline / accent bar / rule), number badges, rules
//   decor      declarative shapes per page role (cover / content / cta),
//              positioned from the reading start or end, so RTL holds
//   layout     where the stack sits (centre or top-biased), margins
//   provenance which source values were extracted and what was designed
//              here; status says how far the style got (catalogued →
//              reusable), and only reusable styles are offered as ready.
//
// A document without `style` renders exactly as before (the compositions'
// own decoration): styles are opt-in and never change existing designs.

export const STYLE_STATUSES = ['source_catalog', 'normalized', 'rtl_adapted', 'preview_verified', 'reusable', 'rejected', 'needs_review'];
export const MODES = ['light', 'dark'];
const COLOR_ROLES = ['bg', 'surface', 'text', 'muted'];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ROLES = ['cover', 'content', 'cta'];

export const styleById = (id) => STYLES.find((s) => s.id === id) ?? null;
export const styleList = () => STYLES.map(({ id, version, name, family, status, purpose }) => ({ id, version, name, family, status, purpose }));

// ---------------------------------------------------------------------------
// Validation: a style is data with executable rules, provenance and status.

export function validateStyle(s) {
  const out = [];
  const err = (path, message) => out.push({ path, message });
  if (s?.kind !== 'style') err('kind', 'must be "style"');
  if (!/^[a-z][a-z0-9-]*$/.test(s?.id ?? '')) err('id', 'kebab-case id required');
  if (!Number.isInteger(s?.version) || s.version < 1) err('version', 'integer ≥ 1');
  if (!STYLE_STATUSES.includes(s?.status)) err('status', `one of ${STYLE_STATUSES.join(', ')}`);
  for (const k of ['name', 'family', 'purpose']) if (!s?.[k]) err(k, 'required');
  if (!s?.distinctFrom?.how) err('distinctFrom', 'say how it differs from the closest style');
  const modes = Object.keys(s?.tokens ?? {});
  if (!modes.length || !modes.every((m) => MODES.includes(m))) err('tokens', 'light and/or dark');
  for (const m of modes) for (const r of COLOR_ROLES) if (!HEX.test(s.tokens[m][r] ?? '')) err(`tokens.${m}.${r}`, 'must be #RRGGBB');
  if (!s?.type || typeof s.type.titleScale !== 'number') err('type.titleScale', 'number required');
  if (!s?.treatment) err('treatment', 'required');
  for (const role of Object.keys(s?.decor ?? {})) if (!ROLES.includes(role)) err(`decor.${role}`, `role must be one of ${ROLES.join(', ')}`);
  for (const [role, list] of Object.entries(s?.decor ?? {})) list.forEach((d, i) => {
    if (!['rect', 'ellipse', 'ghost-number', 'frame'].includes(d.shape)) err(`decor.${role}[${i}].shape`, 'rect, ellipse, ghost-number or frame');
    for (const k of ['x', 'y', 'w', 'h']) if (d[k] === undefined) err(`decor.${role}[${i}].${k}`, 'required');
  });
  if (!Array.isArray(s?.provenance) || !s.provenance.length) err('provenance', 'at least one entry (a source, or "designed here")');
  if (!Array.isArray(s?.roles) || !s.roles.length) err('roles', 'content roles it suits');
  if (!Array.isArray(s?.formats) || !s.formats.length) err('formats', 'formats it suits');
  return out;
}

// ---------------------------------------------------------------------------
// Theme from style + brand. The style supplies neutrals per mode; the brand
// supplies the accent (and may fix the light background, e.g. white). Every
// pair goes through resolvePalette, so contrast is checked, never assumed.

export function styleTheme(style, { brand = null, fonts, numerals = 'arab' } = {}) {
  const brandRole = (role) => (brand?.colors ?? []).find((c) => c.role === role)?.hex ?? null;
  const accent = brandRole('accent') ?? style.tokens.light?.accent ?? style.tokens.dark?.accent ?? '#2E7BC5';
  const derived = [];
  const build = (mode) => {
    const t = style.tokens[mode];
    if (!t) return null;
    const bg = mode === 'light' ? brandRole('bg') ?? t.bg : brandRole('dark') ?? t.bg;
    // Labels on the accent are white. When the identity colour is too light
    // for white text (4.5:1), the fill uses a darker blue derived from it —
    // recorded, never silent. On dark pages the accent is lightened instead
    // so it still reads on the background.
    let fill = accent;
    if (mode === 'light') {
      let k = 0;
      while (contrastRatio('#FFFFFF', fill) < 4.5 && k < 0.6) fill = mix(accent, '#000000', (k += 0.04));
    }
    if (fill !== accent) derived.push({ role: 'accent', mode, from: accent, to: fill, why: 'نص أبيض على لون التمييز بتباين 4.5 على الأقل' });
    const raw = { ...derivePalette({ bg, accent: fill }), surface: t.surface, text: t.text, muted: t.muted, accent: fill, onAccent: mode === 'light' ? '#FFFFFF' : bestOn(fill) };
    // A surface or text from the style that no longer reads on the brand's
    // background is re-derived by resolvePalette.
    return resolvePalette(raw).colors;
  };
  const light = build('light');
  const dark = build('dark');
  const heading = brand?.fonts?.heading ?? style.type.headingFont ?? 'cairo';
  const body = brand?.fonts?.body ?? style.type.bodyFont ?? 'tajawal';
  return {
    paletteId: `style:${style.id}`,
    colors: light ?? dark,
    ...(light && dark && { dark }),
    ...(derived.length && { derived }),
    fonts: { heading, body, ...fonts },
    numerals,
  };
}

// Modes per page: all light, all dark, or alternating (odd pages light),
// starting from the cover. A page the user recoloured keeps its override.
export function pageModes(style, count, mode = style.defaultMode ?? 'light') {
  const has = (m) => Boolean(style.tokens[m]);
  if (mode === 'alternate' && has('light') && has('dark')) return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? style.alternateStart ?? 'dark' : style.alternateStart === 'light' ? 'dark' : 'light'));
  const m = has(mode) ? mode : has('light') ? 'light' : 'dark';
  return Array.from({ length: count }, () => m);
}

// Applies a style to a document (no composition change, no regeneration):
// theme from style + brand, per-page mode, style reference. The caller
// re-composes the pages.
export function applyStyle(doc, styleId, { brand = null, mode, numerals } = {}) {
  const style = styleById(styleId);
  if (!style) throw new Error(`unknown style "${styleId}"`);
  const theme = styleTheme(style, { brand, numerals: numerals ?? doc.theme?.numerals ?? 'arab' });
  const modes = pageModes(style, doc.pages.length, mode);
  return {
    ...doc,
    style: { id: style.id, version: style.version, mode: mode ?? style.defaultMode ?? 'light' },
    theme,
    pages: doc.pages.map((p, i) => ({ ...p, styleMode: theme.dark ? modes[i] : undefined })),
  };
}

export function resolveStyle(doc) {
  if (!doc?.style?.id) return null;
  return styleById(doc.style.id);
}

// ---------------------------------------------------------------------------
// Decoration: declarative shapes, positioned with small expressions over the
// page: W, H (page size), T, B (platform insets), M (side margin), R (top
// of the content region, below the page's top chrome). x is measured from
// the reading start ("start", the right edge in RTL) or end.

export function evaluate(expr, vars) {
  if (typeof expr === 'number') return expr;
  const src = String(expr).replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const num = () => {
    const m = /^(\d+(\.\d+)?)/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    const v = /^[A-Z]/.exec(src.slice(i));
    if (v && v[0] in vars) {
      i += 1;
      return vars[v[0]];
    }
    if (peek() === '(') {
      i++;
      const r = sum();
      i++;
      return r;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    throw new Error(`bad style expression "${expr}"`);
  };
  const prod = () => {
    let r = num();
    while (peek() === '*' || peek() === '/') r = src[i++] === '*' ? r * num() : r / num();
    return r;
  };
  const sum = () => {
    let r = prod();
    while (peek() === '+' || peek() === '-') r = src[i++] === '+' ? r + prod() : r - prod();
    return r;
  };
  const r = sum();
  if (i !== src.length) throw new Error(`bad style expression "${expr}"`);
  return r;
}

const round1 = (n) => Math.round(n * 10) / 10;

// A page's role comes from its composition (a cover, a closing call, or
// content), not from its position: a single post is content, not a cover.
export function pageRole(comp) {
  if (comp.role === 'hook' || comp.type === 'cover') return 'cover';
  if (comp.role === 'cta' || comp.type === 'outro') return 'cta';
  return 'content';
}

// Elements for one page's decoration. textElement is passed in (layout.js)
// for ghost numbers, so this module stays free of layout imports.
export function styleDecor(style, ctx, comp, { textElement, shapeElement }) {
  const W = ctx.format.width;
  const H = ctx.format.height;
  const vars = { W, H, T: ctx.format.inset.top, B: ctx.format.inset.bottom, M: ctx.style?.layout?.margin ?? 96, R: ctx.region?.y ?? ctx.format.inset.top + 170 };
  const role = pageRole(comp);
  const list = style.decor?.[role] ?? [];
  const els = [];
  list.forEach((d, n) => {
    if (d.pages === 'odd' && ctx.index % 2 === 1) return;
    if (d.pages === 'even' && ctx.index % 2 === 0) return;
    if (d.modes && !d.modes.includes(ctx.styleMode ?? 'light')) return;
    const w = evaluate(d.w, vars);
    const h = evaluate(d.h, vars);
    const x0 = evaluate(d.x, vars);
    const y = evaluate(d.y, vars);
    // From the reading start (right edge in RTL) or end.
    const fromStart = (d.at ?? 'start') === 'start';
    const x = (ctx.rtl === false) === fromStart ? x0 : W - x0 - w;
    const f = { x: round1(x), y: round1(y), width: round1(Math.max(1, w)), height: round1(Math.max(1, h)) };
    const id = `style-${role}-${n}`;
    const base = { role: 'decor', name: d.name ?? 'زخرفة الأسلوب', ...(d.opacity !== undefined && { opacity: d.opacity }), ...(d.rotation && { rotation: d.rotation }), ...(d.anim && { anim: d.anim }) };
    if (d.shape === 'ghost-number') {
      const text = formatNumber(ctx.index + 1, ctx.theme.numerals);
      els.push(textElement(id, f, text, ctx, { font: '@heading', weightRole: 'black', size: Math.round(h * 0.8), min: Math.round(h * 0.8), lineHeight: 1.1, color: d.fill ?? '@text', align: fromStart ? 'start' : 'end', nowrap: true, ...base, role: 'decor' }));
    } else if (d.shape === 'frame') {
      els.push(shapeElement(id, f, 'rect', 'none', { stroke: d.stroke ?? '@text', strokeWidth: d.strokeWidth ?? 4, radius: d.radius ?? 0, ...base }));
    } else {
      els.push(shapeElement(id, f, d.shape, d.fill ?? '@accent', { ...(d.radius !== undefined && { radius: d.radius }), ...(d.stroke && { stroke: d.stroke, strokeWidth: d.strokeWidth ?? 2 }), ...base }));
    }
  });
  return els;
}

// Block adjustments a style makes before layout: title scale and weight,
// list variant hints. Content and sizes chosen by the user are untouched.
export function styleBlocks(style, blocks) {
  if (!style) return blocks;
  const t = style.type ?? {};
  return blocks.map((b) => {
    if (!b) return b;
    if (b.role === 'title' && b.type === 'text') {
      return { ...b, size: [Math.round(b.size[0] * (t.titleScale ?? 1)), b.size[1]], ...(t.titleWeight && { weightRole: t.titleWeight }), ...(t.titleLineHeight && { lineHeight: Math.max(b.lineHeight ?? 1.3, t.titleLineHeight) }) };
    }
    if (b.type === 'list' && style.treatment?.listCard !== undefined) return { ...b, card: style.treatment.listCard };
    if (b.type === 'rule' && style.treatment?.rule) return { ...b, ...(style.treatment.rule.width && { width: style.treatment.rule.width }), ...(style.treatment.rule.height && { height: style.treatment.rule.height }) };
    return b;
  });
}

// Contrast of the accent on each mode's background, for QA.
export function styleContrast(theme) {
  const out = [];
  for (const [mode, c] of [['light', theme.colors], ['dark', theme.dark]]) {
    if (!c) continue;
    out.push({ mode, text: Math.round(contrastRatio(c.text, c.bg) * 100) / 100, muted: Math.round(contrastRatio(c.muted, c.bg) * 100) / 100, accent: Math.round(contrastRatio(c.accent, c.bg) * 100) / 100 });
  }
  return out;
}

export { mix };
