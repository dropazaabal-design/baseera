import { SIGNAL_CATALOG } from '../research/signal-catalog.js';

// Labels for explanations, in Arabic (the product's language) and English.
// Feature labels name what was measured; the explanation layer combines
// them with values, never with invented reasons.

export const PLATFORM_LABEL = {
  x: { ar: 'إكس', en: 'X' },
  instagram: { ar: 'إنستغرام', en: 'Instagram' },
  facebook: { ar: 'فيسبوك', en: 'Facebook' },
  all: { ar: 'كل المنصات', en: 'All platforms' },
};

export const SCORE_LABEL = {
  overall: { ar: 'ملاءمة المنصة', en: 'Platform Fit' },
  contentQuality: { ar: 'جودة المحتوى', en: 'Content quality' },
  hook: { ar: 'الافتتاحية', en: 'Hook' },
  retention: { ar: 'الاستبقاء', en: 'Retention' },
  conversation: { ar: 'النقاش', en: 'Conversation' },
  share: { ar: 'المشاركة', en: 'Share potential' },
  save: { ar: 'الحفظ', en: 'Save potential' },
  click: { ar: 'النقر والزيارة', en: 'Click potential' },
  negativeRisk: { ar: 'خطر التفاعل السلبي', en: 'Negative-feedback risk' },
  platformFit: { ar: 'ملاءمة الصيغة', en: 'Format fit' },
  historicalFit: { ar: 'التوافق مع تاريخ الحساب', en: 'Historical fit' },
  'score.contentQuality': { ar: 'جودة المحتوى', en: 'Content quality' },
  'score.platformFit': { ar: 'ملاءمة الصيغة', en: 'Format fit' },
  'score.historicalFit': { ar: 'تاريخ الحساب', en: 'Account history' },
};

export const LEVEL = (v) => (v >= 0.7 ? { ar: 'مرتفع', en: 'High' } : v >= 0.45 ? { ar: 'متوسط', en: 'Medium' } : { ar: 'منخفض', en: 'Low' });

export const PROVENANCE_LABEL = {
  official: { ar: 'مصدر رسمي', en: 'official' },
  'public-source-code': { ar: 'كود منشور', en: 'public source code' },
  research: { ar: 'بحث منشور', en: 'research' },
  historical: { ar: 'تاريخ الحساب', en: 'account history' },
  derived: { ar: 'قياس من المحتوى', en: 'measured from the content' },
  heuristic: { ar: 'تقدير قاعدي', en: 'rule-of-thumb estimate' },
};

