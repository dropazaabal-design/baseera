import { FONTS } from '../fonts.js';
import { formatNumber } from '../numerals.js';
import { estimateMeasure, plainText, textWidth, wrapLines } from './measure.js';
import { ICONS, STROKED, mirrorPath } from './paths.js';
import { resolveFont } from './theme.js';
import { round } from './util.js';

// Layout engine: a composition describes a vertical stack of blocks (title,
// list, art, pills…) with a preferred and a minimum size each. The solver
// places them in the content region, and when the content does not fit it
// redistributes instead of shrinking text past readability (see reflow.js).

// Readability floors in page px at 1080 wide. On a phone feed (~390 pt wide)
// 32 px renders at ~11.5 pt and 56 px at ~20 pt.
export const FLOOR = { title: 56, heading: 44, body: 32, label: 26 };

export const MARGIN = 96;

export function contentRegion(format, { topChrome = true, bottomChrome = true, margin = MARGIN } = {}) {
  const top = format.inset.top + (topChrome ? 170 : 120);
  const bottom = format.inset.bottom + (bottomChrome ? 190 : 120);
  return { x: margin, y: top, width: format.width - margin * 2, height: format.height - top - bottom };
}

const weightOf = (font, role) => FONTS[font]?.weights[role] ?? { regular: 400, bold: 700, black: 800 }[role];

export const sizeAt = ([pref, min], s) => Math.max(min, Math.round(pref * s));

function textStyle(ctx, { font = '@body', weightRole = 'regular', size, lineHeight }) {
  const fontId = resolveFont(font, ctx.theme.fonts);
  return { font: fontId, weight: weightOf(fontId, weightRole), size, lineHeight };
}

const measureText = (ctx, text, style, width) => (ctx.measure ?? estimateMeasure)(text, style, width);

// x of a box of width w aligned to the inline start of `box` (right in RTL).
const startX = (box, w, ctx) => (ctx.rtl === false ? box.x : box.x + box.width - w);
const endX = (box, w, ctx) => (ctx.rtl === false ? box.x + box.width - w : box.x);
const alignedX = (box, w, align, ctx) => (align === 'center' ? box.x + (box.width - w) / 2 : align === 'end' ? endX(box, w, ctx) : startX(box, w, ctx));

const frame = (x, y, width, height) => ({ x: round(x, 1), y: round(y, 1), width: round(Math.max(1, width), 1), height: round(Math.max(1, height), 1) });

// Style treatment (lib/studio/styles.js). Without a style every block keeps
// its classic look: each accessor returns the classic value as default.
const treat = (ctx) => ctx.style?.treatment ?? {};
const cornerOf = (value, auto) => (value === undefined || value === null || value === 'auto' ? auto : value === 'full' ? auto : Number(value));

// Styles that mark words with a marker band (treatment.accentMode
// "highlight") draw *marked* words on it, in the text's own colour; texts
// already in the accent colour or on an accent fill keep the classic look.
const markerOf = (ctx, text, color, role) => {
  const t = ctx.style?.treatment;
  if (t?.accentMode !== 'highlight' || role === 'system' || !String(text ?? '').includes('*')) return null;
  return color === '@accent' || color === '@onAccent' ? null : t.highlightFill ?? '@highlight';
};

export function textElement(id, f, text, ctx, { font = '@body', weightRole = 'regular', size, min, lineHeight, color = '@text', align = 'start', nowrap = false, marker = true, ...extra }) {
  const fontId = resolveFont(font, ctx.theme.fonts);
  // A text on a tinted box keeps the accent colour: a band of the same tint
  // would not show.
  const highlight = marker ? markerOf(ctx, text, color, extra.role) : null;
  return {
    id,
    kind: 'text',
    frame: f,
    z: 0,
    locked: false,
    text,
    style: {
      fontFamily: font,
      fontSize: size,
      minFontSize: Math.min(size, min ?? size),
      color,
      weight: weightOf(fontId, weightRole),
      direction: ctx.rtl === false ? 'ltr' : 'rtl',
      align,
      lineHeight,
      ...(nowrap && { nowrap: true }),
      ...(highlight && { highlight }),
    },
    ...extra,
  };
}

export const shapeElement = (id, f, shape, fill, extra = {}) => ({ id, kind: 'shape', frame: f, z: 0, locked: false, shape, fill, ...extra });
export const imageElement = (id, f, assetId, alt, extra = {}) => ({ id, kind: 'image', frame: f, z: 0, locked: false, assetId, alt, fit: 'contain', ...extra });

export function iconElement(id, f, name, color, ctx, { directional = false, ...extra } = {}) {
  const stroked = STROKED.has(name);
  const d = directional && ctx.rtl !== false ? mirrorPath(ICONS[name], 24) : ICONS[name];
  return shapeElement(id, f, 'path', stroked ? 'none' : color, {
    path: d,
    viewBox: [24, 24],
    ...(stroked && { stroke: color, strokeWidth: extra.strokeWidth ?? 2.4 }),
    ...extra,
  });
}

// Image frame that keeps the asset's aspect ratio inside a box.
function containFrame(box, asset, align, ctx) {
  if (!asset?.widthPx || !asset?.heightPx) return frame(box.x, box.y, box.width, box.height);
  const k = Math.min(box.width / asset.widthPx, box.height / asset.heightPx);
  const w = asset.widthPx * k;
  const h = asset.heightPx * k;
  return frame(alignedX(box, w, align ?? 'center', ctx), box.y + (box.height - h) / 2, w, h);
}

// ---------------------------------------------------------------------------
// Blocks. Each has height(block, width, s, ctx) and emit(block, box, s, ctx).
// `s` scales every preferred size; sizes never drop below their minimum.

const pillMetrics = (b, s, ctx, maxWidth) => {
  const size = sizeAt(b.size, s);
  const style = textStyle(ctx, { font: b.font, weightRole: b.weightRole ?? 'bold', size, lineHeight: 1.4 });
  const padX = size * (b.padX ?? 0.9);
  const padY = size * (b.padY ?? 0.35);
  const icon = b.icon ? size * 1.05 : 0;
  const iconGap = b.icon ? size * 0.4 : 0;
  // Labels are measured with 8% slack: they must stay on one line even
  // where the estimate runs short of the real glyphs.
  const natural = labelWidth(b.text, style);
  const inner = Math.min(natural, maxWidth - padX * 2 - icon - iconGap);
  const m = measureText(ctx, b.text, style, inner);
  return { size, style, padX, padY, icon, iconGap, textW: inner, textH: m.height, w: inner + padX * 2 + icon + iconGap, h: m.height + padY * 2, oneLine: natural === inner };
};

export const labelWidth = (text, style) => Math.ceil(textWidth(text, style) * 1.08 + 2);

