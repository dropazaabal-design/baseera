import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FONT_REGISTRY } from '../fonts.js';

// @font-face rules for the typesetter page, built from the @fontsource CSS
// of each weight (which carries the unicode-range of every subset) with the
// woff2 files inlined as data URLs. font-display: block, so nothing is drawn
// in a fallback while a file loads. Also returns a hash of the font bytes:
// it is part of every cache key (a new font release re-measures).

const root = path.resolve(import.meta.dirname, '../../..');

export function fontFaceCss({ families = Object.keys(FONT_REGISTRY), weights = null, extra = [] } = {}) {
  const rules = [];
  const hash = crypto.createHash('sha256');
  for (const family of families) {
    const entry = FONT_REGISTRY[family];
    if (!entry) continue;
    const dir = path.join(root, 'node_modules', entry.package);
    for (const weight of entry.weights) {
      if (weights && !weights.includes(weight)) continue;
      const css = fs.readFileSync(path.join(dir, `${weight}.css`), 'utf8');
      for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
        if (!file) continue;
        const bytes = fs.readFileSync(path.join(dir, 'files', file));
        hash.update(file).update(bytes);
        rules.push(
          block
            .replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');`)
            .replace(/font-display:\s*\w+;/, 'font-display: block;'),
        );
      }
    }
  }
  // Extra faces (tests: a family whose file does not load).
  for (const x of extra) rules.push(`@font-face{font-family:'${x.family}';font-style:normal;font-weight:${x.weight};font-display:block;src:url(${x.url}) format('woff2');}`);
  return { css: rules.join('\n'), fontsHash: hash.digest('hex').slice(0, 16) };
}
