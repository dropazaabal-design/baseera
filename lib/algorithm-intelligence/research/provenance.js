// Where each piece of platform knowledge comes from. Every signal in the
// catalog cites one or more of these ids, so a score can always say whether
// it rests on an official statement, public source code, research, the
// account's own history, a measurement of the content, or a rule of thumb.
//
// Nothing here is a claim that Basira knows a platform's private ranking.
// Public code shows how a ranking system is built and which actions it
// predicts; Basira measures content and the creator's results, and uses the
// public material only to decide which actions are worth estimating.

export const SOURCE_TYPES = ['official', 'public-source-code', 'research', 'historical', 'derived', 'heuristic'];

export const SOURCES = {
  'x-algorithm': {
    sourceType: 'public-source-code',
    source: 'xai-org/x-algorithm',
    url: 'https://github.com/xai-org/x-algorithm',
    commit: 'b412112d03f27acbfd668e0cc040abcafa1080c1',
    retrievedAt: '2026-10-04',
    files: ['README.md', 'home-mixer/params/param.rs', 'xai-value-model/scoring.rs', 'home-mixer/scorers/value_model.rs'],
    notes:
      'Used as conceptual basis; no claim of identical production weighting. Phoenix predicts, per viewer, the probability of each action ' +
      '(favorite, reply, repost, quote, share, share via DM, share via copy link, clicks, profile click, dwell, follow author; negative: ' +
      'not interested, mute, block, report, not dwelled). RankingScorer sums weight × P(action), then applies an author-diversity decay, an ' +
      'out-of-network discount and a new-author boost. The published weights multiply calibrated per-viewer probabilities whose base rates ' +
      'differ by orders of magnitude (the repository says so explicitly), so they are recorded as reference only and never applied to ' +
      "Basira's content-level estimates.",
  },
  'the-algorithm': {
    sourceType: 'public-source-code',
    source: 'twitter/the-algorithm',
    url: 'https://github.com/twitter/the-algorithm',
    commit: 'c54bec0d4e029fe34926ef3258a86ccacc0d0182',
    retrievedAt: '2026-10-04',
    files: ['README.md'],
    notes:
      'Architecture reference (2023 release): in-network candidates from the search index, out-of-network candidates (UTEG, SimClusters, ' +
      'follow recommendations), light and heavy rankers, home-mixer, visibility filters, RealGraph (likelihood of interacting with an author). ' +
      'Used for the concepts of in/out-of-network reach and author affinity only.',
  },
  'the-algorithm-ml': {
    sourceType: 'public-source-code',
    source: 'twitter/the-algorithm-ml',
    url: 'https://github.com/twitter/the-algorithm-ml',
    commit: 'b85210863f7a94efded0ef5c5ccf4ff42767876c',
    retrievedAt: '2026-10-04',
    files: ['projects/home/recap/README.md'],
    notes:
      'Heavy ranker (2023): a weighted sum of predicted engagement probabilities (favorite, retweet, reply, good profile click, video ' +
      'playback 50%, reply engaged by author, good click, good click v2, negative feedback, report). The README notes the weights were set ' +
      'so each weighted probability contributes roughly equally on average, then tuned. Historical reference only.',
  },
  'generative-recommenders': {
    sourceType: 'research',
    source: 'meta-recsys/generative-recommenders',
    url: 'https://github.com/meta-recsys/generative-recommenders',
    commit: '25e032d6f1e29b7f7652aa2b0a9f75499a4b1940',
    retrievedAt: '2026-10-04',
    files: ['README.md'],
    notes:
      'Research (ICML 2024, "Actions Speak Louder than Words"): recommendation reformulated as sequential transduction over user actions ' +
      '(HSTU). Basis for modelling each audience action as its own prediction rather than one engagement number. No claim that Instagram ' +
      'or Facebook run this code or these settings.',
  },
  torchrec: {
    sourceType: 'research',
    source: 'meta-pytorch/torchrec',
    url: 'https://github.com/meta-pytorch/torchrec',
    commit: null,
    retrievedAt: null,
    consulted: false,
    notes: 'Listed as a possible training stack for a future MLPredictor (embedding tables, multi-task heads). Not consulted for any signal in this version.',
  },
  'meta-ig-feed-card': {
    sourceType: 'official',
    source: 'Meta Transparency Center — Instagram Feed AI system card',
    url: 'https://transparency.meta.com/features/explaining-ranking/ig-feed',
    publishedAt: '2026-06-29',
    retrievedAt: '2026-10-04',
    notes:
      'Lists predictions including: swipe through the whole carousel, enjoy the post, skip the post, time on the author\'s profile after ' +
      'seeing the post, share the post in a direct message, time spent on the post. Signals include engagement actions, time spent, content ' +
      'type, recency, creator information and media characteristics such as text overlay. No weights are published.',
  },
  'meta-fb-feed-card': {
    sourceType: 'official',
    source: 'Meta Transparency Center — Facebook Feed AI system card',
    url: 'https://transparency.meta.com/features/explaining-ranking/fb-feed',
    publishedAt: '2026-06-24',
    retrievedAt: '2026-10-04',
    notes:
      'Lists predictions including: scroll past a post rather than engage, click "Show more", deep/strong intent to engage with posts from a ' +
      'connection, click a link and time on the website. Signals include time spent per post, video watch duration thresholds, topic ' +
      'relevance and comment metrics. No weights are published.',
  },
  'instagram-ranking-explained': {
    sourceType: 'official',
    source: 'Instagram — "Instagram Ranking Explained"',
    url: 'https://about.instagram.com/blog/announcements/instagram-ranking-explained',
    publishedAt: '2023-05-31',
    retrievedAt: '2026-10-04',
    notes:
      'Feed predictions: spend a few seconds on a post, comment, like, share, tap the profile photo. Reels predictions: reshare a reel, ' +
      'watch it all the way through, like it, go to the audio page. No weights are published.',
  },
  'ig-graph-media-insights': {
    sourceType: 'official',
    source: 'Instagram Platform — IG Media Insights reference',
    url: 'https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/',
    retrievedAt: '2026-10-04',
    notes:
      'Media metrics: reach, views, likes, comments, saved, shares, reposts, total_interactions, profile_visits, profile_activity, follows ' +
      '(FEED), ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate (REELS). impressions is deprecated for media ' +
      'created after 2024-07-02. Metrics can be delayed up to 48 hours.',
  },
  'fb-page-insights': {
    sourceType: 'official',
    source: 'Facebook Pages API — Page Insights (and deprecated metrics list)',
    url: 'https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics',
    retrievedAt: '2026-10-04',
    notes:
      'post_impressions → post_media_view (2025-11-15), post_impressions_unique → post_total_media_view_unique (2025-06-15). Still ' +
      'documented: post_reactions_by_type_total, post_clicks, post_video_avg_time_watched, post_video_views.',
  },
  'x-api-metrics': {
    sourceType: 'official',
    source: 'X API v2 — Metrics',
    url: 'https://docs.x.com/x-api/fundamentals/metrics',
    retrievedAt: '2026-10-04',
    notes:
      'public_metrics: retweet_count, reply_count, like_count, quote_count, bookmark_count, impression_count. non_public_metrics (own posts, ' +
      'user context, last 30 days): impression_count, url_link_clicks, user_profile_clicks, engagements. organic_metrics likewise.',
  },
  'osman-readability': {
    sourceType: 'research',
    source: 'El-Haj & Rayson (2016), "OSMAN – A Novel Arabic Readability Metric", LREC 2016',
    url: 'https://aclanthology.org/L16-1038/',
    retrievedAt: null,
    notes: 'Arabic readability from words per sentence and long or hard words. Basira computes a simplified proxy without syllable counts; it is not the OSMAN score.',
  },
  'basira-heuristics': {
    sourceType: 'heuristic',
    source: 'Basira',
    url: null,
    retrievedAt: null,
    notes: "Basira's own rules of thumb about phone reading and Arabic copy. Low confidence until the creator's history confirms them.",
  },
  'account-history': {
    sourceType: 'historical',
    source: "The creator's imported post metrics",
    url: null,
    retrievedAt: null,
    notes: 'Medians, MADs and patterns computed from the account\'s own posts. Only as strong as the sample size reported with each claim.',
  },
};

