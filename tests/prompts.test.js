import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MemoryStore } from '../lib/studio/store.js';
import { buildDesign, openStudio } from '../lib/studio/studio.js';
import { KITABWBS_PRESET } from '../lib/studio/memory.js';
import { LAWS_SEQUENCE } from '../lib/studio/library/samples.js';
import { NEGATIVE_PROMPT, designPrompts, promptsMarkdown } from '../lib/studio/prompts.js';
import { plainText } from '../lib/studio/measure.js';

function laws(spec = {}) {
  const studio = openStudio(new MemoryStore());
  studio.memory.saveBrand('default', KITABWBS_PRESET);
  return buildDesign(studio, { brandId: 'kitabwbs', brief: 'laws', style: { id: 'mint-highlight' }, intent: { mode: 'carousel', format: 'portrait', pages: LAWS_SEQUENCE.pages.length, platform: 'instagram' }, pages: LAWS_SEQUENCE.pages, ...spec }, { save: false }).doc;
}

test('prompts: one per slide, with the exact Arabic texts, the marked words, the size and the negative prompt', () => {
  const doc = laws();
  const list = designPrompts(doc);
  assert.equal(list.length, 10);
  for (const [i, d] of list.entries()) {
    assert.match(d.prompt, /1080×1350/);
    assert.equal(d.negative, NEGATIVE_PROMPT);
    // Every visible content text appears word for word (markers removed).
    for (const el of doc.pages[i].elements.filter((e) => e.kind === 'text' && e.role !== 'system' && !e.hidden)) {
      assert.ok(d.prompt.includes(plainText(el.text).replace(/\n/g, ' / ')), `slide ${i + 1}: ${el.id}`);
    }
  }
  assert.match(list[0].prompt, /«في صمت»/);
  assert.equal(list[0].type, 'غلاف برقم كبير (خطّاف)');
  assert.match(list[5].prompt, /سهم نازل/);
  assert.match(list[4].prompt, /بعرض العمود/);
  assert.match(list[9].prompt, /صفّا إجراء/);
  // The panel's marked word is in the accent colour, not on a band.
  assert.match(list[7].prompt, /تمييز: «أطول» بلون التمييز/);
  assert.match(list[1].prompt, /«2\/10»/);
});

test('prompts markdown: storyboard rows, ready copy and a prompt block per slide', () => {
  const md = promptsMarkdown(laws());
  assert.equal((md.match(/^\| \d+ \|/gm) ?? []).length, 10);
  assert.equal((md.match(/^### الشريحة \d+/gm) ?? []).length, 10);
  assert.equal((md.match(/^سلبي: /gm) ?? []).length, 10);
  assert.match(md, /## النسخة النهائية الجاهزة للتصميم/);
});

test('prompts follow the design: the blue variant names its own marker colour', () => {
  const green = designPrompts(laws())[0].prompt;
  const blue = designPrompts(laws({ style: { id: 'mint-highlight', accentRole: 'accent' } }))[0].prompt;
  assert.match(green, /#D9F4EB/);
  assert.doesNotMatch(blue, /#D9F4EB/);
});

test('the laws example spec is the QA acceptance sequence', () => {
  const spec = JSON.parse(fs.readFileSync('docs/examples/laws-carousel/spec.json', 'utf8'));
  assert.deepEqual(spec.pages, JSON.parse(JSON.stringify(LAWS_SEQUENCE.pages)));
  assert.equal(spec.style.id, 'mint-highlight');
});
