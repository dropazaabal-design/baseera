import { normalizeArabic, toWesternDigits } from '../../studio/arabic.js';
import { hits, isNumberWord, variants } from './lexicon.js';
import { band, clamp01, lowerIsBetter, round, saturate } from './normalization.js';
import { clean, cues, lines, sentences, startsWithNumber, textStats, tokenize, xWeightedLength } from './text-stats.js';

// Structure of multi-part content: a carousel's slides, a reel's scenes, a
// thread's posts. All measurements; no judgement of meaning.

const NUMBER_WORDS = { واحد: 1, واحده: 1, اثنان: 2, اثنين: 2, اثنتان: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثماني: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10 };

// The first number a text promises («6 أعداء», «ستّة أعداء»).
export function promisedCount(text) {
  for (const tok of tokenize(text).slice(0, 4)) {
    const d = toWesternDigits(tok).match(/^\d{1,2}$/);
    if (d) return Number(d[0]);
    if (isNumberWord(tok)) {
      for (const v of variants(tok)) if (NUMBER_WORDS[v]) return NUMBER_WORDS[v];
    }
  }
  return null;
}

// An ordinal cue on a slide: «العدو 3», «3.», «الخطوة 2», «#4».
function ordinalOf(slide) {
  for (const t of [slide.kicker, slide.title]) {
    if (!t) continue;
    const m = toWesternDigits(clean(t)).match(/(?:^|\s|#)(\d{1,2})(?:[.)\-:/]|\s|$)/);
    if (m && clean(t).split(/\s+/).length <= 6) return Number(m[1]);
  }
  return null;
}

const slideText = (s) => [s.kicker, s.title, s.body, ...(s.items ?? [])].filter(Boolean).join('\n');

export function carouselFeatures(input, config) {
  const slides = input.slides;
  const n = slides.length;
  // Pages a design marks cover or CTA keep that role; the last slide is a
  // CTA when it asks something or names an action.
  const asksAction = (t) => /[?؟]/.test(t) || ['ctaComment', 'ctaSave', 'ctaShare', 'ctaFollow'].some((k) => hits(k, tokenize(t), normalizeArabic(t)).n > 0);
  const roleOf = (s, i) => s.role ?? (i === 0 ? 'cover' : i === n - 1 && asksAction(slideText(s)) ? 'cta' : 'body');
  const perSlide = slides.map((s, i) => {
    const role = roleOf(s, i);
    const stats = textStats(slideText(s));
    const titleWords = tokenize(s.title ?? '').length;
    const density = slideDensity(stats.words, role, s.visual, config);
    const c = cues(slideText(s));
    const insight = clamp01(0.45 * stats.specificity + 0.2 * saturate(c.myth + c.research, 1) + 0.2 * saturate(c.contrast + c.warning, 1) + 0.15 * saturate(stats.numbers, 1));
    return {
      slide: i + 1,
      role,
      words: stats.words,
      titleWords,
      ...density,
      visual: s.visual ?? null,
      sentences: stats.sentences,
      maxSentenceWords: stats.maxSentenceWords,
      ordinal: role === 'cover' ? null : ordinalOf(s),
      insight: round(insight),
      question: stats.questions > 0,
      endsOpen: /[…:؟?]\s*$/.test(clean(slideText(s))),
      composition: s.visual?.composition ?? null,
      scale: s.visual?.scale ?? null,
    };
  });

  const listItems = slides.reduce((m, s) => Math.max(m, s.items?.length ?? 0), 0);
  return summarizeCarousel(perSlide, { promiseCount: promisedCount(slides[0]?.title ?? ''), listItems }, config);
}

// Slide density from a slide's words and layout (shared with counterfactuals).
export function slideDensity(words, role, visual, config) {
  const limits = config.thresholds.carousel.density[role] ?? config.thresholds.carousel.density.body;
  const shrunk = typeof visual?.scale === 'number' && visual.scale < 0.9;
  // 100 at the slide's maximum readable amount; layout shrinking counts too.
  const densityScore = Math.round(Math.min(130, (100 * words) / limits.max + (shrunk ? (1 - visual.scale) * 60 : 0)));
  const empty = words === 0 && !(visual?.images > 0);
  const warning = empty ? 'empty' : words > limits.max || visual?.fits === false ? 'too_dense' : words > limits.ideal ? 'dense' : null;
  return { densityScore, warning, targetWords: limits.ideal, recommendedWordReduction: warning === 'too_dense' || warning === 'dense' ? Math.max(0, words - limits.ideal) : 0 };
}

// Carousel-level features from the per-slide rows. Counterfactuals edit
// rows («slide 4 at 30 words») and call this again, so a recommendation's
// expected effect uses exactly the code that scored the original.
export function summarizeCarousel(perSlide, { promiseCount, listItems = 0 }, config) {
  const th = config.thresholds.carousel;
  const n = perSlide.length;
  const words = perSlide.map((p) => p.words);
  const body = perSlide.filter((p) => p.role === 'body');
  const ordinals = perSlide.map((p) => p.ordinal).filter((x) => x !== null);
  const sequential = ordinals.length >= 2 && ordinals.every((x, i) => i === 0 || x === ordinals[i - 1] + 1);
  const delivered = ordinals.length >= 2 ? ordinals.length : listItems || body.length;
  // Longest run of slides with the same layout.
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < perSlide.length; i++) {
    run = perSlide[i].composition && perSlide[i].composition === perSlide[i - 1].composition ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  const strongest = body.length ? body.reduce((a, b) => (b.insight > a.insight ? b : a)) : null;
  const continuity = body.length ? body.filter((p) => p.ordinal !== null || p.endsOpen || p.question).length / body.length : 0;
  const cover = perSlide[0];
  const scales = perSlide.map((p) => p.scale).filter((x) => typeof x === 'number');
  return {
    slideCount: n,
    wordsPerSlide: words,
    totalWords: words.reduce((a, b) => a + b, 0),
    avgWords: round(words.reduce((a, b) => a + b, 0) / Math.max(1, n), 1),
    maxWords: Math.max(0, ...words),
    coverWords: cover?.words ?? 0,
    coverTitleWords: cover?.titleWords ?? 0,
    overloaded: perSlide.filter((p) => p.warning === 'too_dense').map((p) => p.slide),
    dense: perSlide.filter((p) => p.warning === 'dense').map((p) => p.slide),
    empty: perSlide.filter((p) => p.warning === 'empty').map((p) => p.slide),
    slides: perSlide,
    listItems,
    promise: { count: promiseCount, delivered, matches: promiseCount === null ? null : promiseCount === delivered },
    progression: { numbered: ordinals.length >= 2, sequential, ordinals },
    curiosityContinuity: round(continuity),
    repeatedStructureRun: maxRun,
    strongestSlide: strongest?.slide ?? null,
    strongestInsight: strongest?.insight ?? 0,
    secondSlideInsight: perSlide[1]?.insight ?? 0,
    revealPacing: !strongest ? null : strongest.slide <= 3 ? 'early' : strongest.slide >= th.strongestLateFrom ? 'late' : 'middle',
    finalCta: perSlide.at(-1)?.role === 'cta',
    avgScale: scales.length ? round(scales.reduce((a, b) => a + b, 0) / scales.length) : null,
    slideCountFit: round(band(n, th.slides) ?? 0),
    densityFit: round(1 - perSlide.reduce((s, p) => s + (p.warning === 'too_dense' ? 1 : p.warning === 'dense' ? 0.4 : p.warning === 'empty' ? 1 : 0), 0) / Math.max(1, n)),
  };
}

export function reelFeatures(input, config) {
  const th = config.thresholds.reel;
  const wps = th.wordsPerSecond;
  const scenes = input.scenes?.length ? input.scenes : sentences(input.text ?? '').map((t) => ({ text: t }));
  const per = scenes.map((s) => {
    const words = tokenize(s.text).length;
    const seconds = typeof s.durationSec === 'number' ? s.durationSec : Math.max(th.minScene * 0.75, words / wps + 0.3);
    return { words, seconds, text: clean(s.text), visualChange: s.visualChange };
  });
  const duration = per.reduce((a, b) => a + b.seconds, 0);
  // Words on screen or spoken within the first seconds.
  let acc = 0;
  let firstWords = 0;
  const firstTexts = [];
  for (const p of per) {
    if (acc >= th.firstSeconds) break;
    const share = Math.min(1, (th.firstSeconds - acc) / p.seconds);
    firstWords += Math.round(p.words * share);
    firstTexts.push(p.text);
    acc += p.seconds;
  }
  const firstText = firstTexts.join(' ');
  const fc = cues(firstText);
  const fs = textStats(firstText);
  const promise = fs.numbers > 0 || fc.curiosity > 0 || fs.questions > 0 || fc.warning > 0 || fc.question > 0;
  const hookWords = per[0]?.words ?? 0;
  const half = Math.ceil(per.length / 2);
  const firstHalf = per.slice(0, half).map((p) => p.text).join('\n');
  const lastThird = per.slice(Math.floor((per.length * 2) / 3)).map((p) => p.text).join('\n');
  const openLoops = cues(firstHalf).openLoop + textStats(firstHalf).questions;
  const lt = cues(lastThird);
  const payoff = lt.payoff > 0 || (openLoops > 0 && textStats(lastThird).numbers > 0);
  const secs = per.map((p) => p.seconds);
  const mean = duration / Math.max(1, per.length);
  const cv = per.length > 1 ? Math.sqrt(secs.reduce((s, x) => s + (x - mean) ** 2, 0) / per.length) / mean : 0;
  const changes = per.filter((p, i) => i > 0 && p.visualChange !== false).length;
  // The call to action: a scene that names an action (comment, follow, save,
  // share); a question counts only in the last scene, since an early
  // question is usually the hook's open loop, not a CTA.
  const names = (t) => ['ctaComment', 'ctaFollow', 'ctaSave', 'ctaShare'].some((k) => hits(k, tokenize(t), normalizeArabic(t)).n > 0);
  const ctaIdx = per.findLastIndex((p, i) => names(p.text) || (i === per.length - 1 && /[?؟]/.test(p.text)));
  const totalContent = per.reduce((s, p) => s + textStats(p.text).contentWords, 0);
  const compression = duration ? totalContent / duration : 0;
  const lastRefersBack = per.length > 1 && /(ابدأ من جديد|أعد|من البداية|أول)/.test(per.at(-1).text);
  return {
    sceneCount: per.length,
    wordsPerScene: per.map((p) => p.words),
    totalWords: per.reduce((a, b) => a + b.words, 0),
    durationSec: round(duration, 1),
    durationSource: input.scenes?.some((s) => typeof s.durationSec === 'number') ? 'planned' : 'estimated-speech',
    hookWords,
    hookFits: hookWords <= th.hookWords,
    hookInFirstSentence: hookWords <= th.hookWords * 1.7 && promise,
    firstSecondsWords: firstWords,
    firstSecondsHasPromise: promise,
    sceneRhythmCv: round(cv),
    rhythmFit: round(band(cv, [0, 0.1, 0.6, 1.2]) ?? 0),
    openLoops,
    payoff,
    visualChangesPer10s: duration ? round((changes / duration) * 10, 1) : 0,
    ctaPlacement: ctaIdx < 0 ? 'none' : ctaIdx === per.length - 1 ? 'end' : ctaIdx <= 1 ? 'early' : 'middle',
    compression: round(compression),
    durationFit: round(band(duration, th.duration) ?? 0),
    replayPotential: round(clamp01(0.45 * (lowerIsBetter(duration, 15, 45) ?? 0) + 0.25 * (lastRefersBack ? 1 : 0) + 0.3 * (band(compression, [0.3, 0.8, 2, 3]) ?? 0))),
  };
}

export function threadFeatures(input, config) {
  const posts = input.thread ?? [];
  const lengths = posts.map((p) => xWeightedLength(p));
  return {
    posts: posts.length,
    firstPostLength: lengths[0] ?? 0,
    overLimit: lengths.filter((l) => l > config.thresholds.x.maxLength).length,
    numbered: posts.filter((p) => /^\s*\(?[0-9٠-٩]{1,2}\s*[/)]/.test(p)).length >= Math.min(2, posts.length),
    avgPostWords: round(posts.reduce((s, p) => s + tokenize(p).length, 0) / Math.max(1, posts.length), 1),
    firstPostEndsOpen: /[…:؟?]\s*$/.test(clean(posts[0] ?? '')) || startsWithNumber(posts[0] ?? ''),
    postCountFit: round(band(posts.length, [1, 3, 12, 25]) ?? 0),
    lines: lines(posts.join('\n')).length,
  };
}
