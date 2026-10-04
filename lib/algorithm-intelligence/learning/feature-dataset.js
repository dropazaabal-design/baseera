import { featureVector } from '../core/feature-extractor.js';
import { historyRows } from '../history/account-profile.js';
import { PRIMARY_OUTCOME } from '../history/post-history.js';

// The account's history as a dataset: one row per published post with
// known features, its numeric feature vector, the outcome ratio to its
// format baseline (y) and a binary label "beat the baseline" (y > 1).
// Used by the optional ML predictor and exportable for outside training.

export function buildDataset({ store, account = 'default', platform, config, metric = PRIMARY_OUTCOME[platform] }) {
  const { rows } = historyRows({ store, account, platform, config });
  return rows
    .filter((r) => r.features && typeof r.ratios[metric] === 'number')
    .map((r) => ({ id: r.record.id, platform, postedAt: r.record.postedAt, contentType: r.record.contentType, metric, x: featureVector(r.features), y: r.ratios[metric], label: r.ratios[metric] > 1 ? 1 : 0 }));
}

export const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

export function toCsv(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.x)))].sort();
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [['id', 'platform', 'postedAt', 'contentType', 'metric', 'y', 'label', ...keys].join(','), ...rows.map((r) => [r.id, r.platform, r.postedAt, r.contentType, r.metric, r.y, r.label, ...keys.map((k) => r.x[k])].map(esc).join(','))].join('\n') + '\n';
}