function emitPill(b, box, s, ctx, at) {
  const p = pillMetrics(b, s, ctx, box.width);
  const x = at?.x ?? alignedX(box, p.w, b.align ?? 'start', ctx);
  const y = at?.y ?? box.y;
  const t = treat(ctx);
  const outline = !b.fill && t.pillFill === 'outline';
  const fill = b.fill ?? (outline ? 'none' : t.pillFill ?? '@accent');
  const radius = t.pillRadius === undefined || t.pillRadius === 'full' ? round(p.h / 2, 1) : Number(t.pillRadius);
  const onPill = b.color ?? (outline ? '@accent' : t.pillText ?? (t.pillFill === '@text' ? '@bg' : '@onAccent'));
  const els = [
    shapeElement(`${b.id}-bg`, frame(x, y, p.w, p.h), 'rect', fill, { radius, ...(outline && { stroke: '@accent', strokeWidth: 3 }), role: 'decor', name: `خلفية ${b.name ?? ''}`.trim(), anim: b.anim }),
  ];
  // RTL: text at the start (right), icon after it toward the end (left).
  const textX = ctx.rtl === false ? x + p.padX : x + p.w - p.padX - p.textW;
  els.push(
    textElement(b.id, frame(textX, y + p.padY, p.textW, p.textH), b.text, ctx, {
      font: b.font,
      weightRole: b.weightRole ?? 'bold',
      size: p.size,
      min: b.size[1],
      lineHeight: 1.4,
      color: onPill,
      align: 'center',
      nowrap: p.oneLine,
      role: b.role ?? 'label',
      slot: b.slot,
      name: b.name,
      anim: b.anim,
    }),
  );
  if (b.icon) {
    const iconX = ctx.rtl === false ? x + p.w - p.padX - p.icon : x + p.padX;
    els.push(iconElement(`${b.id}-icon`, frame(iconX, y + (p.h - p.icon) / 2, p.icon, p.icon), b.icon, onPill, ctx, { directional: b.iconDirectional, role: 'decor', name: 'أيقونة', anim: b.anim }));
  }
  return { elements: els, width: p.w, height: p.h };
}

function listItemMetrics(b, item, width, s, ctx) {
  const size = sizeAt(b.size, s);
  const style = textStyle(ctx, { font: b.font, weightRole: b.weightRole ?? 'regular', size, lineHeight: b.lineHeight ?? 1.6 });
  const padX = b.card ? size * 0.85 : 0;
  const padY = b.card ? size * 0.65 : 0;
  const badge = b.badge === 'art' ? size * 2.6 : b.badge === 'number' ? size * 1.9 : b.badge === 'none' ? 0 : size * 1.15;
  const gap = b.badge === 'none' ? 0 : size * (b.badge === 'art' ? 0.6 : 0.7);
  const textW = Math.max(40, width - padX * 2 - badge - gap);
  const m = measureText(ctx, item, style, textW);
  const inner = Math.max(m.height, b.badge === 'art' || b.badge === 'number' ? badge : 0);
  return { size, style, padX, padY, badge, gap, textW, textH: m.height, lineW: m.width ?? textW, h: inner + padY * 2, clipped: m.clipped };
}

function listRows(b, width, s, ctx) {
  const cols = b.columns ?? 1;
  const colGap = sizeAt(b.size, s) * 0.6;
  const colW = (width - colGap * (cols - 1)) / cols;
  const items = b.items.map((item) => listItemMetrics(b, item, colW, s, ctx));
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);
    rows.push({ start: i, h: Math.max(...row.map((m) => m.h)), items: row });
  }
  const gap = sizeAt(b.size, s) * (b.itemGap ?? 0.5);
  return { rows, colW, colGap, gap, total: rows.reduce((t, r) => t + r.h, 0) + gap * Math.max(0, rows.length - 1) };
}

// The card behind a list item or tile, drawn by the style's treatment:
// fill (default), outline, accent bar on the reading-start edge, or no card
// and a hairline under the item.
function cardShapes(id, cell, size, ctx, name, anim, fill) {
  const t = treat(ctx);
  const mode = t.cardMode ?? 'fill';
  if (mode === 'rule') return [shapeElement(`${id}-card`, frame(cell.x, cell.y + cell.height - 3, cell.width, 3), 'rect', '@muted', { opacity: 0.35, role: 'decor', name: `فاصل ${name}`, anim })];
  const cr = cornerOf(t.cardRadius, Math.round(size * 0.65));
  const els = [shapeElement(`${id}-card`, frame(cell.x, cell.y, cell.width, cell.height), 'rect', mode === 'outline' ? 'none' : fill ?? t.cardFill ?? '@surface', { radius: cr, ...(mode === 'outline' && { stroke: t.cardStroke ?? '@muted', strokeWidth: t.cardStrokeWidth ?? 2 }), role: 'decor', name: `بطاقة ${name}`, anim })];
  if (mode === 'accent-bar') {
    // A short accent on the card's reading-start edge (top third).
    const bw = 8;
    els.push(shapeElement(`${id}-accent`, frame(ctx.rtl === false ? cell.x : cell.x + cell.width - bw, cell.y, bw, Math.max(24, cell.height * 0.32)), 'rect', '@accent', { role: 'decor', name: `علامة ${name}`, anim }));
  }
  return els;
}

// Tiles of a framework: each part has a name (heads) and a short
// explanation (bodies), in a grid (columns 2; a short last row takes the
// full width) or a chain (columns 1, joined by a line on the reading-start
// side). The number sits on the name's line; the explanation runs the
// full width of the tile under it.
function tileMetrics(b, i, width, s, ctx) {
  const size = sizeAt(b.size, s);
  const headSize = Math.round(size * 1.18);
  const card = (treat(ctx).cardMode ?? 'fill') !== 'rule';
  const padX = card ? size * 0.8 : 0;
  const padY = size * 0.7;
  const innerW = Math.max(60, width - padX * 2);
  const numW = b.numbered ? headSize * (String(i + 1).length * 0.62 + 0.4) : 0;
  const numGap = b.numbered ? size * 0.35 : 0;
  const headW = Math.max(40, innerW - numW - numGap);
  const headStyle = textStyle(ctx, { font: '@heading', weightRole: 'bold', size: headSize, lineHeight: 1.4 });
  const bodyStyle = textStyle(ctx, { size, lineHeight: 1.6 });
  const headH = measureText(ctx, b.heads[i], headStyle, headW).height;
  const body = b.bodies?.[i];
  const bodyH = body ? measureText(ctx, body, bodyStyle, innerW).height : 0;
  const hbGap = body ? size * 0.3 : 0;
  return { size, headSize, padX, padY, innerW, numW, numGap, headW, headH, bodyH, hbGap, h: padY * 2 + headH + hbGap + bodyH };
}