// Evidence feature → label. «%v» is replaced by the value.
export const FEATURE_LABEL = {
  'hook.words': { ar: 'الافتتاحية %v كلمات', en: 'opening of %v words' },
  'hook.number': { ar: 'رقم في الافتتاحية', en: 'a number in the opening' },
  'hook.question': { ar: 'سؤال في الافتتاحية', en: 'a question in the opening' },
  'hook.curiosity': { ar: 'فجوة فضول في الافتتاحية', en: 'a curiosity gap in the opening' },
  'hook.directAddress': { ar: 'مخاطبة القارئ مباشرة', en: 'direct address to the reader' },
  'hook.specificity': { ar: 'افتتاحية عامة بلا تفاصيل محددة', en: 'a generic opening without specifics' },
  'text.question': { ar: 'وجود سؤال للقارئ', en: 'a question to the reader' },
  'text.directAddress': { ar: 'مخاطبة القارئ (%v)', en: 'direct address (%v)' },
  'text.specificity': { ar: 'درجة التحديد %v', en: 'specificity %v' },
  'text.readability': { ar: 'سهولة القراءة %v/100', en: 'readability %v/100' },
  'text.avgSentenceWords': { ar: 'متوسط الجملة %v كلمات', en: 'average sentence of %v words' },
  'text.firstSentenceWords': { ar: 'الجملة الأولى %v كلمة', en: 'first sentence of %v words' },
  'text.words': { ar: '%v كلمة', en: '%v words' },
  'text.chars': { ar: '%v حرفًا', en: '%v characters' },
  'text.lineBreaks': { ar: '%v فواصل أسطر', en: '%v line breaks' },
  'text.links': { ar: 'رابط في المنشور', en: 'a link in the post' },
  'text.xLength': { ar: 'الطول %v حرفًا (حد إكس 280)', en: 'length %v characters (X limit 280)' },
  'text.baitPhrases': { ar: 'عبارات استجداء للتفاعل', en: 'engagement-bait wording' },
  'text.hostileWords': { ar: 'كلمات جارحة', en: 'hostile words' },
  'text.hashtags': { ar: '%v وسوم', en: '%v hashtags' },
  'text.mentions': { ar: '%v إشارات لحسابات', en: '%v mentions' },
  'semantic.usefulness': { ar: 'فائدة عملية %v', en: 'practical usefulness %v' },
  'semantic.novelty': { ar: 'جِدّة الفكرة %v', en: 'novelty %v' },
  'semantic.quotability': { ar: 'سطر قابل للاقتباس', en: 'a quotable line' },
  'semantic.emotion': { ar: 'شحنة عاطفية عالية جدًا', en: 'very strong emotional framing' },
  'semantic.clickbaitGap': { ar: 'فضول أعلى من مضمون محدد', en: 'more curiosity than concrete substance' },
  'cta.specific': { ar: 'دعوة محددة للتفاعل', en: 'a specific call to action' },
  'cta.generic': { ar: 'دعوة عامة للتفاعل', en: 'a generic call to action' },
  'cta.present': { ar: 'لا توجد دعوة للتفاعل', en: 'no call to action' },
  'intent.list': { ar: 'بنية قائمة مرقّمة', en: 'a numbered-list structure' },
  'intent.opinion': { ar: 'رأي أو موقف', en: 'an opinion or stance' },
  'intent.personal': { ar: 'تجربة أو تأمل شخصي', en: 'a personal insight or story' },
  'carousel.slideCount': { ar: '%v شرائح', en: '%v slides' },
  'carousel.densityFit': { ar: 'كثافة الشرائح %v', en: 'slide density fit %v' },
  'carousel.promise': { ar: 'وعد الغلاف/المنفّذ %v', en: 'cover promise/delivered %v' },
  'carousel.curiosityContinuity': { ar: 'تسلسل يشدّ للشريحة التالية %v', en: 'slide-to-slide continuity %v' },
  'carousel.empty': { ar: 'شرائح فارغة: %v', en: 'empty slides: %v' },
  'carousel.coverWords': { ar: 'الغلاف %v كلمة', en: 'cover of %v words' },
  'carousel.progression': { ar: 'ترقيم متسلسل', en: 'sequential numbering' },
  'reel.durationSec': { ar: 'المدة %v ث', en: 'duration %vs' },
  'reel.openLoops': { ar: 'حلقات فضول مفتوحة: %v', en: 'open loops: %v' },
  'reel.payoff': { ar: 'إجابة/خلاصة في النهاية', en: 'a payoff at the end' },
  'reel.sceneRhythmCv': { ar: 'تنوّع إيقاع المشاهد %v', en: 'scene-rhythm variation %v' },
  'reel.firstSecondsHasPromise': { ar: 'وعد في الثواني الأولى', en: 'a promise in the first seconds' },
  'reel.hookWords': { ar: 'المشهد الأول %v كلمات', en: 'first scene of %v words' },
  'reel.maxWordsPerScene': { ar: 'أكثر مشهد كلامًا %v كلمة', en: 'busiest scene %v words' },
  'thread.posts': { ar: '%v تغريدات', en: '%v posts' },
  'thread.overLimit': { ar: '%v تغريدات فوق الحد', en: '%v posts over the limit' },
  'thread.firstPostEndsOpen': { ar: 'التغريدة الأولى تفتح فضولًا', en: 'first post opens a loop' },
  'caption.firstSentenceWords': { ar: 'أول جملة في الوصف %v كلمة', en: 'caption opening of %v words' },
  'history.topicAffinity': { ar: 'أداء هذا الموضوع في حسابك %v', en: 'this topic on your account %v' },
};

