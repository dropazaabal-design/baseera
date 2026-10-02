import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sha256, hashOf } from '../lib/studio/util.js';
import { validateDocument, validatePatch, validateElement, FORMATS } from '../lib/studio/contracts.js';
import { createDesign, setFormat, migrateCarousel } from '../lib/studio/document.js';
import { checkDesign } from '../lib/studio/quality.js';
import { compareText } from '../lib/studio/arabic.js';
import { estimateMeasure, textWidth } from '../lib/studio/measure.js';
import { FLOOR } from '../lib/studio/layout.js';
import { mirrorPath, parsePath } from '../lib/studio/paths.js';
import { renderArtSvg } from '../lib/studio/svg.js';

const brand = { name: 'كتاب وبس', handle: '@kitabwbs' };
const sixPoints = [
  'اقرأ ١٠ صفحات قبل النوم كل ليلة',
  'احمل كتابًا معك أينما ذهبت',
  'دوّن فكرة واحدة من كل فصل',
  'اختر كتبًا تحبها لا كتبًا تُفرض عليك',
  'انضم إلى نادي قراءة مثل @kitabwbs',
  'أغلق الإشعارات أثناء القراءة ٢٥ دقيقة',
];

export const post = () =>
  createDesign({ brief: 'test', brand, intent: { format: 'portrait', pages: 1 }, pages: [{ composition: 'post', content: { hook: 'ست عادات *تجعلك* تقرأ أكثر', points: sixPoints, cta: 'احفظ المنشور' } }] });

const texts = (doc) => doc.pages.flatMap((p) => p.elements.filter((e) => e.kind === 'text' && !e.hidden));

