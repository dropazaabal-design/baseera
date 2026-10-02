---
name: arabic-proofing
description: Arabic typesetting and proofreading for designs. Writes and checks Arabic copy for posts and slides (punctuation, hamzas, ة/ه, ى/ي, numerals, mixed Arabic/English/handles), and verifies that text placed in a design, re-typed by a tool, or read by OCR still matches the approved text letter by letter. Use when writing or reviewing Arabic text for a design, «دقّق النص», «راجع الأخطاء», or after any export, Canva transfer or layer conversion.
---

# Arabic typesetting and proofreading

`studio` = `node <plugin>/skills/arabic-carousel/scripts/studio.mjs`.

## Writing the copy

- **Short.** Titles ≤ 6–8 words; list items ≤ 12 words; 3–6 items per page. Density follows the
  creator's preference (`plan.memory`), the current request first.
- **One key word** per title wrapped in `*نجمتين*` for the accent colour.
- **Punctuation:** ، ؛ ؟ and «» after Arabic words; ASCII punctuation only inside English.
- **Mixed text:** type Latin names, numbers, `@handles`, `#tags`, URLs, emails and phones as they
  are. The renderer isolates them; never insert RLM/LRM or other bidi characters.
- **Numbers:** one system across the copy: Arabic-Indic (١٢٣) or Western (123). The quality gate
  warns on mixing. Handles and URLs keep Western digits.
- **No tatweel (ـ)**, no stretching. Prefer short words in titles (Arabic is not hyphenated).
- **Spelling:** check hamzas (أ إ ء ئ ؤ), ة vs ه, ى vs ي, and one register (simple MSA unless
  the creator's tone says otherwise).

## Keeping the approved text intact

The approved text is the page `content` in the design. Everything placed elsewhere is compared
with it word by word:

- `studio check design.json --source source.json` compares the content with an approved copy
  you were given (`[{ "title": "…", "items": ["…"] }]`, one object per page).
- `studio check design.json --readback readback.json` (or `studio canva verify`) compares what a
  destination returned.
- After a Canva build or edit: `canva_validate_arabic` (`canva-arabic` skill) compares Canva's
  read-back with the design, element by element.

Each difference is classified: `reordered-letters` (عيوبك → عبويك), `reversed-word` (a word
stored backwards: a direction bug), `changed-letters`, `changed-hamza` (أ/إ/ا/ء), `changed-taa-marbuta`
(ة/ه), `changed-alef-maqsura` (ى/ي), `changed-marks` (diacritics), `changed-punctuation` (، ؛ ؟
→ , ; ?), `changed-number` (٢ → ٧), `changed-digit-system` (٢٠٢٦ → 2026), `changed-word`,
`missing-word`, `extra-word`. Presentation-form glyphs (ﻛﺘﺎﺏ instead of كتاب) and stray
direction marks are errors too: the text looks right but no longer searches, copies or edits.

## OCR

OCR (reading text from an image) can be wrong, especially for Arabic. Treat its output as a
question, not an answer: mark differences as warnings (`source: "ocr"` in the read-back), look at
the image yourself, and correct only what you confirm. Never "fix" the approved text to match OCR.

## Verify before delivery

- No `readback.changed.*` or `source.changed.*` errors.
- No `punct.ascii`, `bidi.controls`, `text.tatweel` warnings left without a reason.
- Read every title aloud once: it must be grammatical and natural, not a literal translation.

## Limits

- Grammar and style judgement are yours; the studio checks characters, not meaning.
