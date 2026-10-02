import { FONTS } from '../fonts.js';
import { formatNumber } from '../numerals.js';
import { estimateMeasure, plainText, textWidth } from './measure.js';
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

export function contentRegion(format, { topChrome = true, bottomChrome = true } = {}) {
  const top = format.inset.top + (topChrome ? 170 : 120);
  const bottom = format.inset.bottom + (bottomChrome ? 190 : 120);
  return { x: MARGIN, y: top, width: format.width - MARGIN * 2, height: format.height - top - bottom };
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

export function textElement(id, f, text, ctx, { font = '@body', weightRole = 'regular', size, min, lineHeight, color = '@text', align = 'start', nowrap = false, ...extra }) {
  const fontId = resolveFont(font, ctx.theme.fonts);
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
  const onPill = b.color ?? (outline ? '@accent' : t.pillFill === '@text' ? '@bg' : '@onAccent');
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
  return { size, style, padX, padY, badge, gap, textW, textH: m.height, h: inner + padY * 2, clipped: m.clipped };
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

const BLOCKS = {
  text: {
    height(b, width, s, ctx) {
      const w = width * (b.maxWidth ?? 1) - (b.bar ? 10 + sizeAt(b.size, s) * 0.7 : 0);
      const style = textStyle(ctx, { font: b.font, weightRole: b.weightRole, size: sizeAt(b.size, s), lineHeight: b.lineHeight });
      return measureText(ctx, b.text, style, w).height;
    },
    emit(b, box, s, ctx) {
      const size = sizeAt(b.size, s);
      const w = box.width * (b.maxWidth ?? 1);
      const x = alignedX(box, w, b.align === 'center' ? 'center' : 'start', ctx);
      const bar = b.bar ? 10 : 0;
      const barGap = b.bar ? size * 0.7 : 0;
      const tw = w - bar - barGap;
      const h = this.height(b, box.width, s, ctx);
      const els = [];
      if (b.bar) {
        els.push(shapeElement(`${b.id}-bar`, frame(startX({ x, width: w }, bar, ctx), box.y, bar, h), 'rect', '@accent', { radius: 5, role: 'decor', name: 'خط جانبي', anim: b.anim }));
      }
      els.push(
        textElement(b.id, frame(ctx.rtl === false ? x + bar + barGap : x, box.y, tw, h), b.text, ctx, {
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
      shapeElement(b.id, frame(alignedX(box, b.width, b.align ?? 'start', ctx), box.y, b.width, b.height), 'rect', b.fill ?? treat(ctx).ruleFill ?? '@accent', {
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
      const L = listRows(b, box.width, s, ctx);
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
          if (b.card) {
            const t = treat(ctx);
            const cr = cornerOf(t.cardRadius, Math.round(m.size * 0.65));
            const mode = t.cardMode ?? 'fill';
            if (mode === 'rule') {
              // No card: a hairline under the item, from the reading start.
              els.push(shapeElement(`${b.id}-${n}-card`, frame(cell.x, cell.y + row.h - 3, cell.width, 3), 'rect', '@muted', { opacity: 0.35, role: 'decor', name: `فاصل ${name}`, anim: b.anim ?? 'rise' }));
            } else {
              els.push(shapeElement(`${b.id}-${n}-card`, frame(cell.x, cell.y, cell.width, row.h), 'rect', mode === 'outline' ? 'none' : b.cardFill ?? '@surface', { radius: cr, ...(mode === 'outline' && { stroke: '@muted', strokeWidth: 2 }), role: 'decor', name: `بطاقة ${name}`, anim: b.anim ?? 'rise' }));
              if (mode === 'accent-bar') {
                // A short accent on the card's reading-start edge (top fifth).
                const bw = 8;
                els.push(shapeElement(`${b.id}-${n}-accent`, frame(ctx.rtl === false ? cell.x : cell.x + cell.width - bw, cell.y, bw, Math.max(24, row.h * 0.32)), 'rect', '@accent', { role: 'decor', name: `علامة ${name}`, anim: b.anim ?? 'rise' }));
              }
            }
          }
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
        els.push(
          shapeElement(`${id}-card`, frame(x, cy, L.cardW, h), 'rect', '@surface', {
            radius: cornerOf(treat(ctx).cardRadius, Math.round(L.size * 0.9)),
            role: 'decor',
            name: `بطاقة ${col.label.text}`,
            ...(col.positive && { stroke: '@accent', strokeWidth: 4 }),
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
  return [];
}

export const visibleLength = (text) => plainText(text).replace(/\s+/g, ' ').trim().length;
