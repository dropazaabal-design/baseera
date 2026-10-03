import { formatNumber } from '../numerals.js';
import { normalizeArabic } from './arabic.js';
import { FORMATS } from './contracts.js';
import { composeAll, setFormat, updatePage } from './document.js';
import { applyPatches } from './patch.js';
import { colorWordIn, matchesColorWord, withColor } from './theme.js';
import { now } from './util.js';

// Conversational editing: an Arabic instruction becomes a structured,
// targeted edit. Simple edits (sizes, colours from the brand, moves, locks,
// replacing text the user typed, layout variants, format) run locally with
// no AI call. Edits that need new content say so in `needs`:
//   asset    a new illustration for one element (generate only that one)
//   rewrite  shortening or rephrasing text (the assistant writes it)
//   recompose / generate  a new layout or a new visual direction
// When the target is ambiguous the result lists the candidates instead of
// guessing, so a graphic command can never land on approved text.

export { normalizeArabic };

// Strips attached conjunctions and prepositions: و ف ب ل ك (and لل → ال).
function stem(word) {
  let w = word;
  if (/^[وف]/.test(w) && w.length > 3) w = w.slice(1);
  if (w.startsWith('لل') && w.length > 3) return `ال${w.slice(2)}`;
  if (/^[بلك]ال/.test(w)) w = w.slice(1);
  return w;
}

function matcher(text) {
  const norm = normalizeArabic(text);
  const words = norm.split(' ').map(stem);
  const has = (forms) =>
    forms.some((f) => {
      const nf = normalizeArabic(f);
      return nf.includes(' ') ? norm.includes(nf) : words.some((w) => w === nf || w === `ال${nf}`);
    });
  return { norm, words, has };
}

const TARGETS = [
  { id: 'subtitle', forms: ['العنوان الفرعي', 'السطر الداعم', 'الوصف', 'النص الفرعي'], roles: ['subtitle'] },
  { id: 'swipe', forms: ['دعوه السحب', 'زر السحب', 'اسحب'], ids: ['sys-swipe', 'sys-swipe-bg', 'sys-swipe-arrow'], system: true },
  { id: 'counter', forms: ['العداد', 'الترقيم', 'رقم الشريحه'], ids: ['sys-counter', 'sys-counter-bg'], system: true },
  { id: 'progress', forms: ['شريط التقدم'], ids: ['sys-progress', 'sys-progress-track'], system: true },
  { id: 'logo', forms: ['الشعار', 'اللوقو', 'اللوغو', 'الشعار'], ids: ['sys-logo'], system: true },
  { id: 'brand', forms: ['اسم الحساب', 'المعرف', 'شاره الحساب', 'الحساب'], ids: ['sys-brand-name', 'sys-brand-handle', 'sys-avatar', 'sys-avatar-bg', 'sys-avatar-initial'], system: true },
  { id: 'title', forms: ['العنوان', 'الخطاف', 'الجمله', 'العنوان الرئيسي'], roles: ['title'] },
  { id: 'kicker', forms: ['الشاره', 'التمهيد'], roles: ['kicker'] },
  { id: 'cta', forms: ['الدعوه', 'زر الدعوه', 'الزر'], roles: ['cta'] },
  { id: 'quote', forms: ['الاقتباس'], roles: ['quote'] },
  { id: 'author', forms: ['القائل', 'اسم القائل'], roles: ['author', 'caption'] },
  { id: 'art', forms: ['الرسم', 'الرسمه', 'الصوره', 'الايقونه', 'القصاصه', 'الجرافيك', 'الرسوم', 'الصور', 'الرسومات', 'التصميم الجرافيكي'], roles: ['art', 'art-placeholder', 'photo'] },
  // Body lines of the educational layouts (concept) answer to the same words.
  { id: 'items', forms: ['البنود', 'البند', 'النقاط', 'النقطه', 'القائمه', 'المتن', 'النص', 'السطور', 'الشرح', 'الكلام', 'الخط'], roles: ['item', 'body'] },
  { id: 'background', forms: ['الخلفيه', 'لون الخلفيه'], background: true },
];

