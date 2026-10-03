# ArabicText — المسؤول الوحيد عن النص العربي في التصميم والفيديو

مكوّن في `lib/arabic-text/` يملك النص العربي من التخزين حتى الإطار الأخير في الفيديو: نموذج النص،
والمقاطع، والترميز، والقياس، والرسم، والتحقق، والحركة. مسار القياس والرسم الأساسي هو Chromium بتنضيد
HTML/CSS، وهو المحرك نفسه الذي يرسم المحرّر ويلتقط طبقات الفيديو. التقرير الموجز في
[`REPORT.md`](REPORT.md).

## البنية

```
النص المعتمد (منطقي) + المقاطع ─► spec.js    التحقق، التسلسل، مفتاح cache
                                    │
                                    ▼
                               runs.js     مقاطع معزولة (bdi) وعلامات (تمييز، تظليل)
                                    │
                 ┌──────────────────┼────────────────────┐
                 ▼                  ▼                    ▼
           html.js (نص HTML)   ArabicText.jsx (React)   page.js (داخل Chromium)
           المعاينات وQA        المحرّر                  تحضير الخط، القياس، الفيض، الحبر
                                                         │
                                         ┌───────────────┼────────────────┐
                                         ▼               ▼                ▼
                                  node/chromium.js   video.js         motion.js (دوال نقية)
                                  طبقة شفافة PNG     محرك الريل        ├─ canvas.js  (محركات Canvas)
                                  للنصوص والفحص       الحالي           └─ htmlMotion.js (محركات HTML)
```

- **typesetter.js**: عقد المنضّد. Chromium هو المنضّد المستعمل؛ Pango له مكان محجوز في العقد ولم
  تُضف اعتمادياته. أي منضّد جديد يطبّق العقد نفسه ويجتاز `scripts/arabic-text-check.mjs` قبل أن يُعرض.
- لم يُستبدل المحرّر ولا محرك الفيديو: `RichText` صار غلافًا رفيعًا حول `ArabicRuns`، و`htmlPreview` يبني
  نصه من `runsHtml`، و`lib/video.js` أُضيف إليه محوّل للنص المتحرك.

## النص والاتجاه

- النص يُخزَّن بترتيبه المنطقي كما كُتب. لا عكس ولا أشكال عرض (U+FB50–U+FEFF تُرفض بخطأ
  `text.presentation-forms`)، ولا تُضاف محارف اتجاه خفية (وجودها في النص المعتمد تحذير، ولا تُحذف).
- الفقرة تحمل `lang="ar"` و`dir="rtl"`، والمحاذاة خاصية منفصلة (`align: start | center | end`).
- المقاطع المختلطة تُعزل بـ`<bdi dir="ltr">` (عزل لا تجاوز؛ لا يوجد `bidi-override` في أي مسار).
- المقاطع الصريحة أولًا: `spans: [{ start, end, dir: 'ltr', label: 'handle' }]`. مع `bidi: 'auto'`
  (الافتراضي) يكمل الكاشف (`lib/bidi.js`) ما لم تحدّده المقاطع الصريحة فقط، ومع `bidi: 'explicit'` لا
  تخمين إطلاقًا. التخطيط يسجّل المصدر (`explicit` / `auto` / `mixed` / `none`).
- علامات التشكيل والأقواس والترقيم تبقى للمحرك يشكّلها ويعكس ما يُعكس منها (« » في سياق RTL).
- صيغة الاستوديو المخزّنة `*كلمة*` تتحوّل عند الرسم إلى نص صافٍ ومقطع علامة (`fromMarkedText`)؛ النص
  المخزّن لا يتغيّر.

## الخطوط والقياس

- الخطوط ملفات محلية من حزم `@fontsource` (رخصة SIL OFL 1.1): Cairo (200–900)، Tajawal (200–500،
  700–900)، Almarai (300، 400، 700، 800)، Readex Pro (200–700). المنضّد يضمّنها بمدى Unicode لكل
  مجموعة حروف و`font-display: block`.
- `prepareFont` ينتظر تحميل العائلة والوزن المطلوبين للنص نفسه، ويعيد خطأً صريحًا بدل البديل:
  `font.missing` و`font.weight-unavailable` (مع قائمة الأوزان المتوفرة) و`font.load-failed`
  و`font.not-ready`، وتحذير `font.fallback-glyphs` لحروف لا يغطيها الخط. لا وزن صناعي
  (`font-synthesis: none`).
- التصدير في المحرّر (`lib/exportEngine.js`) يمر بالفحص نفسه قبل أي لقطة: خط المشروع غير الجاهز خطأ
  يظهر للمستخدم لا لقطة بخط بديل.
- القياس في بيئة الرسم نفسها: حدود السطور من صناديق DOM، والكلمات بنطاقات `Range`، والحبر من مقاييس
  الخط نفسه في Canvas (يتجاوز صندوق السطر بالحركات والذيول)، ثم يتحقق المنضّد في Node من الحبر الفعلي
  في الطبقة المرسومة (`ink.clipped` إن لمس الحبر حافتها).
