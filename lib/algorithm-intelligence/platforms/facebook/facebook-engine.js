import { SHARED_RULES } from '../../core/recommendation-engine.js';
import { FACEBOOK_RULES } from './facebook-recommendations.js';
import { scoreFacebook } from './facebook-scoring.js';

// The Facebook engine: text, image, link, video and reel posts.
export const facebookEngine = {
  id: 'facebook',
  rules: [...SHARED_RULES, ...FACEBOOK_RULES],
  score: scoreFacebook,
};