function tileRows(b, width, s, ctx) {
  const cols = b.columns ?? 2;
  const size = sizeAt(b.size, s);
  const colGap = size * 0.6;
  const rows = [];
  for (let i = 0; i < b.heads.length; i += cols) {
    const n = Math.min(cols, b.heads.length - i);
    const colW = (width - colGap * (n - 1)) / n;
    const items = Array.from({ length: n }, (_, k) => tileMetrics(b, i + k, colW, s, ctx));
    rows.push({ start: i, colW, items, h: Math.max(...items.map((t) => t.h)) });
  }
  const gap = cols === 1 && b.connect ? size * 1.1 : size * 0.6;
  return { rows, colGap, gap, total: rows.reduce((t, r) => t + r.h, 0) + gap * Math.max(0, rows.length - 1) };
}

// Stable title wrapping (styled designs). The frame width, not the text,
// decides where a title breaks, in the browser, in Canva and in PPTX alike;
// each renders glyphs a few % off this estimate (measured in Chromium:
// 0.93–1.04 of it, median ~0.965). So the frame is set inside the window
// where the intended breaks hold: wider than the widest line, narrower than
// any line plus the next word, at the middle of that window scaled to the
// median ratio. And a title whose last line would be a lone word ("… لا /
// بالجواب") first moves words down, one at a time, keeping the number of
// lines. Keeps the box width when no window at least 5% wide exists.
const RENDER_RATIO = 0.965;
function stableWrap(ctx, text, style, width) {
  const plain = plainText(text);
  const words = (line) => line.text.trim().split(/\s+/).filter(Boolean);
  let lines = wrapLines(plain, style, width);
  if (lines.length < 2) return { frame: width, lone: false };
  const count = lines.length;
  for (let k = 0; k < 6 && words(lines[count - 1]).length < 2; k++) {
    const next = wrapLines(plain, style, lines[count - 2].width - 1);
    if (next.length !== count) break;
    lines = next;
  }
  const lone = words(lines[count - 1]).length < 2;
  const lo = Math.max(...lines.map((l) => l.width));
  let hi = Infinity;
  for (let i = 0; i < lines.length - 1; i++) hi = Math.min(hi, textWidth(`${lines[i].text} ${words(lines[i + 1])[0]}`, style));
  // A window narrower than the renderers' spread cannot hold: keep the box.
  if (!(hi > lo * 1.05)) return { frame: width, lone: words(wrapLines(plain, style, width).at(-1)).length < 2 };
  return { frame: Math.min(width, Math.round((RENDER_RATIO * (lo + hi)) / 2)), lone };
}

// A balanced title's size and frame, decided once for its height and its
// drawing. When the stable wrap still ends on a lone word (a title of four
// words or more), the title steps down in size, up to two 6% steps and never
// under its minimum, and takes the first size that ends on two words or
// more; otherwise it keeps its size.
function titleLayout(ctx, b, width, s) {
  const base = sizeAt(b.size, s);
  const words = plainText(b.text).trim().split(/\s+/).filter(Boolean).length;
  let first = null;
  for (const k of [1, 0.94, 0.88]) {
    const size = Math.max(b.size[1], Math.round(base * k));
    const style = textStyle(ctx, { font: b.font, weightRole: b.weightRole, size, lineHeight: b.lineHeight });
    const r = stableWrap(ctx, b.text, style, width);
    const result = { size, frame: r.frame, height: measureText(ctx, b.text, style, width).height };
    first ??= result;
    if (!r.lone || words < 4) return result;
    if (size === b.size[1]) break;
  }
  return first;
}

// A text in a frame (an idea set apart): "outline" (hairline), "fill"
// (marker tint) or "panel" (tint and hairline). Padding is in units of the
// text size, so the frame grows and shrinks with it.
const boxPad = (b, s) => (b.boxed ? { x: Math.round(sizeAt(b.size, s) * (b.boxed.padX ?? 0.7)), y: Math.round(sizeAt(b.size, s) * (b.boxed.padY ?? 0.5)) } : { x: 0, y: 0 });

function boxShape(id, fr, mode, ctx, name, anim) {
  const t = treat(ctx);
  const fill = mode === 'outline' ? 'none' : t.boxFill ?? '@highlight';
  const stroke = mode === 'fill' ? null : t.boxStroke ?? '@line';
  return shapeElement(id, fr, 'rect', fill, { radius: cornerOf(t.boxRadius, 8), ...(stroke && { stroke, strokeWidth: t.boxStrokeWidth ?? 2 }), role: 'decor', name, anim });
}

