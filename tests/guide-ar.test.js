import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GUIDE, PDF, PROMPTS_DIR, MIN_PROMPTS, buildGuide, parseGuide, validate, slugger, sourceHash, pdfSourceHash } from '../scripts/build-guide-ar.mjs';

const source = fs.readFileSync(GUIDE, 'utf8');
const sheet = fs.readFileSync(path.join(path.dirname(GUIDE), 'BASIRA-CHEATSHEET-AR.md'), 'utf8');

test('guide: every prompt is unique, in sequence, copyable, and every mention resolves', () => {
  const built = buildGuide(source, { 'BASIRA-CHEATSHEET-AR.md': sheet });
  assert.deepEqual(built.problems, []);
  assert.ok(built.stats.prompts >= MIN_PROMPTS, `${built.stats.prompts} prompts`);
  assert.equal(built.stats.sections, 36);
});

test('guide: contents, index and prompt library match the source', () => {
  const built = buildGuide(source);
  assert.equal(built.md, source, 'out of date: node scripts/build-guide-ar.mjs');
  for (const [file, text] of Object.entries(built.files)) {
    assert.equal(fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8'), text, `docs/prompts/${file}`);
  }
  assert.deepEqual(fs.readdirSync(PROMPTS_DIR).sort(), Object.keys(built.files).sort());
  // Every prompt lands in exactly one library file.
  const ids = Object.entries(built.files)
    .filter(([file]) => file !== 'README.md')
    .flatMap(([, text]) => text.match(/^### (P-[A-Z-]+\d+) /gm) ?? []);
  assert.equal(ids.length, built.stats.prompts);
  assert.equal(new Set(ids).size, ids.length);
});

test('guide: the PDF was printed from this source', async () => {
  assert.equal(await pdfSourceHash(PDF), sourceHash(source), 'stale PDF: node scripts/build-guide-ar.mjs');
});

test('guide: anchors follow GitHub headings', () => {
  const slug = slugger();
  assert.equal(slug('P-CAR-001 — كاروسيل تعليمي احترافي'), 'p-car-001--كاروسيل-تعليمي-احترافي');
  assert.equal(slug('11. ذكاء المنصات: Algorithm Intelligence'), '11-ذكاء-المنصات-algorithm-intelligence');
  assert.equal(slug('`studio` والأوامر'), 'studio-والأوامر');
  assert.equal(slug('11. ذكاء المنصات: Algorithm Intelligence'), '11-ذكاء-المنصات-algorithm-intelligence-1');
});

test('guide: validation names duplicates, gaps, missing blocks, dead mentions and unknown families', () => {
  const block = '```text\nx\n```';
  const md = [
    '# t', '', '| `P-AA` | أ |', '', '<!-- TOC -->', '', '## 1. قسم', '',
    '### P-AA-001 — أ', '', block, '',
    '### P-AA-001 — ب', '', block, '',
    '### P-AA-004 — ج', '', 'لا مربع هنا. انظر P-AA-009.', '',
    '### P-ZZ-001 — د', '', block, '', '<!-- INDEX -->', '',
  ].join('\n');
  const problems = validate(parseGuide(md)).join('\n');
  assert.match(problems, /P-AA-001: used twice/);
  assert.match(problems, /P-AA-004: expected number 3/);
  assert.match(problems, /P-AA-004: no copyable text block/);
  assert.match(problems, /P-AA-009 is mentioned but does not exist/);
  assert.match(problems, /P-ZZ-001: family P-ZZ is missing from the code table/);
  assert.match(problems, /P-ZZ-001: family P-ZZ has no prompt library file/);
  assert.match(problems, /only 4 prompts/);
});
