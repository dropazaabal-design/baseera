import { compositionOf, contentTexts } from './compositions.js';
import { conceptFit, extractConcepts } from './concepts.js';
import { DESIGN_STATUSES, validateDocument } from './contracts.js';
import { composeAll } from './document.js';
import { plainText } from './measure.js';
import { clone, now, randomId } from './util.js';

// Design library: every saved design is a full DesignDocument (elements,
// layers, content, theme, asset ids) plus metadata to search and learn from.
//
// Status is about taste, not about success: saving after a passed quality
// gate makes a design a "candidate"; delivering it marks it "used"; only the
// user's explicit approval makes it "approved". A rejection is stored with
// its context (topic concepts, brand, platform) and only excludes the design
// in that context: "this style does not suit this topic" never deletes the
// style everywhere. Every change is a new version; old versions stay.

const META = (id) => `library/designs/${id}/meta.json`;
const VERSION = (id, rev) => `library/designs/${id}/v${rev}.json`;
const INDEX = 'library/index.json';

function densityOf(doc) {
  let maxItems = 0;
  let maxChars = 0;
  let total = 0;
  let count = 0;
  for (const page of doc.pages) {
    const texts = contentTexts(page.composition.id, page.content).filter((t) => !t.implicit);
    const items = texts.filter((t) => t.slot.includes('.')).length;
    maxItems = Math.max(maxItems, items);
    for (const t of texts) {
      const n = plainText(t.text).length;
      maxChars = Math.max(maxChars, n);
      total += n;
      count++;
    }
  }
  return { maxItems, maxChars, avgChars: count ? Math.round(total / count) : 0 };
}

function summarize(doc, extra = {}) {
  const texts = doc.pages.flatMap((p) => contentTexts(p.composition.id, p.content).map((t) => t.text)).join(' ');
  return {
    id: doc.id,
    title: extra.title ?? plainText(doc.pages[0] && (doc.pages[0].content.title ?? doc.pages[0].content.hook ?? doc.pages[0].content.quote ?? '')).slice(0, 80),
    format: doc.intent.format,
    platform: doc.intent.platform,
    mode: doc.intent.mode,
    pageCount: doc.pages.length,
    compositions: doc.pages.map((p) => ({ id: p.composition.id, variant: p.composition.variant ?? null })),
    types: [...new Set(doc.pages.map((p) => compositionOf(p.composition.id).type))],
    fonts: doc.theme.fonts,
    colors: doc.theme.colors,
    paletteId: doc.theme.paletteId,
    brandId: doc.brandId ?? null,
    creatorId: doc.creatorId,
    projectId: doc.projectId ?? null,
    assets: [...new Set(doc.pages.flatMap((p) => p.elements.filter((e) => e.kind === 'image').map((e) => e.assetId)))],
    density: densityOf(doc),
    concepts: extra.concepts ?? extractConcepts(`${doc.brief} ${texts}`),
    metaphor: extra.metaphor ?? null,
    goal: extra.goal ?? null,
    topic: extra.topic ?? doc.brief,
  };
}

export class Library {
  constructor(store) {
    this.store = store;
  }

  index() {
    return this.store.readJson(INDEX) ?? { designs: {} };
  }

  meta(id) {
    return this.store.readJson(META(id));
  }

  // Saves a document as a new version. `quality` is the quality gate result:
  // a design that failed it is kept as history but never offered for reuse.
  save(doc, { status, label = '', quality, concepts, metaphor, goal, topic, title } = {}) {
    const problems = validateDocument(doc);
    if (problems.length) throw new Error(`cannot save an invalid design: ${problems.slice(0, 3).map((p) => `${p.path} ${p.message}`).join('; ')}`);
    const existing = this.meta(doc.id);
    const revision = existing ? Math.max(...existing.versions.map((v) => v.revision)) + 1 : 1;
    const stored = { ...clone(doc), revision, assets: Object.fromEntries(Object.entries(doc.assets ?? {}).map(([id, a]) => [id, (({ dataUrl, ...rest }) => rest)(a)])) };
    this.store.writeJson(VERSION(doc.id, revision), stored);
    const at = now();
    const summary = summarize(doc, { concepts, metaphor, goal, topic, title });
    const meta = {
      ...(existing ?? { createdAt: at, status: 'candidate', contexts: [], feedback: [], usage: [], lineage: { parent: doc.parent ?? null, children: [] } }),
      ...summary,
      ...(existing?.concepts && !concepts ? { concepts: existing.concepts } : {}),
      ...(existing?.metaphor && !metaphor ? { metaphor: existing.metaphor } : {}),
      updatedAt: at,
      current: revision,
      versions: [...(existing?.versions ?? []), { revision, at, label, quality: quality ? { passed: quality.passed, errors: quality.errors, warnings: quality.warnings } : null }],
      quality: quality ? { passed: quality.passed, errors: quality.errors, warnings: quality.warnings, at } : existing?.quality ?? null,
    };
    if (status) {
      if (!DESIGN_STATUSES.includes(status)) throw new Error(`unknown status ${status}`);
      if (status === 'approved') throw new Error('approval comes from the user: use approve() with their words as evidence');
      meta.status = status;
    }
    this.store.writeJson(META(doc.id), meta);
    if (doc.parent?.id && this.meta(doc.parent.id)) {
      const parent = this.meta(doc.parent.id);
      parent.lineage.children = [...new Set([...(parent.lineage.children ?? []), doc.id])];
      this.store.writeJson(META(doc.parent.id), parent);
    }
    this.reindex(meta);
    return { meta, revision };
  }

