# قدرات Canva — لقطة وقت البناء

مولّد من `lib/studio/canva/registry.js` بمخططات أدوات Canva الملتقطة في 2026-10-02 ونتائج الاختبار الحي المؤرخة أدناه. **ليس مرجعًا ثابتًا**: أدوات الموصل تتغير، فشغّل `canva_capabilities` بمخططات جلستك قبل أي عمل؛ ما لم تُقرأ مخططاته في الجلسة يظهر «لم يُتحقق»، وأي اختبار حي على مخطط تغيّر بعده يصبح «قديمًا» ويُعاد التحقق منه.

الحالات: مدعوم · جزئي (يعمل بحدود مذكورة) · غير مدعوم · لم يُتحقق. المسارات: الموصل (ينفّذه المساعد) · ملف أصلي .pptx (يستورده المستخدم في Canva فيُنشئ تصميمًا جديدًا) · Connect API (برمز وصول من المستخدم) · يدوي في Canva.

| القدرة | الموصل | ملف أصلي | Connect API | يدوي في Canva |
|---|---|---|---|---|
| إنشاء تصميم | جزئي: copy-design لقاعدة سابقة ثم resize-design | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | لم يُتحقق: POST /v1/designs (custom width/height) | — |
| مقاس مطابق بالبكسل | مدعوم: resize-design | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | لم يُتحقق: POST /v1/designs (custom width/height) | — |
| إضافة صفحة | مدعوم: edit-design: add_page | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| ترتيب الصفحات | مدعوم: edit-design: reorder_page | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| حذف صفحة | جزئي: merge-designs: delete_pages | غير مدعوم | غير مدعوم | — |
| نسخ صفحات | جزئي: copy-design (page_numbers) | غير مدعوم | غير مدعوم | — |
| إضافة مربع نص | مدعوم: edit-design: add_text | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| تعديل نص | مدعوم: edit-design + read-design: replace_text | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| تنسيق النص (الحجم، اللون، الوزن، المحاذاة، المسافة بين الأسطر) | مدعوم: edit-design: format_text | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| اختيار عائلة الخط | غير مدعوم | جزئي: .pptx: typeface لكل نص | لم يُتحقق: POST /v1/imports (.pptx) ثم GET /v1/imports/{job} | مدعوم: حدّد النصوص ← قائمة الخط ← Cairo أو Tajawal. |
| تلوين كلمة داخل النص | غير مدعوم | جزئي: .pptx: run مستقل للكلمة المميزة | لم يُتحقق: POST /v1/imports (.pptx) ثم GET /v1/imports/{job} | — |
| نص عربي من اليمين لليسار | جزئي: edit-design: add_text + format_text | جزئي: .pptx: rtl="1" ولغة ar-SA | غير مدعوم | — |
| إدراج صورة | مدعوم: create-upload-url + edit-design: insert_fill | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | لم يُتحقق: POST /v1/asset-uploads | — |
| استبدال صورة أو قصّها | مدعوم: edit-design: resize_element + crop_media | غير مدعوم | غير مدعوم | — |
| إدراج فيديو | مدعوم: edit-design: insert_fill (asset_type video) | غير مدعوم | لم يُتحقق: POST /v1/asset-uploads | — |
| إدراج شكل متجه | مدعوم: edit-design: insert_shape | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| تعديل شكل (لون، حد، مسار) | مدعوم: edit-design: recolor_element | غير مدعوم | غير مدعوم | — |
| ترتيب الطبقات | جزئي: edit-design: layer_element | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| تجميع العناصر | مدعوم: edit-design: group_elements | جزئي: canva_import_editable → .pptx → يستورده المستخدم في Canva | غير مدعوم | — |
| حركة العناصر | غير مدعوم | غير مدعوم | غير مدعوم | مدعوم: حدّد العنصر ← Animate ← اختر حركة (لا تختر حركة حرفًا حرفًا للعربية). |
| انتقالات الصفحات | غير مدعوم | غير مدعوم | غير مدعوم | مدعوم: حدّد الصفحة ← Animate ← Page Animations/Transitions. |
| مدة كل مشهد | غير مدعوم | غير مدعوم | غير مدعوم | مدعوم: مؤقت الصفحة ← أدخل المدة بالثواني. |
| إضافة صوت | غير مدعوم | غير مدعوم | غير مدعوم | مدعوم: Elements ← Audio أو ارفع ملفك (لا نضيف موسيقى تلقائيًا). |
| معاينة الصفحات | مدعوم: read-design (thumbnails, thumbnail_pages) | غير مدعوم | لم يُتحقق: GET /v1/designs/{id}/pages | — |
| ملاحظات الصفحة (خطة المشهد) | مدعوم: edit-design: replace_speaker_notes | غير مدعوم | غير مدعوم | — |
| تصدير PNG | مدعوم: get-export-formats ثم export-design (png) | غير مدعوم | لم يُتحقق: POST /v1/exports (png) | — |
| تصدير JPG | مدعوم: get-export-formats ثم export-design (jpg) | غير مدعوم | لم يُتحقق: POST /v1/exports (jpg) | — |
| تصدير PDF | مدعوم: get-export-formats ثم export-design (pdf) | غير مدعوم | لم يُتحقق: POST /v1/exports (pdf) | — |
| تصدير فيديو MP4 | مدعوم: get-export-formats ثم export-design (mp4) | غير مدعوم | لم يُتحقق: POST /v1/exports (mp4) | — |
| تصدير GIF | مدعوم: get-export-formats ثم export-design (gif) | غير مدعوم | لم يُتحقق: POST /v1/exports (gif) | — |
| تصدير PowerPoint | مدعوم: get-export-formats ثم export-design (pptx) | غير مدعوم | لم يُتحقق: POST /v1/exports (pptx) | — |
| استيراد ملف تصميم أصلي (PPTX) | غير مدعوم: create-upload-url: .pptx مرفوض، .pdf بلا تحويل | جزئي: المستخدم يرفع الملف في Canva (Upload → استيراد) أو Connect API | لم يُتحقق: POST /v1/imports (.pptx) ثم GET /v1/imports/{job} | مدعوم: Upload ← ارفع ملف .pptx ← يُفتح تصميمًا جديدًا. |

