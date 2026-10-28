# تقرير QA — أول إنتاج سينمائي للقانون 31

الحالة: **VISUAL REVIEW — NOT PUBLICATION READY**. يوجد MP4 حقيقي، ولا يوجد تسجيل جديد للراوي. لم تُصرف أرصدة MotionLab أو تُنفذ عملية توليد مدفوعة جديدة.

## الفيديو والملفات

1080×1920، 9:16، 60fps، H.264 High / yuv420p / BT.709، 5160 إطارًا، 86 ثانية. المدة تخص المراجعة الصامتة، وليست مدة تسجيل مقاسة. مسار الفيديو داخل المشروع: `projects/law31-first-reel/renders/Law31-Visual-Review-1080x1920-60fps.mp4`.

بصمة الفيديو SHA-256: `43abff15719c6a31f061c842bb93545b806213919ac2886d5d6ca12c96e8b7c9`.

- [Law31-Visual-Review-1080x1920-60fps.mp4](https://chatgpt.com/library?file_id=libfile_b6fadbe5e3dc8191bbee8dcbf4f21f4c&account_id=personal)
- [Law31-Original-Art-and-Layers.zip](https://chatgpt.com/library?file_id=libfile_ff698ced77808191a5adf1b9345fb3fe&account_id=personal)
- [Law31-Storyboard.jpg](https://chatgpt.com/library?file_id=libfile_76f79c90ad208191893228add80355fa&account_id=personal)
- [Law31-Visual-QA-Evidence.zip](https://chatgpt.com/library?file_id=libfile_aa2357acefc48191a97703f947e07374&account_id=personal)

الروابط خاصة بالحساب الذي أُنشئت فيه الملفات. المراجعون الآخرون يحتاجون حزمة الأصول. لا تتضمن حزم الوسائط كود المستودع؛ JSON والكود والتقارير موجودة في هذا الفرع.

## النتائج المنفذة

| الفحص | النتيجة | الدليل داخل projects/law31-first-reel/qa |
|---|---|---|
| TypeScript | PASS | typescript.log |
| ESLint changed workflow | PASS | eslint-new-scope.log |
| ESLint whole existing project | FAIL_PREEXISTING | full-lint.log; baseline-lint.log |
| Module imports | PASS | module-imports.json |
| Engine and workflow regression tests | PASS | engine-test.json; workflow-test.json |
| JSON, frame bounds and independent depth | PASS | config-preflight.json |
| PNG decode, dimensions, alpha and hashes | PASS | asset-preflight.json |
| Composition discovery and per-scene preview | PASS | compositions.json |
| 18-scene JSON production slot | PASS | 18-scene-workflow.json |
| Studio start and HTTP | PASS | studio-http.json |
| Determinism final source | PASS | determinism-final.json |
| Full MP4 decode, black/freeze scan | PASS | full-decode.log |
| Visual review of actual MP4 samples | PASS_WITH_SCOPE | mp4-samples.json; mp4-review-board-1..4.jpg; mp4-transitions.jpg |
| SRT syntax, order and RTL | PASS_ESTIMATED_TIMING | config-preflight.json; rendered samples |
| Legacy render compatibility | PASS_SAMPLES | legacy-clip.log; legacy-compatibility.json |
| Strict legacy pixel comparison | PARTIAL_FAIL | legacy-compatibility.json |
| Narration, LUFS, True Peak and alignment | BLOCKED | ../audio/provider-status.json |
| SAM 2 / Depth Anything V2 | NOT_INSTALLED_NOT_RUN | Deferred; manual masks and local OpenCV used |
| Publication-ready final reel | BLOCKED | Narration, actual scene timing, synchronized captions and audio QA remain |

## نطاق المراجعة المرئية

رُوجعت بداية ووسط ونهاية المشاهد الـ12، و5 نقاط وسط انتقال، من MP4 الناتج نفسه. ظهر zoom، pan أفقي، vertical reveal، وحركة نسبية فعلية بين الطبقات. فحص الحدود غطّى الإطارات الـ5160؛ أصغر هامش تغطية للخلفية نحو 27 بكسلًا. كشف العملاق في بداية مشهد 03 مقصود، وليس clipping غير متوقع.

المشاهد 01 و03 و05 و11 لها PNG مستقلة وخلفيات نظيفة ومواقع عمق مختلفة. المشاهد الثمانية الأخرى لوحة مرسومة واحدة مع حركة كاميرا، ولا توصف بأنها parallax متعدد الطبقات. لم تُحوّل الصور إلى 3D حقيقي. لم نستخدم رسومات SVG تجريبية بديلة عن الفن النهائي.

اختبار الحتمية النهائي صير الإطارات 169 و680 و1755 و4321 مرتين، ثم طابق SHA-256 والبكسلات. يتعلق هذا بإعادة تصيير Remotion مع أصول ثابتة، لا بإعادة توليد الصور من AI.

لم يظهر فحص blackframe لكل إطار أي إطار تبلغ فيه نسبة البكسلات السوداء 98% عند threshold=5، ولم يُظهر blackdetect أحداثًا وفق عتباته المسجلة، ولم يظهر freezedetect توقفًا يصل إلى 2 ثانية. هذا فحص آلي لكل الفيديو مع مراجعة بصرية لعينات محددة؛ لا ندّعي مشاهدة كل إطار يدويًا.

## الإخفاقات والحدود

- فحص ESLint الشامل يفشل في مخالفة قديمة `@remotion/from-0` في `src/Power31.tsx:20`. تكرر الفشل على baseline ولم يتغير ذلك الملف. ESLint للـworkflow الجديد وTypeScript ناجحان.
- CinematicDemo مطابق تمامًا في عينة 1080×1920. عينة Power31-Cinematic تُصيّر بنجاح، مع فرق 145 بكسلًا من 2073600 في منطقة صغيرة من تذييل النص. المقارنة الصارمة لذلك الإطار FAIL؛ لم يُحسم سبب فرق الرسم. لا توجد دعوى تطابق بكسلي شامل لكل الأعمال السابقة. صُدرت عينة MP4 منها مدتها 2 ثانية أيضًا.
- خدمة SILMA المجانية أعادت خطأ اتصال. ElevenLabs أُخذ له تقدير فقط لتسجيل واحد نحو $0.19؛ لم يُولّد صوت جديد. لا يمكن قياس LUFS/True Peak أو تزامن ترجمة مع صوت غير موجود. ملف SRT الحالي تقديري من 33 cue، ولا توجد دعوى دقة 17ms.
- SAM 2 وDepth Anything V2 لم يُثبتا ولم يُشغلا. استُخدم OpenCV محلي في بيئة Python مستقلة، بأقنعة يدوية وGrabCut، دون أوزان نماذج ضخمة.
- عادت البيئة إلى لقطة أقدم أثناء العمل. استُعيدت اللوحات الأصلية نفسها من نسخ محفوظة وأعيدت الاختبارات والتصييرات. برومبتات Storyboard المحفوظة تعيد وصف الاتجاه الفني؛ ليست ضمانًا لإعادة توليد الرسومات نفسها.
- فشل تحرير شفاف واحد للمتحكّم لدى مزوّد الصور؛ استُخدم الأصل المعتمد وفُصل محليًا. رُوجع قناع الرأس وتدرج الجسم بدل قبول حواف مشوهة. وُجدت ملفات PNG مشتقة غير مكتملة في الجولة الأولى؛ أُعيد تجهيزها وفُحص فكها وبصماتها، مع حفظ PNG ذري قبل إتاحته للتصيير.

## حفظ التوافق والتكرار

لم يتغير مصدر CinematicCameraEngine أو CinematicDemo أو Power31 أو current.json أو package.json/lock؛ بصماتها في source-preservation.json. التعديلات المشتركة في workflow إضافات اختيارية. يتيح `--no-register` التصيير دون الكتابة على current.json؛ و`--active-production` يجهز slot مستقلًا لموضوع آخر.

اختُبر slot عام بـ18 مشهدًا من JSON: اكتُشفت 18 معاينة، وكانت مدة التجميع 540 إطارًا، وصُيّرت معاينة المشهد 18، ثم أُعيد active-production.json الأصلي. لم نُصدر فيديو موضوع ثانٍ كاملًا من 18 مشهدًا. دليل الاستخدام العربي: `docs/law31-workflow-ar.md`.

## المتبقي للنشر

تسجيل الراوي للنص المعتمد، ثم محاذاة فعلية وSRT مضبوط ومدد مشاهد مقاسة، وإعادة ضبط مفاتيح الكاميرا بحسب المدد. يلي ذلك قياس −16 LUFS وTrue Peak لا يتجاوز −4 dBTP، وفحص الاستماع والمزامنة، وإعادة تصيير النسخة ذات الصوت ومراجعتها. تبقى شارة «نسخة بصرية للمراجعة» حتى اجتياز هذه المرحلة. تبقى ملاحظات lint والمقارنة القديمة موثقة للمراجعة في PR.
