import { parseCsv, pickColumn } from './csv.js';

// X post metrics → post records. Accepts X API v2 tweet objects (or a
// response { data: [...] }) with public_metrics, non_public_metrics and
// organic_metrics — the non-public and organic groups exist only for the
// account's own posts from the last 30 days, with user-context auth — plus
// X analytics CSV exports (old "Tweet …" and newer "Post …" headers) and
// rows in Basira's shape.

export function fromApiTweet(t) {
  const pub = t.public_metrics ?? {};
  const np = t.non_public_metrics ?? {};
  const org = t.organic_metrics ?? {};
  const first = (...xs) => xs.find((x) => typeof x === 'number') ?? null;
  return {
    platform: 'x',
    postId: t.id,
    postedAt: t.created_at ?? null,
    contentType: t.conversation_id && t.conversation_id !== t.id ? 'thread' : 'post',
    text: t.note_tweet?.text ?? t.text ?? null,
    metrics: {
      impressions: first(np.impression_count, org.impression_count, pub.impression_count),
      likes: first(org.like_count, pub.like_count),
      replies: first(org.reply_count, pub.reply_count),
      reposts: first(org.retweet_count, pub.retweet_count),
      quotes: first(pub.quote_count),
      bookmarks: first(pub.bookmark_count),
      profileVisits: first(np.user_profile_clicks, org.user_profile_clicks),
      linkClicks: first(np.url_link_clicks, org.url_link_clicks),
      engagements: first(np.engagements),
    },
    source: 'x-api',
  };
}

const CSV = {
  postId: ['Tweet id', 'Post id', 'id', 'postId'],
  postedAt: ['time', 'Date', 'Created at', 'postedAt'],
  text: ['Tweet text', 'Post text', 'text'],
  metrics: {
    impressions: ['impressions', 'Impressions'],
    likes: ['likes', 'Likes'],
    replies: ['replies', 'Replies'],
    reposts: ['retweets', 'Reposts', 'Retweets'],
    quotes: ['Quotes'],
    bookmarks: ['Bookmarks'],
    profileVisits: ['user profile clicks', 'Profile visits'],
    linkClicks: ['url clicks', 'URL clicks', 'Link clicks'],
    engagements: ['engagements', 'Engagements'],
  },
};

export function fromCsvRow(row) {
  const metrics = {};
  for (const [k, aliases] of Object.entries(CSV.metrics)) metrics[k] = pickColumn(row, aliases);
  return { platform: 'x', postId: pickColumn(row, CSV.postId), postedAt: pickColumn(row, CSV.postedAt), contentType: 'post', text: pickColumn(row, CSV.text), metrics, source: 'csv' };
}

export function parseX(input, { filename = '' } = {}) {
  if (typeof input === 'string' && (filename.endsWith('.csv') || !/^\s*[[{]/.test(input))) return parseCsv(input).map(fromCsvRow).filter((r) => r.postId);
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(data) ? data : data.data ?? data.posts ?? [];
  return list.map((t) => (t.metrics && (t.postId || t.id) && !t.public_metrics ? { platform: 'x', ...t, postId: t.postId ?? t.id } : fromApiTweet(t)));
}
