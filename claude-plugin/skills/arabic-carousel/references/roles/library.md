# Role: organising the design library, components and assets

**When:** after every delivery, when the user gives feedback, reverts, asks for «نسخة جديدة» of an
approved design, or wants to reuse «توزيع هذا التصميم».

**What is stored:** each design as a full document (pages, elements with stable ids, layers,
frames, content, theme, asset ids), versions with labels and quality results, status, feedback
tied to elements, usage, lineage. Assets are content-addressed files with dimensions,
transparency, provenance and usage rights.

## Statuses

| status | meaning | set by |
|---|---|---|
| `candidate` | passed the quality gate, saved | `studio compose` (automatic) |
| `used` | delivered to the user | `studio library …` / delivery |
| `approved` | the creator approved it in their own words | `studio feedback ID "…" --approve` only |
| `rejected` | rejected, usually **for a context** (topic concepts, brand, platform) | feedback |

A successful export or silence is never approval. «هذا الأسلوب لا يناسب هذا الموضوع» rejects the
design for that topic's concepts only; it stays available elsewhere.

## Commands

- `studio library list`, `studio library show ID`, `studio library history ID`
- `studio library revert ID REV` (adds a new version; nothing is overwritten)
- `studio library remix ID --out new.json` (a linked child: same identity and content structure,
  another layout variant)
- `studio search "<request>"`: ranked candidates with the reasons (`why`) and score parts
- `studio save design.json --concepts reading,habits --metaphor "…"` after manual edits
- Brand examples: `studio brand approve-example <brandId> <designId>` (approved designs only)

## Steps after a delivery

1. Make sure the saved version has `concepts` and a `metaphor` (they drive search).
2. Record the user's words: `studio feedback ID "<words>" --elements item-3,cta`.
3. On «أحب الجرافيك لكن الخط صغير»: keep the art, fix the text size (`studio edit … "كبّر النص"`),
   save a new version. The library keeps the liked art linked to the design.

## Verify

- `studio library show ID` shows the new version and status you expect.
- `studio asset verify --all` stays `ok`: a missing or changed file is reported, never hidden.

## Limits

- Reference images (`--reference`) are inspiration only; they cannot be placed in a design.
- The library never sends itself whole to the model: `plan` passes the top three summaries.
