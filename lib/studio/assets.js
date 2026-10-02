import { validateAsset } from './contracts.js';
import { isColorable } from './render.js';
import { bytesToDataUrl, dataUrlToBytes, now, sha256, utf8 } from './util.js';

// Content-addressed asset store. A file's id is derived from its SHA-256,
// so the same image is stored once and any later corruption is detectable:
// verify() re-hashes the bytes and re-reads the header, and nothing that
// fails is ever returned as a usable asset.
//
// Records keep where an asset came from (generated / user upload / licensed,
// tool, prompt hash, rights note) and whether it may be placed in a design
// ("insertable") or only inspires one ("reference": a competitor's post, a
// mood image whose rights are unknown).

export class AssetError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AssetError';
    this.code = code;
  }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16be = (b, o) => (b[o] << 8) + b[o + 1];
const u16le = (b, o) => b[o] + (b[o + 1] << 8);
const u24le = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16);

// Unsafe SVG content: scripts, event handlers, javascript: URLs, external
// references (would load from the network) and embedded HTML.
export function checkSvg(text) {
  if (!/<svg[\s>]/i.test(text)) return { ok: false, reason: 'not an SVG document' };
  if (/<script[\s>]/i.test(text)) return { ok: false, reason: 'SVG contains <script>' };
  if (/\son[a-z]+\s*=/i.test(text)) return { ok: false, reason: 'SVG contains event handlers' };
  if (/javascript:/i.test(text)) return { ok: false, reason: 'SVG contains a javascript: URL' };
  if (/<foreignObject[\s>]/i.test(text)) return { ok: false, reason: 'SVG contains <foreignObject>' };
  if (/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i.test(text)) return { ok: false, reason: 'SVG references external files' };
  if (/<text[\s>]/i.test(text)) return { ok: false, reason: 'SVG contains <text>: keep words out of artwork, add them as text elements' };
  return { ok: true };
}

// Reads type, pixel size and transparency from the file header.
export function probeImage(bytes) {
  const b = bytes;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (String.fromCharCode(...b.subarray(12, 16)) !== 'IHDR') throw new AssetError('PNG without IHDR', 'corrupt');
    const colorType = b[25];
    const hasTrns = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 4096))).includes('tRNS');
    return { mediaType: 'image/png', widthPx: u32be(b, 16), heightPx: u32be(b, 20), transparent: colorType === 4 || colorType === 6 || hasTrns };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = b[o + 1];
      const len = u16be(b, o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mediaType: 'image/jpeg', widthPx: u16be(b, o + 7), heightPx: u16be(b, o + 5), transparent: false };
      }
      o += 2 + len;
    }
    throw new AssetError('JPEG without a frame header', 'corrupt');
  }
  if (b.length > 30 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...b.subarray(12, 16));
    if (chunk === 'VP8X') return { mediaType: 'image/webp', widthPx: u24le(b, 24) + 1, heightPx: u24le(b, 27) + 1, transparent: Boolean(b[20] & 0x10) };
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mediaType: 'image/webp', widthPx: (bits & 0x3fff) + 1, heightPx: ((bits >> 14) & 0x3fff) + 1, transparent: Boolean((bits >> 28) & 1) };
    }
    if (chunk === 'VP8 ') return { mediaType: 'image/webp', widthPx: u16le(b, 26) & 0x3fff, heightPx: u16le(b, 28) & 0x3fff, transparent: false };
    throw new AssetError('unknown WebP chunk', 'corrupt');
  }
  if (b.length > 10 && String.fromCharCode(...b.subarray(0, 4)) === 'GIF8') {
    return { mediaType: 'image/gif', widthPx: u16le(b, 6), heightPx: u16le(b, 8), transparent: true };
  }
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 2048)));
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    const text = new TextDecoder().decode(b);
    const check = checkSvg(text);
    if (!check.ok) throw new AssetError(check.reason, 'unsafe');
    const tag = /<svg[^>]*>/i.exec(text)[0];
    const num = (name) => {
      const m = new RegExp(`\\s${name}="([\\d.]+)(px)?"`).exec(tag);
      return m ? Number(m[1]) : null;
    };
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(tag);
    const width = num('width') ?? (vb ? Number(vb[1]) : null);
    const height = num('height') ?? (vb ? Number(vb[2]) : null);
    if (!width || !height) throw new AssetError('SVG needs width/height or a viewBox', 'corrupt');
    return { mediaType: 'image/svg+xml', widthPx: width, heightPx: height, transparent: true, colorable: isColorable(text) };
  }
  throw new AssetError('unsupported or corrupt image (PNG, JPEG, WebP, GIF or SVG)', 'unsupported');
}

const INDEX = 'assets/index.json';

export class AssetStore {
  constructor(store) {
    this.store = store;
  }

  index() {
    return this.store.readJson(INDEX) ?? { records: {} };
  }

  saveIndex(index) {
    this.store.writeJson(INDEX, index);
  }

