---
name: arabic-reels
description: Turns an idea or an existing Arabic carousel into a 9:16 reel (1080×1920) with a strong hook, short phone-readable scenes, big Arabic numbers and titles, timing from the amount of text and a fitting close, and builds it in Canva as editable scenes with an honest status for motion, timing, audio and video. Use for «ريل», «ريلز», «ابنِ ريلًا بخطّاف قوي», «حوّل الكاروسيل إلى ريل», «حرّك العناصر», «صدّر الفيديو».
---

# Arabic reels

A reel is planned scene by scene, then built in Canva with the `canva-arabic` skill (or delivered
locally with the studio editor's «فيديو ريلز» export). Tools: the `baseera-canva` MCP server, or
`node <plugin>/skills/canva-arabic/scripts/canva.mjs <tool>` (see `canva-arabic`).

## 1. Plan

`canva_build_reel` with `source: design.json` (a carousel made by `studio compose`) or
`idea: {"hook": "…", "points": [{"title": "…", "subtitle": "…"}], "cta": "…", "save": "احفظه", "follow": "تابعنا"}`, plus `brandId`
when there is one. It returns the reel design (1080×1920), the plan (`.reel.json`), a `.pptx`
and a connector plan. The plan follows these rules; keep them when you write or edit scenes:

- **Hook first**: at most 7 words, readable in the first second, on screen from frame 0.
- Short texts: titles up to 11 words, subtitles up to 14. Cut words, never shrink the type.
- Big Arabic numbers and titles: a numbered point gets the `numbered` composition (huge digit),
  alternating layouts so no three scenes in a row look the same.
- Timing from the text: about 0.8 s + words ÷ 3 per scene, 2–6 s; hook 1.8–2.6 s; close 2.5–3.5 s.
- A close that fits the content (save / follow), not a generic one.
- Per scene the plan stores: texts, assets, elements, duration, motion (effect, start,
  length, on a **whole element**) and the transition to the next scene.

Arabic is never animated letter by letter (it breaks the joining): motion is per element only
(`pop`, `rise`, `fade`), transitions `cut`, `fade` or `push`. No music is added automatically.

## 2. Build in Canva

Follow `canva-arabic` §3 with the reel's connector plan: the usual route is `resize-design` of
the carousel (a new design; both ids are kept) and one page per scene. The plan writes each
scene's timing and motion into the page's speaker notes so the plan travels with the design.
Validate with `canva_validate_arabic` (it also checks the reel's top and bottom safe zones).

## 3. Motion, timing, audio

`canva_apply_motion` with `reel: plan.json` checks the registry. Today the connector has no
motion, transition, duration or audio operation, so it answers `unsupported` with:
the manual steps per scene (Animate on each element, the page timer, the transition), the
speaker-notes calls, the local MP4 export (animated, but a flat video not editable in Canva),
and the .pptx (durations and transitions for PowerPoint/Keynote; Canva does not import them).
If a later schema adds such an operation, it returns `needs-input`: read that schema and apply
the plan; never guess parameters.

## 4. Status, in separate lines

Report each one separately, from the tools' `progress` (`reelStatus`), never merged into "done":

| item | states |
|---|---|
| scenes | planned · created locally · created in Canva (design id) |
| file | not exported · probed (format, codec) |
| size | unverified · verified 1080×1920 · mismatch |
| total duration | unverified · verified against the plan's total · mismatch (pages × 5 s = Canva's defaults, timing not set) |
| scene timing | unverified (with the reason) · verified scene by scene · mismatch |
| motion / transitions | not applied · reported by the user (not verified from the file) |
| audio | none · absent in file · present in file · reported by the user |

A matching total only proves the total. Scene timing is verified only with evidence of where
each scene starts and ends: scene cuts detected in the file (`canva_export` runs ffmpeg's scene
detection when the host has ffmpeg) or passed in `sceneCuts`. Without that evidence it stays
`unverified`, with the reason; a detector that finds no cuts proves nothing either.

Static pages are not an animated video, and an MP4 of static scenes is not proof of motion.
After an MP4 export (from the saved design, after the user approved saving), verify the file:
`canva_export --file reel.mp4 --reel plan.json [--scene-cuts 2.6,5.4,…]`.

## Identity

The brand's rules apply to every scene (for «كتاب وبس»: blue palette, no yellow or orange, no
faces, Cairo/Tajawal, Western digits, no Latin words except @kitabwbs). The current request
overrides memory, and one edit is not a new preference.
