import { HOOK_MIX } from './feature-extractor.js';
import { counterfactual, effectOf } from './counterfactual.js';
import { round } from './normalization.js';

// Recommendations come only from measured weaknesses. A rule fires when a
// feature crosses a threshold; it carries the evidence (feature, value,
// target), the fix, and the expected effect computed by re-scoring the
// content with that one feature fixed. Account history, when it has enough
// comparable posts, adds a line such as "your top posts open with 11–18
// words". Rules never rewrite the content themselves: when wording needs
// to change, `rewrite` describes the change for the assistant (the AI
// layer) to draft on request.

const T = (ar, en) => ({ ar, en });
const pick = (msg, lang) => (typeof msg === 'string' ? msg : msg[lang] ?? msg.en);

const PART_LABEL = {
  lengthFit: T('الطول', 'length'),
  curiosity: T('الفضول', 'curiosity'),
  specificity: T('التحديد', 'specificity'),
  directAddress: T('مخاطبة القارئ', 'direct address'),
  tension: T('ما على المحك', 'stakes'),
  clarity: T('الوضوح', 'clarity'),
};

const HOOK_FIX = {
  lengthFit: (f) =>
    f.hook.words > 12
      ? T(`اختصر الافتتاحية إلى 12 كلمة أو أقل (الآن ${f.hook.words}): ضع النتيجة أولًا واحذف التمهيد.`, `Cut the opening to ≤ 12 words (now ${f.hook.words}): lead with the consequence and drop the setup.`)
      : T(`الافتتاحية ${f.hook.words} كلمات فقط: أضف ما على المحك (النتيجة أو الرقم).`, `The opening has only ${f.hook.words} words: add what is at stake (the consequence or the number).`),
  curiosity: () => T('لا يوجد سؤال ولا فجوة فضول في الافتتاحية: اذكر النتيجة واترك السبب للشرائح التالية.', 'No question or curiosity gap in the opening: state the consequence and hold back the reason for the next slides.'),
  specificity: () => T('الافتتاحية بلا رقم أو تفصيل محدد: ضع الرقم أو المدة أو المثال في السطر الأول.', 'The opening has no number or concrete detail: put the number, duration or example in the first line.'),
  directAddress: () => T('الافتتاحية لا تخاطب القارئ: اجعل الضمير له («دماغك»، «يومك»).', 'The opening does not address the reader: make it theirs («دماغك», «يومك»).'),
  tension: () => T('لا يظهر ما على المحك: أضف تحذيرًا أو مقابلة بين حالين.', 'Nothing is at stake yet: add a warning or a contrast between two states.'),
  clarity: () => T('كلمات طويلة كثيرة في الافتتاحية: استبدلها بأقصر منها.', 'Many long words in the opening: use shorter ones.'),
};

