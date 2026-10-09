/*! Caption building adapted from PurffleShorts `purffle_shorts/timing.py` (transfer_timings,
 * estimate_timings, caption_chunks), https://github.com/Chamanrajragu/purffle-shorts,
 * MIT License, Copyright (c) 2025 Purffle Studios. Full notice: lib/reel-review/licenses/purffle-shorts.LICENSE.
 * Changed for Arabic: Arabic punctuation (؟ ، ؛ …) ends captions, alef/ya/ta-marbuta/harakat are
 * normalised for matching, a lone conjunction token from ASR is joined to its word, and every cue
 * is checked against Baseera's own reading-speed policy instead of being left as produced. */
import { CAPTION_POLICY } from './report.js';

const DIACRITICS = /[ً-ٰٟـ]/g;
const SENTENCE_END = /[.!?؟…]["'»”)\]]*$/u;
const CLAUSE_END = /[,،;؛:]["'»”)\]]*$/u;
const round = (n) => Math.round(n * 1000) / 1000;
const visible = (text) => [...text.normalize('NFC').replace(/[ً-ٰٟ]/g, '')].length;
const letters = (text) => (text.normalize('NFC').replace(DIACRITICS, '').match(/[\p{L}\p{N}]/gu) ?? []).length;

/** Matching form of a word: no harakat or tatweel, one alef, ي for ى, ه for ة, Western digits, no punctuation. */
export function normalizeWord(word) {
  return String(word).normalize('NFC').replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Word timings from ASR output: an array of {word|w|text, start|s, end|e}, {words: []} or {segments: [{words: []}]}. */
export function readWords(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words
    : Array.isArray(data?.segments) ? data.segments.flatMap((segment) => segment.words ?? []) : null;
  if (!rows) throw new Error('word timings must be an array, {words: []} or {segments: [{words: []}]}');
  const words = rows.map((row) => ({ text: String(row.word ?? row.w ?? row.text ?? '').trim(), start: Number(row.start ?? row.s), end: Number(row.end ?? row.e) }))
    .filter((word) => word.text);
  for (const word of words)
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end < word.start) throw new Error('each word needs finite start/end seconds with 0 <= start <= end');
  // ASR often splits a one-letter conjunction or preposition off its word («و» «تغافل»); join it.
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (/^[وفبل]$/u.test(normalizeWord(words[i].text)) && words[i + 1]) {
      out.push({ text: words[i].text + words[i + 1].text, start: words[i].start, end: words[i + 1].end });
      i++;
    } else out.push(words[i]);
  }
  return out.sort((a, b) => a.start - b.start);
}

// Relative reading weight of a word, with the pause that follows sentence or clause punctuation.
const weight = (word) => normalizeWord(word).length + 2 + (SENTENCE_END.test(word) ? 4 : CLAUSE_END.test(word) ? 2 : 0);

function spread(tokens, from, to) {
  const total = tokens.reduce((sum, token) => sum + weight(token), 0) || 1;
  let cursor = from;
  return tokens.map((token) => {
    const length = (to - from) * weight(token) / total;
    const word = { text: token, start: cursor, end: cursor + length, matched: false };
    cursor += length;
    return word;
  });
}

/** Moves ASR timings onto the locked script's own words (LCS on normalised forms). Script words the
 *  recogniser missed or misheard share the time between their matched neighbours. */
export function alignScript(script, asrWords, { minMatched = 0.5 } = {}) {
  // A line break in the script is a hard caption break (scripts written line by line keep their lines).
  const lineEnds = new Set();
  const tokens = [];
  for (const line of String(script).normalize('NFC').split(/\n/)) {
    const lineTokens = line.split(/\s+/).filter((token) => normalizeWord(token));
    tokens.push(...lineTokens);
    if (lineTokens.length) lineEnds.add(tokens.length - 1);
  }
  const a = tokens.map(normalizeWord), b = asrWords.map((word) => normalizeWord(word.text));
  if (!tokens.length || !asrWords.length) throw new Error('script and word timings must both be nonempty');
  if (a.length * b.length > 4e6) throw new Error('script too long to align in one pass; split it by scene');
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++; else j++;
  }
  const matchedRatio = pairs.length / tokens.length;
  if (matchedRatio < minMatched)
    throw new Error(`script and speech match on ${Math.round(matchedRatio * 100)}% of the script's words; check that they belong together`);
  const out = [];
  let si = 0, prevAsr = -1;
  for (const [i, j] of [...pairs, [tokens.length, asrWords.length]]) {
    if (i > si) {
      // Unmatched script words: over the unmatched speech between the anchors, or the gap between them.
      const gap = asrWords.slice(prevAsr + 1, j);
      const from = gap.length ? gap[0].start : prevAsr >= 0 ? asrWords[prevAsr].end : asrWords[0].start;
      const to = gap.length ? gap.at(-1).end : j < asrWords.length ? asrWords[j].start : asrWords.at(-1).end;
      out.push(...spread(tokens.slice(si, i), from, Math.max(from, to)).map((word, k) => ({ ...word, index: si + k })));
    }
    if (i < tokens.length) out.push({ text: tokens[i], start: asrWords[j].start, end: asrWords[j].end, matched: true, index: i });
    si = i + 1; prevAsr = j;
  }
  for (let k = 0; k < out.length; k++) {
    if (k) out[k].start = Math.max(out[k].start, out[k - 1].start);
    out[k].end = Math.max(out[k].end, out[k].start + 0.04);
  }
  return { words: out.map(({ index, ...word }) => ({ ...word, start: round(word.start), end: round(word.end), ...(lineEnds.has(index) && { lineEnd: true }) })),
    alignment: { scriptWords: tokens.length, speechWords: asrWords.length, matched: pairs.length, matchedRatio: round(matchedRatio) } };
}

