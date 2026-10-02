# Design Library V2 — audit of what exists (2026-10-02)

Read from the repository at commit `b3874c0` plus the Canva work of this round. "Tested" means an
automated test or a live run named in the evidence column; "exists" alone means code is there.

| Need | Exists | Evidence | Tested | Gap | Smallest change |
|---|---|---|---|---|---|
| Entry points | studio CLI (`scripts/studio-cli.js` → `studio.mjs`), browser editor (`/studio`), Canva tools (CLI + MCP) | `scripts/`, `components/studio/`, `lib/studio/canva/tools.js` | yes (tests/plugin, tests/canva, Playwright earlier) | none for this work | — |
| Document schema | schemaVersion 2: pages → composition + content + overrides → elements | `lib/studio/contracts.js`, `document.js` | yes | no style reference, no per-page light/dark mode | optional `doc.style`, `page.styleMode`, `theme.dark` (no migration needed: absent = today's behaviour) |
| Storage | key/value store (fs or memory): library, assets, memory, projects, ledger, journal | `lib/studio/store.js`, `node/fsStore.js` | yes | styles/compositions are code, not stored records | styles as versioned JSON records in the repo (`lib/studio/styles/*.json`), validated |
| Arabic engine | shaping/bidi by the browser renderer; measurement table + `canvas` metrics; reflow; numerals; Canva LRM/alignment rules | `lib/studio/measure.js`, `metrics.js`, `reflow.js`, `lib/bidi.js`, `adapters/canva.js` | yes (golden tests, live Canva read-back 54/54) | measurement is approximate outside the browser (marked so) | keep; style QA uses the same measurement and flags approximate |
| Compositions | 9: hero, list, post, comparison, quote, statement, collage, numbered, outro — each with blocks, variants, capacity, reflow, fields | `lib/studio/compositions.js` | yes | decoration lives inside each composition (style and composition mixed); no slot/anchor/reading-order metadata; missing stat, steps, checklist, evidence, diagram | move decoration to the style layer (composition decor stays as the "classic" default); add metadata and the missing compositions |
| Styles | none as a layer. 8 palettes are colour variants, not styles (same geometry, type and graphics) | `plugins/palettes.js`, `lib/studio/theme.js` | palettes: yes (contrast) | everything | Style records: tokens per mode, type, shape treatment, declarative decoration, densities, roles, formats, provenance, status |
| Compatibility | none | — | — | no record of which style fits which composition | matrix computed by QA over Arabic samples, statuses ready / needs_review / unsuitable |
| Library search | designs ranked by concept, quality, preferences, capacity, feedback, freshness | `lib/studio/library.js` | yes | does not know styles or compatibility | search filters on ready pairs once styles exist |
| Assets | content-addressed store with tags, provenance, recolourable SVG starter pack (14, original) | `lib/studio/assets.js`, `assets/starter/manifest.json` | yes | no style compatibility per asset | add `styles` tag list when a style is declared compatible |
| Provenance | assets only | manifest `provenance` | — | styles/compositions have none | `provenance` per style + `docs/research/sources.md` |
| Export | PNG/ZIP/PDF/video in the browser; PPTX; Canva | `lib/exportEngine.js`, `canva/pptx.js` | yes | — | — |
| Canva | registry by dialect, build/patch/import/reel/export tools | `lib/studio/canva/*` | yes (local + live on Claude's connector) | other hosts not tested live | — |
| Skills | 5 skills, MCP + CLI | `claude-plugin/skills/*` | install test in Claude Code | skills do not mention styles | update `arabic-carousel` once styles are ready |

## Inventory: real styles and compositions

| Kind | Count | Executable rules | Description only | Preview image only | Passed Arabic QA |
|---|---|---|---|---|---|
| Compositions | 9 | 9 (blocks, capacity, reflow) | 0 | 0 | 9 (quality gate in tests and examples) |
| Styles | 0 | 0 | 0 | 0 | 0 |
| Palettes (not styles) | 8 + brand-derived | colours only | — | — | contrast-checked |

## Baseline before V2 (same machine, Node 22)

| Example | Compose time | Pages | Elements | Quality | AI generations | External ops | Tokens / cost |
|---|---|---|---|---|---|---|---|
| `example-studio.json` | 28 ms | 1 | 25 | passed, 0 warnings | 0 | 0 | null (not measured locally) |
| same, «كتاب وبس» preset | 13 ms | 1 | 29 | passed, 2 warnings | 0 | 0 | null |
