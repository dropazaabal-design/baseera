import { counterfactual } from '../../core/counterfactual.js';
import { longOpening, patternGap } from '../common-recommendations.js';

// Facebook-only rules: the first lines of a folded post, and a post that
// invites discussion without asking anything.

const T = (ar, en) => ({ ar, en });

export const FACEBOOK_RULES = [
  longOpening,
  patternGap,
  {
    id: 'fb_show_more',
    scoreType: 'retention',
    basis: 'official',
    detect: (f, ctx) => {
      const s = ctx.report.signals['facebook.show_more_potential'];
      return s && typeof s.value === 'number' && s.value < 0.5 ? [{ severity: 0.45, params: { value: s.value, chars: f.text.chars }, evidence: [{ feature: 'facebook.show_more_potential', value: s.value, target: 0.5, provenance: 'heuristic' }, { feature: 'text.chars', value: f.text.chars, provenance: 'derived' }] }] : [];
    },
    edit: (f) => counterfactual.showMoreOpening(f),
    text: (p) => ({
      issue: T('السطور الأولى لا تدفع إلى «عرض المزيد»', 'The first lines do not earn "Show more"'),
      reason: T(`منشور من ${p.chars} حرفًا يطويه فيسبوك؛ يتوقع النظام النقر على «عرض المزيد» (بطاقة نظام الخلاصة)، وسطوره الأولى ضعيفة الجذب (${p.value}).`, `A ${p.chars}-character post Facebook folds; its system card lists predicting "Show more" clicks, and the first lines pull weakly (${p.value}).`),
      fix: T('ضع الادعاء والسبب للقراءة في السطرين الأولين، واترك التفاصيل لما بعد الطي.', 'Put the claim and the reason to read in the first two lines; leave details below the fold.'),
    }),
  },
  {
    id: 'fb_no_question',
    scoreType: 'conversation',
    basis: 'heuristic',
    detect: (f, ctx) => {
      const s = ctx.report.signals['facebook.conversation_potential'];
      if (f.hook.question || f.cta.question || !s || s.value >= 0.45) return [];
      return [{ severity: 0.3, params: { value: s.value }, evidence: [{ feature: 'text.question', value: false, target: true, provenance: 'derived' }, { feature: 'facebook.conversation_potential', value: s.value, provenance: 'heuristic' }] }];
    },
    edit: (f) => counterfactual.question(f),
    text: (p) => ({
      issue: T('لا سؤال يفتح النقاش', 'Nothing opens the discussion'),
      reason: T(`قابلية النقاش ${p.value} ولا يوجد سؤال للقارئ. (تقدير قاعدي: السؤال وحده لا يضمن وصولًا أكبر.)`, `Conversation potential ${p.value} and no question to the reader. (Rule of thumb: a question alone does not guarantee reach.)`),
      fix: T('اختم بسؤال عن تجربة القارئ نفسه، لا بسؤال عام.', 'End with a question about the reader\'s own experience, not a general one.'),
    }),
  },
];
