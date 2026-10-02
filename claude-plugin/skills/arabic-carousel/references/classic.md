# Classic carousel path (no Node, or the user asks for the classic editor)

The classic editor uses fixed templates and needs only Python 3. It has no library, memory or
Canva path; say so when you use it.

1. Write `carousel.json`:

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

Templates: `cover`, `listicle`, `quote`, `comparison`, `outro`, `post` (single post: `hook`,
`points`, `cta`). Exact fields: `references/schema.json` (`templates`). Full example:
`references/example.json`. Formats: `portrait` 4:5, `square` 1:1, `story` 9:16.
Institutional Mode: `"governance": { "institutional": true }` (navy/emerald, no warm colours,
locked layout; add `"locked": true` to hide the switch).

2. `python3 scripts/build_carousel.py carousel.json carousel.html`. Fix every `error:`.

3. Deliver `carousel.html`. The classic editor can open the same carousel in the studio
   («فتح في الاستوديو») when the user later has Node or uses the web app.
