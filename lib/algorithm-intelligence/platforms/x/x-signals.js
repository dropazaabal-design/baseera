import { band, lowerIsBetter } from '../../core/normalization.js';
import { clarity, emotionBand, ev, evidenceOf, hookEvidence, negativeRisk, signal } from '../common.js';

// X signals from content features (and account history when available).
// Each potential mirrors an action X's public ranker predicts per viewer
// (xai-org/x-algorithm); Basira estimates the content's side of it only.

export function xSignals(f, { config, history = null, semanticSource } = {}) {
  const th = config.thresholds;
  const o = { config, semanticSource };
  const a = f.audience;
  const out = {};
  const put = (s) => {
    out[s.id] = s;
  };

  // The text a reader of X sees: the caption for visual formats.
  const visual = f.type === 'carousel' || f.type === 'reel';
  const xText = visual ? f.caption : f.text;

  put(signal('x.hook_strength', f.hook.strength, 'heuristic', hookEvidence(f), o));
  const opening = visual ? f.hook.words : f.text.firstSentenceWords;
  put(signal('x.opening_fit', lowerIsBetter(opening, th.openingSentence.good, th.openingSentence.bad), 'derived', [ev('text.firstSentenceWords', opening, opening <= th.openingSentence.good ? '+' : '-')], o));

  let lengthFit = null;
  let lengthEv = [];
  if (f.thread) {
    lengthFit = 1 - f.thread.overLimit / Math.max(1, f.thread.posts);
    lengthEv = [ev('thread.overLimit', f.thread.overLimit, f.thread.overLimit ? '-' : '+')];
  } else if (xText) {
    const len = xText.xLength;
    lengthFit = len <= th.x.maxLength ? 1 : Math.max(0, 1 - (len - th.x.maxLength) / th.x.maxLength);
    lengthEv = [ev('text.xLength', len, len <= th.x.maxLength ? '+' : '-')];
  }
  put(signal('x.length_fit', lengthFit, 'derived', lengthEv, o));

  put(signal('x.like_potential', 0.4 * f.hook.strength + 0.3 * (clarity(f) ?? 0.5) + 0.3 * emotionBand(f), 'heuristic', [...hookEvidence(f).slice(0, 2), ev('text.readability', f.text.readability, f.text.readability >= 60 ? '+' : '-')], o));
  put(signal('x.reply_potential', a.replyWorthiness, 'heuristic', evidenceOf(f, ['question', 'opinion', 'directAddress', 'cta']), o));
  put(signal('x.repost_potential', 0.7 * a.shareWorthiness + 0.3 * f.semantic.quotability, 'heuristic', evidenceOf(f, ['usefulness', 'specificity', 'quotability', 'novelty']), o));
  put(signal('x.quote_potential', a.quoteWorthiness, 'heuristic', evidenceOf(f, ['opinion', 'quotability']), o));
  put(signal('x.share_potential', 0.5 * a.saveWorthiness + 0.5 * f.semantic.usefulness, 'heuristic', evidenceOf(f, ['usefulness', 'list', 'specificity']), o));
  put(signal('x.bookmark_potential', a.saveWorthiness, 'heuristic', evidenceOf(f, ['usefulness', 'list', 'specificity']), o));
  put(signal('x.profile_click_potential', a.profileWorthiness, 'heuristic', evidenceOf(f, ['personal', 'specificity']), o));

  const affinity = history?.topicAffinity(f) ?? null;
  put(signal('x.follow_potential', affinity ? 0.6 * a.profileWorthiness + 0.4 * affinity.value : a.profileWorthiness, affinity ? 'historical' : 'heuristic', [...evidenceOf(f, ['personal']), affinity && ev('history.topicAffinity', affinity.value, affinity.value >= 0.5 ? '+' : '-')], { ...o, ...(affinity && { confidence: affinity.confidence }) }));

  let dwell;
  let dwellEv;
  if (f.thread) {
    dwell = 0.6 * f.thread.postCountFit + 0.4 * (f.thread.firstPostEndsOpen ? 1 : 0.3);
    dwellEv = [ev('thread.posts', f.thread.posts, f.thread.postCountFit >= 0.8 ? '+' : '-'), ev('thread.firstPostEndsOpen', f.thread.firstPostEndsOpen, f.thread.firstPostEndsOpen ? '+' : '-')];
  } else {
    const words = band(f.text.words, [5, 20, 120, 280]) ?? 0;
    const structure = f.text.lineBreaks >= 2 || f.text.listItems >= 2 || f.carousel ? 1 : 0.4;
    dwell = 0.6 * words + 0.4 * structure;
    dwellEv = [ev('text.words', f.text.words, words >= 0.8 ? '+' : '-'), ev('text.lineBreaks', f.text.lineBreaks, structure === 1 ? '+' : '-')];
  }
  put(signal('x.dwell_potential', dwell, 'heuristic', dwellEv, o));
  put(signal('x.click_potential', f.text.links ? a.clickWorthiness : null, 'heuristic', f.text.links ? [ev('text.links', f.text.links, '+'), ...evidenceOf(f, ['specificity'])] : [], { ...o, note: f.text.links ? undefined : 'no link in the post' }));
  put(signal('x.clarity', clarity(f), 'derived', [ev('text.readability', f.text.readability, f.text.readability >= 60 ? '+' : '-'), ev('text.avgSentenceWords', f.text.avgSentenceWords, f.text.avgSentenceWords <= th.sentenceWords.good ? '+' : '-')], o));
  put(signal('x.specificity', f.text.specificity, 'derived', evidenceOf(f, ['specificity']), o));
  put(signal('x.novelty', f.semantic.novelty, 'heuristic', evidenceOf(f, ['novelty']), o));
  const risk = negativeRisk(f, { hashtagsMany: th.hashtagsMany });
  put(signal('x.negative_feedback_risk', risk.value, 'heuristic', risk.evidence, o));

  put(signal('x.author_affinity', affinity?.value ?? null, 'historical', affinity ? [ev('history.topicAffinity', affinity.value, affinity.value >= 0.5 ? '+' : '-')] : [], { ...o, confidence: affinity?.confidence ?? 0, note: affinity ? `n=${affinity.n}` : 'no account history for this topic' }));
  put(signal('x.network_relevance', null, 'historical', [], { ...o, confidence: 0, note: 'requires follower-graph data that X does not expose to creators' }));
  const fit = history?.patternFit(f) ?? null;
  put(signal('x.historical_performance', fit ? fit.score / 100 : null, 'historical', fit ? fit.matches.map((m) => ev(`history.pattern.${m.id}`, m.effect, m.effect >= 0 ? '+' : '-')) : [], { ...o, confidence: fit?.confidence ?? 0 }));
  return out;
}
