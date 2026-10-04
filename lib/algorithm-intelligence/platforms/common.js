import { signalConfidence } from '../core/confidence.js';
import { band, clamp01, round } from '../core/normalization.js';

// Building blocks shared by the three platform engines. Each engine decides
// which of these it uses and with what weight; nothing here is a platform
// rule.

// A signal value with its evidence: the features it was computed from.
export function signal(id, value, provenance, evidence = [], { config, semanticSource, confidence, note } = {}) {
  const v = value === null || value === undefined || Number.isNaN(value) ? null : round(clamp01(value));
  return {
    id,
    value: v,
    confidence: confidence ?? signalConfidence(provenance, config, { semanticSource }),
    provenance,
    evidence: evidence.filter(Boolean),
    ...(note && { note }),
  };
}

// Evidence item: a feature, its value, and whether it raised (+) or
// lowered (−) the signal.
export const ev = (feature, value, effect) => ({ feature, value, effect });

// Neutral framing is fine (0.4); moderate emotion helps; extreme framing is a risk elsewhere.
export const emotionBand = (f) => 0.4 + 0.6 * (band(f.semantic.emotion, [0, 0.2, 0.75, 1]) ?? 0);
export const clarity = (f) => (typeof f.text.readability === 'number' ? f.text.readability / 100 : null);

// Risk of hides, mutes and reports, from wording the content controls. A
// noisy-OR of independent cues, each listed as evidence.
export function negativeRisk(f, { hashtagsMany = 6 } = {}) {
  const cues = [];
  if (f.cta.bait || f.text.baitPhrases.length) cues.push([0.6, ev('text.baitPhrases', f.text.baitPhrases.length || 1, '+')]);
  if (f.text.hostileWords) cues.push([Math.min(0.7, 0.35 * f.text.hostileWords), ev('text.hostileWords', f.text.hostileWords, '+')]);
  if (f.semantic.curiosity > 0.6 && f.text.specificity < 0.25) cues.push([0.35, ev('semantic.clickbaitGap', round(f.semantic.curiosity - f.text.specificity), '+')]);
  if (f.text.hashtags >= hashtagsMany) cues.push([0.2, ev('text.hashtags', f.text.hashtags, '+')]);
  if (f.text.mentions >= 4) cues.push([0.25, ev('text.mentions', f.text.mentions, '+')]);
  if (f.semantic.emotion > 0.85) cues.push([0.15, ev('semantic.emotion', f.semantic.emotion, '+')]);
  const value = 1 - cues.reduce((p, [r]) => p * (1 - r), 1);
  return { value: round(Math.max(0.05, value)), evidence: cues.map(([, e]) => e) };
}

// Format fit of the content's own structure, by type.
export function formatFit(f, ranges) {
  if (f.carousel) return { value: f.carousel.slideCountFit, evidence: [ev('carousel.slideCount', f.carousel.slideCount, f.carousel.slideCountFit >= 0.8 ? '+' : '-')] };
  if (f.reel) return { value: f.reel.durationFit, evidence: [ev('reel.durationSec', f.reel.durationSec, f.reel.durationFit >= 0.8 ? '+' : '-')] };
  if (f.thread) return { value: f.thread.postCountFit, evidence: [ev('thread.posts', f.thread.posts, f.thread.postCountFit >= 0.8 ? '+' : '-')] };
  const v = band(f.text.words, ranges.postWords) ?? 0;
  return { value: v, evidence: [ev('text.words', f.text.words, v >= 0.8 ? '+' : '-')] };
}

// Reel retention proxy: duration in range, rhythm, open loop with payoff.
export function reelRetention(f) {
  const r = f.reel;
  const loop = r.openLoops > 0 ? (r.payoff ? 1 : 0.2) : r.payoff ? 0.6 : 0.4;
  const value = 0.3 * r.durationFit + 0.2 * r.rhythmFit + 0.25 * loop + 0.25 * r.replayPotential;
  return {
    value,
    evidence: [ev('reel.durationSec', r.durationSec, r.durationFit >= 0.8 ? '+' : '-'), ev('reel.openLoops', r.openLoops, r.openLoops ? '+' : '-'), ev('reel.payoff', r.payoff, r.payoff ? '+' : '-'), ev('reel.sceneRhythmCv', r.sceneRhythmCv, r.rhythmFit >= 0.8 ? '+' : '-')],
  };
}