// X's published blending weights, kept verbatim for reference and tests
// (sign agreement), never used as Basira weights: they multiply calibrated
// per-viewer probabilities, Basira scores content-level potentials.
export const X_PUBLIC_WEIGHTS = {
  source: 'x-algorithm',
  file: 'home-mixer/params/param.rs',
  weights: {
    favorite: 0.5,
    reply: 5.0,
    retweet: 1.0,
    quote: 5.0,
    share: 2.0,
    share_via_dm: 5.0,
    share_via_copy_link: 20.0,
    click: 0.3,
    open_link: 0.2,
    profile_click: 0.0,
    photo_expand: 0.05,
    video_open: 0.07,
    dwell: 0.05,
    follow_author: 4.0,
    not_interested: -47.52,
    block_author: -31.2,
    mute_author: -58.8,
    report: -234.0,
    not_dwelled: -0.02,
  },
  coldStartImpressionThreshold: 200,
};

export function cite(id) {
  const s = SOURCES[id];
  if (!s) throw new Error(`unknown source "${id}"`);
  return { id, sourceType: s.sourceType, source: s.source, url: s.url, retrievedAt: s.retrievedAt, ...(s.commit && { commit: s.commit }) };
}

export function validateSources(ids) {
  return (ids ?? []).filter((id) => !SOURCES[id]).map((id) => `unknown source "${id}"`);
}
