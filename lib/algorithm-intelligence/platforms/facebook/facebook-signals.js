import { clarity, ev, evidenceOf, formatFit, hookEvidence, negativeRisk, reelRetention, signal } from '../common.js';

// Facebook signals for text, image, link, video and reel posts. The
// predictions they mirror are listed in Meta's Facebook Feed system card
// (scroll past, "Show more", link click, intent to engage with connections);
// weights are Basira's own and independent of Instagram's.

export function facebookSignals(f, { config, history = null, semanticSource } = {}) {
  const th = config.thresholds;
  const o = { config, semanticSource };
  const a = f.audience;
  const out = {};
  const put = (s) => {
    out[s.id] = s;
  };

  put(signal('facebook.hook_strength', f.hook.strength, 'heuristic', hookEvidence(f), o));
  put(signal('facebook.scroll_past_risk', 1 - f.hook.strength, 'heuristic', hookEvidence(f).filter((e) => e.effect === '-'), o));
  const personal = Math.max(f.intent.scores['personal-insight'], f.intent.scores.story);
  const question = f.hook.question || f.cta.question ? 1 : 0;
  put(signal('facebook.meaningful_comment_potential', 0.6 * a.commentWorthiness + 0.2 * personal + 0.2 * question, 'heuristic', evidenceOf(f, ['question', 'personal', 'cta', 'directAddress']), o));
  put(signal('facebook.share_potential', a.shareWorthiness, 'heuristic', evidenceOf(f, ['usefulness', 'specificity', 'quotability']), o));
  const opinion = Math.max(f.intent.scores.opinion, f.intent.scores.controversy);
  put(signal('facebook.conversation_potential', 0.5 * a.replyWorthiness + 0.5 * opinion, 'heuristic', evidenceOf(f, ['opinion', 'question', 'directAddress']), o));

  // "Show more" exists only for text long enough to be folded.
  const longText = (f.caption?.chars ?? f.text.chars) > th.facebook.showMoreChars && !f.carousel;
  put(
    signal('facebook.show_more_potential', longText ? 0.5 * f.hook.strength + 0.3 * f.semantic.curiosity + 0.2 * (f.text.lineBreaks >= 1 ? 1 : 0) : null, 'heuristic', longText ? [...hookEvidence(f).slice(0, 2), ev('text.chars', f.text.chars, '+')] : [], {
      ...o,
      note: longText ? undefined : 'text short enough to show in full',
    }),
  );
  put(signal('facebook.click_potential', f.text.links ? a.clickWorthiness : null, 'heuristic', f.text.links ? [ev('text.links', f.text.links, '+')] : [], { ...o, note: f.text.links ? undefined : 'no link in the post' }));
  if (f.reel) {
    const r = reelRetention(f);
    put(signal('facebook.watch_retention', r.value, 'heuristic', r.evidence, o));
  } else put(signal('facebook.watch_retention', null, 'heuristic', [], { ...o, note: 'not a video' }));

  put(signal('facebook.caption_readability', clarity(f), 'derived', [ev('text.readability', f.text.readability, f.text.readability >= 60 ? '+' : '-')], o));
  put(signal('facebook.specificity', f.text.specificity, 'derived', evidenceOf(f, ['specificity']), o));
  const fmt = formatFit(f, { ...th, postWords: [3, 15, 250, 500] });
  put(signal('facebook.format_fit', fmt.value, 'derived', fmt.evidence, o));
  const risk = negativeRisk(f, { hashtagsMany: th.hashtagsMany });
  put(signal('facebook.negative_feedback_risk', risk.value, 'heuristic', risk.evidence, o));

  const affinity = history?.topicAffinity(f) ?? null;
  put(signal('facebook.topic_affinity', affinity?.value ?? null, 'historical', affinity ? [ev('history.topicAffinity', affinity.value, affinity.value >= 0.5 ? '+' : '-')] : [], { ...o, confidence: affinity?.confidence ?? 0, note: affinity ? `n=${affinity.n}` : 'no account history for this topic' }));
  const fit = history?.patternFit(f) ?? null;
  put(signal('facebook.historical_performance', fit ? fit.score / 100 : null, 'historical', fit ? fit.matches.map((m) => ev(`history.pattern.${m.id}`, m.effect, m.effect >= 0 ? '+' : '-')) : [], { ...o, confidence: fit?.confidence ?? 0 }));
  return out;
}
