import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterLabel, formatNumber } from '../lib/numerals.js';
import { findFitSize } from '../lib/fit.js';

test('formatNumber switches numeral systems', () => {
  assert.equal(formatNumber(2026, 'arab'), '٢٠٢٦');
  assert.equal(formatNumber(2026, 'latn'), '2026');
});

test('counterLabel formats both styles', () => {
  assert.equal(counterLabel(0, 5, 'words', 'arab'), 'الشريحة ١ من ٥');
  assert.equal(counterLabel(2, 10, 'fraction', 'latn'), '3/10');
});

test('findFitSize returns the largest fitting size', () => {
  assert.equal(findFitSize((s) => s <= 97, 40, 150), 97);
});

test('findFitSize clamps to bounds', () => {
  assert.equal(findFitSize(() => true, 40, 150), 150);
  assert.equal(findFitSize(() => false, 40, 150), 40);
});