  reindex(meta) {
    const index = this.index();
    index.designs[meta.id] = {
      id: meta.id,
      title: meta.title,
      format: meta.format,
      platform: meta.platform,
      mode: meta.mode,
      pageCount: meta.pageCount,
      types: meta.types,
      compositions: meta.compositions,
      brandId: meta.brandId,
      creatorId: meta.creatorId,
      density: meta.density,
      concepts: meta.concepts,
      metaphor: meta.metaphor,
      status: meta.status,
      contexts: meta.contexts,
      quality: meta.quality,
      fonts: meta.fonts,
      paletteId: meta.paletteId,
      assets: meta.assets,
      lastUsed: meta.usage.at(-1)?.at ?? null,
      uses: meta.usage.length,
      likes: meta.feedback.filter((f) => f.verdict === 'like' || f.verdict === 'approved').length,
      dislikes: meta.feedback.filter((f) => f.verdict === 'dislike').length,
    };
    this.store.writeJson(INDEX, index);
  }

  get(id, revision) {
    const meta = this.meta(id);
    if (!meta) return null;
    return this.store.readJson(VERSION(id, revision ?? meta.current));
  }

  list() {
    return Object.values(this.index().designs);
  }

  // Restores an old version as a new one; nothing is overwritten.
  revert(id, revision) {
    const old = this.get(id, revision);
    if (!old) throw new Error(`no version ${revision} of ${id}`);
    return this.save(old, { label: `استعادة النسخة ${revision}` });
  }

  // Status within a context. `scope` narrows it: { concepts: [...] },
  // { brandId }, { platform }. Without scope, it is the design's default.
  setStatus(id, status, { scope, reason = '', evidence } = {}) {
    if (!DESIGN_STATUSES.includes(status)) throw new Error(`unknown status ${status}`);
    const meta = this.meta(id);
    if (!meta) throw new Error(`no design ${id}`);
    if (status === 'approved' && !evidence) throw new Error('approval needs the user\'s own words as evidence; silence or a successful export is not approval');
    if (scope && Object.keys(scope).length) {
      meta.contexts = [...meta.contexts.filter((c) => JSON.stringify(c.scope) !== JSON.stringify(scope)), { status, scope, reason, evidence: evidence ?? null, at: now() }];
    } else {
      meta.status = status;
    }
    this.store.writeJson(META(id), meta);
    this.reindex(meta);
    return meta;
  }

  approve(id, evidence, scope) {
    return this.setStatus(id, 'approved', { evidence, scope });
  }

  markUsed(id, { action = 'delivered', projectId } = {}) {
    const meta = this.meta(id);
    if (!meta) throw new Error(`no design ${id}`);
    meta.usage.push({ at: now(), action, ...(projectId && { projectId }) });
    if (meta.status === 'candidate') meta.status = 'used';
    this.store.writeJson(META(id), meta);
    this.reindex(meta);
    return meta;
  }

  // Feedback tied to elements and aspects, e.g. { verdict: 'like',
  // aspects: ['graphics'] } + { verdict: 'dislike', aspects: ['text.size'] }.
  addFeedback(id, { verdict, aspects = [], elementIds = [], text = '', scope } = {}) {
    const meta = this.meta(id);
    if (!meta) throw new Error(`no design ${id}`);
    meta.feedback.push({ at: now(), verdict, aspects, elementIds, text, ...(scope && { scope }), revision: meta.current });
    this.store.writeJson(META(id), meta);
    this.reindex(meta);
    return meta;
  }

