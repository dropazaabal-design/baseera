---
name: canva-arabic
description: Builds an Arabic (RTL) design on Canva as separate, editable text, shape and image elements at the exact pixel size, using the Canva connector's real tools, then reads it back and checks every word letter by letter. Use when the user says «على Canva», «في كانفا», «صمّمه في Canva», or wants an Arabic post or carousel they can keep editing in Canva.
---

# Arabic design on Canva (editable elements)

Design first with the `arabic-carousel` skill (spec → `studio compose` → quality gate passed).
This skill moves that design into Canva. `studio` = `node <plugin>/skills/arabic-carousel/scripts/studio.mjs`.

## What the Canva connector can and cannot do (checked against its tool schemas)

| need | tool / operation | status |
|---|---|---|
| a design | `create-design` (generates one from a brief; there is no blank design) | yes, then cleared |
| exact size | `resize-design` custom width × height | yes |
| independent Arabic text | `edit-design` `add_text` + `format_text` (size, colour, bold/normal, line height, alignment) | yes |
| choose the font family | not offered by `format_text` | **no** → Canva's default font |
| colour one word inside a text | not offered | **no** → one colour per text |
| shapes | `insert_shape` (SVG path, M/L/H/V/C/S/A/Z) | yes |
| our images | `create-upload-url` + POST raw bytes, then `insert_fill` at x/y/size | yes |
| layers | creation order, `layer_element` | yes |
| preview and read-back | `read-design` (thumbnails, element text and sizes) | yes |
| save | `edit-design` `commit`, **only after the user approves the preview** | yes |
| export | `export-design` png / pdf | yes |

Check what your session has: `studio canva caps --tools <comma-separated tool names you see>`.

## Editability levels (say which one you delivered)

- **native**: every element is a separate Canva element; all text is live text.
- **partial**: text is live; graphics are one uploaded image per page (`--mode partial`), used when
  shapes cannot be created.
- **flattened**: each page is one image; nothing is editable as text (`--mode image`). Only when
  text cannot be added. Never describe this as editable.

Do not use «تحويل صورة إلى طبقات» (layer separation of a flat image) as the default for Arabic:
it re-types the words and can change them (عيوبك became عبويك in a previous attempt). If it is
used at the user's request, run the read-back check below on the result.

## Steps

1. `studio canva plan design.json --outdir canva/` → `canva/plan.json`, plus upload files
   (illustrations recoloured for the design's theme, page art for partial mode).
   The output lists the editability and the limitations; tell the user before starting.
2. Run the steps in order. Fill each `$name` from earlier results:
   - `create-design` → poll `get-create-design-async-job` (wait the seconds it says) → `$designId`.
   - `resize-design` custom 1080×1350 (or the format's size) → new `$designId`.
     (In testing, a generated «Instagram Post» came out 1080×1440: always resize.)
   - `read-design` with `open_transaction: true` → `$transactionId`, `$page:1`, and the locators of
     generated elements. `clear-page`: `delete_element` each of them.
   - Uploads: `create-upload-url`, then `curl -X POST -H "Content-Type: application/octet-stream"
     --data-binary @file "<uploadUrl>"` → `{"mediaId": "M…"}` → `$media:<assetId>`.
   - `edit-design` batches in order (back to front). Each `add_text` returns a new element:
     record its locator, then apply its `_then` `format_text` in the next call. Remove keys that
     start with `_` before sending.
3. Verify: `read-design` with the transaction → write `readback.json`:
   `{ "designId", "designUrl", "committed": false, "pageCount", "pages": [{ "index": 0, "width",
   "height", "texts": [{ "text": "<characters>" }] }] }` → `studio canva verify design.json
   readback.json --plan canva/plan.json`. Any `readback.changed.*` (letters, numbers) or size
   issue: fix with `replace_text` / `resize` before showing the user.
4. Show the thumbnail and the limitations. Commit (`finalize: "commit"`) only after the user
   approves. Then share the design link.

## Edits after delivery

`studio canva`-side: map our element to its Canva locator (keep the mapping from step 2) and use
`replace_text`, `position_element`, `resize_element`, `format_text`, `update_fill` (new image)
in a new transaction. Re-run the read-back check for any text change.

## Limits to state plainly

- Font: Canva's default Arabic font; the user can switch to Cairo/Tajawal in Canva in one click
  (select all text → font).
- Accent colour on one word: lost; whole text in one colour.
- The generated starting design is replaced, but its page background image remains under our
  full-page background shape.
