import { counterLabel } from '../numerals.js';
import { iconElement, imageElement, labelWidth, MARGIN, shapeElement, textElement } from './layout.js';
import { resolveFont } from './theme.js';
import { round } from './util.js';

// System elements around the content: progress bar and slide counter,
// swipe prompt, brand badge and logo. Same placement and defaults as the
// classic editor's overlay plugins, but emitted as ordinary elements so
// they can be moved, locked, hidden or exported to Canva like the rest.

export const CHROME_DEFAULTS = {
  pagination: { enabled: true, style: 'words', showBar: true, showCounter: true },
  swipe: { enabled: true, text: 'اسحب لليسار', lastText: 'احفظ البوست 📌', showArrow: true },
  watermark: { enabled: true, showLogo: true, showBadge: true },
};

export function chromeSettings(raw) {
  return Object.fromEntries(Object.entries(CHROME_DEFAULTS).map(([id, d]) => [id, { ...d, ...raw?.[id] }]));
}

const f = (x, y, width, height) => ({ x: round(x, 1), y: round(y, 1), width: round(width, 1), height: round(height, 1) });

// Which chrome bands a page needs, so the content region can use the rest.
export function chromeBands(settings, comp, index, total, brand) {
  const pagination = settings.pagination.enabled && total > 1;
  const isLast = index === total - 1;
  const swipeText = isLast ? settings.swipe.lastText : settings.swipe.text;
  const swipe = settings.swipe.enabled && total > 1 && Boolean(swipeText) && !(isLast && comp.ownsCta);
  const badge = settings.watermark.enabled && settings.watermark.showBadge && !comp.hideBrandBadge && Boolean(brand?.name || brand?.handle || brand?.avatarAssetId);
  const logo = settings.watermark.enabled && settings.watermark.showLogo && Boolean(brand?.logoAssetId);
  return { pagination, swipe, swipeText, badge, logo, top: pagination || logo, bottom: swipe || badge };
}

export function chromeElements({ settings, bands, index, total, format, ctx, brand, assets }) {
  const W = format.width;
  const H = format.height;
  const top = format.inset.top;
  const bottom = H - format.inset.bottom;
  const rtl = ctx.rtl !== false;
  const els = [];
  const body = resolveFont('@body', ctx.theme.fonts);

  if (bands.pagination && settings.pagination.showBar) {
    els.push(shapeElement('sys-progress-track', f(0, top, W, 12), 'rect', '@surface', { role: 'system', name: 'مسار شريط التقدّم' }));
    const filled = (W * (index + 1)) / total;
    els.push(shapeElement('sys-progress', f(rtl ? W - filled : 0, top, filled, 12), 'rect', '@accent', { role: 'system', name: 'شريط التقدّم' }));
  }
  if (bands.pagination && settings.pagination.showCounter) {
    const text = counterLabel(index, total, settings.pagination.style, ctx.theme.numerals);
    const size = 28;
    const tw = labelWidth(text, { font: body, weight: 700, size });
    const w = tw + 52;
    const h = size * 1.5 + 16;
    const x = rtl ? MARGIN : W - MARGIN - w;
    els.push(shapeElement('sys-counter-bg', f(x, top + 52, w, h), 'rect', '@surface', { radius: h / 2, role: 'system', name: 'خلفية العداد' }));
    els.push(textElement('sys-counter', f(x + 26, top + 60, tw, size * 1.5), text, ctx, { weightRole: 'bold', size, lineHeight: 1.5, color: '@muted', align: 'center', nowrap: true, role: 'system', name: 'عدّاد الشرائح' }));
  }
  if (bands.logo) {
    const asset = assets?.[brand.logoAssetId];
    const h = 76;
    const w = asset ? Math.min(300, (asset.widthPx / asset.heightPx) * h) : h;
    els.push(imageElement('sys-logo', f(rtl ? W - MARGIN - w : MARGIN, top + 40, w, h), brand.logoAssetId, 'الشعار', { role: 'system', name: 'الشعار' }));
  }
  if (bands.swipe) {
    const size = 30;
    const text = bands.swipeText;
    const tw = labelWidth(text, { font: body, weight: 700, size });
    const arrow = index < total - 1 && settings.swipe.showArrow ? 34 : 0;
    const w = tw + 30 + 24 + (arrow ? arrow + 14 : 0);
    const h = size * 1.4 + 28;
    const x = rtl ? MARGIN : W - MARGIN - w;
    const y = bottom - 60 - h;
    els.push(shapeElement('sys-swipe-bg', f(x, y, w, h), 'rect', '@accent', { radius: h / 2, role: 'system', name: 'خلفية دعوة السحب' }));
    els.push(textElement('sys-swipe', f(rtl ? x + w - 30 - tw : x + 30, y + 14, tw, size * 1.4), text, ctx, { weightRole: 'bold', size, lineHeight: 1.4, color: '@onAccent', align: 'center', nowrap: true, role: 'system', name: 'دعوة السحب' }));
    if (arrow) {
      els.push(iconElement('sys-swipe-arrow', f(rtl ? x + 24 : x + w - 24 - arrow, y + (h - arrow) / 2, arrow, arrow), 'arrow', '@onAccent', ctx, { directional: true, role: 'system', name: 'سهم السحب', strokeWidth: 2.5 }));
    }
  }
  if (bands.badge) {
    const d = 84;
    const y = bottom - 56 - d;
    const ax = rtl ? W - MARGIN - d : MARGIN;
    if (brand.avatarAssetId) {
      els.push(imageElement('sys-avatar', f(ax, y, d, d), brand.avatarAssetId, brand.name ?? '', { fit: 'cover', radius: d / 2, role: 'system', name: 'صورة الحساب' }));
    } else {
      els.push(shapeElement('sys-avatar-bg', f(ax, y, d, d), 'ellipse', '@accent', { role: 'system', name: 'دائرة الحساب' }));
      els.push(textElement('sys-avatar-initial', f(ax, y + (d - 38 * 1.4) / 2, d, 38 * 1.4), Array.from(brand.name?.trim() || '؟')[0], ctx, { font: '@heading', weightRole: 'black', size: 38, lineHeight: 1.4, color: '@onAccent', align: 'center', nowrap: true, role: 'system', name: 'الحرف الأول' }));
    }
    const name = brand.name ?? '';
    const handle = brand.handle ?? '';
    const tw = Math.max(labelWidth(name, { font: body, weight: 700, size: 30 }), labelWidth(handle, { font: body, weight: 400, size: 26 }));
    const tx = rtl ? ax - 18 - tw : ax + d + 18;
    const lines = (name ? 30 * 1.35 : 0) + (handle ? 26 * 1.35 : 0);
    let ty = y + (d - lines) / 2;
    if (name) {
      els.push(textElement('sys-brand-name', f(tx, ty, tw, 30 * 1.35), name, ctx, { weightRole: 'bold', size: 30, lineHeight: 1.35, nowrap: true, role: 'system', name: 'اسم الحساب' }));
      ty += 30 * 1.35;
    }
    if (handle) {
      els.push(textElement('sys-brand-handle', f(tx, ty, tw, 26 * 1.35), handle, ctx, { size: 26, lineHeight: 1.35, color: '@muted', nowrap: true, role: 'system', name: 'معرّف الحساب' }));
    }
  }
  return els;
}
