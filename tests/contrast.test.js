import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, ensureContrast } from '../lib/contrast.js';
import { PALETTES, derivePalette, resolvePalette } from '../plugins/palettes.js';

test('contrastRatio matches WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.equal(contrastRatio('#767676', '#FFFFFF').toFixed(2), '4.54');
});

test('ensureContrast leaves passing colours untouched', () => {
  assert.equal(ensureContrast('#111111', '#FFFFFF', 4.5), '#111111');
});

test('ensureContrast fixes failing colours', () => {
  const fixed = ensureContrast('#BBBBBB', '#FFFFFF', 4.5);
  assert.ok(contrastRatio(fixed, '#FFFFFF') >= 4.5);
});

for (const p of PALETTES) {
  test(`preset "${p.id}" passes every rule without auto-fixing`, () => {
    const { report } = resolvePalette(p.colors);
    for (const r of report) assert.ok(!r.fixed, `${r.label}: ${r.before.toFixed(2)} < ${r.min}`);
  });
}

test('a hostile custom palette is fully corrected', () => {
  const { colors, report } = resolvePalette(derivePalette({ bg: '#777777', accent: '#7A7A7A' }));
  for (const r of report) assert.ok(r.pass, r.label);
  assert.ok(contrastRatio(colors.onAccent, colors.accent) >= 4.5);
  assert.ok(report.some((r) => r.fixed));
});
