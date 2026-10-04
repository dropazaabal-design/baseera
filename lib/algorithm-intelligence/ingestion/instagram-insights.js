import { parseCsv, pickColumn } from './csv.js';

// Instagram metrics → post records. Accepts:
//   - Instagram Graph API media objects with their insights, as returned by
//     GET /{ig-user-id}/media and GET /{media-id}/insights (official names:
//     reach, views, likes, comments, saved, shares, reposts,
//     total_interactions, profile_visits, follows, ig_reels_avg_watch_time,
//     ig_reels_video_view_total_time, reels_skip_rate; impressions for media
//     created before 2024-07-02)
//   - CSV exports with common column names
//   - rows already in Basira's shape ({ postId, metrics: {...} })
// Watch times arrive in milliseconds and are stored in seconds.

const API = {
  reach: 'reach',
  views: 'views',
  impressions: 'impressions',
  likes: 'likes',
  comments: 'comments',
  saved: 'saves',
  shares: 'shares',
  reposts: 'reposts',
  total_interactions: 'engagements',
  profile_visits: 'profileVisits',
  follows: 'follows',
  ig_reels_avg_watch_time: 'averageWatchTime',
  ig_reels_video_view_total_time: 'watchTime',
  reels_skip_rate: 'skipRate',
};
const MS = new Set(['averageWatchTime', 'watchTime']);

const typeOf = (m) => (m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : m.media_product_type === 'REELS' || m.media_type === 'VIDEO' ? 'reel' : 'post');

function insightValues(insights) {
  const list = Array.isArray(insights) ? insights : insights?.data ?? [];
  const out = {};
  for (const i of list) {
    const key = API[i.name];
    if (!key) continue;
    const v = i.values?.[0]?.value ?? i.total_value?.value ?? i.value;
    if (typeof v === 'number') out[key] = MS.has(key) ? v / 1000 : v;
  }
  return out;
}

export function fromGraphMedia(media) {
  return {
    platform: 'instagram',
    postId: media.id,
    postedAt: media.timestamp ?? null,
    contentType: typeOf(media),
    text: media.caption ?? null,
    permalink: media.permalink ?? null,
    metrics: { ...insightValues(media.insights), ...(typeof media.like_count === 'number' && { likes: media.like_count }), ...(typeof media.comments_count === 'number' && { comments: media.comments_count }) },
    source: 'instagram-graph',
  };
}

const CSV = {
  postId: ['Post ID', 'Media ID', 'id', 'postId', 'معرف المنشور'],
  postedAt: ['Publish time', 'Published', 'timestamp', 'postedAt', 'Date', 'وقت النشر'],
  text: ['Description', 'Caption', 'text', 'الوصف'],
  type: ['Post type', 'Media type', 'contentType', 'نوع المنشور'],
  permalink: ['Permalink', 'URL'],
  metrics: {
    reach: ['Reach', 'Accounts reached', 'الوصول'],
    views: ['Views', 'Plays', 'المشاهدات'],
    impressions: ['Impressions', 'مرات الظهور'],
    likes: ['Likes', 'الإعجابات'],
    comments: ['Comments', 'التعليقات'],
    shares: ['Shares', 'المشاركات'],
    saves: ['Saves', 'Saved', 'مرات الحفظ'],
    follows: ['Follows', 'المتابعات'],
    profileVisits: ['Profile visits', 'زيارات الملف الشخصي'],
    averageWatchTime: ['Average watch time (sec)', 'Average watch time'],
  },
};

const csvType = (t) => (/carousel|album|كاروسيل|دائري/i.test(t ?? '') ? 'carousel' : /reel|video|ريل|فيديو/i.test(t ?? '') ? 'reel' : 'post');

export function fromCsvRow(row) {
  const metrics = {};
  for (const [k, aliases] of Object.entries(CSV.metrics)) metrics[k] = pickColumn(row, aliases);
  return { platform: 'instagram', postId: pickColumn(row, CSV.postId), postedAt: pickColumn(row, CSV.postedAt), contentType: csvType(pickColumn(row, CSV.type)), text: pickColumn(row, CSV.text), permalink: pickColumn(row, CSV.permalink), metrics, source: 'csv' };
}

export function parseInstagram(input, { filename = '' } = {}) {
  if (typeof input === 'string' && (filename.endsWith('.csv') || !/^\s*[[{]/.test(input))) return parseCsv(input).map(fromCsvRow).filter((r) => r.postId);
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data.data ?? data.media?.data ?? data.posts ?? [];
  return list.map((m) => (m.metrics && (m.postId || m.id) && !m.insights ? { platform: 'instagram', ...m, postId: m.postId ?? m.id } : fromGraphMedia(m)));
}
