# The 13-part carousel file (`brief.md`)

Arabic headings, in this order. «من prompts.md» means: copy the section `studio prompts` generated
from the design, then edit only the cells it marks as defaults.

| # | Heading | Contents |
|---|---|---|
| 1 | التحليل التسويقي السريع | table: الجمهور، الهدف، الزاوية، النبرة، اللغة، عدد الشرائح، سبب الهيكل |
| 2 | الفكرة العامة | one or two lines |
| 3 | عنوان الغلاف | three titles, the choice, why (and why not the others) |
| 4 | نص كل شريحة | table: slide → its texts, `*marked*` words kept |
| 5 | Storyboard بصري | من prompts.md (rewrite «الهدف» and «ملاحظة للمصمم» from your plan) |
| 6 | وصف التصميم لكل شريحة | per slide: where the title and text sit, where the marker is, frame/arrow/panel, the feeling, how it differs from the previous slide while keeping the identity |
| 7 | الألوان | table: background, titles, text, marker, secondary elements (kicker, arrows, frames), and why; the values are in `design.json` → `theme.colors` (and `theme.derived` when a colour was darkened for contrast) |
| 8 | الخطوط | table: titles, text, kicker/buttons, counter/footer with weight and px size at 1080 wide (from prompts.md) |
| 9 | النسخة النهائية الجاهزة للتصميم | من prompts.md |
| 10 | برومبتات توليد التصميم | من prompts.md: one block per slide (size, background, title place, exact Arabic text, marker, visual elements, font, feeling, balance, quality line) |
| 11 | Negative Prompt | already the last line («سلبي: …») of every block, word for word from the brief |
| 12 | نسخة مختصرة جاهزة للمصمم | idea, slide count, identity, titles, feeling, CTA type, in six bullets |
| 13 | معاينة وصفية نهائية | how the carousel looks in the feed and while swiping: cover strength, harmony, how the eye moves, why it stops the scroll, why people swipe to the end |

Close with where the files are and what the gate reported (errors, warnings, browser overflow).
