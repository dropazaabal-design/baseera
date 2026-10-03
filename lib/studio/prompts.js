import { FONTS } from '../fonts.js';
import { plainText } from './measure.js';
import { resolveStyle } from './styles.js';
import { pageTheme, resolveColor, resolveFont } from './theme.js';

// A composed design described for people and image tools: the storyboard
// table, the ready copy of every slide, and one generation prompt per slide
// with the negative prompt. Everything is read from the document itself
// (texts, frames, colours, fonts, marked words), so the prompts say what
// the design actually is, never a paraphrase of it. Used by `studio prompts`
// and the carousel-director skill.

// The negative prompt the creator's brief asks for, word for word.
export const NEGATIVE_PROMPT = 'بدون زحمة، بدون نصوص صغيرة، بدون أخطاء عربية، بدون حروف مقطعة، بدون عكس اتجاه النص، بدون شعارات عشوائية، بدون عناصر مشتتة، بدون ألوان كثيرة، بدون صور غير مرتبطة، بدون watermark، بدون ازدحام بصري، بدون تكوين ضعيف، بدون محاذاة عشوائية.';

// Slide types in the brief's vocabulary, from the composition and layout.
const TYPES = {
  hero: 'غلاف (خطّاف)',
  opener: 'غلاف برقم كبير (خطّاف)',
  collage: 'غلاف كولاج (خطّاف)',
  'concept/plain': 'نص كبير',
  'concept/box': 'مربع مركزي',
  'concept/callout': 'شرح وخلاصة مظلّلة',
  'concept/panel': 'خلاصة جريئة في لوح',
  'concept/rule': 'عنوان وفاصل ونص',
  'concept/figure': 'رقم كبير',
  flow: 'خط سير بصري (من ← إلى)',
  list: 'قائمة مختصرة',
  post: 'منشور مفرد',
  comparison: 'مقارنة بسيطة',
  quote: 'اقتباس',
  statement: 'جملة طباعية',
  numbered: 'رقم وخطوة',
  stat: 'رقم ودليل',
  framework: 'إطار عمل',
  outro: 'دعوة (CTA)',
  actions: 'دعوة (CTA) بأزرار',
};

const typeOf = (page) => TYPES[`${page.composition.id}/${page.layout?.variant ?? page.composition.variant}`] ?? TYPES[page.composition.id] ?? page.composition.id;

// What a slide is for, by its place in the sequence (the director may
// replace it with the purpose it planned).
function goalOf(page, i, total) {
  const id = page.composition.id;
  if (['hero', 'opener', 'collage'].includes(id) && i === 0) return 'إيقاف التمرير وإثارة الفضول';
  if (['outro', 'actions'].includes(id)) return 'الحفظ والمشاركة';
  if (i === 1) return 'تمهيد: لماذا يهمّك هذا';
  if (i === total - 2) return 'تثبيت آخر فكرة قبل الدعوة';
  return 'قيمة: فكرة واحدة واضحة';
}

const WEIGHT = (w) => (w >= 800 ? 'أسود (Black)' : w >= 700 ? 'عريض (Bold)' : w >= 500 ? 'متوسط (Medium)' : 'عادي (Regular)');
const where = (f, H) => {
  const c = (f.y + f.height / 2) / H;
  return c < 0.36 ? 'في الثلث العلوي' : c < 0.64 ? 'في الوسط' : 'في الثلث السفلي';
};
const alignOf = (el) => (el.style.align === 'center' ? 'في الوسط' : el.style.direction === 'ltr' ? 'من اليسار' : 'من اليمين');
// The words between *…* markers.
const marked = (text) => [...String(text ?? '').matchAll(/\*([^*]+)\*/g)].map((m) => m[1].trim());
const clean = (text) => plainText(text).replace(/\n/g, ' / ');

const LABEL = { kicker: 'التمهيد', title: 'العنوان', number: 'الرقم الكبير', subtitle: 'السطر الداعم', body: 'النص', item: 'بند', quote: 'الاقتباس', author: 'القائل', caption: 'الصفة', source: 'المصدر', cta: 'زر', label: 'شارة', brand: 'الحساب', role: 'الصفة' };