test('sha256 matches node:crypto (asset hashes and cache keys)', () => {
  for (const s of ['', 'abc', 'عيوبك', 'x'.repeat(1000)]) assert.equal(sha256(s), crypto.createHash('sha256').update(s).digest('hex'));
  assert.equal(hashOf({ b: 1, a: [2, { d: 1, c: 2 }] }), hashOf({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('contracts reject bad ids, frames, payloads and unknown assets', () => {
  const doc = post();
  assert.deepEqual(validateDocument(doc), []);
  const bad = structuredClone(doc);
  bad.pages[0].elements[1].id = bad.pages[0].elements[0].id;
  bad.pages[0].elements[2].frame.width = -4;
  bad.pages[0].elements.push({ id: 'img', kind: 'image', frame: { x: 0, y: 0, width: 10, height: 10 }, z: 1, locked: false, assetId: 'a_missing', alt: '' });
  const problems = validateDocument(bad).map((p) => p.message).join(' | ');
  assert.match(problems, /duplicate element id/);
  assert.match(problems, /greater than 0/);
  assert.match(problems, /not in the document/);
  assert.ok(validateElement({ id: 'x', kind: 'text', frame: { x: 0, y: 0, width: 1, height: 1 }, z: 0, locked: false, text: 'x', style: { fontSize: 'big' } }, 'e').length);
  assert.ok(validatePatch({ pageId: 'p', elementId: 'e', action: 'move', payload: { x: 'left' } }).length);
  assert.ok(validatePatch({ pageId: 'p', elementId: 'e', action: 'teleport', payload: {} }).length);
  assert.deepEqual(validatePatch({ pageId: 'p', elementId: 'e', action: 'replace_text', payload: { text: 'ok' } }), []);
});

test('single 4:5 post with six points fits at a readable size and passes the gate', () => {
  const doc = post();
  const page = doc.pages[0];
  assert.equal(page.widthPx, 1080);
  assert.equal(page.heightPx, 1350);
  assert.equal(page.layout.fits, true);
  const items = page.elements.filter((e) => e.role === 'item');
  assert.equal(items.length, 6);
  for (const el of items) assert.ok(el.style.fontSize >= FLOOR.body, `${el.id} at ${el.style.fontSize}px`);
  const report = checkDesign(doc);
  assert.equal(report.passed, true, JSON.stringify(report.issues));
});

test('seven-slide carousel: seven pages, each passes, counter reads ١ من ٧ … ٧ من ٧', () => {
  const c = (composition, content, variant) => ({ composition, content, variant });
  const doc = createDesign({
    brief: 'seven',
    brand,
    intent: { mode: 'carousel', pages: 7 },
    pages: [
      c('hero', { kicker: 'دليل', title: '٧ أسرار *للقراءة*', subtitle: 'جرّبها فريق كتاب وبس مع 3000 قارئ.' }),
      c('list', { title: 'ابدأ *بخطوات*', items: ['وقت ثابت للقراءة', 'مكان هادئ', 'كتاب قصير تحبه'] }),
      c('comparison', { title: 'سطحية أم *عميقة*', before: ['تقفز بين الصفحات'], after: ['تقرأ بتركيز'] }),
      c('quote', { quote: 'القراءة تمنحك *حياة* أخرى.', author: 'العقاد', role: 'كاتب' }),
      c('statement', { title: 'ما الكتاب الذي *غيّرك*؟' }),
      c('post', { hook: 'تذكّر *دائمًا*', points: ['اقرأ كل يوم', 'شارك ما تقرأ'] }),
      c('outro', { title: 'تابعنا', save: 'احفظ', follow: 'تابع', socials: ['@kitabwbs'] }),
    ],
  });
  assert.equal(doc.pages.length, 7);
  const counters = doc.pages.map((p) => p.elements.find((e) => e.id === 'sys-counter')?.text);
  assert.deepEqual(counters, [1, 2, 3, 4, 5, 6, 7].map((i) => `الشريحة ${'٠١٢٣٤٥٦٧٨٩'[i]} من ٧`));
  const report = checkDesign(doc, { expectedPages: 7 });
  assert.equal(report.passed, true, JSON.stringify(report.issues.filter((i) => i.severity === 'error')));
});

test('dense content is redistributed, never shrunk below the readability floor', () => {
  const long = [
    'حدّد هدفًا واقعيًا مثل 20 صفحة يوميًا وسجّله في تطبيق Goodreads لتتابع تقدمك',
    'اقرأ في الصباح الباكر قبل أن تبدأ رسائل البريد والاجتماعات وانشغالات اليوم',
    'اختر نوعين من الكتب في الوقت نفسه: كتابًا ممتعًا وكتابًا معرفيًا ثقيلًا',
    'شارك ملخصًا أسبوعيًا مع أصدقائك على @kitabwbs أو في مجموعة WhatsApp',
    'استمع إلى الكتب الصوتية أثناء القيادة والمشي والأعمال المنزلية المتكررة',
    'لا تكمل كتابًا لا يعجبك بعد 50 صفحة؛ فوقتك أثمن من الالتزام الأعمى',
  ];
  const doc = createDesign({ brief: 'dense', brand, pages: [{ composition: 'post', content: { hook: 'دليلك الشامل لبناء *عادة القراءة* خطوة بخطوة', points: long, cta: 'احفظه' } }] });
  const page = doc.pages[0];
  assert.equal(page.layout.fits, true);
  assert.ok(page.layout.decisions.length >= 1, 'explains what it changed');
  for (const el of page.elements.filter((e) => e.role === 'item')) assert.ok(el.style.fontSize >= FLOOR.body);
  // Mixed Arabic with a Latin handle, an app name and Western digits passes.
  assert.equal(checkDesign(doc).issues.filter((i) => i.severity === 'error').length, 0);
});

test('content that cannot fit is reported with concrete cuts instead of tiny text', () => {
  const items = Array.from({ length: 6 }, (_, i) => `البند ${i + 1}: ${'نص طويل جدًا يشرح الفكرة بتفصيل كبير ويضيف أمثلة كثيرة '.repeat(3)}`);
  const doc = createDesign({ brief: 'overflow', brand, pages: [{ composition: 'list', content: { title: 'قائمة *طويلة* جدًا', items } }] });
  const page = doc.pages[0];
  assert.equal(page.layout.fits, false);
  assert.ok(page.layout.overflow.suggestions.length > 0);
  assert.ok(page.layout.overflow.suggestions.every((s) => s.removeChars > 0 && s.slot));
  for (const el of page.elements.filter((e) => e.role === 'item')) assert.ok(el.style.fontSize >= FLOOR.body);
  const report = checkDesign(doc);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((i) => i.code === 'layout.overflow'));
});

test('text integrity: reordered letters, changed digits, missing words', () => {
  const diffs = compareText('اعرف عيوبك في ٢ خطوات', 'اعرف عبويك في ٧ خطوات');
  assert.deepEqual(
    diffs.map((d) => d.kind),
    ['reordered-letters', 'changed-number'],
  );
  assert.equal(compareText('٢٠٢٦', '2026')[0].kind, 'changed-digit-system');
  assert.equal(compareText('اقرأ كل يوم', 'اقرأ يوم')[0].kind, 'missing-word');
  assert.deepEqual(compareText('نص *مميز* هنا', 'نص مميز هنا'), []);
});

test('quality gate catches wrong size, wrong page count, a re-typed text and cramped boxes', () => {
  const doc = post();
  const hook = doc.pages[0].elements.find((e) => e.id === 'hook');
  const report = checkDesign(doc, {
    expectedPages: 2,
    readback: { pageCount: 7, pages: [{ index: 0, width: 1080, height: 1080, texts: [{ elementId: 'hook', text: hook.text.replace('عادات', 'عدات') }] }] },
    exported: [{ index: 0, width: 1080, height: 1080, name: '01-post.png' }],
  });
  const codes = report.issues.map((i) => i.code);
  assert.ok(codes.includes('pages.count'));
  assert.ok(codes.includes('readback.page-count'));
  assert.ok(codes.includes('readback.size'));
  assert.ok(codes.includes('export.size'));
  assert.ok(codes.some((c) => c.startsWith('readback.changed')));

  const narrow = structuredClone(doc);
  const el = narrow.pages[0].elements.find((e) => e.id === 'point-1');
  el.frame.width = 120;
  el.frame.height = 2000;
  assert.ok(checkDesign(narrow).issues.some((i) => i.code === 'text.narrow' && i.elementId === 'point-1'));
});

test('format change keeps content and returns the exact pixel size', () => {
  const doc = post();
  for (const f of ['square', 'story', 'portrait']) {
    const next = setFormat(doc, f);
    assert.equal(next.pages[0].widthPx, FORMATS[f].width);
    assert.equal(next.pages[0].heightPx, FORMATS[f].height);
    assert.deepEqual(next.pages[0].content, doc.pages[0].content);
  }
});

test('estimate measure: widths grow with text and wrap within the box', () => {
  const style = { font: 'cairo', weight: 400, size: 40, lineHeight: 1.6 };
  assert.ok(textWidth('كتاب', style) < textWidth('كتاب وبس', style));
  const m = estimateMeasure('اقرأ عشر صفحات قبل النوم كل ليلة لتبني عادة القراءة', style, 300);
  assert.ok(m.lines >= 3);
  assert.equal(m.height, m.lines * 40 * 1.6);
});

test('mirrored icons and art SVG keep to the path commands Canva accepts', () => {
  const d = mirrorPath('M4 12h15M13 6l6 6-6 6', 24);
  assert.equal(d, 'M20 12h-15M11 6l-6 6l6 6');
  assert.ok(parsePath(d).every((c) => /[MLHVCSAZ]/i.test(c.cmd)));
  const svg = renderArtSvg(post(), post().pages[0]);
  assert.ok(svg.startsWith('<svg') && !/<text/.test(svg));
});

test('classic carousels migrate to studio designs without losing text', async () => {
  const { readFileSync } = await import('node:fs');
  const v1 = JSON.parse(readFileSync('claude-plugin/skills/arabic-carousel/references/example.json', 'utf8'));
  const doc = migrateCarousel(v1);
  assert.deepEqual(validateDocument(doc), []);
  assert.equal(doc.pages.length, v1.slides.length);
  const all = texts(doc).map((e) => e.text);
  for (const s of v1.slides) for (const v of Object.values(s.data)) for (const t of [].concat(v)) if (typeof t === 'string' && t.trim()) assert.ok(all.includes(t), `lost: ${t}`);
});
