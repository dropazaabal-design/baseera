import { normalizeArabic } from './arabic.js';
import { validateMemoryRecord } from './contracts.js';
import { FONT_IDS } from './measure.js';
import { now, randomId } from './util.js';

// Creator memory ("ذوقي وهويتي"). Facts the creator stated (accounts,
// audience, tone, pillars, goals) are kept apart from preferences, and every
// preference records its source, date, scope, confidence and whether it was
// said explicitly or inferred.
//
// Precedence when designing: the current instruction, then explicit
// preferences (the most specific scope first), then confirmed patterns.
// Behaviour is a weak signal: one colour change or one pick proves nothing.
// A pattern repeated across designs becomes a *suggestion* the creator can
// confirm; it is never applied unconfirmed, and silence is not confirmation.
// Nothing here trains a model; it is stored context that gets applied.

const PROFILE = (id) => `memory/creators/${id}.json`;
const BRAND = (id) => `brands/${id}.json`;

export const SCOPE_KEYS = ['brandId', 'platform', 'format', 'projectId'];
const PATTERN_MIN_COUNT = 3;
const PATTERN_MIN_DESIGNS = 2;

// Preference keys the studio knows how to apply.
export const PREFERENCE_KEYS = {
  'font.heading': { label: 'خط العناوين', values: FONT_IDS },
  'font.body': { label: 'خط النص', values: FONT_IDS },
  palette: { label: 'لوحة الألوان' },
  'color.accent': { label: 'لون التمييز' },
  'color.bg': { label: 'لون الخلفية' },
  'text.density': { label: 'كثافة النص', values: ['short', 'medium', 'dense'] },
  'text.size': { label: 'حجم الخط', values: ['larger', 'default', 'smaller'] },
  'text.tone': { label: 'نبرة الكتابة' },
  numerals: { label: 'الأرقام', values: ['arab', 'latn'] },
  format: { label: 'المقاس', values: ['portrait', 'square', 'story'] },
  'art.style': { label: 'أسلوب الرسوم' },
  'art.amount': { label: 'كمية الرسوم', values: ['none', 'light', 'rich'] },
  avoid: { label: 'تجنّب' },
};

const emptyProfile = (id) => ({
  id,
  name: '',
  createdAt: now(),
  updatedAt: now(),
  revision: 1,
  facts: { accounts: [], platforms: [], audience: '', language: 'ar', dialect: '', tone: '', pillars: [], goals: [] },
  brands: [],
  preferences: [],
  signals: [],
  results: [],
});

const sameScope = (a = {}, b = {}) => SCOPE_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
const specificity = (scope = {}) => SCOPE_KEYS.filter((k) => scope[k]).length;
// A record applies when every key it is scoped to equals the context's.
export const scopeApplies = (scope = {}, ctx = {}) => SCOPE_KEYS.every((k) => !scope[k] || scope[k] === ctx[k]);

export class Memory {
  constructor(store) {
    this.store = store;
  }

  profile(creatorId = 'default') {
    return this.store.readJson(PROFILE(creatorId)) ?? emptyProfile(creatorId);
  }

  save(profile) {
    profile.updatedAt = now();
    profile.revision = (profile.revision ?? 0) + 1;
    this.store.writeJson(PROFILE(profile.id), profile);
    return profile;
  }

  setFact(creatorId, key, value) {
    const p = this.profile(creatorId);
    if (!(key in p.facts) && key !== 'name') throw new Error(`unknown fact "${key}" (known: name, ${Object.keys(p.facts).join(', ')})`);
    if (key === 'name') p.name = value;
    else p.facts[key] = value;
    return this.save(p);
  }

  // An explicit preference the creator stated. Replaces the same key in the
  // same scope; a narrower scope is a separate record.
  remember(creatorId, { key, value, preference, scope = {}, evidence = '', source = 'chat' }) {
    if (!PREFERENCE_KEYS[key]) throw new Error(`unknown preference key "${key}" (known: ${Object.keys(PREFERENCE_KEYS).join(', ')})`);
    const allowed = PREFERENCE_KEYS[key].values;
    if (allowed && !allowed.includes(value)) throw new Error(`"${value}" is not a valid ${key} (allowed: ${allowed.join(', ')})`);
    const p = this.profile(creatorId);
    const record = {
      id: randomId('m_', 10),
      creatorId,
      scope: Object.fromEntries(SCOPE_KEYS.filter((k) => scope[k]).map((k) => [k, scope[k]])),
      key,
      value,
      preference: preference ?? `${PREFERENCE_KEYS[key].label}: ${value}`,
      evidence,
      source,
      origin: 'explicit_feedback',
      confirmed: true,
      confidence: 0.95,
      updatedAt: now(),
    };
    const problems = validateMemoryRecord(record);
    if (problems.length) throw new Error(problems.map((x) => `${x.path} ${x.message}`).join('; '));
    p.preferences = [...p.preferences.filter((r) => !(r.key === key && sameScope(r.scope, record.scope))), record];
    this.save(p);
    return record;
  }

