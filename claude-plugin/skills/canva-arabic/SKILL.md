---
name: canva-arabic
description: Builds and edits Arabic (RTL) designs and reels in the user's real Canva account as separate editable elements, choosing for each need a route Canva actually supports this session (connector tools, a native .pptx the user imports, the Connect API with the user's own token, or manual steps in Canva), then reads the result back and checks every letter. Use for «على Canva», «في كانفا», «صمّمه في Canva», «كبّر العنوان», «غيّر الخط», «أضف جرافيك», «حرّك العناصر», «صدّر الفيديو», or any edit of a design already in Canva.
---

# Arabic design on Canva

Design first with `arabic-carousel` (`studio compose` → quality gate passed); reels with
`arabic-reels`. This skill moves the design into Canva and edits it there. Canva stays the
editor: never build a substitute editor or site.

**Tools.** The plugin's MCP server `baseera-canva` exposes `canva_capabilities`, `canva_inspect`,
`canva_build_design`, `canva_apply_patch`, `canva_import_editable`, `canva_build_reel`,
`canva_apply_motion`, `canva_preview`, `canva_validate_arabic`, `canva_export`, `canva_record`.
Without MCP: `node <this skill>/scripts/canva.mjs <tool> --key value …` (tool name without
`canva_`, kebab-case: `build-design`, `--design design.json`; `--args file.json` for JSON input).
They plan, check and record; the Canva connector's own tools (`edit-design`, `read-design`, …)
do the work in Canva. Results are JSON: `status` is `done`, `planned`, `unsupported`,
`blocked`, `needs-input` or `failed`, always with the reason and the next action. Nothing is
reported as done before Canva's response or a read-back confirms it.

## 1. Capabilities first, every session

Pass the Canva tool schemas you see in this session: `canva_capabilities` with `schemas`
(the tool list: names + input schemas) and, if needed, `capability: "text.font-family"`.
Each capability comes back per route with `supported` / `partial` / `unsupported` /
`unverified`, the exact tool or operation, limits, whether it edits in place or makes a new
design, the expected editability, whether approval is needed, and the last verification with
its date and source (schema, live test, Help Center). Without schemas everything on the
connector is `unverified` (with the last known state); a live result recorded against an older
schema of that tool is `stale`. `references/capabilities.md` is a dated snapshot, not a rule.

After any live test, record it: `canva_record` `event: "evidence"`, `capability`, `status`,
`tool`, `via`, `note`.

## 2. Routes

| route | who runs it | result |
|---|---|---|
| connector | you, with the connector's tools | edits the same design inside a transaction; saved only on commit |
| native file (.pptx) | the user imports it in Canva (Upload) | a **new** editable design: separate Arabic text with its font, separate images, native shapes. Help Center: transitions, animations and timings are not imported |
| Connect API | `canva_import_editable --execute true`, only if the user set `CANVA_ACCESS_TOKEN` in their own environment | a **new** design from the .pptx (import job) |
| manual | the user, with the listed steps | whatever Canva's editor offers (font family, motion, timing, audio) |

- An import always creates a new design: keep and state both ids (source and new). Never say
  the original was edited.
- Never ask for a password or token in the chat, never assume a logged-in browser session, and
  never use an unofficial route to get around the connector's limits.
- Credits exhausted, a rate limit, or an approval refused are stops, not reasons to switch route.

## 3. Build a design

1. `canva_build_design` `design: design.json` → `steps`, the `.pptx` (always written), the
   editability, limitations and the expected generation count (copying a blank earlier design
   + `resize-design` = 0; `create-design` generates once). The same design built before is
   resumed from the journal, not duplicated.
