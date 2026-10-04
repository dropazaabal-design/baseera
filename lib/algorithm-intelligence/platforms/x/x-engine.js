import { SHARED_RULES } from '../../core/recommendation-engine.js';
import { X_RULES } from './x-recommendations.js';
import { scoreX } from './x-scoring.js';

// The X engine: signals (x-signals.js) → scores (x-scoring.js) →
// recommendations (shared rules + x-recommendations.js).
export const xEngine = {
  id: 'x',
  rules: [...SHARED_RULES, ...X_RULES],
  score: scoreX,
};
