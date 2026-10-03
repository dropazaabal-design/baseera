// Records a visual verdict for style × composition pairs after looking at
// the contact sheets (docs/library/previews/<style>.<format>.png):
//
//   node scripts/style-review.mjs <style> <composition[,…]|all|sequence> <format[,…]> <ready|unsuitable|needs_work> "<note>" [--by name] [--out docs/library]
//
// "sequence" records the verdict on the style's acceptance carousel
// (docs/library/previews/<style>.sequence.png, portrait); "sequence:<id>"
// on another one it must pass (docs/library/previews/<style>.<id>.png).
//
// The verdict is bound to the pair's current fingerprint (style record,
// composition code, samples): editing any of them puts the pair back to
// needs_review in the next QA run. Only claimed pairs can be reviewed.
import fs from 'node:fs';
import path from 'node:path';
import { STYLES } from '../lib/studio/styles/catalog.js';
import { COMPOSITIONS } from '../lib/studio/compositions.js';
import { SAMPLES } from '../lib/studio/library/samples.js';
import { claims, pairFingerprint, sequenceFingerprint, sequenceReviewKey } from '../lib/studio/library/matrix.js';
import { SEQUENCES } from '../lib/studio/library/samples.js';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const outDir = path.resolve(root, flag('out', 'docs/library'));
const by = flag('by', 'assistant');
const [styleId, comps, formats, verdict, note = ''] = args;
const VERDICTS = ['ready', 'unsuitable', 'needs_work'];
const style = STYLES.find((s) => s.id === styleId);
if (!style || !comps || !formats || !VERDICTS.includes(verdict)) {
  console.error(`usage: style-review.mjs <style> <composition[,…]|all> <format[,…]> <${VERDICTS.join('|')}> "<note>"`);
  process.exit(2);
}
const file = path.join(outDir, 'review.json');
const reviews = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const list = comps === 'all' ? Object.keys(COMPOSITIONS).filter((c) => SAMPLES[c]) : comps.split(',');
const at = new Date().toISOString().slice(0, 10);
const done = [];
// "sequence" is the listening carousel; "sequence:<id>" another one.
if (comps === 'sequence' || comps.startsWith('sequence:')) {
  const def = comps === 'sequence' ? SEQUENCES[0] : SEQUENCES.find((x) => x.id === comps.slice('sequence:'.length));
  if (!def) {
    console.error(`unknown sequence "${comps}"`);
    process.exit(2);
  }
  const key = sequenceReviewKey(styleId, def);
  reviews[key] = { verdict, fingerprint: sequenceFingerprint(style, def), note, by, at };
  done.push(key);
  list.length = 0;
}
for (const c of list) {
  for (const f of formats.split(',')) {
    if (!claims(style, c, f)) continue;
    const key = `${styleId}/${c}/${f}`;
    reviews[key] = { verdict, fingerprint: pairFingerprint(style, c), note, by, at };
    done.push(key);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`);
console.log(JSON.stringify({ recorded: done }, null, 1));
