import { PROVENANCE_LABEL, featureLabel } from './messages.js';

// The "because" of a recommendation, line by line: each measured feature
// with its value and target, where it comes from, and the account evidence
// (sample size, confidence, date range) when history backs it.

export function reasonLines(rec, lang = 'ar') {
  const lines = (rec.evidence ?? []).map((e) => {
    const target = e.target !== undefined && e.target !== null ? (lang === 'ar' ? ` (الهدف: ${e.target})` : ` (target: ${e.target})`) : '';
    const label = featureLabel(e.feature, e.value, lang);
    return { text: `${label}${target}`, provenance: e.provenance, provenanceLabel: PROVENANCE_LABEL[e.provenance]?.[lang] ?? e.provenance };
  });
  const ae = rec.accountEvidence;
  if (ae) {
    const line = typeof ae.line === 'string' ? ae.line : ae.line?.[lang] ?? (ae.line?.lo !== undefined ? `${ae.line.feature}: ${ae.line.lo}–${ae.line.hi}` : '');
    const range = ae.dateRange ? ` ${ae.dateRange.from?.slice(0, 10)} → ${ae.dateRange.to?.slice(0, 10)}` : '';
    lines.push({ text: `${line} (n=${ae.sampleSize ?? '?'}, ${lang === 'ar' ? 'ثقة' : 'confidence'} ${ae.confidence ?? '?'}${range})`, provenance: 'historical', provenanceLabel: PROVENANCE_LABEL.historical[lang] });
  }
  return lines;
}

export function effectLine(rec, lang = 'ar') {
  const e = rec.expectedEffect;
  if (!e) return lang === 'ar' ? 'لا يقيس النموذج أثر هذا التعديل.' : 'The model does not measure the effect of this change.';
  if (!e.overallDelta) return lang === 'ar' ? 'بلا أثر على الدرجة وفق النموذج الحالي.' : 'No change to the score under the current model.';
  const sign = e.overallDelta > 0 ? '+' : '−';
  return lang === 'ar' ? `${sign}${Math.abs(e.overallDelta)} على ملاءمة المنصة وفق النموذج الحالي (ليس وعدًا بوصول).` : `${sign}${Math.abs(e.overallDelta)} Platform Fit under the current model (not a reach promise).`;
}