## اختبارات حية مؤرخة

- 2026-10-02 — import.native-file (connector): unsupported. PPTX: «Unsupported file format PPTX» (HTTP 400). PDF قُبل لكنه أعاد fileId فقط، ولا أداة في الموصل تحوّله إلى تصميم.
- 2026-10-02 — design.create (connector): partial. create-design أنتج 1080×1440 برسوم مولّدة؛ نسخ قاعدة سابقة لا يولّد شيئًا، وتبقى صورة خلفيتها تحت شكل الخلفية.
- 2026-10-02 — design.size (connector): supported. 1080×1350 → 1080×1920 أنشأ تصميمًا جديدًا وبقي الأصل كما هو؛ بلا توليد.
- 2026-10-02 — text.add (connector): supported. كاروسيل 3 صفحات وريل 5 مشاهد: 54/54 نصًا طابق حرفيًا في القراءة الراجعة.
- 2026-10-02 — text.format (connector): supported. الحجم واللون والوزن والمحاذاة والمسافة بين الأسطر طُبّقت وقُرئت راجعة مطابقة.
- 2026-10-02 — text.rtl (connector): partial. الاتصال والترتيب من اليمين صحيحان، ولا حقل لاتجاه الفقرة: Canva يأخذه من أول حرف أو رقم، فنص يبدأ برقم أو بحرف لاتيني يحاذى يسارًا مع start؛ نرسل end لهذه النصوص.
- 2026-10-02 — page.add (connector): supported. صفحات 1080×1350 و1080×1920 بخلفية لونية؛ معرّفاتها تُقرأ من design_content مع transaction_id.
- 2026-10-02 — image.insert (connector): supported. SVG مرفوع أُدرج بموضعه ومقاسه.
- 2026-10-02 — image.replace (connector): supported. بعد تكبير الإطار تُعاد الصورة كاملة بـ crop_media وإلا قُصّت.
- 2026-10-02 — shape.insert (connector): supported. مسارات ودوائر وحبوب وأيقونات بخط فقط.
- 2026-10-02 — speaker-notes (connector): supported. خطة 5 مشاهد (المدة والحركة والانتقال) خُزّنت وقُرئت راجعة في ملاحظات كل صفحة.
