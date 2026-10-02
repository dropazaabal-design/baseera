import { hashOf, now } from '../util.js';
import { externalChanges, snapshotOf } from './readback.js';

// The Canva journal: the real ids and history behind every design the
// studio put in Canva, so work can resume and never duplicates.
//
//   links         our document ↔ Canva designs: which design was created,
//                 copied, resized or imported from which (a resize, copy or
//                 import is a NEW design: both ids are kept and reported)
//   builds        idempotency: a build is keyed by the document's content
//                 and route; retrying a build that already produced a
//                 design resumes it instead of creating another
//   locators      our page/element ids ↔ Canva locator ids
//   uploads       asset content hash → Canva media id (never re-upload)
//   transactions  open / committed / cancelled / expired; any still open
//                 is reported so none is left hanging
//   snapshots     element state after our last write, to notice edits made
//                 in Canva since (external changes) before writing again
//   ops           every call: tool, args digest, result, error class
//   generation    calls that generate (create-design, generate-image…)

const PATH = (docId) => `canva/journal/${docId}.json`;
const GENERATING = new Set(['create-design', 'generate-design', 'generate-design-structured', 'generate-image', 'create-design-from-candidate', 'separate-image-layers', 'autofill-design']);
// A transaction left untouched this long is treated as possibly expired.
const TX_STALE_MS = 30 * 60 * 1000;

export class CanvaJournal {
  constructor(store, docId) {
    this.store = store;
    this.docId = docId;
    this.data = store.readJson(PATH(docId)) ?? { docId, links: [], builds: {}, locators: {}, pages: {}, uploads: {}, transactions: [], snapshots: {}, ops: [] };
  }

  save() {
    this.store.writeJson(PATH(this.docId), this.data);
    return this;
  }

  // ---- builds (idempotency) -------------------------------------------
  static buildKey(doc, route, extra = {}) {
    return `b_${hashOf({ pages: doc.pages.map((p) => [p.widthPx, p.heightPx, p.elements]), theme: doc.theme, route, ...extra }).slice(0, 24)}`;
  }

  // Returns { resume: true, build } when this exact build already produced
  // a design (or is in progress): the caller resumes it.
  beginBuild(key, { route }) {
    const existing = this.data.builds[key];
    if (existing && existing.state !== 'failed' && existing.state !== 'abandoned') return { resume: true, build: existing };
    const build = { key, route, state: 'planned', designId: null, startedAt: now(), steps: {} };
    this.data.builds[key] = build;
    this.save();
    return { resume: false, build };
  }

  updateBuild(key, patch) {
    const b = this.data.builds[key];
    if (!b) throw new Error(`no build ${key}`);
    Object.assign(b, patch, { updatedAt: now() });
    return this.save();
  }

  // ---- design links -----------------------------------------------------
  link({ designId, relation, sourceDesignId = null, route, url = null, title = null }) {
    if (!/^D[A-Za-z0-9_-]{6,}$/.test(designId ?? '')) throw new Error(`not a Canva design id: ${designId}`);
    const existing = this.data.links.find((l) => l.designId === designId);
    if (existing) return existing;
    const row = { designId, relation, sourceDesignId, route, url, title, at: now() };
    this.data.links.push(row);
    this.save();
    return row;
  }

  current() {
    return this.data.links[this.data.links.length - 1] ?? null;
  }

  // ---- locators -----------------------------------------------------------
  setLocator(pageId, elementId, locator) {
    this.data.locators[`${pageId}/${elementId}`] = locator;
    return this.save();
  }

  locator(pageId, elementId) {
    return this.data.locators[`${pageId}/${elementId}`] ?? null;
  }

  setPage(pageId, canvaPageId) {
    this.data.pages[pageId] = canvaPageId;
    return this.save();
  }

  // ---- uploads ------------------------------------------------------------
  upload(contentHash) {
    return this.data.uploads[contentHash] ?? null;
  }

  recordUpload(contentHash, mediaId, { kind = 'image' } = {}) {
    this.data.uploads[contentHash] = { mediaId, kind, at: now() };
    return this.save();
  }

  // ---- transactions -----------------------------------------------------
  openTransaction(designId, transactionId) {
    for (const t of this.data.transactions) if (t.designId === designId && t.state === 'open') t.state = 'superseded';
    this.data.transactions.push({ designId, transactionId, state: 'open', openedAt: now(), touchedAt: now(), ops: 0 });
    return this.save();
  }

  touchTransaction(transactionId, ops = 0) {
    const t = this.data.transactions.find((x) => x.transactionId === transactionId);
    if (t) {
      t.touchedAt = now();
      t.ops += ops;
      this.save();
    }
    return t;
  }

