import { memo, useLayoutEffect, useRef } from 'react';
import RichText from '../RichText';
import { FONTS } from '../../lib/fonts.js';
import { assetSrc } from '../../lib/studio/render.js';
import { pageTheme, resolveColor, resolveFont } from '../../lib/studio/theme.js';

// Renders one DesignPage at its real pixel size. Every element is absolutely
// positioned at its frame, in z order. Text keeps the classic editor's
// Arabic safety: RichText isolates LTR runs, the root disables synthetic
// bold and letter-spacing (app/globals.css .slide-root), and fonts come from
// the same bundled files the exporter embeds.

// Text that overflows its frame (the layout estimate can be a few % off the
// real browser) shrinks one px at a time, never below its minFontSize; if it
// still does not fit it is flagged for the quality panel. The inner block is
// measured rather than scrollHeight, which also counts the glyph overhang of
// tall Arabic fonts and would flag single lines that fit. The box does not
// clip: Cairo's descent passes the line box, and clipping it hid the dots
// of a final ي on the last line (read as ى).
function fitText(outer, inner, size, min) {
  let px = size;
  outer.style.fontSize = `${px}px`;
  const fits = () => inner.offsetHeight <= outer.clientHeight + 1 && inner.scrollWidth <= outer.clientWidth + 1;
  while (!fits() && px > min) {
    px -= 1;
    outer.style.fontSize = `${px}px`;
  }
  outer.toggleAttribute('data-overflow', !fits());
  outer.dataset.fontSize = String(px);
}

function TextEl({ el, color, family, highlight }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const { style } = el;
  useLayoutEffect(() => {
    const run = () => fitText(outer.current, inner.current, style.fontSize, style.minFontSize ?? style.fontSize);
    run();
    document.fonts?.addEventListener('loadingdone', run);
    return () => document.fonts?.removeEventListener('loadingdone', run);
  });
  return (
    <div
      ref={outer}
      dir={style.direction}
      className="h-full w-full"
      style={{
        fontFamily: `${family}, sans-serif`,
        fontSize: style.fontSize,
        fontWeight: style.weight,
        color,
        lineHeight: style.lineHeight,
        textAlign: style.align,
      }}
    >
      <div ref={inner} data-at-p="" style={{ whiteSpace: style.nowrap ? 'nowrap' : 'pre-line' }}>
        <RichText text={el.text} highlight={highlight} />
      </div>
    </div>
  );
}

function ShapeEl({ el, colors }) {
  const fill = el.fill === 'none' ? 'transparent' : resolveColor(el.fill, colors);
  const stroke = el.stroke ? resolveColor(el.stroke, colors) : null;
  if (el.shape === 'path') {
    return (
      <svg viewBox={`0 0 ${el.viewBox[0]} ${el.viewBox[1]}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible', display: 'block' }}>
        <path
          d={el.path}
          fill={el.fill === 'none' ? 'none' : fill}
          stroke={stroke ?? 'none'}
          strokeWidth={el.strokeWidth ?? 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <div
      className="h-full w-full"
      style={{
        background: fill,
        borderRadius: el.shape === 'ellipse' ? '50%' : el.radius ?? 0,
        boxShadow: stroke && el.strokeWidth ? `inset 0 0 0 ${el.strokeWidth}px ${stroke}` : undefined,
      }}
    />
  );
}

function ImageEl({ el, asset, colors }) {
  const src = assetSrc(asset, colors);
  if (!src) {
    return <div className="grid h-full w-full place-items-center rounded-[24px] border-4 border-dashed border-current opacity-40" style={{ color: colors.muted }} />;
  }
  return <img src={src} alt={el.alt} draggable={false} className="block h-full w-full" style={{ objectFit: el.fit ?? 'contain', borderRadius: el.radius ?? 0 }} />;
}

function ScenePage({ doc, page, editing = false, selected = null, onSelect, onPointerDown }) {
  const theme = pageTheme(doc, page);
  const { colors, fonts } = theme;
  const elements = [...page.elements].sort((a, b) => a.z - b.z);
  return (
    <div
      dir="rtl"
      lang="ar"
      data-page={page.id}
      className="slide-root relative overflow-hidden"
      style={{
        width: page.widthPx,
        height: page.heightPx,
        background: colors.bg,
        color: colors.text,
        '--c-bg': colors.bg,
        '--c-surface': colors.surface,
        '--c-text': colors.text,
        '--c-muted': colors.muted,
        '--c-accent': colors.accent,
        '--c-on-accent': colors.onAccent,
      }}
      onPointerDown={editing ? (e) => e.target === e.currentTarget && onSelect?.(null) : undefined}
    >
      {elements.map((el) => {
        if (el.hidden && !editing) return null;
        const font = el.kind === 'text' ? resolveFont(el.style.fontFamily, fonts) : null;
        return (
          <div
            key={el.id}
            data-el={el.id}
            data-anim={el.anim}
            className="absolute"
            style={{
              left: el.frame.x,
              top: el.frame.y,
              width: el.frame.width,
              height: el.frame.height,
              transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
              opacity: el.hidden ? 0.25 : el.opacity ?? 1,
              outline: editing && selected === el.id ? '4px solid #6366F1' : undefined,
              outlineOffset: 4,
              cursor: editing ? (el.locked ? 'not-allowed' : 'move') : undefined,
            }}
            onPointerDown={editing ? (e) => onPointerDown?.(e, el) : undefined}
          >
            {el.kind === 'text' && <TextEl el={el} color={resolveColor(el.style.color, colors)} family={FONTS[font]?.family ?? "'Cairo'"} highlight={el.style.highlight ? resolveColor(el.style.highlight, colors) : null} />}
            {el.kind === 'shape' && <ShapeEl el={el} colors={colors} />}
            {el.kind === 'image' && <ImageEl el={el} asset={doc.assets?.[el.assetId]} colors={colors} />}
          </div>
        );
      })}
    </div>
  );
}

export default memo(ScenePage);
