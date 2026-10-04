import { counterfactual } from '../core/counterfactual.js';

// Rules every platform runs that lean on the account's history when it has
// enough comparable posts: the opening length the account's best posts use,
// and patterns that beat the account baseline but this content misses.

const T = (ar, en) => ({ ar, en });
const PLATFORM = { x: T('إكس', 'X'), instagram: T('إنستغرام', 'Instagram'), facebook: T('فيسبوك', 'Facebook') };
export const range = (top) => (top.lo === top.hi ? `${top.lo}` : `${top.lo}–${top.hi}`);
const day = (iso) => (iso ? iso.slice(0, 10) : '?');

// "Your top-performing X posts open with 11–18 words (top quarter by
// replies per 1k impressions, n=12, 2026-04-01 → 2026-06-10)."
export function topLine(top, platform, verb, unit) {
  const dates = top.dateRange ? `${day(top.dateRange.from)} → ${day(top.dateRange.to)}` : '';
  return {
    ar: `أفضل ربع من منشوراتك على ${PLATFORM[platform].ar} ${verb.ar} ${range(top)} ${unit.ar} (n=${top.n} من ${top.of}${dates ? `، ${dates}` : ''}).`,
    en: `Your top-performing quarter of ${PLATFORM[platform].en} posts ${verb.en} ${range(top)} ${unit.en} (n=${top.n} of ${top.of}${dates ? `, ${dates}` : ''}).`,
  };
}

export const longOpening = {
  id: 'long_opening_sentence',
  scoreType: 'hook',
  basis: 'derived',
  types: ['post', 'caption', 'hook', 'article-summary', 'thread'],
  detect: (f, ctx) => {
    const top = ctx.history?.topRange?.('text.firstSentenceWords') ?? null;
    const target = top ? Math.max(4, Math.round(top.hi)) : ctx.config.thresholds.openingSentence.good;
    const words = f.text.firstSentenceWords;
    if (words <= target) return [];
    return [{ severity: words > ctx.config.thresholds.openingSentence.bad ? 0.7 : 0.45, params: { words, target, top, platform: ctx.platform }, evidence: [{ feature: 'text.firstSentenceWords', value: words, target, provenance: top ? 'historical' : 'derived' }] }];
  },
  edit: (f, x) => counterfactual.openingSentence(f, x.params.target),
  topic: () => 'opening-length',
  text: (p) => ({
    issue: T('الجملة الأولى طويلة', 'The opening sentence is long'),
    reason: p.top
      ? T(`الجملة الأولى ${p.words} كلمة. أفضل منشوراتك على ${PLATFORM[p.platform].ar} تفتح بـ ${range(p.top)} كلمة (n=${p.top.n}).`, `The first sentence is ${p.words} words. Your top-performing ${PLATFORM[p.platform].en} posts open with ${range(p.top)} words (n=${p.top.n}).`)
      : T(`الجملة الأولى ${p.words} كلمة؛ يصل القارئ إلى الفكرة بعد تمهيد طويل.`, `The first sentence is ${p.words} words; the reader reaches the claim only after a long setup.`),
    fix: T(`اختصر التمهيد وضع الادعاء المفاجئ أولًا في ${p.target} كلمة أو أقل.`, `Reduce the setup and place the surprising claim first, in ≤ ${p.target} words.`),
  }),
  history: (x) => (x.params.top ? { line: topLine(x.params.top, x.params.platform, T('تفتح بـ', 'open with'), T('كلمة', 'words')), confidence: x.params.top.confidence, sampleSize: x.params.top.n, dateRange: x.params.top.dateRange } : null),
  rewrite: (p) => `Rewrite the first sentence in at most ${p.target} words with the claim first.`,
};

// A pattern that beats this account's baseline, which the content misses.
export const patternGap = {
  id: 'account_pattern',
  scoreType: 'historicalFit',
  basis: 'historical',
  detect: (f, ctx) =>
    (ctx.history?.patterns ?? [])
      .filter((p) => p.effect >= ctx.config.history.minEffect && p.confidence >= 0.5 && p.appliesTo(f) && !p.matches(f))
      .slice(0, 2)
      .map((p) => ({
        key: p.id,
        severity: Math.min(0.75, 0.3 + p.effect),
        params: { pattern: p },
        topic: p.patternFeature === 'hookLength' ? 'opening-length' : null,
        evidence: [{ feature: p.feature, value: p.valueOf(f), target: p.bucketLabel.en, provenance: 'historical' }],
      })),
  edit: (f, x, ctx) => x.params.pattern.apply(f, ctx.config),
  topic: (x) => x.topic,
  text: (p) => ({
    issue: T(`نمط ناجح في حسابك غير مستخدم: ${p.pattern.label.ar}`, `A pattern that works on your account is missing: ${p.pattern.label.en}`),
    reason: T(p.pattern.statement.ar, p.pattern.statement.en),
    fix: T(p.pattern.fix.ar, p.pattern.fix.en),
  }),
  history: (x) => ({ line: x.params.pattern.statement, confidence: x.params.pattern.confidence, sampleSize: x.params.pattern.sampleSize, dateRange: x.params.pattern.dateRange }),
};
