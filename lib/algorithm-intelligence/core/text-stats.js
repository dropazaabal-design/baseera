import { canonicalText, normalizeArabic } from '../../studio/arabic.js';
import { plainText } from '../../studio/measure.js';
import { hits, isNumberWord, isStopword, variants } from './lexicon.js';
import { clamp01, higherIsBetter, lowerIsBetter, round, saturate } from './normalization.js';

// Deterministic measurements of one Arabic text. No AI, no network: word
// and sentence counts, punctuation, numbers, lists, questions, direct
// address, and lexical cues. Studio markup (*marked words*) and bidi
// controls are removed first; letters, hamzas and digits are kept as typed.

const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿ]/;
const LATIN_WORD = /^[A-Za-z][A-Za-z'’-]*$/;
const DIACRITIC = /[ً-ٰٟ]/g;
const PUNCT = /[.,،؛;:!?؟…«»"'()\-–—/]/g;
const SENTENCE_END = /[.!?؟…]+|\n+/;
const EMOJI = /\p{Extended_Pictographic}/gu;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const LIST_LINE = /^\s*(?:[-•▪◦●*]|\(?[0-9٠-٩]{1,2}[).\-:]|[0-9٠-٩]{1,2}\s*[-–—/]\s)/;
const NUMBERED_LINE = /^\s*\(?[0-9٠-٩]{1,2}[).\-:/]/;

// Readability proxy (0..100) from average sentence length and the share of
// long content words. Shared with counterfactuals.
export const readabilityOf = (avgSentenceWords, longWordRatio) => Math.round(100 * (0.6 * (lowerIsBetter(avgSentenceWords, 10, 30) ?? 1) + 0.4 * (lowerIsBetter(longWordRatio, 0.15, 0.45) ?? 1)));

export const clean = (text) => plainText(String(text ?? '')).replace(/\r/g, '');

// Tokens with their surface form (punctuation stripped from the edges).
export function tokenize(text) {
  return canonicalText(clean(text))
    .split(' ')
    .map((t) => t.replace(/^[.,،؛;:!?؟…«»"'()\-–—/]+|[.,،؛;:!?؟…«»"'()\-–—/]+$/g, ''))
    .filter((t) => /[\p{L}\p{N}]/u.test(t));
}

export function sentences(text) {
  return clean(text)
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => tokenize(s).length);
}

export const lines = (text) =>
  clean(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const lettersOf = (tok) => tok.replace(DIACRITIC, '').replace(/[^\p{L}]/gu, '');
const isNumeric = (tok) => /[0-9٠-٩]/.test(tok) || /%/.test(tok);

// X counts most characters as 1, emoji as 2, and every URL as 23.
export function xWeightedLength(text) {
  const t = clean(text);
  const urls = t.match(URL) ?? [];
  let rest = t.replace(URL, '');
  const emoji = rest.match(EMOJI)?.length ?? 0;
  rest = rest.replace(EMOJI, '');
  return [...rest].length + emoji * 2 + urls.length * 23;
}

export function textStats(text) {
  const raw = clean(text);
  const tokens = tokenize(raw);
  const normalized = normalizeArabic(raw);
  const sents = sentences(raw);
  const ls = lines(raw);
  const words = tokens.length;
  const sentenceWords = sents.map((s) => tokenize(s).length);
  const letters = tokens.map(lettersOf).join('');
  const arabicLetters = [...letters].filter((c) => ARABIC_LETTER.test(c)).length;
  const latinWords = tokens.filter((t) => LATIN_WORD.test(t) && !t.startsWith('@') && !t.startsWith('#')).length;
  const punctuation = (raw.match(PUNCT) ?? []).length;
  const questions = (raw.match(/[?؟]/g) ?? []).length;
  const exclamations = (raw.match(/!/g) ?? []).length;
  const ellipses = (raw.match(/…|\.\.\./g) ?? []).length;
  const numericTokens = tokens.filter(isNumeric);
  const numberWords = tokens.filter(isNumberWord);
  const listItems = ls.filter((l) => LIST_LINE.test(l)).length;
  const numberedItems = ls.filter((l) => NUMBERED_LINE.test(l)).length;
  const content = tokens.filter((t) => !isStopword(t) && !isNumeric(t));
  const longWords = content.filter((t) => lettersOf(t).length > 6).length;

  // Repetition among content words, on their loose form without the article.
  const counts = new Map();
  for (const t of content) {
    const v = variants(t).sort((a, b) => a.length - b.length)[0];
    if (v.length < 3) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const repeated = [...counts.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);
  const maxRepeat = Math.max(0, ...counts.values());

  const lex = (kind) => hits(kind, tokens, normalized);
  // Second person: «أنت، لك، عليك…» or the suffix «ـك» on nouns (دماغك،
  // يومك), minus a few words that end in ك. Each token counts once.
  const NOT_SUFFIX = new Set(['ذلك', 'كذلك', 'لذلك', 'هناك', 'هنالك', 'تلك', 'اولئك', 'مبارك', 'ملك', 'سمك', 'شبك', 'مشترك', 'ممالك']);
  const directAddress = tokens.filter((t) => {
    const n = normalizeArabic(t);
    if (hits('secondPerson', [t], n).n) return true;
    return n.length >= 4 && /ك$/.test(n) && !NOT_SUFFIX.has(n) && ARABIC_LETTER.test(n);
  }).length;
  const firstPerson = lex('firstPerson').n;
  const imperatives = lex('imperative').n;
  const emotional = lex('emotional').n + exclamations;
  const curiosityCues = lex('curiosity').n + (ellipses ? 1 : 0);
  const units = lex('units').n + (raw.match(/%/g) ?? []).length;
  const generic = lex('generic').n;
  const research = lex('research').n;
  const hostile = lex('hostile').n;
  const bait = lex('bait');

  const avgSentenceWords = sentenceWords.length ? words / sentenceWords.length : words;
  const maxSentenceWords = Math.max(0, ...sentenceWords);
  const longWordRatio = content.length ? longWords / content.length : 0;
  // A readability proxy in the spirit of OSMAN (El-Haj & Rayson 2016): shorter
  // sentences and fewer long words read faster. Not the OSMAN score itself.
  const readability = words ? readabilityOf(avgSentenceWords, longWordRatio) : null;
  const specificity = clamp01(0.45 * saturate(numericTokens.length + numberWords.length, 1.5) + 0.35 * saturate(units, 1) + 0.2 * (words ? clamp01(1 - generic / Math.max(1, words / 8)) : 0));
  const informationDensity = words ? content.length / words : 0;

  return {
    chars: [...raw.replace(/\s/g, '')].length,
    words,
    sentences: sentenceWords.length,
    avgSentenceWords: round(avgSentenceWords, 1),
    maxSentenceWords,
    firstSentenceWords: sentenceWords[0] ?? 0,
    lines: ls.length,
    lineBreaks: Math.max(0, ls.length - 1),
    paragraphs: raw.split(/\n\s*\n/).filter((p) => p.trim()).length,
    arabicRatio: letters.length ? round(arabicLetters / letters.length) : 0,
    latinWords,
    diacritics: (raw.match(DIACRITIC) ?? []).length,
    punctuationDensity: words ? round(punctuation / words) : 0,
    questions,
    exclamations,
    ellipses,
    numbers: numericTokens.length + numberWords.length,
    digits: { latn: (raw.match(/[0-9]/g) ?? []).length, arab: (raw.match(/[٠-٩]/g) ?? []).length },
    hashtags: (raw.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length,
    mentions: (raw.match(/(^|\s)@[A-Za-z0-9_]+/g) ?? []).length,
    links: (raw.match(URL) ?? []).length,
    emojis: (raw.match(EMOJI) ?? []).length,
    listItems,
    numberedList: numberedItems >= 2,
    directAddress,
    firstPerson,
    imperatives,
    emotionalCues: emotional,
    curiosityCues,
    units,
    genericWords: generic,
    researchClaims: research,
    hostileWords: hostile,
    baitPhrases: bait.found,
    contentWords: content.length,
    longWordRatio: round(longWordRatio),
    readability,
    specificity: round(specificity),
    informationDensity: round(informationDensity),
    redundancy: content.length ? round(repeated / content.length) : 0,
    maxRepeat,
    conversationality: round(clamp01(0.35 * saturate(questions, 1) + 0.35 * saturate(directAddress, 2) + 0.15 * saturate(firstPerson, 1) + 0.15 * saturate(imperatives, 1))),
    emotionalIntensity: round(clamp01(saturate(emotional, 1.5))),
    xLength: xWeightedLength(raw),
  };
}

// Cue counts used by intent and hook classification.
export function cues(text) {
  const tokens = tokenize(text);
  const normalized = normalizeArabic(clean(text));
  const out = {};
  for (const kind of ['question', 'curiosity', 'warning', 'myth', 'comparison', 'tutorial', 'education', 'motivation', 'story', 'opinion', 'news', 'entertainment', 'controversy', 'personal', 'research', 'contrast', 'payoff', 'openLoop', 'maxim']) {
    out[kind] = hits(kind, tokens, normalized).n;
  }
  return out;
}

export const startsWithNumber = (text) => {
  const first = tokenize(text)[0] ?? '';
  return /^[0-9٠-٩]/.test(first) || isNumberWord(first);
};

export { higherIsBetter };
