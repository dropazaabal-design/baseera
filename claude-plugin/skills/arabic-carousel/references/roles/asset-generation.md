# Role: generating graphic assets

**When:** `studio plan` marks an art slot `source: ai`, an edit returns `needs: asset`, or the user
asks for new or stronger graphics.

**Inputs:** the slot (`art`, `itemArt.3`, `collage` cut-out), its meaning (`spec.concepts` or the
item text), the brand's imagery style (`plan.art[].spec.style`), the composition's frame.

**Outputs:** an asset in the store: `studio asset add <file> --kind generated --tags … --prompt "…"`
→ an id like `a_3ab91802562b29c8`. The command records one `ai.asset` call in the ledger.

## Way 1: SVG you write (default; offline, recolourable, sharp at any size)

- `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">`.
  Wide heroes: `viewBox="0 0 480 300"`.
- **No words, letters or digits in the artwork.** Text stays text in the design (editable,
  correctly shaped). The store rejects `<text>`.
- Flat shapes, 3–5 colours. Mark recolourable parts so the theme drives them:
  `fill="#7DB6FF" data-token="accent"`, `data-token="text"`, `data-token="muted"`,
  `data-token="bg"`, `data-token="onAccent"`; strokes: `data-token-stroke="…"`. Then a
  palette or brand change never needs a new drawing.
- Transparent background. No scripts, event handlers, external links or `<foreignObject>`
  (rejected).
- One clear subject that carries the meaning (a book under a crescent for night reading; a phone
  with a moon for focus mode), readable at 120 px. Avoid realistic faces.
- Look at the result before adding it (render it in the preview or the editor).

## Way 2: a raster image tool (photographic or painterly looks)

If the environment has an image tool (for example Canva's `generate-image`), prompt for the
subject **without any text in the image**, transparent or plain background, the brand's style
words. Download the result to a file, then `studio asset add` it with `--kind generated --source
"<tool>" --model "<model if shown>"`. Raster art is not recolourable.

## Replacing one element only

For «غيّر الرسم الرابع», generate one asset for `target.elementId`, then:

```json
[{ "pageId": "pg_…", "elementId": "item-4-art", "action": "replace_asset", "payload": { "assetId": "a_new" } }]
```

`studio patch design.json patches.json --scope graphic`. The output's `changed` must list only
that element. Text and the other drawings stay byte-identical.

## Verify

- `studio asset verify <id>` → `ok: true`.
- Recolour test: the art still reads on the brand's dark and light backgrounds.
- The tags describe the meaning (Arabic and English concept words), so the library can find it
  for the next request instead of generating again.

## Limits

- Generate only the slots that need it; one alternative unless the user asks for options.
- Do not regenerate artwork for a colour, size or text change.
- Generated assets keep provenance (`kind: generated`, prompt hash, source).
