import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../lib/studio/store.js';
import { openStudio } from '../lib/studio/studio.js';
import { parseFeedback } from '../lib/studio/memory.js';
import { createDesign } from '../lib/studio/document.js';
import { checkDesign } from '../lib/studio/quality.js';

const fresh = () => openStudio(new MemoryStore());

test("one account's preference does not leak into another account", () => {
  const { memory } = fresh();
  memory.remember('me', { key: 'palette', value: 'emerald', scope: { brandId: 'kitabwbs' }, evidence: 'قال: اجعل كتاب وبس أخضر' });
  assert.equal(memory.resolve('me', { brandId: 'kitabwbs' }).applied.palette.value, 'emerald');
  assert.equal(memory.resolve('me', { brandId: 'other' }).applied.palette, undefined);
  assert.equal(memory.resolve('me', {}).applied.palette, undefined);
});

test('the current instruction beats an explicit preference, and narrower scopes beat wider ones', () => {
  const { memory } = fresh();
  memory.remember('me', { key: 'font.heading', value: 'tajawal', evidence: 'كل أعمالي' });
  memory.remember('me', { key: 'font.heading', value: 'almarai', scope: { brandId: 'b1' }, evidence: 'لهذا الحساب' });
  assert.equal(memory.resolve('me', {}).applied['font.heading'].value, 'tajawal');
  assert.equal(memory.resolve('me', { brandId: 'b1' }).applied['font.heading'].value, 'almarai');
  const r = memory.resolve('me', { brandId: 'b1' }, { 'font.heading': 'readex' });
  assert.deepEqual(r.applied['font.heading'], { value: 'readex', source: 'instruction' });
});

test('a weak signal stays weak; a repeated pattern becomes a suggestion, applied only once confirmed', () => {
  const { memory } = fresh();
  const scope = { brandId: 'b1' };
  memory.observe('me', { key: 'palette', value: 'ink', scope, designId: 'd1' });
  assert.equal(memory.suggestions('me').length, 0);
  assert.equal(memory.resolve('me', scope).applied.palette, undefined);
  // Same design three times: still not a pattern across designs.
  memory.observe('me', { key: 'palette', value: 'ink', scope, designId: 'd1' });
  memory.observe('me', { key: 'palette', value: 'ink', scope, designId: 'd1' });
  assert.equal(memory.suggestions('me').length, 0);
  memory.observe('me', { key: 'palette', value: 'ink', scope, designId: 'd2' });
  const [s] = memory.suggestions('me');
  assert.equal(s.origin, 'observed_pattern');
  assert.equal(s.confirmed, false);
  assert.equal(memory.resolve('me', scope).applied.palette, undefined, 'unconfirmed patterns are never applied');
  memory.confirm('me', s.id);
  assert.deepEqual(memory.resolve('me', scope).applied.palette.source, 'pattern');
  memory.forget('me', s.id);
  assert.equal(memory.resolve('me', scope).applied.palette, undefined);
});

test('feedback in Arabic splits into aspects with the right scope', () => {
  const f = parseFeedback('أحب الجرافيك لكن الخط صغير');
  assert.deepEqual(f.aspects, [
    { aspect: 'graphics', sentiment: 1 },
    { aspect: 'text.size', sentiment: -1, fix: 'increase' },
  ]);
  assert.equal(f.verdict, 'mixed');
  assert.equal(f.scope, 'design');
  const t = parseFeedback('هذا الأسلوب لا يناسب هذا الموضوع');
  assert.equal(t.scope, 'topic');
  assert.ok(t.aspects.some((a) => a.aspect === 'style' && a.sentiment < 0));
  assert.equal(parseFeedback('ممتاز، اعتمده').verdict, 'approved');
});

function save(studio, content, concepts) {
  const doc = createDesign({ brief: content.hook, pages: [{ composition: 'post', content }] });
  const quality = checkDesign(doc);
  studio.library.save(doc, { quality, concepts });
  return doc;
}

test('library: saved ≠ approved, approval needs the creator\'s words, rejection stays in its topic', () => {
  const studio = fresh();
  const doc = save(studio, { hook: 'عادات *القراءة*', points: ['اقرأ يوميًا', 'دوّن الأفكار'] }, ['reading', 'habits']);
  assert.equal(studio.library.meta(doc.id).status, 'candidate');
  assert.throws(() => studio.library.save(doc, { status: 'approved' }), /approval comes from the user/);
  assert.throws(() => studio.library.setStatus(doc.id, 'approved'), /evidence/);
  studio.library.markUsed(doc.id);
  assert.equal(studio.library.meta(doc.id).status, 'used', 'delivery is not approval');

  studio.library.setStatus(doc.id, 'rejected', { scope: { concepts: ['money'] }, reason: 'لا يناسب موضوع المال' });
  assert.equal(studio.library.search({ concepts: ['money'] }).length, 0, 'excluded for money topics');
  assert.equal(studio.library.search({ concepts: ['reading'] })[0].id, doc.id, 'still offered for reading');

  studio.library.approve(doc.id, 'قال: هذا ممتاز، اعتمده');
  assert.equal(studio.library.meta(doc.id).status, 'approved');
});

test('library search ranks by meaning, not by a shared title word', () => {
  const studio = fresh();
  const reading = save(studio, { hook: 'نصائح *للقراءة* اليومية', points: ['كتاب قبل النوم', 'مكتبة صغيرة في البيت'] }, ['reading', 'habits']);
  const money = save(studio, { hook: 'نصائح *للادخار* اليومي', points: ['ميزانية شهرية', 'استثمار صغير'] }, ['money']);
  const results = studio.library.search({ concepts: ['reading'] });
  assert.equal(results[0].id, reading.id);
  assert.ok(results.find((r) => r.id === money.id).parts.concept === 0);
});

test('saving keeps every version; reverting adds a version instead of overwriting', () => {
  const studio = fresh();
  const doc = save(studio, { hook: 'نسخة *أولى*', points: ['أ'] }, ['reading']);
  const v2 = { ...doc, pages: doc.pages.map((p) => ({ ...p, content: { ...p.content, hook: 'نسخة *ثانية*' } })) };
  studio.library.save(v2, { label: 'تعديل' });
  const { revision } = studio.library.revert(doc.id, 1);
  assert.equal(revision, 3);
  assert.equal(studio.library.get(doc.id, 3).pages[0].content.hook, 'نسخة *أولى*');
  assert.equal(studio.library.get(doc.id, 2).pages[0].content.hook, 'نسخة *ثانية*');
});
