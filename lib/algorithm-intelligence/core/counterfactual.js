import { clone } from '../../studio/util.js';
import { audienceFeatures } from './audience.js';
import { hookStrengthOf } from './feature-extractor.js';
import { round } from './normalization.js';
import { slideDensity, summarizeCarousel } from './structure-features.js';
import { readabilityOf } from './text-stats.js';

// Edits of a feature set that answer "what if this one thing were fixed?".
// The edited features go through the same signal and scoring code as the
// original, so a recommendation's expected effect is the score difference
// under the current model — a statement about the model, not a promise
// about reach.

function finish(f) {
  f.hook.strength = hookStrengthOf(f.hook.parts);
  f.audience = audienceFeatures(f);
  return f;
}

export const counterfactual = {
  slideWords(f0, slideNo, words, config) {
    const f = clone(f0);
    const c = f.carousel;
    const row = c.slides[slideNo - 1];
    const visual = { ...(row.visual ?? {}), fits: true, scale: 1 };
    Object.assign(row, { words, ...slideDensity(words, row.role, visual, config), visual, scale: 1 });
    f.carousel = summarizeCarousel(c.slides, { promiseCount: c.promise.count, listItems: c.listItems }, config);
    if (slideNo === 1) {
      f.hook.parts.lengthFit = Math.max(f.hook.parts.lengthFit, 1);
    }
    return finish(f);
  },

  removeSlide(f0, slideNo, config) {
    const f = clone(f0);
    const c = f.carousel;
    const rows = c.slides.filter((r) => r.slide !== slideNo).map((r, i) => ({ ...r, slide: i + 1 }));
    f.carousel = summarizeCarousel(rows, { promiseCount: c.promise.count, listItems: c.listItems }, config);
    return finish(f);
  },

  promiseKept(f0) {
    const f = clone(f0);
    f.carousel.promise = { ...f.carousel.promise, matches: true, delivered: f.carousel.promise.count };
    return finish(f);
  },

  hookParts(f0, parts) {
    const f = clone(f0);
    for (const [k, v] of Object.entries(parts)) f.hook.parts[k] = Math.max(f.hook.parts[k], v);
    return finish(f);
  },

  openingSentence(f0, words) {
    const f = clone(f0);
    f.text.firstSentenceWords = words;
    if (f.hook.words > words) {
      f.hook.words = words;
      f.hook.parts.lengthFit = 1;
    }
    return finish(f);
  },

  sentences(f0, avg) {
    const f = clone(f0);
    f.text.avgSentenceWords = Math.min(f.text.avgSentenceWords, avg);
    f.text.maxSentenceWords = Math.min(f.text.maxSentenceWords, Math.round(avg * 1.4));
    f.text.readability = readabilityOf(f.text.avgSentenceWords, f.text.longWordRatio);
    return finish(f);
  },

  specificCta(f0, { type = 'comment' } = {}, config) {
    const f = clone(f0);
    f.cta = { ...f.cta, present: true, type: f.cta.type ?? type, generic: false, specific: type === 'comment', question: type === 'comment' ? true : f.cta.question, bait: false };
    f.semantic = { ...f.semantic, ctaQuality: type === 'comment' ? 0.95 : 0.6 };
    if (f.carousel && f.carousel.slides.at(-1)?.role !== 'cta') {
      f.carousel.slides.at(-1).role = 'cta';
      f.carousel = summarizeCarousel(f.carousel.slides, { promiseCount: f.carousel.promise.count, listItems: f.carousel.listItems }, config);
    }
    return finish(f);
  },

  specificity(f0, value) {
    const f = clone(f0);
    f.text.specificity = Math.max(f.text.specificity, value);
    f.hook.parts.specificity = Math.max(f.hook.parts.specificity, Math.min(value, 0.6));
    return finish(f);
  },

  removeBait(f0) {
    const f = clone(f0);
    f.text.baitPhrases = [];
    f.cta = { ...f.cta, bait: false };
    f.semantic = { ...f.semantic, ctaQuality: Math.max(f.semantic.ctaQuality, 0.6) };
    return finish(f);
  },

  removeHostile(f0) {
    const f = clone(f0);
    f.text.hostileWords = 0;
    return finish(f);
  },

  xLength(f0, length) {
    const f = clone(f0);
    if (f.caption && (f.type === 'carousel' || f.type === 'reel')) f.caption.xLength = length;
    else f.text.xLength = length;
    return finish(f);
  },

  reel(f0, patch) {
    const f = clone(f0);
    Object.assign(f.reel, patch);
    return finish(f);
  },

  captionOpening(f0, words) {
    const f = clone(f0);
    if (f.caption) f.caption.firstSentenceWords = words;
    return finish(f);
  },

  showMoreOpening(f0) {
    const f = clone(f0);
    f.hook.parts.curiosity = Math.max(f.hook.parts.curiosity, 0.6);
    f.semantic = { ...f.semantic, curiosity: Math.max(f.semantic.curiosity, 0.6) };
    return finish(f);
  },

  question(f0) {
    const f = clone(f0);
    f.cta = { ...f.cta, present: true, question: true, type: f.cta.type ?? 'comment', specific: true, generic: false };
    f.semantic = { ...f.semantic, ctaQuality: Math.max(f.semantic.ctaQuality, 0.8) };
    return finish(f);
  },
};

export const effectOf = (before, after, scoreType) => ({
  scoreType,
  deltaPoints: typeof before.scores[scoreType]?.score === 'number' && typeof after.scores[scoreType]?.score === 'number' ? after.scores[scoreType].score - before.scores[scoreType].score : null,
  overallDelta: after.overall.score - before.overall.score,
  basis: 'model-counterfactual',
  note: round(after.overall.score - before.overall.score, 0) === 0 ? 'no change under the current model' : undefined,
});
