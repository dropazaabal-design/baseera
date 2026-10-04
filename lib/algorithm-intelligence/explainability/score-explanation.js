import { LEVEL, PLATFORM_LABEL, PROVENANCE_LABEL, SCORE_LABEL, featureLabel } from './messages.js';

// Turns a platform report's contributions into reasons people can read:
// what added points, what removed them, how sure the engine is and why.
// A number is never returned without its reasons.

export const DISCLAIMER = {
  en: 'Basira does not claim access to private platform ranking algorithms. Scores are estimates generated from public platform information, content features and account-specific historical performance. A Platform Fit Score is a relative compatibility score under the current model, not a probability of reach or virality.',
  ar: 'لا تدّعي بصيرة الوصول إلى خوارزميات الترتيب الخاصة بالمنصات. الدرجات تقديرات مبنية على معلومات المنصات المنشورة وخصائص المحتوى وأداء حسابك السابق. درجة ملاءمة المنصة مقياس نسبي للتوافق وفق النموذج الحالي، وليست احتمال وصول أو انتشار.',
};

function signalLine(registry, c, signals, lang, scores = {}) {
  if (c.signalId.startsWith('score.')) {
    // A score-level modifier: name the signals that moved that score most.
    const type = c.signalId.slice(6);
    const sign = c.contribution >= 0 ? 1 : -1;
    const why = (scores[type]?.contributions ?? [])
      .filter((x) => sign * x.contribution > 0)
      .sort((a, b) => sign * (b.contribution - a.contribution))
      .slice(0, 2)
      .map((x) => `${registry.get(x.signalId)?.label?.[lang] ?? x.signalId} ${LEVEL(x.value)[lang]}`);
    return { id: c.signalId, label: SCORE_LABEL[c.signalId][lang], points: c.contribution, provenance: c.provenance, provenanceLabel: PROVENANCE_LABEL[c.provenance][lang], why };
  }
  const def = registry.get(c.signalId);
  const s = signals[c.signalId];
  const sign = c.contribution >= 0 ? '+' : '-';
  // Evidence that pushed in the same direction as the contribution (risks
  // count the other way: a "+" cue raises a risk and lowers the score).
  const negative = def?.category === 'negative_feedback';
  const wanted = negative ? (sign === '+' ? '-' : '+') : sign;
  const why = (s?.evidence ?? []).filter((e) => e.effect === wanted).slice(0, 3).map((e) => featureLabel(e.feature, e.value, lang));
  return {
    id: c.signalId,
    label: def?.label?.[lang] ?? c.signalId,
    level: LEVEL(s?.value ?? 0)[lang],
    value: s?.value ?? null,
    points: c.contribution,
    provenance: s?.provenance ?? c.provenance,
    provenanceLabel: PROVENANCE_LABEL[s?.provenance ?? c.provenance]?.[lang],
    why,
  };
}

export function explainPlatform(report, registry, { lang = 'ar', limit = 5, threshold = 1 } = {}) {
  const lines = report.overall.contributions.map((c) => signalLine(registry, c, report.signals, lang, report.scores));
  const positives = lines.filter((l) => l.points >= threshold).slice(0, limit);
  const negatives = lines.filter((l) => l.points <= -threshold).slice(0, limit);
  const scoreTypes = Object.fromEntries(
    Object.entries(report.scores)
      .filter(([, s]) => typeof s.score === 'number')
      .map(([type, s]) => [type, { label: SCORE_LABEL[type]?.[lang] ?? type, score: s.score, top: s.contributions.slice().sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3).map((c) => signalLine(registry, c, report.signals, lang)) }]),
  );
  const unavailable = Object.values(report.signals)
    .filter((s) => s.value === null && s.note)
    .map((s) => ({ id: s.id, label: registry.get(s.id)?.label?.[lang] ?? s.id, note: s.note }));
  return {
    platform: report.platform,
    title: `${PLATFORM_LABEL[report.platform][lang]} — ${SCORE_LABEL.overall[lang]}: ${report.overall.score}/100`,
    positives,
    negatives,
    scoreTypes,
    confidence: { value: report.confidence.confidence, label: report.confidence.confidenceLabel, reasons: report.confidence.reasons.map((r) => r[lang]) },
    unavailable,
    disclaimer: DISCLAIMER[lang],
  };
}