  forget(creatorId, recordId) {
    const p = this.profile(creatorId);
    const before = p.preferences.length;
    p.preferences = p.preferences.filter((r) => r.id !== recordId);
    p.signals = p.signals.filter((s) => s.recordId !== recordId);
    if (p.preferences.length === before) return false;
    this.save(p);
    return true;
  }

  // A weak behavioural signal: "picked palette X for design D". Kept, but
  // only promoted to a suggestion when it repeats across several designs.
  observe(creatorId, { key, value, scope = {}, designId, evidence = '' }) {
    if (!PREFERENCE_KEYS[key]) throw new Error(`unknown preference key "${key}"`);
    const p = this.profile(creatorId);
    const cleanScope = Object.fromEntries(SCOPE_KEYS.filter((k) => scope[k]).map((k) => [k, scope[k]]));
    p.signals = [...p.signals, { key, value, scope: cleanScope, designId: designId ?? null, evidence, at: now() }].slice(-500);
    const same = p.signals.filter((s) => s.key === key && s.value === value && sameScope(s.scope, cleanScope));
    const designs = new Set(same.map((s) => s.designId).filter(Boolean));
    const explicit = p.preferences.find((r) => r.origin === 'explicit_feedback' && r.key === key && sameScope(r.scope, cleanScope));
    let suggestion = null;
    if (!explicit && same.length >= PATTERN_MIN_COUNT && designs.size >= PATTERN_MIN_DESIGNS) {
      const existing = p.preferences.find((r) => r.origin === 'observed_pattern' && r.key === key && r.value === value && sameScope(r.scope, cleanScope));
      const confidence = Math.min(0.6, 0.15 * same.length);
      if (existing) Object.assign(existing, { confidence: existing.confirmed ? existing.confidence : confidence, evidence: `${same.length} مرات في ${designs.size} تصاميم`, updatedAt: now() });
      else {
        suggestion = {
          id: randomId('m_', 10),
          creatorId,
          scope: cleanScope,
          key,
          value,
          preference: `${PREFERENCE_KEYS[key].label}: ${value}`,
          evidence: `${same.length} مرات في ${designs.size} تصاميم`,
          source: 'behaviour',
          origin: 'observed_pattern',
          confirmed: false,
          confidence,
          updatedAt: now(),
        };
        p.preferences.push(suggestion);
      }
    }
    this.save(p);
    return { signals: same.length, designs: designs.size, suggestion };
  }

  suggestions(creatorId) {
    return this.profile(creatorId).preferences.filter((r) => r.origin === 'observed_pattern' && !r.confirmed);
  }

  confirm(creatorId, recordId) {
    const p = this.profile(creatorId);
    const r = p.preferences.find((x) => x.id === recordId);
    if (!r) throw new Error(`no preference ${recordId}`);
    r.confirmed = true;
    r.confidence = Math.max(r.confidence, 0.8);
    r.updatedAt = now();
    this.save(p);
    return r;
  }

  // Preferences that apply to a design context, resolved by precedence.
  // `instructions` are what the current request says ({ key: value }).
  resolve(creatorId, context = {}, instructions = {}) {
    const p = this.profile(creatorId);
    const applied = {};
    for (const [key, value] of Object.entries(instructions)) {
      if (value !== undefined && value !== null) applied[key] = { value, source: 'instruction' };
    }
    const candidates = p.preferences
      .filter((r) => scopeApplies(r.scope, context) && (r.origin === 'explicit_feedback' || r.confirmed))
      .sort((a, b) => {
        const rank = (r) => (r.origin === 'explicit_feedback' ? 2 : 1);
        return rank(b) - rank(a) || specificity(b.scope) - specificity(a.scope) || (b.updatedAt > a.updatedAt ? 1 : -1);
      });
    for (const r of candidates) {
      if (applied[r.key]) continue;
      applied[r.key] = { value: r.value, source: r.origin === 'explicit_feedback' ? 'explicit' : 'pattern', recordId: r.id, scope: r.scope };
    }
    const suggestions = p.preferences.filter((r) => r.origin === 'observed_pattern' && !r.confirmed && scopeApplies(r.scope, context));
    return { applied, suggestions, summary: this.summary(p, applied, context) };
  }

