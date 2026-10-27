# خارج دوّامة الهاتف

ريل عربي عمودي مستوحى من موضوع الصورة المرفقة، بصياغة أصلية، وشخصية Stickman متجهية، وتعليق ALI العربي السعودي من ElevenLabs v4. أضيفت موسيقى آلية هادئة وخافتة حسب طلب المستخدم اللاحق.

المواصفات: 1080×1920، 9:16، 60fps، نحو 80.37 ثانية، H.264، yuv420p، BT.709، CRF 15، وصوت AAC 192k. توجد 8 مشاهد مستقلة قابلة للتحرير في Studio، وتوقيتات الكلمات وملف SRT.

## التشغيل

من هذا المجلد، ثبّت Node.js المتوافق مع `package.json`، ثم:

```sh
npm ci
npm run check
```

فك حزمة الأصول المسلّمة داخل المجلد نفسه لتوفير الصوت والخطوط ومؤثر EffectCraft في مساراتها. ثم:

```sh
node --require ./scripts/runtime.cjs ./node_modules/@remotion/cli/remotion-cli.js studio --no-open
npm run render:final
```

يُكتب كل تصدير في مجلد جديد داخل `out/`. يمكن ضبط `ATTENTION_CHROME` لمسار Chrome Headless Shell متاح؛ وإلا يستخدم Remotion آليته المعتادة. يضيف `runtime.cjs` loopback فقط إذا فشل استعلام واجهات الشبكة في بيئة الاستضافة.

## التعديل والأصول

- `src/AttentionReel.tsx`: عقد المشاهد الثمانية وتوقيتها، ومسار المزيج النهائي.
- `src/scenes/`: مكونات منفصلة مسجلة في `src/Root.tsx`.
- `src/Stickman.tsx`: الرسم المفصلي، بما فيه المشي والتنفس والعمل.
- `src/design.tsx`: المنظومة البصرية والعربية والرسوم المشتركة.
- `production/script.txt`: النص المنطوق. `production/captions.json` و`captions.srt`: ترجمة مستقلة بتوقيت الكلمات.
- `production/EDITORIAL.md`: قرارات التحرير والمصادر وحدود التحقق.
- `production/music-provenance.json`: طريقة صنع الموسيقى، وتوقيتها، وغياب العينات والمراجع الموسيقية الخارجية، وبصمة ملف الصوت.
- `public/audio/narration.flac` و`original-music.flac` و`mix.flac`: التعليق والموسيقى والمزيج. المسار الموسيقي مستقل عند قرابة −34 LUFS، ويُخفض تلقائيًا تحت الكلام في المزيج.

## إعادة إنتاج الصوت

تحتاج Python مع NumPy وSciPy، وFFmpeg/FFprobe. بعد توفير التسجيل الأصلي والتفريغ من حزمة الأصول:

```sh
python scripts/prepare_assets.py production/source-words.json
python scripts/build_timeline.py
```

الموسيقى أُنشئت بموجات جيبية وتآلفات وتوقيتات جديدة لهذه النسخة. لم تُستخدم عينات أو أغنيات منشورة أو حلقات جاهزة أو مكتبة تسجيلات. هذا توثيق للمصدر، وليس ادعاء تسجيل حقوق أو ضمان خلو الفيديو من كل مطالبة آلية. لم يُنشر الفيديو على حساب المستخدم أو يُرفع لفحص Content ID.

## EffectCraft

أُنتج `public/attention-boundary.ecproj` ببرنامج EffectCraft v0.16.0. تسلسل حدود التركيز يحتوي 120 إطار PNG RGBA، بأبعاد 1080×1920 ومعدل 60fps، ويُركّب وفق ساعة Remotion عند إبعاد الهاتف. لإعادة إنتاجه، استعمل مسار CLI الذي يعيده مثبت Craft الموثق:

```sh
mkdir -p public/fx/boundary-v1
effectcraft-cli --project public/attention-boundary.ecproj render --comp AttentionBoundary --out public/fx/boundary-v1/boundary.png --format png --fps 60 --channels rgba --audio off
```

عند غياب التسلسل، يعمل البديل المتجهي داخل Remotion. جميع النصوص والتوقيت والصوت والإخراج النهائي تحت Remotion.

## التحقق

فحص TypeScript، ومراجعة 18 عينة موزعة على مراحل المشاهد، ثم عينات لتصحيح تسمية الخطوة الثالثة واتصال صفحتي الكتاب. يصف `production/final-qa.json` قياسات الملف النهائي. هذه مراجعة بصرية بالعينة، وليست ادعاء فحص كل إطار يدويًا أو ضمانًا مطلقًا لعدم وجود أي عيب.

## التسليم

[حزمة الأصول للتشغيل](https://chatgpt.com/library?file_id=libfile_9d66d85b29b0819185628cdfcf47442e&account_id=personal) · [الفيديو النهائي](https://chatgpt.com/library?file_id=libfile_2a06fb7909dc8191b395d8df6de8f46f&account_id=personal). يتطلب فتح الملفات حساب المالك. فك الحزمة داخل هذا المجلد قبل العرض أو التصدير.
