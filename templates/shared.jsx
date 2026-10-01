// Content stays clear of the plugin chrome (progress bar, logo and counter at
// the top; brand badge and swipe prompt at the bottom), which itself sits
// inside the format's safe-zone insets.
export const SAFE = { top: 170, bottom: 190, inline: 96 };

export function SafeArea({ children }) {
  return (
    <div
      className="absolute flex flex-col"
      style={{
        top: `calc(var(--inset-top) + ${SAFE.top}px)`,
        bottom: `calc(var(--inset-bottom) + ${SAFE.bottom}px)`,
        insetInline: SAFE.inline,
      }}
    >
      {children}
    </div>
  );
}

// Decorative circle positioned with logical insets, so it mirrors with the slide.
export function Circle({ size, top, bottom, start, end, opacity, ring = false }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute rounded-full ${ring ? 'border-(--c-accent)' : 'bg-(--c-accent)'}`}
      style={{
        width: size,
        height: size,
        top,
        bottom,
        insetInlineStart: start,
        insetInlineEnd: end,
        opacity,
        borderWidth: ring ? size * 0.08 : 0,
      }}
    />
  );
}

export function Avatar({ brand, size, ring = false }) {
  const css = typeof size === 'number' ? `${size}px` : size;
  const style = {
    width: css,
    height: css,
    boxShadow: ring ? '0 0 0 10px var(--c-bg), 0 0 0 18px var(--c-accent)' : undefined,
  };
  if (brand.avatar) {
    return <img src={brand.avatar} alt="" className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-(--c-accent) text-(--c-on-accent)" style={style}>
      <span style={{ fontSize: `calc(${css} * 0.45)`, fontWeight: 'var(--w-black)', lineHeight: 1 }}>
        {Array.from(brand.name?.trim() || '؟')[0]}
      </span>
    </span>
  );
}

export const nonEmpty = (list) => (list ?? []).filter((s) => s.trim());