- الطبقة = الصندوق + مساحة للحبر الخارج + هامش ربع حجم الخط. والحركة تحسب امتدادها (`extent`: مسافة
  الصعود، وتجاوز التكبير) لتبقى المساحة في المشهد.
- الالتفاف وارتفاع السطر وعرض الصندوق والحشو قابلة للضبط. `fit: 'shrink'` يصغّر حتى `minFontSize`
  المعتمد فقط؛ وإن بقي الفيض فخطأ `overflow.height` أو `overflow.width` باقتراحات: توسيع الارتفاع،
  أو العرض الأدنى الذي يكفي، أو موضع التقسيم (أول كلمة لا تتسع). لا إعادة صياغة تلقائية أبدًا.
- فحوص إضافية: اتصال الحروف (`shaping.not-joined` إن قيس النص بفاصل منع الاتصال بالعرض نفسه)،
  وتطابق النص في الصفحة مع المخزّن (`text.mismatch`)، والكلمة الوحيدة في آخر سطر، وحد الأسطر.

## الواجهة

```js
import { createChromiumTypesetter } from './lib/arabic-text/node/chromium.js';   // Node (سكربتات، تصدير)
import { arabicTextHtml, planMotion, frameState, drawArabicTextFrame, frameHtml,
         serializeArabicText, parseArabicText, layoutKey } from './lib/arabic-text/index.js';

const spec = {
  text: 'تابع @kitabwbs للمزيد',
  spans: [{ start: 5, end: 14, dir: 'ltr', label: 'handle' }],
  font: { family: 'Cairo', weight: 800 }, fontSize: 88,
  direction: 'rtl', align: 'start', width: 900, maxHeight: null, lineHeight: 1.5,
  padding: 0, color: '#14181F', motion: [{ effect: 'reveal', unit: 'line', duration: 24 }],
};
const ts = await createChromiumTypesetter();
const r = await ts.typeset(spec, { scale: 2 });   // { ok, errors, warnings, layout, raster: { png, ink, clipped }, key }
```

| الحقل | المعنى |
|---|---|
| `text`, `spans`, `bidi` | النص المنطقي، المقاطع الصريحة، وضع الكشف |
| `font` (`family`, `weight`), `fontSize`, `minFontSize`, `fit` | الخط والوزن والحجم والحد المعتمد |
| `direction`, `align`, `lang` | الاتجاه، والمحاذاة منفصلة عنه، واللغة |
| `width`, `maxHeight`, `lineHeight`, `padding`, `maxLines` | الصندوق |
| `color`, `palette` (`accent`, `highlight`) | الألوان (لا تدخل في مفتاح التخطيط) |
| `motion` | قائمة حركات (انظر أدناه) |

الناتج `layout` بيانات قابلة للتسلسل: الأسطر (الصندوق، خط الأساس، الحبر)، والكلمات (الموضع المنطقي،
الصندوق، الحبر، السطر)، والعلامات بمستطيل لكل سطر، وحدود الحبر وما تجاوز منه، ونتيجة فحص الاتصال،
ومصدر العزل. `serializeArabicText` / `parseArabicText` يحفظان المواصفة والتخطيط ويعيدان فتحهما.

**مفتاح cache:** `layoutKey` = النص والمقاطع والخط ووزنه وحجمه وإعدادات الصندوق + إصدار المنضّد
(`chromium/141.0.7390.37`) + بصمة ملفات الخط + إصدار قواعد القياس. اللون والحركة لا يغيّرانه.
`rasterKey` يضيف اللون والمقياس وطريقة رسم العلامات. النص الثابت لا يُعاد تنضيده في أي إطار.

## الحركة

| التأثير | الوحدات | ما يحدث |
|---|---|---|
| `fade` | كتلة، سطر، كلمة | شفافية |
| `rise` | كتلة، سطر، كلمة | شفافية وصعود `distance` بكسل |
| `scale` | كتلة، سطر، كلمة | من `from` إلى 1 |
| `reveal` | سطر، كلمة (الكتلة تُكشف سطرًا سطرًا) | قناع يكشف النص المشكَّل كاملًا من بداية القراءة (اليمين) |
| `highlight` | الكلمات المعلَّمة أو أرقام كلمات | شريط يُرسم تحت النص وينمو من بداية القراءة |

- الوحدات تُقطع عند المسافات فقط (منتصف المسافة بين كلمتين)، وتغطي الطبقة دون فراغ ولا تداخل. لا وحدة
  «حرف»: `unit: 'letter'` خطأ `motion.letters-forbidden`، و`typewriter`/تباعد الحروف خطأ
  `motion.tracking-forbidden`.
- كل حالة دالة نقية في رقم الإطار (`start`, `duration`, `stagger` أعداد إطارات)، لا في الساعة. والإطار
  الأخير يضع كل قطعة حيث وضعها التخطيط؛ والمحرك يرسم الطبقة كاملة عند الاستقرار.
