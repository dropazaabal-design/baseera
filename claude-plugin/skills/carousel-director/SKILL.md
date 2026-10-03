---
name: carousel-director
description: Content strategist + Arabic copywriter + art director + carousel designer for Instagram carousels built from a topic alone. Infers audience, goal, angle, tone, dialect, slide count, sequence, identity, colours and CTA without asking; writes three cover titles and picks one; writes every slide; designs the carousel in the studio (one idea per slide, varied layouts, mint marker on the key words); and delivers the 13-part file (analysis, idea, titles, copy, storyboard, per-slide design, colours, fonts, ready copy, one generation prompt per slide with the negative prompt, designer brief, final preview). Use for «كاروسيل احترافي كامل», «فكرة الموضوع: …», «ابنِ كل شيء تلقائيًا», «Storyboard», «برومبت لكل شريحة», «ملف للمصمم», «حلّل وصمّم», or when the user pastes the long strategist/copywriter/art-director prompt.
---

# Carousel director (from a topic to a finished carousel)

You decide everything the user did not say, write it, and build it with the studio of the
`arabic-carousel` skill. Never ask for inputs beyond the topic. Never draw slides yourself: the
studio lays out, checks Arabic and exports. `studio` means
`node <arabic-carousel skill dir>/scripts/studio.mjs` (setup: `arabic-carousel` §0).

A finished spec built this way from the topic «أشهر 7 قوانين في العالم»:
`references/example-laws.json` (10 slides; compose it to see every layout below). The full 13-part
file and the renders are in the repository under `docs/examples/laws-carousel/`.

## 1. Decide, do not ask

Fill this table yourself from the topic and the identity (`studio brand show <id>`; the identity's
rules and voice win over your defaults):

| Decision | How |
|---|---|
| Audience | who searches this topic; age band; what they already know |
| Goal by topic type | educational → save + share; sales → order/contact; awareness → share/comment; brand/service → trust + contact; psychological/intellectual → deep but simple, save |
| Angle | the one idea that makes the topic personal ("they happen in your day") |
| Tone and dialect | the identity's voice; otherwise simplified Modern Standard Arabic |
| Slide count | cover + intro + one slide per item + summary/CTA; 7–10 for lists; never pad |
| Sequence | hook → intro (why it matters) → interest (build curiosity) → value (the items) → summary → CTA. Product/service: hook → pain → common mistake → real-life explanation → solution → why this one → offer → CTA |
| Identity | educational/minimal → style `mint-highlight`; other moods → `studio styles` |
| Colours | the identity's; `mint-highlight` takes the identity's green (`positive` role) or `"accentRole": "accent"` for its main colour |
| CTA | from the goal row |

## 2. Write

1. **Three cover titles**, then pick one and say why (short, a number or a question, a curiosity
   gap, no promise you cannot prove).
2. **Every slide carries one idea.** Title ≤ 7 words. Body 2–4 short lines, each ≤ ~32 characters,
   broken by hand with `\n` (a centred line that wraps onto one word looks broken; the gate warns
   `text.lone-word`). Mark one key phrase per title with `*…*`: it gets the mint marker.
3. **Kickers number the items** («1 · قانون مورفي»): the reader feels progress.
4. **Facts as their authors stated them.** Approximate figures say so («النسبة تقريبية»). No
   invented statistics; a `stat` page needs a real source.
5. Arabic rules: `arabic-proofing` (Arabic punctuation، ؟ ؛, no tatweel, Western digits when the
   identity uses them, no English words unless allowed).

## 3. Slide type → composition

| Slide type (brief vocabulary) | Composition / variant |
|---|---|
| Hook with a count («7 …») | `opener` (figure, title, subtitle) |
| Hook without a count | `hero` |
| Intro / big text / question | `concept` / `plain` (or `statement` for one sentence) |
| Central box (an idea set apart) | `concept` / `box` |
| Explanation + takeaway bar | `concept` / `callout` (`takeaway`) |
| Big number («80/20») | `concept` / `figure` (`figure`) |
| Visual path / from → to / cause → effect | `flow` / `fill` (outcome tinted) or `mark` (heads marked); 2–3 `steps` with `details` |
| Bold summary | `concept` / `panel` |
| Title + divider + text | `concept` / `rule` |
| Short list | `list` |
| Simple comparison | `comparison` |
| Quote | `quote` |
| CTA (save + share rows) | `actions` (`save`, `share`, optional `kicker` = account name) |

Rules: no two neighbouring slides with the same composition and variant; at most two `flow`
pages and one `panel`; `figure` only when the item has a real number. Fields and capacities:
`studio compositions`; spec format: `arabic-carousel` → `references/studio-format.md`.

## 4. Build and check

```sh
studio compose spec.json --request "<topic>" --out design.json --html design.html
studio check design.json            # errors block delivery; fix lone-word warnings by breaking lines
studio prompts design.json --out prompts.md
```

`compose` reports `fits` per page and the quality gate. On `layout.overflow` shorten exactly what it
lists; never ask for smaller text. Look at the result (open `design.html`, or render PNGs) before
you deliver; say what you saw.

## 5. Deliver the 13 parts

Write `brief.md` with the headings in `references/brief-template.md`. Sections 5 (storyboard),
9 (ready copy), 10 (one prompt per slide) and 11 (negative prompt) come from `prompts.md`: copy them,
then improve only the «الهدف» and «ملاحظة للمصمم» cells with what you planned. They are read from the
design, so the texts, positions, sizes and colours in them are the real ones.

Hand over: `design.html` (open, edit by chat, export PNG/ZIP/PDF), `brief.md`, and on request the
Canva route (`canva-arabic`, only after the user approves the preview) or a PPTX.

## Honesty

- The design the studio built is the deliverable. The per-slide prompts are for an external image
  tool if the user wants one; no image model was called unless the ledger says so.
- Say which style and accent were used and why; say what the gate warned and what you changed.
- One rejected style is rejected for that topic only (`creator-memory`).