const BLOCKS = {
  text: {
    height(b, width, s, ctx) {
      const pad = boxPad(b, s);
      const w = width * (b.maxWidth ?? 1) - (b.bar ? 10 + sizeAt(b.size, s) * 0.7 : 0) - pad.x * 2;
      if (b.balance && !b.nowrap) return titleLayout(ctx, b, w, s).height + pad.y * 2;
      const style = textStyle(ctx, { font: b.font, weightRole: b.weightRole, size: sizeAt(b.size, s), lineHeight: b.lineHeight });
      return measureText(ctx, b.text, style, w).height + pad.y * 2;
    },
    emit(b, box, s, ctx) {
      const pad = boxPad(b, s);
      const balanced = b.balance && !b.nowrap ? titleLayout(ctx, b, box.width * (b.maxWidth ?? 1) - (b.bar ? 10 + sizeAt(b.size, s) * 0.7 : 0) - pad.x * 2, s) : null;
      const size = balanced?.size ?? sizeAt(b.size, s);
      const w = box.width * (b.maxWidth ?? 1);
      const x = alignedX(box, w, b.align === 'center' ? 'center' : 'start', ctx);
      const bar = b.bar ? 10 : 0;
      const barGap = b.bar ? size * 0.7 : 0;
      const tw = w - bar - barGap - pad.x * 2;
      const h = this.height(b, box.width, s, ctx);
      const th = h - pad.y * 2;
      const els = [];
      if (b.boxed) els.push(boxShape(`${b.id}-box`, frame(x, box.y, w, h), b.boxed.mode, ctx, `إطار ${b.name ?? ''}`.trim(), b.anim));
      // A figure on a marker band across the column (e.g. "80/20").
      if (b.underlay === 'band') {
        els.push(shapeElement(`${b.id}-band`, frame(box.x, box.y + th * (b.bandAt?.[0] ?? 0.42), box.width, th * (b.bandAt?.[1] ?? 0.3)), 'rect', treat(ctx).highlightFill ?? '@highlight', { role: 'decor', name: 'شريط التظليل', anim: 'fade' }));
      }
      // A balanced frame keeps its side: the reading start, or the middle.
      let tx = (ctx.rtl === false ? x + bar + barGap : x) + pad.x;
      let fw = tw;
      if (balanced) {
        fw = Math.min(tw, balanced.frame);
        tx += b.align === 'center' ? (tw - fw) / 2 : ctx.rtl === false ? 0 : tw - fw;
      }
      if (b.bar) {
        els.push(shapeElement(`${b.id}-bar`, frame(startX({ x, width: w }, bar, ctx), box.y, bar, h), 'rect', '@accent', { radius: 5, role: 'decor', name: 'خط جانبي', anim: b.anim }));
      }
      els.push(
        textElement(b.id, frame(tx, box.y + pad.y, fw, th), b.text, ctx, {
          marker: !b.boxed || b.boxed.mode === 'outline',
          font: b.font,
          weightRole: b.weightRole,
          size,
          min: b.size[1],
          lineHeight: b.lineHeight,
          color: b.color ?? '@text',
          align: b.align ?? 'start',
          role: b.role,
          slot: b.slot,
          name: b.name,
          anim: b.anim,
        }),
      );
      return els;
    },
  },

  pill: {
    height: (b, width, s, ctx) => pillMetrics(b, s, ctx, width).h,
    emit: (b, box, s, ctx) => emitPill(b, box, s, ctx).elements,
  },

  rule: {
    height: (b) => b.height,
    emit: (b, box, s, ctx) => [
      shapeElement(b.id, frame(b.width === 'full' ? box.x : alignedX(box, b.width, b.align ?? 'start', ctx), box.y, b.width === 'full' ? box.width : b.width, b.height), 'rect', b.fill ?? treat(ctx).ruleFill ?? '@accent', {
        radius: cornerOf(treat(ctx).ruleRadius, b.height / 2),
        role: 'decor',
        name: 'خط زخرفي',
        anim: b.anim ?? 'fade',
      }),
    ],
  },

  art: {
    height: (b, width, s, ctx) => (b.share ? Math.round(ctx.region.height * b.share) : b.height),
    emit(b, box, s, ctx) {
      const h = this.height(b, box.width, s, ctx);
      const area = { x: box.x, y: box.y, width: box.width, height: h };
      if (!b.assetId) {
        return [
          shapeElement(b.id, frame(area.x, area.y, area.width, area.height), 'rect', '@surface', {
            radius: cornerOf(treat(ctx).artRadius, 36),
            role: 'art-placeholder',
            slot: b.slot,
            name: b.name ?? 'مكان الرسم',
            anim: b.anim ?? 'fade',
          }),
        ];
      }
      return [imageElement(b.id, containFrame(area, ctx.assets?.[b.assetId], b.align, ctx), b.assetId, b.alt ?? '', { role: 'art', slot: b.slot, name: b.name ?? 'الرسم', anim: b.anim ?? 'fade' })];
    },
  },

  list: {
    height: (b, width, s, ctx) => listRows(b, width, s, ctx).total,
    emit(b, box, s, ctx) {
      let L = listRows(b, box.width, s, ctx);
      // In a centred style a plain one-column list (no cards) is centred as
      // a block: the box narrows to its widest item and sits in the middle;
      // items keep their reading start.
      if (b.align === 'center' && !b.card && (b.columns ?? 1) === 1) {
        const used = Math.ceil(Math.max(...L.rows.flatMap((r) => r.items.map((m) => m.badge + m.gap + Math.min(m.textW, m.lineW))))) + 2;
        if (used < box.width) {
          box = { ...box, x: box.x + (box.width - used) / 2, width: used };
          L = listRows(b, box.width, s, ctx);
        }
      }
      const els = [];
      let y = box.y;
      for (const row of L.rows) {
        row.items.forEach((m, k) => {
          const i = row.start + k;
          const n = i + 1;
          // RTL: first column on the right.
          const colX = ctx.rtl === false ? box.x + k * (L.colW + L.colGap) : box.x + box.width - (k + 1) * L.colW - k * L.colGap;
          const cell = { x: colX, y, width: L.colW, height: row.h };
          const name = `البند ${formatNumber(n, ctx.theme.numerals)}`;
          if (b.card) els.push(...cardShapes(`${b.id}-${n}`, { ...cell, height: row.h }, m.size, ctx, name, b.anim ?? 'rise', b.cardFill));
          const inner = { x: cell.x + m.padX, y: cell.y + m.padY, width: cell.width - m.padX * 2, height: row.h - m.padY * 2 };
          const bx = startX(inner, m.badge, ctx);
          const contentH = Math.max(m.textH, m.badge);
          const by = inner.y + (b.badge === 'art' || b.badge === 'number' ? 0 : m.size * 0.28);
          const badgeShape = treat(ctx).badge ?? 'ellipse';
          if (b.badge === 'number') {
            if (badgeShape !== 'plain') els.push(shapeElement(`${b.id}-${n}-badge`, frame(bx, by, m.badge, m.badge), badgeShape === 'rect' ? 'rect' : 'ellipse', '@accent', { ...(badgeShape === 'rect' && { radius: Math.round(m.badge * 0.18) }), role: 'decor', name: `دائرة ${name}`, anim: b.anim ?? 'rise' }));
            els.push(
              textElement(`${b.id}-${n}-num`, frame(bx, by + (m.badge - m.size * 1.3) / 2, m.badge, m.size * 1.3), formatNumber((b.start ?? 1) + i, ctx.theme.numerals), ctx, {
                font: '@heading',
                weightRole: 'black',
                size: m.size,
                min: m.size,
                lineHeight: 1.3,
                color: badgeShape === 'plain' ? '@accent' : '@onAccent',
                align: 'center',
                nowrap: true,
                role: 'number',
                name: `رقم ${name}`,
                anim: b.anim ?? 'rise',
              }),
            );
          } else if (b.badge === 'art') {
            const assetId = b.itemArt?.[i];
            const f = frame(bx, by, m.badge, m.badge);
            els.push(
              assetId
                ? imageElement(`${b.id}-${n}-art`, containFrame(f, ctx.assets?.[assetId], 'center', ctx), assetId, b.itemArtAlt?.[i] ?? '', { role: 'art', slot: `itemArt.${i}`, name: `رسم ${name}`, anim: b.anim ?? 'rise' })
                : shapeElement(`${b.id}-${n}-art`, f, 'rect', '@surface', { radius: Math.round(m.size * 0.5), role: 'art-placeholder', slot: `itemArt.${i}`, name: `رسم ${name}`, anim: b.anim ?? 'rise' }),
            );
          } else if (b.badge !== 'none') {
            const icon = b.badge === 'cross' ? 'x' : 'check';
            if (badgeShape !== 'plain') els.push(shapeElement(`${b.id}-${n}-badge`, frame(bx, by, m.badge, m.badge), badgeShape === 'rect' ? 'rect' : 'ellipse', b.badgeFill ?? '@accent', { ...(badgeShape === 'rect' && { radius: Math.round(m.badge * 0.18) }), role: 'decor', name: `علامة ${name}`, anim: b.anim ?? 'rise' }));
            const pad = badgeShape === 'plain' ? 0 : m.badge * 0.2;
            els.push(iconElement(`${b.id}-${n}-icon`, frame(bx + pad, by + pad, m.badge - pad * 2, m.badge - pad * 2), icon, badgeShape === 'plain' ? b.badgeFill ?? '@accent' : b.badgeColor ?? '@onAccent', ctx, { role: 'decor', name: `أيقونة ${name}`, strokeWidth: 3, anim: b.anim ?? 'rise' }));
          }
          const textX = ctx.rtl === false ? inner.x + m.badge + m.gap : inner.x;
          const ty = inner.y + (b.badge === 'number' || b.badge === 'art' ? Math.max(0, (contentH - m.textH) / 2) : 0);
          els.push(
            textElement(`${b.id}-${n}`, frame(textX, ty, m.textW, m.textH), b.items[i], ctx, {
              font: b.font,
              weightRole: b.weightRole ?? 'regular',
              size: m.size,
              min: b.size[1],
              lineHeight: b.lineHeight ?? 1.6,
              color: b.color ?? '@text',
              role: 'item',
              slot: `${b.slot}.${i}`,
              name,
              anim: b.anim ?? 'rise',
            }),
          );
        });
        y += row.h + L.gap;
      }
      return els;
    },
  },

  tiles: {
    height: (b, width, s, ctx) => tileRows(b, width, s, ctx).total,
    emit(b, box, s, ctx) {
      const L = tileRows(b, box.width, s, ctx);
      const anim = b.anim ?? 'rise';
      const els = [];
      let y = box.y;
      L.rows.forEach((row, r) => {
        row.items.forEach((m, k) => {
          const i = row.start + k;
          const n = i + 1;
          // RTL: first column on the right.
          const colX = ctx.rtl === false ? box.x + k * (row.colW + L.colGap) : box.x + box.width - (k + 1) * row.colW - k * L.colGap;
          const cell = { x: colX, y, width: row.colW, height: row.h };
          const name = `الجزء ${formatNumber(n, ctx.theme.numerals)}`;
          els.push(...cardShapes(`${b.id}-${n}`, cell, m.size, ctx, name, anim));
          const inner = { x: cell.x + m.padX, y: cell.y + m.padY, width: m.innerW };
          const headLine = m.headSize * 1.4;
          if (b.numbered) {
            els.push(textElement(`${b.id}-${n}-num`, frame(startX(inner, m.numW, ctx), inner.y, m.numW, headLine), formatNumber(n, ctx.theme.numerals), ctx, { font: '@heading', weightRole: 'black', size: m.headSize, min: m.headSize, lineHeight: 1.4, color: '@accent', align: 'start', nowrap: true, role: 'number', name: `رقم ${name}`, anim }));
          }
          const headX = ctx.rtl === false ? inner.x + m.numW + m.numGap : inner.x;
          els.push(textElement(`${b.id}-${n}`, frame(headX, inner.y, m.headW, m.headH), b.heads[i], ctx, { font: '@heading', weightRole: 'bold', size: m.headSize, min: b.size[1], lineHeight: 1.4, role: 'item', slot: `${b.slot}.${i}`, name, anim }));
          if (b.bodies?.[i]) {
            els.push(textElement(`${b.id}-${n}-body`, frame(inner.x, inner.y + m.headH + m.hbGap, m.innerW, m.bodyH), b.bodies[i], ctx, { size: m.size, min: b.size[1], lineHeight: 1.6, color: '@muted', role: 'item', slot: `${b.bodySlot}.${i}`, name: `شرح ${name}`, anim }));
          }
          // Chain: a line from this tile to the next, under the number.
          if ((b.columns ?? 2) === 1 && b.connect && r < L.rows.length - 1) {
            const cx = startX(inner, b.numbered ? m.numW : 4, ctx) + (b.numbered ? m.numW / 2 : 2) - 2;
            els.push(shapeElement(`${b.id}-${n}-link`, frame(cx, cell.y + row.h, 4, L.gap), 'rect', '@accent', { role: 'decor', name: `وصلة ${name}`, anim: 'fade' }));
          }
        });
        y += row.h + L.gap;
      });
      return els;
    },
  },

  // Two cards side by side (or stacked when `stacked`), each with a label
  // pill and a checked/crossed list. Used by the comparison composition.
  compare: {
    layout(b, width, s, ctx) {
      const size = sizeAt(b.size, s);
      const gap = b.stacked ? size * 0.9 : size * 1.5;
      const cardW = b.stacked ? width : (width - gap) / 2;
      const pad = size * 0.85;
      const cards = b.columns.map((col) => {
        const label = pillMetrics({ ...col.label, size: b.size }, s, ctx, cardW - pad * 2);
        const list = { items: col.items, size: b.size, badge: col.positive ? 'check' : 'cross', lineHeight: 1.55, itemGap: 0.45 };
        const rows = listRows(list, cardW - pad * 2, s, ctx);
        return { label, list, rows, h: pad * 2 + label.h + size * 0.6 + rows.total };
      });
      const h = b.stacked ? cards.reduce((t, c) => t + c.h, 0) + gap * (cards.length - 1) : Math.max(...cards.map((c) => c.h));
      return { size, gap, cardW, pad, cards, h };
    },
    height(b, width, s, ctx) {
      return this.layout(b, width, s, ctx).h;
    },
    emit(b, box, s, ctx) {
      const L = this.layout(b, box.width, s, ctx);
      const els = [];
      let y = box.y;
      L.cards.forEach((card, k) => {
        const col = b.columns[k];
        const x = b.stacked ? box.x : ctx.rtl === false ? box.x + k * (L.cardW + L.gap) : box.x + box.width - (k + 1) * L.cardW - k * L.gap;
        const cy = b.stacked ? y : box.y;
        const h = b.stacked ? card.h : L.h;
        const id = `${b.id}-${k + 1}`;
        // Same card treatment as lists: outline and rule styles draw no
        // fill (the positive side keeps its accent edge).
        const mode = treat(ctx).cardMode ?? 'fill';
        const open = mode === 'outline' || mode === 'rule';
        els.push(
          shapeElement(`${id}-card`, frame(x, cy, L.cardW, h), 'rect', open ? 'none' : treat(ctx).cardFill ?? '@surface', {
            radius: cornerOf(treat(ctx).cardRadius, Math.round(L.size * 0.9)),
            role: 'decor',
            name: `بطاقة ${col.label.text}`,
            ...(col.positive ? { stroke: '@accent', strokeWidth: 4 } : mode === 'outline' && { stroke: treat(ctx).cardStroke ?? '@muted', strokeWidth: 2 }),
            anim: 'rise',
          }),
        );
        const inner = { x: x + L.pad, y: cy + L.pad, width: L.cardW - L.pad * 2, height: h - L.pad * 2 };
        els.push(
          ...emitPill(
            {
              ...col.label,
              id: `${id}-label`,
              size: b.size,
              fill: col.positive ? '@accent' : '@bg',
              color: col.positive ? '@onAccent' : '@muted',
              role: 'label',
              slot: col.labelSlot,
              name: `عنوان ${col.label.text}`,
              anim: 'rise',
            },
            inner,
            s,
            ctx,
          ).elements,
        );
        els.push(
          ...BLOCKS.list.emit(
            {
              ...card.list,
              id: `${id}-item`,
              slot: col.slot,
              badgeFill: col.positive ? '@accent' : '@bg',
              badgeColor: col.positive ? '@onAccent' : '@muted',
              anim: 'rise',
            },
            { x: inner.x, y: inner.y + card.label.h + L.size * 0.6, width: inner.width },
            s,
            ctx,
          ),
        );
        y += card.h + L.gap;
      });
      // Arrow badge between the two cards, pointing the reading direction.
      const d = L.size * 1.35;
      const cx = b.stacked ? box.x + box.width / 2 : box.x + box.width / 2;
      const cyMid = b.stacked ? box.y + L.cards[0].h + L.gap / 2 : box.y + L.h / 2;
      els.push(shapeElement(`${b.id}-arrow-bg`, frame(cx - d / 2, cyMid - d / 2, d, d), 'ellipse', '@accent', { stroke: '@bg', strokeWidth: Math.round(L.size * 0.25), role: 'decor', name: 'سهم المقارنة', anim: 'pop' }));
      els.push(
        iconElement(`${b.id}-arrow`, frame(cx - d * 0.28, cyMid - d * 0.28, d * 0.56, d * 0.56), 'arrow', '@onAccent', ctx, {
          directional: !b.stacked,
          ...(b.stacked && { rotation: 90 }),
          role: 'decor',
          name: 'سهم',
          strokeWidth: 3,
          anim: 'pop',
        }),
      );
      return els;
    },
  },

  // Stages in framed boxes, one under the other, joined by a small circle
  // with a down arrow: "from → to". `emphasis` marks the outcome: "fill"
  // tints the last box, "mark" puts a marker band behind every head.
  flow: {
    layout(b, width, s, ctx) {
      const size = sizeAt(b.size, s);
      const headSize = Math.round(size * 1.1);
      const padX = Math.round(size * 0.75);
      const padY = Math.round(size * 0.6);
      const innerW = Math.max(60, width - padX * 2);
      const headStyle = textStyle(ctx, { font: '@heading', weightRole: 'bold', size: headSize, lineHeight: 1.5 });
      const bodyStyle = textStyle(ctx, { size, lineHeight: 1.6 });
      const items = b.heads.map((head, i) => {
        const headH = measureText(ctx, head, headStyle, innerW).height;
        const body = b.bodies?.[i];
        const bodyH = body ? measureText(ctx, body, bodyStyle, innerW).height : 0;
        const hb = body ? Math.round(size * 0.35) : 0;
        return { headH, bodyH, hb, h: padY * 2 + headH + hb + bodyH };
      });
      const d = Math.round(size * 1.05);
      const gap = d + Math.round(size * 0.7);
      return { size, headSize, padX, padY, innerW, items, d, gap, h: items.reduce((t, it) => t + it.h, 0) + gap * Math.max(0, items.length - 1) };
    },
    height(b, width, s, ctx) {
      return this.layout(b, width, s, ctx).h;
    },
    emit(b, box, s, ctx) {
      const L = this.layout(b, box.width, s, ctx);
      const anim = b.anim ?? 'rise';
      const els = [];
      let y = box.y;
      L.items.forEach((it, i) => {
        const n = i + 1;
        const last = i === L.items.length - 1;
        const name = `المرحلة ${formatNumber(n, ctx.theme.numerals)}`;
        els.push(boxShape(`${b.id}-${n}-box`, frame(box.x, y, box.width, it.h), b.emphasis === 'fill' && last ? 'panel' : 'outline', ctx, `إطار ${name}`, anim));
        const inner = { x: box.x + L.padX, y: y + L.padY };
        if (b.emphasis === 'mark') {
          els.push(shapeElement(`${b.id}-${n}-mark`, frame(box.x + L.padX * 0.5, inner.y + it.headH * 0.3, box.width - L.padX, it.headH * 0.6), 'rect', treat(ctx).highlightFill ?? '@highlight', { role: 'decor', name: `تظليل ${name}`, anim }));
        }
        els.push(textElement(`${b.id}-${n}`, frame(inner.x, inner.y, L.innerW, it.headH), b.heads[i], ctx, { font: '@heading', weightRole: 'bold', size: L.headSize, min: b.size[1], lineHeight: 1.5, role: 'item', slot: `${b.slot}.${i}`, name, anim }));
        if (b.bodies?.[i]) {
          els.push(textElement(`${b.id}-${n}-body`, frame(inner.x, inner.y + it.headH + it.hb, L.innerW, it.bodyH), b.bodies[i], ctx, { size: L.size, min: b.size[1], lineHeight: 1.6, color: '@muted', role: 'item', slot: `${b.bodySlot}.${i}`, name: `شرح ${name}`, anim }));
        }
        y += it.h;
        if (!last) {
          const cx = box.x + box.width / 2;
          const cy = y + L.gap / 2;
          els.push(shapeElement(`${b.id}-${n}-link`, frame(cx - L.d / 2, cy - L.d / 2, L.d, L.d), 'ellipse', '@bg', { stroke: treat(ctx).boxStroke ?? '@line', strokeWidth: 2, role: 'decor', name: `وصلة ${name}`, anim: 'fade' }));
          const a = Math.round(L.d * 0.5);
          els.push(iconElement(`${b.id}-${n}-arrow`, frame(cx - a / 2, cy - a / 2, a, a), 'arrow', '@accent', ctx, { rotation: 90, role: 'decor', name: `سهم ${name}`, strokeWidth: 2.2, anim: 'fade' }));
          y += L.gap;
        }
      });
      return els;
    },
  },

  // Full-width action rows of a closing page ("احفظها…", "شاركها…"): the
  // first tinted, the others framed, each with its icon at the reading end.
  actions: {
    layout(b, width, s, ctx) {
      const size = sizeAt(b.size, s);
      const style = textStyle(ctx, { font: '@heading', weightRole: 'bold', size, lineHeight: 1.5 });
      const icon = Math.round(size * 0.9);
      const padX = Math.round(size * 0.8);
      const padY = Math.round(size * 0.5);
      // Room for the icon on both sides keeps the label centred.
      const textW = Math.max(60, width - (padX + icon + size * 0.5) * 2);
      const rows = b.items.map((it) => {
        const textH = measureText(ctx, it.text, style, textW).height;
        return { textH, h: textH + padY * 2 };
      });
      const gap = Math.round(size * 0.5);
      return { size, icon, padX, padY, textW, rows, gap, h: rows.reduce((t, r) => t + r.h, 0) + gap * Math.max(0, rows.length - 1) };
    },
    height(b, width, s, ctx) {
      return b.items.length ? this.layout(b, width, s, ctx).h : 0;
    },
    emit(b, box, s, ctx) {
      if (!b.items.length) return [];
      const L = this.layout(b, box.width, s, ctx);
      const els = [];
      let y = box.y;
      b.items.forEach((it, i) => {
        const r = L.rows[i];
        const primary = i === 0;
        const id = it.id ?? `${b.id}-${i + 1}`;
        els.push(boxShape(`${id}-bg`, frame(box.x, y, box.width, r.h), primary ? 'panel' : 'outline', ctx, `خلفية ${it.name ?? ''}`.trim(), 'pop'));
        els.push(textElement(id, frame(box.x + (box.width - L.textW) / 2, y + L.padY, L.textW, r.textH), it.text, ctx, { font: '@heading', weightRole: 'bold', size: L.size, min: b.size[1], lineHeight: 1.5, align: 'center', role: 'cta', slot: it.slot, name: it.name, anim: 'pop' }));
        if (it.icon) {
          const ix = ctx.rtl === false ? box.x + box.width - L.padX - L.icon : box.x + L.padX;
          els.push(iconElement(`${id}-icon`, frame(ix, y + (r.h - L.icon) / 2, L.icon, L.icon), it.icon, primary ? '@accent' : '@muted', ctx, { directional: it.icon === 'share', role: 'decor', name: `أيقونة ${it.name ?? ''}`.trim(), strokeWidth: 1.8, anim: 'pop' }));
        }
        y += r.h + L.gap;
      });
      return els;
    },
  },

  author: {
    layout(b, width, s, ctx) {
      const size = sizeAt(b.size, s);
      const nameStyle = textStyle(ctx, { weightRole: 'bold', size, lineHeight: 1.5 });
      const roleStyle = textStyle(ctx, { size: Math.max(30, Math.round(size * 0.86)), lineHeight: 1.5 });
      const photo = b.photoAssetId ? size * 2.4 : 0;
      const bar = b.photoAssetId ? 0 : size * 2;
      const gap = size * 0.6;
      const textW = width - (photo || bar) - gap;
      const nh = measureText(ctx, b.name, nameStyle, textW).height;
      const rh = b.role ? measureText(ctx, b.role, roleStyle, textW).height : 0;
      return { size, nameStyle, roleStyle, photo, bar, gap, textW, nh, rh, h: Math.max(photo, nh + rh) };
    },
    height(b, width, s, ctx) {
      return this.layout(b, width, s, ctx).h;
    },
    emit(b, box, s, ctx) {
      const L = this.layout(b, box.width, s, ctx);
      const els = [];
      const lead = L.photo || L.bar;
      const lx = startX(box, lead, ctx);
      if (L.photo) {
        els.push(imageElement(`${b.id}-photo`, frame(lx, box.y + (L.h - L.photo) / 2, L.photo, L.photo), b.photoAssetId, b.name, { fit: 'cover', radius: L.photo / 2, role: 'photo', slot: 'photo', name: 'صورة القائل', anim: 'fade' }));
      } else {
        els.push(shapeElement(`${b.id}-bar`, frame(lx, box.y + L.h / 2 - 2, L.bar, 4), 'rect', '@accent', { radius: 2, role: 'decor', name: 'خط', anim: 'fade' }));
      }
      const tx = ctx.rtl === false ? box.x + lead + L.gap : box.x + box.width - lead - L.gap - L.textW;
      const ty = box.y + (L.h - L.nh - L.rh) / 2;
      els.push(textElement(`${b.id}-name`, frame(tx, ty, L.textW, L.nh), b.name, ctx, { weightRole: 'bold', size: L.nameStyle.size, min: b.size[1], lineHeight: 1.5, role: 'author', slot: 'author', name: 'القائل', anim: 'fade' }));
      if (b.role) {
        els.push(
          textElement(`${b.id}-role`, frame(tx, ty + L.nh, L.textW, L.rh), b.role, ctx, { size: L.roleStyle.size, min: b.size[1], lineHeight: 1.5, color: '@muted', role: 'caption', slot: 'role', name: 'صفة القائل', anim: 'fade' }),
        );
      }
      return els;
    },
  },

  avatar: {
    height: (b, width, s) => sizeAt(b.size, s) + (b.ring ? 36 : 0),
    emit(b, box, s, ctx) {
      const d = sizeAt(b.size, s);
      const ring = b.ring ? 18 : 0;
      const x = box.x + (box.width - d) / 2;
      const y = box.y + ring;
      const els = [];
      if (b.ring) {
        els.push(shapeElement(`${b.id}-ring`, frame(x - ring, y - ring, d + ring * 2, d + ring * 2), 'ellipse', '@accent', { role: 'decor', name: 'حلقة الصورة', anim: 'pop' }));
        els.push(shapeElement(`${b.id}-gap`, frame(x - 10, y - 10, d + 20, d + 20), 'ellipse', '@bg', { role: 'decor', name: 'فاصل الحلقة', anim: 'pop' }));
      }
      if (b.assetId) {
        els.push(imageElement(b.id, frame(x, y, d, d), b.assetId, b.alt ?? '', { fit: 'cover', radius: d / 2, role: 'brand', name: 'صورة الحساب', anim: 'pop' }));
      } else {
        els.push(shapeElement(`${b.id}-bg`, frame(x, y, d, d), 'ellipse', '@accent', { role: 'brand', name: 'دائرة الحساب', anim: 'pop' }));
        const fs = Math.round(d * 0.45);
        els.push(
          textElement(`${b.id}-initial`, frame(x, y + (d - fs * 1.4) / 2, d, fs * 1.4), b.initial, ctx, { font: '@heading', weightRole: 'black', size: fs, min: fs, lineHeight: 1.4, color: '@onAccent', align: 'center', nowrap: true, role: 'brand', name: 'الحرف الأول', anim: 'pop' }),
        );
      }
      return els;
    },
  },

  // Centred row of pills that wraps onto more lines when needed.
  pills: {
    layout(b, width, s, ctx) {
      const items = b.items.map((it) => ({ it, m: pillMetrics({ ...it, size: b.size, icon: it.icon }, s, ctx, width) }));
      const gap = sizeAt(b.size, s) * 0.35;
      const lines = [];
      let line = [];
      let w = 0;
      for (const x of items) {
        if (line.length && w + gap + x.m.w > width) {
          lines.push({ items: line, w });
          line = [];
          w = 0;
        }
        w += (line.length ? gap : 0) + x.m.w;
        line.push(x);
      }
      if (line.length) lines.push({ items: line, w });
      const lh = Math.max(0, ...items.map((x) => x.m.h));
      return { lines, gap, lh, h: lines.length * lh + Math.max(0, lines.length - 1) * gap };
    },
    height(b, width, s, ctx) {
      return b.items.length ? this.layout(b, width, s, ctx).h : 0;
    },
    emit(b, box, s, ctx) {
      if (!b.items.length) return [];
      const L = this.layout(b, box.width, s, ctx);
      const els = [];
      let y = box.y;
      for (const line of L.lines) {
        // RTL: the first pill is the rightmost.
        let x = ctx.rtl === false ? box.x + (box.width - line.w) / 2 : box.x + (box.width + line.w) / 2;
        for (const { it, m } of line.items) {
          const px = ctx.rtl === false ? x : x - m.w;
          els.push(...emitPill({ ...it, size: b.size }, box, s, ctx, { x: px, y }).elements);
          x = ctx.rtl === false ? x + m.w + L.gap : x - m.w - L.gap;
        }
        y += L.lh + L.gap;
      }
      return els;
    },
  },

  // Editorial collage: up to four cut-outs overlapping at slight angles, with
  // tape strips. Rotations and offsets are fixed per slot so the result is
  // reproducible and the cut-outs never cover each other's centres.
  collage: {
    height: (b, width, s, ctx) => Math.round(ctx.region.height * b.share),
    emit(b, box, s, ctx) {
      const h = Math.round(ctx.region.height * b.share);
      const slots = [
        { x: 0.52, y: 0.02, w: 0.48, h: 0.62, r: -5 },
        { x: 0.04, y: 0.08, w: 0.46, h: 0.56, r: 4 },
        { x: 0.3, y: 0.42, w: 0.42, h: 0.56, r: -2 },
        { x: 0.66, y: 0.5, w: 0.32, h: 0.46, r: 7 },
      ];
      const els = [shapeElement(`${b.id}-paper`, frame(box.x - 24, box.y + h * 0.1, box.width + 48, h * 0.8), 'rect', '@surface', { radius: cornerOf(treat(ctx).cardRadius, 28), rotation: -2, role: 'decor', name: 'ورقة الكولاج', anim: 'fade' })];
      const assets = (b.assets ?? []).slice(0, 4);
      const count = Math.max(assets.length, 1);
      slots.slice(0, count).forEach((slot, i) => {
        const sx = ctx.rtl === false ? slot.x : 1 - slot.x - slot.w;
        const area = { x: box.x + sx * box.width, y: box.y + slot.y * h, width: slot.w * box.width, height: slot.h * h };
        const id = `${b.id}-${i + 1}`;
        if (assets[i]) {
          els.push(imageElement(id, containFrame(area, ctx.assets?.[assets[i]], 'center', ctx), assets[i], b.alts?.[i] ?? '', { rotation: slot.r, role: 'art', slot: `art.${i}`, name: `قصاصة ${formatNumber(i + 1, ctx.theme.numerals)}`, anim: 'pop' }));
        } else {
          els.push(shapeElement(id, frame(area.x, area.y, area.width, area.height), 'rect', '@bg', { rotation: slot.r, radius: 12, role: 'art-placeholder', slot: `art.${i}`, name: `قصاصة ${formatNumber(i + 1, ctx.theme.numerals)}`, anim: 'pop' }));
        }
        const tapeW = area.width * 0.36;
        els.push(shapeElement(`${id}-tape`, frame(area.x + (area.width - tapeW) / 2, area.y - 18, tapeW, 40), 'rect', '@accent', { rotation: slot.r * -1.5, opacity: 0.75, radius: 4, role: 'decor', name: 'شريط لاصق', anim: 'pop' }));
      });
      return els;
    },
  },
};

