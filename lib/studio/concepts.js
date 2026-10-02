import { normalizeArabic } from './arabic.js';

// A small Arabic concept lexicon for local search. Topics, metaphors and
// asset tags map to concept ids, so "عادات القراءة" finds designs tagged
// "كتب" or "مكتبة" without an embedding call, and a design is never picked
// just because its title shares a word with the request.
// The assistant can always pass explicit concepts; this is the fallback.

export const CONCEPTS = {
  reading: ['قراءة', 'القراءة', 'اقرأ', 'قارئ', 'قراء', 'كتاب', 'كتب', 'الكتب', 'مكتبة', 'رواية', 'روايات', 'صفحات', 'صفحة', 'مطالعة', 'book', 'books', 'reading'],
  writing: ['كتابة', 'الكتابة', 'تدوين', 'دوّن', 'ملاحظات', 'قلم', 'مذكرات', 'يوميات', 'notion'],
  learning: ['تعلم', 'التعلم', 'مهارة', 'مهارات', 'معرفة', 'دراسة', 'دورة', 'تعليم', 'معلومة'],
  habits: ['عادة', 'عادات', 'روتين', 'يومي', 'يوميًا', 'صباح', 'الصباح', 'استمرار', 'انضباط'],
  productivity: ['إنتاجية', 'انتاجيه', 'إنجاز', 'مهام', 'تخطيط', 'خطة', 'أولويات', 'وقت', 'الوقت', 'pomodoro'],
  focus: ['تركيز', 'التركيز', 'انتباه', 'تشتت', 'إشعارات', 'هاتف', 'الهاتف', 'هدوء'],
  growth: ['نمو', 'تطوير', 'تطور', 'تقدم', 'نجاح', 'خطوات', 'سلم', 'هدف', 'أهداف', 'طموح'],
  comparison: ['مقارنة', 'قبل', 'بعد', 'فرق', 'الفرق', 'ميزان', 'مقابل', 'أفضل', 'خيارين', 'سطحية', 'عميقة'],
  question: ['سؤال', 'أسئلة', 'رأيك', 'شاركنا', 'استطلاع', 'لماذا', 'كيف'],
  quote: ['اقتباس', 'قال', 'قول', 'حكمة', 'مقولة'],
  community: ['نادي', 'مجتمع', 'أصدقاء', 'مشاركة', 'شارك', 'جمهور', 'متابعين'],
  money: ['مال', 'المال', 'استثمار', 'ادخار', 'ميزانية', 'دخل', 'أرباح', 'تمويل'],
  health: ['صحة', 'نوم', 'رياضة', 'غذاء', 'ماء', 'مشي', 'طاقة'],
  marketing: ['تسويق', 'محتوى', 'منشور', 'جمهور', 'علامة', 'تفاعل', 'انستقرام', 'لينكدإن'],
  mistakes: ['أخطاء', 'خطأ', 'عيوب', 'عيوبك', 'تجنب', 'تحذير', 'لا تفعل'],
  self: ['نفسك', 'ذاتك', 'شخصية', 'ثقة', 'وعي', 'الذات'],
  time: ['وقت', 'ساعة', 'دقائق', 'يوم', 'أسبوع', 'شهر', 'سنة', 'مبكر'],
};

const LOOKUP = new Map();
for (const [id, list] of Object.entries(CONCEPTS)) {
  for (const w of list) {
    const n = normalizeArabic(w).replace(/^ال/, '');
    if (!LOOKUP.has(n)) LOOKUP.set(n, new Set());
    LOOKUP.get(n).add(id);
  }
}

export function extractConcepts(text) {
  const found = new Set();
  for (const raw of normalizeArabic(text).split(' ')) {
    const variants = [raw, raw.replace(/^ال/, ''), raw.replace(/^[وفبل]ال/, ''), raw.replace(/^[وف]/, '')];
    for (const v of variants) for (const id of LOOKUP.get(v) ?? []) found.add(id);
  }
  return [...found];
}

// Overlap of two concept sets in [0, 1] (Jaccard on the smaller set, so a
// focused request matches a broader design).
export function conceptFit(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const x of A) if (B.has(x)) common++;
  return common / Math.min(A.size, B.size);
}
