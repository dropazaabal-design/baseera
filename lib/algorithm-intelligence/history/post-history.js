import { now } from '../../studio/util.js';
import { PLATFORMS } from '../types.js';
import { per1k } from './normalization.js';

// Published posts and their metrics. A record keeps only the metrics its
// platform reports: every metric the platform can report is present (null
// when this import did not include it), and metrics the platform does not
// have are absent. Nothing is estimated or filled in.

export const METRICS = {
  instagram: ['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'reposts', 'engagements', 'profileVisits', 'follows', 'watchTime', 'averageWatchTime', 'skipRate'],
  facebook: ['views', 'reach', 'likes', 'comments', 'shares', 'linkClicks', 'engagements', 'watchTime', 'averageWatchTime', 'negativeFeedback'],
  x: ['impressions', 'views', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks', 'profileVisits', 'linkClicks', 'engagements'],
};

// The exposure each rate is computed against, in order of preference.
export const EXPOSURE = { instagram: ['reach', 'views'], facebook: ['views', 'reach'], x: ['impressions', 'views'] };

// Outcomes the profile learns from, per platform: rates per 1,000 exposures
// (comparable across posts with different reach) and the exposure itself.
export const OUTCOMES = {
  instagram: ['sharesPer1k', 'savesPer1k', 'commentsPer1k', 'profileVisitsPer1k', 'reach'],
  facebook: ['sharesPer1k', 'commentsPer1k', 'likesPer1k', 'views'],
  x: ['repliesPer1k', 'repostsPer1k', 'profileVisitsPer1k', 'likesPer1k', 'impressions'],
};
// The single outcome used to rank posts ("top-performing") by default.
export const PRIMARY_OUTCOME = { instagram: 'sharesPer1k', facebook: 'sharesPer1k', x: 'repliesPer1k' };

export const OUTCOME_LABEL = {
  sharesPer1k: { ar: 'المشاركات لكل 1000 وصول', en: 'shares per 1k reach' },
  savesPer1k: { ar: 'الحفظ لكل 1000 وصول', en: 'saves per 1k reach' },
  commentsPer1k: { ar: 'التعليقات لكل 1000', en: 'comments per 1k' },
  likesPer1k: { ar: 'الإعجابات لكل 1000', en: 'likes per 1k' },
  repliesPer1k: { ar: 'الردود لكل 1000 ظهور', en: 'replies per 1k impressions' },
  repostsPer1k: { ar: 'إعادات النشر لكل 1000 ظهور', en: 'reposts per 1k impressions' },
  profileVisitsPer1k: { ar: 'زيارات الملف لكل 1000', en: 'profile visits per 1k' },
  reach: { ar: 'الوصول', en: 'reach' },
  views: { ar: 'المشاهدات', en: 'views' },
  impressions: { ar: 'مرات الظهور', en: 'impressions' },
};

export const CONTENT_TYPE_ALIASES = { CAROUSEL_ALBUM: 'carousel', IMAGE: 'post', VIDEO: 'reel', REELS: 'reel', FEED: 'post', photo: 'post', video: 'reel', link: 'post', status: 'post', text: 'post' };

export function exposureOf(record) {
  for (const k of EXPOSURE[record.platform] ?? []) if (typeof record.metrics?.[k] === 'number' && record.metrics[k] > 0) return { metric: k, value: record.metrics[k] };
  return null;
}

// Rates and volumes a record supports (null when an input is missing).
export function outcomesOf(record) {
  const m = record.metrics ?? {};
  const exp = exposureOf(record);
  const out = {};
  for (const o of OUTCOMES[record.platform] ?? []) {
    if (o.endsWith('Per1k')) out[o] = exp ? per1k(m[o.replace('Per1k', '')], exp.value) : null;
    else out[o] = typeof m[o] === 'number' ? m[o] : null;
  }
  return out;
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function normalizeRecord(raw, { source = 'manual' } = {}) {
  const platform = String(raw.platform ?? '').toLowerCase();
  if (!PLATFORMS.includes(platform)) throw new Error(`unknown platform "${raw.platform}" (one of ${PLATFORMS.join(', ')})`);
  const postId = String(raw.postId ?? raw.id ?? '').trim();
  if (!postId) throw new Error('a post record needs postId');
  const metrics = {};
  for (const k of METRICS[platform]) metrics[k] = num(raw.metrics?.[k] ?? raw[k]);
  const type = CONTENT_TYPE_ALIASES[raw.contentType] ?? raw.contentType ?? 'post';
  const postedAt = raw.postedAt ? new Date(raw.postedAt).toISOString() : null;
  return {
    id: `${platform}:${postId}`,
    platform,
    postId,
    postedAt,
    // The local hour as published, when the timestamp carried an offset.
    postedHour: raw.postedHour ?? (typeof raw.postedAt === 'string' && /[+-]\d{2}:?\d{2}$|Z$/.test(raw.postedAt) ? Number(raw.postedAt.match(/T(\d{2})/)?.[1]) : null),
    contentType: ['post', 'carousel', 'reel', 'thread', 'caption'].includes(type) ? type : 'post',
    designId: raw.designId ?? null,
    text: typeof raw.text === 'string' ? raw.text : typeof raw.caption === 'string' ? raw.caption : null,
    topic: raw.topic ?? null,
    permalink: raw.permalink ?? null,
    metrics,
    features: raw.features ?? null,
    source: raw.source ?? source,
    importedAt: now(),
  };
}

// A new snapshot of the same post: reported values replace older ones,
// values this import lacks keep the previous number.
export function mergeRecord(prev, next) {
  if (!prev) return next;
  const metrics = { ...prev.metrics };
  for (const [k, v] of Object.entries(next.metrics)) if (v !== null) metrics[k] = v;
  return {
    ...prev,
    ...Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== null && v !== undefined && !['metrics', 'importedAt', 'features'].includes(k))),
    features: next.features ?? prev.features,
    metrics,
    snapshots: [...(prev.snapshots ?? []), { at: prev.importedAt, metrics: prev.metrics }].slice(-10),
    importedAt: next.importedAt,
  };
}
