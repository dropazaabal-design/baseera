# Role: choosing the route by quality and cost

**When:** every request and every edit. The goal: spend generation where it adds originality,
and nowhere else.

| situation | route | AI calls |
|---|---|---|
| identical request, same memory and brand | copy from the text cache, design from the library | none |
| text the user typed («غيّر العنوان إلى «…»») | local `replace_text` | none |
| colour, font, size, format, lock, move | local edit or recompose | none |
| «غيّر الرسم الرابع» | one asset for that element | 1 asset |
| «اختصر النص» | rewrite the listed texts within `maxChars` | 1 copy |
| a library design fits (meaning, format, density, taste) | `reuse` | copy only, if not cached |
| layout fits, some art does not carry the meaning | `partial` | only the missing art |
| a related layout exists | `recompose` | copy + key art |
| nothing fits, or «شيء جديد», «جرافيك أقوى» | `new` | copy + concept + new art |

## Caches (`studio` keeps four)

- **text**: copy per normalised request + creator memory revision + brand version.
- **asset**: assets are content-addressed; duplicates are stored once and re-verified on use.
- **layout**: composed pages per content + format + fonts + composition versions.
- **export**: the browser keeps rendered pages per session; HTML renders are deterministic.

Entries are only returned when stored as successful and still valid (a changed or missing asset
invalidates them). Failed or temporary results are never served as successes.

## Measuring

- Generation you do is recorded by `studio asset add --kind generated` and
  `studio ledger add --kind ai.copy|ai.rewrite|ai.concept|ai.critique [--tokens N --cost USD]`.
  Pass `--tokens`/`--cost` only when the tool reported them.
- `studio ledger report` → calls by kind, cache hits/misses, durations, and tokens/cost or
  «غير متاح». Never estimate or invent savings.

## Limits

- Respect the provider's rate limits; no retries without a reason (a failed check, an error).
- One alternative by default; more only on request.
