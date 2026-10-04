import { X_PUBLIC_WEIGHTS } from '../../research/provenance.js';
import { runPlatform } from '../base.js';
import { xSignals } from './x-signals.js';

// X scoring: the configured blend of positive-action potentials minus
// negative-feedback risk, plus quality, format and history modifiers
// (config.platforms.x). Context notes cover what X's public code does at
// feed level that a single post's score cannot include.

export const X_HISTORY_IDS = { patterns: 'x.historical_performance', affinity: 'x.author_affinity' };

export function xNotes(features, history) {
  const notes = [];
  if (features.type === 'carousel' || features.type === 'reel') {
    notes.push({ code: 'x.visual-format', provenance: 'derived', ar: 'على إكس تُعرض الشرائح أو الفيديو كوسائط؛ تُقرأ الدرجة من النص المرافق والغلاف فقط.', en: 'On X, slides or video are media; the score reads the accompanying text and the cover only.' });
  }
  const median = history?.medianOf?.('impressions');
  if (typeof median === 'number' && median < X_PUBLIC_WEIGHTS.coldStartImpressionThreshold) {
    notes.push({
      code: 'x.new-author',
      provenance: 'public-source-code',
      ar: `متوسط مشاهدات منشوراتك (${Math.round(median)}) دون عتبة ${X_PUBLIC_WEIGHTS.coldStartImpressionThreshold} التي يذكرها كود إكس المنشور لتعزيز المؤلفين الجدد. هذا يؤثر في التوزيع وليس في جودة المحتوى، ولا تضيفه بصيرة إلى الدرجة.`,
      en: `Your median impressions (${Math.round(median)}) are below the ${X_PUBLIC_WEIGHTS.coldStartImpressionThreshold}-impression cold-start threshold in X's public code (new-author boost). It affects distribution, not content quality, and is not added to the score.`,
    });
  }
  return notes;
}

export function scoreX({ features, config, registry, history }) {
  return runPlatform({ platform: 'x', features, config, registry, history, computeSignals: xSignals, historyIds: X_HISTORY_IDS, notes: xNotes(features, history) });
}