const ORDINALS = [
  ['الاول', 'الاولي', 'اول'],
  ['الثاني', 'الثانيه', 'ثاني'],
  ['الثالث', 'الثالثه', 'ثالث'],
  ['الرابع', 'الرابعه', 'رابع'],
  ['الخامس', 'الخامسه', 'خامس'],
  ['السادس', 'السادسه', 'سادس'],
  ['السابع', 'السابعه', 'سابع'],
  ['الثامن', 'الثامنه', 'ثامن'],
  ['التاسع', 'التاسعه', 'تاسع'],
  ['العاشر', 'العاشره', 'عاشر'],
];

function ordinalAfter(m, anchorForms) {
  // "الرسم الرابع", "الرسم رقم 4", "البند 3", "الصورة الأخيرة"
  for (const form of anchorForms) {
    const f = normalizeArabic(form);
    const at = m.norm.indexOf(f);
    if (at < 0) continue;
    const rest = m.norm.slice(at + f.length).trim().split(' ').slice(0, 3);
    for (const w of rest) {
      const n = /^(?:رقم)?(\d{1,2})$/.exec(w);
      if (n) return Number(n[1]);
      const idx = ORDINALS.findIndex((forms) => forms.includes(w));
      if (idx >= 0) return idx + 1;
      if (w === 'الاخير' || w === 'الاخيره') return -1;
      if (w === 'رقم') continue;
      break;
    }
  }
  return null;
}

function pageOrdinal(m) {
  for (const anchor of ['الشريحه', 'الصفحه', 'السلايد']) {
    const n = ordinalAfter(m, [anchor]);
    if (n) return n;
  }
  return null;
}

const quoteRe = /[«"“](.+?)[»"”]/s;
function quotedText(text) {
  const q = quoteRe.exec(text);
  if (q) return q[1].trim();
  const colon = /(?:إلى|الى|ليصبح|لتصبح|:)\s*(.+)$/s.exec(text);
  return colon ? colon[1].trim() : null;
}

function amount(m) {
  if (m.has(['قليلا', 'قليل', 'شوي', 'شويه', 'بسيط', 'بسيطا', 'خفيف', 'خفيفا'])) return 0.1;
  if (m.has(['كثيرا', 'كثير', 'جدا', 'مره', 'بوضوح', 'كبير'])) return 0.3;
  return 0.18;
}

const VERBS = {
  bigger: ['كبر', 'كبري', 'زد', 'زيد', 'ضخم', 'كبروا', 'اكبر', 'كبّر'],
  smaller: ['صغر', 'صغري', 'قلل', 'اصغر', 'صغّر', 'نقص'],
  replace: ['غير', 'بدل', 'استبدل', 'ابدل', 'حول', 'اجعل', 'خل', 'خلي', 'اكتب'],
  move: ['حرك', 'انقل', 'ارفع', 'انزل', 'زح', 'ازح'],
  lock: ['اقفل', 'ثبت', 'قفل', 'اغلق'],
  unlock: ['افتح', 'فك', 'الغ قفل', 'ألغِ قفل'],
  remove: ['احذف', 'ازل', 'امسح', 'شيل'],
  hide: ['اخف', 'اخفي', 'خبي', 'اخفاء'],
  show: ['اظهر', 'اعرض', 'رجع'],
  shorten: ['اختصر', 'قصر', 'اختزل', 'لخص', 'اوجز'],
  center: ['وسط', 'توسيط'],
  undo: ['تراجع', 'تراجعي', 'الغ اخر', 'رجوع'],
  redo: ['اعد', 'اعادة'],
};

const hasVerb = (m, list) => {
  const first = m.words.slice(0, 3);
  return list.some((v) => {
    const nv = normalizeArabic(v);
    return nv.includes(' ') ? m.norm.startsWith(nv) || m.norm.includes(` ${nv}`) : first.some((w) => w === nv || w.startsWith(nv));
  });
};

function findTargets(m) {
  return TARGETS.filter((t) => m.has(t.forms));
}

function elementsFor(page, target) {
  if (target.ids) return page.elements.filter((e) => target.ids.includes(e.id));
  if (target.roles) return page.elements.filter((e) => target.roles.includes(e.role));
  return [];
}

// Elements a page has at most one of: an ordinal after them counts pages.
const SINGLE_PER_PAGE = ['title', 'subtitle', 'kicker', 'cta', 'quote', 'author'];

const artOrder = (page) => page.elements.filter((e) => ['art', 'art-placeholder', 'photo'].includes(e.role)).sort((a, b) => a.z - b.z);

