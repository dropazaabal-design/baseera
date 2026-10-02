import { base64Encode, utf8 } from '../util.js';
import { classifyError } from './journal.js';

// Canva Connect API client for the creator's own integration (OAuth access
// token with the design:content:write, design:content:read and asset:write
// scopes). The token comes from the caller (environment variable
// CANVA_ACCESS_TOKEN in the CLI); it is never written to disk, logs or
// results. Only the documented endpoints are used:
//   POST /v1/designs                 blank design, custom width × height
//   POST /v1/imports, GET /v1/imports/{id}             design import (.pptx)
//   POST /v1/asset-uploads, GET /v1/asset-uploads/{id} asset upload
//   POST /v1/exports, GET /v1/exports/{id}             export job
//   GET  /v1/designs/{id}, GET /v1/designs/{id}/pages, GET /v1/designs/{id}/export-formats
// Jobs are polled with a growing delay; rate limits wait and retry once,
// everything else stops with its class (see classifyError).

const BASE = 'https://api.canva.com/rest/v1';

export class CanvaApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'CanvaApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.class = classifyError({ message, status });
  }
}

export class ConnectClient {
  constructor({ token, fetch: fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), base = BASE } = {}) {
    if (!token) throw new CanvaApiError('Connect API needs an access token (CANVA_ACCESS_TOKEN)', { status: 401 });
    // Kept in a closure, not on the instance, so it never serialises.
    this.request = async (method, path, { json, bytes, headers = {} } = {}) => {
      const init = { method, headers: { Authorization: `Bearer ${token}`, ...headers } };
      if (json !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(json);
      } else if (bytes) {
        init.headers['Content-Type'] = 'application/octet-stream';
        init.body = bytes;
      }
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          res = await fetchImpl(`${base}${path}`, init);
        } catch (err) {
          if (attempt < 2) {
            await sleep(2000 * 2 ** attempt);
            continue;
          }
          throw new CanvaApiError(`network error: ${err.message}`, { status: 0 });
        }
        const text = await res.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text.slice(0, 300) };
        }
        if (res.ok) return body;
        if (res.status === 429 && attempt === 0) {
          await sleep(Number(res.headers?.get?.('retry-after') ?? 10) * 1000);
          continue;
        }
        if (res.status >= 500 && attempt < 2) {
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        throw new CanvaApiError(`${method} ${path} → ${res.status}: ${body?.message ?? body?.code ?? text.slice(0, 200)}`, { status: res.status, code: body?.code, body });
      }
    };
    this.sleep = sleep;
  }

  async poll(path, pick, { timeoutMs = 120000 } = {}) {
    const started = Date.now();
    let wait = 1000;
    for (;;) {
      const body = await this.request('GET', path);
      const job = pick(body);
      if (job?.status === 'success') return job;
      if (job?.status === 'failed') throw new CanvaApiError(`job failed: ${job.error?.message ?? job.error?.code ?? 'unknown'}`, { status: 400, code: job.error?.code, body: job });
      if (Date.now() - started > timeoutMs) throw new CanvaApiError(`job timed out after ${timeoutMs / 1000}s: ${path}`, { status: 504 });
      await this.sleep(wait);
      wait = Math.min(wait * 1.6, 8000);
    }
  }

  createDesign({ width, height, title }) {
    return this.request('POST', '/designs', { json: { design_type: { type: 'custom', width, height }, ...(title && { title }) } }).then((b) => b.design);
  }

  async importDesign(bytes, { title, mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }) {
    const meta = JSON.stringify({ title_base64: base64Encode(utf8(title)), mime_type: mimeType });
    const started = await this.request('POST', '/imports', { bytes, headers: { 'Import-Metadata': meta } });
    const job = await this.poll(`/imports/${started.job.id}`, (b) => b.job);
    return job.result?.designs ?? [];
  }

  async uploadAsset(bytes, { name }) {
    const meta = JSON.stringify({ name_base64: base64Encode(utf8(name)) });
    const started = await this.request('POST', '/asset-uploads', { bytes, headers: { 'Asset-Upload-Metadata': meta } });
    const job = await this.poll(`/asset-uploads/${started.job.id}`, (b) => b.job);
    return job.asset;
  }

  async exportDesign(designId, format) {
    const started = await this.request('POST', '/exports', { json: { design_id: designId, format } });
    const job = await this.poll(`/exports/${started.job.id}`, (b) => b.job, { timeoutMs: 300000 });
    return job.urls ?? [];
  }

  getDesign(designId) {
    return this.request('GET', `/designs/${encodeURIComponent(designId)}`).then((b) => b.design);
  }

  getPages(designId) {
    return this.request('GET', `/designs/${encodeURIComponent(designId)}/pages`).then((b) => b.items ?? []);
  }

  exportFormats(designId) {
    return this.request('GET', `/designs/${encodeURIComponent(designId)}/export-formats`).then((b) => b.formats ?? b);
  }
}
