import { clamp01, round } from './normalization.js';

// The transparent scorer. A score type is a weighted mean of signal values
// (0..1) shown on 0..100; it decomposes exactly into contributions around
// the neutral 50:
//
//   score = 50 + Σ_i 100 · w_i · (v_i − 0.5) / Σ w
//
// so "why 72?" is always a list of signals that added or removed points.
// Signals whose value is null (no data, not applicable) are left out of
// both sums: a missing value never counts as zero.
//
// The overall Platform Fit Score follows the same idea:
//
//   fit = 100 · [ P − λ·N + q·(Q − ½) + f·(F − ½) ] + H
//
//   P  weighted mean of positive-action potentials (blend.positive)
//   N  weighted mean of negative-feedback risks (blend.negative)
//   Q  content-quality score, F  format-fit score (0..1)
//   H  historical account modifier, bounded by blend.historicalMaxShift
//
// It is a relative compatibility score under the current model, not a
// probability of reach or virality.

const used = (signals, weights, registry) =>
  Object.entries(weights ?? {})
    .map(([id, base]) => ({ id, w: registry.weight(id, base), s: signals[id] }))
    .filter((x) => x.w > 0 && x.s && typeof x.s.value === 'number');

export function scoreType(type, weights, signals, registry, { neutral = 0.5 } = {}) {
  const parts = used(signals, weights, registry);
  const total = parts.reduce((a, x) => a + x.w, 0);
  if (!total) return { type, score: null, contributions: [], confidence: null, signals: 0 };
  const mean = parts.reduce((a, x) => a + x.w * x.s.value, 0) / total;
  const contributions = parts.map((x) => ({
    signalId: x.id,
    contribution: round((100 * x.w * (x.s.value - neutral)) / total, 1),
    value: x.s.value,
    weight: round(x.w, 3),
    provenance: x.s.provenance,
  }));
  const confidence = parts.reduce((a, x) => a + x.w * x.s.confidence, 0) / total;
  return { type, score: Math.round(100 * mean), contributions, confidence: round(confidence), signals: parts.length };
}

export function blendScore({ signals, scores, blend, registry, historical = null }) {
  const pos = used(signals, blend.positive, registry);
  const neg = used(signals, blend.negative, registry);
  const pw = pos.reduce((a, x) => a + x.w, 0);
  const nw = neg.reduce((a, x) => a + x.w, 0);
  const P = pw ? pos.reduce((a, x) => a + x.w * x.s.value, 0) / pw : 0.5;
  const N = nw ? neg.reduce((a, x) => a + x.w * x.s.value, 0) / nw : 0;
  const Q = typeof scores.contentQuality?.score === 'number' ? scores.contentQuality.score / 100 : 0.5;
  const F = typeof scores.platformFit?.score === 'number' ? scores.platformFit.score / 100 : 0.5;
  const contributions = [
    ...pos.map((x) => ({ signalId: x.id, group: 'positive', contribution: round((100 * x.w * (x.s.value - 0.5)) / pw, 1), value: x.s.value, provenance: x.s.provenance })),
    ...neg.map((x) => ({ signalId: x.id, group: 'negative', contribution: round((-100 * blend.negativeScale * x.w * x.s.value) / nw, 1), value: x.s.value, provenance: x.s.provenance })),
    { signalId: 'score.contentQuality', group: 'quality', contribution: round(100 * blend.qualityScale * (Q - 0.5), 1), value: round(Q), provenance: 'derived' },
    { signalId: 'score.platformFit', group: 'fit', contribution: round(100 * (blend.fitScale ?? 0) * (F - 0.5), 1), value: round(F), provenance: 'derived' },
  ];
  // History moves the score only as far as its own confidence allows.
  let H = 0;
  if (historical && typeof historical.score === 'number' && historical.confidence > 0) {
    H = round(blend.historicalMaxShift * ((historical.score - 50) / 50) * clamp01(historical.confidence), 1);
    contributions.push({ signalId: 'score.historicalFit', group: 'historical', contribution: H, value: round(historical.score / 100), provenance: 'historical' });
  }
  const raw = 100 * (P - blend.negativeScale * N + blend.qualityScale * (Q - 0.5) + (blend.fitScale ?? 0) * (F - 0.5)) + H;
  const score = Math.round(Math.min(100, Math.max(0, raw)));
  return {
    score,
    clamped: score !== Math.round(raw),
    parts: { positive: round(P), negative: round(N), quality: round(Q), fit: round(F), historicalShift: H },
    contributions: contributions.filter((c) => c.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
  };
}

// All score types of one platform, plus the overall blend.
export function scorePlatform({ signals, platformConfig, registry, historical }) {
  const scores = {};
  for (const [type, weights] of Object.entries(platformConfig.scoreTypes)) scores[type] = scoreType(type, weights, signals, registry);
  scores.historicalFit = historical ?? { type: 'historicalFit', score: null, contributions: [], confidence: null, signals: 0 };
  const overall = blendScore({ signals, scores, blend: platformConfig.blend, registry, historical });
  return { scores, overall };
}