  // Adds bytes (or a data: URL). Returns { record, duplicate }.
  add(input, { tags = [], provenance = { kind: 'user_upload' }, usage = 'insertable', style, name, parentId, prompt } = {}) {
    const bytes = typeof input === 'string' ? dataUrlToBytes(input)?.bytes ?? utf8(input) : input;
    const info = probeImage(bytes);
    const contentHash = sha256(bytes);
    const id = `a_${contentHash.slice(0, 16)}`;
    const index = this.index();
    const existing = index.records[id];
    if (existing) {
      // A second copy adds tags but never changes provenance or usage rights:
      // a reference image re-added as "insertable" stays a reference.
      existing.tags = [...new Set([...existing.tags, ...tags])];
      this.saveIndex(index);
      return { record: existing, duplicate: true };
    }
    const storageRef = `assets/objects/${contentHash.slice(0, 2)}/${contentHash}.${EXT[info.mediaType]}`;
    this.store.writeBytes(storageRef, bytes);
    const record = {
      id,
      contentHash,
      storageRef,
      mediaType: info.mediaType,
      widthPx: info.widthPx,
      heightPx: info.heightPx,
      transparent: info.transparent,
      ...(info.colorable && { colorable: true }),
      tags: [...new Set(tags)],
      provenance: {
        kind: provenance.kind,
        ...(provenance.source && { source: provenance.source }),
        ...(provenance.model && { model: provenance.model }),
        ...((provenance.promptHash || prompt) && { promptHash: provenance.promptHash ?? sha256(prompt) }),
        ...(provenance.rightsNote && { rightsNote: provenance.rightsNote }),
      },
      usage,
      ...(style && { style }),
      ...(name && { name }),
      ...(parentId && { parentId }),
      ...(prompt && { prompt: String(prompt).slice(0, 600) }),
      version: parentId ? (index.records[parentId]?.version ?? 1) + 1 : 1,
      createdAt: now(),
      bytes: bytes.length,
    };
    const problems = validateAsset(record);
    if (problems.length) throw new AssetError(problems.map((p) => `${p.path} ${p.message}`).join('; '), 'invalid');
    index.records[id] = record;
    this.saveIndex(index);
    return { record, duplicate: false };
  }

  get(id) {
    return this.index().records[id] ?? null;
  }

  list({ tags, usage, kind } = {}) {
    return Object.values(this.index().records).filter(
      (r) => (!usage || r.usage === usage) && (!kind || r.provenance.kind === kind) && (!tags?.length || tags.some((t) => r.tags.includes(t))),
    );
  }

  // Re-hashes and re-probes the stored bytes. Never throws.
  verify(id) {
    const record = this.get(id);
    if (!record) return { ok: false, reason: 'not in the asset index', code: 'missing' };
    const bytes = this.store.readBytes(record.storageRef);
    if (!bytes) return { ok: false, reason: 'file missing from the store', code: 'missing' };
    if (sha256(bytes) !== record.contentHash) return { ok: false, reason: 'content changed or corrupt (hash mismatch)', code: 'corrupt' };
    try {
      probeImage(bytes);
    } catch (err) {
      return { ok: false, reason: err.message, code: err.code ?? 'corrupt' };
    }
    return { ok: true, record, bytes };
  }

  bytes(id) {
    const v = this.verify(id);
    if (!v.ok) throw new AssetError(`asset ${id}: ${v.reason}`, v.code);
    return v.bytes;
  }

  dataUrl(id) {
    const record = this.get(id);
    return bytesToDataUrl(this.bytes(id), record.mediaType);
  }

  // Asset records with embedded data, for a self-contained document.
  embed(ids, { allowReference = false } = {}) {
    const out = {};
    for (const id of new Set(ids)) {
      const record = this.get(id);
      if (!record) throw new AssetError(`asset ${id} is not in the library`, 'missing');
      if (record.usage === 'reference' && !allowReference) {
        throw new AssetError(`asset ${id} is a reference (inspiration only, usage rights unknown) and cannot be placed in a design`, 'reference');
      }
      out[id] = { ...record, dataUrl: this.dataUrl(id) };
    }
    return out;
  }

  remove(id) {
    const index = this.index();
    const record = index.records[id];
    if (!record) return false;
    delete index.records[id];
    this.saveIndex(index);
    if (!Object.values(index.records).some((r) => r.storageRef === record.storageRef)) this.store.remove(record.storageRef);
    return true;
  }
}

// Asset record + data URL built in memory (the browser editor's uploads,
// v1 migration), with the same id scheme as the store.
export function inlineAsset(dataUrl, { tags = [], provenance = { kind: 'user_upload' }, name } = {}) {
  const decoded = dataUrlToBytes(dataUrl);
  if (!decoded) throw new AssetError('not a data: URL', 'unsupported');
  const info = probeImage(decoded.bytes);
  const contentHash = sha256(decoded.bytes);
  return {
    id: `a_${contentHash.slice(0, 16)}`,
    contentHash,
    storageRef: `inline:${contentHash.slice(0, 16)}`,
    mediaType: info.mediaType,
    widthPx: info.widthPx,
    heightPx: info.heightPx,
    transparent: info.transparent,
    ...(info.colorable && { colorable: true }),
    tags,
    provenance,
    usage: 'insertable',
    ...(name && { name }),
    dataUrl,
  };
}