  // A few lines for the assistant's context: only what applies here.
  summary(p, applied, context) {
    const lines = [];
    const account = p.facts.accounts.find((a) => !context.brandId || a.brandId === context.brandId);
    if (account) lines.push(`الحساب: ${account.handle} على ${account.platform}`);
    if (p.facts.audience) lines.push(`الجمهور: ${p.facts.audience}`);
    if (p.facts.tone) lines.push(`النبرة: ${p.facts.tone}`);
    if (p.facts.pillars.length) lines.push(`المحاور: ${p.facts.pillars.slice(0, 5).join('، ')}`);
    for (const [key, a] of Object.entries(applied)) {
      lines.push(`${PREFERENCE_KEYS[key]?.label ?? key}: ${a.value} (${a.source === 'instruction' ? 'الطلب الحالي' : a.source === 'explicit' ? 'تفضيل صريح' : 'نمط مؤكَّد'})`);
    }
    return lines.join('\n').slice(0, 900);
  }

  // Optional post results the creator imports (CSV/JSON rows with a design
  // id). Stored as given; never invented, and too few rows say nothing.
  importResults(creatorId, rows) {
    const p = this.profile(creatorId);
    const clean = rows
      .filter((r) => r && typeof r.designId === 'string')
      .map((r) => ({
        designId: r.designId,
        platform: r.platform ?? null,
        postedAt: r.postedAt ?? null,
        metrics: Object.fromEntries(Object.entries(r.metrics ?? r).filter(([k, v]) => typeof v === 'number' && Number.isFinite(v) && !['designId'].includes(k))),
        importedAt: now(),
      }));
    p.results = [...p.results, ...clean];
    this.save(p);
    return clean.length;
  }

  resultsSummary(creatorId, { minRows = 5 } = {}) {
    const rows = this.profile(creatorId).results;
    if (rows.length < minRows) return { enough: false, rows: rows.length, note: `${rows.length} نتائج فقط: لا تكفي لاستنتاج اتجاه.` };
    return { enough: true, rows: rows.length };
  }

  // Brand kits (هويات): more than colours.
  brand(id) {
    return this.store.readJson(BRAND(id));
  }

  brands(creatorId) {
    return this.profile(creatorId).brands.map((id) => this.brand(id)).filter(Boolean);
  }

  saveBrand(creatorId, brand) {
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(brand.id ?? '')) throw new Error('brand id: lowercase letters, digits, - or _');
    for (const c of brand.colors ?? []) if (!/^#[0-9A-Fa-f]{6}$/.test(c.hex)) throw new Error(`brand colour ${c.hex} is not #RRGGBB`);
    const prev = this.brand(brand.id);
    const next = { ...prev, ...brand, creatorId, version: (prev?.version ?? 0) + 1, updatedAt: now() };
    this.store.writeJson(BRAND(brand.id), next);
    const p = this.profile(creatorId);
    if (!p.brands.includes(brand.id)) {
      p.brands.push(brand.id);
      this.save(p);
    }
    return next;
  }

  linkApproved(brandId, designId) {
    const b = this.brand(brandId);
    if (!b) throw new Error(`no brand ${brandId}`);
    b.approvedExamples = [...new Set([...(b.approvedExamples ?? []), designId])];
    b.updatedAt = now();
    this.store.writeJson(BRAND(brandId), b);
    return b;
  }
}

// Optional preset: «كتاب وبس». A blue editorial direction for a reading
// account; installed only when asked for, and fully editable.
export const KITABWBS_PRESET = {
  id: 'kitabwbs',
  name: 'كتاب وبس',
  handle: '@kitabwbs',
  accounts: [{ platform: 'instagram', handle: '@kitabwbs' }],
  // From the creator's identity brief (2026-10-02): primary blue, white
  // background as the main direction, red and green only as functional
  // colours (never combined automatically), no yellow or orange. The navy is
  // derived from the blue for dark pages when a style alternates.
  colors: [
    { hex: '#2E7BC5', role: 'accent', name: 'الأزرق الأساسي' },
    { hex: '#FFFFFF', role: 'bg', name: 'أبيض' },
    { hex: '#0E2A5C', role: 'dark', name: 'أزرق ليلي (مشتق للصفحات الداكنة)' },
    { hex: '#E63946', role: 'negative', name: 'أحمر وظيفي' },
    { hex: '#10B981', role: 'positive', name: 'أخضر وظيفي' },
  ],
  fonts: { heading: 'cairo', body: 'tajawal', fallbacks: ['almarai'], allowed: ['cairo', 'tajawal'] },
  numerals: 'latn',
  imagery: { style: 'كولاج تحريري أزرق: كتب وصفحات ونظارات قراءة وأقلام، أشكال مسطحة بلا نصوص', notes: 'بلا وجوه أو صور بشرية' },
  voice: { tone: 'ودودة ومشجّعة على القراءة', dialect: 'فصحى مبسطة', titles: 'عناوين قوية قصيرة، ومتن واضح بلا ازدحام' },
  density: 'medium',
  // Identity rules checked by the quality gate (lib/studio/brandRules.js).
  constraints: ['no-yellow', 'no-orange', 'no-faces', 'no-latin-words', 'western-digits', 'fonts-only'],
  allowedLatin: ['@kitabwbs'],
  approvedExamples: [],
};

