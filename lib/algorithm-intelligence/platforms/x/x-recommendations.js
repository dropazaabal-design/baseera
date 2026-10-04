import { counterfactual } from '../../core/counterfactual.js';
import { longOpening, patternGap } from '../common-recommendations.js';

// X-only rules: the post limit, the text that carries a visual post, and a
// thread's first post.

const T = (ar, en) => ({ ar, en });

export const X_RULES = [
  longOpening,
  patternGap,
  {
    id: 'x_over_limit',
    scoreType: 'platformFit',
    basis: 'official',
    detect: (f, ctx) => {
      const len = f.type === 'carousel' || f.type === 'reel' ? f.caption?.xLength : f.thread ? null : f.text.xLength;
      const max = ctx.config.thresholds.x.maxLength;
      return typeof len === 'number' && len > max ? [{ severity: 0.85, params: { len, max }, evidence: [{ feature: 'text.xLength', value: len, target: max, provenance: 'official' }] }] : [];
    },
    edit: (f, x) => counterfactual.xLength(f, x.params.max),
    text: (p) => ({
      issue: T('أطول من حد إكس', 'Longer than X allows'),
      reason: T(`${p.len} حرفًا والحد ${p.max} دون اشتراك.`, `${p.len} characters; the limit without a subscription is ${p.max}.`),
      fix: T(`احذف ${p.len - p.max} حرفًا أو حوّله إلى سلسلة تبدأ بأقوى سطر.`, `Cut ${p.len - p.max} characters, or turn it into a thread that opens with the strongest line.`),
    }),
  },
  {
    id: 'x_visual_text_missing',
    scoreType: 'hook',
    basis: 'derived',
    types: ['carousel', 'reel'],
    detect: (f) => (f.caption ? [] : [{ severity: 0.5, params: {}, evidence: [{ feature: 'caption', value: null, target: 'text', provenance: 'derived' }] }]),
    text: () => ({
      issue: T('لا نص مرافق على إكس', 'No post text for X'),
      reason: T('على إكس تُعرض الشرائح أو الفيديو كوسائط، والنص المرافق هو ما يقرؤه المستخدم أولًا.', 'On X, slides or video are media; the accompanying text is what people read first.'),
      fix: T('اكتب نصًا مرافقًا يحمل وعد الغلاف في جملة قصيرة.', 'Write post text that carries the cover\'s promise in one short sentence.'),
    }),
  },
  {
    id: 'x_thread_opener',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['thread'],
    detect: (f) => (f.thread.firstPostEndsOpen ? [] : [{ severity: 0.45, params: { posts: f.thread.posts }, evidence: [{ feature: 'thread.firstPostEndsOpen', value: false, target: true, provenance: 'derived' }] }]),
    text: (p) => ({
      issue: T('التغريدة الأولى لا تفتح السلسلة', 'The first post does not open the thread'),
      reason: T(`سلسلة من ${p.posts} تغريدات وأولها لا يعد بما يليه (لا رقم ولا سؤال ولا نقطتان).`, `A ${p.posts}-post thread whose first post does not promise what follows (no number, question or colon).`),
      fix: T('اختم التغريدة الأولى بما سيجده القارئ في البقية، أو ابدأها بعدد البنود.', 'End the first post with what the rest delivers, or open it with the number of items.'),
    }),
  },
];
