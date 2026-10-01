import { hexToRgb } from '../lib/contrast.js';
import { PALETTES } from './palettes.js';

// Agency Kit: Institutional Mode. The policy is applied on top of the
// user's saved choices at render time and never overwrites them, so
// switching the mode off restores their own design.
export const POLICY = {
  palettes: PALETTES.filter((p) => p.institutional).map((p) => p.id),
  font: 'tajawal',
  plugins: {
    pagination: { enabled: true },
    watermark: { enabled: true, showLogo: true, showBadge: true },
  },
};

// Reds, oranges, yellows and golds: hue below 70° or above 340°, with
// enough saturation to read as a colour. Near-white and near-black tints
// (cream backgrounds, dark browns used as text) are not warm accents.
export function isWarm(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0 || l < 0.12 || l > 0.9) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.3) return false;
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  const hue = (h + 360) % 360;
  return hue < 70 || hue >= 340;
}

// Why a palette is unavailable in Institutional Mode, or null if allowed.
export function paletteLock(palette) {
  if (Object.values(palette.colors).some(isWarm)) return 'ألوان دافئة';
  if (!POLICY.palettes.includes(palette.id)) return 'خارج الهوية';
  return null;
}

export function governDesign(design, governance) {
  if (!governance.institutional) return design;
  const paletteId = POLICY.palettes.includes(design.paletteId) ? design.paletteId : POLICY.palettes[0];
  return { ...design, paletteId, font: POLICY.font };
}

export function governPlugins(plugins, governance) {
  if (!governance.institutional) return plugins;
  return Object.fromEntries(Object.entries(plugins).map(([id, s]) => [id, { ...s, ...POLICY.plugins[id] }]));
}
