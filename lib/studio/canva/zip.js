// Minimal ZIP container (the format behind .pptx), dependency-free so the
// CLI bundle stays standalone. Writes stored (uncompressed) entries with a
// fixed timestamp, so the same document always produces the same bytes.
// Reads stored entries, and deflated ones when given an inflate function
// (Node: zlib.inflateRawSync), e.g. to check a .pptx exported by Canva.

import { utf8 } from '../util.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest DOS date: deterministic output.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// entries: [{ name, data: Uint8Array | string }]
export function zipStore(entries) {
  const files = entries.map((e) => ({ name: utf8(e.name), data: typeof e.data === 'string' ? utf8(e.data) : e.data }));
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + f.name.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // UTF-8 names
    v.setUint16(8, 0, true); // stored
    v.setUint16(10, DOS_TIME, true);
    v.setUint16(12, DOS_DATE, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.data.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, f.name.length, true);
    local.set(f.name, 30);
    parts.push(local, f.data);

    const cd = new Uint8Array(46 + f.name.length);
    const w = new DataView(cd.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, DOS_TIME, true);
    w.setUint16(14, DOS_DATE, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, f.data.length, true);
    w.setUint32(24, f.data.length, true);
    w.setUint16(28, f.name.length, true);
    w.setUint32(42, offset, true);
    cd.set(f.name, 46);
    central.push(cd);
    offset += local.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// → Map(name → Uint8Array). Throws on a malformed archive.
export function unzip(bytes, { inflateRaw } = {}) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no end of central directory)');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt ZIP central directory');
    const method = v.getUint16(p + 10, true);
    const packed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const localAt = v.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const dataAt = localAt + 30 + v.getUint16(localAt + 26, true) + v.getUint16(localAt + 28, true);
    const compressed = bytes.subarray(dataAt, dataAt + packed);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) {
      if (!inflateRaw) throw new Error(`entry ${name} is deflated: pass { inflateRaw }`);
      data = new Uint8Array(inflateRaw(compressed));
    } else throw new Error(`entry ${name}: unsupported compression ${method}`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
