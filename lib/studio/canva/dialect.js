import { hashOf } from '../util.js';

// Canva connectors differ by host. Claude's connector edits through one
// tool, edit-design (operations on locator_id, finalize keep_open / commit /
// cancel), and reads through one tool, read-design (filtered fields, opens
// the transaction). Other connectors expose separate transaction tools
// (start, perform operations, commit, cancel) on element_id, and separate
// readers for content, pages and thumbnails. Tool names may carry an MCP or
// app prefix and use "_" for "-".
//
// A dialect is read from the schemas the session lists: which real tool
// plays each role, and which field carries each value, from the schemas
// themselves. Plans are written in Claude's terms (the canonical form) and
// translated here into calls for the session's connector. Nothing is
// guessed: a role, operation or field the schemas do not show comes back
// as an issue, never as a call.

export function normalizeToolName(name) {
  const last = String(name ?? '').split('__').pop();
  return last.replace(/^canva[._-]/i, '').replace(/_/g, '-').toLowerCase();
}

const schemaOf = (t) => t?.inputSchema ?? t?.input_schema ?? t?.parameters ?? null;
const metaOf = (t) => t?._meta ?? t?.meta ?? null;
const propsOf = (s) => s?.properties ?? {};
const firstKey = (props, keys) => keys.find((k) => k in props) ?? null;
const variantsOf = (prop) => {
  const items = prop?.items;
  if (!items) return null;
  return items.anyOf ?? items.oneOf ?? (items.properties?.type ? [items] : null);
};
const opType = (v) => v?.properties?.type?.const ?? (v?.properties?.type?.enum?.length === 1 ? v.properties.type.enum[0] : null);

const REF_KEYS = ['locator_id', 'element_id', 'elementId', 'locatorId'];
const REFS_KEYS = ['locator_ids', 'element_ids', 'elementIds', 'locatorIds'];
const PAGE_ID_KEYS = ['page_id', 'pageId'];
const TX_KEYS = ['transaction_id', 'transactionId', 'editing_transaction_id'];
const PAGE_INDEX_KEYS = ['page_index', 'page_number', 'pageIndex', 'pageNumber'];
const DESIGN_KEYS = ['design_id', 'designId'];

// What Claude's connector looked like when read live (2026-10-02), for
// compact facts saved without full schemas. Field names per operation are
// passed through unchanged: plans are already written in these terms.
const CLAUDE_TOOLS = {
  edit: 'edit-design',
  read: 'read-design',
  upload: 'create-upload-url',
  uploadFromUrl: 'upload-asset-from-url',
  import: 'import-design-from-url',
  resize: 'resize-design',
  copy: 'copy-design',
  create: 'create-design',
  export: 'export-design',
  exportFormats: 'get-export-formats',
  merge: 'merge-designs',
};

function role(tools, re, { needs } = {}) {
  return tools.find((t) => re.test(t.name) && (!needs || needs(t))) ?? null;
}

