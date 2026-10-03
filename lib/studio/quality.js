import { contrastRatio } from '../contrast.js';
import { formatNumber } from '../numerals.js';
import { isWarm } from '../../plugins/agencyKit.js';
import { DIFF_LABEL, canonicalText, compareText, numbersIn } from './arabic.js';
import { checkBrandRules } from './brandRules.js';
import { contentTexts } from './compositions.js';
import { FORMATS, validateDocument } from './contracts.js';
import { getContentAt } from './document.js';
import { estimateMeasure, plainText, textWidth, wrapLines } from './measure.js';
import { pageTheme, resolveColor, resolveFont } from './theme.js';

// Quality gate. Runs on the document (no browser needed) and, when given,
// on what came back from a destination (Canva read-back, OCR, exported file
// sizes). Each issue: { code, pageId, elementId?, severity, message }.
// Errors block delivery; warnings are shown. The checks cover the failures
// seen before: wrong page size, 7 pages instead of 2, cramped text, and
// «عيوبك» turning into «عبويك» after a destination re-typed the text.

const PHONE_WIDTH = 390; // pt across a phone feed
const BODY_ROLES = new Set(['item', 'subtitle', 'quote', 'caption', 'author', 'body']);
const LABEL_ROLES = new Set(['label', 'kicker', 'cta', 'number', 'system', 'brand']);

const n = (x) => formatNumber(x, 'arab');
const issue = (code, severity, message, pageId, elementId) => ({ code, severity, message, ...(pageId && { pageId }), ...(elementId && { elementId }) });

