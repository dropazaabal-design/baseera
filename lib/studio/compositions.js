import { FLOOR, shapeElement, iconElement } from './layout.js';
import { formatNumber } from '../numerals.js';

// Compositions turn a page's semantic content (title, items, cta…) into a
// stack of blocks plus decorative shapes. They carry the metadata the
// library ranks by (type, metaphors, capacity) and the content fields the
// editor and validators use. Content is the approved text; elements are
// regenerated from it, with user overrides re-applied by element id.

// A figure made only of digits and signs ("70%", "3") can sit tight; one
// with Arabic letters ("5 ثوانٍ", "3 دقائق") has descenders and marks below
// the line and needs Arabic line spacing, at a smaller size.
const hasArabicLetters = (text) => /[\u0600-\u06FF]/.test(text ?? '');
const figureType = (text) => (hasArabicLetters(text) ? { size: [170, 110], lineHeight: 1.6 } : null);
// Cairo's marks under a large word (ٍ under ن) pass its line box: the line
// after a word figure starts lower.
const afterFigure = (text, gap) => (hasArabicLetters(text) ? Math.max(gap, 56) : gap);

const nonEmpty = (list) => (Array.isArray(list) ? list : []).filter((s) => typeof s === 'string' && s.trim());
const f = (x, y, width, height) => ({ x, y, width, height });

// Decorative shapes are positioned with "start"/"end" relative to reading
// direction: in RTL, start is the right edge.
const atEnd = (ctx, W, x, w) => (ctx.rtl === false ? W - x - w : x);
const atStart = (ctx, W, x, w) => (ctx.rtl === false ? x : W - x - w);

