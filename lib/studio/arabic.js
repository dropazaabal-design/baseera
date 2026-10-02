// Arabic text helpers shared by commands, memory and the quality gate.

const DIACRITICS = /[ً-ٰٟـ]/g;
const BIDI = /[‎‏‪-‮⁦-⁩؜]/g;

// Loose form for matching words in instructions: no diacritics or tatweel,
// one alef, ى→ي, ة→ه, hamza seats folded, Western digits, no punctuation.
// Never used to compare approved text (see compareText): there, a changed
// hamza or ة is a real error.
export function normalizeArabic(text) {
  return String(text ?? '')
    .replace(DIACRITICS, '')
    .replace(BIDI, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase()
    .replace(/[،؛؟!?.,:;«»"'()*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonical form for comparing an approved text with what a destination or
// OCR returned: Unicode NFC, presentation forms folded (NFKC on that range
// only), no bidi controls, no accent markers, single spaces. Letters,
// hamzas, ة/ه and digits stay exactly as they are.
export function canonicalText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[ﭐ-﷿ﹰ-﻿]/g, (ch) => ch.normalize('NFKC'))
    .replace(BIDI, '')
    .replace(/ـ/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const toWesternDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

// Numbers as values, whatever the digit system: "٢٠٢٦" and "2026" are equal.
export const numbersIn = (text) => (toWesternDigits(canonicalText(text)).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));

export const words = (text) => canonicalText(text).split(' ').filter(Boolean);

const stripMarks = (w) => w.replace(/[ً-ٰٟ]/g, '');
const letters = (w) => [...stripMarks(w)].sort().join('');
const PUNCT = /[،؛؟!?.,:;«»"'()\-–—…]/g;
const foldHamza = (w) => w.replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '');

function editDistance(a, b) {
  const A = [...a];
  const B = [...b];
  const d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...new Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) d[0][j] = j;
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[A.length][B.length];
}

// Word-level comparison of an approved text with an observed one (a Canva
// read-back, an OCR pass). Returns [] when identical, otherwise each
// difference classified: reordered letters (عيوبك → عبويك), substituted
// letters, a changed number (٢ → ٧), missing or extra words, changed marks.
export function compareText(expected, observed) {
  const a = words(expected);
  const b = words(observed);
  if (a.join(' ') === b.join(' ')) return [];
  // LCS alignment on whole words.
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < b.length && (i === a.length || L[i][j + 1] >= L[i + 1][j])) ops.push({ op: 'add', word: b[j++], at: i });
    else ops.push({ op: 'del', word: a[i++], at: i - 1 });
  }
  // Pair a deletion with an insertion at the same spot as a substitution.
  const out = [];
  const used = new Set();
  ops.forEach((d, k) => {
    if (d.op !== 'del' || used.has(k)) return;
    const pair = ops.findIndex((x, n) => !used.has(n) && x.op === 'add' && Math.abs(x.at - d.at) <= 1);
    if (pair < 0) {
      out.push({ kind: 'missing-word', expected: d.word });
      used.add(k);
      return;
    }
    used.add(k);
    used.add(pair);
    const got = ops[pair].word;
    const en = toWesternDigits(d.word);
    const gn = toWesternDigits(got);
    let kind = 'changed-word';
    const bare = (w) => stripMarks(w).replace(PUNCT, '');
    if (/\d/.test(en) || /\d/.test(gn)) kind = en.replace(/\D/g, '') !== gn.replace(/\D/g, '') ? 'changed-number' : en.replace(/\d/g, '') !== gn.replace(/\d/g, '') ? 'changed-punctuation' : 'changed-digit-system';
    else if (d.word.replace(PUNCT, '') === got.replace(PUNCT, '')) kind = 'changed-punctuation';
    else if (stripMarks(d.word) === stripMarks(got)) kind = 'changed-marks';
    else if (bare(d.word).length > 2 && [...bare(d.word)].reverse().join('') === bare(got)) kind = 'reversed-word';
    else if (foldHamza(bare(d.word)) === foldHamza(bare(got))) kind = 'changed-hamza';
    else if (bare(d.word).replace(/ة/g, 'ه') === bare(got).replace(/ة/g, 'ه')) kind = 'changed-taa-marbuta';
    else if (bare(d.word).replace(/ى/g, 'ي') === bare(got).replace(/ى/g, 'ي')) kind = 'changed-alef-maqsura';
    else if (letters(d.word) === letters(got)) kind = 'reordered-letters';
    else if (editDistance(stripMarks(d.word), stripMarks(got)) <= 2) kind = 'changed-letters';
    out.push({ kind, expected: d.word, observed: got });
  });
  ops.forEach((x, k) => {
    if (!used.has(k) && x.op === 'add') out.push({ kind: 'extra-word', observed: x.word });
  });
  return out;
}

export const DIFF_LABEL = {
  'reordered-letters': 'حروف تبدّل ترتيبها',
  'changed-letters': 'حروف تغيّرت',
  'changed-number': 'رقم تغيّر',
  'changed-digit-system': 'نظام الأرقام تغيّر',
  'changed-marks': 'التشكيل تغيّر',
  'changed-punctuation': 'علامة ترقيم تغيّرت',
  'changed-hamza': 'همزة تغيّرت',
  'changed-taa-marbuta': 'التاء المربوطة تغيّرت',
  'changed-alef-maqsura': 'الألف المقصورة تغيّرت',
  'reversed-word': 'الكلمة معكوسة الترتيب (خطأ اتجاه)',
  'changed-word': 'كلمة تغيّرت',
  'missing-word': 'كلمة ناقصة',
  'extra-word': 'كلمة زائدة',
};
