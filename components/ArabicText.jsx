import { Fragment } from 'react';
import { buildRuns } from '../lib/arabic-text/runs.js';
import { markerStyle } from '../lib/arabic-text/html.js';
import { arabicTextHtml } from '../lib/arabic-text/html.js';

// ArabicText in React: the editor's renderer for every text. Text in
// logical order, isolates as <bdi dir> (unicode-bidi: isolate), marks as
// spans; the same runs as lib/arabic-text/html.js, so the editor, the HTML
// previews and the video capture draw one markup.

export function ArabicRuns({ text, spans = [], bidi = 'auto', highlight = null, accentClass = 'text-(--c-accent)' }) {
  const runs = buildRuns({ text: text ?? '', spans, bidi });
  const part = (r, key) => {
    if (r.mark === 'accent') return <span key={key} data-at-mark="accent" className={accentClass}>{r.text}</span>;
    if (r.mark === 'highlight') return <span key={key} data-at-mark="highlight" style={markerStyle(highlight ?? 'currentColor')}>{r.text}</span>;
    return <Fragment key={key}>{r.text}</Fragment>;
  };
  return runs.paragraphs.map((p, pi) => {
    const out = [];
    for (let i = 0; i < p.runs.length; ) {
      const r = p.runs[i];
      if (r.iso === null) {
        out.push(part(r, i));
        i++;
        continue;
      }
      const inner = [];
      let j = i;
      while (j < p.runs.length && p.runs[j].iso === r.iso) inner.push(part(p.runs[j], j++));
      out.push(<bdi key={i} dir={r.dir} data-at-run={r.label}>{inner}</bdi>);
      i = j;
    }
    return (
      <Fragment key={pi}>
        {pi > 0 && <br />}
        {out}
      </Fragment>
    );
  });
}

// A complete box from a spec (width, padding, font, alignment, direction),
// for HTML engines and the reel stage. Same markup as arabicTextHtml.
export default function ArabicTextBox({ spec, marks = 'static', motion = null, ...rest }) {
  return <div {...rest} {...(motion && { 'data-text-motion': JSON.stringify(motion) })} dangerouslySetInnerHTML={{ __html: arabicTextHtml(spec, { marks }) }} />;
}