function choosePages(doc, m, ctx, target) {
  const n = pageOrdinal(m);
  if (n) {
    const page = doc.pages[n === -1 ? doc.pages.length - 1 : n - 1];
    return page ? [page] : [];
  }
  if (target?.system && !m.has(['هذه الشريحه', 'هذه الصفحه', 'هنا'])) return doc.pages;
  return [doc.pages.find((p) => p.id === ctx.pageId) ?? doc.pages[0]];
}

// Numbers in replies follow the design's numerals (Western for a brand that
// uses them); set per command by parseCommand.
let replyNumerals = 'arab';
const fmt = (n) => formatNumber(n, replyNumerals);

const FONT_WORDS = { cairo: ['cairo', 'كايرو', 'القاهره'], tajawal: ['tajawal', 'تجوال', 'تجول', 'تاجوال'], almarai: ['almarai', 'المراعي'], readex: ['readex', 'ريدكس'] };
const FONT_LABEL = { cairo: 'Cairo', tajawal: 'Tajawal', almarai: 'Almarai', readex: 'Readex Pro' };

// Brand/theme colour for an Arabic colour word ("الأزرق من هويتي").
function colorFromWords(m, doc, brand) {
  const entry = colorWordIn(m.norm) ?? colorWordIn(m.words.join(' '));
  if (!entry) return { entry: null };
  const brandColors = (brand?.colors ?? []).map((c) => ({ hex: c.hex, name: c.name ?? c.role }));
  const themeColors = Object.entries(doc.theme.colors).map(([role, hex]) => ({ hex, name: role, token: `@${role}` }));
  const wantsBrand = m.has(['هويتي', 'الهويه', 'البراند', 'هويه']);
  const pool = wantsBrand ? brandColors : [...brandColors, ...themeColors];
  // A brand colour named with the same word ("أزرق كتاب وبس") beats one that
  // only has the hue.
  // Score each colour by how many of its name's words the instruction
  // uses: «الأزرق الملكي» picks «أزرق ملكي» over «أزرق ليلي».
  const said = entry.words.map((w) => normalizeArabic(w).replace(/^ال/, '')).filter((w) => m.norm.includes(w));
  const commandWords = new Set(m.words.map((w) => w.replace(/^ال/, '')));
  const named = (c) => {
    const words = normalizeArabic(c.name ?? '').split(' ').map((w) => w.replace(/^ال/, '')).filter(Boolean);
    if (!said.some((w) => words.includes(w))) return 0;
    return words.filter((w) => commandWords.has(w)).length;
  };
  const matches = pool.filter((c) => named(c) || matchesColorWord(c.hex, entry)).sort((a, b) => named(b) - named(a));
  return { entry, matches, wantsBrand };
}

