import { arabicTextHtml } from './html.js';

// HTML adapter: a frame of an Arabic text box as HTML, for engines that
// render HTML/CSS per frame. Each moving piece is a full copy of the same
// paragraph (same width, same font, same shaping) clipped to its piece
// with clip-path and moved with a transform; the settled frame is the
// plain paragraph. No copy holds a cut-out letter or a partial word.

const px = (n) => `${+n.toFixed(2)}px`;

export function frameHtml(spec, layout, state, { marks = 'static', highlight = '#D9F4EB' } = {}) {
  const L = layout.layer;
  const box = arabicTextHtml(spec, { marks, fontSize: layout.fontSize });
  const at = (inner, style = '') => `<div style="position:absolute;left:0;top:0;width:${px(L.width)};height:${px(L.height)};${style}"><div style="position:absolute;left:${px(-L.x)};top:${px(-L.y)}">${inner}</div></div>`;
  const bands = state.bands
    .filter((b) => b.fraction > 0)
    .map((b) => {
      const w = b.rect.width * b.fraction;
      const x = b.side === 'right' ? b.rect.x + b.rect.width - w : b.rect.x;
      return `<div style="position:absolute;left:${px(x - L.x)};top:${px(b.rect.y - L.y)};width:${px(w)};height:${px(b.rect.height)};background:${b.color ?? highlight}"></div>`;
    })
    .join('');
  let text = '';
  if (state.textSettled) text = at(box);
  else if (!state.hidden) {
    text = state.segments
      .filter((seg) => seg.opacity > 0)
      .map((seg) => {
        const s = seg.slot;
        let vx = s.x;
        let vw = s.width;
        if (seg.clip) {
          vw = s.width * seg.clip.fraction;
          if (seg.clip.side === 'right') vx = s.x + s.width - vw;
        }
        const top = s.y - L.y;
        const left = vx - L.x;
        const clip = `clip-path:inset(${px(top)} ${px(L.width - left - vw)} ${px(L.height - top - s.height)} ${px(left)})`;
        const origin = `transform-origin:${px(s.x - L.x + s.width / 2)} ${px(top + s.height / 2)}`;
        const transform = `transform:translate(${px(seg.dx)},${px(seg.dy)}) scale(${+seg.scale.toFixed(4)})`;
        return at(box, `opacity:${+seg.opacity.toFixed(4)};${clip};${origin};${transform}`);
      })
      .join('');
  }
  return `<div class="at-frame" style="position:relative;width:${px(L.width)};height:${px(L.height)}">${bands}${text}</div>`;
}
