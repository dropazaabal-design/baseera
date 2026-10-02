import { inlineAsset } from '../../lib/studio/assets.js';
import { migrateCarousel } from '../../lib/studio/document.js';

// Converts a classic carousel into a studio design and stores it where the
// studio will open it (the same key scheme as useStudio's initialStudioDoc).
export function openInStudio(classicDoc, seedText) {
  const doc = migrateCarousel(classicDoc, { inlineAsset: (url) => inlineAsset(url) });
  let h = 5381;
  const text = seedText ?? '';
  for (let i = 0; i < text.length; i++) h = Math.imul(h, 33) ^ text.charCodeAt(i);
  const key = seedText ? `baseera.studio.doc:${(h >>> 0).toString(36)}` : 'baseera.studio.doc';
  localStorage.setItem(key, JSON.stringify(doc));
  return doc;
}
