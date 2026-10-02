import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ByteStore } from '../store.js';

// Filesystem backend for the CLI. Writes go to a temp file then rename, so a
// crash never leaves half-written JSON; the store survives restarts because
// it is a plain directory (default ~/.baseera, or BASEERA_HOME / --home).

export function defaultHome() {
  return process.env.BASEERA_HOME || path.join(os.homedir(), '.baseera');
}

export class FsStore extends ByteStore {
  constructor(root = defaultHome()) {
    super();
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
  }

  file(p) {
    const full = path.resolve(this.root, p);
    if (!full.startsWith(this.root + path.sep) && full !== this.root) throw new Error(`path escapes the store: ${p}`);
    return full;
  }

  readBytes(p) {
    try {
      return new Uint8Array(fs.readFileSync(this.file(p)));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  writeBytes(p, bytes) {
    const full = this.file(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, full);
  }

  appendLine(p, line) {
    const full = this.file(p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.appendFileSync(full, `${line}\n`);
  }

  exists(p) {
    return fs.existsSync(this.file(p));
  }

  list(prefix) {
    const out = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (!e.name.endsWith('.tmp')) {
          const rel = path.relative(this.root, full).split(path.sep).join('/');
          if (rel.startsWith(prefix)) out.push(rel);
        }
      }
    };
    walk(this.root);
    return out.sort();
  }

  remove(p) {
    fs.rmSync(this.file(p), { force: true });
  }
}
