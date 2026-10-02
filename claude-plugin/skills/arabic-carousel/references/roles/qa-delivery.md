# Role: checking, exporting and delivering

**When:** after every compose or edit, and before saying «جاهز».

`studio check design.json [--pages N] [--format portrait] [--source source.json] [--readback readback.json]`

## What blocks delivery (errors)

| code | means | fix |
|---|---|---|
| `size.mismatch`, `readback.size`, `export.size` | page or file not the asked pixel size | fix the format / re-export |
| `pages.count`, `readback.page-count` | e.g. 7 pages when 2 were asked | fix the spec |
| `content.missing`, `content.mismatch` | approved text not on the page or altered | fix the spec |
| `source.changed.*`, `readback.changed.*` | a word changed letters (`reordered-letters` عيوبك→عبويك), a number changed (`changed-number` ٢→٧) | restore the approved text; for Canva, `replace_text` |
| `layout.overflow`, `text.overflow` | content does not fit at readable size | shorten as listed, or split |
| `text.too-small` | below phone readability | never accept; reflow or shorten |
| `text.clipped-word`, `layout.overlap`, `text.out-of-bounds` | cramped or colliding text | reflow / move |
| `contrast.low` | text vs what is behind it | use theme tokens; change colour |
| `art.missing`, `asset.missing`, `asset.corrupt` | placeholder or broken file | generate / replace |
| `brand.warm-colors` | identity forbids warm colours | change palette |

Warnings: `text.narrow`, `numbers.mixed`, `punct.ascii`, `bidi.controls`, `text.tatweel`,
`text.unsafe-zone` (story UI covers it). Fix them unless the user wants otherwise.

## Phone check

Every text size is checked as it appears on a ~390 pt wide phone (body ≥ ~10.5 pt, titles
≥ 18 pt). In the editor, «معاينة الهاتف» shows the real thing; look at it for crowding.

## Export

In the HTML editor: PNG (current page), ZIP (all pages, `01-hook.png` …), PDF (LinkedIn
document), reel (9:16 video). Exports are rendered at exactly the page size; the export engine
embeds the fonts, so Arabic letters stay joined.

## Delivery message (in the user's language)

1. What was made: format, pages, the visual idea in one sentence.
2. What was reused vs generated (`studio ledger report`), and anything not available (tokens).
3. The file or link, and how to edit/export.
4. Limits that apply (e.g. Canva font, a flattened page).
5. One question for feedback.

Never report «جاهز» with errors open. If something cannot be fixed here, say what and why.
