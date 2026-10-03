import { buildRuns } from './runs.js';
import { normalizeSpec } from './spec.js';

// Markup for Arabic text: the paragraph carries lang and dir, alignment is
// a separate property, mixed runs are isolated with <bdi> (unicode-bidi:
// isolate), and marks are spans. Nothing here changes a character: no
// reversal, no presentation forms, no bidi controls, no bidi-override.

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The marker band behind *marked* words: the lower part of the line, a
// little wider than the words, in the text's own colour. Padding and the
// negative margin cancel out, so the line breaks where it was measured.
export const MARKER = { top: 0.52, bottom: 0.84, pad: 0.16 };
const pct = (x) => `${Math.round(x * 100)}%`;
const em = (x) => `${String(x).replace(/^0\./, '.')}em`;
export const markerCss = (color) =>
  `background:linear-gradient(to bottom,transparent ${pct(MARKER.top)},${color} ${pct(MARKER.top)},${color} ${pct(MARKER.bottom)},transparent ${pct(MARKER.bottom)});-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 ${em(MARKER.pad)};margin:0 -${em(MARKER.pad)}`;

// The same band as a React style object (editor).
export const markerStyle = (color) => ({
  background: `linear-gradient(to bottom, transparent ${pct(MARKER.top)}, ${color} ${pct(MARKER.top)}, ${color} ${pct(MARKER.bottom)}, transparent ${pct(MARKER.bottom)})`,
  WebkitBoxDecorationBreak: 'clone',
  boxDecorationBreak: 'clone',
  padding: `0 ${em(MARKER.pad)}`,
  margin: `0 -${em(MARKER.pad)}`,
});

/**
 * Inline markup of the runs: paragraphs joined by <br>, isolates as
 * <bdi dir>, accent as a coloured span, highlight as a marker band (or, with
 * marks "none", a bare span the motion layer draws its own band behind).
 * `annotate` adds data attributes (run kind, mark) that change nothing on
 * screen; the editor and preview markup stay byte-identical without them.
 */
export function runsHtml(runs, { accent = 'currentColor', highlight = null, marks = 'static', annotate = false } = {}) {
  const part = (r) => {
    const t = esc(r.text);
    if (r.mark === 'accent') return `<span${annotate ? ' data-at-mark="accent"' : ''} style="color:${accent}">${t}</span>`;
    if (r.mark === 'highlight') {
      if (marks === 'none') return `<span data-at-mark="highlight">${t}</span>`;
      return `<span${annotate ? ' data-at-mark="highlight"' : ''} style="${markerCss(highlight ?? accent)}">${t}</span>`;
    }
    return t;
  };
  return runs.paragraphs
    .map((p) => {
      let html = '';
      for (let i = 0; i < p.runs.length; ) {
        const r = p.runs[i];
        if (r.iso === null) {
          html += part(r);
          i++;
          continue;
        }
        let inner = '';
        let j = i;
        while (j < p.runs.length && p.runs[j].iso === r.iso) inner += part(p.runs[j++]);
        html += `<bdi dir="${r.dir}"${annotate && r.label ? ` data-at-run="${r.label}"` : ''}>${inner}</bdi>`;
        i = j;
      }
      return html;
    })
    .join('<br>');
}

// The paragraph style shared by every renderer of a spec. Letter spacing
// is fixed at 0 (it breaks Arabic joining), synthetic bold is off (a
// missing weight is reported, not faked), and words never break inside.
export function paragraphStyle(spec, fontSize = spec.fontSize) {
  return [
    'margin:0',
    `font-family:'${spec.font.family}'`,
    `font-weight:${spec.font.weight}`,
    `font-style:${spec.font.style ?? 'normal'}`,
    `font-size:${fontSize}px`,
    `line-height:${spec.lineHeight}`,
    `color:${spec.color}`,
    `text-align:${spec.align}`,
    'white-space:pre-line',
    'overflow-wrap:normal',
    'word-break:normal',
    'letter-spacing:0',
    'word-spacing:0',
    'font-synthesis:none',
    'font-kerning:normal',
    'unicode-bidi:isolate',
  ].join(';');
}

/**
 * A complete text box: an outer box (width and padding) and the paragraph.
 * Used as is by HTML video engines, by the Chromium typesetter and by the
 * motion HTML adapter.
 */
export function arabicTextHtml(input, { marks = 'static', fontSize, id = null } = {}) {
  const spec = normalizeSpec(input);
  const runs = buildRuns(spec);
  const p = spec.padding;
  const inner = runsHtml(runs, { accent: spec.palette.accent ?? spec.color, highlight: spec.palette.highlight ?? null, marks, annotate: true });
  return `<div class="at-box" data-at-box${id ? ` data-at-id="${esc(id)}"` : ''} style="position:relative;box-sizing:border-box;width:${spec.width}px;padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px"><div class="at-p" data-at-p lang="${esc(spec.lang)}" dir="${spec.direction}" style="${paragraphStyle(spec, fontSize ?? spec.fontSize)}">${inner}</div></div>`;
}
