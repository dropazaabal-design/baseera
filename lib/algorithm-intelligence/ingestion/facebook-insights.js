import { parseCsv, pickColumn } from './csv.js';

// Facebook Page post metrics → post records. Accepts Graph API posts with
// their insights (post_media_view, post_total_media_view_unique,
// post_reactions_by_type_total, post_clicks_by_type,
// post_video_avg_time_watched; the deprecated post_impressions and
// post_impressions_unique are read for older exports), the post's own
// shares.count and comments.summary.total_count, CSV exports, and rows in
// Basira's shape.

function insightValues(insights) {
  const list = Array.isArray(insights) ? insights : insights?.data ?? [];
  const out = {};
  const val = (i) => i.values?.[0]?.value ?? i.value;
  for (const i of list) {
    const v = val(i);
    switch (i.name) {
      case 'post_media_view':
        if (typeof v === 'number') out.views = v;
        break;
      case 'post_impressions':
        if (typeof v === 'number' && out.views === undefined) out.views = v;
        break;
      case 'post_total_media_view_unique':
        if (typeof v === 'number') out.reach = v;
        break;
      case 'post_impressions_unique':
        if (typeof v === 'number' && out.reach === undefined) out.reach = v;
        break;
      case 'post_reactions_by_type_total':
        if (v && typeof v === 'object') out.likes = Object.values(v).reduce((s, n) => s + (Number(n) || 0), 0);
        break;
      case 'post_clicks_by_type':
        if (v && typeof v === 'object' && typeof v['link clicks'] === 'number') out.linkClicks = v['link clicks'];
        break;
      case 'post_video_avg_time_watched':
        if (typeof v === 'number') out.averageWatchTime = v / 1000;
        break;
      case 'post_video_view_time':
        if (typeof v === 'number') out.watchTime = v / 1000;
        break;
      case 'post_negative_feedback':
        if (typeof v === 'number') out.negativeFeedback = v;
        break;
      default:
    }
  }
  return out;
}

const typeOf = (p) => {
  const att = p.attachments?.data?.[0];
  if (att?.subattachments?.data?.length > 1) return 'carousel';
  if (/video/i.test(p.status_type ?? '') || /video/i.test(att?.media_type ?? '')) return 'reel';
  return 'post';
};

export function fromGraphPost(p) {
  return {
    platform: 'facebook',
    postId: p.id,
    postedAt: p.created_time ?? null,
    contentType: typeOf(p),
    text: p.message ?? null,
    permalink: p.permalink_url ?? null,
    metrics: { ...insightValues(p.insights), ...(typeof p.shares?.count === 'number' && { shares: p.shares.count }), ...(typeof p.comments?.summary?.total_count === 'number' && { comments: p.comments.summary.total_count }) },
    source: 'facebook-graph',
  };
}

const CSV = {
  postId: ['Post ID', 'id', 'postId', 'معرف المنشور'],
  postedAt: ['Publish time', 'Posted', 'created_time', 'postedAt', 'وقت النشر'],
  text: ['Description', 'Message', 'Title', 'text', 'الوصف'],
  type: ['Post type', 'Type', 'contentType'],
  metrics: {
    views: ['Views', 'Impressions', 'المشاهدات'],
    reach: ['Reach', 'الوصول'],
    likes: ['Reactions', 'Likes', 'التفاعلات'],
    comments: ['Comments', 'التعليقات'],
    shares: ['Shares', 'المشاركات'],
    linkClicks: ['Link clicks', 'نقرات الرابط'],
    averageWatchTime: ['Average seconds viewed', 'Average watch time'],
  },
};

export function fromCsvRow(row) {
  const metrics = {};
  for (const [k, aliases] of Object.entries(CSV.metrics)) metrics[k] = pickColumn(row, aliases);
  const t = pickColumn(row, CSV.type) ?? '';
  return { platform: 'facebook', postId: pickColumn(row, CSV.postId), postedAt: pickColumn(row, CSV.postedAt), contentType: /video|reel/i.test(t) ? 'reel' : /album|carousel/i.test(t) ? 'carousel' : 'post', text: pickColumn(row, CSV.text), metrics, source: 'csv' };
}

export function parseFacebook(input, { filename = '' } = {}) {
  if (typeof input === 'string' && (filename.endsWith('.csv') || !/^\s*[[{]/.test(input))) return parseCsv(input).map(fromCsvRow).filter((r) => r.postId);
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data.data ?? data.posts ?? [];
  return list.map((p) => (p.metrics && (p.postId || p.id) && !p.insights ? { platform: 'facebook', ...p, postId: p.postId ?? p.id } : fromGraphPost(p)));
}
