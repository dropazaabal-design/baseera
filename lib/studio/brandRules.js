import { hexToRgb } from '../contrast.js';
import { plainText } from './measure.js';
import { hsl, pageTheme, resolveColor, resolveFont } from './theme.js';

// Identity rules a brand kit can declare in `constraints`, checked on the
// design (and, through the read-back, after a transfer):
//   no-yellow, no-orange   no yellow / orange in the theme, shapes or text
//   no-faces               no images tagged as people or faces (tags only:
//                          pixels are not inspected, so look at them too)
//   no-latin-words         no English words in the design, except the
//                          handles and words in `allowedLatin`
//   western-digits         digits as 0-9 (not ٠-٩)
//   fonts-only             heading/body fonts limited to `fonts.allowed`
// The creator's current instruction outranks the kit: a rule the request
// explicitly overrides becomes a warning that says so. Likewise the approved
// copy (a text with a content slot) is never changed silently: a digit or an
// English word in it is a warning to fix or confirm, while the same thing
// in what the studio itself produces (counters, labels, colours, fonts,
// images) is an error.

export const BRAND_RULES = ['no-yellow', 'no-orange', 'no-faces', 'no-latin-words', 'western-digits', 'fonts-only'];

// Chroma-based, so near-whites such as paper cream (#F7F3EA) are not
// counted as yellow the way a saturation test would.
export function warmFamily(hex) {
  const [r, g, b] = hexToRgb(hex);
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (chroma < 0.22) return null;
  const { h } = hsl(hex);
  if (h >= 18 && h < 42) return 'orange';
  if (h >= 42 && h < 68) return 'yellow';
  return null;
}

const FACE_TAGS = /(face|faces|person|people|portrait|selfie|human|man|woman|وجه|وجوه|شخص|أشخاص|اشخاص|بورتريه|رجل|امرأة|امراة|بشر)/i;

export function checkBrandRules(doc, brand, { overrides = [] } = {}) {
  const rules = (brand?.constraints ?? []).filter((r) => BRAND_RULES.includes(r));
  if (!rules.length) return [];
  const issues = [];
  const add = (rule, code, message, pageId, elementId, approved = false) =>
    issues.push({
      code: `brand.${code}`,
      severity: overrides.includes(rule) || approved ? 'warning' : 'error',
      message: overrides.includes(rule) ? `${message} (مسموح بطلبك الحالي)` : approved ? `${message} النص معتمد: عدّله أو أكّد أنه مقصود.` : message,
      ...(pageId && { pageId }),
      ...(elementId && { elementId }),
    });
  const banned = new Set(rules.filter((r) => r === 'no-yellow' || r === 'no-orange').map((r) => r.slice(3)));
  const allowedLatin = (brand.allowedLatin ?? [brand.handle].filter(Boolean)).map((s) => s.toLowerCase());

  if (banned.size) {
    for (const [role, hex] of Object.entries(doc.theme?.colors ?? {})) {
      const fam = warmFamily(hex);
      if (fam && banned.has(fam)) add(`no-${fam}`, `color-${fam}`, `لون ${fam === 'yellow' ? 'أصفر' : 'برتقالي'} (${hex}) في دور ${role}: ممنوع في هوية ${brand.name ?? brand.id}.`);
    }
  }
  for (const page of doc.pages) {
    const { colors } = pageTheme(doc, page);
    for (const el of page.elements) {
      if (el.hidden) continue;
      if (banned.size) {
        const used = [el.kind === 'shape' && el.fill !== 'none' && resolveColor(el.fill, colors), el.stroke && resolveColor(el.stroke, colors), el.kind === 'text' && resolveColor(el.style.color, colors)].filter(Boolean);
        for (const hex of used) {
          const fam = warmFamily(hex);
          if (fam && banned.has(fam)) add(`no-${fam}`, `color-${fam}`, `«${el.name ?? el.id}» بلون ${fam === 'yellow' ? 'أصفر' : 'برتقالي'} (${hex}).`, page.id, el.id);
        }
      }
      if (el.kind === 'image' && rules.includes('no-faces')) {
        const asset = doc.assets?.[el.assetId];
        const tags = [...(asset?.tags ?? []), asset?.name ?? '', el.alt ?? ''].join(' ');
        if (FACE_TAGS.test(tags)) add('no-faces', 'faces', `«${el.name ?? el.id}» موسوم بوجوه أو أشخاص: الهوية بلا وجوه بشرية.`, page.id, el.id);
      }
      if (el.kind !== 'text') continue;
      const text = plainText(el.text);
      if (rules.includes('no-latin-words')) {
        const latin = (text.match(/[@#]?[A-Za-z][A-Za-z0-9_.'-]*/g) ?? []).filter((w) => !allowedLatin.includes(w.toLowerCase()));
        if (latin.length) add('no-latin-words', 'latin-word', `«${el.name ?? el.id}» فيه كلمات إنجليزية: ${[...new Set(latin)].join('، ')}. المسموح: ${allowedLatin.join('، ') || 'لا شيء'}.`, page.id, el.id, Boolean(el.slot));
      }
      if (rules.includes('western-digits') && /[٠-٩۰-۹]/.test(text)) add('western-digits', 'digits', `«${el.name ?? el.id}» بأرقام عربية مشرقية (٠-٩): الهوية تستخدم 0-9.`, page.id, el.id, Boolean(el.slot));
      if (rules.includes('fonts-only') && brand.fonts?.allowed?.length) {
        const font = resolveFont(el.style.fontFamily, doc.theme.fonts);
        if (!brand.fonts.allowed.includes(font)) add('fonts-only', 'font', `«${el.name ?? el.id}» بخط ${font}، والمسموح ${brand.fonts.allowed.join(' أو ')}.`, page.id, el.id);
      }
    }
  }
  // One issue per rule and element is enough.
  const seen = new Set();
  return issues.filter((i) => {
    const k = `${i.code}|${i.pageId}|${i.elementId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Same text rules on texts read back from a destination (Canva).
export function checkBrandText(text, brand) {
  const rules = brand?.constraints ?? [];
  const allowedLatin = (brand?.allowedLatin ?? [brand?.handle].filter(Boolean)).map((s) => s.toLowerCase());
  const out = [];
  if (rules.includes('no-latin-words')) {
    const latin = (String(text).match(/[@#]?[A-Za-z][A-Za-z0-9_.'-]*/g) ?? []).filter((w) => !allowedLatin.includes(w.toLowerCase()));
    if (latin.length) out.push({ rule: 'no-latin-words', words: [...new Set(latin)] });
  }
  if (rules.includes('western-digits') && /[٠-٩۰-۹]/.test(text)) out.push({ rule: 'western-digits' });
  return out;
}
