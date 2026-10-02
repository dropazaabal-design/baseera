import { formatNumber } from '../numerals.js';
import { blockTexts, placeStack, sizeAt, stackHeight } from './layout.js';
import { plainText } from './measure.js';

// Reflow engine: fits a composition's content into its region without
// shrinking text past readability. In order, it tries:
//   1. preferred sizes, then a gentle scale-down (≥ 82%);
//   2. a smaller art area;
//   3. scaling down to the readability floors (never below);
//   4. the composition's denser variants (e.g. a list in two columns);
//   5. dropping optional art, unless the art was asked for;
// and when nothing fits, reports the overflow with concrete cuts per text
// ("shorten item 3 by ~24 characters") instead of rendering unreadable text.

const COMFORT = 0.82;

function buildBlocks(comp, content, variant, artMode, ctx) {
  return comp
    .blocks(content, variant, ctx)
    .filter(Boolean)
    .flatMap((b) => {
      if (!('share' in b) || !b.optional) return [b];
      if (artMode === 'none') return [];
      return [{ ...b, share: artMode === 'min' ? b.minShare ?? b.share : b.share }];
    });
}

// Largest s in [sMin, sMax] whose stack fits the region height. sMax > 1
// lets short content grow to fill the page (compositions opt in).
function bestScale(blocks, region, ctx, sMin, sMax = 1) {
  const fits = (s) => stackHeight(blocks, region.width, s, ctx) <= region.height + 0.5;
  if (fits(sMax)) return sMax;
  if (!fits(Math.min(1, sMax)) && !fits(sMin)) return null;
  let lo = fits(1) ? 1 : sMin;
  let hi = fits(1) ? sMax : 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

function overflowSuggestions(blocks, region, ctx, deficit) {
  const texts = blocks.flatMap((b) => blockTexts(b).map((t) => ({ ...t, block: b })));
  const weights = texts.map((t) => Math.max(1, plainText(t.text).length));
  const total = weights.reduce((a, b) => a + b, 0);
  const out = [];
  texts.forEach((t, i) => {
    const size = t.size[1];
    const lineH = size * (t.block.lineHeight ?? 1.5);
    const share = (deficit * weights[i]) / total;
    const lines = Math.ceil(share / lineH);
    if (!lines) return;
    // Average Arabic glyph ≈ 0.5 em; a line holds width / (0.5 × size) chars.
    const perLine = Math.max(8, Math.floor(region.width / (0.5 * size)));
    const chars = Math.min(plainText(t.text).length - 1, lines * perLine);
    if (chars <= 0) return;
    out.push({ elementId: t.id, slot: t.slot, removeChars: chars, removeWords: Math.max(1, Math.round(chars / 5.5)) });
  });
  return out.sort((a, b) => b.removeChars - a.removeChars);
}

export function solveLayout(comp, content, ctx, { variant, keepArt = false, lockVariant = false } = {}) {
  const region = ctx.region;
  const requested = variant && comp.variants[variant] ? variant : comp.defaultVariant;
  const variants = [requested, ...(lockVariant ? [] : comp.reflow?.[requested] ?? [])];
  const hasArt = buildBlocks(comp, content, requested, 'pref', ctx).some((b) => b.optional);

  const attempts = [
    { variant: requested, art: 'pref', sMin: COMFORT },
    hasArt && { variant: requested, art: 'min', sMin: COMFORT, note: 'art-min' },
    { variant: requested, art: hasArt ? 'min' : 'pref', sMin: 0 },
    // A denser variant that has no place for the art would drop it
    // silently: with keepArt only variants that still carry it are tried.
    ...variants
      .slice(1)
      .filter((v) => !keepArt || !hasArt || buildBlocks(comp, content, v, 'min', ctx).some((b) => b.optional))
      .map((v) => ({ variant: v, art: hasArt ? 'min' : 'pref', sMin: 0, note: 'variant' })),
    ...(hasArt && !keepArt ? variants.map((v) => ({ variant: v, art: 'none', sMin: 0, note: 'art-removed' })) : []),
  ].filter(Boolean);

  const decisions = [];
  for (const attempt of attempts) {
    const blocks = buildBlocks(comp, content, attempt.variant, attempt.art, ctx);
    const s = bestScale(blocks, region, ctx, attempt.sMin, attempt === attempts[0] ? comp.maxScale ?? 1 : 1);
    if (s === null) continue;
    if (attempt.note === 'art-min') decisions.push({ code: 'art-min', message: 'قلّصت مساحة الرسم ليتسع النص بحجم مريح.' });
    if (attempt.note === 'variant') {
      decisions.push({ code: 'variant', message: `غيّرت التوزيع إلى «${comp.variants[attempt.variant]}» ليتسع المحتوى دون تصغير الخط تحت حد القراءة.` });
    }
    if (attempt.note === 'art-removed') decisions.push({ code: 'art-removed', message: 'أزلت الرسم الاختياري: النص لا يتسع معه بحجم مقروء.' });
    if (s < 1) {
      const title = blocks.find((b) => b.role === 'title' || b.id === 'title' || b.id === 'hook');
      const body = blocks.find((b) => b.type === 'list' || b.type === 'compare' || b.id === 'subtitle' || b.id === 'quote');
      const parts = [title && `العنوان ${formatNumber(sizeAt(title.size, s), 'latn')}px`, body && `المتن ${formatNumber(sizeAt(body.size, s), 'latn')}px`].filter(Boolean);
      decisions.push({ code: 'scaled', message: `صغّرت النص إلى ${Math.round(s * 100)}٪ من حجمه المفضّل (${parts.join('، ')})، وهو فوق حد القراءة.` });
    }
    const placed = placeStack(blocks, region, s, ctx, comp.align ?? 'center');
    return { fits: true, variant: attempt.variant, art: attempt.art, scale: s, blocks, elements: placed.elements, decisions, overflow: null };
  }

  // Nothing fits: lay out at the floors with the densest option and report.
  const fallback = attempts[attempts.length - 1];
  const blocks = buildBlocks(comp, content, fallback.variant, fallback.art, ctx);
  const total = stackHeight(blocks, region.width, 0, ctx);
  const deficit = total - region.height;
  const placed = placeStack(blocks, region, 0, ctx, 'start');
  const suggestions = overflowSuggestions(blocks, region, ctx, deficit);
  decisions.push({
    code: 'overflow',
    message: `المحتوى أطول من المساحة بنحو ${Math.ceil(deficit)}px حتى بأصغر حجم مقروء. لن أصغّر الخط أكثر: اختصر النص${comp.type === 'list' || comp.type === 'post' ? ' أو وزّع البنود على صفحتين' : ''}.`,
  });
  return {
    fits: false,
    variant: fallback.variant,
    art: fallback.art,
    scale: 0,
    blocks,
    elements: placed.elements,
    decisions,
    overflow: { deficit: Math.ceil(deficit), suggestions },
  };
}
