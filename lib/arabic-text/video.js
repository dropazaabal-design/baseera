import { measureParagraph, textMap } from './page.js';
import { planMotion, frameState } from './motion.js';
import { drawArabicTextFrame } from './canvas.js';

// Adapter for the project's reel engine (lib/video.js): it renders each
// animated element once into a transparent layer and composites layers per
// frame. For an element that carries an ArabicText motion
// (data-text-motion='[{"effect":"rise","unit":"word"}]'), the capture also
// measures the shaped paragraph in the live DOM (lines, words, ink) in the
// layer's coordinates, and frames then move pieces of that one layer: the
// text is shaped once, by the browser, at capture time.

const shift = (r, dx, dy) => r && { ...r, x: +(r.x - dx).toFixed(2), y: +(r.y - dy).toFixed(2) };

// Logical ranges of marked spans ([data-at-mark]) in a paragraph, from the
// same text map the measurement uses (a <br> counts as "\n").
function markedSpans(p) {
  const { pieces } = textMap(p);
  const spans = [];
  for (const el of p.querySelectorAll('[data-at-mark]')) {
    const inside = pieces.filter((x) => el.contains(x.node));
    if (inside.length) spans.push({ start: Math.min(...inside.map((x) => x.start)), end: Math.max(...inside.map((x) => x.end)), mark: el.dataset.atMark });
  }
  return spans;
}

/**
 * @param {Element} el    the animated element (has data-text-motion)
 * @param {Element} root  the scene root (coordinates of the capture)
 * @param {{x,y,width,height}} rect  the layer's crop rect in root px
 */
export function captureTextLayer(el, root, rect) {
  const raw = el.dataset.textMotion;
  if (!raw) return null;
  const motions = JSON.parse(raw);
  const p = el.matches('[data-at-p]') ? el : el.querySelector('[data-at-p]');
  if (!p) return { error: 'العنصر لا يحوي فقرة ArabicText ([data-at-p])' };
  const spans = markedSpans(p);
  const m = measureParagraph(p, root, { spans });
  const layout = {
    fontSize: m.fontSize,
    direction: el.ownerDocument.defaultView.getComputedStyle(p).direction,
    ascent: m.ascent,
    descent: m.descent,
    layer: { x: 0, y: 0, width: rect.width, height: rect.height },
    lines: m.lines.map((l) => ({ ...l, box: shift(l.box, rect.x, rect.y), content: shift(l.content, rect.x, rect.y), ink: shift(l.ink, rect.x, rect.y), baseline: l.baseline - rect.y })),
    words: m.words.map((w) => ({ ...w, box: shift(w.box, rect.x, rect.y), ink: shift(w.ink, rect.x, rect.y), baseline: w.baseline - rect.y })),
    marks: m.marks.map((mk) => ({ ...mk, rects: mk.rects.map((r) => shift(r, rect.x, rect.y)) })),
    text: m.text,
  };
  const plan = planMotion(layout, motions, { spans });
  if (!plan.ok) return { error: plan.errors.map((e) => e.message).join('؛ ') };
  return { layout, plan, motions, highlightOnly: plan.highlights.length > 0 };
}

// One frame of a captured text layer; `frame` counts from the layer's own
// entrance (an integer: the engine passes frame numbers, not clock time).
export function drawTextLayer(ctx, layer, frame, { highlight } = {}) {
  const state = frameState(layer.text.plan, frame);
  drawArabicTextFrame(ctx, { image: layer.canvas, scale: 1, layout: layer.text.layout }, state, { x: layer.x, y: layer.y }, { highlight });
  return state;
}