export const COMPOSITIONS = {
  hero: {
    id: 'hero',
    version: 1,
    label: 'غلاف',
    role: 'hook',
    type: 'cover',
    description: 'عنوان جذّاب يفتتح الكاروسيل، مع رسم اختياري',
    tags: ['غلاف', 'عنوان', 'افتتاح', 'خطاف'],
    variants: { type: 'طباعي', art: 'مع رسم' },
    defaultVariant: 'type',
    reflow: { art: ['type'] },
    capacity: { titleChars: 60, subtitleChars: 140 },
    fields: [
      { key: 'kicker', label: 'الشارة', type: 'text' },
      { key: 'title', label: 'العنوان الرئيسي', type: 'textarea', required: true },
      { key: 'subtitle', label: 'العنوان الفرعي', type: 'textarea' },
      { key: 'art', label: 'الرسم', type: 'asset' },
    ],
    decor: (ctx, W, H) => [
      shapeElement('decor-circle', f(atEnd(ctx, W, -280, 760), -260, 760, 760), 'ellipse', '@accent', { opacity: 0.14, role: 'decor', name: 'دائرة زخرفية' }),
      shapeElement('decor-ring', f(atEnd(ctx, W, -140, 240), 560 + ctx.format.inset.top, 240, 240), 'ellipse', 'none', { stroke: '@accent', strokeWidth: 19, opacity: 0.16, role: 'decor', name: 'حلقة زخرفية' }),
    ],
    blocks: (c, v) => [
      c.kicker && { type: 'pill', id: 'kicker', text: c.kicker, size: [34, 28], slot: 'kicker', role: 'kicker', name: 'الشارة', anim: 'pop' },
      { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [124, FLOOR.title], lineHeight: 1.3, slot: 'title', role: 'title', name: 'العنوان', gap: 34, anim: 'rise' },
      { type: 'rule', id: 'title-rule', width: 160, height: 12, gap: 40 },
      c.subtitle && { type: 'text', id: 'subtitle', text: c.subtitle, size: [42, FLOOR.body], lineHeight: 1.7, color: '@muted', slot: 'subtitle', role: 'subtitle', name: 'العنوان الفرعي', gap: 40, anim: 'rise' },
      v === 'art' && { type: 'art', id: 'art', assetId: c.art ?? null, share: 0.36, minShare: 0.22, optional: true, slot: 'art', alt: c.artAlt, gap: 56 },
    ],
  },

  list: {
    id: 'list',
    version: 1,
    maxScale: 1.15,
    label: 'قائمة',
    role: 'content',
    type: 'list',
    description: 'خطوات أو نقاط مرقّمة، مع رسم لكل بند في التوزيع المصوّر',
    tags: ['قائمة', 'خطوات', 'نصائح', 'عادات', 'نقاط'],
    variants: { cards: 'بطاقات', grid: 'عمودان', illustrated: 'مصوّرة' },
    defaultVariant: 'cards',
    reflow: { cards: ['grid'], illustrated: ['cards', 'grid'] },
    capacity: { items: 6, itemChars: 70, titleChars: 50 },
    fields: [
      { key: 'title', label: 'العنوان', type: 'textarea', required: true },
      { key: 'items', label: 'البنود', type: 'list', required: true },
      { key: 'start', label: 'يبدأ الترقيم من', type: 'number' },
      { key: 'itemArt', label: 'رسوم البنود', type: 'assets' },
    ],
    decor: (ctx, W) => [shapeElement('decor-circle', f(atEnd(ctx, W, -120, 340), -120, 340, 340), 'ellipse', '@accent', { opacity: 0.1, role: 'decor', name: 'دائرة زخرفية' })],
    blocks: (c, v) => [
      { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [84, FLOOR.title], lineHeight: 1.35, slot: 'title', role: 'title', name: 'العنوان', anim: 'rise' },
      {
        type: 'list',
        id: 'item',
        items: nonEmpty(c.items),
        start: Number(c.start) || 1,
        size: [44, FLOOR.body],
        lineHeight: 1.6,
        card: true,
        columns: v === 'grid' ? 2 : 1,
        badge: v === 'illustrated' ? 'art' : 'number',
        itemArt: c.itemArt,
        itemArtAlt: c.itemArtAlt,
        slot: 'items',
        gap: 34,
      },
    ],
  },

  post: {
    id: 'post',
    version: 1,
    maxScale: 1.1,
    label: 'منشور مفرد',
    role: 'post',
    type: 'post',
    ownsCta: true,
    description: 'صفحة واحدة تحمل القصة كاملة: خطّاف ← محتوى ← دعوة',
    tags: ['منشور', 'بوست', 'خطاف', 'نقاط', 'دعوة'],
    variants: { stack: 'نقاط', grid: 'عمودان', illustrated: 'مصوّرة', art: 'مع رسم' },
    defaultVariant: 'stack',
    reflow: { art: ['stack', 'grid'], stack: ['grid'], illustrated: ['stack', 'grid'] },
    capacity: { items: 6, itemChars: 60, titleChars: 60 },
    fields: [
      { key: 'hook', label: 'الخطّاف', type: 'textarea', required: true },
      { key: 'points', label: 'المحتوى', type: 'list' },
      { key: 'cta', label: 'الدعوة للإجراء', type: 'text' },
      { key: 'art', label: 'الرسم', type: 'asset' },
      { key: 'itemArt', label: 'رسوم النقاط', type: 'assets' },
    ],
    decor: (ctx, W) => [shapeElement('decor-circle', f(atStart(ctx, W, -180, 520), -200, 520, 520), 'ellipse', '@accent', { opacity: 0.12, role: 'decor', name: 'دائرة زخرفية' })],
    blocks: (c, v) => [
      v === 'art' && { type: 'art', id: 'art', assetId: c.art ?? null, share: 0.3, minShare: 0.18, optional: true, slot: 'art', alt: c.artAlt },
      { type: 'text', id: 'hook', text: c.hook ?? '', font: '@heading', weightRole: 'black', size: [92, FLOOR.title], lineHeight: 1.3, slot: 'hook', role: 'title', name: 'الخطّاف', gap: 40, anim: 'rise' },
      { type: 'rule', id: 'hook-rule', width: 140, height: 10, gap: 26 },
      nonEmpty(c.points).length > 0 && {
        type: 'list',
        id: 'point',
        items: nonEmpty(c.points),
        size: [42, FLOOR.body],
        lineHeight: 1.6,
        card: false,
        columns: v === 'grid' ? 2 : 1,
        badge: v === 'illustrated' ? 'art' : 'check',
        itemArt: c.itemArt,
        itemArtAlt: c.itemArtAlt,
        slot: 'points',
        gap: 38,
      },
      c.cta && { type: 'pill', id: 'cta', text: c.cta, size: [40, FLOOR.body], icon: 'arrow', iconDirectional: true, slot: 'cta', role: 'cta', name: 'الدعوة', gap: 44, anim: 'pop', padY: 0.45 },
    ],
  },

  comparison: {
    id: 'comparison',
    version: 1,
    maxScale: 1.35,
    label: 'مقارنة',
    role: 'content',
    type: 'comparison',
    description: 'مقارنة بين حالتين: عمودان، أو صفّان للمحتوى الكثيف',
    tags: ['مقارنة', 'قبل وبعد', 'ميزان', 'فرق', 'خيارين'],
    variants: { columns: 'عمودان', rows: 'صفّان' },
    defaultVariant: 'columns',
    reflow: { columns: ['rows'] },
    capacity: { items: 4, itemChars: 40, titleChars: 40 },
    fields: [
      { key: 'title', label: 'العنوان', type: 'textarea', required: true },
      { key: 'beforeLabel', label: 'عنوان الجهة الأولى', type: 'text' },
      { key: 'before', label: 'بنود الجهة الأولى', type: 'list' },
      { key: 'afterLabel', label: 'عنوان الجهة الثانية', type: 'text' },
      { key: 'after', label: 'بنود الجهة الثانية', type: 'list' },
    ],
    decor: () => [],
    blocks: (c, v) => [
      { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [76, FLOOR.title], lineHeight: 1.35, align: 'center', slot: 'title', role: 'title', name: 'العنوان', anim: 'rise' },
      {
        type: 'compare',
        id: 'compare',
        size: [38, FLOOR.body - 2],
        stacked: v === 'rows',
        gap: 44,
        columns: [
          { label: { text: c.beforeLabel || 'قبل' }, labelSlot: 'beforeLabel', items: nonEmpty(c.before), slot: 'before', positive: false },
          { label: { text: c.afterLabel || 'بعد' }, labelSlot: 'afterLabel', items: nonEmpty(c.after), slot: 'after', positive: true },
        ],
      },
    ],
  },

  quote: {
    id: 'quote',
    version: 1,
    maxScale: 1.1,
    label: 'اقتباس',
    role: 'content',
    type: 'quote',
    description: 'اقتباس مؤثر مع اسم قائله وصورته',
    tags: ['اقتباس', 'حكمة', 'قول', 'شهادة'],
    variants: { bar: 'خط جانبي' },
    defaultVariant: 'bar',
    reflow: {},
    capacity: { quoteChars: 160 },
    fields: [
      { key: 'quote', label: 'نص الاقتباس', type: 'textarea', required: true },
      { key: 'author', label: 'القائل', type: 'text' },
      { key: 'role', label: 'الصفة', type: 'text' },
      { key: 'photo', label: 'صورة القائل', type: 'asset' },
    ],
    decor: (ctx, W) => [iconElement('decor-quote', f(atStart(ctx, W, 60, 420), 120 + ctx.format.inset.top, 420, 420), 'quote', '@accent', ctx, { directional: true, opacity: 0.12, role: 'decor', name: 'علامة اقتباس' })],
    blocks: (c) => [
      { type: 'text', id: 'quote', text: c.quote ?? '', font: '@heading', weightRole: 'bold', size: [72, 40], lineHeight: 1.65, bar: true, slot: 'quote', role: 'quote', name: 'الاقتباس', anim: 'rise' },
      c.author && { type: 'author', id: 'author', name: c.author, role: c.role, photoAssetId: c.photo ?? null, size: [36, 32], gap: 56 },
    ],
  },

  statement: {
    id: 'statement',
    version: 1,
    label: 'جملة طباعية',
    role: 'content',
    type: 'typographic',
    description: 'تصميم طباعي: جملة واحدة كبيرة تحمل الفكرة',
    tags: ['طباعي', 'جملة', 'رسالة', 'سؤال', 'رقم'],
    variants: { block: 'كتلة لونية' },
    defaultVariant: 'block',
    reflow: {},
    capacity: { titleChars: 70 },
    fields: [
      { key: 'kicker', label: 'تمهيد', type: 'text' },
      { key: 'title', label: 'الجملة', type: 'textarea', required: true },
      { key: 'subtitle', label: 'سطر داعم', type: 'textarea' },
    ],
    decor: (ctx, W, H) => [
      shapeElement('decor-band', f(atStart(ctx, W, 0, 36), ctx.format.inset.top + 150, 36, H - ctx.format.inset.top - ctx.format.inset.bottom - 300), 'rect', '@accent', { role: 'decor', name: 'شريط لوني' }),
      shapeElement('decor-block', f(atEnd(ctx, W, -160, 520), H - ctx.format.inset.bottom - 420, 520, 520), 'rect', '@surface', { radius: 60, rotation: 12, role: 'decor', name: 'كتلة زخرفية' }),
    ],
    blocks: (c) => [
      c.kicker && { type: 'text', id: 'kicker', text: c.kicker, weightRole: 'bold', size: [36, 28], lineHeight: 1.5, color: '@accent', slot: 'kicker', role: 'kicker', name: 'التمهيد', anim: 'fade' },
      { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [136, 64], lineHeight: 1.25, slot: 'title', role: 'title', name: 'الجملة', gap: 28, anim: 'rise' },
      c.subtitle && { type: 'text', id: 'subtitle', text: c.subtitle, size: [40, FLOOR.body], lineHeight: 1.7, color: '@muted', slot: 'subtitle', role: 'subtitle', name: 'السطر الداعم', gap: 44, anim: 'rise' },
    ],
  },

  collage: {
    id: 'collage',
    version: 1,
    label: 'كولاج تحريري',
    role: 'hook',
    type: 'collage',
    description: 'قصاصات متراكبة بزوايا مائلة مع عنوان تحريري',
    tags: ['كولاج', 'تحريري', 'قصاصات', 'مجلة', 'ذكريات', 'كتب'],
    variants: { top: 'الكولاج أعلى', bottom: 'الكولاج أسفل' },
    defaultVariant: 'top',
    reflow: {},
    capacity: { titleChars: 50, art: 4 },
    fields: [
      { key: 'kicker', label: 'الشارة', type: 'text' },
      { key: 'title', label: 'العنوان', type: 'textarea', required: true },
      { key: 'subtitle', label: 'سطر داعم', type: 'textarea' },
      { key: 'art', label: 'القصاصات', type: 'assets' },
    ],
    decor: () => [],
    blocks: (c, v) => {
      const collage = { type: 'collage', id: 'collage', assets: Array.isArray(c.art) ? c.art : c.art ? [c.art] : [], alts: c.artAlt, share: 0.5, minShare: 0.34, optional: true, gap: 48 };
      const text = [
        c.kicker && { type: 'pill', id: 'kicker', text: c.kicker, size: [32, 28], slot: 'kicker', role: 'kicker', name: 'الشارة', anim: 'pop', gap: 40 },
        { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [100, FLOOR.title], lineHeight: 1.3, slot: 'title', role: 'title', name: 'العنوان', gap: 28, anim: 'rise' },
        c.subtitle && { type: 'text', id: 'subtitle', text: c.subtitle, size: [40, FLOOR.body], lineHeight: 1.7, color: '@muted', slot: 'subtitle', role: 'subtitle', name: 'السطر الداعم', gap: 32, anim: 'rise' },
      ];
      return v === 'bottom' ? [...text, collage] : [collage, ...text];
    },
  },

  // A big number or short figure with one line of meaning: reel scenes and
  // list items that deserve their own page ("3 دقائق", "70%", "الخطوة 2").
  numbered: {
    id: 'numbered',
    version: 1,
    label: 'رقم كبير',
    role: 'content',
    type: 'numbered',
    description: 'رقم أو معلومة رقمية كبيرة مع سطر يشرحها: مشهد ريل أو بند يستحق صفحة',
    tags: ['رقم', 'خطوة', 'إحصائية', 'ريل', 'مشهد', 'بند'],
    variants: { type: 'طباعي', center: 'وسط', art: 'مع رسم' },
    defaultVariant: 'type',
    reflow: { art: ['type'], center: ['type'] },
    capacity: { titleChars: 70, subtitleChars: 110 },
    fields: [
      { key: 'number', label: 'الرقم', type: 'text', required: true },
      { key: 'title', label: 'الجملة', type: 'textarea', required: true },
      { key: 'subtitle', label: 'سطر داعم', type: 'textarea' },
      { key: 'art', label: 'الرسم', type: 'asset' },
    ],
    decor: (ctx, W, H) => [
      shapeElement('decor-circle', f(atEnd(ctx, W, -220, 640), ctx.format.inset.top + 40, 640, 640), 'ellipse', '@accent', { opacity: 0.12, role: 'decor', name: 'دائرة زخرفية' }),
      shapeElement('decor-band', f(atStart(ctx, W, 0, 28), H - ctx.format.inset.bottom - 360, 28, 240), 'rect', '@accent', { role: 'decor', name: 'شريط لوني' }),
    ],
    blocks: (c, v) => {
      const align = v === 'center' ? 'center' : undefined;
      return [
        { type: 'text', id: 'number', text: c.number ?? '', font: '@heading', weightRole: 'black', size: [300, 160], lineHeight: 1.1, ...figureType(c.number), color: '@accent', align, slot: 'number', role: 'number', name: 'الرقم', anim: 'pop' },
        { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [104, FLOOR.title], lineHeight: 1.3, align, slot: 'title', role: 'title', name: 'الجملة', gap: afterFigure(c.number, 24), anim: 'rise' },
        c.subtitle && { type: 'text', id: 'subtitle', text: c.subtitle, size: [44, FLOOR.body], lineHeight: 1.6, color: '@muted', align, slot: 'subtitle', role: 'subtitle', name: 'السطر الداعم', gap: 36, anim: 'rise' },
        v === 'art' && { type: 'art', id: 'art', assetId: c.art ?? null, share: 0.3, minShare: 0.18, optional: true, slot: 'art', alt: c.artAlt, gap: 56 },
      ];
    },
  },

  // A figure with its meaning and its source: the evidence page of a
  // carousel ("70% من الانطباع…" — المصدر). The source line is part of the
  // content, never invented: without one the page says nothing about it.
  stat: {
    id: 'stat',
    version: 1,
    maxScale: 1.1,
    label: 'رقم ودليل',
    role: 'content',
    type: 'stat',
    description: 'رقم أو نسبة كبيرة مع معناها ومصدرها: صفحة الدليل',
    tags: ['إحصائية', 'دليل', 'نسبة', 'رقم', 'دراسة', 'مصدر'],
    variants: { type: 'طباعي', center: 'وسط' },
    defaultVariant: 'type',
    reflow: { center: ['type'] },
    capacity: { titleChars: 90, sourceChars: 80 },
    fields: [
      { key: 'kicker', label: 'تمهيد', type: 'text' },
      { key: 'figure', label: 'الرقم', type: 'text', required: true },
      { key: 'title', label: 'معناه', type: 'textarea', required: true },
      { key: 'source', label: 'المصدر', type: 'text' },
    ],
    decor: (ctx, W, H) => [shapeElement('decor-band', f(atStart(ctx, W, 0, 28), ctx.format.inset.top + 150, 28, 260), 'rect', '@accent', { role: 'decor', name: 'شريط لوني' })],
    blocks: (c, v) => {
      const align = v === 'center' ? 'center' : undefined;
      return [
        c.kicker && { type: 'text', id: 'kicker', text: c.kicker, weightRole: 'bold', size: [36, 28], lineHeight: 1.5, color: '@accent', align, slot: 'kicker', role: 'kicker', name: 'التمهيد', anim: 'fade' },
        { type: 'text', id: 'figure', text: c.figure ?? '', font: '@heading', weightRole: 'black', size: [260, 140], lineHeight: 1.15, ...figureType(c.figure), color: '@accent', align, slot: 'figure', role: 'number', name: 'الرقم', gap: 20, anim: 'pop' },
        { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'bold', size: [64, FLOOR.title], lineHeight: 1.4, align, slot: 'title', role: 'title', name: 'المعنى', gap: afterFigure(c.figure, 28), anim: 'rise' },
        c.source && { type: 'rule', id: 'source-rule', width: 96, height: 4, gap: 44, align },
        c.source && { type: 'text', id: 'source', text: c.source, size: [32, FLOOR.body - 4], lineHeight: 1.6, color: '@muted', align, slot: 'source', role: 'source', name: 'المصدر', gap: 22, anim: 'fade' },
      ];
    },
  },

  // A framework: named parts, each with a short explanation, as a grid of
  // tiles or a chain (one after the other, joined). Parts and their
  // explanations are parallel lists so each text keeps its own slot.
  framework: {
    id: 'framework',
    version: 1,
    maxScale: 1.1,
    label: 'إطار عمل',
    role: 'content',
    type: 'framework',
    description: 'إطار عمل: أجزاء مسمّاة لكل منها شرح قصير، في شبكة أو سلسلة',
    tags: ['إطار', 'نموذج', 'مراحل', 'أركان', 'منهج', 'خطوات'],
    variants: { grid: 'شبكة', chain: 'سلسلة' },
    defaultVariant: 'grid',
    reflow: { chain: ['grid'], grid: ['chain'] },
    capacity: { items: 6, itemChars: 30, detailChars: 70, titleChars: 50 },
    fields: [
      { key: 'title', label: 'العنوان', type: 'textarea', required: true },
      { key: 'parts', label: 'الأجزاء', type: 'list', required: true },
      { key: 'details', label: 'شرح كل جزء', type: 'list' },
    ],
    decor: (ctx, W) => [shapeElement('decor-circle', f(atEnd(ctx, W, -120, 340), -120, 340, 340), 'ellipse', '@accent', { opacity: 0.1, role: 'decor', name: 'دائرة زخرفية' })],
    blocks: (c, v) => {
      const parts = nonEmpty(c.parts);
      const details = Array.isArray(c.details) ? c.details : [];
      return [
        { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [80, FLOOR.title], lineHeight: 1.35, slot: 'title', role: 'title', name: 'العنوان', anim: 'rise' },
        { type: 'tiles', id: 'part', heads: parts, bodies: parts.map((_, i) => (typeof details[i] === 'string' && details[i].trim() ? details[i] : null)), size: [36, FLOOR.body - 2], columns: v === 'chain' ? 1 : 2, connect: v === 'chain', numbered: true, slot: 'parts', bodySlot: 'details', gap: 40 },
      ];
    },
  },

  outro: {
    id: 'outro',
    version: 1,
    label: 'خاتمة',
    role: 'cta',
    type: 'outro',
    ownsCta: true,
    hideBrandBadge: true,
    description: 'دعوة للحفظ والمتابعة مع هويتك وحساباتك',
    tags: ['خاتمة', 'دعوة', 'متابعة', 'حفظ'],
    variants: { center: 'وسط' },
    defaultVariant: 'center',
    reflow: {},
    capacity: { titleChars: 50 },
    fields: [
      { key: 'title', label: 'العنوان', type: 'textarea', required: true },
      { key: 'subtitle', label: 'العنوان الفرعي', type: 'textarea' },
      { key: 'save', label: 'زر الحفظ', type: 'text' },
      { key: 'share', label: 'زر المشاركة', type: 'text' },
      { key: 'follow', label: 'زر المتابعة', type: 'text' },
      { key: 'socials', label: 'الحسابات والروابط', type: 'list' },
    ],
    decor: (ctx, W, H) => [shapeElement('decor-circle', f(atStart(ctx, W, -260, 900), H - 380 - ctx.format.inset.bottom, 900, 900), 'ellipse', '@accent', { opacity: 0.1, role: 'decor', name: 'دائرة زخرفية' })],
    blocks: (c, v, ctx) => {
      const brand = ctx.brand ?? {};
      const actions = [
        c.save && { text: c.save, icon: 'bookmark', fill: '@accent', color: '@onAccent', id: 'action-save', slot: 'save', name: 'زر الحفظ' },
        c.share && { text: c.share, icon: 'share', fill: '@surface', color: '@text', id: 'action-share', slot: 'share', name: 'زر المشاركة' },
        c.follow && { text: c.follow, icon: 'follow', fill: '@surface', color: '@text', id: 'action-follow', slot: 'follow', name: 'زر المتابعة' },
      ].filter(Boolean);
      const socials = nonEmpty(c.socials).map((s, i) => ({ text: s, id: `social-${i + 1}`, fill: '@surface', color: '@muted', weightRole: 'regular', slot: `socials.${i}`, name: `حساب ${formatNumber(i + 1, ctx.theme.numerals)}` }));
      const handleLine = [brand.name, brand.handle].filter(Boolean).join(' ');
      return [
        { type: 'avatar', id: 'avatar', size: [200, 150], ring: true, assetId: brand.avatarAssetId ?? null, initial: Array.from(brand.name?.trim() || '؟')[0] },
        handleLine && { type: 'text', id: 'brand-line', text: handleLine, weightRole: 'bold', size: [34, 28], lineHeight: 1.5, align: 'center', role: 'brand', name: 'الحساب', gap: 26, anim: 'fade' },
        { type: 'text', id: 'title', text: c.title ?? '', font: '@heading', weightRole: 'black', size: [92, FLOOR.title], lineHeight: 1.3, align: 'center', slot: 'title', role: 'title', name: 'العنوان', gap: 22, anim: 'rise' },
        c.subtitle && { type: 'text', id: 'subtitle', text: c.subtitle, size: [36, 30], lineHeight: 1.7, align: 'center', color: '@muted', slot: 'subtitle', role: 'subtitle', name: 'العنوان الفرعي', gap: 22, anim: 'rise' },
        actions.length > 0 && { type: 'pills', id: 'actions', items: actions, size: [32, 28], gap: 34 },
        socials.length > 0 && { type: 'pills', id: 'socials', items: socials, size: [28, 26], gap: 24 },
      ];
    },
  },
};