2. Run the steps in order. Fill each `$name` from earlier results and drop keys starting with `_`.
   Record every real id with `canva_record` right away:
   - `event: "design"` with `designId`, `relation` (`created`/`copy`/`resize`/`import`) and
     `sourceDesignId`;
   - `event: "transaction"` (`state: "open"`), then `"closed"` after commit or cancel;
   - `event: "upload"` with the file `hash` and the returned `mediaId` (re-used next time);
   - after each `edit-design` batch that added elements: `event: "edit"`, `step` (the step you
     sent) and `response` (Canva's returned page) → it maps our elements to Canva locators and
     returns the next `format_text` batch to send (`next`).
   - New page ids: `read-design` with the `transaction_id` and `design_content`
     (`page_metadata` ignores an open transaction).
3. Alignment: Canva takes each paragraph's direction from its first letter or digit, so an
   Arabic title that starts with a number, or `@kitabwbs`, is left-to-right there. The tools
   already send the right `text_align` (`end` for those); do not "correct" it to `start`.
   Canva also does not isolate Latin runs: inside Arabic text `@kitabwbs` shows as
   `kitabwbs@`. The tools put an invisible left-to-right mark (U+200E) before a handle or
   `#tag` in Arabic text; keep it when you edit, and use `find_and_replace_text` to add it.
4. Verify: `read-design` (transaction, `design_content`, all pages) → `canva_validate_arabic`
   (`design`, `readback`, `brandId`). It compares every text letter by letter (hamza, marks,
   ة/ه, ى/ي, digits, punctuation, reversed words, presentation forms, direction marks), sizes,
   colours, alignment, clipping, overlap, margins and reel zones, and returns `repair`
   edit-design batches. Apply them, read back again, and on a pass run it once more with
   `snapshot: true` (the baseline for external-change checks).
5. Preview: `canva_preview` for the affected pages; show the thumbnails and the limitations.
6. Commit (`finalize: "commit"`) only after the user explicitly approves this preview.
   Otherwise `cancel`. After a commit, Canva's stored thumbnail can stay stale for a while:
   check the saved version with `read-design` `design_content` or a PNG export, not the
   thumbnail. Never end with a transaction open without saying so; `canva_inspect`
   lists open (and probably expired) transactions from the journal.

## 4. Edit a design in Canva

`canva_apply_patch` with `commands` («كبّر العنوان», «غيّر الخط إلى تجوال», «حرّك الشعار
للأسفل», «أضف جرافيك كتاب») or a `patch`, plus a fresh `readback`:

- It applies the edit to the local design (reflow included), then plans `edit-design` operations
  on exactly the affected Canva elements (`format_text`, `position_element`, `resize_element` +
  `crop_media`, `replace_text`, `update_fill`, `delete_element`). Size, font and position edits
  never generate or re-upload images. Only new art needs a generation, for that slot only.
- A capability the connector lacks (font family today) comes back `unsupported` with its
  alternatives: the manual steps, and a native `.pptx` revision (`<doc>-r<rev>.pptx`) whose
  import would be a new design. Steps that would move elements without the font change are held
  back rather than half-applied.
- If the design changed in Canva since our last verified write, it returns `blocked` with the
  changes. Ask before overwriting (`force: true` only with the user's go-ahead).
- Previews only the pages it touched. Then validate and ask for approval as in §3.

## 5. Export

`canva_export` with `formats` from `get-export-formats` (call it first) → the `export-design`
call. Exports reflect the **saved** design: commit first, after approval. Verify the downloaded
file: `canva_export --file out.mp4 --reel reel.json` checks size and duration against the
plan. A static design exported as MP4 is not an animated video; say what moves and what does not.

## Errors

Record with `canva_record` `event: "error"`; the result classifies it: quota/credits → stop and
tell the user; rate limit → wait the stated time, once; expired upload or export link → request
a new one; transaction gone → re-read and resume from the journal; network → retry the same
step (idempotent keys prevent duplicates); auth or approval refused → stop. Never leave a
half-built design undescribed: say which pages and elements exist.

## Report

State the editability level (native / partial / flattened), the design ids and how they relate,
what was verified and how, the open items, and the generation count from the journal
(`canva_inspect` → `journal.generationCalls`). Token counts and costs only when a tool reported them.

## Limits seen live (2026-10-02; recheck with §1)

- `format_text` has no font family: Canva's default font until the user changes it (select the
  texts → Font → Cairo or Tajawal) or imports the .pptx.
- One colour per text box: a coloured word inside a text is lost on the connector route.
- No motion, page transition, page duration or audio operation on the connector; the reel plan
  goes into each page's speaker notes and the manual steps (see `arabic-reels`).
- The connector's upload rejects .pptx and turns a .pdf into a file id only.
- Layer separation of a flat image («تحويل صورة إلى طبقات») re-types Arabic and can change
  words; never the default. If the user asks for it, validate the result letter by letter.