// ---------------------------------------------------------------------------
// Feedback in the creator's words → structured aspects. Rule-based for the
// common phrasings; the assistant passes structured feedback for the rest.

const ASPECTS = [
  { aspect: 'graphics', words: ['الجرافيك', 'الرسم', 'الرسوم', 'الرسمه', 'الصور', 'الصوره', 'الكولاج', 'الايقونات'] },
  { aspect: 'text.size', words: ['الخط', 'النص', 'الكلام', 'الكتابه'], qualifiers: { negative: ['صغير', 'صغيره', 'ما ينقرا', 'لا يقرا', 'غير واضح'], positive: ['واضح', 'مقروء'] } },
  { aspect: 'colors', words: ['الالوان', 'اللون', 'الخلفيه'] },
  { aspect: 'layout', words: ['التوزيع', 'الترتيب', 'التصميم', 'التكوين', 'المسافات'] },
  { aspect: 'style', words: ['الاسلوب', 'الستايل', 'الطابع'] },
  { aspect: 'copy', words: ['الصياغه', 'العنوان', 'الكلمات', 'المحتوى'] },
];
const POSITIVE = ['احب', 'حبيت', 'جميل', 'رائع', 'ممتاز', 'حلو', 'عجبني', 'اعجبني', 'مناسب', 'يعجبني', 'تمام', 'زين'];
const NEGATIVE = ['لا يناسب', 'ما يناسب', 'لا احب', 'ما حبيت', 'سيء', 'مزدحم', 'صغير', 'ضعيف', 'لا يعجبني', 'ما عجبني', 'غير مناسب', 'كبير جدا', 'باهت'];
const APPROVE = ['اعتمد', 'معتمد', 'وافقت', 'انشره', 'نشرته', 'هذا النهائي', 'ممتاز اعتمده'];

export function parseFeedback(text) {
  const norm = normalizeArabic(text);
  // Split on "لكن/بس/ولكن" so "I like the graphics but the font is small"
  // yields one positive and one negative aspect.
  const clauses = norm.split(/\s(?:لكن|ولكن|بس|الا ان|غير ان)\s/);
  const aspects = [];
  for (const clause of clauses) {
    const neg = NEGATIVE.some((w) => clause.includes(normalizeArabic(w)));
    const pos = !neg && POSITIVE.some((w) => clause.includes(normalizeArabic(w)));
    for (const a of ASPECTS) {
      if (!a.words.some((w) => clause.includes(w))) continue;
      let sentiment = neg ? -1 : pos ? 1 : 0;
      if (a.qualifiers?.negative.some((w) => clause.includes(normalizeArabic(w)))) sentiment = -1;
      const fix = a.aspect === 'text.size' && sentiment < 0 ? (clause.includes('كبير') ? 'decrease' : 'increase') : null;
      aspects.push({ aspect: a.aspect, sentiment, ...(fix && { fix }) });
    }
  }
  const approved = APPROVE.some((w) => norm.includes(normalizeArabic(w)));
  // "لا يناسب هذا الموضوع" → the rejection is about this topic only.
  const topicScoped = /(هذا|هالموضوع|الموضوع)/.test(norm) && NEGATIVE.some((w) => norm.includes(normalizeArabic(w)));
  const general = /(دائما|دايم|كل التصاميم|في كل|ابدا|لا تستخدم)/.test(norm);
  return {
    aspects,
    verdict: approved ? 'approved' : aspects.some((a) => a.sentiment < 0) ? (aspects.some((a) => a.sentiment > 0) ? 'mixed' : 'dislike') : aspects.some((a) => a.sentiment > 0) ? 'like' : 'note',
    scope: general ? 'general' : topicScoped ? 'topic' : 'design',
  };
}