export function blockHeight(b, width, s, ctx) {
  return BLOCKS[b.type].height(b, width, s, ctx);
}

export function emitBlock(b, box, s, ctx) {
  return BLOCKS[b.type].emit(b, box, s, ctx);
}

// Total height of a stack at scale s. Gaps are in px at s = 1 and shrink
// with the text, but never below 60%.
export function stackHeight(blocks, width, s, ctx) {
  const gapScale = Math.max(0.6, s);
  return blocks.reduce((t, b, i) => t + blockHeight(b, width, s, ctx) + (i ? (b.gap ?? 0) * gapScale : 0), 0);
}

// Places the blocks at scale s; leftover height goes by `align`.
export function placeStack(blocks, region, s, ctx, align = 'center') {
  const gapScale = Math.max(0.6, s);
  const heights = blocks.map((b) => blockHeight(b, region.width, s, ctx));
  const total = heights.reduce((a, b) => a + b, 0) + blocks.reduce((t, b, i) => t + (i ? (b.gap ?? 0) * gapScale : 0), 0);
  const leftover = Math.max(0, region.height - total);
  let y = region.y + (align === 'center' ? leftover / 2 : align === 'end' ? leftover : align === 'upper' ? leftover * 0.25 : 0);
  const elements = [];
  blocks.forEach((b, i) => {
    if (i) y += (b.gap ?? 0) * gapScale;
    elements.push(...emitBlock(b, { x: region.x, y, width: region.width, height: heights[i] }, s, ctx));
    y += heights[i];
  });
  return { elements, total };
}

