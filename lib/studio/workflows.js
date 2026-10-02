import { COMPOSITIONS, compositionOf, validateContent } from './compositions.js';
import { FORMATS } from './contracts.js';
import { clone, isObject, now, randomId } from './util.js';

// Reusable workflows: the steps that worked for a creator ("comparison post
// for كتاب وبس", "seven-slide carousel"), saved with their inputs, layout,
// identity, reference designs, checks and outputs. Running one fills the
// layout with new inputs only: content from the design it was made from is
// never copied, and AI is called only for the steps that need it (copy the
// user did not provide, missing artwork).
// Workflow files must never hold credentials; saving rejects anything that
// looks like a token, key or password.

const FILE = (id, v) => `workflows/${id}/v${v}.json`;
const HEAD = (id) => `workflows/${id}/head.json`;

const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/;
const SECRET_KEY = /^(token|access_?token|refresh_?token|secret|client_?secret|password|passwd|api_?key|apikey|authorization|cookie|session_?id)$/i;

export function findSecrets(value, path = '') {
  const out = [];
  if (typeof value === 'string') {
    if (SECRET_VALUE.test(value)) out.push(path || '(value)');
  } else if (Array.isArray(value)) value.forEach((v, i) => out.push(...findSecrets(v, `${path}[${i}]`)));
  else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k) && v !== null && v !== '') out.push(`${path ? `${path}.` : ''}${k}`);
      out.push(...findSecrets(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

const PLACEHOLDER = /^\{\{\s*([a-zA-Z][\w]*)\s*\}\}$/;

export function validateWorkflow(wf) {
  const out = [];
  if (!wf?.name) out.push('name: required');
  if (!Array.isArray(wf?.inputs)) out.push('inputs: must be a list');
  if (!Array.isArray(wf?.pages) || !wf.pages.length) out.push('pages: need at least one page');
  if (wf?.format && !FORMATS[wf.format]) out.push(`format: unknown ${wf.format}`);
  const keys = new Set((wf?.inputs ?? []).map((i) => i.key));
  (wf?.pages ?? []).forEach((p, i) => {
    if (!COMPOSITIONS[p.composition]) out.push(`pages[${i}].composition: unknown "${p.composition}"`);
    for (const [field, v] of Object.entries(p.content ?? {})) {
      const m = typeof v === 'string' && PLACEHOLDER.exec(v);
      if (m && !keys.has(m[1])) out.push(`pages[${i}].content.${field}: placeholder {{${m[1]}}} has no input`);
    }
  });
  const secrets = findSecrets(wf);
  if (secrets.length) out.push(`credentials are not allowed in a workflow (found at ${secrets.join(', ')})`);
  return out;
}

export class Workflows {
  constructor(store) {
    this.store = store;
  }

  save(wf) {
    const problems = validateWorkflow(wf);
    if (problems.length) throw new Error(`invalid workflow: ${problems.join('; ')}`);
    const id = wf.id ?? randomId('wf_', 10);
    const head = this.store.readJson(HEAD(id));
    const version = (head?.version ?? 0) + 1;
    const record = { ...clone(wf), id, version, createdAt: head?.createdAt ?? now(), updatedAt: now() };
    this.store.writeJson(FILE(id, version), record);
    this.store.writeJson(HEAD(id), { id, version, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt });
    return record;
  }

  get(id, version) {
    const head = this.store.readJson(HEAD(id));
    if (!head) return null;
    return this.store.readJson(FILE(id, version ?? head.version));
  }

  list() {
    return this.store
      .list('workflows/')
      .filter((p) => p.endsWith('/head.json'))
      .map((p) => this.store.readJson(p));
  }

  // Fills the workflow with inputs. Returns the createDesign spec, or the
  // missing inputs. Literal values in the workflow are the creator's fixed
  // phrases (e.g. a recurring CTA); everything else comes from `inputs`.
  run(id, inputs, { version } = {}) {
    const wf = typeof id === 'string' ? this.get(id, version) : id;
    if (!wf) throw new Error(`no workflow ${id}`);
    const missing = wf.inputs.filter((i) => i.required && (inputs[i.key] === undefined || inputs[i.key] === '' || (Array.isArray(inputs[i.key]) && !inputs[i.key].length))).map((i) => i.key);
    if (missing.length) return { ok: false, missing, workflow: wf };
    const fill = (v) => {
      if (typeof v === 'string') {
        const m = PLACEHOLDER.exec(v);
        if (m) return clone(inputs[m[1]]);
        return v.replace(/\{\{\s*([a-zA-Z]\w*)\s*\}\}/g, (_, k) => String(inputs[k] ?? ''));
      }
      if (Array.isArray(v)) return v.map(fill);
      return v;
    };
    const pages = wf.pages.map((p) => {
      const content = Object.fromEntries(
        Object.entries(p.content ?? {})
          .map(([k, v]) => [k, fill(v)])
          .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)),
      );
      return { composition: p.composition, variant: p.variant, content };
    });
    const problems = pages.flatMap((p, i) => validateContent(p.composition, p.content, `pages[${i}].content`));
    if (problems.length) return { ok: false, problems, workflow: wf };
    // Artwork the layout needs for the new content (new items, new topic):
    // reuse from the library when it carries the meaning, otherwise generate.
    const assetSlots = pages.flatMap((p, i) => {
      const slots = [];
      if (p.variant === 'illustrated') (p.content.items ?? p.content.points ?? []).forEach((text, k) => slots.push({ page: i, slot: `itemArt.${k}`, text }));
      if ((p.variant === 'art' || p.composition === 'collage') && !p.content.art) slots.push({ page: i, slot: 'art', text: p.content.title ?? p.content.hook ?? '' });
      return slots;
    });
    return {
      ok: true,
      workflow: { id: wf.id, version: wf.version, name: wf.name },
      spec: {
        brief: fill(wf.brief ?? '') || wf.name,
        intent: { mode: pages.length > 1 ? 'carousel' : 'post', format: wf.format ?? 'portrait', platform: wf.platform ?? 'instagram', pages: pages.length, destination: wf.destination ?? 'local' },
        ...(wf.brandId && { brandId: wf.brandId }),
        ...(wf.paletteId && { paletteId: wf.paletteId }),
        ...(wf.chrome && { chrome: clone(wf.chrome) }),
        pages,
      },
      assets: wf.assets ?? { policy: 'reuse-first' },
      assetSlots,
      checks: wf.checks ?? ['quality'],
      outputs: wf.outputs ?? ['html'],
      referenceDesigns: wf.referenceDesigns ?? [],
    };
  }

  // Turns a successful design into a workflow: its pages' compositions and
  // variants become the layout, every content field becomes an input.
  fromDesign(doc, { name, description = '', fixed = {} } = {}) {
    const inputs = [];
    const pages = doc.pages.map((p, i) => {
      const comp = compositionOf(p.composition.id);
      const content = {};
      for (const field of comp.fields) {
        if (field.type === 'asset' || field.type === 'assets') continue;
        if (p.content[field.key] === undefined) continue;
        const key = doc.pages.length > 1 ? `p${i + 1}_${field.key}` : field.key;
        if (fixed[key] !== undefined) {
          content[field.key] = fixed[key];
          continue;
        }
        inputs.push({ key, label: doc.pages.length > 1 ? `الصفحة ${i + 1}: ${field.label}` : field.label, type: field.type === 'list' ? 'list' : field.type === 'number' ? 'number' : 'text', required: Boolean(field.required) });
        content[field.key] = `{{${key}}}`;
      }
      return { composition: p.composition.id, variant: p.composition.variant, content };
    });
    return {
      name: name ?? `سير عمل من ${doc.id}`,
      description,
      creatorId: doc.creatorId,
      ...(doc.brandId && { brandId: doc.brandId }),
      paletteId: doc.theme.paletteId,
      format: doc.intent.format,
      platform: doc.intent.platform,
      chrome: doc.chrome,
      inputs,
      pages,
      assets: { policy: 'reuse-first' },
      checks: ['quality', 'pages.count', 'size'],
      outputs: ['html', 'zip'],
      referenceDesigns: [doc.id],
    };
  }
}