// Labels for a feature that is absent (value false).
export const FEATURE_ABSENT = {
  'text.question': { ar: 'لا سؤال للقارئ', en: 'no question to the reader' },
  'hook.question': { ar: 'لا سؤال في الافتتاحية', en: 'no question in the opening' },
  'reel.payoff': { ar: 'لا خلاصة في النهاية', en: 'no payoff at the end' },
  'reel.firstSecondsHasPromise': { ar: 'لا وعد في الثواني الأولى', en: 'no promise in the first seconds' },
  'thread.firstPostEndsOpen': { ar: 'التغريدة الأولى لا تفتح فضولًا', en: 'the first post does not open a loop' },
  'cta.specific': { ar: 'دعوة غير محددة', en: 'a non-specific call to action' },
};

const SIGNAL_LABEL = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.id, s.label]));
const HOOK_PART = { lengthFit: { ar: 'الطول', en: 'length' }, curiosity: { ar: 'الفضول', en: 'curiosity' }, specificity: { ar: 'التحديد', en: 'specificity' }, directAddress: { ar: 'مخاطبة القارئ', en: 'direct address' }, tension: { ar: 'ما على المحك', en: 'stakes' }, clarity: { ar: 'الوضوح', en: 'clarity' } };
const AUDIENCE = { commentWorthiness: { ar: 'قابلية التعليق', en: 'comment-worthiness' }, saveWorthiness: { ar: 'قابلية الحفظ', en: 'save-worthiness' }, shareWorthiness: { ar: 'قابلية المشاركة', en: 'share-worthiness' } };
const show = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

export function featureLabel(feature, value, lang = 'ar') {
  if (value === false && FEATURE_ABSENT[feature]) return FEATURE_ABSENT[feature][lang];
  let m = feature.match(/^carousel\.slides\[(\d+)\]\.(words|insight)$/);
  if (m) return m[2] === 'words' ? (lang === 'ar' ? `الشريحة ${m[1]}: ${show(value)} كلمة` : `slide ${m[1]}: ${show(value)} words`) : lang === 'ar' ? `قوة فكرة الشريحة ${m[1]}: ${show(value)}` : `slide ${m[1]} insight: ${show(value)}`;
  m = feature.match(/^hook\.parts\.(\w+)$/);
  if (m && HOOK_PART[m[1]]) return lang === 'ar' ? `${HOOK_PART[m[1]].ar} في الافتتاحية: ${show(value)}` : `opening ${HOOK_PART[m[1]].en}: ${show(value)}`;
  m = feature.match(/^audience\.(\w+)$/);
  if (m && AUDIENCE[m[1]]) return `${AUDIENCE[m[1]][lang]}: ${show(value)}`;
  if (SIGNAL_LABEL[feature]) return `${SIGNAL_LABEL[feature][lang]}: ${show(value)}`;
  if (feature === 'caption') return lang === 'ar' ? 'لا نص مرافق' : 'no accompanying text';
  if (feature === 'text.maxSentenceWords') return lang === 'ar' ? `أطول جملة ${show(value)} كلمة` : `longest sentence ${show(value)} words`;
  if (feature === 'text.numbers') return lang === 'ar' ? `${show(value)} أرقام` : `${show(value)} numbers`;
  if (feature === 'text.redundancy') return lang === 'ar' ? `نسبة التكرار ${show(value)}` : `repetition ${show(value)}`;
  if (feature === 'semantic.curiosity') return lang === 'ar' ? `الفضول ${show(value)}` : `curiosity ${show(value)}`;
  if (feature === 'cta.generic' && value === true) return FEATURE_LABEL['cta.generic'][lang];
  const key = feature.replace(/^carousel\.slide(\d+)\.(words|empty)$/, (_, n, k) => `carousel.slide.${k}`);
  if (key === 'carousel.slide.words') return lang === 'ar' ? `الشريحة ${feature.match(/\d+/)[0]}: ${value} كلمة` : `slide ${feature.match(/\d+/)[0]}: ${value} words`;
  if (key === 'carousel.slide.empty') return lang === 'ar' ? `الشريحة ${feature.match(/\d+/)[0]} فارغة` : `slide ${feature.match(/\d+/)[0]} is empty`;
  if (feature.startsWith('history.pattern.')) return lang === 'ar' ? `نمط من تاريخ حسابك (${value >= 0 ? '+' : ''}${Math.round(value * 100)}%)` : `a pattern from your account (${value >= 0 ? '+' : ''}${Math.round(value * 100)}%)`;
  const l = FEATURE_LABEL[feature];
  if (!l) return `${feature}: ${value}`;
  return l[lang].replace('%v', typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value));
}