// One slide described: its texts in reading order, its marked words, its
// shapes as visual elements, and its system chrome.
export function describePage(doc, page, i) {
  const { colors, fonts } = pageTheme(doc, page);
  const H = page.heightPx;
  const els = page.elements.filter((e) => !e.hidden);
  const texts = els.filter((e) => e.kind === 'text' && e.role !== 'system' && e.role !== 'decor' && plainText(e.text).trim()).sort((a, b) => a.frame.y - b.frame.y || b.frame.x - a.frame.x);
  const lines = texts.map((e) => {
    const font = resolveFont(e.style.fontFamily, fonts);
    return {
      id: e.id,
      label: e.name ?? LABEL[e.role] ?? 'نص',
      text: clean(e.text),
      raw: e.text,
      marked: marked(e.text),
      highlight: e.style.highlight ? resolveColor(e.style.highlight, colors) : null,
      accent: e.text.includes('*') && !e.style.highlight ? colors.accent : null,
      font: FONTS[font]?.label ?? font,
      weight: WEIGHT(e.style.weight),
      size: Math.round(e.style.fontSize),
      color: resolveColor(e.style.color, colors),
      where: where(e.frame, H),
      align: alignOf(e),
    };
  });
  const shapes = els.filter((e) => e.kind === 'shape' && e.role === 'decor');
  // The most telling element first (it fills the storyboard's column).
  const visual = [];
  const has = (re) => shapes.some((e) => re.test(e.id));
  if (has(/^action-.*-bg$/)) visual.push('صفّا إجراء بعرض الصفحة: الأول مملوء بلون التظليل مع أيقونة حفظ، والثاني بإطار رفيع مع أيقونة إرسال، والأيقونة عند الطرف الأيسر');
  if (has(/^step-\d+-arrow$/)) visual.push(`مربعات رفيعة متتالية بينها دائرة صغيرة بإطار رفيع وسهم نازل بلون التمييز${shapes.some((e) => /^step-\d+-box$/.test(e.id) && e.fill !== 'none') ? '، والمربع الأخير مملوء بلون التظليل' : ''}`);
  if (has(/^step-\d+-mark$/)) visual.push('شريط تظليل خلف عنوان كل مربع');
  if (has(/-band$/)) visual.push(`شريط تظليل أفقي بعرض العمود باللون ${resolveColor('@highlight', colors)} خلف الرقم الكبير`);
  for (const s of shapes) {
    if (!/-box$/.test(s.id) || /^step-/.test(s.id)) continue;
    const owner = lines.find((l) => s.id === `${l.id}-box`)?.text ?? 'الفكرة';
    visual.push(s.fill === 'none' ? `إطار رفيع بلون ${resolveColor(s.stroke ?? '@line', colors)} حول «${owner}»` : `لوح ${s.stroke ? 'بإطار رفيع ' : ''}مملوء باللون ${resolveColor(s.fill, colors)} خلف «${owner}»`);
  }
  if (has(/-rule$/)) visual.push(`خط فاصل رفيع أفقي بلون ${resolveColor(shapes.find((e) => /-rule$/.test(e.id)).fill, colors)}`);
  if (els.some((e) => e.kind === 'image')) visual.push('رسم مسطح بسيط بلا نصوص ولا وجوه');
  const sys = els.filter((e) => e.role === 'system' && e.kind === 'text').map((e) => ({ name: e.name, text: plainText(e.text), where: where(e.frame, H), side: e.frame.x + e.frame.width / 2 < page.widthPx / 2 ? 'يسار' : 'يمين' }));
  return { index: i + 1, total: doc.pages.length, type: typeOf(page), goal: goalOf(page, i, doc.pages.length), size: `${page.widthPx}×${H}`, bg: colors.bg, colors, lines, visual: [...new Set(visual)], system: sys };
}

