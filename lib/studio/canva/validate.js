import { DIFF_LABEL, canonicalText, compareText } from '../arabic.js';
import { checkBrandText } from '../brandRules.js';
import { FORMATS } from '../contracts.js';
import { plainText } from '../measure.js';
import { pageTheme, resolveColor } from '../theme.js';
import { canvaAlign } from '../adapters/canva.js';
import { formatNumber } from '../../numerals.js';

// Arabic and layout checks after a transfer to Canva (build, import, edit):
// every approved text letter by letter (hamzas, marks, ة/ه, ى/ي, digits,
// punctuation, reversed words), presentation-form glyphs (text that was
// shaped and flattened), inserted direction marks, identity text rules,
// and the geometry Canva reports: clipped, overlapping, too close to the
// edge, inside a reel's interface zones, or grown past its box because
// Canva measured the text in another font.

const n = (x) => formatNumber(x, 'arab');
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/;
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩؜]/;
const MARGIN = 24;

const iou = (a, b) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

export function validateTransfer(doc, readback, { map = {}, brand = null, expectedPages } = {}) {
  const issues = [];
  const add = (code, severity, message, pageId, elementId) => issues.push({ code, severity, message, ...(pageId && { pageId }), ...(elementId && { elementId }) });
  const want = expectedPages ?? doc.pages.length;
  if (readback.pageCount !== undefined && readback.pageCount !== want) add('pages.count', 'error', `Canva فيه ${n(readback.pageCount)} صفحات والتصميم ${n(want)}.`);
  let compared = 0;
  let exact = 0;
  const repairs = [];

  for (const rp of readback.pages) {
    const page = doc.pages[rp.index];
    if (!page) {
      add('pages.extra', 'error', `صفحة زائدة في Canva (${n(rp.index + 1)}).`);
      continue;
    }
    if (rp.width && rp.height && (Math.round(rp.width) !== page.widthPx || Math.round(rp.height) !== page.heightPx)) {
      add('size.mismatch', 'error', `الصفحة ${n(rp.index + 1)} مقاسها ${Math.round(rp.width)}×${Math.round(rp.height)} والمطلوب ${page.widthPx}×${page.heightPx}.`, page.id);
    }
    const k = rp.width ? rp.width / page.widthPx : 1;
    const byLocator = new Map(rp.elements.map((e) => [e.locator, e]));
    const loose = rp.elements.filter((e) => typeof e.text === 'string').map((e) => ({ e, used: false }));
    const texts = page.elements.filter((e) => e.kind === 'text' && !e.hidden && plainText(e.text).trim());
    const placed = [];
    for (const el of texts) {
      let got = map[`${page.id}/${el.id}`] ? byLocator.get(map[`${page.id}/${el.id}`]) : null;
      if (got) loose.forEach((x) => x.e === got && (x.used = true));
      if (!got) {
        const sent = canonicalText(el.text);
        const exactMatch = loose.find((x) => !x.used && canonicalText(x.e.text) === sent);
        const pick =
          exactMatch ??
          loose
            .filter((x) => !x.used)
            .map((x) => ({ x, s: overlap(sent, canonicalText(x.e.text)) }))
            .sort((a, b) => b.s - a.s)
            .find((c) => c.s >= 0.3)?.x;
        if (pick) {
          pick.used = true;
          got = pick.e;
        }
      }
      if (!got || typeof got.text !== 'string') {
        add('text.missing', 'error', `الصفحة ${n(rp.index + 1)}: «${plainText(el.text).slice(0, 40)}» غير موجود في Canva.`, page.id, el.id);
        continue;
      }
      compared++;
      const diffs = compareText(el.text, got.text);
      if (!diffs.length) exact++;
      for (const d of diffs) {
        const what = d.expected && d.observed ? `«${d.expected}» صارت «${d.observed}»` : d.expected ? `«${d.expected}» ناقصة` : `«${d.observed}» زائدة`;
        add(`text.${d.kind}`, 'error', `الصفحة ${n(rp.index + 1)}: ${what} (${DIFF_LABEL[d.kind] ?? d.kind}).`, page.id, el.id);
      }
      if (PRESENTATION_FORMS.test(got.text)) add('text.presentation-forms', 'warning', `«${el.name ?? el.id}» محفوظ بأشكال حروف جاهزة (Presentation Forms): قد يكون النص مسطّحًا ويصعب تحريره أو البحث فيه.`, page.id, el.id);
      if (BIDI_MARKS.test(got.text) && !BIDI_MARKS.test(el.text)) add('text.bidi-marks', 'warning', `«${el.name ?? el.id}» صار يحوي محارف تحكم اتجاه لم تكن في النص المعتمد.`, page.id, el.id);
      for (const v of checkBrandText(got.text, brand)) {
        add(`brand.${v.rule}`, el.slot ? 'warning' : 'error', v.rule === 'no-latin-words' ? `«${el.name ?? el.id}» في Canva فيه كلمات إنجليزية: ${v.words.join('، ')}.` : `«${el.name ?? el.id}» في Canva بأرقام مشرقية والهوية تستخدم 0-9.`, page.id, el.id);
      }
      // Format as Canva holds it (the read-back carries size, colour and
      // alignment); each mismatch comes with the format_text that fixes it.
      const fix = {};
      if (typeof got.fontSize === 'number') {
        const want = Math.round(el.style.fontSize * k);
        if (Math.abs(got.fontSize - want) > 1) {
          add('format.size', 'error', `«${el.name ?? el.id}» بحجم ${Math.round(got.fontSize)} في Canva والمطلوب ${want}.`, page.id, el.id);
          fix.font_size = want;
        }
      }
      if (typeof got.color === 'string') {
        const want = resolveColor(el.style.color, pageTheme(doc, page).colors).toUpperCase();
        if (got.color.toUpperCase() !== want) {
          add('format.color', 'warning', `«${el.name ?? el.id}» بلون ${got.color} في Canva والمطلوب ${want}.`, page.id, el.id);
          fix.color = want;
        }
      }
      if (typeof got.align === 'string') {
        const want = canvaAlign(el);
        if (got.align !== want) {
          add('format.align', 'error', `«${el.name ?? el.id}» بمحاذاة ${got.align} في Canva والمطلوب ${want} (اتجاه «${plainText(el.text).slice(0, 20)}» يختلف عن اتجاه الصفحة).`, page.id, el.id);
          fix.text_align = want;
        }
      }
      if (Object.keys(fix).length && got.locator) repairs.push({ pageIndex: rp.index + 1, op: { type: 'format_text', locator_id: got.locator, formatting: fix } });
      if (got.frame) {
        placed.push({ el, frame: got.frame });
        // Canva measured the text in its own font: if it grew well past the
        // box we laid out, it may now run into what is below.
        const expectedH = el.frame.height * k;
        if (got.frame.height > expectedH * 1.2 + 4) add('text.grew', 'warning', `«${el.name ?? el.id}» أطول في Canva (${Math.round(got.frame.height)} بكسل بدل ${Math.round(expectedH)}): خط Canva أعرض من خط التصميم؛ راجع التداخل.`, page.id, el.id);
      }
    }
    // Geometry of what Canva holds.
    const W = rp.width ?? page.widthPx;
    const H = rp.height ?? page.heightPx;
    const story = FORMATS.story;
    for (const { el, frame: f } of placed) {
      if (f.x < -1 || f.y < -1 || f.x + f.width > W + 1 || f.y + f.height > H + 1) add('layout.clipped', 'error', `«${el.name ?? el.id}» يخرج عن حدود الصفحة في Canva وسيُقص.`, page.id, el.id);
      else if (el.role !== 'system' && (f.x < MARGIN || f.x + f.width > W - MARGIN)) add('layout.margin', 'warning', `«${el.name ?? el.id}» أقرب من ${n(MARGIN)} بكسل إلى حافة الصفحة.`, page.id, el.id);
      if (H / W > 1.7 && el.role !== 'system' && (f.y < story.inset.top * (H / story.height) || f.y + f.height > H - story.inset.bottom * (H / story.height))) {
        add('layout.reel-zone', 'warning', `«${el.name ?? el.id}» داخل منطقة تغطيها واجهة الريلز/القصص (أعلى ${n(story.inset.top)} أو أسفل ${n(story.inset.bottom)} بكسل).`, page.id, el.id);
      }
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i].frame;
        const b = placed[j].frame;
        if (iou(a, b) > 0.08 * Math.min(a.width * a.height, b.width * b.height)) add('layout.overlap', 'error', `«${placed[i].el.name ?? placed[i].el.id}» يتداخل مع «${placed[j].el.name ?? placed[j].el.id}» في Canva.`, page.id, placed[i].el.id);
      }
    }
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  const byPage = new Map();
  for (const r of repairs) byPage.set(r.pageIndex, [...(byPage.get(r.pageIndex) ?? []), r.op]);
  const repair = [...byPage.entries()].map(([pageIndex, operations]) => ({ tool: 'edit-design', args: { transaction_id: readback.transactionId ?? '$transactionId', page_index: pageIndex, finalize: 'keep_open', operations } }));
  return { passed: errors === 0, errors, warnings: issues.length - errors, texts: { compared, exact }, issues, repair };
}

function overlap(a, b) {
  const A = new Set(a.split(' '));
  const B = b.split(' ');
  return B.filter((w) => A.has(w)).length / Math.max(1, A.size);
}