const rate = (cue) => {
  const duration = cue.end - cue.start;
  return { duration, wps: cue.words.length / duration, cps: letters(cue.words.map((word) => word.text).join(' ')) / duration };
};
const readable = (cue, policy) => {
  const { duration, wps, cps } = rate(cue);
  return duration >= policy.minDuration - 1e-9 && wps <= policy.maxWordsPerSecond + 1e-9 && cps <= policy.maxCharactersPerSecond + 1e-9;
};
const needed = (cue, policy) => Math.max(policy.minDuration, cue.words.length / policy.maxWordsPerSecond,
  letters(cue.words.map((word) => word.text).join(' ')) / policy.maxCharactersPerSecond);

function twoLines(text, lineChars) {
  if (visible(text) <= lineChars) return [text];
  const parts = text.split(' ');
  let best = null;
  for (let k = 1; k < parts.length; k++) {
    const first = parts.slice(0, k).join(' '), second = parts.slice(k).join(' ');
    const score = Math.max(visible(first), visible(second));
    if (!best || score < best.score) best = { score, lines: [first, second] };
  }
  return best ? best.lines : [text];
}

const length = (group) => visible(group.map((word) => word.text).join(' '));
function balanced(segment, maxWords, maxChars) {
  if (segment.length <= maxWords && length(segment) <= maxChars) return [segment];
  const n = segment.length;
  for (let parts = 2; parts <= n; parts++) {
    // best[k][i]: smallest possible longest part when the first i words form k parts
    const best = Array.from({ length: parts + 1 }, () => new Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: parts + 1 }, () => new Array(n + 1).fill(-1));
    best[0][0] = 0;
    for (let k = 1; k <= parts; k++) for (let i = 1; i <= n; i++) for (let j = k - 1; j < i; j++) {
      const piece = segment.slice(j, i);
      if (piece.length > maxWords || best[k - 1][j] === Infinity) continue;
      const cost = Math.max(best[k - 1][j], length(piece));
      if (cost < best[k][i]) { best[k][i] = cost; cut[k][i] = j; }
    }
    if (best[parts][n] <= maxChars || parts === n) {
      const out = [];
      for (let k = parts, i = n; k > 0; i = cut[k][i], k--) out.unshift(segment.slice(cut[k][i], i));
      return out;
    }
  }
  return segment.map((word) => [word]);
}

