import { now } from '../../studio/util.js';

// Optional learned models. Phase 1 of the engine is transparent weighted
// scoring; this is the Phase 2 slot. A model is plain JSON (stored under
// algorithm/models/), so it can be trained here (logistic regression, below)
// or outside Basira (gradient-boosted trees, ranking or neural models) and
// imported, as long as it declares its type, features and evaluation.
//
// A model is only used when its time-ordered holdout evaluation beats the
// account's base rate (AUC ≥ 0.6 on ≥ 60 posts). Its output is reported as
// a probability of beating the account's own baseline only when the
// holdout Brier score is better than predicting the base rate; otherwise
// it is a score, never a probability.

export const MODEL_TYPES = ['logistic'];
const MODEL = (id) => `algorithm/models/${id}.json`;

export function timeSplit(rows, holdout = 0.25) {
  const sorted = [...rows].sort((a, b) => String(a.postedAt ?? '').localeCompare(String(b.postedAt ?? '')));
  const cut = Math.max(1, Math.floor(sorted.length * (1 - holdout)));
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function predictLogistic(model, x) {
  let z = model.bias;
  model.featureNames.forEach((k, i) => {
    const v = typeof x[k] === 'number' ? x[k] : model.means[i];
    z += model.weights[i] * ((v - model.means[i]) / (model.scales[i] || 1));
  });
  return sigmoid(z);
}

// L2-regularized logistic regression by batch gradient descent, on
// standardized features (deterministic: zero init, fixed iterations).
export function trainLogistic(rows, { featureNames, l2 = 1, iterations = 600, rate = 0.2, platform = null, metric = null } = {}) {
  const names = featureNames ?? [...new Set(rows.flatMap((r) => Object.keys(r.x)))].sort();
  const col = (k) => rows.map((r) => (typeof r.x[k] === 'number' ? r.x[k] : 0));
  const means = names.map((k) => col(k).reduce((a, b) => a + b, 0) / Math.max(1, rows.length));
  const scales = names.map((k, i) => Math.sqrt(col(k).reduce((a, v) => a + (v - means[i]) ** 2, 0) / Math.max(1, rows.length)) || 1);
  const X = rows.map((r) => names.map((k, i) => ((typeof r.x[k] === 'number' ? r.x[k] : means[i]) - means[i]) / scales[i]));
  const y = rows.map((r) => r.label);
  const w = new Array(names.length).fill(0);
  let b = 0;
  const n = Math.max(1, rows.length);
  for (let it = 0; it < iterations; it++) {
    const gw = new Array(names.length).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(b + X[i].reduce((s, v, j) => s + v * w[j], 0));
      const e = p - y[i];
      gb += e;
      for (let j = 0; j < w.length; j++) gw[j] += e * X[i][j];
    }
    for (let j = 0; j < w.length; j++) w[j] -= rate * (gw[j] / n + (l2 * w[j]) / n);
    b -= rate * (gb / n);
  }
  return { type: 'logistic', id: `logistic-${platform ?? 'any'}-${Date.parse(now()).toString(36)}`, platform, metric, featureNames: names, means, scales, weights: w, bias: b, n: rows.length, trainedAt: now() };
}

export function auc(scores, labels) {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

export function evaluate(model, rows) {
  const p = rows.map((r) => predictLogistic(model, r.x));
  const y = rows.map((r) => r.label);
  const base = y.reduce((a, b) => a + b, 0) / Math.max(1, y.length);
  const brier = p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / Math.max(1, y.length);
  const baseBrier = y.reduce((s, v) => s + (base - v) ** 2, 0) / Math.max(1, y.length);
  return { n: rows.length, auc: auc(p, y), brier, baseBrier, baseRate: base };
}

export function trainAndEvaluate(rows, opts = {}) {
  const { train, test } = timeSplit(rows, opts.holdout ?? 0.25);
  const model = trainLogistic(train, opts);
  const evaluation = evaluate(model, test);
  const accepted = rows.length >= 60 && evaluation.auc !== null && evaluation.auc >= 0.6;
  return { model: { ...model, evaluation, accepted, calibrated: accepted && evaluation.brier < evaluation.baseBrier }, evaluation, accepted };
}

export function validateModel(model) {
  const out = [];
  if (!MODEL_TYPES.includes(model?.type)) out.push(`type must be one of ${MODEL_TYPES.join(', ')}`);
  if (!Array.isArray(model?.featureNames) || !model.featureNames.length) out.push('featureNames required');
  for (const k of ['weights', 'means', 'scales']) if (!Array.isArray(model?.[k]) || model[k].length !== model?.featureNames?.length) out.push(`${k} must match featureNames`);
  if (typeof model?.bias !== 'number') out.push('bias must be a number');
  if (!model?.evaluation) out.push('evaluation required (holdout AUC and Brier score)');
  return out;
}

export function saveModel(store, model) {
  const problems = validateModel(model);
  if (problems.length) throw new Error(`model: ${problems.join('; ')}`);
  store.writeJson(MODEL(model.id), model);
  return model.id;
}

export const loadModel = (store, id) => store.readJson(MODEL(id));
