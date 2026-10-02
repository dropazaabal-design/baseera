import { AssetStore } from './assets.js';
import { Cache, Ledger, VERSIONS } from './budget.js';
import { COMPOSITIONS } from './compositions.js';
import { FORMATS } from './contracts.js';
import { createDesign } from './document.js';
import { Library } from './library.js';
import { estimateMeasure } from './measure.js';
import { Memory } from './memory.js';
import { Projects } from './projects.js';
import { checkDesign } from './quality.js';
import { textCacheKey } from './router.js';
import { themeFromBrand, themeFromPalette } from './theme.js';
import { Workflows } from './workflows.js';

// The studio: every store on one backend, plus the build pipeline
// (spec → document → quality gate → library), shared by the CLI and tests.

export function openStudio(store, { session = null } = {}) {
  const ledger = new Ledger(store);
  if (session) {
    const record = ledger.record.bind(ledger);
    ledger.record = (row) => record({ session, ...row });
  }
  return {
    store,
    ledger,
    cache: new Cache(store, ledger),
    assets: new AssetStore(store),
    library: new Library(store),
    memory: new Memory(store),
    projects: new Projects(store),
    workflows: new Workflows(store),
  };
}

// Asset ids a spec refers to (content art, item art, collage, photo, brand).
export function specAssetIds(spec) {
  const ids = [];
  for (const p of spec.pages ?? []) {
    const c = p.content ?? {};
    for (const key of ['art', 'photo']) {
      if (typeof c[key] === 'string') ids.push(c[key]);
      if (Array.isArray(c[key])) ids.push(...c[key].filter(Boolean));
    }
    if (Array.isArray(c.itemArt)) ids.push(...c.itemArt.filter(Boolean));
  }
  for (const key of ['logoAssetId', 'avatarAssetId']) if (spec.brand?.[key]) ids.push(spec.brand[key]);
  return [...new Set(ids)];
}

// Theme by precedence: explicit theme > palette in the spec > brand kit >
// creator's preferred palette > default. Fonts and numerals likewise.
export function resolveTheme(studio, spec, applied = {}) {
  const fonts = {
    ...(applied['font.heading'] && { heading: applied['font.heading'].value }),
    ...(applied['font.body'] && { body: applied['font.body'].value }),
    ...spec.fonts,
  };
  const numerals = spec.numerals ?? applied.numerals?.value ?? 'arab';
  if (spec.theme) return spec.theme;
  if (spec.paletteId) return themeFromPalette(spec.paletteId, { custom: spec.custom, fonts, numerals });
  const brand = spec.brandId ? studio.memory.brand(spec.brandId) : null;
  if (brand) {
    const t = themeFromBrand(brand, { numerals });
    return { ...t, fonts: { ...t.fonts, ...fonts } };
  }
  if (applied.palette) return themeFromPalette(applied.palette.value, { fonts, numerals });
  return themeFromPalette('midnight', { fonts, numerals });
}

export function buildDesign(studio, spec, { request, measure = estimateMeasure, save = true, label = '', concepts, metaphor } = {}) {
  const creatorId = spec.creatorId ?? 'default';
  const brand = spec.brandId ? studio.memory.brand(spec.brandId) : null;
  const format = spec.intent?.format ?? 'portrait';
  const { applied } = studio.memory.resolve(creatorId, { brandId: spec.brandId, platform: spec.intent?.platform, format, projectId: spec.projectId });
  const theme = resolveTheme(studio, spec, applied);
  const brandInfo = { name: brand?.name ?? '', handle: brand?.handle ?? '', ...(brand?.logoAssetId && { logoAssetId: brand.logoAssetId }), ...(brand?.avatarAssetId && { avatarAssetId: brand.avatarAssetId }), ...spec.brand };
  const assets = studio.assets.embed(specAssetIds({ ...spec, brand: brandInfo }));

  const layoutKey = studio.cache.key(
    'layout',
    { pages: spec.pages, format, fonts: theme.fonts, numerals: theme.numerals, brand: brandInfo, chrome: spec.chrome ?? null },
    { compositions: Object.fromEntries(Object.values(COMPOSITIONS).map((c) => [c.id, c.version])), layout: VERSIONS.layout, measure: VERSIONS.measure },
  );
  const cached = studio.cache.get('layout', layoutKey, { validate: (v) => v.pages.every((p) => p.elements.every((e) => e.kind !== 'image' || assets[e.assetId])) });

  // Identical request, identical inputs: hand back the design already in the
  // library instead of storing a duplicate.
  if (cached?.designId && save) {
    const existing = studio.library.get(cached.designId);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (existing && same(existing.theme, theme) && same(existing.pages.map((p) => p.elements), cached.pages.map((p) => p.elements))) {
      const doc = { ...existing, assets };
      const quality = checkDesign(doc, { expectedPages: spec.intent?.pages, expectedFormat: format, brand, verifyAsset: (a) => studio.assets.verify(a.id), requireAssetData: true });
      studio.library.markUsed(doc.id, { action: 'repeated', projectId: spec.projectId });
      studio.ledger.record({ kind: 'local.compose', cache: 'hit', durationMs: 0, designId: doc.id, note: 'same request: existing design returned' });
      return { doc, quality, saved: null, layoutCache: 'hit', reused: true };
    }
  }

  const t0 = Date.now();
  // The brand kit travels with the design, so the offline file can apply
  // "the blue from my identity" without the creator's memory store.
  const brandKit = brand ? { id: brand.id, name: brand.name, handle: brand.handle, colors: brand.colors ?? [], fonts: brand.fonts ?? {}, voice: brand.voice ?? {}, imagery: brand.imagery ?? {}, constraints: brand.constraints ?? [], version: brand.version } : undefined;
  const doc = createDesign({ ...spec, creatorId, theme, brand: brandInfo, assets, ...(brandKit && { brandKit }) }, { measure, pages: cached?.pages });
  studio.ledger.record({ kind: 'local.compose', cache: cached ? 'hit' : 'miss', durationMs: Date.now() - t0, designId: doc.id });

  const t1 = Date.now();
  const quality = checkDesign(doc, { expectedPages: spec.intent?.pages, expectedFormat: format, brand, verifyAsset: (a) => studio.assets.verify(a.id), requireAssetData: true });
  studio.ledger.record({ kind: 'local.quality', durationMs: Date.now() - t1, designId: doc.id, note: `${quality.errors} errors, ${quality.warnings} warnings` });

  let saved = null;
  if (save) {
    // Only designs that passed the gate become reuse candidates; a failed
    // one is still versioned so nothing is lost, but stays out of search.
    saved = studio.library.save(doc, { label: label || (quality.passed ? 'إنشاء' : 'إنشاء (لم يجتز الفحص)'), quality, concepts, metaphor, topic: spec.brief });
    if (spec.projectId) studio.projects.linkDesign(spec.projectId, doc.id, saved.revision);
    if (quality.passed && !cached) studio.cache.set('layout', layoutKey, { pages: doc.pages, designId: doc.id }, { deps: { format } });
  }
  if (request && quality.passed) {
    const profile = studio.memory.profile(creatorId);
    const key = textCacheKey(studio.cache, { request, creatorId, memoryRevision: profile.revision, brandVersion: brand?.version });
    studio.cache.set('text', key, { pages: spec.pages.map((p) => ({ composition: p.composition, variant: p.variant, content: p.content })), designId: doc.id });
  }
  return { doc, quality, saved, layoutCache: cached ? 'hit' : 'miss', reused: false };
}

export const FORMAT_IDS = Object.keys(FORMATS);