function editRole(tools) {
  const known = new Set(['add_text', 'format_text', 'replace_text', 'find_and_replace_text', 'delete_element', 'position_element', 'resize_element', 'insert_fill', 'update_fill', 'insert_shape', 'add_page', 'update_title']);
  const candidates = tools
    .map((t) => ({ t, variants: variantsOf(propsOf(schemaOf(t)).operations) }))
    .filter((c) => c.variants?.length)
    .map((c) => ({ ...c, score: c.variants.map(opType).filter((o) => known.has(o)).length }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best) {
    const p = propsOf(schemaOf(best.t));
    const fin = p.finalize?.enum ?? null;
    const ops = {};
    for (const v of best.variants) {
      const type = opType(v);
      if (!type) continue;
      const vp = propsOf(v);
      ops[type] = {
        ref: firstKey(vp, REF_KEYS),
        refs: firstKey(vp, REFS_KEYS),
        page: firstKey(vp, PAGE_ID_KEYS),
        fields: Object.keys(vp).filter((k) => k !== 'type'),
        required: (v.required ?? []).filter((k) => k !== 'type'),
        nested: Object.fromEntries(Object.entries(vp).filter(([, s]) => s?.type === 'object' && s.properties).map(([k, s]) => [k, Object.keys(s.properties)])),
        enums: Object.fromEntries(Object.entries(vp).filter(([, s]) => Array.isArray(s?.enum)).map(([k, s]) => [k, s.enum])),
      };
    }
    return {
      tool: best.t.raw,
      name: best.t.name,
      source: 'schema',
      transaction: firstKey(p, TX_KEYS),
      page: firstKey(p, PAGE_INDEX_KEYS),
      finalize: fin?.includes('commit') ? { field: 'finalize', keep: fin.includes('keep_open') ? 'keep_open' : null, commit: 'commit', cancel: fin.includes('cancel') ? 'cancel' : null } : null,
      ops,
    };
  }
  // Names only: the tool is there, its operations are not known.
  const named = role(tools, /^edit-design$|perform-editing-operations|^edit-design-content$/);
  return named ? { tool: named.raw, name: named.name, source: 'name', transaction: null, page: null, finalize: null, ops: null } : null;
}

// File field of an import tool: how a local file reaches it.
function fileKind(name, schema, fileParams) {
  if (!schema) return fileParams.includes(name) ? 'host-file' : 'unknown';
  if (fileParams.includes(name)) return 'host-file';
  const p = schema.properties ?? {};
  if (schema.type === 'object' && ('download_url' in p || 'file_id' in p)) return 'host-file';
  if (schema.type === 'string' && (schema.contentEncoding === 'base64' || schema.format === 'byte')) return 'base64';
  if (schema.type === 'string' && schema.format === 'binary') return 'binary';
  if (schema.type === 'string' && /\bpath\b/i.test(schema.description ?? '')) return 'path';
  return 'unknown';
}

function importRole(t) {
  if (!t) return null;
  const s = schemaOf(t);
  const p = propsOf(s);
  const fileParams = [].concat(metaOf(t)?.['openai/fileParams'] ?? []);
  const fileField = ['design_file', 'file', 'document', 'source_file'].find((k) => k in p) ?? fileParams[0] ?? null;
  const urlSchema = p.url ?? null;
  const text = `${t.description ?? ''} ${urlSchema?.description ?? ''}`;
  const required = s?.required ?? [];
  const alternatives = (s?.anyOf ?? s?.oneOf ?? []).map((a) => a.required ?? []).filter((r) => r.length);
  return {
    tool: t.raw,
    name: t.name,
    source: s ? 'schema' : 'name',
    url: urlSchema
      ? {
          field: 'url',
          required: required.includes('url'),
          publicOnly: /public/i.test(text) || /\^https/.test(urlSchema.pattern ?? ''),
          excludesLocal: /local|private/i.test(text),
          excludesGenerated: /agent-generated|generated files/i.test(text),
          pattern: urlSchema.pattern ?? null,
        }
      : null,
    file: fileField ? { field: fileField, kind: fileKind(fileField, p[fileField] ?? null, fileParams), required: required.includes(fileField) } : null,
    alternatives,
    nameField: firstKey(p, ['name', 'title', 'design_title']),
    nameRequired: required.some((r) => ['name', 'title', 'design_title'].includes(r)),
    typeField: 'intended_design_type' in p ? { field: 'intended_design_type', values: p.intended_design_type.enum ?? null } : null,
    acceptsPptx: /powerpoint|pptx|slide deck/i.test(t.description ?? '') ? true : s ? null : null,
  };
}

function readRoles(tools) {
  // One reader with a fields filter (Claude), or separate readers.
  const multi = tools.find((t) => {
    const f = propsOf(schemaOf(t)).filter?.properties?.fields;
    return Array.isArray(f?.items?.enum) && f.items.enum.includes('design_content');
  });
  if (multi) {
    const p = propsOf(schemaOf(multi));
    const fields = p.filter.properties.fields.items.enum;
    const reader = { tool: multi.raw, design: firstKey(p, DESIGN_KEYS), transaction: firstKey(p, TX_KEYS) };
    return {
      style: 'filter',
      content: reader,
      pages: fields.includes('page_metadata') ? reader : null,
      thumbnails: fields.includes('thumbnails') ? reader : null,
      notes: fields.includes('presenter_notes') ? reader : null,
      open: 'open_transaction' in p ? { tool: multi.raw, flag: 'open_transaction', design: firstKey(p, DESIGN_KEYS) } : null,
    };
  }
  const named = role(tools, /^read-design$/);
  const reader = (re) => {
    const t = role(tools, re);
    if (!t) return null;
    const p = propsOf(schemaOf(t));
    return { tool: t.raw, design: firstKey(p, DESIGN_KEYS), transaction: firstKey(p, TX_KEYS), page: firstKey(p, PAGE_INDEX_KEYS), source: schemaOf(t) ? 'schema' : 'name' };
  };
  if (named && !schemaOf(named)) {
    // Names only (compact facts): Claude's reader as captured live.
    const r = { tool: named.raw, design: 'design_id', transaction: 'transaction_id', source: 'name' };
    return { style: 'filter', content: r, pages: r, thumbnails: r, notes: r, open: { tool: named.raw, flag: 'open_transaction', design: 'design_id' } };
  }
  return {
    style: 'separate',
    content: reader(/get-design-content|design-content|read-design-content/),
    pages: reader(/get-design-pages|design-pages|list-design-pages/),
    thumbnails: reader(/thumbnail/),
    notes: null,
    open: null,
  };
}

function transactionRoles(tools, edit, read) {
  const txTool = (re) => {
    const t = tools.find((x) => re.test(x.name) && x.raw !== edit?.tool && (!schemaOf(x) || firstKey(propsOf(schemaOf(x)), TX_KEYS)));
    return t ? { tool: t.raw, transaction: schemaOf(t) ? firstKey(propsOf(schemaOf(t)), TX_KEYS) : 'transaction_id', inline: false } : null;
  };
  const inline = (value) => (edit?.finalize?.[value] ? { tool: edit.tool, inline: true, field: edit.finalize.field, value: edit.finalize[value], transaction: edit.transaction } : null);
  let open = read.open;
  if (!open) {
    const t = tools.find((x) => /(start|open|begin)-(editing-)?(transaction|edit|session)/.test(x.name));
    if (t) open = { tool: t.raw, flag: null, design: schemaOf(t) ? firstKey(propsOf(schemaOf(t)), DESIGN_KEYS) : 'design_id' };
  }
  return {
    open,
    commit: inline('commit') ?? txTool(/commit|save-(editing-)?transaction/),
    cancel: inline('cancel') ?? txTool(/cancel|discard|abort|rollback/),
  };
}

// Session tool list (names, or full tool objects with input schemas) → the
// dialect. Compact facts saved by the registry without schemas give
// Claude's live-captured dialect when the tool names are Claude's.
export function detectDialect(input) {
  const list = Array.isArray(input) ? input : input?.tools ?? [];
  const tools = list
    .map((t) => (typeof t === 'string' ? { name: t } : t))
    .filter((t) => t?.name)
    .map((t) => ({ raw: t.name, name: normalizeToolName(t.name), inputSchema: schemaOf(t), _meta: metaOf(t), description: t.description ?? '' }));
  const named = (re) => role(tools, re);
  const edit = editRole(tools);
  const read = readRoles(tools);
  const tx = transactionRoles(tools, edit, read);
  const resizeTool = named(/^resize-design$/);
  const upload = named(/^create-upload-url$|upload-url$/);
  const uploadFromUrl = named(/upload-asset-from-url/);
  const d = {
    kind: 'canva-dialect',
    id: !edit ? 'none' : tx.commit?.inline ? 'edit-design' : tx.commit ? 'transaction-tools' : 'edit-only',
    edit,
    open: tx.open,
    commit: tx.commit,
    cancel: tx.cancel,
    read: { style: read.style, content: read.content, pages: read.pages, thumbnails: read.thumbnails, notes: read.notes },
    upload: upload ? { tool: upload.raw, mode: 'post-bytes', description: upload.description } : null,
    uploadFromUrl: uploadFromUrl ? { tool: uploadFromUrl.raw, mode: 'public-url' } : null,
    import: importRole(named(/import-design/)),
    resize: resizeTool ? { tool: resizeTool.raw, design: firstKey(propsOf(resizeTool.inputSchema), DESIGN_KEYS) ?? 'design_id', custom: resizeTool.inputSchema ? JSON.stringify(resizeTool.inputSchema).includes('"custom"') : null } : null,
    copy: pickTool(named(/^copy-design$|^duplicate-design$/)),
    create: pickTool(named(/^create-design$|^generate-design$/)),
    export: pickTool(named(/^export-design$/)),
    exportFormats: pickTool(named(/export-formats$/)),
    merge: pickTool(named(/^merge-designs$/)),
    tools: tools.map((t) => t.name).sort(),
  };
  d.fingerprint = hashOf({ id: d.id, edit: d.edit && { t: d.edit.name, tx: d.edit.transaction, page: d.edit.page, ops: d.edit.ops && Object.fromEntries(Object.entries(d.edit.ops).map(([k, v]) => [k, v.ref])) }, open: d.open?.flag ?? d.open?.tool ?? null, read: d.read.style, import: d.import && { url: Boolean(d.import.url), file: d.import.file?.kind ?? null } }).slice(0, 12);
  return d;
}

const pickTool = (t) => (t ? { tool: t.raw, design: firstKey(propsOf(t.inputSchema), DESIGN_KEYS) ?? 'design_id' } : null);

// Compact facts (registry storage) → dialect, without the full schemas.
export function dialectFromFacts(facts) {
  if (facts?.dialect?.kind === 'canva-dialect') return facts.dialect;
  const names = facts?.tools ?? [];
  const d = detectDialect(names);
  if (d.edit && d.edit.source === 'name' && /^edit-design$/.test(d.edit.name)) {
    // Claude's edit-design as captured live: same field names as our plans.
    d.edit = { ...d.edit, transaction: 'transaction_id', page: 'page_index', finalize: { field: 'finalize', keep: 'keep_open', commit: 'commit', cancel: 'cancel' }, ops: facts.editOps ? Object.fromEntries(facts.editOps.map((o) => [o, { passthrough: true }])) : null };
    d.commit = { tool: d.edit.tool, inline: true, field: 'finalize', value: 'commit', transaction: 'transaction_id' };
    d.cancel = { tool: d.edit.tool, inline: true, field: 'finalize', value: 'cancel', transaction: 'transaction_id' };
    d.id = 'edit-design';
  }
  if (d.import && facts.importExcludesGenerated !== null && facts.importExcludesGenerated !== undefined && d.import.source === 'name') {
    // Claude's import-design-from-url as captured live: public URL only.
    d.import = { ...d.import, url: { field: 'url', required: true, publicOnly: true, excludesLocal: true, excludesGenerated: Boolean(facts.importExcludesGenerated), pattern: null }, file: null, nameField: 'name', nameRequired: true };
  }
  return d;
}

// ---------------------------------------------------------------------------
// Translation of canonical (Claude-form) plans into the session's dialect.

export function translateOp(op, d) {
  if (!op || typeof op !== 'object') return { op };
  const v = d.edit?.ops?.[op.type];
  if (!d.edit) return { error: { code: 'no-edit-tool', message: 'لا أداة تحرير عناصر في هذه الجلسة.' } };
  if (!d.edit.ops) return { error: { code: 'ops-unknown', op: op.type, message: `مخطط عمليات ${d.edit.tool} لم يُقرأ: لا أرسل ${op.type} دون معرفة حقوله.` } };
  if (!v) return { error: { code: 'op-missing', op: op.type, message: `العملية ${op.type} ليست في مخطط ${d.edit.tool}.` } };
  if (v.passthrough) return { op };
  const out = { type: op.type };
  const dropped = [];
  for (const [k, val] of Object.entries(op)) {
    if (k === 'type') continue;
    if (k.startsWith('_')) {
      out[k] = k === '_then' ? translateOp(val, d).op ?? val : val;
      continue;
    }
    if (k === 'locator_id') {
      if (!v.ref) return { error: { code: 'no-ref-field', op: op.type, message: `${op.type} في ${d.edit.tool} بلا حقل لمعرّف العنصر.` } };
      out[v.ref] = val;
    } else if (k === 'locator_ids') {
      if (!v.refs) return { error: { code: 'no-ref-field', op: op.type, message: `${op.type} في ${d.edit.tool} بلا حقل لمعرّفات العناصر.` } };
      out[v.refs] = val;
    } else if (k === 'page_id') {
      if (v.page) out[v.page] = val;
      else dropped.push(k);
    } else if (!v.fields.includes(k)) dropped.push(k);
    else if (val && typeof val === 'object' && !Array.isArray(val) && v.nested?.[k]) {
      const allowed = v.nested[k];
      out[k] = Object.fromEntries(Object.entries(val).filter(([kk]) => allowed.includes(kk)));
      for (const kk of Object.keys(val)) if (!allowed.includes(kk)) dropped.push(`${k}.${kk}`);
    } else out[k] = val;
  }
  const missing = v.required.filter((r) => !(r in out));
  if (missing.length) return { error: { code: 'missing-required', op: op.type, fields: missing, message: `${op.type} يحتاج ${missing.join('، ')} في ${d.edit.tool}، ولا يقابله شيء في الخطة.` } };
  return { op: out, ...(dropped.length && { dropped }) };
}

const READ_FIELDS = ['design_metadata', 'page_metadata', 'design_content', 'thumbnails', 'presenter_notes'];

// One canonical step → one or more dialect steps, plus issues. Steps that
// are not tool calls (an action for the assistant) pass through.
export function translateStep(step, d) {
  const issues = [];
  if (!step?.tool) return { steps: [step], issues };
  const canonical = normalizeToolName(step.tool);
  const args = step.args ?? {};
  const keep = (tool, a, extra = {}) => ({ ...step, tool, args: a, canonical: step.canonical ?? step.tool, ...extra });
  const fail = (code, message) => {
    issues.push({ code, severity: 'error', step: step.n ?? null, tool: step.tool, message });
    return { steps: [{ ...step, blocked: code }], issues };
  };
  if (canonical === 'edit-design') {
    if (Array.isArray(args.operations) && args.operations.length) {
      if (!d.edit) return fail('no-edit-tool', 'لا أداة تحرير عناصر في هذه الجلسة.');
      const ops = [];
      for (const op of args.operations) {
        const r = translateOp(op, d);
        if (r.error) issues.push({ ...r.error, severity: 'error', step: step.n ?? null });
        else {
          ops.push(r.op);
          if (r.dropped) issues.push({ code: 'dropped-fields', severity: 'warning', op: op.type, fields: r.dropped, step: step.n ?? null, message: `${op.type}: ${r.dropped.join('، ')} لا مقابل لها في ${d.edit.tool} فلن تُرسل.` });
        }
      }
      // Operations this connector lacks are reported one by one; the rest
      // still go. A batch with nothing left is blocked, never sent empty.
      if (!ops.length) return { steps: [{ ...step, blocked: 'untranslatable' }], issues };
      if (d.edit.source !== 'schema' && !d.edit.ops?.[args.operations[0].type]?.passthrough) return fail('ops-unknown', `مخطط ${d.edit.tool} لم يُقرأ.`);
      const needsPage = args.operations.some((o) => 'page_id' in o && !d.edit.ops[o.type]?.page && !d.edit.ops[o.type]?.passthrough);
      if (needsPage && !d.edit.page) return fail('no-page-field', `${d.edit.tool} لا يحدد الصفحة لعمليات الإضافة.`);
      if (!d.edit.transaction) return fail('no-transaction-field', `${d.edit.tool} بلا حقل معاملة.`);
      const a = { [d.edit.transaction]: args.transaction_id };
      if (d.edit.page && args.page_index !== undefined) a[d.edit.page] = args.page_index;
      if (d.edit.finalize?.keep) a[d.edit.finalize.field] = d.edit.finalize.keep;
      a.operations = ops;
      return { steps: [keep(d.edit.tool, a)], issues };
    }
    if (args.finalize === 'commit' || args.finalize === 'cancel') {
      const r = args.finalize === 'commit' ? d.commit : d.cancel;
      if (!r) return fail(`no-${args.finalize}`, `لا أداة ${args.finalize === 'commit' ? 'حفظ' : 'إلغاء'} للمعاملة في هذه الجلسة.`);
      const a = r.inline ? { [r.transaction ?? 'transaction_id']: args.transaction_id, [r.field]: r.value } : { [r.transaction]: args.transaction_id };
      return { steps: [keep(r.tool, a)], issues };
    }
    return { steps: [step], issues };
  }
  if (canonical === 'read-design') {
    if (args.open_transaction) {
      if (!d.open) return fail('no-open', 'لا طريقة لفتح معاملة تحرير في هذه الجلسة.');
      if (d.open.flag) return { steps: [keep(d.open.tool, { ...rename(args, { design_id: d.open.design }), [d.open.flag]: true })], issues };
      return { steps: [keep(d.open.tool, { [d.open.design]: args.design_id }, { note: `${step.note ? `${step.note} ` : ''}رد هذه الأداة يحمل معرّف المعاملة.`.trim() })], issues };
    }
    const fields = args.filter?.fields ?? ['design_metadata', 'design_content'];
    if (d.read.style === 'filter') {
      const r = d.read.content;
      return { steps: [keep(r.tool, rename(args, { design_id: r.design, transaction_id: r.transaction }))], issues };
    }
    const out = [];
    const want = (f) => fields.includes(f);
    const call = (r, extra = {}) => {
      const a = { [r.design]: args.design_id, ...extra };
      if (args.transaction_id && r.transaction) a[r.transaction] = args.transaction_id;
      return a;
    };
    if (want('design_content') || want('design_metadata')) {
      const r = d.read.content;
      if (!r) issues.push({ code: 'no-content-reader', severity: 'error', message: 'لا أداة لقراءة محتوى التصميم.' });
      else out.push(keep(r.tool, call(r), args.transaction_id && !r.transaction ? { readsSaved: true, note: 'هذه الأداة تقرأ النسخة المحفوظة فقط: تعديلات المعاملة المفتوحة لا تظهر فيها.' } : {}));
    }
    if (want('page_metadata')) {
      const r = d.read.pages;
      if (!r) issues.push({ code: 'no-pages-reader', severity: 'warning', message: 'لا أداة لقراءة الصفحات ومقاساتها: يُعتمد على محتوى التصميم.' });
      else out.push(keep(r.tool, call(r)));
    }
    if (want('thumbnails')) {
      const r = d.read.thumbnails;
      if (!r) issues.push({ code: 'no-thumbnails', severity: 'error', message: 'لا أداة معاينة في هذه الجلسة.' });
      else {
        const pages = args.filter?.thumbnail_pages ?? args.filter?.page_indices ?? null;
        if (pages && r.page) for (const p of pages) out.push(keep(r.tool, call(r, { [r.page]: p })));
        else out.push(keep(r.tool, call(r)));
      }
    }
    if (want('presenter_notes') && !d.read.notes) issues.push({ code: 'no-notes-reader', severity: 'warning', message: 'لا أداة لقراءة ملاحظات الصفحات.' });
    return { steps: out.length ? out : [{ ...step, blocked: 'no-reader' }], issues };
  }
  if (canonical === 'create-upload-url') {
    if (d.upload) return { steps: [keep(d.upload.tool, args)], issues };
    if (d.uploadFromUrl) return fail('upload-needs-public-url', `هذه الجلسة ترفع الوسائط من رابط عام فقط (${d.uploadFromUrl.tool}): الملف المحلي لا يُرسل إلى حقل رابط.`);
    return fail('no-upload', 'لا أداة رفع وسائط في هذه الجلسة.');
  }
  const simple = { 'resize-design': 'resize', 'copy-design': 'copy', 'create-design': 'create', 'export-design': 'export', 'get-export-formats': 'exportFormats', 'merge-designs': 'merge' }[canonical];
  if (simple) {
    const r = d[simple];
    if (!r) return fail(`no-${simple}`, `لا أداة ${step.tool} في هذه الجلسة.`);
    return { steps: [keep(r.tool, rename(args, { design_id: r.design }))], issues };
  }
  return { steps: [step], issues };
}

function rename(args, map) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    const to = k in map ? map[k] : k;
    if (to) out[to] = v;
  }
  return out;
}

