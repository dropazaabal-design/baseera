# الاختيار المفخخ — القانون 31

ريل عربي أصلي عن القانون 31 من «48 قانونًا للسلطة» لروبرت غرين، بقراءة أخلاقية تحذّر من الخداع والإكراه واستغلال الحاجة. 11 مشهدًا، 1080×1920، 60fps، نحو 2:11. صوت روائي قوي من ElevenLabs فقط، بدون موسيقى أو مؤثرات صوتية.

## التشغيل

ثبّت Node.js حسب package.json، ثم شغّل:

```sh
npm ci
npm run check
node --require ./scripts/runtime.cjs ./node_modules/@remotion/cli/remotion-cli.js studio --no-open
```

قبل العرض أو التصدير، فك حزمة الأصول المرفقة داخل هذا المجلد؛ توفر التسجيل، والخطوط، وتسلسل EffectCraft. يشغّل Studio محليًا مشهد Power31 والمشاهد المستقلة. استُخدمت معاينات إطارات فعلية للمراجعة في بيئة العمل التي لا يصل متصفحها السحابي إلى localhost.

```sh
npm run render:final
```

التصدير في مجلد جديد بتوقيت داخل out/، دون الكتابة فوق إصدار سابق. متغير POWER31_CHROME اختياري لتحديد Chrome Headless Shell متاح.

## التحرير

- src/Power31.tsx: كل مشهد عقدة مستقلة، مع صوت الراوي وحده.
- src/scenes/: المشاهد نفسها مسجلة بتوقيت مستقل في src/Root.tsx.
- src/Stickman.tsx: جسم مفصلي وأوضاع تفكير ورفض ومشي وإشارة.
- src/Captions.tsx: قالب ترجمة RTL؛ لكل مشهد مصفوفة Caption حرفية محلية. تعذر تنزيل Basic Captions الرسمي في البيئة، ولذلك استُخدم قالب محلي قابل للتحرير بالكود. لا ندعي أنه عنصر Basic Captions الأصلي أو أن محرر الترجمة الخاص به متاح.
- production/: النص، SRT، توقيت الكلمات، مصدر الكتاب وقرارات التحرير وتقارير الفحص.

بعد تعديل النص وتوقيته يمكن بناء التوقيتات من جديد:

```sh
python scripts/build_timeline.py
```

يكتب السكربت عقد المشاهد صراحة في المصدر، ويحدّث مصفوفات ترجمتها. احتفظ بتعديلاتك قبل تشغيله لأنه يعيد إنشاء Power31.tsx وRoot.tsx من التوقيتات. لا يولد صوتًا جديدًا. التسجيل الخام يمكن إعادة معالجته عبر scripts/prepare_audio.py مع FFmpeg.

## Craft

المصدر public/choice-gate.ecproj. لإعادة إنتاج إطار الباب الثالث بعد تثبيت EffectCraft بالمهارة المرفقة:

```sh
effectcraft-cli --project public/choice-gate.ecproj render --comp ChoiceGate --out staging/gate.png --format png --fps 60 --channels rgba --audio off
```

تحقق من 120 إطارًا متتابعًا بدقة 1080×1920 وRGBA، ثم انقل المجلد كاملًا إلى public/fx/choice-gate-v1. عند غياب التسلسل يعمل بديل متجهي داخل Remotion.

## التوثيق

القانون 31 مؤكد في فهرس الناشر؛ لا يخلط المشروع بينه وبين القانون 37. الحوار مثال توضيحي أصلي، وليس نقلًا من الكتاب. لم يُنشر الفيديو على أي حساب اجتماعي. انظر production/EDITORIAL.md وproduction/final-qa.json لقرارات التحرير وحدود الفحص.

## ملفات التسليم

[الفيديو النهائي](https://chatgpt.com/library?file_id=libfile_34c1755d46508191b4ee36b5d3182b4e&account_id=personal) · [حزمة الأصول](https://chatgpt.com/library?file_id=libfile_44b2e78063588191a82c97c919d2faea&account_id=personal) · [السكريبت والكابشن](https://chatgpt.com/library?file_id=libfile_8ad65ea255388191b1a76e70996166a6&account_id=personal) · [SRT](https://chatgpt.com/library?file_id=libfile_b6280e9f1bd481919361845d9d326604&account_id=personal). الروابط خاصة بحساب المالك.
