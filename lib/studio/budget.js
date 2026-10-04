import { hashOf, now } from './util.js';

// Cost control: caches keyed by everything a result depends on, and a ledger
// of every call. Five caches, because they go stale for different reasons:
//   text    copy written for a request (request, creator memory revision,
//           brand version, copywriter version)
//   asset   an illustration for a spec (subject, style, brand colours,
//           generator); entries point at content-hashed assets and are
//           re-verified on every hit
//   layout  composed pages (composition version, content, format, fonts,
//           measurer version)
//   export  rendered files (document fingerprint, format, renderer version)
//   semantic  an AI judgement of a content's meaning (content key, analyzer,
//           semantic version) for lib/algorithm-intelligence
// Only entries stored with status "ok" are ever returned; failed or
// temporary results are kept for diagnosis but count as a miss.

// Bump layout when the engine draws the same input differently (cached
// layouts and style QA reviews are keyed on it). 2: style layer (cards,
// tiles, centred lists, style margins). 3: balanced titles (no lone last
// word).
export const VERSIONS = { copy: 1, layout: 3, measure: 1, renderer: 1 };
export const CACHE_KINDS = ['text', 'asset', 'layout', 'export', 'semantic'];

export class Cache {
  constructor(store, ledger) {
    this.store = store;
    this.ledger = ledger;
  }

  key(kind, inputs, deps = {}) {
    if (!CACHE_KINDS.includes(kind)) throw new Error(`unknown cache kind ${kind}`);
    return `${kind}_${hashOf({ inputs, deps }).slice(0, 40)}`;
  }

  path(kind, key) {
    return `cache/${kind}/${key}.json`;
  }

  // validate(entry) → true | false: e.g. "is the asset still intact?". An
  // entry that fails validation is dropped and reported as a miss.
  get(kind, key, { validate } = {}) {
    const entry = this.store.readJson(this.path(kind, key));
    let hit = Boolean(entry && entry.status === 'ok');
    let reason = entry ? (hit ? null : `status ${entry.status}`) : 'absent';
    if (hit && validate && !validate(entry.value, entry)) {
      this.store.remove(this.path(kind, key));
      hit = false;
      reason = 'invalidated (dependency changed or missing)';
    }
    this.ledger?.record({ kind: `cache.${kind}`, cache: hit ? 'hit' : 'miss', note: reason ?? '' });
    return hit ? entry.value : null;
  }

  set(kind, key, value, { status = 'ok', deps = {}, note = '' } = {}) {
    if (!['ok', 'failed', 'temporary'].includes(status)) throw new Error(`bad cache status ${status}`);
    this.store.writeJson(this.path(kind, key), { key, kind, status, deps, note, at: now(), value });
  }

  invalidate(kind, predicate = () => true) {
    let removed = 0;
    for (const p of this.store.list(`cache/${kind}/`)) {
      const entry = this.store.readJson(p);
      if (predicate(entry)) {
        this.store.remove(p);
        removed++;
      }
    }
    return removed;
  }
}

// Append-only call log. Token counts and costs are recorded only when the
// provider reports them; otherwise they stay null and reports say
// "not available" instead of estimating.
export const AI_KINDS = ['ai.copy', 'ai.concept', 'ai.asset', 'ai.rewrite', 'ai.critique', 'ai.ocr', 'ai.semantic'];

export class Ledger {
  constructor(store, path = 'ledger.jsonl') {
    this.store = store;
    this.file = path;
  }

  record({ kind, tool = null, cache = null, durationMs = null, tokens = null, costUsd = null, designId = null, note = '', session = null }) {
    const row = { at: now(), kind, tool, cache, durationMs, tokens, costUsd, designId, note, session };
    this.store.appendLine(this.file, JSON.stringify(row));
    return row;
  }

  // Times a function and records it.
  time(kind, fn, extra = {}) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      return fn();
    } finally {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.record({ kind, durationMs: Math.round(t1 - t0), ...extra });
    }
  }

  rows({ since, session } = {}) {
    return this.store
      .readLines(this.file)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((r) => r && (!since || r.at >= since) && (!session || r.session === session));
  }

  report(filter) {
    const rows = this.rows(filter);
    const byKind = {};
    for (const r of rows) {
      const k = (byKind[r.kind] ??= { calls: 0, hits: 0, misses: 0, durationMs: 0, tokens: null, costUsd: null });
      k.calls++;
      if (r.cache === 'hit') k.hits++;
      if (r.cache === 'miss') k.misses++;
      if (typeof r.durationMs === 'number') k.durationMs += r.durationMs;
      if (typeof r.tokens === 'number') k.tokens = (k.tokens ?? 0) + r.tokens;
      if (typeof r.costUsd === 'number') k.costUsd = (k.costUsd ?? 0) + r.costUsd;
    }
    const ai = rows.filter((r) => AI_KINDS.includes(r.kind));
    const cacheRows = rows.filter((r) => r.kind.startsWith('cache.'));
    const tokens = ai.filter((r) => typeof r.tokens === 'number');
    const cost = ai.filter((r) => typeof r.costUsd === 'number');
    return {
      rows: rows.length,
      aiCalls: ai.length,
      aiByKind: Object.fromEntries(AI_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length]).filter(([, n]) => n)),
      cache: { hits: cacheRows.filter((r) => r.cache === 'hit').length, misses: cacheRows.filter((r) => r.cache === 'miss').length },
      tokens: tokens.length ? tokens.reduce((s, r) => s + r.tokens, 0) : 'غير متاح',
      tokensCoverage: `${tokens.length}/${ai.length}`,
      costUsd: cost.length ? Math.round(cost.reduce((s, r) => s + r.costUsd, 0) * 10000) / 10000 : 'غير متاح',
      byKind,
    };
  }
}
