import { now, randomId } from '../../studio/util.js';
import { mergeRecord, normalizeRecord } from './post-history.js';

// Persistence on the studio's existing byte store (lib/studio/store.js):
// files on disk for the CLI (~/.baseera), localStorage in the editor,
// memory in tests. Included in `studio backup` like the rest of the store.
//
//   analytics/<account>/posts.json                  published posts + metrics
//   analytics/<account>/profile.<platform>.json      derived account profile
//   algorithm/weights/<account>/<platform>.json      adaptive weight versions
//   algorithm/runs/<account>/<yyyy-mm>/<id>.json      analysis runs
//   algorithm/models/<id>.json                       optional trained models
//
// Account ids are file-safe slugs; "@kitabwbs" becomes "kitabwbs".

export const accountSlug = (id = 'default') => {
  const s = String(id).trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'default';
};

export class PerformanceStore {
  constructor(store, accountId = 'default') {
    this.store = store;
    this.account = accountSlug(accountId);
  }

  get path() {
    return `analytics/${this.account}/posts.json`;
  }

  all() {
    return this.store.readJson(this.path)?.posts ?? [];
  }

  list({ platform, contentType } = {}) {
    return this.all().filter((r) => (!platform || r.platform === platform) && (!contentType || r.contentType === contentType));
  }

  get(id) {
    return this.all().find((r) => r.id === id) ?? null;
  }

  // Adds or updates records; returns { added, updated }.
  upsert(rawRecords, { source } = {}) {
    const byId = new Map(this.all().map((r) => [r.id, r]));
    let added = 0;
    let updated = 0;
    for (const raw of rawRecords) {
      const rec = raw.id && raw.metrics && raw.importedAt ? raw : normalizeRecord(raw, { source });
      if (byId.has(rec.id)) updated++;
      else added++;
      byId.set(rec.id, mergeRecord(byId.get(rec.id), rec));
    }
    const posts = [...byId.values()].sort((a, b) => String(a.postedAt ?? '').localeCompare(String(b.postedAt ?? '')));
    this.store.writeJson(this.path, { account: this.account, updatedAt: now(), posts });
    return { added, updated, total: posts.length };
  }

  setFeatures(id, features) {
    const data = this.store.readJson(this.path);
    const rec = data?.posts.find((r) => r.id === id);
    if (!rec) return false;
    rec.features = features;
    this.store.writeJson(this.path, data);
    return true;
  }

  // Ties a published post to the Basira design it came from.
  link(id, designId) {
    const data = this.store.readJson(this.path);
    const rec = data?.posts.find((r) => r.id === id || r.postId === id);
    if (!rec) throw new Error(`no post ${id} on account ${this.account}`);
    rec.designId = designId;
    rec.features = null; // recomputed from the design next time
    this.store.writeJson(this.path, data);
    return rec;
  }

  // Rows from the older `studio memory import-results` (memory/creators/*):
  // { designId, platform, postedAt, metrics } with platform-specific keys.
  importLegacy(results = []) {
    const rows = results
      .filter((r) => ['x', 'instagram', 'facebook'].includes(r.platform))
      .map((r, i) => ({ platform: r.platform, postId: r.postId ?? `legacy-${r.designId}-${i}`, postedAt: r.postedAt, designId: r.designId, metrics: r.metrics, source: 'legacy' }));
    return rows.length ? this.upsert(rows, { source: 'legacy' }) : { added: 0, updated: 0, total: this.all().length };
  }
}

export class AnalysisRuns {
  constructor(store, accountId = 'default') {
    this.store = store;
    this.account = accountSlug(accountId);
  }

  save(report) {
    const id = report.runId ?? randomId('run_', 12);
    const at = report.createdAt ?? now();
    const path = `algorithm/runs/${this.account}/${at.slice(0, 7)}/${id}.json`;
    this.store.writeJson(path, { ...report, runId: id, createdAt: at });
    return { runId: id, path };
  }

  list({ limit = 50 } = {}) {
    return this.store
      .list(`algorithm/runs/${this.account}/`)
      .slice(-limit)
      .map((p) => this.store.readJson(p))
      .filter(Boolean)
      .map((r) => ({ runId: r.runId, createdAt: r.createdAt, contentKey: r.features?.key, type: r.features?.type, scores: Object.fromEntries(Object.entries(r.platforms ?? {}).map(([p, x]) => [p, x.overall?.score])), designId: r.features?.meta?.designId ?? null }));
  }

  get(runId) {
    const p = this.store.list(`algorithm/runs/${this.account}/`).find((x) => x.endsWith(`/${runId}.json`));
    return p ? this.store.readJson(p) : null;
  }
}