  closeTransaction(transactionId, state) {
    if (!['committed', 'cancelled', 'expired'].includes(state)) throw new Error(`bad transaction state ${state}`);
    const t = this.data.transactions.find((x) => x.transactionId === transactionId);
    if (t) {
      t.state = state;
      t.closedAt = now();
      this.save();
    }
    return t;
  }

  openTransactions({ at = now() } = {}) {
    return this.data.transactions
      .filter((t) => t.state === 'open')
      .map((t) => ({ ...t, possiblyExpired: Date.parse(at) - Date.parse(t.touchedAt) > TX_STALE_MS }));
  }

  // ---- snapshots and external changes ------------------------------------
  snapshot(designId, readback) {
    this.data.snapshots[designId] = { at: now(), state: snapshotOf(readback) };
    return this.save();
  }

  externalChanges(designId, readback) {
    const snap = this.data.snapshots[designId];
    const known = Object.values(this.data.locators);
    return externalChanges(snap?.state, readback, known.length ? known : undefined);
  }

  // ---- operations log ----------------------------------------------------
  op({ tool, args, result = null, error = null, generation }) {
    const row = {
      at: now(),
      tool,
      args: args ? hashOf(args).slice(0, 12) : null,
      ok: !error,
      ...(error && { error: String(error).slice(0, 300), errorClass: classifyError(error).code }),
      ...(result && { result }),
      generation: generation ?? GENERATING.has(tool),
    };
    this.data.ops.push(row);
    this.save();
    return row;
  }

  generationCount() {
    return this.data.ops.filter((o) => o.generation && o.ok).length;
  }

  summary() {
    return {
      docId: this.docId,
      designs: this.data.links,
      openTransactions: this.openTransactions(),
      uploads: Object.keys(this.data.uploads).length,
      locators: Object.keys(this.data.locators).length,
      operations: this.data.ops.length,
      failed: this.data.ops.filter((o) => !o.ok).length,
      generationCalls: this.generationCount(),
    };
  }
}

// Error text or HTTP status → what to do. Never "switch route to get
// around": credits, rate limits and refusals stop the work and are reported.
export function classifyError(error) {
  const text = String(error?.message ?? error ?? '');
  const status = error?.status ?? Number(/\b(4\d\d|5\d\d)\b/.exec(text)?.[1] ?? 0);
  const rule = (code, action, retry, message) => ({ code, action, retry, message });
  if (/credit|quota|limit reached|upgrade|insufficient/i.test(text) || status === 402) return rule('quota', 'stop', false, 'نفد الرصيد أو الحصة: توقّف وأبلغ المستخدم، ولا تنتقل لمسار آخر للالتفاف.');
  if (status === 429 || /rate.?limit|too many requests/i.test(text)) return rule('rate-limit', 'wait', true, 'تجاوز معدل الطلبات: انتظر ثم أعد المحاولة مرة واحدة.');
  if (/declin|denied|not approved|rejected by user|user cancel/i.test(text)) return rule('approval-denied', 'stop', false, 'رفض المستخدم أو لم يوافق: لا تكرر ولا تبحث عن مسار بديل.');
  if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|reconnect|token expired|permission/i.test(text)) return rule('auth', 'stop', false, 'التفويض غير صالح: اطلب من المستخدم إعادة ربط Canva.');
  if (/expired|used upload url|single.?use|already used|signature/i.test(text)) return rule('expired-link', 'refresh', true, 'الرابط أو المعاملة انتهت: اطلب رابطًا أو معاملة جديدة، ولا تعِد استخدام القديم.');
  if (/transaction/i.test(text) && /not found|invalid|closed/i.test(text)) return rule('transaction-gone', 'refresh', true, 'المعاملة لم تعد صالحة: افتح معاملة جديدة بـ read-design وأعد العمليات غير المطبّقة فقط.');
  if (status === 404 || /not found/i.test(text)) return rule('not-found', 'stop', false, 'العنصر أو التصميم غير موجود: افحص التصميم من جديد.');
  if (status === 400 || /invalid|unsupported|validation|must be/i.test(text)) return rule('invalid', 'fix', false, 'الطلب مرفوض: صحّح المعاملات، لا تكرره كما هو.');
  if (status >= 500 || /ECONN|ETIMEDOUT|network|socket|fetch failed|timeout|EAI_AGAIN/i.test(text)) return rule('network', 'retry', true, 'خطأ شبكة أو خادم مؤقت: أعد المحاولة بتباعد (٢ ث، ٤ ث، ٨ ث) ثم توقف.');
  return rule('unknown', 'stop', false, 'خطأ غير معروف: توقّف واعرضه كما هو.');
}

export { GENERATING };