export const SHARED_RULES = [
  {
    id: 'slide_overloaded',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['carousel'],
    detect: (f) =>
      f.carousel.slides
        // Dense slides only when the cut is worth making (3+ words).
        .filter((s) => s.warning === 'too_dense' || (s.warning === 'dense' && s.recommendedWordReduction >= 3))
        .map((s) => ({
          key: `slide-${s.slide}`,
          severity: s.warning === 'too_dense' ? 0.8 : 0.4,
          params: { slide: s.slide, words: s.words, target: s.targetWords, reduce: s.recommendedWordReduction, densityScore: s.densityScore, role: s.role },
          evidence: [{ feature: `carousel.slides[${s.slide}].words`, value: s.words, target: s.targetWords, provenance: 'derived' }],
        })),
    edit: (f, x, ctx) => counterfactual.slideWords(f, x.params.slide, x.params.target, ctx.config),
    text: (p) => ({
      issue: T(`الشريحة ${p.slide} مزدحمة`, `Slide ${p.slide} is overloaded`),
      reason: T(`${p.words} كلمة؛ الشريحة تُقرأ براحة على الهاتف حتى ${p.target} كلمة (كثافة ${p.densityScore}).`, `${p.words} words; this slide reads comfortably on a phone up to ${p.target} (density ${p.densityScore}).`),
      fix: T(`اختصر الشريحة ${p.slide} من ${p.words} إلى ${p.target} كلمة أو أقل (احذف ${p.reduce})، أو قسّمها على شريحتين.`, `Reduce slide ${p.slide} from ${p.words} words to ≤ ${p.target} (−${p.reduce}), or split it into two slides.`),
    }),
    rewrite: (p) => `Shorten slide ${p.slide} to at most ${p.target} words without losing its point.`,
  },
  {
    id: 'empty_slide',
    scoreType: 'retention',
    basis: 'derived',
    types: ['carousel'],
    detect: (f) => f.carousel.empty.map((n) => ({ key: `slide-${n}`, severity: 0.9, params: { slide: n }, evidence: [{ feature: `carousel.slides[${n}].words`, value: 0, target: '> 0', provenance: 'derived' }] })),
    edit: (f, x, ctx) => counterfactual.removeSlide(f, x.params.slide, ctx.config),
    text: (p) => ({ issue: T(`الشريحة ${p.slide} فارغة`, `Slide ${p.slide} is empty`), reason: T('لا نص فيها ولا صورة.', 'It has no text and no image.'), fix: T(`احذف الشريحة ${p.slide} أو ضع فيها فكرة واحدة.`, `Remove slide ${p.slide} or give it one idea.`) }),
  },
  {
    id: 'weak_opening',
    scoreType: 'hook',
    basis: 'heuristic',
    detect: (f) => {
      if (f.hook.strength >= 0.55) return [];
      const weakest = Object.entries(HOOK_MIX)
        .map(([k, w]) => [k, w * (1 - f.hook.parts[k])])
        .filter(([, gap]) => gap >= 0.05)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k);
      if (!weakest.length) return [];
      return [
        {
          key: f.type === 'carousel' ? 'cover' : 'opening',
          severity: 0.6 + (0.55 - f.hook.strength),
          params: { parts: weakest, strength: f.hook.strength, cover: f.type === 'carousel' },
          evidence: weakest.map((k) => ({ feature: `hook.parts.${k}`, value: f.hook.parts[k], target: 0.8, provenance: 'heuristic' })),
        },
      ];
    },
    edit: (f, x) => counterfactual.hookParts(f, Object.fromEntries(x.params.parts.map((k) => [k, 0.8]))),
    topic: (x) => (x.params.parts.includes('lengthFit') ? 'opening-length' : null),
    text: (p, f, lang) => ({
      issue: p.cover ? T('غلاف ضعيف الجذب', 'Weak cover hook') : T('افتتاحية ضعيفة', 'Weak opening'),
      reason: T(`قوة الافتتاحية ${p.strength} من 1؛ أضعف أجزائها: ${p.parts.map((k) => PART_LABEL[k].ar).join('، ')}.`, `Opening strength ${p.strength}/1; weakest parts: ${p.parts.map((k) => PART_LABEL[k].en).join(', ')}.`),
      fix: { ar: p.parts.map((k) => HOOK_FIX[k](f).ar).join(' '), en: p.parts.map((k) => HOOK_FIX[k](f).en).join(' ') },
    }),
    rewrite: (p) => `Rewrite the opening: improve ${p.parts.map((k) => PART_LABEL[k].en).join(' and ')}; keep it under 12 words and keep the meaning.`,
  },
  {
    id: 'generic_cta',
    scoreType: 'conversation',
    basis: 'heuristic',
    detect: (f) => (f.cta.present && f.cta.generic ? [{ severity: 0.5, params: { text: f.cta.text, count: f.carousel?.promise?.count ?? null }, evidence: [{ feature: 'cta.generic', value: true, target: false, provenance: 'heuristic' }] }] : []),
    edit: (f, x, ctx) => counterfactual.specificCta(f, { type: 'comment' }, ctx.config),
    text: (p) => ({
      issue: T('دعوة عامة للتفاعل', 'Generic call to action'),
      reason: T(`«${p.text.split('\n')[0]}» تطلب التفاعل دون سؤال محدد يسهل الإجابة عنه.`, `"${p.text.split('\n')[0]}" asks for engagement without a specific, easy-to-answer prompt.`),
      fix: p.count
        ? T(`استبدلها بسؤال يحدد الإجابة: «أيّ ${p.count} منها يحدث معك أكثر؟ اكتب رقمه».`, `Replace it with a question that bounds the answer: "Which of the ${p.count} happens to you most? Write its number."`)
        : T('استبدلها بسؤال يحدد الإجابة (اختيار، رقم، تجربة واحدة).', 'Replace it with a question that bounds the answer (a choice, a number, one experience).'),
    }),
    rewrite: () => 'Replace the call to action with one specific question the reader can answer in a word or a number.',
  },
  {
    id: 'missing_cta',
    scoreType: 'conversation',
    basis: 'heuristic',
    types: ['carousel', 'post', 'caption', 'reel', 'thread'],
    detect: (f) => {
      if (f.cta.present) return [];
      const save = f.audience.saveWorthiness >= f.audience.commentWorthiness;
      return [{ severity: 0.45, params: { kind: save ? 'save' : 'comment', count: f.carousel?.promise?.count ?? null }, evidence: [{ feature: 'cta.present', value: false, target: true, provenance: 'derived' }, { feature: save ? 'audience.saveWorthiness' : 'audience.commentWorthiness', value: save ? f.audience.saveWorthiness : f.audience.commentWorthiness, provenance: 'heuristic' }] }];
    },
    edit: (f, x, ctx) => counterfactual.specificCta(f, { type: x.params.kind }, ctx.config),
    text: (p) => ({
      issue: T('لا توجد دعوة في النهاية', 'No call to action at the end'),
      reason: p.kind === 'save' ? T('المحتوى مرجعي (قابلية الحفظ أعلى من التعليق) ولا يذكّر القارئ بالحفظ.', 'The content is reference material (save potential above comment potential) and never prompts a save.') : T('المحتوى يدعو للنقاش لكنه لا يطرح سؤالًا في النهاية.', 'The content invites discussion but ends without a question.'),
      fix: p.kind === 'save' ? T('اختم بدعوة حفظ مرتبطة بالاستخدام («احفظه لتعود إليه قبل…»).', 'End with a save prompt tied to its use ("save it for when…").') : T(`اختم بسؤال محدد${p.count ? ` («أيّ ${p.count} منها…؟»)` : ''}.`, `End with a specific question${p.count ? ` ("which of the ${p.count}…?")` : ''}.`),
    }),
  },
  {
    id: 'promise_mismatch',
    scoreType: 'retention',
    basis: 'derived',
    types: ['carousel'],
    detect: (f) => (f.carousel.promise.matches === false ? [{ severity: 0.7, params: { ...f.carousel.promise }, evidence: [{ feature: 'carousel.promise', value: `${f.carousel.promise.count}→${f.carousel.promise.delivered}`, target: 'equal', provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.promiseKept(f),
    text: (p) => ({
      issue: T('الغلاف يعد بعدد لا تقدّمه الشرائح', 'The cover promises a count the slides do not deliver'),
      reason: T(`الغلاف يعد بـ ${p.count} والشرائح تقدّم ${p.delivered}.`, `The cover promises ${p.count}; the slides deliver ${p.delivered}.`),
      fix: T(`اجعل العددين متساويين: عدّل رقم الغلاف إلى ${p.delivered} أو أكمل البنود إلى ${p.count}.`, `Make them equal: change the cover to ${p.delivered} or complete the items to ${p.count}.`),
    }),
  },
  {
    id: 'strongest_insight_late',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['carousel'],
    detect: (f) => {
      const c = f.carousel;
      if (c.revealPacing !== 'late' || c.strongestInsight - c.secondSlideInsight < 0.15) return [];
      return [{ severity: 0.35, params: { slide: c.strongestSlide, insight: c.strongestInsight, second: c.secondSlideInsight }, evidence: [{ feature: `carousel.slides[${c.strongestSlide}].insight`, value: c.strongestInsight, provenance: 'heuristic' }, { feature: 'carousel.slides[2].insight', value: c.secondSlideInsight, provenance: 'heuristic' }] }];
    },
    text: (p) => ({
      issue: T('أقوى فكرة متأخرة', 'The strongest insight comes late'),
      reason: T(`الشريحة ${p.slide} هي الأكثر تحديدًا (${p.insight}) والشريحة 2 أضعف (${p.second}).`, `Slide ${p.slide} is the most specific (${p.insight}); slide 2 is weaker (${p.second}).`),
      fix: T(`انقل فكرة الشريحة ${p.slide} إلى الشريحة 2 حتى يرى القارئ القيمة قبل أن يقرر المتابعة.`, `Move slide ${p.slide}'s idea to slide 2 so readers see the value before deciding to keep swiping.`),
    }),
  },
  {
    id: 'long_sentences',
    scoreType: 'contentQuality',
    basis: 'derived',
    detect: (f, ctx) => {
      const th = ctx.config.thresholds.sentenceWords;
      if (f.text.avgSentenceWords <= th.good && f.text.maxSentenceWords <= th.bad) return [];
      return [{ severity: f.text.maxSentenceWords > th.bad ? 0.5 : 0.3, params: { avg: f.text.avgSentenceWords, max: f.text.maxSentenceWords, good: th.good }, evidence: [{ feature: 'text.avgSentenceWords', value: f.text.avgSentenceWords, target: th.good, provenance: 'derived' }, { feature: 'text.maxSentenceWords', value: f.text.maxSentenceWords, target: th.bad, provenance: 'derived' }] }];
    },
    edit: (f, x) => counterfactual.sentences(f, x.params.good),
    text: (p) => ({
      issue: T('جمل طويلة', 'Long sentences'),
      reason: T(`متوسط الجملة ${p.avg} كلمة وأطولها ${p.max}.`, `Average sentence ${p.avg} words, longest ${p.max}.`),
      fix: T(`قسّم الجمل الطويلة حتى يصبح المتوسط ${p.good} كلمة أو أقل.`, `Split long sentences until the average is ≤ ${p.good} words.`),
    }),
  },
  {
    id: 'low_specificity',
    scoreType: 'share',
    basis: 'heuristic',
    detect: (f) => (f.text.specificity < 0.25 && f.text.words >= 12 ? [{ severity: 0.4, params: { value: f.text.specificity, numbers: f.text.numbers }, evidence: [{ feature: 'text.specificity', value: f.text.specificity, target: 0.4, provenance: 'derived' }, { feature: 'text.numbers', value: f.text.numbers, provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.specificity(f, 0.5),
    text: (p) => ({
      issue: T('محتوى عام بلا تفاصيل محددة', 'Generic content without specifics'),
      reason: T(`درجة التحديد ${p.value}؛ ${p.numbers} أرقام ولا وحدات قياس تقريبًا.`, `Specificity ${p.value}; ${p.numbers} numbers and almost no units.`),
      fix: T('أضف رقمًا واحدًا أو مدة أو مثالًا ملموسًا لكل فكرة رئيسية.', 'Add one number, duration or concrete example to each main idea.'),
    }),
  },
  {
    id: 'clickbait_gap',
    scoreType: 'negativeRisk',
    basis: 'heuristic',
    detect: (f) => (f.semantic.curiosity > 0.6 && f.text.specificity < 0.25 ? [{ severity: 0.55, params: { curiosity: f.semantic.curiosity, specificity: f.text.specificity }, evidence: [{ feature: 'semantic.curiosity', value: f.semantic.curiosity, provenance: f.semantic.provenance }, { feature: 'text.specificity', value: f.text.specificity, target: 0.45, provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.specificity(f, 0.45),
    text: (p) => ({
      issue: T('فضول أكبر من المضمون', 'More curiosity than substance'),
      reason: T(`الفضول ${p.curiosity} والتحديد ${p.specificity}: قد يشعر القارئ أن الوعد لم يُوفَ.`, `Curiosity ${p.curiosity} vs specificity ${p.specificity}: readers may feel the promise was not kept.`),
      fix: T('قدّم تفصيلًا ملموسًا واحدًا مبكرًا يثبت أن الوعد حقيقي.', 'Deliver one concrete detail early to show the promise is real.'),
    }),
  },
  {
    id: 'engagement_bait',
    scoreType: 'negativeRisk',
    basis: 'heuristic',
    detect: (f) => (f.cta.bait || f.text.baitPhrases.length ? [{ severity: 0.9, params: { phrases: f.text.baitPhrases }, evidence: [{ feature: 'text.baitPhrases', value: f.text.baitPhrases.join('، ') || 'cta', target: 'none', provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.removeBait(f),
    text: (p) => ({
      issue: T('استجداء للتفاعل', 'Engagement bait'),
      reason: T(`عبارات تطلب التفاعل لذاته: ${p.phrases.join('، ') || 'في الدعوة'}.`, `Wording that asks for engagement for its own sake: ${p.phrases.join(', ') || 'in the CTA'}.`),
      fix: T('احذفها واطرح سؤالًا حقيقيًا عن الموضوع.', 'Remove it and ask a real question about the topic.'),
    }),
  },
  {
    id: 'hostile_words',
    scoreType: 'negativeRisk',
    basis: 'heuristic',
    detect: (f) => (f.text.hostileWords ? [{ severity: 0.7, params: { n: f.text.hostileWords }, evidence: [{ feature: 'text.hostileWords', value: f.text.hostileWords, target: 0, provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.removeHostile(f),
    text: (p) => ({ issue: T('كلمات جارحة', 'Hostile wording'), reason: T(`${p.n} كلمات جارحة قد تدفع إلى الإخفاء أو الإبلاغ.`, `${p.n} hostile words can lead to hides or reports.`), fix: T('استبدلها بوصف للسلوك لا للأشخاص.', 'Describe the behaviour, not the people.') }),
  },
  {
    id: 'redundancy',
    scoreType: 'contentQuality',
    basis: 'derived',
    detect: (f) => (f.text.redundancy > 0.3 && f.text.contentWords >= 15 ? [{ severity: 0.25, params: { redundancy: f.text.redundancy, maxRepeat: f.text.maxRepeat }, evidence: [{ feature: 'text.redundancy', value: f.text.redundancy, target: 0.3, provenance: 'derived' }] }] : []),
    text: (p) => ({ issue: T('تكرار كثير', 'Heavy repetition'), reason: T(`${Math.round(p.redundancy * 100)}% من الكلمات المضمونية مكررة (أكثرها ${p.maxRepeat} مرات).`, `${Math.round(p.redundancy * 100)}% of content words repeat (most frequent ${p.maxRepeat} times).`), fix: T('احذف التكرار أو استبدل بعضه بمرادف أو بضمير.', 'Remove repeats or replace some with a synonym or pronoun.') }),
  },
  // Reels
  {
    id: 'reel_promise_late',
    scoreType: 'hook',
    basis: 'heuristic',
    types: ['reel'],
    detect: (f, ctx) => (f.reel.firstSecondsHasPromise ? [] : [{ severity: 0.7, params: { seconds: ctx.config.thresholds.reel.firstSeconds, words: f.reel.firstSecondsWords }, evidence: [{ feature: 'reel.firstSecondsHasPromise', value: false, target: true, provenance: 'derived' }] }]),
    edit: (f) => counterfactual.reel(f, { firstSecondsHasPromise: true }),
    text: (p) => ({ issue: T('الوعد متأخر في الريل', 'The reel\'s promise comes late'), reason: T(`أول ${p.seconds} ثوانٍ (${p.words} كلمة) بلا رقم ولا سؤال ولا تحذير.`, `The first ${p.seconds} seconds (${p.words} words) have no number, question or warning.`), fix: T('افتح بالنتيجة أو الرقم في المشهد الأول، واترك الشرح لما بعده.', 'Open with the consequence or the number in the first scene; explain afterwards.') }),
  },
  {
    id: 'reel_first_scene_long',
    scoreType: 'hook',
    basis: 'heuristic',
    types: ['reel'],
    detect: (f, ctx) => (f.reel.hookFits ? [] : [{ severity: 0.5, params: { words: f.reel.hookWords, target: ctx.config.thresholds.reel.hookWords }, evidence: [{ feature: 'reel.hookWords', value: f.reel.hookWords, target: ctx.config.thresholds.reel.hookWords, provenance: 'derived' }] }]),
    edit: (f) => counterfactual.reel(f, { hookFits: true, hookWords: 7 }),
    text: (p) => ({ issue: T('المشهد الأول طويل', 'First scene too long'), reason: T(`${p.words} كلمة في المشهد الأول.`, `${p.words} words in the first scene.`), fix: T(`اختصره إلى ${p.target} كلمات أو أقل.`, `Cut it to ≤ ${p.target} words.`) }),
  },
  {
    id: 'reel_no_payoff',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['reel'],
    detect: (f) => (f.reel.openLoops > 0 && !f.reel.payoff ? [{ severity: 0.55, params: { loops: f.reel.openLoops }, evidence: [{ feature: 'reel.openLoops', value: f.reel.openLoops, provenance: 'derived' }, { feature: 'reel.payoff', value: false, target: true, provenance: 'derived' }] }] : []),
    edit: (f) => counterfactual.reel(f, { payoff: true }),
    text: (p) => ({ issue: T('سؤال بلا إجابة في النهاية', 'Open loop without payoff'), reason: T(`${p.loops} حلقات فضول في النصف الأول ولا خلاصة في الثلث الأخير.`, `${p.loops} open loops in the first half and no payoff in the last third.`), fix: T('أجب عن سؤال البداية صراحة قبل الدعوة الأخيرة.', 'Answer the opening question explicitly before the final call to action.') }),
  },
  {
    id: 'reel_duration',
    scoreType: 'retention',
    basis: 'heuristic',
    types: ['reel'],
    detect: (f, ctx) => (f.reel.durationFit >= 0.6 ? [] : [{ severity: 0.45, params: { seconds: f.reel.durationSec, range: ctx.config.thresholds.reel.duration.slice(1, 3) }, evidence: [{ feature: 'reel.durationSec', value: f.reel.durationSec, target: ctx.config.thresholds.reel.duration.slice(1, 3).join('–'), provenance: 'derived' }] }]),
    edit: (f) => counterfactual.reel(f, { durationFit: 1 }),
    text: (p) => ({ issue: T('مدة الريل خارج المدى', 'Reel duration out of range'), reason: T(`المدة المقدّرة ${p.seconds} ث.`, `Estimated duration ${p.seconds}s.`), fix: T(`اجعلها بين ${p.range[0]} و${p.range[1]} ثانية بحذف المشاهد الأضعف أو دمجها.`, `Bring it to ${p.range[0]}–${p.range[1]}s by cutting or merging the weakest scenes.`) }),
  },
];

const RULE_BASIS_CONFIDENCE = (config, basis) => config.confidence.provenance[basis] ?? 0.35;

// A rule of thumb never outranks a measured problem: heuristic rules top
// out at "medium" unless the account's own history backs them.
function priorityOf(severity, effect, basis, backed) {
  const d = effect?.overallDelta ?? 0;
  let p = d >= 3 || severity >= 0.8 ? 'high' : d >= 1 || severity >= 0.5 ? 'medium' : 'low';
  if (p === 'high' && basis === 'heuristic' && !backed) p = 'medium';
  return p;
}

// One platform's recommendations. `engine.rescore(features)` returns the
// platform report for edited features (same history, same weights).
export function platformRecommendations({ features, report, engine, rules, config, history, lang = 'ar' }) {
  const out = [];
  for (const rule of rules) {
    if (rule.types && !rule.types.includes(features.type)) continue;
    if (rule.platforms && !rule.platforms.includes(report.platform)) continue;
    const ctx = { config, platform: report.platform, history, report };
    for (const finding of rule.detect(features, ctx) ?? []) {
      if (!finding.evidence?.length) continue; // never a recommendation without evidence
      const edited = rule.edit ? rule.edit(features, finding, ctx) : null;
      const effect = edited ? effectOf(report, engine.rescore(edited), rule.scoreType) : null;
      const text = rule.text(finding.params, features, lang);
      const accountEvidence = rule.history?.(finding, history, lang) ?? null;
      const confidence = round(Math.max(RULE_BASIS_CONFIDENCE(config, rule.basis), accountEvidence?.confidence ?? 0));
      out.push({
        topic: rule.topic?.(finding) ?? null,
        id: `${report.platform}:${rule.id}${finding.key ? `:${finding.key}` : ''}`,
        rule: rule.id,
        platform: report.platform,
        issue: rule.id,
        title: pick(text.issue, lang),
        reason: pick(text.reason, lang),
        suggestedFix: pick(text.fix, lang),
        priority: priorityOf(finding.severity, effect, rule.basis, Boolean(accountEvidence)),
        expectedEffect: effect,
        confidence,
        basis: rule.basis,
        evidence: finding.evidence,
        ...(accountEvidence && { accountEvidence }),
        ...(rule.rewrite && { rewrite: rule.rewrite(finding.params) }),
        severity: round(finding.severity),
      });
    }
  }
  return collapseTopics(rank(out));
}

// Several rules can describe one fix (a long opening is a weak hook, a
// sentence over the account's best range, and a missed history pattern):
// keep the best-ranked one, carrying the others' account evidence.
function collapseTopics(recs) {
  const kept = new Map();
  const out = [];
  for (const r of recs) {
    if (!r.topic) {
      out.push(r);
      continue;
    }
    const first = kept.get(r.topic);
    if (!first) {
      kept.set(r.topic, r);
      out.push(r);
    } else if (r.accountEvidence && !first.accountEvidence) first.accountEvidence = r.accountEvidence;
  }
  return out;
}

const P = { high: 0, medium: 1, low: 2 };
export const rank = (recs) => recs.sort((a, b) => P[a.priority] - P[b.priority] || (b.expectedEffect?.overallDelta ?? 0) - (a.expectedEffect?.overallDelta ?? 0) || b.severity - a.severity);

// Cross-platform list: the same rule and target on several platforms becomes
// one item listing the platforms and the effect on each.
export function mergeRecommendations(lists) {
  const by = new Map();
  for (const r of lists.flat()) {
    const key = r.id.split(':').slice(1).join(':');
    const prev = by.get(key);
    if (!prev) by.set(key, { ...r, id: key, platforms: [r.platform], effects: { [r.platform]: r.expectedEffect } });
    else {
      prev.platforms.push(r.platform);
      prev.effects[r.platform] = r.expectedEffect;
      if (P[r.priority] < P[prev.priority]) prev.priority = r.priority;
      prev.confidence = Math.max(prev.confidence, r.confidence);
      if (r.accountEvidence && !prev.accountEvidence) prev.accountEvidence = r.accountEvidence;
    }
  }
  return rank([...by.values()].map((r) => ({ ...r, platform: r.platforms.length > 1 ? 'all' : r.platforms[0] })));
}
