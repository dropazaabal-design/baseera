---
name: arabic-carousel
description: Designs Arabic (RTL) carousels for Instagram and LinkedIn in 4:5, 1:1 or 9:16. Writes the slide copy, then builds one self-contained HTML file holding a live editor with PNG, ZIP, LinkedIn PDF and 9:16 video reel export that keeps Arabic letters joined and mixed Arabic/English/numbers in the right order. Supports a locked institutional (navy/emerald) brand mode. Use when the user asks for a carousel, كاروسيل, سلايدات انستقرام, شرائح لينكدإن, بوست متعدد الشرائح, or Arabic social media slides.
---

# Arabic carousel

You write the content; a bundled editor renders and exports it. Never try to draw the slides yourself (no PIL, no canvas, no hand-written HTML): the editor already solves Arabic shaping, bidi, auto-fitting and font embedding, and was tested for it.

## Workflow

1. **Brief.** Get the topic, the audience, the platform, and the number of slides (default 6, max 20). The platform decides `design.format`: `portrait` 4:5 for Instagram and LinkedIn feeds (default), `square` 1:1, `story` 9:16 for Stories and Reels covers. Use the brand name and handle only if the user gives them; otherwise leave `brand` out, and the user can fill it in the editor.
2. **Plan the arc.** `cover` (hook) → 3–6 body slides (`listicle`, `comparison`, `quote`) → `outro` (call to action). One idea per slide. For a single-image post, use one `post` slide: it holds the whole hook → content → CTA arc (`hook`, `points`, `cta`).
3. **Write `carousel.json`** in the format below. Read `references/schema.json` for every template's exact field names and types, and `references/example.json` for a complete carousel.
4. **Build:** `python3 <this skill's directory>/scripts/build_carousel.py carousel.json carousel.html`. Fix every `error:` and re-run. Fix `warning:` lines too, unless the user wants it that way.
5. **Deliver `carousel.html`** as a file. Tell the user, in their language: open it in Chrome, Edge or Firefox; edit any text, colours, fonts or plugins in the side panel; press «الكل ZIP» to download every slide as PNG, «الشريحة PNG» for the selected one, or «PDF لينكدإن» for a single PDF that LinkedIn shows as a swipeable document post. Images download as `01-hook.png`, `02-content.png`, … `05-cta.png`, so their order is the posting order. «فيديو ريلز» turns the slides into an animated 9:16 video (14 seconds by default) with a fast hook. For a reel, keep each body slide short: the dialog warns when a slide has more text than its scene leaves time to read. It works offline, and edits are saved in the browser.

## Format

```json
{
  "design": { "paletteId": "midnight", "font": "cairo", "numerals": "arab", "format": "portrait" },
  "brand": { "name": "اسم الحساب", "handle": "@handle" },
  "plugins": { "swipe": { "text": "اسحب لليسار", "lastText": "احفظ البوست 📌" } },
  "slides": [
    { "template": "cover", "data": { "kicker": "…", "title": "…", "subtitle": "…" } },
    { "template": "listicle", "data": { "title": "…", "items": ["…", "…"], "start": 1 } },
    { "template": "outro", "data": { "title": "…", "save": "احفظه", "share": "شاركه", "follow": "تابعنا", "socials": ["@handle"] } }
  ]
}
```

Only `slides` is required. A field you leave out is simply not shown.

## Writing Arabic copy

- **Short.** Cover title ≤ 8 words; slide titles ≤ 6; list items ≤ 12 words; 3–5 items per list, 2–4 per comparison column. If the editor flags a slide with «!», the text does not fit even at the smallest readable size, so shorten it or split the slide.
- **Accent:** wrap the one key word of a title in `*نجمتين*` to colour it. One accent per title.
- **Punctuation:** ، ؛ ؟ and «», never `, ; ?` or straight quotes after Arabic words. ASCII punctuation is fine inside English phrases.
- **Mixed text:** type Latin names, numbers, `@handles`, `#tags`, URLs, emails and phone numbers exactly as they are. The renderer keeps them in the right order. Never insert RLM/LRM or other bidi control characters.
- **Numbers:** `design.numerals` controls only generated numbers (slide counter, step numbers). Pick one system for numbers in the copy as well and use it everywhere.
- **No tatweel** (ـ) and no stretching. Arabic is not hyphenated, so prefer shorter words over long compounds in titles.
- **One register** across all slides: simple Modern Standard Arabic unless the user asks for a dialect. Check hamzas (أ إ ء ئ ؤ), ة vs ه, and ى vs ي.
- **Listicles over several slides:** set `start` so numbering continues (e.g. `"start": 4` on the second listicle slide).

## Design choices

| `paletteId` | Mood |
|---|---|
| `midnight` | Tech, serious, high contrast (default) |
| `sand` | Warm, editorial, education |
| `emerald` | Finance, growth, Islamic content |
| `ink` | Minimal, corporate, white |
| `violet` | Creative, youth, events |
| `coral` | Lifestyle, food, health |

For brand colours use `"paletteId": "custom", "custom": { "bg": "#RRGGBB", "accent": "#RRGGBB" }`. Text colours are derived automatically, and any pair that fails WCAG AA contrast is corrected.

| `font` | Character |
|---|---|
| `cairo` | Modern, versatile (default) |
| `tajawal` | Clean and light |
| `almarai` | Friendly, rounded, Gulf feel |
| `readex` | Geometric, techy |

## Institutional Mode

For a company, government body or agency client that needs strict brand governance, add `"governance": { "institutional": true }`. The editor then forces the navy and emerald palettes (`agency-navy`, `agency-light`), disables every warm colour (yellow, orange, gold, red), locks the font to Tajawal, forces the slide counter and watermark on, and locks templates, plugins and identity. Only text and image fields stay editable. Add `"locked": true` to also hide the switch, so whoever opens the file cannot turn the mode off. Leave `paletteId` and `font` out in this mode; the policy sets them.

## Images

The `quote` template has a `photo` field (author photo). Like `brand.logo` and `brand.avatar`, it must be `null` or a `data:image/...` URL. Use it only when the user gives you an image file; otherwise leave it out and tell them they can add it in the editor.

## Plugins

Every plugin is on by default; only set what you change.

- `pagination`: `style` `"words"` (الشريحة ١ من ٥) or `"fraction"` (١/٥), `showBar`, `showCounter`.
- `swipe`: `text` on every slide but the last, `lastText` on the last slide, `showArrow`.
- `watermark`: `showLogo`, `showBadge`. The logo and photo are uploaded by the user in the editor (التصميم ← الهوية). Leave `brand.logo` and `brand.avatar` out unless the user hands you an image, which must then be a `data:image/...` URL.

Turn a plugin off with `{"enabled": false}`.
