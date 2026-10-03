# Studio spec format (`spec.json` → `studio compose`)

A spec describes pages by **composition** and **content**. The studio lays them out
(independent text, image and shape elements with stable ids), reflows content that
does not fit, runs the quality gate and saves the design to the library.

```json
{
  "brief": "ست عادات تجعلك تقرأ أكثر",
  "brandId": "kitabwbs",
  "intent": { "mode": "post", "format": "portrait", "platform": "instagram", "pages": 1, "destination": "local" },
  "concepts": ["reading", "habits"],
  "metaphor": "ليلة قراءة هادئة تحت الهلال",
  "pages": [
    {
      "composition": "post",
      "variant": "art",
      "keepArt": true,
      "content": {
        "hook": "ست عادات *تجعلك* تقرأ أكثر",
        "points": ["…", "…"],
        "cta": "احفظ المنشور",
        "art": "a_3ab91802562b29c8",
        "artAlt": "كتاب مفتوح تحت هلال"
      }
    }
  ]
}
```

- `intent.pages` is the page count the user asked for; the gate fails if it differs.
- `intent.format`: `portrait` 1080×1350 (default), `square` 1080×1080, `story` 1080×1920.
- Theme: `brandId` (a saved identity), or `paletteId` (`midnight`, `sand`, `emerald`, `ink`, `violet`, `coral`, `agency-navy`, `agency-light`), or `theme` in full. Fonts: `"fonts": { "heading": "cairo", "body": "tajawal" }` (`cairo`, `tajawal`, `almarai`, `readex`).
- Style (optional): `"style": { "id": "collage-cutout", "mode": "alternate" }`. `studio styles` lists the ready ones (status `reusable`), the compositions each suits, and the ones it declines with the reason; do not put a declined composition in a styled spec. `mode` is `light`, `dark` or `alternate` (from the cover, dark first); left out, the style's own default applies (some styles make the cover and closing dark). The identity still gives the accent and fonts; derived shades (a darker blue under white labels, a lighter one on navy) are recorded in `theme.derived`. Without `style`, a design renders as before.
- Accent role (styles built on a functional colour): `mint-highlight` takes the identity's green
  (`positive`); `"style": { "id": "mint-highlight", "accentRole": "accent" }` uses its main colour
  instead. That style also sets its own chrome: «1/10» as text, the account name only, and «اسحب
  واكتشف» as text (override with `"chrome": { "swipe": { "text": "…" } }`).
- `keepArt: true` keeps the art when space is tight (reflow then reduces it to its minimum size instead of removing it). Use it when the user asked for strong graphics.
- `*word*` marks one key word or phrase (one per title): in the accent colour, or on a marker band
  in the text colour in styles that use one (`mint-highlight`). Inside a tinted panel it stays in
  the accent colour.
- Body lines (`body`, `subtitle`): break them yourself with `\n`, 2–4 short lines. The gate warns
  `text.lone-word` when a line wraps onto one word.
- Asset fields (`art`, `itemArt`, `photo`, collage `art` list) take **asset ids** from `studio asset add` / `studio asset list`. Ids not in the store fail the build.

## Compositions

Run `node scripts/studio.mjs compositions` for the live list. In short:

| id | use | variants | content fields |
|---|---|---|---|
| `hero` | cover / hook | `type`, `art` | `kicker`, `title`*, `subtitle`, `art` |
| `list` | steps, tips | `cards`, `grid` (2 columns), `illustrated` (one drawing per item) | `title`*, `items`*, `start`, `itemArt[]` |
| `post` | single post: hook → points → CTA | `stack`, `grid`, `illustrated`, `art` | `hook`*, `points`, `cta`, `art`, `itemArt[]` |
| `comparison` | before/after, A vs B | `columns`, `rows` | `title`*, `beforeLabel`, `before`, `afterLabel`, `after` |
| `quote` | quotation | `bar` | `quote`*, `author`, `role`, `photo` |
| `statement` | one big sentence (typographic) | `block` | `kicker`, `title`*, `subtitle` |
| `collage` | editorial collage of cut-outs | `top`, `bottom` | `kicker`, `title`*, `subtitle`, `art[]` (2–4) |
| `numbered` | one step or figure per page («3 دقائق»، «الخطوة 2») | `type`, `center`, `art` | `number`*, `title`*, `subtitle`, `art` |
| `stat` | evidence: a figure, its meaning, its source | `type`, `center` | `kicker`, `figure`*, `title`*, `source` (never invented: leave it out if there is none) |
| `framework` | named parts, each with a short explanation | `grid`, `chain` (joined, one after the other) | `title`*, `parts`* (≤ 6, short names), `details` (one line per part, same order) |
| `outro` | follow / save CTA with identity | `center` | `title`*, `subtitle`, `save`, `share`, `follow`, `socials` |
| `opener` | cover led by a count («7») | `type`, `center` | `kicker`, `figure`, `title`*, `subtitle` |
| `concept` | one idea per page, six layouts | `plain`, `box` (lines in a hairline frame), `callout` (takeaway on a tinted bar), `panel` (title in a tinted panel), `rule` (hairline under the title), `figure` (big number on a band) | `kicker`, `title`*, `figure`, `body` (lines with `\n`), `takeaway` |
| `flow` | from → to, cause → effect: framed stages joined by a down arrow | `fill` (last stage tinted), `mark` (marker behind every head) | `kicker`, `title`*, `steps`* (2–3), `details` (one line per stage) |
| `actions` | closing with full-width save / share rows | `center` | `kicker`, `title`*, `subtitle`, `save`, `share` |

`opener`, `concept`, `flow` and `actions` are claimed by `mint-highlight` only for now: other styles
were reviewed before they existed (`studio styles` says so).

`*` required. Capacity (what reads well): list/post up to 6 items of ≤ 60–70 characters;
comparison up to 4 per side; titles ≤ 60 characters. Beyond that the reflow engine
switches to a denser variant, and if nothing fits it reports exact cuts.

## What the reflow engine does

In order: preferred sizes → gentle scale-down (≥ 82%) → smaller art → scale down to the
readability floors (titles ≥ 56 px, body ≥ 32 px on a 1080-wide page, about 11.5 pt on a
phone) → denser variant → drop optional art (unless `keepArt`). Each step is logged in
Arabic in `pages[].decisions`. If nothing fits, the page is marked `fits: false` with
suggestions like `{ "slot": "points.2", "removeChars": 24 }`: shorten exactly those texts,
or split the list over two pages in a carousel. Never ask for smaller text.

## Edits on an existing design

- `studio edit design.json "<أمر>"`: local commands apply at once (sizes, colours from the
  identity, moves, locks, typed text, columns, format). The output says `needs` when the
  assistant must act: `asset` (one drawing, `target.elementId`), `rewrite` (`targets` with
  `maxChars`), `recompose`, `generate`, `clarify` (`options` to choose from).
- `studio patch design.json patches.json` applies DesignPatch lists:
  `[{ "pageId": "pg_…", "elementId": "item-4-art", "action": "replace_asset", "payload": { "assetId": "a_…" } }]`.
  Actions: `replace_text`, `move`, `resize`, `update_style`, `replace_asset`, `delete`, `lock`, `layer`, `hide`.
  `--scope graphic` rejects any text change; `--scope text` rejects any artwork change.
- Element ids are stable: `title`, `hook`, `subtitle`, `kicker`, `item-3`, `item-3-art`, `point-2`,
  `cta`, `quote`, `author-name`, `collage-2`, `art`, and `sys-*` for counter, swipe and brand.
