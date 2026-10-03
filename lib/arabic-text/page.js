import { buildRuns, paragraphsOf, wordsOf } from './runs.js';
import { arabicTextHtml } from './html.js';
import { normalizeSpec, validateSpec } from './spec.js';

// Runs inside a browser page (Chromium): the Node typesetter injects it with
// Playwright, the editor and the video engine call it on their own DOM. One
// measuring code for preview, export and video, in the engine that draws.

export const PAGE_VERSION = 1;

const unquote = (s) => String(s).replace(/^["']|["']$/g, '');
const weightRange = (w) => {
  const [a, b] = String(w).trim().split(/\s+/).map(Number);
  return [a, Number.isFinite(b) ? b : a];
};

function parseRanges(unicodeRange) {
  return String(unicodeRange || 'U+0-10FFFF')
    .split(',')
    .map((r) => r.trim().replace(/^U\+/i, ''))
    .map((r) => {
      if (r.includes('?')) return [parseInt(r.replace(/\?/g, '0'), 16), parseInt(r.replace(/\?/g, 'F'), 16)];
      const [a, b] = r.split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)];
    });
}
const covers = (ranges, ch) => {
  const cp = ch.codePointAt(0);
  return ranges.some(([a, b]) => cp >= a && cp <= b);
};

/**
 * Loads the requested family and weight for the given text and reports,
 * never substitutes: font.missing (family not declared), font.weight-
 * unavailable (no face with that weight), font.load-failed (a file did not
 * load), and characters no face of the family covers (they would come from
 * a fallback font).
 */
export async function prepareFont(doc, font, text = '') {
  const style = font.style ?? 'normal';
  const faces = [...doc.fonts].filter((f) => unquote(f.family) === font.family && f.style === style);
  if (!faces.length) return { ok: false, code: 'font.missing', message: `الخط «${font.family}» غير مُعلَن في هذه الصفحة: لا يُستبدل بغيره.` };
  const available = [...new Set(faces.map((f) => weightRange(f.weight)[0]))].sort((a, b) => a - b);
  const exact = faces.filter((f) => {
    const [a, b] = weightRange(f.weight);
    return font.weight >= a && font.weight <= b;
  });
  if (!exact.length) return { ok: false, code: 'font.weight-unavailable', available, message: `الوزن ${font.weight} غير متوفر لخط ${font.family}؛ المتوفر: ${available.join('، ')}. لا يُركَّب وزن صناعي.` };
  const sample = text.replace(/\s+/g, '') || 'ا';
  try {
    await doc.fonts.load(`${style} ${font.weight} 64px "${font.family}"`, sample);
  } catch (e) {
    return { ok: false, code: 'font.load-failed', message: `تعذّر تحميل ملف خط ${font.family} ${font.weight}: ${e?.message ?? e}` };
  }
  const chars = [...new Set([...sample])];
  const needed = exact.filter((f) => chars.some((ch) => covers(parseRanges(f.unicodeRange), ch)));
  const failed = needed.filter((f) => f.status === 'error');
  if (failed.length) return { ok: false, code: 'font.load-failed', message: `تعذّر تحميل ${failed.length} من ملفات خط ${font.family} ${font.weight}.` };
  if (needed.some((f) => f.status !== 'loaded')) await doc.fonts.ready;
  if (needed.some((f) => f.status !== 'loaded')) return { ok: false, code: 'font.not-ready', message: `ملفات خط ${font.family} ${font.weight} لم تكتمل بعد.` };
  // Characters that no face of the family covers, then the ones that still
  // render from a fallback (same width under two different generic
  // fallbacks means the family drew them).
  const uncovered = chars.filter((ch) => !/\p{M}/u.test(ch) && !exact.some((f) => covers(parseRanges(f.unicodeRange), ch)));
  const ctx = doc.createElement('canvas').getContext('2d');
  const width = (ch, generic) => {
    ctx.font = `${style} ${font.weight} 100px "${font.family}", ${generic}`;
    return ctx.measureText(ch).width;
  };
  const fallback = chars.filter((ch) => !/\p{M}/u.test(ch) && Math.abs(width(ch, 'monospace') - width(ch, 'serif')) > 0.01);
  return { ok: true, faces: needed.length, available, uncovered, fallback };
}

