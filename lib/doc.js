import { templates } from '../templates';
import { pluginDefaults } from '../plugins';
import { FONTS } from './fonts.js';

const STORAGE_KEY = 'baseera.carousel.v1';

export function createSlide(templateId, data = templates[templateId].defaults) {
  return { id: crypto.randomUUID(), template: templateId, data: structuredClone(data) };
}

export function createSampleDoc() {
  return {
    slides: [
      createSlide('cover', {
        kicker: 'دليل عملي',
        title: '٥ عادات *تضاعف* إنتاجيتك في ٢٠٢٦',
        subtitle: 'خطوات بسيطة جرّبناها مع فريق Baseera — طبّقها من اليوم.',
      }),
      createSlide('listicle', {
        title: 'ابدأ يومك *بذكاء*',
        items: [
          'خطّط ليومك في 10 دقائق باستخدام Notion',
          'اعمل بفترات 25 دقيقة (تقنية Pomodoro)',
          'أغلق إشعارات Slack و WhatsApp أثناء التركيز',
          'راجع أهدافك الأسبوعية كل يوم أحد',
        ],
        start: 1,
      }),
      createSlide('comparison', {
        title: 'قبل وبعد تطبيق *العادات*',
        beforeLabel: 'قبل',
        before: ['مهام متراكمة بلا أولويات', 'تشتّت بين 7 تطبيقات', 'عمل حتى 11:00 مساءً'],
        afterLabel: 'بعد',
        after: ['قائمة من 3 أولويات فقط', 'أداة واحدة: Notion', 'إنجاز أعلى بنسبة 40%'],
      }),
      createSlide('quote', {
        quote: 'التركيز يعني أن تقول *لا* لمئة فكرة جيدة أخرى.',
        author: 'ستيف جوبز',
        role: 'Steve Jobs — Apple',
      }),
      createSlide('outro', {
        title: 'هل كان المحتوى *مفيدًا*؟',
        subtitle: 'احفظه لتعود إليه، وتابعنا لمحتوى عملي كل أسبوع.',
        save: 'احفظه',
        share: 'شاركه',
        follow: 'تابعنا',
        socials: ['@baseera', 'baseera.sa', 'hello@baseera.sa'],
      }),
    ],
    design: { paletteId: 'midnight', custom: { bg: '#102A43', accent: '#F59E0B' }, font: 'cairo', numerals: 'arab' },
    brand: { name: 'بصيرة', handle: '@baseera', logo: null, avatar: null },
    plugins: pluginDefaults(),
  };
}

// Saved and embedded docs are merged over fresh defaults, so settings and
// plugins added in later versions get sensible values.
export function normalizeDoc(raw) {
  const slides = (raw?.slides ?? [])
    .filter((s) => templates[s?.template])
    .map((s) => ({ id: s.id ?? crypto.randomUUID(), template: s.template, data: s.data ?? {} }));
  if (!slides.length) return null;
  const base = createSampleDoc();
  const design = { ...base.design, ...raw.design };
  if (!FONTS[design.font]) design.font = base.design.font;
  return {
    slides,
    design,
    brand: { name: '', handle: '', logo: null, avatar: null, ...raw.brand },
    plugins: Object.fromEntries(Object.entries(base.plugins).map(([id, d]) => [id, { ...d, ...raw.plugins?.[id] }])),
  };
}

function loadDoc(key) {
  try {
    return normalizeDoc(JSON.parse(localStorage.getItem(key)));
  } catch {
    return null;
  }
}

export function saveDoc(doc, key) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = Math.imul(h, 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// A page can embed a carousel in <script id="carousel-seed"> (the Claude
// plugin's standalone file does). Its edits are saved under a key derived
// from the content, so two carousel files never overwrite each other.
export function initialDoc() {
  const seedText = document.getElementById('carousel-seed')?.textContent.trim();
  const fresh = () => (seedText ? normalizeDoc(JSON.parse(seedText)) : null) ?? createSampleDoc();
  const storageKey = seedText ? `${STORAGE_KEY}:${hash(seedText)}` : STORAGE_KEY;
  return { doc: loadDoc(storageKey) ?? fresh(), storageKey, fresh };
}
