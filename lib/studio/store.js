import { base64Decode, base64Encode, utf8 } from './util.js';

// Storage behind the library, assets, memory, projects, workflows, cache
// and ledger. One small synchronous interface with three backends:
//   MemoryStore        tests
//   FsStore            the CLI (lib/studio/node/fsStore.js): a directory of
//                      JSON files and content-addressed blobs, default ~/.baseera
//   LocalStorageStore  the browser editor
// Paths are POSIX-like ("library/designs/d_x/meta.json").

const decoder = new TextDecoder();
const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

// Shared JSON/lines helpers on top of readBytes/writeBytes.
class ByteStore {
  readJson(path) {
    const bytes = this.readBytes(path);
    if (!bytes) return null;
    try {
      return JSON.parse(decoder.decode(bytes));
    } catch {
      throw new Error(`corrupt JSON in ${path}`);
    }
  }

  writeJson(path, data) {
    this.writeBytes(path, utf8(JSON.stringify(data, null, 1)));
  }

  appendLine(path, line) {
    const prev = this.readBytes(path) ?? new Uint8Array();
    this.writeBytes(path, concat(prev, utf8(`${line}\n`)));
  }

  readLines(path) {
    const bytes = this.readBytes(path);
    return bytes ? decoder.decode(bytes).split('\n').filter(Boolean) : [];
  }
}

export class MemoryStore extends ByteStore {
  constructor() {
    super();
    this.files = new Map();
  }

  readBytes(path) {
    return this.files.has(path) ? new Uint8Array(this.files.get(path)) : null;
  }

  writeBytes(path, bytes) {
    this.files.set(path, new Uint8Array(bytes));
  }

  exists(path) {
    return this.files.has(path);
  }

  list(prefix) {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  remove(path) {
    this.files.delete(path);
  }
}

// Browser backend: one localStorage key per path under a prefix, values
// base64-encoded. Quota errors surface as exceptions the editor reports.
export class LocalStorageStore extends ByteStore {
  constructor(prefix = 'baseera.studio/', storage = globalThis.localStorage) {
    super();
    this.prefix = prefix;
    this.storage = storage;
  }

  readBytes(path) {
    const v = this.storage.getItem(this.prefix + path);
    return v === null ? null : base64Decode(v);
  }

  writeBytes(path, bytes) {
    this.storage.setItem(this.prefix + path, base64Encode(bytes));
  }

  exists(path) {
    return this.storage.getItem(this.prefix + path) !== null;
  }

  list(prefix) {
    const out = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(this.prefix + prefix)) out.push(k.slice(this.prefix.length));
    }
    return out.sort();
  }

  remove(path) {
    this.storage.removeItem(this.prefix + path);
  }
}

export { ByteStore };

// Whole-store snapshot as plain JSON (export/backup, and restoring in an
// environment whose disk does not persist between sessions).
export function exportSnapshot(store) {
  const files = {};
  for (const path of store.list('')) {
    if (path.startsWith('cache/')) continue; // caches are rebuilt, never shipped
    files[path] = base64Encode(store.readBytes(path));
  }
  return { format: 'baseera-studio-backup', version: 1, files };
}

export function importSnapshot(store, snapshot, { overwrite = false } = {}) {
  if (snapshot?.format !== 'baseera-studio-backup') throw new Error('not a baseera studio backup');
  let written = 0;
  for (const [path, b64] of Object.entries(snapshot.files ?? {})) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error(`unsafe path in backup: ${path}`);
    if (!overwrite && store.exists(path)) continue;
    store.writeBytes(path, base64Decode(b64));
    written++;
  }
  return written;
}
