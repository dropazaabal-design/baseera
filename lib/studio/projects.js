import { now, randomId } from './util.js';

// Project memory: the brief, decisions, approved copy, assets, notes and
// the designs (with their versions) of one piece of work, so resuming it
// restores everything instead of asking the creator to explain again.

const PROJECT = (id) => `projects/${id}.json`;

export class Projects {
  constructor(store) {
    this.store = store;
  }

  create({ name, brief = '', creatorId = 'default', brandId = null }) {
    const id = randomId('p_', 10);
    const project = { id, name: name ?? brief.slice(0, 60), brief, creatorId, brandId, status: 'active', createdAt: now(), updatedAt: now(), decisions: [], designs: [], copy: {}, assets: [], notes: [] };
    this.store.writeJson(PROJECT(id), project);
    return project;
  }

  get(id) {
    return this.store.readJson(PROJECT(id));
  }

  list(creatorId) {
    return this.store
      .list('projects/')
      .map((p) => this.store.readJson(p))
      .filter((p) => p && (!creatorId || p.creatorId === creatorId))
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }

  update(id, fn) {
    const project = this.get(id);
    if (!project) throw new Error(`no project ${id}`);
    const next = fn(project) ?? project;
    next.updatedAt = now();
    this.store.writeJson(PROJECT(id), next);
    return next;
  }

  decide(id, text) {
    return this.update(id, (p) => void p.decisions.push({ at: now(), text }));
  }

  note(id, text, { designId, elementIds } = {}) {
    return this.update(id, (p) => void p.notes.push({ at: now(), text, ...(designId && { designId }), ...(elementIds?.length && { elementIds }) }));
  }

  linkDesign(id, designId, revision, role = 'main') {
    return this.update(id, (p) => {
      p.designs = [...p.designs.filter((d) => d.designId !== designId), { designId, revision, role, at: now() }];
    });
  }

  setCopy(id, copy) {
    return this.update(id, (p) => {
      p.copy = { ...p.copy, ...copy };
    });
  }

  addAssets(id, assetIds) {
    return this.update(id, (p) => {
      p.assets = [...new Set([...p.assets, ...assetIds])];
    });
  }

  // Everything needed to continue: designs at their linked revision, assets
  // checked for integrity (a missing file is reported, not hidden), notes,
  // decisions and the memory summary for this project's scope.
  resume(id, { library, assets, memory } = {}) {
    const project = this.get(id);
    if (!project) throw new Error(`no project ${id}`);
    const designs = project.designs.map((d) => ({ ...d, doc: library?.get(d.designId, d.revision) ?? null, meta: library?.meta(d.designId) ?? null }));
    const assetChecks = project.assets.map((assetId) => {
      const v = assets ? assets.verify(assetId) : { ok: null };
      return { assetId, ok: v.ok, ...(v.ok === false && { problem: v.reason }) };
    });
    const mem = memory ? memory.resolve(project.creatorId, { brandId: project.brandId ?? undefined, projectId: project.id }) : null;
    return {
      project,
      designs,
      assets: assetChecks,
      problems: [...designs.filter((d) => !d.doc).map((d) => `التصميم ${d.designId} (النسخة ${d.revision}) غير موجود`), ...assetChecks.filter((a) => a.ok === false).map((a) => `الأصل ${a.assetId}: ${a.problem}`)],
      memory: mem?.summary ?? '',
    };
  }
}