  // ------------------------------------------------------------------------
  // Search: hard filters first (format, mode, brand, quality, rejection in
  // this context, capacity), then a transparent score.
  search(query = {}) {
    const q = {
      concepts: query.concepts ?? extractConcepts(query.text ?? ''),
      ...query,
    };
    const all = this.list();
    const recent = all
      .filter((d) => d.lastUsed)
      .sort((a, b) => (b.lastUsed > a.lastUsed ? 1 : -1))
      .slice(0, 5)
      .map((d) => d.id);
    const results = [];
    for (const d of all) {
      const why = [];
      if (q.exclude?.includes(d.id)) continue;
      if (q.format && d.format !== q.format) continue;
      if (q.mode && d.mode !== q.mode) continue;
      if (q.brandId && d.brandId && d.brandId !== q.brandId) continue;
      if (q.creatorId && d.creatorId !== q.creatorId) continue;
      if (!d.quality?.passed) continue;
      if (d.status === 'rejected') continue;
      const rejectedHere = d.contexts.find((c) => c.status === 'rejected' && contextMatches(c.scope, q));
      if (rejectedHere) continue;
      if (q.items && d.compositions.some((c) => ['list', 'post'].includes(c.id))) {
        const cap = Math.max(...d.compositions.map((c) => compositionOf(c.id).capacity?.items ?? 0));
        if (cap && q.items > cap) continue;
      }
      if (q.pages && d.pageCount !== q.pages && d.mode === 'carousel') {
        // A carousel of another length can still lend its pages, scored lower.
        why.push('عدد صفحات مختلف');
      }

      const concept = conceptFit(q.concepts, [...d.concepts, ...(d.metaphor ? extractConcepts(d.metaphor) : [])]);
      const quality = Math.max(0, 1 - (d.quality?.warnings ?? 0) * 0.15);
      const pref = preferenceFit(d, q.preferences);
      const capacity = capacityFit(d, q);
      const approvedHere = d.status === 'approved' || d.contexts.some((c) => c.status === 'approved' && contextMatches(c.scope, q));
      const feedback = Math.max(0, Math.min(1, 0.5 + (approvedHere ? 0.4 : 0) + d.likes * 0.1 - d.dislikes * 0.2));
      const freshness = recent.includes(d.id) ? 0.3 : 1;
      const score = 0.35 * concept + 0.15 * quality + 0.15 * pref + 0.15 * capacity + 0.1 * feedback + 0.1 * freshness - (q.pages && d.pageCount !== q.pages ? 0.08 : 0);
      if (concept >= 0.5) why.push('الاستعارة البصرية تناسب الموضوع');
      else if (concept === 0) why.push('الموضوع مختلف');
      if (approvedHere) why.push('اعتمدته سابقًا');
      if (recent.includes(d.id)) why.push('استُخدم مؤخرًا (تنويع)');
      if (capacity < 0.5) why.push('كثافة المحتوى مختلفة');
      results.push({ id: d.id, title: d.title, score: Math.round(score * 1000) / 1000, parts: { concept, quality, pref, capacity, feedback, freshness }, why, design: d });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, q.limit ?? 5);
  }

  // Compact view of the best candidates for the assistant's creative
  // judgement: never the whole library.
  brief(results) {
    return results.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      score: r.score,
      compositions: r.design.compositions.map((c) => `${c.id}/${c.variant ?? ''}`).join(' '),
      concepts: r.design.concepts.join(','),
      metaphor: r.design.metaphor,
      why: r.why.join('، '),
    }));
  }

  // A new design from an approved one: same identity and content structure,
  // a different layout variant or palette role, linked as its child.
  remix(id, { content, variantShift = 1, measure } = {}) {
    const base = this.get(id);
    if (!base) throw new Error(`no design ${id}`);
    const pages = base.pages.map((p, i) => {
      const comp = compositionOf(p.composition.id);
      const variants = Object.keys(comp.variants);
      const next = variants[(variants.indexOf(p.composition.variant) + variantShift + variants.length) % variants.length];
      return { ...p, id: p.id, composition: { ...p.composition, variant: next, lockVariant: false }, content: content?.[i] ?? p.content, overrides: {} };
    });
    const doc = { ...clone(base), id: randomId('d_', 12), revision: 1, createdAt: now(), updatedAt: now(), parent: { id: base.id, revision: base.revision, relation: 'remix' }, pages };
    return composeAll(doc, { measure });
  }
}

function contextMatches(scope, q) {
  if (scope.brandId && scope.brandId !== q.brandId) return false;
  if (scope.platform && scope.platform !== q.platform) return false;
  if (scope.concepts?.length) return conceptFit(scope.concepts, q.concepts ?? []) >= 0.5;
  return true;
}

function preferenceFit(d, prefs = {}) {
  let score = 0.5;
  if (prefs.font) score += d.fonts?.heading === prefs.font ? 0.25 : -0.1;
  if (prefs.paletteId) score += d.paletteId === prefs.paletteId ? 0.25 : -0.05;
  if (prefs.density === 'short') score += d.density.avgChars <= 40 ? 0.15 : -0.15;
  if (prefs.density === 'dense') score += d.density.avgChars > 40 ? 0.15 : -0.1;
  return Math.max(0, Math.min(1, score));
}

function capacityFit(d, q) {
  if (!q.items && !q.chars) return 0.6;
  let s = 1;
  if (q.items) s -= Math.min(0.6, Math.abs((d.density.maxItems || 0) - q.items) * 0.15);
  if (q.chars) s -= Math.min(0.4, Math.abs((d.density.avgChars || 0) - q.chars) / 100);
  return Math.max(0, s);
}