// Text that a block will render, for overflow suggestions.
export function blockTexts(b) {
  if (b.type === 'text' || b.type === 'pill') return [{ id: b.id, slot: b.slot, text: b.text, size: b.size }];
  if (b.type === 'list') return b.items.map((t, i) => ({ id: `${b.id}-${i + 1}`, slot: `${b.slot}.${i}`, text: t, size: b.size }));
  if (b.type === 'compare') return b.columns.flatMap((c, k) => c.items.map((t, i) => ({ id: `${b.id}-${k + 1}-item-${i + 1}`, slot: `${c.slot}.${i}`, text: t, size: b.size })));
  if (b.type === 'author') return [{ id: `${b.id}-name`, slot: 'author', text: b.name, size: b.size }];
  if (b.type === 'flow') return b.heads.flatMap((t, i) => [{ id: `${b.id}-${i + 1}`, slot: `${b.slot}.${i}`, text: t, size: b.size }, ...(b.bodies?.[i] ? [{ id: `${b.id}-${i + 1}-body`, slot: `${b.bodySlot}.${i}`, text: b.bodies[i], size: b.size }] : [])]);
  if (b.type === 'actions') return b.items.map((it, i) => ({ id: it.id ?? `${b.id}-${i + 1}`, slot: it.slot, text: it.text, size: b.size }));
  if (b.type === 'tiles') return b.heads.flatMap((t, i) => [{ id: `${b.id}-${i + 1}`, slot: `${b.slot}.${i}`, text: t, size: b.size }, ...(b.bodies?.[i] ? [{ id: `${b.id}-${i + 1}-body`, slot: `${b.bodySlot}.${i}`, text: b.bodies[i], size: b.size }] : [])]);
  return [];
}

export const visibleLength = (text) => plainText(text).replace(/\s+/g, ' ').trim().length;
