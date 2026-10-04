# Basira Social Algorithm Intelligence Engine

> **Basira does not claim access to private platform ranking algorithms.
> Scores are estimates generated from public platform information,
> content features and account-specific historical performance.**

A Platform Fit Score of 91 is **Basira's relative content/platform
compatibility score under the current model**. It is not a 91% chance of
reach or virality, and the engine never prints a probability unless an
optional learned model passed a calibration test (see
[Learning](#learning)).

Code: `lib/algorithm-intelligence/` (plain ESM JavaScript with JSDoc, like
the rest of the repository; no new runtime dependency). Tests:
`tests/algorithm-intelligence.test.js` (35 tests). Editor panel:
`components/studio/AlgorithmPanel.jsx`. CLI: `scripts/studio-cli.js`
(`studio …`) and `scripts/basira-cli.js` (`basira …`).

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Content features](#content-features)
4. [Signals and provenance](#signals-and-provenance)
5. [Score calculation](#score-calculation)
6. [Confidence](#confidence)
7. [Account history and learning](#account-history-and-learning)
8. [Recommendations and explanations](#recommendations-and-explanations)
9. [AI cost control](#ai-cost-control)
10. [CLI](#cli)
11. [Browser editor](#browser-editor)
12. [Programmatic API](#programmatic-api)
13. [Metrics providers and privacy](#metrics-providers-and-privacy)
14. [Storage](#storage)
15. [Research sources](#research-sources)
16. [Known limitations](#known-limitations)

## What it does

Give it a post, caption, hook, thread, carousel, reel script, article summary
or a Basira design, and it returns, for X, Instagram and Facebook:

- a **Platform Fit Score** (0–100) per platform and an overall content potential,
- separate score types: content quality, hook, retention, conversation, share,
  save, click, negative-feedback risk, format fit and historical fit,
- the **contributions** behind every score (which signal added or removed how
  many points, from which evidence, with which provenance),
- a **confidence** value and label with its reasons,
- **recommendations**: each one names the measured weakness, the target, the
  fix, its priority, its expected effect under the current model, and (when the
  account's history supports it) the account evidence with sample size and
  date range,
- per-slide diagnostics for carousels (`densityScore`, `warning`,
  `recommendedWordReduction`).

It works with no account, no credentials and no network. With imported post
metrics it adds account baselines, patterns, adaptive weights and higher
confidence.

## Architecture

```
content (text | slides | scenes | Basira design | reel plan)
        │  core/content-input.js
        ▼
ContentInput ──► core/feature-extractor.js  (local, deterministic)
                   text-stats · structure-features · audience · lexicon
                   semantic block: core/semantic.js (lexical, or a cached AI judgement)
        │
        ▼
features ──► platforms/{x,instagram,facebook}/*-signals.js
                │      (signal registry: core/signal-registry.js ← research/signal-catalog.js)
                ▼
             core/scoring-engine.js  (score types + Platform Fit blend, config.js weights)
                │      ▲ history/account-profile.js (baselines, patterns, topic affinity)
                │      ▲ learning/adaptive-weights.js (per-account weight factors)
                ▼
             core/confidence.js · explainability/* · core/recommendation-engine.js
                │      (counterfactual re-scoring: core/counterfactual.js)
                ▼
AnalysisReport ──► CLI text/JSON · editor panel · history/performance-store.js (runs)

metrics ──► ingestion/{instagram-insights,facebook-insights,x-metrics}.js
            ingestion/providers.js (MetricsProvider: LocalImport | Instagram | Facebook | X)
        ──► history/performance-store.js ──► baselines ──► patterns ──► weights
```

| Folder | Role |
|---|---|
| `types.js`, `config.js`, `engine.js`, `index.js` | vocabulary and validators, every weight and threshold, orchestration, public API |
| `core/` | content input, feature extraction, semantic layer, signal registry, scoring, confidence, recommendations, counterfactuals |
| `platforms/` | one engine per platform: `*-signals.js`, `*-scoring.js`, `*-recommendations.js`, `*-engine.js` (+ shared `base.js`, `common.js`) |
| `history/` | post records, robust statistics, baselines, account profile, persistence |
| `learning/` | pattern discovery and adaptive weights, dataset export, predictors, optional training |
| `ingestion/` | API and CSV parsers, metrics providers |
| `research/` | source registry with commits and dates, signal catalog |
| `explainability/` | bilingual labels, score explanations, recommendation reasons, text report |

Reused from the existing project rather than rebuilt: the byte store and
backups (`lib/studio/store.js`), the cache and cost ledger
(`lib/studio/budget.js`, which gained a `semantic` cache kind and an
`ai.semantic` call kind), Arabic normalization (`lib/studio/arabic.js`),
markup stripping (`lib/studio/measure.js`), the concept lexicon
(`lib/studio/concepts.js`), composition fields (`lib/studio/compositions.js`),
the design library (published posts linked to a design are analyzed from the
design), reel limits (`lib/studio/canva/reel.js`), the CLI dispatcher and the
editor's tab bar. The rudimentary `studio memory import-results` rows can be
moved into the new performance store with `studio analytics import-legacy`.

## Content features

All measurable features are computed locally and deterministically
(`core/text-stats.js`, `core/structure-features.js`, `core/feature-extractor.js`):

- **Text:** characters, words, sentences, average/maximum/first sentence
  length, lines and paragraphs, Arabic letter ratio, Latin words, diacritics,
  punctuation density, questions (`?` and `؟`), exclamations, ellipses,
  numbers (Western and Arabic-Indic digits and number words), units, hashtags,
  mentions, links, emoji, list and numbered-list structure, direct address
  (pronouns and the «ـك» suffix), first person, imperatives, emotional cues,
  curiosity cues, specificity, generic words, research claims, hostile words,
  engagement-bait phrases, content-word ratio (information density),
  redundancy and repetition, an Arabic readability proxy, conversationality,
  X weighted length.
- **Hook:** the opening a reader sees first (first line, cover title with a
  short subtitle, first scene, first post), its words, type (list, question,
  myth, warning, how-to, curiosity, statement) and a strength composite with
  its parts (length fit, curiosity, specificity, direct address, tension, clarity).
- **CTA:** presence, type (comment, save, share, follow, click), the CTA
  sentence itself, generic vs specific, bait.
- **Intent** (lexical, heuristic): education, entertainment, controversy,
  motivation, story, opinion, news, list, tutorial, comparison, warning,
  myth-busting, personal insight. **Topics** from the studio concept lexicon.
- **Likely audience actions** (`core/audience.js`, derived predictive
  features, not outcomes): comment-, reply-, share-, save-, quote-, click- and
  profile-worthiness, each a documented mix of features with a small prior.
- **Carousel:** slide count, words per slide, title words, per-slide density
  score and warning with the exact word reduction, empty slides, cover
  promise vs delivered items, ordinal progression, curiosity continuity,
  repeated layouts, strongest insight and reveal pacing, final CTA, layout
  scale from Basira designs.
- **Reel:** scene count, words per scene, duration (planned seconds or
  estimated speech at 2.5 words/s), first-scene words, the promise in the
  first 3 seconds, scene rhythm, open loops, payoff, visual changes per
  10 seconds, CTA placement, information compression, replay potential. The
  scene structure accepts real video analytics later (retention curves would
  arrive as imported metrics).
- **Thread:** posts, first-post length, posts over the limit, numbering.

`featureVector(features)` flattens everything numeric for datasets and models.

## Signals and provenance

52 signals (X 20, Instagram 18, Facebook 14) are defined once in
`research/signal-catalog.js`. Each has two provenances:

- **`provenance`** — where the **value** comes from: `derived` (measured from
  the content), `heuristic` (a rule-of-thumb estimate), `historical` (the
  account's results). Official API metrics and public code are not values
  Basira can compute for unpublished content, so no content-time value is
  labelled `official` or `public-source-code`.
- **`relevance`** — why the signal matters on that platform, with its own
  provenance and source ids: `official` (Meta system cards, platform API
  docs), `public-source-code` (X's repositories), `research`, `historical`,
  or `heuristic` (Basira's own rules).

```js
{
  id: 'x.reply_potential',
  platform: 'x',
  category: 'positive_engagement',
  provenance: 'heuristic',
  relevance: { provenance: 'public-source-code', sources: ['x-algorithm'], note: "X's ranker predicts P(reply) per viewer …" },
  enabled: true,
}
```

The registry (`core/signal-registry.js`) applies switches and weight
overrides from the configuration and an account's adaptive factors.
`checkRegistry()` (run by the tests) verifies that every signal has a valid
provenance, that every cited source exists and that every signal a platform
configuration names belongs to that platform.

| Provenance type | Examples |
|---|---|
| official | Instagram Feed system card (carousel completion, DM shares, skips, profile time); Facebook Feed system card (scroll past, "Show more", link clicks); X 280-character limit; API metric names |
| public-source-code | X action set and weighted-sum structure, author-diversity and out-of-network multipliers, cold-start threshold (xai-org/x-algorithm, twitter/the-algorithm, twitter/the-algorithm-ml) |
| research | Arabic readability (OSMAN, as a simplified proxy); sequential action modelling (generative-recommenders) |
| historical | baselines, topic affinity, patterns, adaptive weights |
| derived | readability, specificity, density, length fit, opening length |
| heuristic | audience-action estimates, hook composite, risk cues, thresholds |

The X repository publishes its production blending weights
(`home-mixer/params/param.rs`). They are stored verbatim in
`research/provenance.js` (`X_PUBLIC_WEIGHTS`) and **not used as Basira
weights**: they multiply calibrated per-viewer probabilities whose base rates
differ by orders of magnitude (the repository says so explicitly), while
Basira scores content-level potentials. The tests only check that Basira's
negative and positive groups agree with them in sign.

## Score calculation

**Score types** (`core/scoring-engine.js`) are weighted means of signal values
on 0..100 that decompose exactly into contributions around the neutral 50:

```
score = 50 + Σ_i 100 · w_i · (v_i − 0.5) / Σ w
```

Signals with no value (not applicable, no data) are left out of both sums.

**Platform Fit Score:**

```
fit = 100 · [ P − λ·N + q·(Q − ½) + f·(F − ½) ] + H

P  weighted mean of positive-action potentials   (config.platforms.<p>.blend.positive)
N  weighted mean of negative-feedback risks      (blend.negative), λ = blend.negativeScale
Q  content-quality score / 100,  q = blend.qualityScale
F  format-fit score / 100,       f = blend.fitScale
H  historical modifier = maxShift · (historicalFit − 50)/50 · confidence(history)
```

This is the requested shape: weighted positive actions − weighted negative
actions + content-quality modifier + historical account modifier. Every
weight lives in `config.js` (`DEFAULT_CONFIG.platforms`), each platform has
its own independent profile and `modelVersion` (`basira-x-v1`,
`basira-instagram-v1`, `basira-facebook-v1`), and any of it can be
overridden with `createEngine({ config: { … } })`. Every report carries the
engine version, the model version and the weights version.

## Confidence

`core/confidence.js`:

```
confidence = min(contentConfidence, genericCap) + (0.9 − genericCap) · historyStrength
historyStrength = quantity(n / 40) · recency(half-life 120 days) · (0.4 + 0.6 · similarity)
```

- `contentConfidence` is the weighted trust of the signals behind the score by
  provenance (`config.confidence.provenance`: heuristic 0.35, derived 0.6,
  historical by sample size…; an AI semantic judgement raises heuristic
  semantic signals to 0.5).
- Without history the score is capped at `genericCap` (0.44, label **low**)
  and says: *Generic platform model only: no account history yet.*
- Reasons are always listed: history size and format similarity, stale data,
  small samples, and the share of the score resting on rule-of-thumb estimates.
- Labels: high ≥ 0.7, medium ≥ 0.45, low otherwise.

## Account history and learning

**Records** (`history/post-history.js`) keep only the metrics their platform
reports, null when an import lacks one, absent when the platform has no such
metric:

| Platform | Metrics |
|---|---|
| Instagram | views, reach, impressions (pre-2024 media), likes, comments, shares, saves, reposts, engagements, profileVisits, follows, watchTime, averageWatchTime, skipRate |
| Facebook | views, reach, likes (reactions), comments, shares, linkClicks, engagements, watchTime, averageWatchTime, negativeFeedback |
| X | impressions, views, likes, replies, reposts, quotes, bookmarks, profileVisits, linkClicks, engagements |

Outcomes are rates per 1,000 exposures (reach on Instagram, views on
Facebook, impressions on X) plus the exposure itself.

**Baselines** (`history/baseline-builder.js`) use medians, MADs and
percentiles (never only the mean), overall, by format, by topic, recent
(45 days or the last 20 posts) and long-term, with rolling medians. A post is
compared with its format baseline (or the account's) as a ratio to the
median, a robust z-score (log scale for volumes) and a percentile; |z| > 3.5
marks an outlier, so one viral post never becomes a rule.

**Patterns** (`learning/adaptive-weights.js`) group posts by observable
features — hook type, opening length, slide count, post length, question,
specific CTA, intent, publish hour — and compare each group's median outcome
ratio with the rest. A pattern is reported only when both groups have at least
8 posts (`history.minSample`), the difference is at least 10%
(`history.minEffect`) and a Mann–Whitney test gives p ≤ 0.1 (`history.maxP`).
It carries `effect`, `sampleSize`, `comparisonSize`, `pValue`, `confidence`
and `dateRange`, and a statement such as:

> On this account, numbered-list hooks have produced +29% median shares per 1k
> reach versus comparable posts, over the last 19 posts (vs 29) from
> 2026-03-01 to 2026-07-02.

Patterns are associations in the account's data, not proven causes; reports
say so. Publish-hour patterns are reported in the profile only, never applied
to content.

**Adaptive weights:** with at least 20 posts, each blend signal's weight is
multiplied by `1 + clamp(ρ, ±0.3) · n/(n+30)` where ρ is the Spearman
correlation between the signal (computed with default weights on the
historical post's features) and the account's primary outcome ratio. Each
change is saved as a new numbered version (`kitabwbs-x-w1`, …) with its sample
and date range; identical data never creates a new version.

**The loop** (`history/account-profile.js`): content generated in the studio
→ published → metrics imported (`studio analytics import`) → post linked to
its design (`studio analytics link`) → profile rebuilt (only when the posts
changed) → the next analysis uses the account's baselines, patterns, topic
affinity and weights.

<a id="learning"></a>**Predictors** (`learning/predictor.js`) share one
interface, `predict(input) → Promise<Prediction>`:

- `HeuristicPredictor` — the transparent platform model,
- `AccountAdaptivePredictor` — plus history, patterns and adaptive weights,
- `MLPredictor` — an optional learned model (`learning/training-interface.js`).
  The built-in trainer is L2 logistic regression on standardized feature
  vectors with a time-ordered holdout. A model is used only when it has at
  least 60 posts and a holdout AUC ≥ 0.6, and its output is called a
  probability (of beating the account's own baseline) only when its holdout
  Brier score beats the base rate. Models are JSON, so gradient-boosted trees,
  ranking or neural models trained elsewhere can be added as new `type`s.

## Recommendations and explanations

Rules live in `core/recommendation-engine.js` (shared) and
`platforms/*/…-recommendations.js` (platform-specific). A rule fires only when
a feature crosses a threshold and always carries evidence; a rule without
evidence cannot produce a recommendation. Each recommendation has:

```
{ id, platform, issue, title, reason, suggestedFix, priority, expectedEffect,
  confidence, basis, evidence: [{ feature, value, target, provenance }],
  accountEvidence?: { line, sampleSize, confidence, dateRange }, rewrite? }
```

- `expectedEffect` comes from re-scoring the content with that one feature
  fixed (`core/counterfactual.js`): `{ scoreType, deltaPoints, overallDelta,
  basis: 'model-counterfactual' }` — a statement about the model, not a promise
  about reach.
- Rules of thumb (`basis: 'heuristic'`) never rank **high** unless the
  account's history backs them.
- Several rules describing one fix (a long opening) collapse into one item that
  keeps the account evidence.
- `rewrite` describes the change for the AI layer to draft on request; the
  engine never rewrites content itself.

Shared rules: overloaded or empty slides, weak opening or cover, generic or
missing CTA, cover promise vs delivered items, strongest insight placed late,
long sentences, low specificity, curiosity without substance, engagement bait,
hostile wording, heavy repetition, reel promise late, reel first scene long,
open loop without payoff, reel duration. X: over the post limit, no post text
for a visual post, thread opener. Instagram: slide count (or the account's
best range), caption opening. Facebook: first lines before "Show more", no
question to open discussion (explicitly marked as a rule of thumb). All
platforms: opening longer than the account's best range, account patterns the
content misses.

`explainability/score-explanation.js` turns contributions into positive and
negative contributors with their evidence and provenance labels;
`explainability/report-text.js` prints the full report (Arabic or English).

## AI cost control

Two layers:

- **Local analyzer** (always): every count, length, density, structure,
  punctuation and number feature, all scoring, history and recommendations.
  No tokens.
- **Semantic analyzer** (optional): curiosity, emotional framing, novelty,
  usefulness, CTA quality, quotability, intent and topics. The local lexical
  pass fills these by default (labelled heuristic). An AI judgement replaces
  only this block: `studio analyze-… --semantic-request` prints the compact
  request; the assistant answers; `--semantic answer.json` validates it,
  caches it under the content key (`cache/semantic/…`) and records one
  `ai.semantic` call in the ledger. Unchanged content reuses the cached result
  (`semanticWithCache` does the same for a programmatic analyzer).

The editor re-analyzes 450 ms after the last edit, reuses reports for
unchanged content and never calls an AI model.

## CLI

All commands are part of the existing `studio` CLI (also bundled in the
plugin as `studio.mjs`); `basira` is the same CLI with readable text reports
by default for analysis commands (`--format json` for JSON).

```
basira analyze-post post.txt --platform x
basira analyze-post post.txt --platform instagram --type caption
basira analyze-carousel carousel.json --platform instagram        # {slides:[…]} or a Basira design (.json/.html)
basira analyze-reel plan.json                                     # reel plan, {scenes:[…]} or a script .txt
basira analyze-content content.json --platform all
   options: --account ID --lang ar|en --caption FILE|TEXT --save --full
            --semantic-request | --semantic ANSWER.json

basira analytics import instagram insights.json   # Graph API media+insights, CSV export, or Basira rows
basira analytics import facebook insights.json
basira analytics import x metrics.json            # X API v2 tweets or analytics CSV
basira analytics fetch instagram|facebook|x       # credentials from the environment
basira analytics link POST_ID DESIGN_ID --platform instagram
basira analytics import-legacy                    # rows from `studio memory import-results`
basira analytics profile                          # baselines, patterns, top ranges
basira analytics dataset --platform x --out x.jsonl
basira analytics train --platform x
basira analytics runs
studio algorithm signals [--platform x] | sources | config
```

Example profile output (synthetic fixture data):

```
instagram — kitabwbs: 48 posts (2026-03-01 → 2026-07-20)
  Baseline (median): sharesPer1k 9.1 · savesPer1k 14.2 · commentsPer1k 3.1 · reach 2391

Top-performing content patterns
1. numbered-list hooks
   +29% sharesPer1k vs baseline · n=19 (vs 29) · confidence 0.77 · p=0
2. posts that ask the reader a question
   +11% commentsPer1k vs baseline · n=20 (vs 28) · confidence 0.76 · p=0.027
```

## Browser editor

The studio editor has a **ذكاء المنصات** tab
(`components/studio/AlgorithmPanel.jsx`): overall potential, one row per
platform; clicking a platform shows the score types, *why this score*, *what
hurts it*, recommended changes (with reasons, provenance and the model effect),
the account's evidence and the confidence with its reasons, plus per-slide
density warnings that jump to the slide. Metrics files (JSON or CSV) can be
imported there; they stay in that browser's storage. The panel is a separate
tab, so the creative editor is unchanged.

## Programmatic API

```js
import { createEngine, PerformanceStore, parseInstagram, formatReport } from './lib/algorithm-intelligence/index.js';
import { openStudio } from './lib/studio/studio.js';
import { FsStore } from './lib/studio/node/fsStore.js';

const studio = openStudio(new FsStore());
new PerformanceStore(studio.store, '@kitabwbs').upsert(parseInstagram(json));
const engine = createEngine({ studio, accountId: '@kitabwbs' });
const report = engine.analyze(designOrContent, { platforms: ['instagram', 'x'], lang: 'en', persist: true });
console.log(formatReport(report, { lang: 'en' }));
```

Other entry points: `extractFeatures`, `featureVector`, `engine.scorePlatform`,
`buildProfile`, `discoverPatterns`, `buildDataset`, `trainAndEvaluate`, the
three predictors, the parsers and `checkRegistry`.

## Metrics providers and privacy

`ingestion/providers.js` defines `MetricsProvider { id, platform, available(),
fetchPosts() }` with `LocalImportProvider` (files), `InstagramProvider`
(Instagram Graph API media + insights), `FacebookProvider` (Pages API posts +
insights) and `XProvider` (X API v2 user posts; a user-context token adds
non-public and organic metrics for the last 30 days). The engine never needs a
provider.

- Credentials are read only from the environment (`.env.example` lists the
  names; `.env` is git-ignored). They are sent as `Authorization` headers, never
  in URLs, and `redact()` removes them from every error message.
- Nothing in the browser editor reads or stores credentials; its import is a
  file the user picks.
- Analysis runs, profiles and exports contain no credentials.

## Storage

The existing byte store (files under `~/.baseera` for the CLI, localStorage in
the editor, memory in tests), included in `studio backup` (caches excepted):

| Path | Content |
|---|---|
| `analytics/<account>/posts.json` | published posts, metrics, snapshots, linked design ids, feature vectors |
| `analytics/<account>/profile.<platform>.json` | baselines, patterns, top ranges, weights version |
| `algorithm/weights/<account>/<platform>.json` | adaptive weight versions |
| `algorithm/runs/<account>/<yyyy-mm>/<run>.json` | analysis runs with features, scores, model and weights versions |
| `algorithm/models/<id>.json` | optional trained models with their evaluation |
| `cache/semantic/*.json` | cached semantic judgements |

Nothing existing is migrated or deleted; the new paths are additive.

## Research sources

Recorded in `research/provenance.js` with retrieval date and commit:

| Id | Source | Used for |
|---|---|---|
| x-algorithm | xai-org/x-algorithm @ b412112 (2026-10-03) | action set, weighted sum, diversity/OON/new-author concepts, published weights (reference only) |
| the-algorithm | twitter/the-algorithm @ c54bec0 | in/out-of-network sources, RealGraph affinity |
| the-algorithm-ml | twitter/the-algorithm-ml @ b852108 | 2023 heavy-ranker heads and weights (reference only) |
| generative-recommenders | meta-recsys/generative-recommenders @ 25e032d | per-action sequential modelling (research basis) |
| torchrec | meta-pytorch/torchrec | listed for a future ML predictor; not consulted |
| meta-ig-feed-card | Meta Transparency Center, Instagram Feed (updated 2026-06-29) | Instagram predictions |
| meta-fb-feed-card | Meta Transparency Center, Facebook Feed (updated 2026-06-24) | Facebook predictions |
| instagram-ranking-explained | Instagram, 2023-05-31 | Feed and Reels predictions |
| ig-graph-media-insights | Instagram Platform docs | metric names, deprecations |
| fb-page-insights | Pages API docs | metric names, 2025 deprecations |
| x-api-metrics | X API v2 docs | metric fields and access limits |
| osman-readability | El-Haj & Rayson, LREC 2016 | readability proxy (simplified) |

No code was copied from these repositories.

## Known limitations

- **No ground truth.** Without the account's imported metrics, every
  platform score rests mainly on Basira's rules of thumb (the report says
  what share). Scores are relative within a model version, not comparable
  across versions.
- **Lexical semantics.** The default semantic layer reads surface cues; it
  underrates reflective or aphoristic posts (e.g. «كلما حاولت إرضاء الجميع،
  خسرت شيئًا من نفسك.» scores 22 overall locally, 45 on X with an AI
  judgement). Use `--semantic` for such content.
- **Arabic dialects** are matched only through the word lists (Modern Standard
  Arabic first); intent and CTA detection can miss dialect phrasing.
- **Viewer-level signals** (who sees the post, follow graph, in/out-of-network
  share, author diversity in a session) are not observable by creators;
  `x.network_relevance` is always unavailable.
- **Patterns are associations**, can be confounded (in the synthetic fixture,
  long posts and personal-insight posts overlap), and need ≥ 8 posts per group.
- **Video**: reels are judged from text, scene structure and timing; no video
  frames or audio are analyzed. Retention curves are not imported yet.
- **Providers** were tested with mocked HTTP only; live API permissions,
  pagination beyond one page and rate limits are not exercised.
- **Type checking**: the repository has no type checker or linter configured.
  A one-off `tsc --checkJs` (non-strict) on this module reports diagnostics
  from JavaScript default-parameter inference (`{}` defaults, tuples in
  sorts, properties assigned with `Object.assign`); the real findings it
  surfaced were fixed.
