// Extracts design rules from the pinned style sources (Design Library V2):
//
//   node scripts/extract-style-sources.mjs --clone AICAE/opendesign=/path/to/clone [--clone …] [--out docs/library/sources]
//
// For each DESIGN.md source in lib/studio/styles/sources.js whose repository
// has a local clone, the file is read, its git blob hash is checked against
// the pinned one (a different content is refused, never "close enough"),
// and the compiler's extraction (explicit values, rules, ambiguous parts,
// parts that do not apply to Arabic) is written with its source and
// licence. The clones are only read.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCES } from '../lib/studio/styles/sources.js';
import { extractDesignRules } from '../lib/studio/styleCompiler.js';

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const clones = {};
let outDir = path.join(root, 'docs/library/sources');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--clone') {
    const [repo, dir] = argv[++i].split('=');
    clones[repo] = dir;
  } else if (argv[i] === '--out') outDir = path.resolve(root, argv[++i]);
}

// git's blob id: sha1("blob <size>\0" + content).
const blobId = (bytes) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');

const report = [];
fs.mkdirSync(outDir, { recursive: true });
for (const s of SOURCES) {
  if (s.format !== 'design-md') {
    report.push({ id: s.id, skipped: 'not a DESIGN.md (ideas recorded by hand in the style provenance)' });
    continue;
  }
  const dir = clones[s.repo];
  if (!dir) {
    report.push({ id: s.id, skipped: 'no local clone given' });
    continue;
  }
  const file = path.join(dir, s.path);
  if (!fs.existsSync(file)) {
    report.push({ id: s.id, refused: 'file missing in the clone' });
    continue;
  }
  const bytes = fs.readFileSync(file);
  const blob = blobId(bytes);
  if (blob !== s.blob) {
    report.push({ id: s.id, refused: `content differs from the pinned blob (${blob.slice(0, 8)} ≠ ${s.blob.slice(0, 8)})` });
    continue;
  }
  const rules = extractDesignRules(bytes.toString('utf8'), { repo: s.repo, commit: s.commit, path: s.path, blob: s.blob, license: s.license });
  const name = `${s.id.replace(/\//g, '--')}.json`;
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify({ ...rules, note: 'Extracted values and rule excerpts from the source above, under its licence. Inputs for styles, not styles.' }, null, 1)}\n`);
  report.push({ id: s.id, written: name, summary: rules.summary });
}
console.log(JSON.stringify(report, null, 1));
