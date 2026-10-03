import { CHROME_DEFAULTS, chromeBands, chromeElements, chromeSettings } from './chrome.js';
import { COMPOSITIONS, compositionOf, validateContent } from './compositions.js';
import { FORMATS, SCHEMA_VERSION, assertValid, validateDocument } from './contracts.js';
import { contentRegion, shapeElement, textElement } from './layout.js';
import { estimateMeasure } from './measure.js';
import { solveLayout } from './reflow.js';
import { pageTheme, themeFromPalette } from './theme.js';
import { pageModes, resolveStyle, roleOfComposition, styleById, styleBlocks, styleDecor } from './styles.js';
import { clone, isObject, now, randomId } from './util.js';

// DesignDocument (schema 2): pages of independent text, image and shape
// elements with stable ids, generated from each page's semantic content by a
// composition and the reflow engine. User edits that are not content
// (position, size, style, asset, lock, visibility, layer) are kept in
// page.overrides by element id, so regenerating a page (new text, new
// format, new font) re-applies them instead of losing them.

export const formatOf = (id) => FORMATS[id] ?? FORMATS.portrait;

export function newPageId() {
  return randomId('pg_', 10);
}

const Z_BASE = { decor: 0, content: 10, system: 100 };

function contextFor(doc, page, index) {
  const format = formatOf(doc.intent?.format);
  const theme = pageTheme(doc, page);
  const style = resolveStyle(doc);
  return { format, theme, rtl: true, brand: doc.brand ?? {}, assets: doc.assets ?? {}, index, total: doc.pages.length, ...(style && { style, styleMode: page.styleMode ?? 'light' }) };
}

// Applies stored overrides to freshly generated elements. Overrides whose
// element no longer exists (e.g. a removed list item) are kept on the page
// and come back if the element does.
function applyOverrides(elements, overrides = {}) {
  const out = [];
  for (const el of elements) {
    const o = overrides[el.id];
    if (!o) {
      out.push(el);
      continue;
    }
    if (o.deleted) continue;
    const next = { ...el };
    if (o.frame) next.frame = { ...el.frame, ...o.frame };
    if (o.style && el.kind === 'text') next.style = { ...el.style, ...o.style };
    for (const key of ['fill', 'stroke', 'strokeWidth', 'radius']) if (o.style?.[key] !== undefined && el.kind === 'shape') next[key] = o.style[key];
    for (const key of ['opacity', 'rotation']) if (o.style?.[key] !== undefined) next[key] = o.style[key];
    if (o.assetId && el.kind === 'image') next.assetId = o.assetId;
    if (o.text !== undefined && el.kind === 'text' && !el.slot) next.text = o.text;
    for (const key of ['locked', 'hidden', 'z']) if (o[key] !== undefined) next[key] = o[key];
    out.push(next);
  }
  return out;
}

// Explicit font sizes chosen by the user become fixed block sizes, so the
// rest of the page reflows around them. A list takes the largest size set on
// any of its items ("make the points bigger" sets them all).
function blocksWithOverrides(comp, overrides) {
  const sizeOf = (id) => overrides?.[id]?.style?.fontSize;
  return {
    ...comp,
    blocks: (content, variant, ctx) =>
      comp.blocks(content, variant, ctx).map((b) => {
        if (!b) return b;
        let size = sizeOf(b.id);
        if (!size && b.type === 'list') {
          const sizes = b.items.map((_, i) => sizeOf(`${b.id}-${i + 1}`)).filter(Boolean);
          if (sizes.length) size = Math.max(...sizes);
        }
        return size ? { ...b, size: [size, size] } : b;
      }),
  };
}

export function composePage(doc, page, index, { measure = estimateMeasure } = {}) {
  const comp = compositionOf(page.composition.id);
  const ctx = { ...contextFor(doc, page, index), measure };
  const settings = chromeSettings(doc.chrome);
  const bands = chromeBands(settings, comp, index, doc.pages.length, doc.brand);
  const region = contentRegion(ctx.format, { topChrome: bands.top, bottomChrome: bands.bottom, ...(ctx.style?.layout?.margin && { margin: ctx.style.layout.margin }) });
  ctx.region = region;
  // A style adjusts title scale/weight and block treatment before layout;
  // sizes the user fixed (overrides) still win.
  const styled = ctx.style ? { ...comp, blocks: (content, variant, c) => styleBlocks(ctx.style, comp.blocks(content, variant, c)) } : comp;
  const result = solveLayout(blocksWithOverrides(styled, page.overrides), page.content ?? {}, ctx, {
    variant: page.composition.variant,
    keepArt: Boolean(page.composition.keepArt),
    lockVariant: Boolean(page.composition.lockVariant),
  });
  const layer = (els, base) => els.map((el, i) => ({ ...el, z: base + i }));
  const decorEls = ctx.style ? [...(ctx.style.keepCompositionDecor ? comp.decor(ctx, ctx.format.width, ctx.format.height) : []), ...styleDecor(ctx.style, ctx, comp, { textElement, shapeElement })] : comp.decor(ctx, ctx.format.width, ctx.format.height);
  const decor = layer(decorEls, Z_BASE.decor);
  const content = layer(result.elements, Z_BASE.content);
  const system = layer(
    chromeElements({ settings, bands, index, total: doc.pages.length, format: ctx.format, ctx, brand: doc.brand ?? {}, assets: doc.assets }).map((el) => ({ ...el, locked: true })),
    Z_BASE.system,
  );
  const elements = applyOverrides([...decor, ...content, ...system], page.overrides).map((el) => (el.anim === undefined ? (({ anim, ...rest }) => rest)(el) : el));
  return {
    ...page,
    widthPx: ctx.format.width,
    heightPx: ctx.format.height,
    elements,
    layout: {
      variant: result.variant,
      art: result.art,
      scale: result.scale,
      fits: result.fits,
      decisions: result.decisions,
      overflow: result.overflow,
      region,
    },
  };
}

