import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { FORMATS, formatOf } from '../lib/formats.js';
import { buildPdf } from '../lib/pdf.js';
import { POLICY, governDesign, governPlugins, isWarm, paletteLock } from '../plugins/agencyKit.js';
import { PALETTES } from '../plugins/palettes.js';

test('formats have the exact platform aspect ratios', () => {
  assert.equal(FORMATS.portrait.width / FORMATS.portrait.height, 4 / 5);
  assert.equal(FORMATS.square.width / FORMATS.square.height, 1);
  assert.equal(FORMATS.story.width / FORMATS.story.height, 9 / 16);
  assert.equal(formatOf('unknown'), FORMATS.portrait);
});

test('isWarm flags yellow, orange, gold and red accents only', () => {
  for (const warm of ['#F5B83D', '#F2C14E', '#B4461E', '#C9362E', '#FF8FB1', '#FFD700', '#FFA500']) {
    assert.equal(isWarm(warm), true, warm);
  }
  for (const cool of ['#0B1F3A', '#10B981', '#047857', '#4338CA', '#FFFFFF', '#000000', '#F6EFE4', '#777777']) {
    assert.equal(isWarm(cool), false, cool);
  }
});

test('only the navy/emerald agency palettes are allowed in Institutional Mode', () => {
  const allowed = PALETTES.filter((p) => !paletteLock(p)).map((p) => p.id);
  assert.deepEqual(allowed, POLICY.palettes);
  assert.deepEqual(allowed, ['agency-navy', 'agency-light']);
  for (const p of PALETTES.filter((x) => POLICY.palettes.includes(x.id))) {
    assert.ok(!Object.values(p.colors).some(isWarm), `${p.id} has a warm colour`);
    assert.ok([p.colors.bg, p.colors.text].includes('#0B1F3A'), `${p.id} must use navy as primary`);
  }
  assert.equal(paletteLock(PALETTES.find((p) => p.id === 'midnight')), 'ألوان دافئة');
  assert.equal(paletteLock(PALETTES.find((p) => p.id === 'ink')), 'خارج الهوية');
});

test('governDesign forces policy without touching the saved design', () => {
  const design = { paletteId: 'midnight', font: 'cairo', numerals: 'latn' };
  assert.equal(governDesign(design, { institutional: false }), design);
  assert.deepEqual(governDesign(design, { institutional: true }), { paletteId: 'agency-navy', font: POLICY.font, numerals: 'latn' });
  assert.equal(governDesign({ ...design, paletteId: 'agency-light' }, { institutional: true }).paletteId, 'agency-light');
  assert.equal(design.paletteId, 'midnight');
});

test('governPlugins forces brand plugins on and keeps other settings', () => {
  const plugins = {
    pagination: { enabled: false, style: 'fraction' },
    watermark: { enabled: false, showLogo: false, showBadge: true },
    swipe: { enabled: false, text: 'x' },
  };
  const governed = governPlugins(plugins, { institutional: true });
  assert.deepEqual(governed.pagination, { enabled: true, style: 'fraction' });
  assert.deepEqual(governed.watermark, { enabled: true, showLogo: true, showBadge: true });
  assert.deepEqual(governed.swipe, plugins.swipe);
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('buildPdf makes one page per slide at the slide size', async () => {
  const bytes = await buildPdf([PNG_1PX, PNG_1PX, PNG_1PX], { width: 1080, height: 1350, title: 'كاروسيل', author: 'بصيرة' });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 3);
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 1080, height: 1350 });
  assert.equal(pdf.getTitle(), 'كاروسيل');
  assert.equal(pdf.getAuthor(), 'بصيرة');
});