// A whole plan; numbering restarts so the steps stay in order.
export function translatePlan(steps, d) {
  const out = [];
  const issues = [];
  for (const s of steps) {
    const r = translateStep(s, d);
    out.push(...r.steps);
    issues.push(...r.issues);
  }
  return { steps: out.map((s, i) => (s.n !== undefined ? { ...s, n: i + 1 } : s)), issues };
}

// Short description for reports.
export function dialectSummary(d) {
  if (!d) return null;
  return {
    id: d.id,
    fingerprint: d.fingerprint,
    edit: d.edit ? { tool: d.edit.tool, elementField: d.edit.ops ? [...new Set(Object.values(d.edit.ops).map((o) => o.ref).filter(Boolean))].join(',') || (Object.values(d.edit.ops).some((o) => o.passthrough) ? 'locator_id' : null) : null, transactionField: d.edit.transaction, pageField: d.edit.page, operations: d.edit.ops ? Object.keys(d.edit.ops).length : null } : null,
    open: d.open ? (d.open.flag ? `${d.open.tool} (${d.open.flag})` : d.open.tool) : null,
    commit: d.commit ? (d.commit.inline ? `${d.commit.tool} (${d.commit.field}: ${d.commit.value})` : d.commit.tool) : null,
    cancel: d.cancel ? (d.cancel.inline ? `${d.cancel.tool} (${d.cancel.field}: ${d.cancel.value})` : d.cancel.tool) : null,
    read: { style: d.read.style, content: d.read.content?.tool ?? null, pages: d.read.pages?.tool ?? null, thumbnails: d.read.thumbnails?.tool ?? null },
    upload: d.upload?.tool ?? d.uploadFromUrl?.tool ?? null,
    import: d.import ? { tool: d.import.tool, url: Boolean(d.import.url), file: d.import.file ? `${d.import.file.field} (${d.import.file.kind})` : null } : null,
  };
}
