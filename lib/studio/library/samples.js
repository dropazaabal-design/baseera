// Arabic test content per composition, short and long, used by the style
// QA (docs/library/matrix.json) and the tests. Each sample carries the cases
// Arabic layouts break on: a title starting with a number, @kitabwbs inside
// a sentence, hamzas (أ إ ء ئ ؤ), ة/ه, ى/ي, «» and ؟, Western digits with a
// percent sign, and diacritics near a box edge. No faces, no brand names.

export const SAMPLES = {
  hero: {
    short: { kicker: 'دليل', title: 'كيف تُنصت *جيدًا*؟' },
    long: { kicker: 'سلسلة الذكاء الاجتماعي', title: '6 عادات تجعل الآخرين *يُنصتون* إليك باهتمام', subtitle: 'خطوات عملية مجرّبة، تبدأ اليوم ولا تحتاج أي أدوات — احفظها وتابع @kitabwbs.' },
  },
  list: {
    short: { title: 'ابدأ *بخطوة*', items: ['اسأل سؤالًا واحدًا', 'أنصِت حتى النهاية', 'لخّص ما سمعت'] },
    long: { title: 'عادات تجعل حديثك *مسموعًا* في كل مجلس', items: ['اسأل سؤالًا مفتوحًا ثم امنح محدّثك وقتًا كافيًا ليُجيب دون مقاطعة', 'أعِد صياغة ما قاله بكلماتك لتتأكد أنك فهمت الفكرة كما أرادها', 'تحدّث عن «لماذا» قبل «كيف» حتى يرى الآخرون قيمة ما تقترحه', 'اختصر رسالتك في 3 نقاط واضحة بدل عشرة تفاصيل متفرقة', 'لاحظ نبرة صوتك وسرعته؛ فـ 70% من الانطباع يتكوّن منهما', 'اختم بسؤال يدعو إلى المشاركة لا بخطبة طويلة'] },
  },
  quote: {
    short: { quote: 'الإنصات نصف الحوار.', author: 'مثل عربي' },
    long: { quote: '«من أحسن الاستماع أحسن الكلام، ومن تعلّم الصمت في موضعه عرف متى يكون لكلامه وزن عند الناس.»', author: 'حكمة مأثورة', role: 'من أدب المجالس' },
  },
  comparison: {
    short: { title: 'الإنصات *الحقيقي*', beforeLabel: 'سماع', before: ['تنتظر دورك', 'تقاطع'], afterLabel: 'إنصات', after: ['تسأل', 'تلخّص'] },
    long: { title: 'الفرق بين *السماع* والإنصات في الحوار اليومي', beforeLabel: 'مجرد سماع', before: ['تفكّر في ردّك أثناء حديثه', 'تقاطع لتصحّح التفاصيل', 'تنظر إلى هاتفك بين حين وآخر', 'تغيّر الموضوع إلى تجربتك'], afterLabel: 'إنصات فعّال', after: ['تتابع الفكرة حتى نهايتها', 'تسأل عمّا لم يتضح لك', 'تلتفت إليه بانتباه كامل', 'تعيد صياغة ما قاله بدقة'] },
  },
  outro: {
    short: { title: 'هل أفادك؟', save: 'احفظه', follow: 'تابعنا' },
    long: { title: 'هل كانت هذه العادات *مفيدة* لك؟', subtitle: 'احفظ المنشور وشاركه مع صديق، وتابع @kitabwbs لمزيد من أفكار الذكاء الاجتماعي.', save: 'احفظه', follow: 'تابعنا', socials: ['@kitabwbs'] },
  },
  statement: {
    short: { title: 'الصمت *أبلغ*.' },
    long: { kicker: 'فكرة اليوم', title: '80% من سوء الفهم يبدأ من *مقاطعة* لم ننتبه إليها', subtitle: 'جرّب أن تُكمل الإصغاء 5 ثوانٍ قبل أن تردّ، ولاحظ الفرق.' },
  },
  numbered: {
    short: { number: '1', title: 'اسأل *بفضول*' },
    long: { number: '4', title: 'اختصر رسالتك في *3 نقاط* واضحة قبل أن تتحدث', subtitle: 'النقاط القليلة تُتذكَّر؛ أما التفاصيل الكثيرة فتُنسى قبل نهاية المجلس.' },
  },
  post: {
    short: { hook: 'أنصِت *أولًا*', points: ['اسأل', 'تابع', 'لخّص'] },
    long: { hook: '6 عادات تجعل الآخرين *يُنصتون* إليك', points: ['اسأل سؤالًا مفتوحًا', 'أنصِت حتى النهاية', 'أعِد الصياغة بكلماتك', 'ابدأ بـ «لماذا»', 'اختصر في 3 نقاط', 'اختم بسؤال'], cta: 'احفظه للعودة إليه' },
  },
  collage: {
    short: { title: 'فنّ *الإصغاء*', art: ['$art:bubble', '$art:wave'], artAlt: ['فقاعة حوار', 'موجة صوت'] },
    long: { kicker: 'ملف الأسبوع', title: 'كيف تتكلم *فيُنصت* لك الآخرون؟', subtitle: 'دليل من 6 عادات بسيطة، مع أمثلة من الحياة اليومية.', art: ['$art:bubble', '$art:wave', '$art:quiet'], artAlt: ['فقاعة حوار', 'موجة صوت', 'فقاعة صامتة'] },
  },
};

// Same-role samples for compositions added later reuse these by role.
export function sampleFor(compositionId, size = 'short') {
  return SAMPLES[compositionId]?.[size] ?? null;
}