function promptOf(d, style) {
  const out = [];
  out.push(`صمّم الشريحة ${d.index} من ${d.total} لكاروسيل إنستغرام عربي: ${d.type}.`);
  out.push(`المقاس ${d.size} بكسل عمودي، خلفية ${d.bg === '#FFFFFF' ? 'بيضاء نظيفة' : 'سادة'} (${d.bg})، هوامش آمنة نحو 96 بكسل من الجانبين.`);
  for (const l of d.lines) {
    out.push(`${l.label} ${l.where} ${l.align}، بخط ${l.font} ${l.weight} بحجم نحو ${l.size} بكسل، بلون ${l.color}: «${l.text}»`);
  }
  const hl = d.lines.filter((l) => l.marked.length && l.highlight);
  if (hl.length) out.push(`الهايلايت: شريط تظليل فاتح (${hl[0].highlight}) خلف النصف السفلي من ${hl.flatMap((l) => l.marked.map((w) => `«${w}»`)).join(' و')} فقط، والنص فوقه بلونه الأسود.`);
  const ac = d.lines.filter((l) => l.marked.length && l.accent);
  if (ac.length) out.push(`تمييز: ${ac.flatMap((l) => l.marked.map((w) => `«${w}»`)).join(' و')} بلون التمييز ${ac[0].accent} بلا شريط.`);
  if (d.visual.length) out.push(`العناصر البصرية: ${d.visual.join('؛ ')}.`);
  if (d.system.length) out.push(`عناصر ثابتة صغيرة: ${d.system.map((s) => `«${s.text}» ${s.where} ${s.side === 'يسار' ? 'يسارًا' : 'يمينًا'}`).join('، ')}.`);
  if (style) out.push(`الإحساس العام: ${style.tone ?? ''}؛ ${style.purpose ?? ''}.`.replace('؛ .', '.'));
  out.push('التوازن البصري: فكرة واحدة فقط، مساحات بيضاء واسعة، والعين تقرأ العنوان أولًا ثم الكلمة المظللة ثم النص ثم العنصر المساعد.');
  out.push('شريحة احترافية نظيفة سهلة القراءة على الهاتف، نص عربي صحيح من اليمين إلى اليسار بحروف متصلة غير مقطعة، والنصوص كما هي حرفيًا دون زيادة أو نقص.');
  return out.join('\n');
}

export function designPrompts(doc) {
  const style = resolveStyle(doc);
  return doc.pages.map((page, i) => {
    const d = describePage(doc, page, i);
    return { ...d, prompt: promptOf(d, style), negative: NEGATIVE_PROMPT };
  });
}

const cell = (s) => String(s ?? '').replace(/\|/g, '¦').replace(/\n/g, ' ');

// Markdown: storyboard, ready copy, prompts. Sections numbered as in the
// creator's brief (5, 9, 10, 11) so the director can merge them.
export function promptsMarkdown(doc) {
  const list = designPrompts(doc);
  const md = [];
  md.push(`# ${doc.brief || doc.id}`, '');
  md.push('## Storyboard بصري', '');
  md.push('| # | الهدف | النص الظاهر | نوع الشريحة | توزيع العناصر | العنصر البصري الرئيسي | الهايلايت | ملاحظة للمصمم |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const d of list) {
    const title = d.lines.find((l) => l.label === 'العنوان') ?? d.lines[0];
    // Neighbours in the same third are named once («المرحلة 1 وشرح المرحلة 1 في الوسط»).
    const groups = [];
    for (const l of d.lines) {
      if (groups.length && groups.at(-1).where === l.where) groups.at(-1).labels.push(l.label);
      else groups.push({ where: l.where, labels: [l.label] });
    }
    const layout = groups.map((g) => `${g.labels.join(' و')} ${g.where}`).join('، ');
    const words = d.lines.flatMap((l) => l.marked).map((w) => `«${w}»`).join(' ') || '—';
    md.push(`| ${d.index} | ${cell(d.goal)} | ${cell(title?.text)} | ${cell(d.type)} | ${cell(layout)} | ${cell(d.visual[0] ?? 'مساحة بيضاء ونص فقط')} | ${cell(words)} | ${cell(title ? `العنوان ${title.align} بخط ${title.font} ${title.weight} ${title.size} بكسل` : '')} |`);
  }
  md.push('', '## النسخة النهائية الجاهزة للتصميم', '');
  for (const d of list) {
    md.push(`**الشريحة ${d.index} — ${d.type}**`, '');
    for (const l of d.lines) md.push(`- ${l.label}: ${plainText(l.raw).split('\n').join(' ⏎ ')}${l.marked.length ? ` (مظلّل: ${l.marked.map((w) => `«${w}»`).join('، ')})` : ''}`);
    md.push('');
  }
  md.push('## برومبتات توليد التصميم', '');
  for (const d of list) {
    md.push(`### الشريحة ${d.index}`, '', '```text', d.prompt, `سلبي: ${d.negative}`, '```', '');
  }
  return md.join('\n');
}