export function composeAll(doc, options) {
  const next = { ...doc, pages: [...doc.pages] };
  next.pages = next.pages.map((page, i) => composePage(next, page, i, options));
  return next;
}

// Builds a new document from a plan: one { composition, variant, content }
// per page. Validates content against each composition's fields.
export function createDesign(spec, options = {}) {
  const problems = [];
  (spec.pages ?? []).forEach((p, i) => {
    if (!COMPOSITIONS[p.composition]) problems.push({ path: `pages[${i}].composition`, message: `unknown composition "${p.composition}"` });
    else problems.push(...validateContent(p.composition, p.content ?? {}, `pages[${i}].content`));
  });
  const style = spec.style?.id ? styleById(spec.style.id) : null;
  if (spec.style?.id && !style) problems.push({ path: 'style.id', message: `unknown style "${spec.style.id}"` });
  assertValid('design plan', problems);
  const created = now();
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'design',
    id: spec.id ?? randomId('d_', 12),
    revision: 1,
    createdAt: created,
    updatedAt: created,
    creatorId: spec.creatorId ?? 'default',
    ...(spec.brandId && { brandId: spec.brandId }),
    ...(spec.projectId && { projectId: spec.projectId }),
    ...(spec.parent && { parent: spec.parent }),
    ...(spec.brandKit && { brandKit: clone(spec.brandKit) }),
    brief: spec.brief ?? '',
    intent: {
      mode: spec.intent?.mode ?? ((spec.pages ?? []).length > 1 ? 'carousel' : 'post'),
      platform: spec.intent?.platform ?? 'instagram',
      format: FORMATS[spec.intent?.format] ? spec.intent.format : 'portrait',
      pages: spec.intent?.pages ?? (spec.pages ?? []).length,
      destination: spec.intent?.destination ?? 'local',
    },
    theme: spec.theme ?? themeFromPalette(spec.paletteId ?? 'midnight'),
    brand: { name: '', handle: '', ...spec.brand },
    chrome: chromeSettings(spec.chrome, style?.chrome?.defaults),
    governance: { institutional: false, locked: false, ...spec.governance },
    ...(style && { style: { id: style.id, version: style.version, mode: spec.style.mode ?? (style.modeByRole ? 'by-role' : style.defaultMode ?? 'light') } }),
    pages: (spec.pages ?? []).map((p) => ({
      id: p.id ?? newPageId(),
      widthPx: 0,
      heightPx: 0,
      composition: { id: p.composition, version: COMPOSITIONS[p.composition].version, variant: p.variant ?? COMPOSITIONS[p.composition].defaultVariant, ...(p.keepArt && { keepArt: true }) },
      content: clone(p.content ?? {}),
      overrides: clone(p.overrides ?? {}),
      elements: [],
    })),
    assets: clone(spec.assets ?? {}),
  };
  // A style with light and dark tokens sets each page's mode (all one, or
  // alternating); a page of the plan may name its own.
  if (style && doc.theme.dark) {
    const modes = pageModes(style, doc.pages.length, spec.style.mode ?? undefined, doc.pages.map((p) => roleOfComposition(p.composition.id)));
    doc.pages.forEach((p, i) => (p.styleMode = spec.pages[i]?.styleMode ?? modes[i]));
  }
  // Pages already laid out for exactly this input (layout cache) are taken
  // as they are; otherwise every page is composed.
  const composed = options.pages ? { ...doc, pages: options.pages } : composeAll(doc, options);
  assertValid('design document', validateDocument(composed));
  return composed;
}

// New revision with one page's content or settings changed.
export function updatePage(doc, pageId, fn, options) {
  const index = doc.pages.findIndex((p) => p.id === pageId);
  if (index < 0) throw new Error(`no page "${pageId}"`);
  const pages = [...doc.pages];
  pages[index] = fn(clone(pages[index]));
  const next = { ...doc, pages };
  next.pages[index] = composePage(next, next.pages[index], index, options);
  return next;
}

