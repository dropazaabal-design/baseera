import { memo } from 'react';
import { templates } from '../templates';
import { overlayPlugins } from '../plugins';
import { FONTS } from '../lib/fonts.js';
import { SLIDE_H, SLIDE_W } from '../lib/exportEngine.js';

function Slide({ slide, index, total, colors, font, numerals, brand, plugins }) {
  const template = templates[slide.template];
  const { family, weights } = FONTS[font];
  const ctx = { index, total, colors, numerals, brand, isLast: index === total - 1 };
  const { Component } = template;

  return (
    <div
      dir="rtl"
      lang="ar"
      className="slide-root relative overflow-hidden text-start"
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        background: colors.bg,
        color: colors.text,
        fontFamily: `${family}, sans-serif`,
        fontWeight: weights.regular,
        '--w-regular': weights.regular,
        '--w-bold': weights.bold,
        '--w-black': weights.black,
        '--c-bg': colors.bg,
        '--c-surface': colors.surface,
        '--c-text': colors.text,
        '--c-muted': colors.muted,
        '--c-accent': colors.accent,
        '--c-on-accent': colors.onAccent,
      }}
    >
      <Component data={slide.data} ctx={ctx} />
      {overlayPlugins.map((p) =>
        plugins[p.id]?.enabled ? <p.Overlay key={p.id} settings={plugins[p.id]} ctx={ctx} template={template} /> : null,
      )}
    </div>
  );
}

export default memo(Slide);
