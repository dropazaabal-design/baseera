import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesign } from '../lib/studio/document.js';
import { applyPatches, createHistory, diffFingerprints, fingerprint, pushHistory, redo, undo } from '../lib/studio/patch.js';
import { parseCommand, runCommand } from '../lib/studio/commands.js';
import { inlineAsset } from '../lib/studio/assets.js';
import { base64Encode, utf8 } from '../lib/studio/util.js';

const svg = (color) => inlineAsset(`data:image/svg+xml;base64,${base64Encode(utf8(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="${color}" data-token="accent"/></svg>`))}`);
const arts = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'].map(svg);
const replacement = svg('#ABCDEF');

function illustrated() {
  return createDesign({
    brief: 'illustrated list',
    brand: { name: 'كتاب وبس', handle: '@kitabwbs' },
    assets: Object.fromEntries([...arts, replacement].map((a) => [a.id, a])),
    pages: [
      {
        composition: 'list',
        variant: 'illustrated',
        content: { title: 'خمس *عادات* للقراءة', items: ['اقرأ كل يوم', 'دوّن الأفكار', 'ناقش ما تقرأ', 'نوّع الكتب', 'احتفل بالإنجاز'], itemArt: arts.slice(0, 5).map((a) => a.id) },
      },
      { composition: 'outro', content: { title: 'تابعنا', save: 'احفظ' } },
    ],
  });
}

const changedKeys = (a, b) => diffFingerprints(fingerprint(a), fingerprint(b)).map((d) => `${d.key.split('/')[1]}:${d.change}`);

test('changing the title edits that text element and nothing else', () => {
  const doc = illustrated();
  const pageId = doc.pages[0].id;
  const { doc: next } = applyPatches(doc, [{ pageId, elementId: 'title', action: 'replace_text', payload: { text: 'سبع *عادات* للقراءة' } }]);
  assert.deepEqual(changedKeys(doc, next), ['title:text']);
  assert.equal(next.pages[0].content.title, 'سبع *عادات* للقراءة');
  assert.deepEqual(next.pages[1], doc.pages[1], 'other pages untouched');
  assert.equal(next.revision, doc.revision + 1);
});

test('"غيّر الرسم الرابع فقط" targets the fourth illustration; replacing it swaps only that assetId', () => {
  const doc = illustrated();
  const cmd = parseCommand(doc, 'غيّر الرسم الرابع فقط', { pageId: doc.pages[0].id });
  assert.equal(cmd.needs, 'asset');
  assert.equal(cmd.scope, 'graphic');
  assert.equal(cmd.target.elementId, 'item-4-art');
  assert.equal(cmd.target.currentAssetId, arts[3].id);
  const { doc: next } = applyPatches(doc, [{ pageId: cmd.target.pageId, elementId: cmd.target.elementId, action: 'replace_asset', payload: { assetId: replacement.id } }], { scope: 'graphic' });
  assert.deepEqual(changedKeys(doc, next), ['item-4-art:assetId']);
  const others = next.pages[0].elements.filter((e) => e.kind === 'image' && e.id !== 'item-4-art').map((e) => e.assetId);
  assert.deepEqual(others, [arts[0].id, arts[1].id, arts[2].id, arts[4].id]);
});

test('a graphic command can never rewrite text, and locked elements refuse edits', () => {
  const doc = illustrated();
  const pageId = doc.pages[0].id;
  assert.throws(() => applyPatches(doc, [{ pageId, elementId: 'title', action: 'replace_text', payload: { text: 'x' } }], { scope: 'graphic' }), /cannot change text/);
  const { doc: locked } = applyPatches(doc, [{ pageId, elementId: 'title', action: 'lock', payload: { locked: true } }]);
  assert.throws(() => applyPatches(locked, [{ pageId, elementId: 'title', action: 'move', payload: { dx: 10 } }]), /locked/);
  assert.throws(() => applyPatches(locked, [{ pageId, elementId: 'title', action: 'replace_text', payload: { text: 'x' } }]), /locked/);
  const r = runCommand(locked, 'كبّر العنوان', { pageId });
  assert.equal(r.local, false);
  assert.equal(r.doc, locked, 'nothing applied');
  // A failing patch in a batch rolls the whole batch back.
  assert.throws(() => applyPatches(doc, [{ pageId, elementId: 'title', action: 'move', payload: { dx: 5 } }, { pageId, elementId: 'nope', action: 'move', payload: { dx: 5 } }]));
});

test('undo/redo restore the exact previous state, including asset references', () => {
  const doc = illustrated();
  const pageId = doc.pages[0].id;
  let h = createHistory(doc);
  const a = applyPatches(doc, [{ pageId, elementId: 'item-2-art', action: 'replace_asset', payload: { assetId: replacement.id } }], { scope: 'graphic' }).doc;
  h = pushHistory(h, a, 'swap');
  const b = runCommand(a, 'كبّر العنوان قليلًا', { pageId }).doc;
  h = pushHistory(h, b, 'bigger');
  h = undo(h);
  assert.equal(h.present, a);
  h = undo(h);
  assert.equal(h.present, doc);
  assert.equal(h.present.pages[0].elements.find((e) => e.id === 'item-2-art').assetId, arts[1].id);
  h = redo(h);
  assert.equal(h.present.pages[0].elements.find((e) => e.id === 'item-2-art').assetId, replacement.id);
  h = redo(h);
  assert.equal(h.present, b);
});

test('Arabic commands map to targeted edits', () => {
  const doc = illustrated();
  const ctx = { pageId: doc.pages[0].id, brand: { colors: [{ hex: '#0B2A5B', role: 'bg', name: 'كحلي' }, { hex: '#1D4ED8', role: 'accent', name: 'أزرق' }] } };
  const bigger = runCommand(doc, 'كبّر العنوان قليلًا', ctx);
  const before = doc.pages[0].elements.find((e) => e.id === 'title').style.fontSize;
  const after = bigger.doc.pages[0].elements.find((e) => e.id === 'title').style.fontSize;
  assert.ok(after > before && after <= Math.round(before * 1.12), `${before} → ${after}`);
  assert.deepEqual(changedKeys(doc, bigger.doc).filter((k) => !k.startsWith('title')), [], 'only the title changed style');

  const bg = runCommand(doc, 'حوّل الخلفية إلى الأزرق من هويتي', ctx);
  assert.equal(bg.intent, 'theme');
  assert.equal(bg.hex, '#1D4ED8');
  assert.equal(bg.doc.theme.colors.bg, '#1D4ED8');

  const shorten = parseCommand(doc, 'اختصر النص مع إبقاء الرسالة', ctx);
  assert.equal(shorten.needs, 'rewrite');
  assert.equal(shorten.scope, 'text');
  assert.ok(shorten.targets.every((t) => t.maxChars < t.text.length + 1));

  assert.equal(parseCommand(doc, 'استخدم توزيع هذا التصميم مع المحتوى الجديد', ctx).needs, 'recompose');
  assert.equal(parseCommand(doc, 'أريد شيئًا جديدًا بجرافيك أقوى', ctx).needs, 'generate');

  const typed = runCommand(doc, 'غيّر العنوان إلى «ست عادات للقراءة»', ctx);
  assert.equal(typed.intent, 'replace_text');
  assert.equal(typed.doc.pages[0].content.title, 'ست عادات للقراءة');

  const ambiguous = parseCommand(doc, 'غيّر الرسم', ctx);
  assert.equal(ambiguous.needs, 'clarify');
  assert.equal(ambiguous.options.length, 5);

  const third = runCommand(doc, 'اجعل البند الثالث عريضًا', ctx);
  assert.deepEqual(changedKeys(doc, third.doc), ['item-3:style']);

  const columns = runCommand(createDesign({ brief: 'x', pages: [{ composition: 'list', content: { title: 'ع', items: ['أ', 'ب'] } }] }), 'وزّع البنود في عمودين', {});
  assert.equal(columns.doc.pages[0].layout.variant, 'grid');
});

test('chat "make the points smaller" resizes the whole list and re-lays out around it', () => {
  const doc = illustrated();
  const r = runCommand(doc, 'صغّر البنود', { pageId: doc.pages[0].id });
  const sizes = r.doc.pages[0].elements.filter((e) => e.role === 'item').map((e) => e.style.fontSize);
  assert.equal(new Set(sizes).size, 1);
  assert.ok(sizes[0] < doc.pages[0].elements.find((e) => e.id === 'item-1').style.fontSize);
});