export function parseCommand(doc, text, ctx = {}) {
  replyNumerals = doc.theme?.numerals ?? 'arab';
  const m = matcher(text);
  const targets = findTargets(m);
  const target = targets[0];
  const result = (props) => ({ text, local: true, patches: [], scope: 'any', ...props });

  if (hasVerb(m, VERBS.undo)) return result({ intent: 'undo', reply: 'تراجعت عن آخر تعديل.' });
  if (m.norm === 'اعد' || m.norm.startsWith('اعد التعديل')) return result({ intent: 'redo', reply: 'أعدت التعديل.' });

  // New direction or stronger graphics: always a generation request.
  if (m.has(['شي جديد', 'شيء جديد', 'شيئا جديدا', 'فكره جديده', 'اتجاه جديد', 'تصميم جديد', 'جرافيك اقوي', 'رسوم اقوي', 'اقوي بصريا'])) {
    return result({ intent: 'generate', local: false, needs: 'generate', reply: 'هذا طلب اتجاه بصري جديد: سيولّد المساعد فكرة وأصولًا جديدة بدل إعادة استخدام المكتبة.' });
  }

  // Format.
  const format = m.has(['ستوري', 'قصه', 'ريلز', '9:16', '916']) ? 'story' : m.has(['مربع', '1:1', 'مربعه']) ? 'square' : m.has(['عمودي', '4:5', 'بورتريه']) ? 'portrait' : null;
  if (format && hasVerb(m, VERBS.replace) && !target) {
    return result({ intent: 'format', format, reply: `حوّلت المقاس إلى ${FORMATS[format].ratio} (${FORMATS[format].width}×${FORMATS[format].height}) وأعدت توزيع المحتوى.` });
  }

  // Reuse another design's layout with this content.
  if (m.has(['توزيع هذا التصميم', 'نفس التوزيع', 'تخطيط هذا التصميم', 'نفس التصميم'])) {
    return result({ intent: 'recompose', local: false, needs: 'recompose', reply: 'سأطبّق توزيع التصميم المرجعي على المحتوى الجديد (يتم من المكتبة: studio remix).' });
  }

  // Shorten / rephrase: needs the assistant, with a concrete budget.
  if (hasVerb(m, VERBS.shorten) || m.has(['اعد الصياغه', 'اعاده صياغه', 'صغ من جديد'])) {
    const pages = choosePages(doc, m, ctx, target);
    const t = target && target.id !== 'art' ? target : TARGETS.find((x) => x.id === 'items');
    const els = pages.flatMap((p) => elementsFor(p, t).filter((e) => e.kind === 'text').map((e) => ({ pageId: p.id, elementId: e.id, slot: e.slot, text: e.text, maxChars: Math.max(8, Math.floor(e.text.length * 0.7)) })));
    return result({ intent: 'rewrite', local: false, needs: 'rewrite', scope: 'text', targets: els, reply: `يحتاج الاختصار إلى المساعد: ${fmt(els.length)} نص، كل واحد بنحو ٧٠٪ من طوله مع إبقاء الرسالة. لن يتغيّر أي رسم.` });
  }

  // Font family ("غيّر الخط إلى تجوال", "خط العناوين Cairo"): a theme
  // change, re-laid out locally; images are untouched.
  const fontId = Object.entries(FONT_WORDS).find(([, forms]) => forms.some((w) => m.norm.includes(normalizeArabic(w))))?.[0];
  if (fontId && m.has(['الخط', 'خط', 'الخطوط', 'خطوط'])) {
    const role = m.has(['العنوان', 'العناوين', 'عنوان']) ? 'heading' : m.has(['النص', 'البنود', 'المتن', 'الفقرات']) ? 'body' : 'both';
    const what = role === 'heading' ? 'خط العناوين' : role === 'body' ? 'خط النص' : 'الخط';
    return result({ intent: 'font', fontId, role, reply: `غيّرت ${what} إلى ${FONT_LABEL[fontId]} وأعدت توزيع الصفحات حوله، دون أي توليد للصور.` });
  }

  // Background colour.
  if (target?.background || (m.has(['الخلفيه']) && colorWordIn(m.norm))) {
    const { entry, matches, wantsBrand } = colorFromWords(m, doc, ctx.brand);
    if (!entry) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: 'أي لون تريد للخلفية؟' });
    if (!matches.length) {
      return result({
        intent: 'clarify',
        local: false,
        needs: 'clarify',
        reply: wantsBrand ? 'لا يوجد لون بهذا الاسم في هويتك. أضفه في «ذوقي وهويتي» أو اختر لونًا آخر.' : 'لم أجد هذا اللون في الهوية أو اللوحة الحالية.',
        options: (ctx.brand?.colors ?? []).map((c) => ({ label: c.name ?? c.hex, hex: c.hex })),
      });
    }
    // Prefer a dark-enough or brand-named match: the first brand match wins.
    const hex = matches[0].hex;
    const pageOnly = m.has(['هذه الشريحه', 'هذه الصفحه', 'هنا']) || pageOrdinal(m);
    const pages = pageOnly ? choosePages(doc, m, ctx) : null;
    return result({ intent: 'theme', role: 'bg', hex, pageIds: pages?.map((p) => p.id) ?? null, reply: `حوّلت الخلفية إلى ${hex}${pages ? ' في هذه الصفحة' : ''}، وضبطت ألوان النص لتبقى مقروءة.` });
  }

  if (!target) {
    return result({ intent: 'clarify', local: false, needs: 'clarify', reply: 'لم أحدد العنصر المقصود. اذكره بالاسم: العنوان، البنود، الرسم الرابع، الشعار، الخلفية…' });
  }

  let pages = choosePages(doc, m, ctx, target);

  // «العنوان الثاني»: a page has one title (one subtitle, kicker, button…),
  // so an ordinal after it counts the pages that have one, unless the
  // instruction names the page itself («عنوان الشريحة الثالثة»).
  if (SINGLE_PER_PAGE.includes(target.id) && !pageOrdinal(m)) {
    const n = ordinalAfter(m, target.forms);
    if (n) {
      const withTarget = doc.pages.filter((p) => elementsFor(p, target).length);
      const page = withTarget[n === -1 ? withTarget.length - 1 : n - 1];
      if (!page) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `لا يوجد «${target.forms[0]}» رقم ${fmt(n)}؛ في التصميم ${fmt(withTarget.length)} فقط.` });
      pages = [page];
    }
  }

  // Art: replace one illustration (only that one is regenerated). With no
  // page named (and no current page), «الجرافيك الرابع» counts the design's
  // graphics in reading order: pages in order, layers within a page.
  if (target.id === 'art') {
    const n = ordinalAfter(m, target.forms);
    const across = Boolean(n) && !pageOrdinal(m) && !ctx.pageId && doc.pages.length > 1;
    const pool = across ? doc.pages.flatMap((p) => artOrder(p).map((el) => ({ page: p, el }))) : artOrder(pages[0]).map((el) => ({ page: pages[0], el }));
    const where = across ? 'التصميم' : 'الصفحة';
    if (!pool.length) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `لا يوجد رسم في ${across ? 'التصميم' : 'هذه الصفحة'}.` });
    if (hasVerb(m, VERBS.remove) || hasVerb(m, VERBS.hide)) {
      const picks = n ? [pool[n === -1 ? pool.length - 1 : n - 1]].filter(Boolean) : pool;
      return result({ intent: 'hide', scope: 'graphic', patches: picks.map(({ page, el }) => ({ pageId: page.id, elementId: el.id, action: 'hide', payload: { hidden: true } })), reply: `أخفيت ${picks.length > 1 ? `${fmt(picks.length)} رسوم` : 'الرسم'}.` });
    }
    if (!n && pool.length > 1) {
      return result({
        intent: 'clarify',
        local: false,
        needs: 'clarify',
        reply: `في ${where} ${fmt(pool.length)} رسوم. أيها تقصد؟`,
        options: pool.map(({ page, el }, i) => ({ label: `${el.name ?? 'رسم'} (${fmt(i + 1)})`, pageId: page.id, elementId: el.id })),
      });
    }
    const pick = pool[n === -1 ? pool.length - 1 : (n ?? 1) - 1];
    if (!pick) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `لا يوجد رسم رقم ${fmt(n)}؛ في ${where} ${fmt(pool.length)} رسوم فقط.` });
    const { page, el } = pick;
    const assetId = /\b(a_[a-z0-9]{6,})\b/i.exec(text)?.[1];
    if (assetId) {
      return result({ intent: 'replace_asset', scope: 'graphic', patches: [{ pageId: page.id, elementId: el.id, action: 'replace_asset', payload: { assetId } }], reply: `استبدلت ${el.name ?? 'الرسم'} وحده.` });
    }
    return result({
      intent: 'replace_asset',
      local: false,
      needs: 'asset',
      scope: 'graphic',
      target: { pageId: page.id, elementId: el.id, slot: el.slot, currentAssetId: el.assetId ?? null, frame: el.frame },
      reply: `سيُولَّد رسم جديد لـ«${el.name ?? 'الرسم'}» وحده، ويبقى النص وبقية الرسوم كما هي.`,
    });
  }

  let els = pages.flatMap((p) => elementsFor(p, target).map((e) => ({ page: p, el: e })));
  if (!els.length) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `لا يوجد «${target.forms[0]}» في ${pages.length > 1 ? 'التصميم' : 'هذه الصفحة'}.` });
  const nth = target.id === 'items' ? ordinalAfter(m, target.forms) : null;
  if (nth) {
    const items = els.filter(({ el }) => el.role === 'item');
    const pick = items[nth === -1 ? items.length - 1 : nth - 1];
    if (!pick) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `لا يوجد بند رقم ${fmt(nth)}.` });
    els = [pick];
  }
  const textEls = els.filter(({ el }) => el.kind === 'text');
  // The body lines of a page without items are «النص», not «البنود».
  const label = nth ? `البند ${fmt(nth === -1 ? els.length : nth)}` : target.id === 'items' && els.every(({ el }) => el.role === 'body') ? 'النص' : target.forms[0];
  const patch = (action, payload, list = els) => list.map(({ page, el }) => ({ pageId: page.id, elementId: el.id, action, payload }));

  if (hasVerb(m, VERBS.unlock) || m.has(['فك القفل', 'الغ القفل'])) return result({ intent: 'lock', patches: patch('lock', { locked: false }), reply: `فتحت قفل ${label}.` });
  if (hasVerb(m, VERBS.lock)) return result({ intent: 'lock', patches: patch('lock', { locked: true }), reply: `قفلت ${label}: لن تغيّره الأوامر حتى تفتحه.` });
  if (hasVerb(m, VERBS.remove) || hasVerb(m, VERBS.hide)) return result({ intent: 'hide', patches: patch('hide', { hidden: true, force: true }), reply: `أخفيت ${label}.` });
  if (hasVerb(m, VERBS.show)) return result({ intent: 'hide', patches: patch('hide', { hidden: false, force: true }), reply: `أظهرت ${label}.` });

  const bigger = hasVerb(m, VERBS.bigger) || m.has(['اكبر', 'اوضح']);
  const smaller = hasVerb(m, VERBS.smaller) || m.has(['اصغر']);
  if ((bigger || smaller) && textEls.length) {
    const k = 1 + (bigger ? 1 : -1) * amount(m);
    const patches = textEls.map(({ page, el }) => {
      const size = Math.round(el.style.fontSize * k);
      return { pageId: page.id, elementId: el.id, action: 'update_style', payload: { fontSize: size, minFontSize: Math.min(size, el.style.minFontSize ?? size) } };
    });
    const from = textEls[0].el.style.fontSize;
    return result({
      intent: 'resize_text',
      scope: 'any',
      patches,
      reply: `${bigger ? 'كبّرت' : 'صغّرت'} ${label} من ${fmt(from)} إلى ${fmt(patches[0].payload.fontSize)} بكسل، وأعدت توزيع الصفحة حوله.`,
    });
  }
  if ((bigger || smaller) && !textEls.length) {
    const k = 1 + (bigger ? 1 : -1) * amount(m);
    return result({ intent: 'resize', patches: patch('resize', { scale: k }), reply: `${bigger ? 'كبّرت' : 'صغّرت'} ${label}.` });
  }

  if (hasVerb(m, VERBS.center)) return result({ intent: 'align', patches: patch('update_style', { align: 'center' }, textEls), reply: `وسّطت ${label}.` });

  if (m.has(['عريض', 'عريضا', 'اعرض', 'اثقل', 'سميك'])) return result({ intent: 'weight', patches: patch('update_style', { weight: 800 }, textEls), reply: `جعلت ${label} أعرض.` });
  if (m.has(['رفيع', 'ارفع خطا', 'اخف وزنا', 'عادي'])) return result({ intent: 'weight', patches: patch('update_style', { weight: 400 }, textEls), reply: `جعلت ${label} بوزن عادي.` });

  if (hasVerb(m, VERBS.move) || m.has(['للاعلي', 'للاسفل', 'لليمين', 'لليسار', 'فوق', 'تحت'])) {
    const step = amount(m) === 0.1 ? 16 : amount(m) === 0.3 ? 120 : 48;
    const dx = m.has(['لليمين', 'يمين']) ? step : m.has(['لليسار', 'يسار']) ? -step : 0;
    const dy = m.has(['للاعلي', 'فوق', 'ارفع', 'اعلي']) ? -step : m.has(['للاسفل', 'تحت', 'انزل', 'اسفل']) ? step : 0;
    if (dx || dy) return result({ intent: 'move', patches: patch('move', { dx, dy }), reply: `حرّكت ${label} ${fmt(step)} بكسل.` });
  }

  if (m.has(['خلف', 'وراء', 'للخلف'])) return result({ intent: 'layer', patches: patch('layer', { to: 'back' }), reply: `أرسلت ${label} إلى الخلف.` });
  if (m.has(['المقدمه', 'للامام', 'فوق الكل', 'امام'])) return result({ intent: 'layer', patches: patch('layer', { to: 'front' }), reply: `أحضرت ${label} إلى المقدمة.` });

  // Text colour from the brand or palette.
  const colour = colorFromWords(m, doc, ctx.brand);
  if (colour.entry && textEls.length && hasVerb(m, [...VERBS.replace, 'لون'])) {
    if (!colour.matches.length) return result({ intent: 'clarify', local: false, needs: 'clarify', reply: 'لم أجد هذا اللون في هويتك أو اللوحة الحالية.' });
    const value = colour.matches[0].token ?? colour.matches[0].hex;
    return result({ intent: 'color', patches: patch('update_style', { color: value }, textEls), reply: `لوّنت ${label} بـ${value}.` });
  }

  // Replacing text with text the user typed: local, no AI.
  if (hasVerb(m, VERBS.replace) && textEls.length) {
    const newText = quotedText(text);
    if (newText) {
      if (textEls.length > 1 && !nth) {
        return result({
          intent: 'clarify',
          local: false,
          needs: 'clarify',
          reply: `أي ${label} تقصد؟`,
          options: textEls.map(({ page, el }) => ({ label: el.text.slice(0, 40), pageId: page.id, elementId: el.id })),
        });
      }
      const [{ page, el }] = textEls;
      return result({ intent: 'replace_text', scope: 'text', patches: [{ pageId: page.id, elementId: el.id, action: 'replace_text', payload: { text: newText, force: true } }], reply: `غيّرت ${label} إلى «${newText}» دون أي توليد جديد.` });
    }
  }

  // Layout variant: "two columns", "with illustrations".
  if (m.has(['عمودين', 'عمودان'])) return result({ intent: 'variant', variant: m.has(['صفين', 'صفان']) ? 'rows' : null, preferColumns: true, reply: 'وزّعت المحتوى في عمودين.' });

  return result({ intent: 'clarify', local: false, needs: 'clarify', reply: `فهمت أنك تقصد ${label}، لكن لم أفهم التعديل المطلوب. جرّب: «كبّر العنوان قليلًا» أو «غيّر العنوان إلى «…»».` });
}

