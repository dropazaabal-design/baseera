import { counterfactual } from '../../core/counterfactual.js';
import { patternGap, topLine } from '../common-recommendations.js';

// Instagram-only rules: slide count, and the caption that accompanies a
// carousel or reel.

const T = (ar, en) => ({ ar, en });

export const INSTAGRAM_RULES = [
  patternGap,
  {
    id: 'ig_slide_count',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['carousel'],
    detect: (f, ctx) => {
      const [, lo, hi] = ctx.config.thresholds.carousel.slides;
      const top = ctx.history?.topRange?.('carousel.slideCount') ?? null;
      if (f.carousel.slideCountFit >= 0.8 && !(top && (f.carousel.slideCount < top.lo || f.carousel.slideCount > top.hi))) return [];
      return [{ severity: 0.35, params: { n: f.carousel.slideCount, lo: top?.lo ?? lo, hi: top?.hi ?? hi, top }, evidence: [{ feature: 'carousel.slideCount', value: f.carousel.slideCount, target: `${top?.lo ?? lo}–${top?.hi ?? hi}`, provenance: top ? 'historical' : 'heuristic' }] }];
    },
    text: (p) => ({
      issue: T('عدد الشرائح خارج المدى', 'Slide count out of range'),
      reason: p.top ? T(`${p.n} شرائح؛ أفضل كاروسيلاتك ${p.lo}–${p.hi} شرائح (n=${p.top.n}).`, `${p.n} slides; your best carousels have ${p.lo}–${p.hi} (n=${p.top.n}).`) : T(`${p.n} شرائح؛ مدى بصيرة المعتاد ${p.lo}–${p.hi}.`, `${p.n} slides; Basira's usual range is ${p.lo}–${p.hi}.`),
      fix: T(`اجعلها بين ${p.lo} و${p.hi} بدمج الشرائح القصيرة أو تقسيم المزدحمة.`, `Bring it to ${p.lo}–${p.hi} by merging short slides or splitting crowded ones.`),
    }),
    history: (x) => (x.params.top ? { line: topLine(x.params.top, 'instagram', T('تضم', 'have'), T('شرائح', 'slides')), confidence: x.params.top.confidence, sampleSize: x.params.top.n, dateRange: x.params.top.dateRange } : null),
  },
  {
    id: 'ig_caption_opening',
    scoreType: 'platformFit',
    basis: 'heuristic',
    detect: (f) => (f.caption && f.caption.firstSentenceWords > 14 ? [{ severity: 0.3, params: { words: f.caption.firstSentenceWords }, evidence: [{ feature: 'caption.firstSentenceWords', value: f.caption.firstSentenceWords, target: 14, provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.captionOpening(f, 12),
    text: (p) => ({
      issue: T('بداية الوصف طويلة', 'Long caption opening'),
      reason: T(`أول جملة في الوصف ${p.words} كلمة، ويُعرض في الخلاصة سطره الأول فقط.`, `The caption's first sentence is ${p.words} words; the feed shows only its first line.`),
      fix: T('ابدأ الوصف بوعد الغلاف في 12 كلمة أو أقل.', 'Start the caption with the cover\'s promise in ≤ 12 words.'),
    }),
  },
];
