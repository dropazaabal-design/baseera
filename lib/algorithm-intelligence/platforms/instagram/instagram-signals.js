import { band } from '../../core/normalization.js';
import { carouselCompletion, clarity, ev, evidenceOf, formatFit, hookEvidence, negativeRisk, reelOpening, reelRetention, signal } from '../common.js';

// Instagram signals for feed posts, carousels and reels. The predictions
// they mirror are listed in Meta's Instagram Feed system card and Instagram's
// "Ranking Explained" post (research/provenance.js); no weights are public,
// so every potential here is Basira's own estimate.

export function instagramSignals(f, { config, history = null, semanticSource } = {}) {
  const th = config.thresholds;
  const o = { config, semanticSource };
  const a = f.audience;
  const out = {};
  const put = (s) => {
    out[s.id] = s;
  };

  // The cover is the hook; an overloaded cover weakens it.
  const coverDense = f.carousel?.slides[0]?.warning === 'too_dense' || f.carousel?.slides[0]?.warning === 'dense';
  const hook = f.hook.strength * (coverDense ? 0.8 : 1);
  put(signal('instagram.hook_strength', hook, 'heuristic', [...hookEvidence(f), coverDense && ev('carousel.coverWords', f.carousel.coverWords, '-')], o));
  put(signal('instagram.skip_risk', 1 - hook, 'heuristic', [...hookEvidence(f).filter((e) => e.effect === '-'), coverDense && ev('carousel.coverWords', f.carousel.coverWords, '+')], o));

  put(signal('instagram.share_potential', a.shareWorthiness, 'heuristic', evidenceOf(f, ['usefulness', 'specificity', 'novelty', 'quotability']), o));
  put(signal('instagram.save_potential', a.saveWorthiness, 'heuristic', [...evidenceOf(f, ['usefulness', 'list', 'specificity']), f.carousel && ev('carousel.slideCount', f.carousel.slideCount, f.carousel.slideCountFit >= 0.8 ? '+' : '-')], o));
  put(signal('instagram.comment_potential', a.commentWorthiness, 'heuristic', evidenceOf(f, ['question', 'cta', 'opinion', 'directAddress']), o));
  const series = f.carousel?.progression?.sequential || f.thread?.numbered ? 1 : 0;
  put(signal('instagram.profile_visit_potential', 0.7 * a.profileWorthiness + 0.3 * series, 'heuristic', [...evidenceOf(f, ['personal', 'specificity']), series && ev('carousel.progression', 'sequential', '+')], o));

  if (f.carousel) {
    const c = carouselCompletion(f);
    put(signal('instagram.carousel_completion', c.value, 'heuristic', c.evidence, o));
    put(signal('instagram.time_spent_potential', 0.5 * (band(f.carousel.slideCount, th.carousel.slides) ?? 0) + 0.5 * f.carousel.densityFit, 'heuristic', [ev('carousel.slideCount', f.carousel.slideCount, '+'), ev('carousel.densityFit', f.carousel.densityFit, f.carousel.densityFit >= 0.8 ? '+' : '-')], o));
    put(signal('instagram.visual_density', f.carousel.densityFit, 'derived', [...f.carousel.overloaded.map((n) => ev(`carousel.slide${n}.words`, f.carousel.wordsPerSlide[n - 1], '-')), ...f.carousel.empty.map((n) => ev(`carousel.slide${n}.empty`, true, '-'))], o));
  } else {
    put(signal('instagram.carousel_completion', null, 'heuristic', [], { ...o, note: 'not a carousel' }));
    const spent = f.reel ? f.reel.durationFit : band(f.text.words, [5, 15, 120, 250]) ?? 0;
    put(signal('instagram.time_spent_potential', spent, 'heuristic', [f.reel ? ev('reel.durationSec', f.reel.durationSec, spent >= 0.8 ? '+' : '-') : ev('text.words', f.text.words, spent >= 0.8 ? '+' : '-')], o));
    const dens = f.reel ? band(Math.max(0, ...f.reel.wordsPerScene), [0, 1, 12, 22]) : band(f.text.words, [1, 5, 60, 140]);
    put(signal('instagram.visual_density', dens, 'derived', [f.reel ? ev('reel.maxWordsPerScene', Math.max(0, ...f.reel.wordsPerScene), dens >= 0.8 ? '+' : '-') : ev('text.words', f.text.words, dens >= 0.8 ? '+' : '-')], o));
  }

  if (f.reel) {
    const r = reelRetention(f);
    put(signal('instagram.reel_completion', r.value, 'heuristic', r.evidence, o));
    const h = reelOpening(f);
    put(signal('instagram.reel_hook', h.value, 'derived', h.evidence, o));
  } else {
    put(signal('instagram.reel_completion', null, 'heuristic', [], { ...o, note: 'not a reel' }));
    put(signal('instagram.reel_hook', null, 'derived', [], { ...o, note: 'not a reel' }));
  }

  put(signal('instagram.content_clarity', clarity(f), 'derived', [ev('text.readability', f.text.readability, f.text.readability >= 60 ? '+' : '-')], o));
  put(signal('instagram.specificity', f.text.specificity, 'derived', evidenceOf(f, ['specificity']), o));

  if (f.caption) {
    const first = f.caption.firstSentenceWords;
    const fits = f.caption.chars <= th.instagram.captionPreviewChars || first <= 14;
    put(signal('instagram.caption_fit', fits ? 1 : 0.4, 'heuristic', [ev('caption.firstSentenceWords', first, fits ? '+' : '-')], o));
  } else {
    put(signal('instagram.caption_fit', null, 'heuristic', [], { ...o, note: 'no caption given' }));
  }
  const fmt = formatFit(f, th);
  put(signal('instagram.format_fit', fmt.value, 'derived', fmt.evidence, o));

  const risk = negativeRisk(f, { hashtagsMany: th.hashtagsMany });
  put(signal('instagram.negative_feedback_risk', risk.value, 'heuristic', risk.evidence, o));

  const affinity = history?.topicAffinity(f) ?? null;
  put(signal('instagram.topic_affinity', affinity?.value ?? null, 'historical', affinity ? [ev('history.topicAffinity', affinity.value, affinity.value >= 0.5 ? '+' : '-')] : [], { ...o, confidence: affinity?.confidence ?? 0, note: affinity ? `n=${affinity.n}` : 'no account history for this topic' }));
  const fit = history?.patternFit(f) ?? null;
  put(signal('instagram.historical_performance', fit ? fit.score / 100 : null, 'historical', fit ? fit.matches.map((m) => ev(`history.pattern.${m.id}`, m.effect, m.effect >= 0 ? '+' : '-')) : [], { ...o, confidence: fit?.confidence ?? 0 }));
  return out;
}
