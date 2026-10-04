import { SHARED_RULES } from '../../core/recommendation-engine.js';
import { INSTAGRAM_RULES } from './instagram-recommendations.js';
import { scoreInstagram } from './instagram-scoring.js';

// The Instagram engine: feed posts, carousels and reels.
export const instagramEngine = {
  id: 'instagram',
  rules: [...SHARED_RULES, ...INSTAGRAM_RULES],
  score: scoreInstagram,
};
