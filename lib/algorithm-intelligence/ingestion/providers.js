import { parseFacebook } from './facebook-insights.js';
import { parseInstagram } from './instagram-insights.js';
import { parseX } from './x-metrics.js';

// Where post metrics come from. The engine never needs a provider: it
// scores content without any account, and history can always be imported
// from a file. Providers are for the CLI or a server, never the browser:
// they read credentials from the environment (see .env.example), keep them
// out of logs, results and errors, and fail with a plain message when the
// credentials are missing.
//
//   MetricsProvider { id, platform, available(), fetchPosts(opts) → raw rows }
//
//   LocalImportProvider   JSON or CSV text (API responses or exports)
//   InstagramProvider     Instagram Graph API (media + media insights)
//   FacebookProvider      Facebook Pages API (posts + post insights)
//   XProvider             X API v2 (user posts with metrics)

export const PARSERS = { instagram: parseInstagram, facebook: parseFacebook, x: parseX };

const env = (name) => (typeof process !== 'undefined' ? process.env?.[name] : undefined) || null;

// Removes credentials from any text before it is shown or stored.
export function redact(text, secrets) {
  let out = String(text ?? '');
  for (const s of secrets.filter((x) => x && x.length >= 6)) out = out.split(s).join('[redacted]');
  return out.replace(/(access_token|bearer|token)=([^&\s"]+)/gi, '$1=[redacted]');
}

export class LocalImportProvider {
  constructor(platform, text, { filename = '' } = {}) {
    if (!PARSERS[platform]) throw new Error(`unknown platform "${platform}"`);
    this.id = 'local-import';
    this.platform = platform;
    this.text = text;
    this.filename = filename;
  }

  available() {
    return true;
  }

  async fetchPosts() {
    return PARSERS[this.platform](this.text, { filename: this.filename });
  }
}

class HttpProvider {
  constructor({ fetch: f = globalThis.fetch, secrets = [] } = {}) {
    this.id = 'http';
    this.platform = null;
    this.required = [];
    this.fetch = f;
    this.secrets = secrets;
  }

  available() {
    return false;
  }

  async get(url, headers = {}) {
    let res;
    try {
      res = await this.fetch(url, { headers });
    } catch (err) {
      throw new Error(`${this.id}: network error: ${redact(err.message, this.secrets)}`);
    }
    const body = await res.text();
    if (!res.ok) throw new Error(`${this.id}: HTTP ${res.status}: ${redact(body.slice(0, 300), this.secrets)}`);
    return JSON.parse(body);
  }

  requireCredentials() {
    if (!this.available()) throw new Error(`${this.id}: credentials missing (${this.required.join(', ')}); import a file instead: studio analytics import ${this.platform} FILE`);
  }
}

export class InstagramProvider extends HttpProvider {
  constructor({ token = env('INSTAGRAM_ACCESS_TOKEN'), userId = env('INSTAGRAM_USER_ID'), apiVersion = env('META_GRAPH_VERSION') ?? 'v25.0', baseUrl = env('INSTAGRAM_GRAPH_BASE') ?? 'https://graph.facebook.com', ...rest } = {}) {
    super({ ...rest, secrets: [token] });
    Object.assign(this, { id: 'instagram-graph', platform: 'instagram', token, userId, apiVersion, baseUrl, required: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_USER_ID'] });
  }

  available() {
    return Boolean(this.token && this.userId);
  }

  async fetchPosts({ limit = 50 } = {}) {
    this.requireCredentials();
    const base = `${this.baseUrl}/${this.apiVersion}`;
    const auth = { Authorization: `Bearer ${this.token}` };
    const media = await this.get(`${base}/${this.userId}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=${Math.min(100, limit)}`, auth);
    const out = [];
    for (const m of media.data ?? []) {
      const reel = m.media_product_type === 'REELS';
      const metrics = reel ? 'reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time' : 'reach,views,likes,comments,saved,shares,total_interactions,profile_visits,follows';
      try {
        m.insights = await this.get(`${base}/${m.id}/insights?metric=${metrics}`, auth);
      } catch (err) {
        m.insights = { data: [] };
        m.insightsError = err.message;
      }
      out.push(m);
    }
    return parseInstagram(out);
  }
}

export class FacebookProvider extends HttpProvider {
  constructor({ token = env('FACEBOOK_PAGE_ACCESS_TOKEN'), pageId = env('FACEBOOK_PAGE_ID'), apiVersion = env('META_GRAPH_VERSION') ?? 'v25.0', baseUrl = 'https://graph.facebook.com', ...rest } = {}) {
    super({ ...rest, secrets: [token] });
    Object.assign(this, { id: 'facebook-graph', platform: 'facebook', token, pageId, apiVersion, baseUrl, required: ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'] });
  }

  available() {
    return Boolean(this.token && this.pageId);
  }

  async fetchPosts({ limit = 50 } = {}) {
    this.requireCredentials();
    const base = `${this.baseUrl}/${this.apiVersion}`;
    const auth = { Authorization: `Bearer ${this.token}` };
    const fields = 'id,message,created_time,permalink_url,status_type,shares,comments.summary(true).limit(0),attachments{media_type,subattachments.limit(20)}';
    const posts = await this.get(`${base}/${this.pageId}/posts?fields=${encodeURIComponent(fields)}&limit=${Math.min(100, limit)}`, auth);
    for (const p of posts.data ?? []) {
      try {
        p.insights = await this.get(`${base}/${p.id}/insights?metric=post_media_view,post_total_media_view_unique,post_reactions_by_type_total,post_clicks_by_type,post_video_avg_time_watched`, auth);
      } catch (err) {
        p.insights = { data: [] };
        p.insightsError = err.message;
      }
    }
    return parseFacebook(posts.data ?? []);
  }
}

export class XProvider extends HttpProvider {
  // A user-context token (OAuth 2.0) unlocks non_public and organic metrics
  // for the account's own posts from the last 30 days; an app bearer token
  // reads public metrics only.
  constructor({ userToken = env('X_USER_ACCESS_TOKEN'), bearer = env('X_BEARER_TOKEN'), userId = env('X_USER_ID'), baseUrl = 'https://api.x.com', ...rest } = {}) {
    super({ ...rest, secrets: [userToken, bearer] });
    Object.assign(this, { id: 'x-api', platform: 'x', userToken, bearer, userId, baseUrl, required: ['X_USER_ID', 'X_USER_ACCESS_TOKEN or X_BEARER_TOKEN'] });
  }

  available() {
    return Boolean(this.userId && (this.userToken || this.bearer));
  }

  async fetchPosts({ limit = 100 } = {}) {
    this.requireCredentials();
    const fields = this.userToken ? 'created_at,conversation_id,public_metrics,non_public_metrics,organic_metrics,note_tweet' : 'created_at,conversation_id,public_metrics,note_tweet';
    const data = await this.get(`${this.baseUrl}/2/users/${this.userId}/tweets?max_results=${Math.min(100, Math.max(5, limit))}&tweet.fields=${fields}`, { Authorization: `Bearer ${this.userToken ?? this.bearer}` });
    return parseX(data);
  }
}

export function providerFor(platform, opts = {}) {
  if (platform === 'instagram') return new InstagramProvider(opts);
  if (platform === 'facebook') return new FacebookProvider(opts);
  if (platform === 'x') return new XProvider(opts);
  throw new Error(`unknown platform "${platform}"`);
}
