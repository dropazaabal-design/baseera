import { runPlatform } from '../base.js';
import { instagramSignals } from './instagram-signals.js';

// Instagram scoring with its own profile (config.platforms.instagram):
// shares and saves lead the blend, carousel completion and reel completion
// carry retention, skip risk is the main negative.

export const INSTAGRAM_HISTORY_IDS = { patterns: 'instagram.historical_performance', affinity: 'instagram.topic_affinity' };

export function instagramNotes(features) {
  const notes = [];
  if (features.type === 'thread') notes.push({ code: 'instagram.thread', provenance: 'derived', ar: 'السلسلة ليست صيغة إنستغرام؛ حُللت كوصف واحد. الأنسب تحويلها إلى كاروسيل.', en: 'Threads are not an Instagram format; analyzed as one caption. A carousel is the closer fit.' });
  if (features.type !== 'carousel' && features.type !== 'reel' && !features.caption) notes.push({ code: 'instagram.single', provenance: 'derived', ar: 'حُلل كمنشور مفرد (صورة ونص).', en: 'Analyzed as a single feed post (image and text).' });
  return notes;
}

export function scoreInstagram({ features, config, registry, history }) {
  return runPlatform({ platform: 'instagram', features, config, registry, history, computeSignals: instagramSignals, historyIds: INSTAGRAM_HISTORY_IDS, notes: instagramNotes(features) });
}
