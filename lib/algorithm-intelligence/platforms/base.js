import { platformConfidence } from '../core/confidence.js';
import { round } from '../core/normalization.js';
import { scorePlatform } from '../core/scoring-engine.js';

// What every platform engine does with its own signals and configuration:
// score each score type, blend the Platform Fit Score, attach confidence.
// The engines differ only in their signal functions, configuration,
// applicability notes and recommendation rules.

// The account-history score: matching patterns (weight 2) and the topic's
// record on the account (weight 1). Null when there is no usable history.
export function historicalFit(signals, ids) {
  const parts = [
    [signals[ids.patterns], 2],
    [signals[ids.affinity], 1],
  ].filter(([s]) => s && typeof s.value === 'number');
  if (!parts.length) return { type: 'historicalFit', score: null, contributions: [], confidence: null, signals: 0 };
  const w = parts.reduce((a, [, wt]) => a + wt, 0);
  const mean = parts.reduce((a, [s, wt]) => a + wt * s.value, 0) / w;
  return {
    type: 'historicalFit',
    score: Math.round(100 * mean),
    contributions: parts.map(([s, wt]) => ({ signalId: s.id, contribution: round((100 * wt * (s.value - 0.5)) / w, 1), value: s.value, weight: wt, provenance: 'historical' })),
    confidence: round(parts.reduce((a, [s, wt]) => a + wt * s.confidence, 0) / w),
    signals: parts.length,
  };
}

export function runPlatform({ platform, features, config, registry, history = null, computeSignals, historyIds, notes = [] }) {
  const platformConfig = config.platforms[platform];
  const semanticSource = features.semantic?.source;
  const signals = computeSignals(features, { config, history, semanticSource });
  const historical = historicalFit(signals, historyIds);
  const { scores, overall } = scorePlatform({ signals, platformConfig, registry, historical });

  // Content-side confidence: blend weight × signal confidence.
  const blendIds = { ...platformConfig.blend.positive, ...platformConfig.blend.negative };
  let wsum = 0;
  let csum = 0;
  let heuristic = 0;
  for (const [id, base] of Object.entries(blendIds)) {
    const s = signals[id];
    const w = registry.weight(id, base);
    if (!s || s.value === null || !w) continue;
    wsum += w;
    csum += w * s.confidence;
    if (s.provenance === 'heuristic') heuristic += w;
  }
  const confidence = platformConfidence({
    contentConfidence: wsum ? csum / wsum : 0,
    history: history ? { n: history.n, comparable: history.comparable(features), lastAt: history.lastAt } : null,
    config,
    heuristicShare: wsum ? heuristic / wsum : 1,
  });
  // What the account's own data says about this content (matched patterns
  // and the topic's record), for the report's "Your account data" lines.
  const fit = history?.patternFit(features) ?? null;
  const affinity = history?.topicAffinity(features) ?? null;
  const accountEvidence = [
    ...(fit?.matches ?? []).filter((m) => Math.abs(m.effect) >= config.history.minEffect).map((m) => ({ kind: 'pattern', id: m.id, effect: m.effect, statement: m.statement })),
    ...(affinity ? [{ kind: 'topic', topic: features.topics[0], ratio: affinity.ratio, n: affinity.n, statement: { ar: `منشورات موضوع «${features.topics[0]}» على حسابك: ${affinity.ratio}× وسيط الحساب (n=${affinity.n}).`, en: `Posts on "${features.topics[0]}" on your account: ${affinity.ratio}× the account median (n=${affinity.n}).` } }] : []),
  ];
  return {
    platform,
    modelVersion: platformConfig.modelVersion,
    accountEvidence,
    weightsVersion: registry.adaptive?.version ?? 'default',
    signals,
    scores,
    overall,
    confidence,
    notes,
  };
}
