import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { openStudio } from '../studio.js';
import { FsStore, defaultHome } from './fsStore.js';

// Node context for the Canva tools (CLI and MCP server): the studio store
// (~/.baseera), file access, and only the one environment variable the
// tools read (a Connect API token, never written anywhere).
export function nodeContext({ home = defaultHome(), env = process.env } = {}) {
  const store = new FsStore(home);
  return {
    store,
    studio: openStudio(store, { session: env.BASEERA_SESSION ?? null }),
    env: { CANVA_ACCESS_TOKEN: env.CANVA_ACCESS_TOKEN || undefined },
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    inflateRaw: zlib.inflateRawSync,
    tmpDir: path.join(os.tmpdir(), 'baseera-canva'),
    join: path.join,
    readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
    readBytes: (p) => new Uint8Array(fs.readFileSync(p)),
    writeFile: (p, bytes) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, bytes);
    },
  };
}