// Variant names per composition for "two columns".
const COLUMN_VARIANT = { list: 'grid', post: 'grid', comparison: 'columns' };

// Runs a command: local intents are applied and returned as a new document;
// the others come back unchanged with `needs` for the assistant.
export function runCommand(doc, text, ctx = {}) {
  const cmd = parseCommand(doc, text, ctx);
  if (cmd.intent === 'format') return { ...cmd, doc: setFormat({ ...doc, revision: doc.revision + 1, updatedAt: now() }, cmd.format, ctx) };
  if (cmd.intent === 'font') {
    const fonts = { ...doc.theme.fonts, ...(cmd.role !== 'body' && { heading: cmd.fontId }), ...(cmd.role !== 'heading' && { body: cmd.fontId }) };
    return { ...cmd, doc: composeAll({ ...doc, revision: doc.revision + 1, updatedAt: now(), theme: { ...doc.theme, fonts } }, ctx) };
  }
  if (cmd.intent === 'theme') {
    if (cmd.pageIds) {
      const pages = doc.pages.map((p) => (cmd.pageIds.includes(p.id) ? { ...p, themeOverride: { ...p.themeOverride, [cmd.role]: cmd.hex } } : p));
      return { ...cmd, doc: { ...doc, revision: doc.revision + 1, updatedAt: now(), pages } };
    }
    return { ...cmd, doc: { ...doc, revision: doc.revision + 1, updatedAt: now(), theme: withColor(doc.theme, cmd.role, cmd.hex) } };
  }
  if (cmd.intent === 'variant') {
    const page = doc.pages.find((p) => p.id === ctx.pageId) ?? doc.pages[0];
    const variant = COLUMN_VARIANT[page.composition.id];
    if (!variant) return { ...cmd, local: false, needs: 'clarify', reply: 'هذا التكوين لا يدعم توزيع العمودين.', doc };
    const next = updatePage(doc, page.id, (p) => ({ ...p, composition: { ...p.composition, variant, lockVariant: true } }), ctx);
    return { ...cmd, doc: { ...next, revision: doc.revision + 1, updatedAt: now() } };
  }
  if (cmd.patches.length) {
    try {
      const { doc: next } = applyPatches(doc, cmd.patches, { scope: cmd.scope, measure: ctx.measure, label: cmd.text });
      return { ...cmd, doc: next };
    } catch (err) {
      // A locked element or an invalid value: nothing changes, say why.
      const locked = err.problems?.find((p) => /locked/.test(p.message));
      const reply = locked ? 'العنصر مقفل، فلم أغيّر شيئًا. افتح القفل أولًا («افتح قفل العنوان»).' : `لم يُنفَّذ التعديل: ${err.problems?.map((p) => p.message).join('؛ ') ?? err.message}`;
      return { ...cmd, local: false, needs: 'clarify', reply, patches: [], doc };
    }
  }
  return { ...cmd, doc };
}
