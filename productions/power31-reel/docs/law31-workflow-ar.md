# إنشاء فيديو جديد داخل Baseera

هذه النسخة تنتج مراجعة بصرية صامتة للقانون 31، وليست نسخة جاهزة للنشر. التسجيل الجديد لم يُنتج؛ الترجمة الحالية تقديرية. تنزيل حزمة الرسومات وفكها داخل `productions/power31-reel/` يعيد ملفات public واللوحات الأصلية. تبقى ملفات الكود وJSON داخل الفرع.

## المعاينة

من مجلد `productions/power31-reel`:

```bash
npm ci
npm run dev -- --port=3004
```

اختر `Law31-First-Cinematic-Reel` للمراجعة الكاملة، أو `Law31-scene-01` حتى `Law31-scene-12` لمشهد منفرد. بقي `CinematicDemo` و`Power31-Cinematic` كما هما. إعدادات المشاهد قابلة للتحرير في JSON وProps داخل Studio.

## استبدال الرسومات

الملف `src/projects/law31-first-reel.json` هو مصدر هذا الإنتاج. ملفات PNG تحت `public/law31-first-reel/`. لا تكتب public في قيمة src؛ مثال: `law31-first-reel/scene-01/main-character.png`.

احتفظ بكل الطبقات على canvas واحد، مع إحداثيات ومحاذاة متطابقة، وخلفية نظيفة وراء الأجسام المنفصلة. في هذا الإنتاج 01 و03 و05 و11 متعددة الطبقات. باقي المشاهد لوحة واحدة مع حركة كاميرا فقط. لا تجعل zoom على لوحة واحدة دليلًا على parallax.

لكل layer قيم `src`, `depth`, `scale`, وموضع اختياري x/y. المحرك يضيف scale بحسب العمق؛ استخدم `scale = 1/(1+depth*0.035)` للمحاذاة عند السكون. اختلاف حركة الكاميرا حسب العمق يبقى فعليًا. الخيوط والأيدي والأبواب في مشهد 03 تشترك في depth حتى لا تنفصل وصلاتها.

## الكاميرا والمدة

مدة scene بالثواني، وتُقرّب إلى إطارات 60fps. توجد خمسة presets: slowPush وpullBack وpanLeft وdriftRight وtiltReveal. قيم `camera.from/to` الصريحة تتقدم على القالب؛ و`camera.keys` تتقدم عليهما. لتغيير نوع حركة هذا المشروع انسخ camera من المشهد المناسب، ثم عدّل الأرقام. من دون هذه القيم قد تكون القوالب القديمة المصممة لأصول SVG أوسع من حدود PNG عمودية.

المحرك يعمل في عالم 1600×2200، مركزه 800,1100. هذه القيم ليست إحداثيات الصورة. أمثلة آمنة للوحات 9:16 عند scale المعوض:

| الحركة | from x,y,zoom | to x,y,zoom |
|---|---|---|
| slowPush | 785,1100,0.96 | 812,1080,1.05 |
| pullBack | 800,1065,1.12 | 800,1100,0.93 |
| panLeft | 820,1100,0.98 | 780,1100,0.98 |
| driftRight | 789,1100,0.97 | 808,1090,0.99 |
| tiltReveal | 800,1370,1.17 | 800,1065,0.94 |

افحص الحدود لكل رسم؛ هذه الأمثلة لا تضمن أن العنصر المهم داخل الإطار. transitions اختيارية: cut أو crossfade، وduration بالثواني داخل زمن المشهد الوارد، دون تغيير التوقيت الإجمالي. إضاءة ورسومات المصدر تبقى أصلية؛ لا ticker ولا توقيت ساعة النظام.

## فيديو جديد من 18 رسمًا دون React

1. انسخ JSON إلى `src/projects/my-topic.json`.
2. ضع الرسومات والطبقات تحت `public/my-topic/`.
3. اكتب 18 عنصرًا في scenes، لكل منها id فريد، duration وlayers وpreset والكاميرا.
4. ضع الصوت وSRT تحت public، ثم عيّن audio وsrt بمسارين نسبيين.
5. جهّز slot الإنتاج العام، دون الكتابة على current.json القديم:

```bash
node scripts/workflow/prepare-project.cjs src/projects/my-topic.json --active-production --props=out/my-topic-props.json
```

6. اختر `Baseera-Production` في Studio. قائمة `Active-Production-Scenes` تُبنى من JSON النشط، فتشمل المشاهد الـ18. هذه الخطوة تغيّر active-production.json فقط؛ مصدر القانون 31 والأعمال القديمة محفوظة.
7. صيّر باستخدام آلية Remotion الموجودة:

```bash
node scripts/workflow/prepare-project.cjs src/projects/my-topic.json --no-register --props=out/my-topic-props.json
npx remotion render src/index.ts Baseera-Production out/my-topic.mp4 --props=out/my-topic-props.json --codec=h264 --crf=16 --pixel-format=yuv420p --image-format=png
```

اختر browser-executable عند الحاجة إلى Chrome مثبت محليًا. المواصفات الافتراضية 1080×1920 و60fps. لا موسيقى.

## إضافة الصوت الصحيح

استخدم تسجيلًا نهائيًا مرخصًا يقرأ السكريبت المعتمد. لا تعِد استخدام تسجيل ذي نص مختلف. احفظ مدته الفعلية بـ ffprobe. أنشئ SRT مطابقًا للتسجيل، ثم اضبط مدد المشاهد على حدود الراوي. يمكن استعمال endCue لتحديد آخر cue لكل مشهد في prepare-project. أعد توزيع frames الخاصة بالكاميرا إذا تغيّرت المدة، لأن القيم السابقة تقديرية.

بعد إدخال الصوت غيّر `presentation.reviewLabel` وأزل شارة المراجعة بعد اجتياز QA، لا بمجرد إرفاق MP3. افحص الملف النهائي عند −16 LUFS وTrue Peak لا يتجاوز −4 dBTP، والاستماع الفعلي، والصمت والقص. لا تمس بوابات الصوت القديمة أو إنتاجاتها. بوابة 17ms لا تُعلن محققة من SRT تقديري.

## الاختبارات والتصيير الحالي

```bash
npm run check
npx eslint src/workflow
node scripts/engine/test.cjs
node scripts/workflow/test.cjs
node scripts/law31/preflight.cjs
```

`npm run lint` يكشف حاليًا مخالفة قديمة `@remotion/from-0` في Power31.tsx؛ المصدر القديم لم يتغير. راجع تقرير QA بدل افتراض نجاح كامل lint.

الصورة المولدة في ChatGPT لا تعني أن أداة التوليد متاحة داخل Node. خط Remotion يعمل بأصول PNG وJSON المحفوظة. فصل إضافي يحتاج أقنعة يدوية أو مزوّدًا مصرحًا به؛ SAM2 وDepth Anything غير مثبتين.
