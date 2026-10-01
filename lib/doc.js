import { templates } from '../templates';
import { pluginDefaults } from '../plugins';

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

// Saved docs are merged over fresh defaults so new settings and plugins
// added in later versions get sensible values.
export function loadDoc() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const slides = saved?.slides?.filter((s) => templates[s.template]);
    if (!slides?.length) return null;
    const base = createSampleDoc();
    return {
      slides,
      design: { ...base.design, ...saved.design },
      brand: { ...base.brand, ...saved.brand },
      plugins: Object.fromEntries(Object.entries(base.plugins).map(([id, d]) => [id, { ...d, ...saved.plugins?.[id] }])),
    };
  } catch {
    return null;
  }
}

export function saveDoc(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
