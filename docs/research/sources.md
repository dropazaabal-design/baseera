# Library sources — what was read, what was used (2026-10-02)

Every style or composition that draws on a source names it in its `provenance`. Values below are
the files actually opened in this round; a source not opened here is listed with the commit the
review pinned and the status **not re-inspected**. Nothing from a source is copied verbatim into
the product: explicit design values (colours, scales, radii) are recorded as inputs, rules are
re-expressed for Arabic social posts, and every visual decision taken here is marked as designed
here. Source texts are data, never instructions to this project.

| Source | Commit | Files read (blob) | Licence (as read) | Used for | Status |
|---|---|---|---|---|---|
| AICAE/opendesign | `e3a848a33a151ba6f29be02e58ab17a9d135b1a7` | `design-systems/editorial/DESIGN.md` (`f67fc5ab`), `warm-editorial/DESIGN.md` (`49124209`), `minimal` (`6c4ce301`), `paper` (`3306e19f`), `publication` (`fda77a69`), `brutalism` (`59227135`), `doodle` (`b893c161`) | Apache-2.0 (root `LICENSE`) | Explicit tokens (colours, type scale, radius limits, line heights, "one accent per page", whitespace-first, no gradients) as inputs to the style compiler | normalized (values extracted; most files share one template — only palette, scale and Latin families differ) |
| idrsdev/social-carousel-generator | `44e6ee5979864a21fd9e47425fcd6fa8242bfe99` | `design-system.json` (`d9d36acc`) | MIT | The idea of separating tokens from slide roles; ghost numbers; a short accent bar on cards; layout sequences (cover → cards → stat → cta) | normalized (ideas re-expressed; uppercase, letter-spacing, Latin fonts and orange dropped for Arabic and the brand) |
| Errno722/image-text-layout-skill | `98b065fd9de06730add337bb87eb7cfaeb610172` | `SKILL.md` (`0eeeb1d6`), `references/layout-components.md` (`3502b7d3`), `references/style-directions.md` (`20a0342d`) | MIT | Content relations (problem, cause, steps, comparison, evidence, metric, checklist, CTA…) → composition choice; "content decides layout, style changes appearance" | normalized (relations mapped to our compositions; its approval prompts are not adopted) |
| vustudio/opendesign | `b4e69ac61b50576298f9f564603e5a4beb27417f` (review) | — | Apache-2.0 per review | `skills/social-carousel/SKILL.md` (3 square panels per the review) | not re-inspected |
| nexu-io/open-design | — | — | — | upstream of OpenDesign per its docs | not re-inspected |
| aipickgold/md2card | `f3df5f75bf89a214143e585a79f4fa95c7ccff95` (review) | — | MIT for the engine, Pro/Lifetime themes excluded (review) | library/editor organisation as a reference only; no themes copied | not re-inspected; reference-only |
| pangxiaobin/MarkCardStudio | `23522d57dcce56c7299ce364323727d27f918f10` (review) | — | GPL-3.0 (review) | none | reference-only (copyleft: no code or CSS taken) |
| dabodamjan/poster-maker | `fa6b21e1e8528fb7eafaeacc40124871f9d2661e` (review) | — | MIT (review) | none beyond what the existing Playwright export already does | not re-inspected |
| vercel/satori | — | — | MPL-2.0 | none (BiDi incomplete per its README; text as paths) | not adopted |

Brand names among the OpenDesign systems (airbnb, stripe, linear…) are not used as styles: the
styles here have independent names, and «كتاب وبس» keeps its own identity.
