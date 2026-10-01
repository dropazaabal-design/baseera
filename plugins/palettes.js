import { bestOn, contrastRatio, ensureContrast, mix } from '../lib/contrast.js';

// Auto-Contrast & Palette Switcher plugin.
// Every palette (preset or custom) goes through resolvePalette() before it
// reaches a slide, so a failing pair is corrected, never rendered.
export const PALETTES = [
  {
    id: 'midnight',
    name: 'ليل',
    colors: { bg: '#0B1220', surface: '#16213A', text: '#F5F7FB', muted: '#A3B1C9', accent: '#F5B83D', onAccent: '#1A1204' },
  },
  {
    id: 'sand',
    name: 'رمل',
    colors: { bg: '#F6EFE4', surface: '#EADCC8', text: '#2A1F14', muted: '#6A5642', accent: '#B4461E', onAccent: '#FFFFFF' },
  },
  {
    id: 'emerald',
    name: 'زمرّد',
    colors: { bg: '#0E3B2E', surface: '#155443', text: '#EFFAF4', muted: '#A9D8C2', accent: '#F2C14E', onAccent: '#1B1403' },
  },
  {
    id: 'ink',
    name: 'حبر',
    colors: { bg: '#FFFFFF', surface: '#F2F3F7', text: '#121826', muted: '#5B6474', accent: '#4338CA', onAccent: '#FFFFFF' },
  },
  {
    id: 'violet',
    name: 'بنفسج',
    colors: { bg: '#1E1038', surface: '#2E1B54', text: '#F7F2FF', muted: '#C3B5E3', accent: '#FF8FB1', onAccent: '#2A0B19' },
  },
  {
    id: 'coral',
    name: 'مرجان',
    colors: { bg: '#FFF4EE', surface: '#FFE4D6', text: '#2B1210', muted: '#7A4A40', accent: '#C9362E', onAccent: '#FFFFFF' },
  },
];

// Accent is only used for large text and graphics, so it needs 3:1 (WCAG AA large).
const RULES = [
  { fg: 'text', bg: 'bg', min: 4.5, label: 'النص الأساسي على الخلفية' },
  { fg: 'text', bg: 'surface', min: 4.5, label: 'النص على البطاقات' },
  { fg: 'muted', bg: 'bg', min: 4.5, label: 'النص الثانوي على الخلفية' },
  { fg: 'muted', bg: 'surface', min: 4.5, label: 'النص الثانوي على البطاقات' },
  { fg: 'accent', bg: 'bg', min: 3, label: 'لون التمييز (نص كبير)' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, label: 'النص على الأزرار' },
];

export function derivePalette({ bg, accent }) {
  const text = mix(bestOn(bg), bg, 0.06);
  return { bg, surface: mix(bg, text, 0.08), text, muted: mix(text, bg, 0.35), accent, onAccent: bestOn(accent) };
}

export function paletteColors(design) {
  if (design.paletteId === 'custom') return derivePalette(design.custom);
  return (PALETTES.find((p) => p.id === design.paletteId) ?? PALETTES[0]).colors;
}

export function resolvePalette(input) {
  const colors = { ...input };
  const report = RULES.map(({ fg, bg, min, label }) => {
    const before = contrastRatio(colors[fg], colors[bg]);
    colors[fg] = ensureContrast(colors[fg], colors[bg], min);
    const ratio = contrastRatio(colors[fg], colors[bg]);
    return { label, min, before, ratio, fixed: ratio !== before, pass: ratio >= min };
  });
  return { colors, report };
}