export const compositionList = Object.values(COMPOSITIONS);

export function compositionOf(id) {
  const c = COMPOSITIONS[id];
  if (!c) throw new Error(`unknown composition "${id}" (known: ${Object.keys(COMPOSITIONS).join(', ')})`);
  return c;
}

// Content keys that hold text (for completeness checks and text caches).
export function contentTexts(compositionId, content) {
  const comp = COMPOSITIONS[compositionId];
  if (!comp) return [];
  const out = [];
  for (const field of comp.fields) {
    const v = content?.[field.key];
    if (field.type === 'text' || field.type === 'textarea') {
      if (typeof v === 'string' && v.trim()) out.push({ slot: field.key, text: v });
    } else if (field.type === 'list') {
      nonEmpty(v).forEach((t, i) => out.push({ slot: `${field.key}.${i}`, text: t }));
    }
  }
  if (compositionId === 'comparison') {
    // Labels default to «قبل» / «بعد» when left empty.
    if (!content?.beforeLabel) out.push({ slot: 'beforeLabel', text: 'قبل', implicit: true });
    if (!content?.afterLabel) out.push({ slot: 'afterLabel', text: 'بعد', implicit: true });
  }
  return out;
}

export function validateContent(compositionId, content, path = 'content') {
  const comp = COMPOSITIONS[compositionId];
  if (!comp) return [{ path: 'composition', message: `unknown composition "${compositionId}"` }];
  const out = [];
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return [{ path, message: 'must be an object' }];
  const keys = new Set(comp.fields.map((x) => x.key));
  for (const [key, value] of Object.entries(content)) {
    if (key.endsWith('Alt')) continue;
    if (!keys.has(key)) {
      out.push({ path: `${path}.${key}`, message: `not a field of "${compositionId}" (allowed: ${[...keys].join(', ')})` });
      continue;
    }
    const field = comp.fields.find((x) => x.key === key);
    const ok =
      field.type === 'text' || field.type === 'textarea'
        ? typeof value === 'string'
        : field.type === 'list'
          ? Array.isArray(value) && value.every((v) => typeof v === 'string')
          : field.type === 'number'
            ? Number.isInteger(value) && value >= 1
            : field.type === 'asset'
              ? value === null || typeof value === 'string'
              : Array.isArray(value) && value.every((v) => v === null || typeof v === 'string');
    if (!ok) out.push({ path: `${path}.${key}`, message: `expected ${field.type}` });
  }
  for (const field of comp.fields) {
    if (field.required) {
      const v = content[field.key];
      if (!(typeof v === 'string' ? v.trim() : Array.isArray(v) ? nonEmpty(v).length : v)) out.push({ path: `${path}.${field.key}`, message: 'required' });
    }
  }
  return out;
}