// The paragraph's text as the DOM holds it, with each character's node and
// offset (a <br> is "\n"). Markup adds no character, so this must equal the
// stored text exactly.
export function textMap(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 1 | 4); // elements and text
  const pieces = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      pieces.push({ node: n, start: text.length, end: text.length + n.data.length });
      text += n.data;
    } else if (n.nodeName === 'BR') {
      text += '\n';
    }
  }
  const at = (i, preferEnd) => {
    const p = pieces.find((x) => (preferEnd ? i > x.start && i <= x.end : i >= x.start && i < x.end)) ?? pieces[pieces.length - 1];
    return { node: p.node, offset: Math.max(0, Math.min(p.node.data.length, i - p.start)) };
  };
  const range = (start, end) => {
    const r = doc.createRange();
    const a = at(start, false);
    const b = at(end, true);
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  };
  return { text, range, pieces };
}

const union = (rs) => {
  const xs = rs.filter(Boolean);
  if (!xs.length) return null;
  const x = Math.min(...xs.map((r) => r.x));
  const y = Math.min(...xs.map((r) => r.y));
  return { x, y, width: Math.max(...xs.map((r) => r.x + r.width)) - x, height: Math.max(...xs.map((r) => r.y + r.height)) - y };
};
const round = (r) => r && { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

/**
 * Lines, words and ink of a laid-out paragraph, in px relative to `origin`
 * (the text box), from the engine's own layout: DOM ranges for positions,
 * the same font in canvas for ink (glyph extents beyond the line box:
 * marks above and below, swashes).
 */
export function measureParagraph(p, origin = p, { spans = [] } = {}) {
  const doc = p.ownerDocument;
  const cs = doc.defaultView.getComputedStyle(p);
  const fontSize = parseFloat(cs.fontSize);
  const lineHeightPx = parseFloat(cs.lineHeight) || fontSize * 1.2;
  const O = origin.getBoundingClientRect();
  const k = origin.offsetWidth ? origin.offsetWidth / O.width : 1; // undo preview scaling
  const rel = (r) => ({ x: (r.left - O.left) * k, y: (r.top - O.top) * k, width: r.width * k, height: r.height * k });
  const map = textMap(p);
  const ctx = doc.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
  const fm = ctx.measureText('ا');
  const ascent = fm.fontBoundingBoxAscent;
  const descent = fm.fontBoundingBoxDescent;
  const P = rel(p.getBoundingClientRect());

  const words = wordsOf(map.text).map((w) => {
    const rects = [...map.range(w.start, w.end).getClientRects()].map(rel).filter((r) => r.width > 0.01);
    const box = union(rects);
    ctx.direction = ARABIC.test(w.text) ? 'rtl' : 'ltr';
    ctx.textAlign = 'left';
    const m = ctx.measureText(w.text);
    // DOM text rects span the font's content area: its top is the line's
    // ascent line, so the baseline is top + ascent.
    const baseline = box ? box.y + ascent : 0;
    const ink = box && {
      x: box.x - m.actualBoundingBoxLeft,
      y: baseline - m.actualBoundingBoxAscent,
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    };
    // Pieces: distinct lines the word's boxes sit on (a word split by a mark
    // span is several boxes on one line, which is fine).
    const pieces = new Set(rects.map((r) => Math.round(r.y / (lineHeightPx / 2)))).size;
    return { index: w.index, start: w.start, end: w.end, text: w.text, rtl: ARABIC.test(w.text), box: round(box), pieces, ink: round(ink), baseline: +baseline.toFixed(2), advance: +m.width.toFixed(2) };
  });

  // Lines: words grouped by their content-area top (one font per paragraph,
  // so every word of a line shares it).
  const tops = [];
  for (const w of words) {
    if (!w.box) continue;
    let line = tops.findIndex((t) => Math.abs(t - w.box.y) < lineHeightPx / 2);
    if (line < 0) {
      tops.push(w.box.y);
      line = tops.length - 1;
    }
    w.lineTop = tops[line];
  }
  const order = [...tops].sort((a, b) => a - b);
  for (const w of words) w.line = w.box ? order.indexOf(w.lineTop) : -1;
  const half = (lineHeightPx - (ascent + descent)) / 2;
  const lines = order.map((top, i) => {
    const ws = words.filter((w) => w.line === i);
    const content = union(ws.map((w) => w.box));
    return {
      index: i,
      start: Math.min(...ws.map((w) => w.start)),
      end: Math.max(...ws.map((w) => w.end)),
      words: ws.map((w) => w.index),
      box: round({ x: P.x, y: top - half, width: P.width, height: lineHeightPx }),
      content: round(content),
      baseline: +(top + ascent).toFixed(2),
      ink: round(union(ws.map((w) => w.ink))),
    };
  });
  for (const w of words) delete w.lineTop;
  // Marked ranges (accent, highlight) as drawn: one rect per line, so a
  // band drawn by the motion layer covers exactly what the static band
  // covers (the marked letters, not the whole words around them).
  const marks = spans
    .filter((s) => s.mark)
    .map((s) => {
      const rects = [...map.range(s.start, s.end).getClientRects()].map(rel).filter((r) => r.width > 0.01);
      const perLine = order.map((top, i) => union(rects.filter((r) => Math.abs(r.y - top) < lineHeightPx / 2))).map((r, i) => r && { line: i, ...round(r) }).filter(Boolean);
      return { start: s.start, end: s.end, mark: s.mark, rects: perLine };
    });
  return {
    marks,
    text: map.text,
    fontSize,
    lineHeightPx,
    ascent: +ascent.toFixed(2),
    descent: +descent.toFixed(2),
    paragraph: round(P),
    lines,
    words,
    ink: round(union(words.map((w) => w.ink))),
  };
}

// Joining check over the whole paragraph: the same text with a zero-width
// non-joiner between letters (isolated forms) must measure differently. If
// it does not, the letters were drawn unjoined (a font without Arabic
// shaping, a broken pipeline).
export function joiningHolds(p) {
  const doc = p.ownerDocument;
  const text = textMap(p).text.replace(/\n/g, ' ');
  if (!ARABIC.test(text)) return { checked: false };
  const probe = doc.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${doc.defaultView.getComputedStyle(p).font};letter-spacing:0`;
  doc.body.append(probe);
  probe.textContent = text;
  const joined = probe.getBoundingClientRect().width;
  probe.textContent = [...text].map((ch, i, a) => (i && ARABIC.test(ch) && !/\p{M}/u.test(ch) && ARABIC.test(a[i - 1]) ? `‌${ch}` : ch)).join('');
  const isolated = probe.getBoundingClientRect().width;
  probe.remove();
  return { checked: true, joined: +joined.toFixed(2), isolated: +isolated.toFixed(2), holds: Math.abs(joined - isolated) > 0.5 };
}

/**
 * Typesets a spec in this document: builds the box, loads and checks the
 * font, lays out, measures, checks overflow and quality. With fit "shrink"
 * it may step the size down to minFontSize, never below; it never edits the
 * text. Returns plain data (serializable) and leaves the box in the page
 * (host) for a raster.
 */
export async function typesetSpec(doc, input, { host = doc.body, id = 'at', marks = 'static', suggestWidthUpTo = null } = {}) {
  const { spec, errors, warnings } = validateSpec(input);
  if (errors.length) return { ok: false, errors, warnings };
  const font = await prepareFont(doc, spec.font, spec.text);
  if (!font.ok) return { ok: false, errors: [{ code: font.code, message: font.message, ...(font.available && { available: font.available }) }], warnings };
  if (font.uncovered.length || font.fallback.length) {
    warnings.push({ code: 'font.fallback-glyphs', message: `حروف لا يغطيها خط ${spec.font.family} وستُرسم بخط بديل: ${[...new Set([...font.uncovered, ...font.fallback])].join(' ')}`, chars: [...new Set([...font.uncovered, ...font.fallback])] });
  }

  const wrap = doc.createElement('div');
  wrap.dataset.atLayer = id;
  wrap.style.cssText = 'position:absolute;left:0;top:0;';
  host.append(wrap);
  const pad = spec.padding;
  const contentW = spec.width - pad.left - pad.right;
  const contentH = spec.maxHeight === null ? Infinity : spec.maxHeight - pad.top - pad.bottom;
  const render = (size) => {
    wrap.innerHTML = arabicTextHtml(spec, { marks, fontSize: size, id });
    return { box: wrap.firstElementChild, p: wrap.querySelector('[data-at-p]') };
  };
  const overflowOf = (p) => {
    const m = measureParagraph(p, p, { spans: spec.spans });
    const tooWide = m.words.filter((w) => w.box && w.box.width > contentW + 0.5);
    return { m, tooWide, height: p.getBoundingClientRect().height, wide: tooWide.length > 0, tall: p.getBoundingClientRect().height > contentH + 0.5 };
  };

  let size = spec.fontSize;
  let { box, p } = render(size);
  let o = overflowOf(p);
  if ((o.wide || o.tall) && spec.fit === 'shrink') {
    for (let s = spec.fontSize - 1; s >= spec.minFontSize; s--) {
      ({ box, p } = render(s));
      o = overflowOf(p);
      size = s;
      if (!o.wide && !o.tall) break;
    }
    if (size !== spec.fontSize && !o.wide && !o.tall) warnings.push({ code: 'fit.shrunk', message: `صُغّر النص من ${spec.fontSize} إلى ${size} بكسل (الحد المعتمد ${spec.minFontSize}).`, from: spec.fontSize, to: size });
  }

  if (o.wide || o.tall) {
    // Suggestions are made at the approved size: widen, heighten or split.
    if (size !== spec.fontSize) {
      ({ box, p } = render(spec.fontSize));
      o = overflowOf(p);
      size = spec.fontSize;
    }
    const needH = Math.ceil(o.height + pad.top + pad.bottom);
    const suggestions = [];
    if (o.wide) suggestions.push({ kind: 'expand-width', to: Math.ceil(Math.max(...o.tooWide.map((w) => w.box.width)) + pad.left + pad.right + 1), why: 'كلمة أعرض من الصندوق' });
    if (o.tall) {
      suggestions.push({ kind: 'expand-height', to: needH });
      const limit = suggestWidthUpTo ?? Math.round(spec.width * 1.6);
      let lo = spec.width;
      let hi = limit;
      p.style.width = `${hi - pad.left - pad.right}px`;
      if (p.getBoundingClientRect().height <= contentH + 0.5) {
        while (hi - lo > 2) {
          const mid = Math.round((lo + hi) / 2);
          p.style.width = `${mid - pad.left - pad.right}px`;
          if (p.getBoundingClientRect().height <= contentH + 0.5) hi = mid;
          else lo = mid;
        }
        suggestions.push({ kind: 'expand-width', to: hi });
      }
      p.style.width = '';
      const maxLines = Math.max(1, Math.floor(contentH / o.m.lineHeightPx));
      const cut = o.m.words.find((w) => w.line >= maxLines);
      if (cut) suggestions.push({ kind: 'split', atIndex: cut.start, afterLine: maxLines, why: `يتسع الصندوق لـ ${maxLines} من الأسطر؛ انقل ما يبدأ من «${cut.text}» إلى صندوق أو شريحة تالية` });
    }
    errors.push({ code: o.wide ? 'overflow.width' : 'overflow.height', message: o.wide ? 'كلمة أعرض من الصندوق: لا تُكسر الكلمة العربية ولا يُصغَّر النص تحت الحد.' : `النص يحتاج ${needH} بكسل والصندوق ${spec.maxHeight}: لا يُصغَّر تحت الحد ولا يُعاد صياغته تلقائيًا.`, needed: { width: o.wide ? suggestions[0].to : spec.width, height: needH }, suggestions });
  }

  const m = measureParagraph(p, box, { spans: spec.spans });
  if (m.text !== spec.text) errors.push({ code: 'text.mismatch', message: 'النص في الصفحة يختلف عن النص المخزّن.', dom: m.text, stored: spec.text });
  const joining = joiningHolds(p);
  if (joining.checked && !joining.holds) errors.push({ code: 'shaping.not-joined', message: 'الحروف العربية لم تتصل: العرض نفسه بفاصل منع الاتصال وبدونه.', ...joining });
  if (m.words.some((w) => w.pieces > 1 && w.rtl)) warnings.push({ code: 'layout.split-word', message: 'كلمة رُسمت في أكثر من قطعة.', words: m.words.filter((w) => w.pieces > 1).map((w) => w.text) });
  // A paragraph of three words or more whose last line is a lone word.
  for (const para of paragraphsOf(spec.text)) {
    const ws = m.words.filter((w) => w.start >= para.start && w.end <= para.end);
    if (ws.length < 3) continue;
    const last = Math.max(...ws.map((w) => w.line));
    const onLast = ws.filter((w) => w.line === last);
    if (onLast.length === 1 && ws.some((w) => w.line < last)) warnings.push({ code: 'text.lone-word', message: `سطر ينتهي بكلمة واحدة («${onLast[0].text}»): غيّر العرض أو اقسم السطور بنفسك.`, word: onLast[0].index });
  }
  if (spec.maxLines && m.lines.length > spec.maxLines) warnings.push({ code: 'text.too-many-lines', message: `${m.lines.length} أسطر والحد ${spec.maxLines}.`, lines: m.lines.length });

  const B = box.getBoundingClientRect();
  const boxRect = { x: 0, y: 0, width: +B.width.toFixed(2), height: +B.height.toFixed(2) };
  // Ink beyond the box: marks above the first line, below the last, overhangs.
  const inkOverflow = m.ink
    ? { top: Math.max(0, -m.ink.y), left: Math.max(0, -m.ink.x), right: Math.max(0, m.ink.x + m.ink.width - boxRect.width), bottom: Math.max(0, m.ink.y + m.ink.height - boxRect.height) }
    : { top: 0, left: 0, right: 0, bottom: 0 };
  // The layer (raster) keeps room for that ink plus a margin for marks the
  // estimate misses and for a band drawn a little wider than the words.
  const margin = Math.ceil(size * 0.25);
  const safe = Object.fromEntries(Object.entries(inkOverflow).map(([k, v]) => [k, Math.ceil(v) + margin]));
  wrap.style.padding = `${safe.top}px ${safe.right}px ${safe.bottom}px ${safe.left}px`;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    layout: {
      version: PAGE_VERSION,
      fontSize: size,
      direction: spec.direction,
      align: spec.align,
      box: boxRect,
      content: { x: pad.left, y: pad.top, width: contentW, height: +m.paragraph.height.toFixed(2) },
      layer: { x: -safe.left, y: -safe.top, width: boxRect.width + safe.left + safe.right, height: boxRect.height + safe.top + safe.bottom },
      lineHeightPx: m.lineHeightPx,
      ascent: m.ascent,
      descent: m.descent,
      lines: m.lines,
      words: m.words,
      marks: m.marks,
      ink: m.ink,
      inkOverflow: Object.fromEntries(Object.entries(inkOverflow).map(([k, v]) => [k, +v.toFixed(2)])),
      joining,
      bidi: (({ source, isolates }) => ({ source, isolates }))(buildRuns(spec)),
    },
    font: { family: spec.font.family, weight: spec.font.weight, available: font.available },
  };
}

// Measures a box already in a page (editor, video capture): any element
// holding a [data-at-p] paragraph, positions relative to `origin`.
export function measureBox(boxEl, origin = boxEl) {
  const p = boxEl.matches('[data-at-p]') ? boxEl : boxEl.querySelector('[data-at-p]') ?? boxEl;
  return measureParagraph(p, origin);
}

export { normalizeSpec };
