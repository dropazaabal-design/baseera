import { Fragment } from 'react';
import { richLines } from '../lib/bidi.js';

// Renders user text with: LTR runs isolated in <bdi dir="ltr">
// (unicode-bidi: isolate), *accent* spans, and line breaks.
export default function RichText({ text }) {
  return richLines(text ?? '').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.map((seg, si) => {
        const parts = seg.parts.map((p, pi) =>
          p.accent ? (
            <span key={pi} className="text-(--c-accent)">
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
