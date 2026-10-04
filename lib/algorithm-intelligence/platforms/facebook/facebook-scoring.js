import { runPlatform } from '../base.js';
import { facebookSignals } from './facebook-signals.js';

// Facebook scoring with its own profile (config.platforms.facebook):
// meaningful comments and shares lead, scroll-past and negative feedback
// weigh heavier than on Instagram, and saves are not scored (no save
// metric in the Page post insights Basira imports).

export const FACEBOOK_HISTORY_IDS = { patterns: 'facebook.historical_performance', affinity: 'facebook.topic_affinity' };

export function facebookNotes(features) {
  const notes = [];
  if (features.text.links) notes.push({ code: 'facebook.link', provenance: 'official', ar: 'منشور برابط: يتوقع فيسبوك النقر على الرابط ومدة البقاء في الموقع (بطاقة نظام الخلاصة).', en: 'Link post: Facebook predicts link clicks and time on the website (Feed system card).' });
  return notes;
}

export function scoreFacebook({ features, config, registry, history }) {
  return runPlatform({ platform: 'facebook', features, config, registry, history, computeSignals: facebookSignals, historyIds: FACEBOOK_HISTORY_IDS, notes: facebookNotes(features) });
}
