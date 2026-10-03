// Canvas adapter: draws a frame of an Arabic text layer onto a 2D canvas.
// The layer is a raster of the shaped text (made once by the typesetter, or
// captured by the video engine); a frame only moves, fades, scales or
// masks pieces of it and paints marker bands under it. Nothing is
// re-shaped, so letter joining and diacritics are those of the layer.
//
// layer = { image: CanvasImageSource, scale: raster px per layout px,
//           layout (from a typesetter), plan (lib/arabic-text/motion.js) }
// at    = where the text box's top-left corner goes on the canvas

export function drawArabicTextFrame(ctx, layer, state, at = { x: 0, y: 0 }, { highlight = '#D9F4EB' } = {}) {
  const { image, scale = 1, layout } = layer;
  const L = layout.layer;
  for (const b of state.bands) {
    if (b.fraction <= 0) continue;
    const w = b.rect.width * b.fraction;
    const x = b.side === 'right' ? b.rect.x + b.rect.width - w : b.rect.x;
    ctx.fillStyle = b.color ?? highlight;
    ctx.fillRect(at.x + x, at.y + b.rect.y, w, b.rect.height);
  }
  if (state.hidden) return;
  // Settled: the layer as it was rendered, in one piece.
  if (state.textSettled) {
    ctx.drawImage(image, 0, 0, L.width * scale, L.height * scale, at.x + L.x, at.y + L.y, L.width, L.height);
    return;
  }
  for (const seg of state.segments) {
    if (seg.opacity <= 0) continue;
    const s = seg.slot;
    let vx = s.x;
    let vw = s.width;
    if (seg.clip) {
      vw = s.width * seg.clip.fraction;
      if (seg.clip.side === 'right') vx = s.x + s.width - vw;
      if (vw <= 0) continue;
    }
    ctx.save();
    ctx.globalAlpha *= seg.opacity;
    ctx.translate(at.x + s.x + s.width / 2 + seg.dx, at.y + s.y + s.height / 2 + seg.dy);
    if (seg.scale !== 1) ctx.scale(seg.scale, seg.scale);
    ctx.drawImage(image, (vx - L.x) * scale, (s.y - L.y) * scale, vw * scale, s.height * scale, vx - s.x - s.width / 2, -s.height / 2, vw, s.height);
    ctx.restore();
  }
}
