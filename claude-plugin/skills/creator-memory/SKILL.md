---
name: creator-memory
description: The content creator's taste and identity memory («ذوقي وهويتي»). Stores and applies accounts, identities (colours with roles, fonts, voice, imagery), audience, tone, content pillars and preferences with a clear scope, keeps facts apart from inferences, and turns repeated choices into suggestions only. Use when the user says «تذكّر», «دائمًا», «لا تستخدم … مرة أخرى», «هويتي», «ذوقي», gives feedback on a design, or asks what the studio knows about them.
---

# Creator memory

`studio` = `node <plugin>/skills/arabic-carousel/scripts/studio.mjs`. Memory persists in the
studio store (`~/.baseera`), per creator (`--creator ID`, default `default`).

## What is stored

- **Facts** the creator stated: accounts and platforms, audience, language/dialect, tone,
  content pillars, goals. `studio memory fact <key> <value>` (`audience`, `tone`, `pillars`
  as a JSON list, `goals`, `accounts` as a JSON list of `{platform, handle, brandId}`).
- **Identities** (brand kits): colours with roles and names, heading/body fonts, voice, imagery
  style, density, constraints, approved examples. `studio brand add brand.json`; optional preset
  `studio brand preset kitabwbs` (only when the user asks for it).
- **Preferences** with source, date, scope, confidence and origin:
  `studio memory remember <key> <value> [--brand ID] [--platform P] [--format F] [--project ID]
  --evidence "<the user's words>"`. Keys: `studio memory show` → `PREFERENCE_KEYS` in
  `references/schema.json` (`palette`, `font.heading`, `text.density`, `text.size`, `avoid`, …).

## Identity rules are checked, not just stored

An identity's `constraints` are checked on every design (`studio check`, `studio compose`) and
after every Canva transfer (`canva_validate_arabic --brand-id …`). The «كتاب وبس» preset:
blue as the main colour, no yellow or orange, no faces or human images, Cairo or Tajawal only,
Western digits, no Latin words except `@kitabwbs`, strong titles and clear body text.
What the studio controls (colours, fonts, digits) fails as an error; words the user wrote or
approved come back as warnings to raise, not to rewrite silently. A palette or theme the user
asks for in the current request relaxes the colour rules for that design only («مسموح بطلبك
الحالي»); it is not stored as a new preference.

## Scope: never generalise one remark

- «لهذا البوست» → no memory; fix the design only.
- «لحساب كتاب وبس» → `--brand kitabwbs`. «في لينكدإن» → `--platform linkedin`.
- «دائمًا» / «في كل تصاميمي» → no scope.
Ask in one short question when the scope is unclear.

## Precedence (applied by `studio plan`)

current request → explicit preferences (narrowest scope first) → confirmed patterns.
Unconfirmed patterns are never applied.

## Behaviour is a weak signal

- `studio memory observe <key> <value> --design ID --brand …` after a choice the user made
  (picked a palette, enlarged text). One choice proves nothing.
- The same choice on 3+ occasions across 2+ designs becomes a suggestion:
  `studio memory suggestions`. Offer it in one line («ألاحظ أنك تختار … دائمًا. أعتمده لحساب …؟»).
  Only on a yes: `studio memory confirm <id>`.
- Silence is not agreement. Nothing here trains a model: it is stored context, applied when
  relevant. Say so if asked.

## Feedback on a design

`studio feedback <designId> "<the user's words>" [--elements id,id] [--approve]`:
- «أحب الجرافيك لكن الخط صغير» → likes the graphics (kept), dislikes text size: fix this design
  with `studio edit … "كبّر النص"`; a weak `text.size: larger` signal is recorded.
- «هذا الأسلوب لا يناسب هذا الموضوع» → rejected for this topic only; the style stays available.
- Approval only from explicit words («اعتمده», «ممتاز انشره») or `--approve` on their request.

## Results data (optional)

`studio memory import-results results.csv` (columns: `designId`, `platform`, metrics such as
`reach`, `saves`). Stored as given; with fewer than 5 rows it says nothing about trends. Never
invent numbers or credit success to one colour or layout from one example.

## Review and delete

`studio memory show`, `studio memory forget <id>`, `studio brand list`. In the HTML editor the same
data is under «ذوقي وهويتي» (export/import with `studio backup` / `studio restore`).
