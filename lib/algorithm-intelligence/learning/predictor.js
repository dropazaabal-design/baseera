import { createEngine } from '../engine.js';
import { featureVector } from '../core/feature-extractor.js';
import { predictLogistic } from './training-interface.js';

// One interface for every way of predicting a platform score:
//
//   interface Predictor { id; predict(input) → Promise<Prediction> }
//   Prediction { platform, score, confidence, modelVersion, probability? }
//
// HeuristicPredictor        the transparent platform model alone
// AccountAdaptivePredictor  the same plus the account's history, patterns
//                           and adaptive weights
// MLPredictor               an optional learned model (training-interface.js)
//
// `input` is a content object (anything toContentInput accepts) or
// { features } from a previous extraction.

const featuresOf = (engine, input) => input?.features ?? engine.features(input.content ?? input);

export class HeuristicPredictor {
  constructor({ platform, config } = {}) {
    this.id = 'heuristic';
    this.platform = platform;
    this.engine = createEngine({ config });
  }

  async predict(input) {
    const f = featuresOf(this.engine, input);
    const r = this.engine.scorePlatform(this.platform, f);
    return { platform: this.platform, score: r.overall.score, confidence: r.confidence.confidence, modelVersion: r.modelVersion, predictor: this.id };
  }
}

export class AccountAdaptivePredictor {
  constructor({ platform, store, account = 'default', config } = {}) {
    this.id = 'account-adaptive';
    this.platform = platform;
    this.account = account;
    this.engine = createEngine({ store, config, accountId: account });
  }

  async predict(input) {
    const f = featuresOf(this.engine, input);
    const r = this.engine.scorePlatform(this.platform, f, this.account);
    return { platform: this.platform, score: r.overall.score, confidence: r.confidence.confidence, modelVersion: r.modelVersion, weightsVersion: r.weightsVersion, predictor: this.id };
  }
}

export class MLPredictor {
  constructor({ model }) {
    if (!model?.accepted) throw new Error('MLPredictor: this model did not pass its holdout evaluation; it is not used');
    this.id = 'ml';
    this.model = model;
    this.platform = model.platform;
    this.engine = createEngine();
  }

  async predict(input) {
    const f = featuresOf(this.engine, input);
    const p = predictLogistic(this.model, featureVector(f));
    return {
      platform: this.platform,
      score: Math.round(100 * p),
      // A probability only when the model was calibrated on held-out posts.
      ...(this.model.calibrated && { probability: Math.round(p * 1000) / 1000, probabilityOf: `beating this account's ${this.model.metric} baseline` }),
      confidence: Math.round(Math.min(0.9, (this.model.evaluation.auc - 0.5) * 2) * 100) / 100,
      modelVersion: this.model.id,
      predictor: this.id,
    };
  }
}