export function reelOpening(f) {
  const r = f.reel;
  return { value: 0.55 * (r.firstSecondsHasPromise ? 1 : 0) + 0.45 * (r.hookFits ? 1 : 0), evidence: [ev('reel.firstSecondsHasPromise', r.firstSecondsHasPromise, r.firstSecondsHasPromise ? '+' : '-'), ev('reel.hookWords', r.hookWords, r.hookFits ? '+' : '-')] };
}

export function carouselCompletion(f) {
  const c = f.carousel;
  const promise = c.promise.matches === null ? 0.6 : c.promise.matches ? 1 : 0.2;
  const value = 0.25 * c.slideCountFit + 0.25 * c.densityFit + 0.2 * promise + 0.2 * c.curiosityContinuity + 0.1 * (c.empty.length ? 0 : 1);
  return {
    value,
    evidence: [
      ev('carousel.slideCount', c.slideCount, c.slideCountFit >= 0.8 ? '+' : '-'),
      ev('carousel.densityFit', c.densityFit, c.densityFit >= 0.8 ? '+' : '-'),
      c.promise.count !== null && ev('carousel.promise', `${c.promise.count}/${c.promise.delivered}`, c.promise.matches ? '+' : '-'),
      ev('carousel.curiosityContinuity', c.curiosityContinuity, c.curiosityContinuity >= 0.5 ? '+' : '-'),
      c.empty.length && ev('carousel.empty', c.empty.join(','), '-'),
    ],
  };
}

// Hook evidence: the parts that are notably strong or weak.
export function hookEvidence(f) {
  const p = f.hook.parts;
  const out = [];
  if (p.lengthFit < 0.7) out.push(ev('hook.words', f.hook.words, '-'));
  else out.push(ev('hook.words', f.hook.words, '+'));
  if (f.hook.number) out.push(ev('hook.number', true, '+'));
  if (f.hook.question) out.push(ev('hook.question', true, '+'));
  if (p.curiosity >= 0.5) out.push(ev('hook.curiosity', p.curiosity, '+'));
  if (p.directAddress >= 0.5) out.push(ev('hook.directAddress', f.hook.directAddress, '+'));
  if (p.specificity < 0.3) out.push(ev('hook.specificity', p.specificity, '-'));
  return out;
}

export const AUDIENCE_EVIDENCE = {
  question: (f) => (f.hook.question || f.cta.question ? ev('text.question', true, '+') : ev('text.question', false, '-')),
  cta: (f) => (f.cta.specific ? ev('cta.specific', true, '+') : f.cta.generic ? ev('cta.generic', true, '-') : !f.cta.present ? ev('cta.present', false, '-') : null),
  directAddress: (f) => (f.text.directAddress ? ev('text.directAddress', f.text.directAddress, '+') : null),
  specificity: (f) => ev('text.specificity', f.text.specificity, f.text.specificity >= 0.4 ? '+' : '-'),
  usefulness: (f) => ev('semantic.usefulness', f.semantic.usefulness, f.semantic.usefulness >= 0.5 ? '+' : '-'),
  novelty: (f) => ev('semantic.novelty', f.semantic.novelty, f.semantic.novelty >= 0.4 ? '+' : '-'),
  quotability: (f) => (f.semantic.quotability >= 0.5 ? ev('semantic.quotability', f.semantic.quotability, '+') : null),
  list: (f) => (f.intent.scores.list >= 0.5 || f.text.numberedList ? ev('intent.list', true, '+') : null),
  opinion: (f) => (Math.max(f.intent.scores.opinion, f.intent.scores.controversy) >= 0.5 ? ev('intent.opinion', true, '+') : null),
  personal: (f) => (Math.max(f.intent.scores['personal-insight'], f.intent.scores.story) >= 0.5 ? ev('intent.personal', true, '+') : null),
};

export const evidenceOf = (f, keys) => keys.map((k) => AUDIENCE_EVIDENCE[k](f)).filter(Boolean);