- `planMotion` ينبّه (`motion.ink-crosses-piece`) إن تجاوز حبر كلمة قطعتها (حركات تحت السطر في ارتفاع
  سطر ضيق) بدل أن يقصها بصمت.

## الدمج

| المحرك | الطريقة |
|---|---|
| المحرّر (React) | `components/RichText.jsx` → `ArabicRuns` (المخرجات نفسها حرفيًا: 442 حالة) |
| المعاينات وQA (HTML نصي) | `lib/studio/htmlPreview.js` → `runsHtml` (المخرجات نفسها بايتًا ببايت: 492 حالة، و518 صفحة من أوراق الأساليب بلا فرق بكسل) |
| محرك الريل الحالي (Canvas) | `lib/video.js`: عنصر بـ`data-anim` و`data-text-motion='[…]'` يُلتقط مرة ويُقاس في DOM (`captureTextLayer`)، والإطارات تحرّك قطعًا من طبقته (`drawTextLayer`). العناصر الأخرى كما كانت |
| محركات HTML (لكل إطار) | `arabicTextHtml(spec)` للنص، و`frameHtml(spec, layout, frameState(plan, f))`: نسخ كاملة من الفقرة نفسها بقص `clip-path` وتحويل |
| محركات Canvas أخرى | `ts.typeset(spec, { scale })` → طبقة PNG شفافة بالدقة المطلوبة + `layout`، ثم `drawArabicTextFrame(ctx, { image, scale, layout }, frameState(plan, f), { x, y })` |
| Pango (لاحقًا) | يطبّق `typesetter.js` ويجتاز فحص `arabic-text-check` |

أي تعديل على النص يغيّر المفتاح فتُولَّد الطبقة من جديد؛ النص الأصلي يبقى في المشروع. والطبقة
المسطّحة صورة: لا تُوصف بأنها نص قابل للتحرير داخل Canva. ودعم `textDirection` في محرك ما لا يكفي
وحده دليلًا على جودة العربية: الفحص يقيس الاتصال والترتيب والقص فعليًا.

## الأدوات

```sh
node --test tests/arabic-text.test.js            # البيانات والحدود (بلا متصفح)
node scripts/arabic-text-check.mjs               # Chromium: الحالات، الثبات، القص، الحركة → check/
node scripts/arabic-text-reel.mjs                # ريل 1080×1920 بمحرك المشروع → reel/
FFMPEG=/path/to/ffmpeg node scripts/arabic-text-video-check.mjs   # فحص MP4 مقابل الإطارات
```

## الاعتماديات والتراخيص

| المكوّن | الاستعمال | الرخصة |
|---|---|---|
| خطوط `@fontsource` (Cairo، Tajawal، Almarai، Readex Pro 5.3.0) | النص | SIL OFL 1.1 |
| Chromium عبر Playwright | المنضّد في Node والفحص (غير مضمّن في التطبيق؛ التطبيق يعمل في متصفح المستخدم) | Playwright: Apache-2.0؛ Chromium: رخص BSD وغيرها |
| esbuild | حزم شيفرة الصفحة للسكربتات | MIT |
| html-to-image | التقاط طبقات الريل (موجود سابقًا) | MIT |
| mediabunny | ترميز الفيديو (موجود سابقًا) | MPL-2.0 |
| ffmpeg | أداة فحص خارجية فقط (قراءة MP4، استخراج إطارات، SSIM، نسخة H.264 للتسليم)؛ ليست اعتمادية ولا تُضمَّن | GPL (البناء الثابت المستعمل) |

لم تُضف اعتمادية جديدة إلى `package.json`.

## القيود

- القياس والرسم متحقق منهما في Chromium فقط. Safari (WebKit) وFirefox (Gecko) يشكّلان ويقيسان
  بمحركاتهما؛ المحرّر يعمل فيهما ولم يُقس فيهما.
- Chromium هنا لا يرمّز H.264: ملف المثال VP9 داخل MP4. نسخة H.264 للهاتف صُنعت بـffmpeg خارجيًا.
  قبول إنستغرام لـVP9 داخل MP4 لم يُختبر. التطبيق نفسه في هذا المتصفح يصدّر WebM كما كان.
- حبر الكلمة المقدّر من مقاييس Canvas يختلف عن الحبر المرسوم بما يصل إلى نحو 9 بكسل (أوسع دائمًا في
  الحالات المقيسة)؛ الفحص النهائي من الطبقة المرسومة نفسها.
- قياس الاستوديو أثناء التخطيط ما زال تقديريًا (`lib/studio/measure.js`)؛ Chromium هو الحَكَم في
  `style-qa` و`render-design` وفحص ArabicText.
- النص في PowerPoint وCanva يشكّله ذلك التطبيق لا ArabicText.
- الحركة تعمل على طبقة نقطية في محرك Canvas: التكبير فوق 1 يلين الحواف؛ لذلك يبدأ `scale` من أقل من 1.
- OCR لم يُستعمل دليلًا؛ المراجعة البشرية على الصور المكبّرة.
