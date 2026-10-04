import { SIGNAL_CATALOG } from '../research/signal-catalog.js';
import { LEVEL, PLATFORM_LABEL, SCORE_LABEL } from './messages.js';

const LABEL = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.id, s.label]));

// A plain-text report of an analysis, for the terminal and for pasting:
// scores always come with their reasons, confidence and the disclaimer.

const HIGHLIGHTS = {
  x: ['x.reply_potential', 'x.repost_potential', 'x.dwell_potential', 'x.profile_click_potential', 'x.negative_feedback_risk'],
  instagram: ['instagram.save_potential', 'instagram.share_potential', 'instagram.carousel_completion', 'instagram.reel_completion', 'instagram.skip_risk'],
  facebook: ['facebook.meaningful_comment_potential', 'facebook.share_potential', 'facebook.watch_retention', 'facebook.show_more_potential', 'facebook.caption_readability'],
};

const L = {
  overall: { ar: 'إمكانات المحتوى إجمالًا', en: 'Overall content potential' },
  confidence: { ar: 'الثقة', en: 'confidence' },
  positives: { ar: 'ما رفع الدرجة', en: 'Positive contributors' },
  negatives: { ar: 'ما خفضها', en: 'Negative contributors' },
  recs: { ar: 'التحسينات المقترحة', en: 'Recommended improvements' },
  expected: { ar: 'الأثر المتوقع وفق النموذج الحالي', en: 'expected effect under the current model' },
  account: { ar: 'من بيانات حسابك', en: 'Your account data' },
  density: { ar: 'تحذير كثافة', en: 'Slide density warning' },
  slide: { ar: 'الشريحة', en: 'Slide' },
  unavailable: { ar: 'غير متاح', en: 'Not available' },
  labels: { high: { ar: 'مرتفعة', en: 'high' }, medium: { ar: 'متوسطة', en: 'medium' }, low: { ar: 'منخفضة', en: 'low' } },
};

const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n * 10) / 10)}`;

export function formatReport(report, { lang = 'en', recommendations = 8 } = {}) {
  const out = [];
  const t = (k) => L[k][lang];
  const confLine = (c) => `${t('confidence')}: ${L.labels[c.confidenceLabel][lang]} (${c.confidence})${c.reasons?.length ? ` — ${c.reasons.map((r) => r[lang] ?? r).join(' ')}` : ''}`;
  out.push(`${t('overall')}: ${report.overall.score}/100`);
  out.push('');
  for (const [p, r] of Object.entries(report.platforms)) {
    out.push(`${PLATFORM_LABEL[p][lang]} — ${SCORE_LABEL.overall[lang]}: ${r.overall.score}/100`);
    out.push(`  ${confLine(r.confidence)}`);
    const hl = HIGHLIGHTS[p]
      .map((id) => r.signals[id])
      .filter((s) => s && s.value !== null)
      .map((s) => `${LABEL[s.id]?.[lang] ?? s.id}: ${LEVEL(s.value)[lang]}`);
    if (hl.length) out.push(`  ${hl.join(' · ')}`);
    const st = ['hook', 'retention', 'conversation', 'share', 'save'].filter((k) => typeof r.scores[k]?.score === 'number').map((k) => `${SCORE_LABEL[k][lang]} ${r.scores[k].score}`);
    if (st.length) out.push(`  ${st.join(' · ')}`);
    if (p === 'instagram' && report.perSlide) {
      const dense = report.perSlide.filter((s) => s.warning === 'too_dense' || s.warning === 'dense' || s.warning === 'empty');
      if (dense.length) out.push(`  ${t('density')}: ${dense.map((s) => `${t('slide')} ${s.slide} (${s.words})`).join(', ')}`);
    }
    if (r.explanation.positives.length) out.push(`  ${t('positives')}:`, ...r.explanation.positives.map((l) => `   + ${l.label} (${signed(l.points)})${l.why.length ? `: ${l.why.join('؛ ')}` : ''}`));
    if (r.explanation.negatives.length) out.push(`  ${t('negatives')}:`, ...r.explanation.negatives.map((l) => `   − ${l.label} (${signed(l.points)})${l.why.length ? `: ${l.why.join('؛ ')}` : ''}`));
    if (r.accountEvidence?.length) out.push(`  ${t('account')}:`, ...r.accountEvidence.map((e) => `   ${e.effect === undefined || e.effect >= 0 ? '✓' : '⚠'} ${e.statement[lang]}`));
    for (const n of r.notes ?? []) out.push(`  • ${n.text}`);
    out.push('');
  }
  const recs = report.recommendations.slice(0, recommendations);
  if (recs.length) {
    out.push(`${t('recs')}:`);
    recs.forEach((rec, i) => {
      out.push(`${i + 1}. [${rec.priority}] ${rec.suggestedFix}`);
      out.push(`   ${rec.reason}`);
      const eff = Object.entries(rec.effects ?? { [rec.platform]: rec.expectedEffect })
        .filter(([, e]) => e && e.overallDelta)
        .map(([p, e]) => `${PLATFORM_LABEL[p][lang]} ${signed(e.overallDelta)}`);
      if (eff.length) out.push(`   ${t('expected')}: ${eff.join(', ')}`);
      if (rec.accountEvidence?.line) {
        const line = rec.accountEvidence.line;
        out.push(`   ${t('account')}: ${typeof line === 'string' ? line : line[lang] ?? ''}`);
      }
    });
    out.push('');
  }
  out.push(report.disclaimer);
  return out.join('\n');
}
