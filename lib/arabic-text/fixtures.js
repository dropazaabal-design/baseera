// The verification cases of ArabicText (scripts/arabic-text-check.mjs and
// the 1080×1920 demo reel, scripts/arabic-text-reel.mjs). Texts are stored
// exactly as approved; nothing here is reshaped or reordered.

export const APPROVED = {
  procrastinate: 'لا تؤجّل ما تستطيع فعله اليوم',
  saved: 'وفّرت 25% خلال 3 أشهر',
  follow: 'تابع @kitabwbs للمزيد',
  price: 'السعر: 1,250.50 درهم',
  quote: 'قال: «ابدأ الآن»',
  diacritics: 'قُوَّةُ التَّرْكِيزِ',
  paragraph: 'القراءة اليومية لا تحتاج وقتًا طويلًا.\nعشر دقائق قبل النوم تكفي لتبني عادة تبقى معك، وتابع @kitabwbs لتجد كتابًا جديدًا كل أسبوع.',
};

const base = { font: { family: 'Cairo', weight: 800 }, fontSize: 88, width: 900, lineHeight: 1.5, color: '#14181F', palette: { accent: '#0C855D', highlight: '#D9F4EB' } };

// Each case: a spec, the motion shown in the reel, and what must hold.
export const CASES = [
  { id: 'procrastinate', title: 'كلمة كلمة · صعود', spec: { ...base, text: APPROVED.procrastinate }, motion: [{ effect: 'rise', unit: 'word', duration: 14, stagger: 5 }] },
  { id: 'saved', title: 'الكتلة · تكبير', spec: { ...base, text: APPROVED.saved }, motion: [{ effect: 'scale', unit: 'block', duration: 16, from: 0.85 }], order: ['وفّرت', '25%', 'خلال', '3', 'أشهر'] },
  { id: 'follow', title: 'السطر · كشف بقناع', spec: { ...base, text: APPROVED.follow, spans: [{ start: 5, end: 14, dir: 'ltr', label: 'handle' }] }, motion: [{ effect: 'reveal', unit: 'line', duration: 24 }], order: ['تابع', '@kitabwbs', 'للمزيد'] },
  { id: 'price', title: 'كلمة كلمة · ظهور', spec: { ...base, text: APPROVED.price }, motion: [{ effect: 'fade', unit: 'word', duration: 12, stagger: 6 }], order: ['السعر:', '1,250.50', 'درهم'] },
  {
    id: 'quote',
    title: 'تظليل الكلمات',
    spec: { ...base, text: APPROVED.quote, spans: [{ start: 6, end: 15, mark: 'highlight' }] },
    motion: [{ effect: 'fade', unit: 'block', duration: 10 }, { effect: 'highlight', words: 'marked', start: 14, duration: 16, color: '#D9F4EB' }],
    order: ['قال:', '«ابدأ', 'الآن»'],
  },
  { id: 'diacritics', title: 'التشكيل · صعود الكتلة', spec: { ...base, text: APPROVED.diacritics, fontSize: 120, lineHeight: 1.7 }, motion: [{ effect: 'rise', unit: 'block', duration: 16 }] },
  { id: 'paragraph', title: 'نص متعدد الأسطر · سطرًا سطرًا', spec: { ...base, text: APPROVED.paragraph, font: { family: 'Tajawal', weight: 500 }, fontSize: 56, lineHeight: 1.7 }, motion: [{ effect: 'rise', unit: 'line', duration: 14, stagger: 8 }] },
  { id: 'narrow', title: 'صندوق ضيق', spec: { ...base, text: APPROVED.procrastinate, fontSize: 64, width: 420, lineHeight: 1.6 }, motion: [{ effect: 'reveal', unit: 'line', duration: 16 }] },
];

// Cases that must fail with a reason, never render in a substitute.
export const FAILURES = [
  { id: 'narrow-tall', title: 'صندوق ضيق بارتفاع محدود', spec: { ...base, text: APPROVED.procrastinate, fontSize: 64, width: 420, maxHeight: 220, lineHeight: 1.6 }, expect: 'overflow.height' },
  { id: 'narrow-word', title: 'كلمة أعرض من الصندوق', spec: { ...base, text: APPROVED.diacritics, fontSize: 120, width: 300 }, expect: 'overflow.width' },
  { id: 'missing-font', title: 'خط مفقود', spec: { ...base, text: APPROVED.saved, font: { family: 'Amiri', weight: 400 } }, expect: 'font.missing' },
  { id: 'missing-weight', title: 'وزن غير متوفر', spec: { ...base, text: APPROVED.saved, font: { family: 'Tajawal', weight: 600 } }, expect: 'font.weight-unavailable' },
  { id: 'broken-file', title: 'ملف خط لا يُحمَّل', spec: { ...base, text: APPROVED.saved, font: { family: 'BrokenArabic', weight: 400 } }, expect: 'font.load-failed', extraFace: { family: 'BrokenArabic', weight: 400, url: 'data:font/woff2;base64,AAAAAAAA' } },
  { id: 'shrink-floor', title: 'تصغير حتى الحد فقط', spec: { ...base, text: APPROVED.paragraph, fontSize: 56, minFontSize: 50, fit: 'shrink', maxHeight: 300, lineHeight: 1.6 }, expect: 'overflow.height' },
];