export function setFormat(doc, format, options) {
  if (!FORMATS[format]) throw new Error(`unknown format "${format}"`);
  // Manual positions were made for the old page size; scale them.
  const from = formatOf(doc.intent.format);
  const to = FORMATS[format];
  const k = to.height / from.height;
  const pages = doc.pages.map((p) => ({
    ...p,
    overrides: Object.fromEntries(
      Object.entries(p.overrides ?? {}).map(([id, o]) => [id, o.frame ? { ...o, frame: { ...o.frame, ...(o.frame.y !== undefined && { y: Math.round(o.frame.y * k) }) } } : o]),
    ),
  }));
  return composeAll({ ...doc, intent: { ...doc.intent, format }, pages }, options);
}

export function setContentAt(content, slot, value) {
  const next = clone(content ?? {});
  const [key, index] = slot.split('.');
  if (index === undefined) next[key] = value;
  else {
    const list = Array.isArray(next[key]) ? [...next[key]] : [];
    list[Number(index)] = value;
    next[key] = list;
  }
  return next;
}

export function getContentAt(content, slot) {
  const [key, index] = slot.split('.');
  return index === undefined ? content?.[key] : content?.[key]?.[Number(index)];
}

export const findElement = (doc, pageId, elementId) => doc.pages.find((p) => p.id === pageId)?.elements.find((e) => e.id === elementId) ?? null;

// ---------------------------------------------------------------------------
// Migration from the classic editor's carousel (template slides).

const V1_MAP = {
  cover: (d) => ({ composition: 'hero', variant: 'type', content: pickDefined(d, ['kicker', 'title', 'subtitle']) }),
  listicle: (d) => ({ composition: 'list', variant: 'cards', content: pickDefined(d, ['title', 'items', 'start']) }),
  comparison: (d) => ({ composition: 'comparison', variant: 'columns', content: pickDefined(d, ['title', 'beforeLabel', 'before', 'afterLabel', 'after']) }),
  quote: (d) => ({ composition: 'quote', content: pickDefined(d, ['quote', 'author', 'role']), photo: d.photo }),
  outro: (d) => ({ composition: 'outro', content: pickDefined(d, ['title', 'subtitle', 'save', 'share', 'follow', 'socials']) }),
  post: (d) => ({ composition: 'post', variant: 'stack', content: pickDefined(d, ['hook', 'points', 'cta']) }),
};

function pickDefined(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined && obj[k] !== null && obj[k] !== '').map((k) => [k, clone(obj[k])]));
}

// `inlineAsset(dataUrl)` turns an embedded data: URL (v1 photos, logos) into
// an asset record; the caller provides it because hashing and sizing images
// differs between Node and the browser.
export function migrateCarousel(v1, { creatorId = 'default', inlineAsset, measure } = {}) {
  if (!isObject(v1) || !Array.isArray(v1.slides)) throw new Error('not a classic carousel document (no slides)');
  const assets = {};
  const take = (dataUrl) => {
    if (!dataUrl || !inlineAsset) return null;
    const record = inlineAsset(dataUrl);
    assets[record.id] = record;
    return record.id;
  };
  const pages = v1.slides
    .filter((s) => V1_MAP[s?.template])
    .map((s) => {
      const mapped = V1_MAP[s.template](s.data ?? {});
      const photo = mapped.photo ? take(mapped.photo) : null;
      return { composition: mapped.composition, variant: mapped.variant, content: photo ? { ...mapped.content, photo } : mapped.content };
    });
  const design = v1.design ?? {};
  const fonts = { heading: design.font ?? 'cairo', body: design.font ?? 'cairo' };
  const theme = themeFromPalette(design.paletteId ?? 'midnight', { custom: design.custom, fonts, numerals: design.numerals ?? 'arab' });
  const brand = { name: v1.brand?.name ?? '', handle: v1.brand?.handle ?? '' };
  const logo = take(v1.brand?.logo);
  const avatar = take(v1.brand?.avatar);
  if (logo) brand.logoAssetId = logo;
  if (avatar) brand.avatarAssetId = avatar;
  const chrome = Object.fromEntries(Object.keys(CHROME_DEFAULTS).map((id) => [id, { ...CHROME_DEFAULTS[id], ...v1.plugins?.[id] }]));
  return createDesign(
    {
      creatorId,
      brief: 'مرحّل من محرر الكاروسيل الكلاسيكي',
      intent: { mode: pages.length > 1 ? 'carousel' : 'post', format: design.format ?? 'portrait', pages: pages.length },
      theme,
      brand,
      chrome,
      governance: v1.governance,
      pages,
      assets,
    },
    { measure },
  );
}
