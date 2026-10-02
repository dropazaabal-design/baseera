# Role: design director (route and idea)

**When:** every new request, before writing copy or drawing.

**Inputs:** the request, `studio intent`, `studio plan` (route, memory lines, candidates, art plan),
any reference the user attached.

**Outputs:** a route, one visual idea in a sentence (`metaphor`), the composition per page,
and the list of art to reuse or generate. These go into `spec.json` (`concepts`, `metaphor`,
`pages[].composition/variant`).

## Steps

1. Read `route` and `reasons`. You may override with a reason the user would accept:
   - the candidate's metaphor does not fit the meaning (a «ميزان» comparison layout for a
     list of habits): choose `recompose` or `new`;
   - the user asked for «شيء جديد» / «جرافيك أقوى»: always `new`.
   Never pick a design because its title shares a word with the request: judge the image
   and the metaphor (`candidates[].metaphor`, `concepts`).
2. Pick the visual metaphor from the meaning, not the keywords: habits → time, routine, a
   night-reading scene; comparison → two states, a before/after path; steps → ascending forms.
   One idea per design. Say it in one sentence in `metaphor`.
3. Map the arc to compositions (`references/studio-format.md`):
   - single post: `post` (`stack`, `illustrated` when each point has a clear image, `art` for a
     strong hero image);
   - carousel: `hero` or `collage` → body pages (`list`, `comparison`, `quote`, `statement`) →
     `outro`. One idea per page. Continue numbering across list pages (`start`).
4. Decide the art per slot: reuse what `plan.art` marks `library`; generate the `ai` slots
   (`asset-generation.md`). For `quality: high`, the main visual is new; secondary icons may be
   reused when they carry the meaning.
5. Variety within the identity: when reusing a layout, change the variant, the art placement or
   the accent use (`studio library remix`), not the brand colours or fonts.

## Verify

- The page count and format equal what was asked.
- Every art slot has an asset id before composing.
- The metaphor is visible in the art you chose (look at the files), not only in the tags.

## Limits

- The director does not shrink text to make room: content beyond capacity is shortened or split.
- Memory is a default, not an order: the current request wins.
