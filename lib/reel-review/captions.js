const clock = (value) => {
  const parts = value.replace(',', '.').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
};
const plain = (value) => String(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// Caption timings are supplied evidence, not an ASR claim or proof that
// the rendered Arabic looks correct. JSON units are explicit at the boundary.
// `lines` keeps the cue's explicit line breaks (for the line-length policy).
export function parseCaptions(text, { json = false } = {}) {
  let cues;
  if (json) {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data.captions;
    if (!Array.isArray(rows)) throw new Error('caption JSON must be an array or {captions: []}');
    cues = rows.map((row) => {
      if (typeof row.text !== 'string') throw new Error('caption text must be a string');
      const ms = Object.hasOwn(row, 'startMs') || Object.hasOwn(row, 'endMs');
      const lines = row.text.split('\n').map(plain).filter(Boolean);
      return { start: ms ? row.startMs / 1000 : row.start, end: ms ? row.endMs / 1000 : row.end, text: plain(row.text), lines };
    });
  } else {
    cues = [];
    for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n');
      const index = lines.findIndex((line) => line.includes('-->'));
      if (index < 0) continue;
      const match = /((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/.exec(lines[index]);
      if (!match) throw new Error('invalid subtitle timing');
      const textLines = lines.slice(index + 1).map(plain).filter(Boolean);
      cues.push({ start: clock(match[1]), end: clock(match[2]), text: textLines.join(' '), lines: textLines });
    }
    if (text.trim() && !cues.length) throw new Error('no timed captions found (use VTT, SRT or caption JSON)');
  }
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || !cue.text)
      throw new Error('captions need nonempty text and finite start/end with 0 <= start < end');
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function captionVtt(cues) {
  const time = (seconds) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  return `WEBVTT\n\n${cues.map((cue, i) => `${i + 1}\n${time(cue.start)} --> ${time(cue.end)}\n${cue.text}\n`).join('\n')}`;
}
