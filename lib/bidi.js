// Mixed Arabic/Latin text handling for the browser renderer.
// Strategy: find every run that must keep LTR order (Latin words, numbers,
// handles, hashtags, URLs, emails, phones, dates) and render it inside an
// isolate (<bdi dir="ltr">). Isolation stops the run's direction leaking into
// the surrounding Arabic, which is what flips "50%" into "%50" or reverses
// the digit groups of "+966 50 123 4567".

const DIGITS = '0-9٠-٩۰-۹';
const TOKEN = new RegExp(`[@#+$€£]?[A-Za-z${DIGITS}][A-Za-z${DIGITS}_.\\-/:%&?=+@#'’~]*`, 'g');
// Gaps that keep two LTR tokens in one run ("React, Vue", "+966 50 123").
// Arabic letters or punctuation (، ؛ ؟) in the gap split them, so
// "Notion و Google" stays two runs ordered right-to-left.
const JOIN = /^[ \t ,&|/\-–—]+$/;
const TRAILING = /[.:?'’\-]+$/;

export function segmentBidi(line) {
  const out = [];
  const push = (text, ltr) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev && !prev.ltr && !ltr) prev.text += text;
    else out.push({ text, ltr });
  };

  let last = 0;
  let run = null;
  const flush = () => {
    push(line.slice(last, run.start), false);
    push(line.slice(run.start, run.end), true);
    last = run.end;
  };

  for (const m of line.matchAll(TOKEN)) {
    const start = m.index;
    const end = start + m[0].replace(TRAILING, '').length;
    if (run && JOIN.test(line.slice(run.end, start))) {
      run.end = end;
      continue;
    }
    if (run) flush();
    run = { start, end };
  }
  if (run) flush();
  push(line.slice(last), false);
  return out;
}

// *word* marks an accent-coloured span. Markers are stripped before bidi
// segmentation so an accent never splits an LTR run in two.
const ACCENT = /\*([^*\n]+)\*/g;

function stripAccents(input) {
  let text = '';
  const flags = [];
  let last = 0;
  const add = (str, accent) => {
    text += str;
    for (let i = 0; i < str.length; i++) flags.push(accent);
  };
  for (const m of input.matchAll(ACCENT)) {
    add(input.slice(last, m.index), false);
    add(m[1], true);
    last = m.index + m[0].length;
  }
  add(input.slice(last), false);
  return { text, flags };
}

function splitByFlags(str, flags, offset) {
  const parts = [];
  for (let i = 0; i < str.length; i++) {
    const accent = flags[offset + i];
    const prev = parts[parts.length - 1];
    if (prev && prev.accent === accent) prev.text += str[i];
    else parts.push({ text: str[i], accent });
  }
  return parts;
}

// Returns lines → segments ({ ltr, parts }) → parts ({ text, accent }).
export function richLines(input = '') {
  const { text, flags } = stripAccents(input);
  let offset = 0;
  return text.split('\n').map((line) => {
    let pos = offset;
    const segments = segmentBidi(line).map((seg) => {
      const parts = splitByFlags(seg.text, flags, pos);
      pos += seg.text.length;
      return { ltr: seg.ltr, parts };
    });
    offset += line.length + 1;
    return segments;
  });
}
