import { useEffect, useLayoutEffect, useRef } from 'react';
import { findFitSize } from '../lib/fit.js';

// Auto-scaling engine. The box takes its size from the layout (flex-1), and
// its font-size is binary-searched between min and max until the content
// stops overflowing. Children size themselves in `em`, so one search scales
// a whole composition (headline, subtitle, list) and keeps its proportions.
// Measuring beats estimating from character count: Arabic glyph widths vary
// a lot between fonts and letter forms.
function fit(box, min, max) {
  const fits = (px) => {
    box.style.fontSize = `${px}px`;
    return box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
  };
  const size = findFitSize(fits, min, max);
  const ok = fits(size); // also applies the final size
  // Below `min` text stops being readable, so instead of shrinking further
  // the box is flagged and the editor warns the user.
  box.toggleAttribute('data-overflow', !ok);
}

const ALIGN = { start: 'mb-auto', center: 'my-auto', end: 'mt-auto' };

export default function FitBox({ min, max, align = 'center', className = '', children }) {
  const ref = useRef(null);

  // Re-fit after every render (text edits, font or template changes).
  useLayoutEffect(() => fit(ref.current, min, max));

  // Re-fit when the box resizes or a web font finishes loading.
  useEffect(() => {
    const box = ref.current;
    const run = () => fit(box, min, max);
    const ro = new ResizeObserver(run);
    ro.observe(box);
    document.fonts.addEventListener('loadingdone', run);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', run);
    };
  }, [min, max]);

  return (
    <div ref={ref} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`} style={{ fontSize: max }}>
      {/* auto margins centre the content but collapse to 0 on overflow, so
          overflow always shows up in scrollHeight */}
      <div className={`w-full ${ALIGN[align]}`}>{children}</div>
    </div>
  );
}
