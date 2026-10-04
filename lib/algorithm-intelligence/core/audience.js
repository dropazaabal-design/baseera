import { band, clamp01, round, saturate } from './normalization.js';

// Likely audience actions, estimated from the content alone. These are
// derived predictive features (provenance "heuristic": the mixes below are
// Basira's rules of thumb), never platform outcomes. Each is a weighted
// mix of measured features and the semantic block, listed in AUDIENCE_MIX
// so explanations can name what moved a value.

export const AUDIENCE_MIX = {
  commentWorthiness: { question: 0.3, ctaSpecific: 0.2, opinion: 0.15, directAddress: 0.15, conversationality: 0.1, personal: 0.1 },
  replyWorthiness: { question: 0.35, opinion: 0.2, directAddress: 0.15, conversationality: 0.15, ctaSpecific: 0.15 },
  shareWorthiness: { usefulness: 0.25, specificity: 0.2, listOrEducation: 0.15, novelty: 0.15, emotion: 0.1, quotability: 0.15 },
  saveWorthiness: { usefulness: 0.3, densityInBand: 0.25, listStructure: 0.2, specificity: 0.15, depth: 0.1 },
  quoteWorthiness: { opinion: 0.4, quotability: 0.3, emotion: 0.3 },
  clickWorthiness: { link: 0.4, curiosity: 0.3, specificity: 0.3 },
  profileWorthiness: { personal: 0.4, series: 0.3, specificity: 0.3 },
};

export function audienceInputs(f) {
  const s = f.semantic;
  const i = f.intent.scores;
  const words = f.text.words;
  return {
    question: f.hook.question || f.cta.question ? 1 : saturate(f.text.questions, 1),
    ctaSpecific: f.cta.specific ? 1 : f.cta.present && !f.cta.generic ? 0.5 : 0,
    // A stance worth replying to or quoting: opinion, controversy, myth-busting, a maxim.
    opinion: Math.max(i.opinion ?? 0, i.controversy ?? 0, (i['myth-busting'] ?? 0) * 0.7, (i['personal-insight'] ?? 0) * 0.6),
    directAddress: saturate(f.text.directAddress, 2),
    conversationality: f.text.conversationality,
    personal: Math.max(i['personal-insight'] ?? 0, i.story ?? 0),
    usefulness: s.usefulness,
    specificity: f.text.specificity,
    listOrEducation: Math.max(i.list ?? 0, i.education ?? 0, i.tutorial ?? 0),
    novelty: s.novelty,
    // Moderate emotion helps sharing; extreme framing is counted as risk elsewhere.
    emotion: band(s.emotion, [0, 0.2, 0.75, 1]) ?? 0,
    quotability: s.quotability,
    densityInBand: f.carousel ? f.carousel.densityFit : band(words, [10, 40, 220, 400]) ?? 0,
    listStructure: f.text.numberedList || f.carousel?.progression?.numbered || (i.list ?? 0) >= 0.6 ? 1 : saturate(f.text.listItems, 2),
    depth: f.carousel ? band(f.carousel.slideCount, [2, 5, 10, 15]) ?? 0 : f.thread ? band(f.thread.posts, [1, 3, 10, 20]) ?? 0 : band(words, [20, 60, 250, 450]) ?? 0,
    link: f.text.links > 0 ? 1 : 0,
    curiosity: s.curiosity,
    series: f.thread?.numbered || f.carousel?.progression?.sequential ? 1 : 0,
  };
}

// Every post has some chance of each action: a small prior keeps a plain
// but sound text from reading as zero.
export const AUDIENCE_PRIOR = 0.15;

export function audienceFeatures(features) {
  const x = audienceInputs(features);
  const out = {};
  for (const [name, mix] of Object.entries(AUDIENCE_MIX)) {
    const v = Object.entries(mix).reduce((s, [k, w]) => s + w * (x[k] ?? 0), 0);
    out[name] = round(clamp01(AUDIENCE_PRIOR + (1 - AUDIENCE_PRIOR) * v));
  }
  return out;
}
