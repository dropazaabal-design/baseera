import { Fragment } from 'react';
import { richLines } from '../lib/bidi.js';

// Renders user text with: LTR runs isolated in <bdi dir="ltr">
// (unicode-bidi: isolate), *accent* spans, and line breaks. With
// `highlight` (a colour), accent spans are drawn on a marker band in the
// text's own colour instead of the accent colour.
const marker = (color) => ({
  background: `linear-gradient(to bottom, transparent 52%, ${color} 52%, ${color} 84%, transparent 84%)`,
  WebkitBoxDecorationBreak: 'clone',
  boxDecorationBreak: 'clone',
  padding: '0 .16em',
  margin: '0 -.16em',
});

export default function RichText({ text, highlight = null }) {
  return richLines(text ?? '').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.map((seg, si) => {
        const parts = seg.parts.map((p, pi) =>
          p.accent ? (
            <span key={pi} className={highlight ? undefined : 'text-(--c-accent)'} style={highlight ? marker(highlight) : undefined}>
              {p.text}
            </span>
          ) : (
            <Fragment key={pi}>{p.text}</Fragment>
          ),
        );
        return seg.ltr ? (
          <bdi key={si} dir="ltr">
            {parts}
          </bdi>
        ) : (
          <Fragment key={si}>{parts}</Fragment>
        );
      })}
    </Fragment>
  ));
}
