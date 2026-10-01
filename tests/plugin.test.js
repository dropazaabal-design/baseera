import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SKILL = 'claude-plugin/skills/arabic-carousel';
const EXAMPLE = path.join(SKILL, 'references/example.json');

function build(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-'));
  const input = path.join(dir, 'carousel.json');
  const output = path.join(dir, 'carousel.html');
  fs.writeFileSync(input, typeof doc === 'string' ? doc : JSON.stringify(doc));
  const run = spawnSync('python3', [path.join(SKILL, 'scripts/build_carousel.py'), input, output], { encoding: 'utf8' });
  const html = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : null;
  return { ...run, html };
}

const seedOf = (html) => html.match(/<script id="carousel-seed" type="application\/json">(.*?)<\/script>/s)[1];

test('the example carousel builds with no warnings and round-trips', () => {
  const run = build(fs.readFileSync(EXAMPLE, 'utf8'));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.includes('warning'), false, run.stdout);
  assert.deepEqual(JSON.parse(seedOf(run.html)), JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')));
});

test('text cannot close the embedding <script> tag', () => {
  const run = build({ slides: [{ template: 'cover', data: { title: '</script><script>alert(1)</script>' } }] });
  assert.equal(run.status, 0, run.stderr);
  const seed = seedOf(run.html);
  assert.equal(seed.includes('<'), false);
  assert.equal(JSON.parse(seed).slides[0].data.title, '</script><script>alert(1)</script>');
});

test('unknown templates, fields and wrong types are rejected', () => {
  const run = build({
    slides: [
      { template: 'poster', data: {} },
      { template: 'cover', data: { titel: 'خطأ إملائي في اسم الحقل' } },
      { template: 'listicle', data: { items: 'ليست قائمة' } },
    ],
    design: { font: 'arial' },
  });
  assert.equal(run.status, 1);
  for (const expected of ['slides[1].template', 'slides[2].data.titel', 'slides[3].data.items', 'design.font']) {
    assert.ok(run.stderr.includes(expected), `missing error for ${expected}:\n${run.stderr}`);
  }
  assert.equal(run.html, null);
});

test('Arabic copy problems produce warnings, not errors', () => {
  const run = build({ slides: [{ template: 'cover', data: { title: 'هل أنت مستعد?', subtitle: 'كلمة‏مع علامة ـــ' } }] });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Arabic punctuation/);
  assert.match(run.stdout, /tatweel/);
  assert.match(run.stdout, /bidi control/);
});
