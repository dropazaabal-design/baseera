import { DEFAULT_CONFIG } from '../config.js';
import { confidenceLabel } from '../types.js';
import { clamp01, round } from './normalization.js';

// How much to trust a score. Confidence never hides uncertainty: without
// account history a platform score is capped below "medium" and says why.
//
//   content part   weighted trust of the signals behind the score, by where
//                  their values come from (config.confidence.provenance)
//   history part   amount of comparable history × recency × similarity
//
//   confidence = min(content, genericCap) + (0.9 − genericCap) · history
//
// so a content-only score stays low, and history raises it only as fast as
// there is enough, recent, comparable data.

export function signalConfidence(provenance, config = DEFAULT_CONFIG, { semanticSource } = {}) {
  const base = config.confidence.provenance[provenance] ?? 0.3;
  // An AI semantic judgement is a model opinion: a little above word lists.
  if (semanticSource?.startsWith('ai:') && provenance === 'heuristic') return 0.5;
  return base;
}

// Confidence of a value computed from n observations (historical signals).
export const sampleConfidence = (n, full = 40) => round(clamp01(Math.sqrt(Math.max(0, n) / full)) * 0.9);

export function historyStrength(history, config = DEFAULT_CONFIG) {
  const { n = 0, comparable = 0, lastAt = null, now = new Date().toISOString() } = history ?? {};
  if (!n) return { value: 0, quantity: 0, recency: 0, similarity: 0, ageDays: null };
  const quantity = clamp01(n / config.confidence.historyFullAt);
  const ageDays = lastAt ? Math.max(0, (Date.parse(now) - Date.parse(lastAt)) / 86400000) : null;
  const recency = ageDays === null ? 0.5 : Math.pow(0.5, ageDays / config.confidence.recencyHalfLifeDays);
  const similarity = n ? clamp01(comparable / n) : 0;
  // Similar posts matter most; unrelated history still says something about the audience.
  const value = clamp01(quantity * recency * (0.4 + 0.6 * similarity));
  return { value: round(value), quantity: round(quantity), recency: round(recency), similarity: round(similarity), ageDays: ageDays === null ? null : Math.round(ageDays) };
}

export function platformConfidence({ contentConfidence, history, config = DEFAULT_CONFIG, heuristicShare = 0 }) {
  const cap = config.confidence.genericCap;
  const h = historyStrength(history, config);
  const content = Math.min(contentConfidence ?? 0, cap);
  const value = round(clamp01(content + (0.9 - cap) * h.value));
  const reasons = [];
  if (!history?.n) reasons.push({ code: 'no-history', ar: 'نموذج المنصة العام فقط: لا توجد بيانات أداء لهذا الحساب بعد.', en: 'Generic platform model only: no account history yet.' });
  else {
    reasons.push({ code: 'history', ar: `${history.n} منشورًا سابقًا، منها ${history.comparable ?? 0} من الصيغة نفسها.`, en: `${history.n} past posts, ${history.comparable ?? 0} in the same format.` });
    if (h.ageDays !== null && h.ageDays > config.confidence.recencyHalfLifeDays) reasons.push({ code: 'stale', ar: `آخر بيانات منذ ${h.ageDays} يومًا.`, en: `Latest data is ${h.ageDays} days old.` });
    if (history.n < config.history.minSample) reasons.push({ code: 'small-sample', ar: 'العينة صغيرة: لا استنتاجات عن الأنماط بعد.', en: 'Small sample: no pattern claims yet.' });
  }
  if (heuristicShare > 0.5) reasons.push({ code: 'heuristic-share', ar: `${Math.round(heuristicShare * 100)}% من وزن الدرجة تقديرات قاعدية وليست قياسًا مباشرًا.`, en: `${Math.round(heuristicShare * 100)}% of the score's weight rests on rule-of-thumb estimates.` });
  return { confidence: value, confidenceLabel: confidenceLabel(value), history: h, reasons };
}
