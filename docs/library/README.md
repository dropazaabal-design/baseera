# مكتبة الأساليب — الملفات

| الملف | ما فيه | يُكتب بـ |
|---|---|---|
| `matrix.json` | لكل زوج أسلوب × تكوين × مقاس: هل يدّعيه الأسلوب، ونتائج العيّنات القصيرة والطويلة (وفي الوضعين للأساليب ذات الوضعين)، وفيض المتصفح، والكلمة الأخيرة المنفردة، والبصمة، والحكم، والحالة. ثم `byStyle` (الجاهز والمرفوض بسببه لكل أسلوب)، و`totals` (الأزواج الجاهزة محسوبة بالتكوين لا بضرب المقاسات)، و`sequences` (كاروسيل القبول لكل أسلوب)، و`titleOrphans` | `node scripts/style-qa.mjs --formats portrait,square,story --render` |
| `review.json` | حكمي بعد النظر في الأوراق: `ready` أو `unsuitable` أو `needs_work`، مع ملاحظة وتاريخ وبصمة ما رأيته | `node scripts/style-review.mjs <style> <composition…\|all\|sequence> <formats> <verdict> "<note>"` |
| `previews/<style>.<format>.png` | ورقة معاينة لكل أسلوب ومقاس (ربع الحجم)، و`.pages.json` بمواضع الصفحات فيها | مع `style-qa --render` |
| `previews/<style>.sequence.png` | كاروسيل القبول (8 شرائح) بذلك الأسلوب | مع `style-qa --render` |
| `sources/*.json` | ما استخرجه المحوّل من كل مصدر مثبَّت: قيم صريحة، وقواعد، وغامض، وما لا يناسب العربية | `node scripts/extract-style-sources.mjs --clone <repo>=<dir>` |

## الحالات

- زوج: `not_claimed` (الأسلوب لا يدّعي دوره أو مقاسه)، `failed` (فشل فحص آلي)، `needs_review` (نجح آليًا ولم يُنظر إليه منذ آخر تغيير)، `ready`، `unsuitable`.
- أسلوب: `source_catalog` ← `normalized` ← `rtl_adapted` ← `preview_verified` (كل أزواجه جاهزة) ← `reusable` (وكل مقاساته في المصفوفة وكاروسيله مراجَع). `rejected` و`needs_review` خارج التسلسل. الاختبار `tests/styles.test.js` يرفض أي حالة لا تسندها المصفوفة الملتزَمة.

## البصمة

المراجعة صالحة لما رأته فقط: إصدار محرك التخطيط (`VERSIONS.layout`)، وحقول الأسلوب البصرية، وكود التكوين، والعيّنات. تغيير أي منها يعيد الزوج إلى `needs_review`. وتغيير الحالة أو الاسم أو المصدر لا يلغيها.

## بعد تغيير في المحرك

1. شغّل `style-qa` إلى مجلد مؤقت.
2. `node scripts/sheet-diff.mjs docs/library/previews <المجلد>/previews` يسمّي الصفحات التي تغيّرت بكسلًا.
3. انظر في تلك الصفحات وحدها (ما لم يتغيّر هو الصورة التي رُوجعت)، ثم سجّل الأحكام وأعد تشغيل `style-qa` إلى `docs/library`.

## إضافة أسلوب

سجلّ في `lib/studio/styles/catalog.js` بحالة `rtl_adapted`: الرموز لكل وضع، والخط، والمعالجة، والزخرفة، والأدوار والمقاسات، وما يرفضه ولماذا (`notFor`)، والمصدر (من `sources.js` أو «صُمّم هنا»)، وبمَ يختلف عن أقرب أسلوب (`distinctFrom`). ثم الفحص والمراجعة، ولا ترفع الحالة قبل أن تسندها المصفوفة.