/** Groups timed words into caption cues: one cue per sentence or clause (punctuation, a script line end,
 *  or a pause), long ones split into balanced parts within the word and character limits; each cue is
 *  held until the next one when the gap is short. Cues that read too fast
 *  are first given the free time after them, then merged with a neighbour when that still fits on two lines. */
export function chunkCaptions(words, {
  maxWords = 8, maxChars = 42, lineChars = 28, maxGap = 0.45, hold = 0.6, tail = 0.25, lastTail = 0.4, total = null, policy = CAPTION_POLICY,
} = {}) {
  if (!(maxWords >= 1 && maxChars >= 4 && lineChars >= 4)) throw new Error('maxWords, maxChars and lineChars must be positive');
  // 1. Sentences and clauses: punctuation, a script line end, or a pause in the word timings.
  const segments = [];
  let current = [];
  for (const word of words) {
    if (current.length && word.start - current.at(-1).end > maxGap) { segments.push(current); current = []; }
    current.push(word);
    if (word.lineEnd || SENTENCE_END.test(word.text) || (CLAUSE_END.test(word.text) && current.length >= 2)) { segments.push(current); current = []; }
  }
  if (current.length) segments.push(current);
  // 2. A segment over the limits is split into the fewest balanced parts (no orphan last word).
  const groups = segments.flatMap((segment) => balanced(segment, maxWords, maxChars));
  let cues = groups.map((group) => ({ words: group, start: group[0].start, end: group.at(-1).end }));
  cues.forEach((cue, i) => {
    const next = cues[i + 1];
    if (next) cue.end = next.start - cue.end < hold ? next.start : cue.end + tail;
    else cue.end = total === null ? cue.end + lastTail : Math.min(total, cue.end + lastTail);
  });
  // Readability: use the free time after a fast cue, then merge it with a neighbour on two lines at most.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (readable(cue, policy)) continue;
      const limit = cues[i + 1]?.start ?? (total ?? cue.start + needed(cue, policy));
      cue.end = Math.max(cue.end, Math.min(limit, cue.start + needed(cue, policy)));
      if (readable(cue, policy)) continue;
      for (const k of [i + 1, i - 1]) {
        const other = cues[k];
        if (!other) continue;
        const [first, second] = k > i ? [cue, other] : [other, cue];
        const text = [...first.words, ...second.words].map((w) => w.text).join(' ');
        if (second.start - first.end > hold || visible(text) > 2 * maxChars) continue;
        const merged = { words: [...first.words, ...second.words], start: first.start, end: second.end };
        cues.splice(Math.min(i, k), 2, merged);
        break;
      }
    }
  }
  const warnings = [];
  const out = cues.map((cue, i) => {
    const text = cue.words.map((w) => w.text).join(' ');
    const lines = twoLines(text, lineChars);
    const { duration, wps, cps } = rate(cue);
    if (!readable(cue, policy)) warnings.push({ cue: i + 1, code: 'captions.fast', start: round(cue.start), end: round(cue.end),
      wordsPerSecond: round(wps), lettersPerSecond: round(cps), message: 'الكلام هنا أسرع من سياسة القراءة؛ لا يُصلح دون اختصار النص أو مدة أطول.' });
    return { start: round(cue.start), end: round(cue.end), text: lines.join('\n'), lines, words: cue.words.length, duration: round(duration) };
  });
  return { cues: out, warnings };
}

/** Word timings (+ optional locked script) → caption cues and an alignment summary. */
export function buildCaptions(wordData, { script = null, ...options } = {}) {
  const asr = readWords(wordData);
  if (!asr.length) throw new Error('no timed words found');
  const aligned = script === null ? { words: asr.map((word) => ({ ...word, matched: true })), alignment: null } : alignScript(script, asr);
  const { cues, warnings } = chunkCaptions(aligned.words, options);
  return { kind: 'baseera-captions', cues, alignment: aligned.alignment, warnings, source: script === null ? 'speech recognition text' : 'locked script, timed from speech recognition' };
}

export function captionSrt(cues) {
  const time = (seconds) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return cues.map((cue, i) => `${i + 1}\n${time(cue.start)} --> ${time(cue.end)}\n${cue.text}\n`).join('\n');
}
