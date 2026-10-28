# القانون 1 — تقرير الفيديو بالصوت

**PASS — ملف MP4 كامل بالصوت والترجمة المشتقة من التسجيل الحقيقي.**

المدة 99.683 ثانية، 1080×1920، 60fps، 5981 إطارًا، H.264/yuv420p. الصوت AAC أحادي 48kHz.

مستوى الصوت في MP4: -16.09 LUFS، الذروة -5.68 dBTP. SHA-256: `46c10118936bc196bc047f1f293994e6c3e61558a85e76be0f0a01abbea50a29`.

| الفحص | النتيجة | الدليل |
|---|---|---|
| Approved artwork and layers | PASS | [asset-revalidation.json](final/asset-revalidation.json) |
| Camera, motion and timeline | PASS | [timeline-animation-tests.json](final/timeline-animation-tests.json) |
| Actual rendered samples | PASS | [render-frame-validation.json](final/render-frame-validation.json) |
| Repeated renders / regression | PASS | [render-determinism-regression.json](final/render-determinism-regression.json) |
| Actual narration | PASS_WITH_SCOPE | [narration-content-review.json](audio-final/narration-content-review.json) |
| Audio master / MP3 | PASS | [audio-mastering.json](audio-final/audio-mastering.json) |
| Caption timing | PASS_WITH_SCOPE | [forced-alignment.json](audio-final/forced-alignment.json) |
| Native Remotion audio | PASS | [native-remotion-audio.json](final/native-remotion-audio.json) |
| Full MP4 and audio | PASS | [video-validation.json](final/video-validation.json) |
| TypeScript | PASS | [typecheck.txt](final/typecheck.txt) |
| Scoped ESLint | PASS_WITH_WARNINGS | [eslint.txt](final/eslint.txt) |
| Credit authorization | PASS | [narration-request.json](../audio/narration-request.json) |

## الصوت والإنفاق

أُنتج تسجيل واحد فقط بعد موافقة المستخدم: الصوت dlGxemPxFMTY7iXagmOj، النموذج eleven_v4، والتكلفة 1215.8784 رصيدًا (0.2210688 دولار حسب المزود). استُخدم تفريغ ومحاذاة محليان دون تكلفة مزود إضافية. النص المعتمد لم يتغير.

أُصلحت ذروة MP3 التي تجاوزت الهدف في تجربة معالجة محلية أولى، باستخدام هامش للترميز وقياس جديد. النسخة النهائية من MP3 وWAV وAAC اختُبرت فعليًا. لم يُعاد توليد الصوت المدفوع.

مدة الأداء 99.68 ثانية؛ ضُبطت اللقطات والكاميرا وحركة الشخصيات على هذا الأداء. نسخة المراجعة الصامتة السابقة وإعداداتها محفوظة. المراجعة الكاملة بالصوت اجتازت الفحص دون تعديل إضافي، لذلك يطابقها ملف Final ببايتاته دون إعادة ترميز.

## نطاق الاختبارات وحدودها

- Transcription and word boundaries are model estimates; no independently labeled phonetic ground truth or 17ms guarantee.
- ASR spelling differences for proper names were retained in raw reports; captions use the approved Arabic orthography.
- No human listening review is claimed.
- Visual inspection samples every shot and transitions; automated full-file decoding does not mean a person inspected all 5981 frames.
- Character animation is bounded cutout lean, eyes and approved pose changes; no newly articulated walking rig.
- Source art is 936x1664 upscaled to 1080x1920.
- Legacy compatibility covers hashes, original tests and two rendered sample frames, not all prior films/audio.

السجلات الخام لفك الفيديو وقياس الصوت في final/raw، والكلمات ومحاذاتها في audio-final. مصادر القصة في [المراجعة التحريرية](../editorial-review-ar.md).