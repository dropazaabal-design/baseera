import { PALETTES, derivePalette, resolvePalette } from '../../plugins/palettes.js';
import { hexToRgb } from '../contrast.js';
import { normalizeArabic } from './arabic.js';
import { FONT_IDS } from './measure.js';

// A theme is the palette (six colour roles) plus heading/body fonts and the
// numeral system. Elements refer to colours by role (@accent) and to fonts by
// role (@heading), so a palette or font change never touches the elements.

export const DEFAULT_FONTS = { heading: 'cairo', body: 'cairo' };

export function themeFromPalette(paletteId = 'midnight', { custom, fonts, numerals = 'arab' } = {}) {
  const raw = paletteId === 'custom' ? derivePalette(custom) : (PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0]).colors;
  const { colors } = resolvePalette(raw);
  return { paletteId, colors, fonts: { ...DEFAULT_FONTS, ...fonts }, numerals };
}

// A brand's colours carry roles; missing roles are derived from bg + accent
// and every pair is contrast-checked like a preset palette.
export function themeFromBrand(brand, { numerals = 'arab' } = {}) {
  const byRole = Object.fromEntries((brand.colors ?? []).filter((c) => c.role).map((c) => [c.role, c.hex]));
  const bg = byRole.bg ?? '#FFFFFF';
  const accent = byRole.accent ?? byRole.secondary ?? '#2563EB';
  const raw = { ...derivePalette({ bg, accent }), ...pick(byRole, ['surface', 'text', 'muted', 'onAccent']) };
  const { colors } = resolvePalette(raw);
  const fonts = {
    heading: FONT_IDS.includes(brand.fonts?.heading) ? brand.fonts.heading : DEFAULT_FONTS.heading,
    body: FONT_IDS.includes(brand.fonts?.body) ? brand.fonts.body : DEFAULT_FONTS.body,
  };
  return { paletteId: `brand:${brand.id}`, colors, fonts, numerals };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

// Re-resolves a theme after one role changed, keeping contrast valid: a new
// background re-derives text colours if the old ones no longer read.
export function withColor(theme, role, hex) {
  const raw = role === 'bg' ? { ...derivePalette({ bg: hex, accent: theme.colors.accent }), accent: theme.colors.accent } : { ...theme.colors, [role]: hex };
  return { ...theme, colors: resolvePalette(raw).colors };
}

export function resolveColor(value, colors) {
  if (typeof value === 'string' && value.startsWith('@')) return colors[value.slice(1)] ?? '#000000';
  return value;
}

export function resolveFont(value, fonts) {
  if (value === '@heading') return fonts.heading;
  if (value === '@body') return fonts.body;
  return value;
}

// Effective theme of one page: a page may override colour roles.
export function pageTheme(doc, page) {
  if (!page?.themeOverride) return doc.theme;
  let theme = doc.theme;
  for (const [role, hex] of Object.entries(page.themeOverride)) theme = withColor(theme, role, hex);
  return theme;
}

// Hue in degrees and saturation/lightness in [0, 1], for colour-name lookups
// ("the blue from my brand").
export function hsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

// Arabic colour words → hue ranges (degrees) or lightness for neutrals.
export const COLOR_WORDS = [
  { words: ['أزرق', 'الأزرق', 'زرقاء', 'كحلي', 'الكحلي', 'نيلي'], hue: [195, 255] },
  { words: ['أخضر', 'الأخضر', 'خضراء', 'زمردي'], hue: [85, 170] },
  { words: ['أحمر', 'الأحمر', 'حمراء'], hue: [345, 15] },
  { words: ['برتقالي', 'البرتقالي'], hue: [15, 40] },
  { words: ['أصفر', 'الأصفر', 'صفراء', 'ذهبي', 'الذهبي'], hue: [40, 65] },
  { words: ['بنفسجي', 'البنفسجي', 'موف'], hue: [255, 300] },
  { words: ['وردي', 'الوردي', 'زهري'], hue: [300, 345] },
  { words: ['فيروزي', 'الفيروزي', 'تركواز'], hue: [170, 195] },
  { words: ['أسود', 'الأسود', 'سوداء', 'داكن', 'الداكن'], dark: true },
  { words: ['أبيض', 'الأبيض', 'بيضاء', 'فاتح', 'الفاتح'], light: true },
];

export function matchesColorWord(hex, entry) {
  const { h, s, l } = hsl(hex);
  if (entry.dark) return l < 0.22;
  if (entry.light) return l > 0.9;
  if (s < 0.25 || l < 0.08 || l > 0.95) return false;
  const [from, to] = entry.hue;
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

export function colorWordIn(text) {
  const norm = ` ${normalizeArabic(text)} `;
  return COLOR_WORDS.find((entry) => entry.words.some((w) => norm.includes(normalizeArabic(w)))) ?? null;
}