const area = (f) => f.width * f.height;
function intersection(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const contains = (outer, inner) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

// Colour right behind a text: the topmost filled, opaque shape under the
// text's frame, or the page background.
function backgroundOf(page, el, colors) {
  const below = page.elements
    .filter((e) => e.kind === 'shape' && e.z < el.z && !e.hidden && e.fill !== 'none' && (e.opacity ?? 1) >= 0.9 && !e.rotation && contains(e.frame, el.frame))
    .sort((a, b) => b.z - a.z);
  return below.length ? resolveColor(below[0].fill, colors) : colors.bg;
}

const visibleText = (page) => page.elements.filter((e) => e.kind === 'text' && !e.hidden && plainText(e.text).trim());

export function checkDesign(doc, { expectedPages, expectedFormat, source, readback, exported, verifyAsset, measure = estimateMeasure, requireAssetData = false, brand, brandOverrides = [] } = {}) {
  const issues = [];

  for (const p of validateDocument(doc)) issues.push(issue('contract.invalid', 'error', `${p.path}: ${p.message}`));

  // Size and page count against what was asked for.
  const format = FORMATS[expectedFormat ?? doc.intent?.format] ?? FORMATS.portrait;
  for (const page of doc.pages) {
    if (page.widthPx !== format.width || page.heightPx !== format.height) {
      issues.push(issue('size.mismatch', 'error', `مقاس الصفحة ${page.widthPx}×${page.heightPx} والمطلوب ${format.width}×${format.height} (${format.ratio}).`, page.id));
    }
  }
  const wantPages = expectedPages ?? doc.intent?.pages;
  if (wantPages && doc.pages.length !== wantPages) {
    issues.push(issue('pages.count', 'error', `عدد الصفحات ${n(doc.pages.length)} والمطلوب ${n(wantPages)}.`));
  }

  // Brand constraints.
  const constraints = brand?.constraints ?? [];
  if (constraints.includes('no-warm-colors') || doc.governance?.institutional) {
    const warm = Object.entries(doc.theme.colors).filter(([, hex]) => isWarm(hex));
    if (warm.length) issues.push(issue('brand.warm-colors', 'error', `ألوان دافئة ممنوعة في هذه الهوية: ${warm.map(([r, h]) => `${r} ${h}`).join('، ')}.`));
  }
  // Identity rules (no yellow/orange, no faces, no English words but the
  // handle, Western digits, allowed fonts); the current request may relax one.
  issues.push(...checkBrandRules(doc, brand, { overrides: brandOverrides }));

  doc.pages.forEach((page, pi) => {
    const theme = pageTheme(doc, page);
    const scale = PHONE_WIDTH / page.widthPx;
    const texts = visibleText(page);

    // Layout result: the reflow engine reports content it could not fit.
    if (page.layout && !page.layout.fits) {
      const cuts = (page.layout.overflow?.suggestions ?? [])
        .slice(0, 3)
        .map((s) => `«${s.slot}» بنحو ${n(s.removeChars)} حرفًا`)
        .join('، ');
      issues.push(issue('layout.overflow', 'error', `الصفحة ${n(pi + 1)}: المحتوى لا يتسع بحجم مقروء. اختصر ${cuts || 'النص'}.`, page.id));
    }

    // Every approved text in the content must be on the page, verbatim.
    for (const t of contentTexts(page.composition.id, page.content)) {
      if (t.implicit) continue;
      const el = page.elements.find((e) => e.kind === 'text' && e.slot === t.slot);
      if (!el || el.hidden) issues.push(issue('content.missing', 'error', `الصفحة ${n(pi + 1)}: النص «${plainText(t.text).slice(0, 40)}» غير ظاهر.`, page.id));
      else if (canonicalText(el.text) !== canonicalText(t.text)) issues.push(issue('content.mismatch', 'error', `الصفحة ${n(pi + 1)}: نص «${el.name ?? el.id}» لا يطابق المحتوى المعتمد.`, page.id, el.id));
    }

    // The approved copy given separately (e.g. by the user) must survive.
    const src = source?.[pi];
    if (src) {
      for (const [slot, expected] of Object.entries(flatten(src))) {
        const actual = getContentAt(page.content, slot);
        if (typeof actual !== 'string') {
          issues.push(issue('source.missing', 'error', `الصفحة ${n(pi + 1)}: «${slot}» من النص المعتمد غير موجود.`, page.id));
          continue;
        }
        for (const d of compareText(expected, actual)) issues.push(textDiffIssue('source.changed', d, page.id, slotElement(page, slot)?.id, pi));
      }
    }

    for (const el of texts) {
      const size = el.style.fontSize;
      const phone = size * scale;
      const font = resolveFont(el.style.fontFamily, theme.fonts);
      const isLabel = LABEL_ROLES.has(el.role);
      if (BODY_ROLES.has(el.role) || el.role === 'title') {
        const min = el.role === 'title' ? 18 : 10.5;
        if (phone < min) issues.push(issue('text.too-small', 'error', `«${el.name ?? el.id}» بحجم ${Math.round(size)}px يظهر على الهاتف بنحو ${phone.toFixed(1)}pt، أقل من ${min}pt المقروء.`, page.id, el.id));
      }
      // Cramped text: few characters per line, or a word wider than its box.
      const words = plainText(el.text).split(/\s+/).filter(Boolean);
      if (!isLabel && !el.style.nowrap && words.length > 2) {
        const perLine = el.frame.width / (0.5 * size);
        if (perLine < 9) issues.push(issue('text.narrow', 'warning', `«${el.name ?? el.id}» ضيّق: نحو ${n(Math.floor(perLine))} أحرف في السطر. وسّع منطقته أو قلّل حجمه.`, page.id, el.id));
      }
      // A supporting line that wraps onto a lone last word reads as a
      // leftover: break the lines by hand or shorten them.
      if ((el.role === 'body' || el.role === 'subtitle') && !el.style.nowrap) {
        const lone = plainText(el.text).split('\n').filter((para) => {
          const lines = wrapLines(para, { font, weight: el.style.weight, size }, el.frame.width);
          return lines.length > 1 && lines.at(-1).text.trim().split(/\s+/).length < 2;
        });
        if (lone.length) issues.push(issue('text.lone-word', 'warning', `«${el.name ?? el.id}»: سطر ينتهي بكلمة وحيدة («${lone[0].trim().split(/\s+/).at(-1)}»). اقسم السطور بنفسك أو اختصرها.`, page.id, el.id));
      }
      const longest = Math.max(0, ...words.map((w) => textWidth(w, { font, weight: el.style.weight, size })));
      if (longest > el.frame.width * 1.02 && !el.style.nowrap) {
        issues.push(issue('text.clipped-word', 'error', `«${el.name ?? el.id}»: كلمة أعرض من مساحتها وستُقص.`, page.id, el.id));
      }
      if (!el.style.nowrap) {
        const m = measure(el.text, { font, weight: el.style.weight, size: el.style.minFontSize ?? size, lineHeight: el.style.lineHeight }, el.frame.width);
        if (m.height > el.frame.height * 1.05 + 2) issues.push(issue('text.overflow', 'error', `«${el.name ?? el.id}» أطول من مساحته حتى بأصغر حجم مسموح.`, page.id, el.id));
      }
      const f = el.frame;
      if (f.x < -1 || f.y < -1 || f.x + f.width > page.widthPx + 1 || f.y + f.height > page.heightPx + 1) {
        issues.push(issue('text.out-of-bounds', 'error', `«${el.name ?? el.id}» يخرج عن حدود الصفحة.`, page.id, el.id));
      }
      const inset = FORMATS[doc.intent?.format]?.inset;
      if (inset && (inset.top || inset.bottom) && (f.y < inset.top || f.y + f.height > page.heightPx - inset.bottom)) {
        issues.push(issue('text.unsafe-zone', 'warning', `«${el.name ?? el.id}» داخل منطقة تغطيها واجهة القصص.`, page.id, el.id));
      }
      // Contrast with what is directly behind the text.
      const fg = resolveColor(el.style.color, theme.colors);
      const bg = backgroundOf(page, el, theme.colors);
      const large = size >= 48 || (size >= 37 && el.style.weight >= 700);
      const ratio = contrastRatio(fg, bg);
      if (ratio < (large ? 3 : 4.5)) {
        issues.push(issue('contrast.low', 'error', `«${el.name ?? el.id}»: تباين ${ratio.toFixed(2)}:1 أقل من ${large ? 3 : 4.5}:1.`, page.id, el.id));
      }
      // Marked words sit on a marker band: the text must read on it too.
      if (el.style.highlight && el.text.includes('*')) {
        const hl = contrastRatio(fg, resolveColor(el.style.highlight, theme.colors));
        if (hl < (large ? 3 : 4.5)) issues.push(issue('contrast.low', 'error', `«${el.name ?? el.id}»: تباين الكلمات المظلّلة ${hl.toFixed(2)}:1 أقل من ${large ? 3 : 4.5}:1.`, page.id, el.id));
      }
      // Arabic typesetting.
      if (/[‎‏‪-‮⁦-⁩]/.test(el.text)) issues.push(issue('bidi.controls', 'warning', `«${el.name ?? el.id}» يحوي محارف تحكم اتجاه؛ المحرك يعزل النص المختلط بنفسه.`, page.id, el.id));
      if (/[؀-ۿ]\s*[,;?]/.test(el.text)) issues.push(issue('punct.ascii', 'warning', `«${el.name ?? el.id}»: استخدم ، ؛ ؟ بعد الكلمات العربية.`, page.id, el.id));
      if (/ـ/.test(el.text)) issues.push(issue('text.tatweel', 'warning', `«${el.name ?? el.id}» يحوي تطويلًا (ـ).`, page.id, el.id));
    }

    // Overlapping texts (two texts drawn over each other are unreadable).
    // A watermark — decoration text at 12% opacity or less, behind the
    // content (a style's ghost page number) — is not read and may sit under
    // text; anything more visible may not.
    const watermark = (el) => el.role === 'decor' && (el.opacity ?? 1) <= 0.12;
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (watermark(texts[i]) || watermark(texts[j])) continue;
        const a = texts[i].frame;
        const b = texts[j].frame;
        const inter = intersection(a, b);
        if (inter > 0.08 * Math.min(area(a), area(b))) {
          issues.push(issue('layout.overlap', 'error', `«${texts[i].name ?? texts[i].id}» يتداخل مع «${texts[j].name ?? texts[j].id}».`, page.id, texts[i].id));
        }
      }
    }

    for (const el of page.elements) {
      if (el.hidden) continue;
      if (el.role === 'art-placeholder') issues.push(issue('art.missing', 'error', `«${el.name ?? el.id}» ما زال مكانًا فارغًا: يحتاج رسمًا.`, page.id, el.id));
      if (el.kind !== 'image') continue;
      const asset = doc.assets?.[el.assetId];
      if (!asset) issues.push(issue('asset.missing', 'error', `الأصل ${el.assetId} غير موجود.`, page.id, el.id));
      else if (requireAssetData && !asset.dataUrl) issues.push(issue('asset.no-data', 'error', `الأصل ${el.assetId} بلا بيانات للعرض.`, page.id, el.id));
      else if (verifyAsset) {
        const v = verifyAsset(asset);
        if (!v.ok) issues.push(issue('asset.corrupt', 'error', `الأصل ${el.assetId}: ${v.reason}.`, page.id, el.id));
      }
    }

    // Digits: one numeral system across the copy (handles and URLs aside).
    const systems = new Set();
    for (const el of texts) {
      if (el.role === 'system' || /[@/.]/.test(el.text)) continue;
      if (/[٠-٩]/.test(el.text)) systems.add('arab');
      if (/[0-9]/.test(el.text.replace(/[A-Za-z]+\s*\d+|\d+\s*[A-Za-z%]+/g, ''))) systems.add('latn');
    }
    if (systems.size > 1) issues.push(issue('numbers.mixed', 'warning', `الصفحة ${n(pi + 1)} تخلط الأرقام العربية (١٢٣) والغربية (123). اختر نظامًا واحدًا.`, page.id));
  });

  // What a destination or OCR returned, compared with the approved text.
  if (readback) {
    for (const rb of readback.pages ?? []) {
      const page = doc.pages[rb.index] ?? doc.pages.find((p) => p.id === rb.pageId);
      if (!page) {
        issues.push(issue('readback.extra-page', 'error', `الوجهة فيها صفحة زائدة (${n((rb.index ?? 0) + 1)}).`));
        continue;
      }
      if (rb.width && rb.height && (Math.round(rb.width) !== page.widthPx || Math.round(rb.height) !== page.heightPx)) {
        issues.push(issue('readback.size', 'error', `مقاس الصفحة في الوجهة ${Math.round(rb.width)}×${Math.round(rb.height)} والمطلوب ${page.widthPx}×${page.heightPx}.`, page.id));
      }
      for (const t of rb.texts ?? []) {
        const el = page.elements.find((e) => e.id === t.elementId);
        if (!el) continue;
        for (const d of compareText(el.text, t.text)) issues.push(textDiffIssue(rb.source === 'ocr' ? 'ocr.changed' : 'readback.changed', d, page.id, el.id, doc.pages.indexOf(page), rb.source === 'ocr'));
      }
      const expectedTexts = visibleText(page).filter((e) => e.role !== 'system').length;
      const got = (rb.texts ?? []).length;
      if (rb.complete && got < expectedTexts) issues.push(issue('readback.missing-text', 'error', `الوجهة فيها ${n(got)} نصوص من ${n(expectedTexts)}.`, page.id));
    }
    if (readback.pageCount !== undefined && readback.pageCount !== doc.pages.length) {
      issues.push(issue('readback.page-count', 'error', `الوجهة فيها ${n(readback.pageCount)} صفحات والتصميم ${n(doc.pages.length)}.`));
    }
  }

  // Exported files must have the page's exact pixel size.
  for (const file of exported ?? []) {
    const page = doc.pages[file.index];
    const k = file.scale ?? 1;
    if (page && (file.width !== page.widthPx * k || file.height !== page.heightPx * k)) {
      issues.push(issue('export.size', 'error', `الملف ${file.name ?? n(file.index + 1)} مقاسه ${file.width}×${file.height} والمطلوب ${page.widthPx * k}×${page.heightPx * k}.`, page.id));
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  return { passed: errors === 0, errors, warnings: issues.length - errors, issues };
}

function slotElement(page, slot) {
  return page.elements.find((e) => e.slot === slot);
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (typeof v === 'string') out[prefix + k] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' && (out[`${prefix}${k}.${i}`] = x));
  }
  return out;
}

// OCR can misread, so its differences are warnings to review; a destination
// that re-typed the text (or a change in the approved source) is an error.
function textDiffIssue(code, d, pageId, elementId, pageIndex, fromOcr = false) {
  const label = DIFF_LABEL[d.kind] ?? d.kind;
  const what = d.expected && d.observed ? `«${d.expected}» صارت «${d.observed}»` : d.expected ? `«${d.expected}» ناقصة` : `«${d.observed}» زائدة`;
  return issue(`${code}.${d.kind}`, fromOcr ? 'warning' : 'error', `الصفحة ${n(pageIndex + 1)}: ${what} (${label})${fromOcr ? ' — قراءة OCR قد تخطئ، راجعها قبل التصحيح' : ''}.`, pageId, elementId);
}

export { numbersIn };
