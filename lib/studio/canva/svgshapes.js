import { recolorSvg } from '../render.js';
import { IDENTITY, bounds, matrixScale, multiply, parsePathToSubpaths, parseTransform, transformSubpaths } from './geometry.js';

// An SVG illustration → separate vector shapes (fill, stroke, opacity) in
// page pixels, so a native file can carry it as editable shapes instead of
// one picture. Covers what the studio's illustrations use: path, rect,
// circle, ellipse, line, polyline, polygon, nested groups with transforms,
// presentation attributes, inline styles and simple class rules. Anything
// it cannot express (gradients, patterns, masks, clip paths, filters,
// embedded rasters) is approximated and listed in `degraded`, never hidden.

const NAMED = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  yellow: '#FFFF00',
  orange: '#FFA500',
  gray: '#808080',
  grey: '#808080',
  navy: '#000080',
  teal: '#008080',
  purple: '#800080',
  silver: '#C0C0C0',
  maroon: '#800000',
  transparent: 'none',
};

const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'color', 'visibility'];

function parseXml(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += m[6];
    else if (m[3]) {
      if (m[2]) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs = {};
      const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
      let a;
      while ((a = ar.exec(m[4] ?? ''))) attrs[a[1]] = (a[2] ?? a[3] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const node = { tag: m[3].replace(/^svg:/, ''), attrs, children: [], text: '' };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    }
  }
  return root;
}

const parseStyle = (s) =>
  Object.fromEntries(
    String(s ?? '')
      .split(';')
      .map((d) => d.split(':').map((x) => x.trim()))
      .filter(([k, v]) => k && v !== undefined),
  );

function classRules(root) {
  const rules = {};
  const walk = (n) => {
    if (n.tag === 'style') {
      const css = n.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        for (const s of sel.split(',').map((x) => x.trim())) if (/^\.[\w-]+$/.test(s)) rules[s.slice(1)] = { ...rules[s.slice(1)], ...parseStyle(body) };
      }
    }
    n.children.forEach(walk);
  };
  walk(root);
  return rules;
}

function parseColor(value, currentColor, gradients, degraded) {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  if (!v || v === 'none') return 'none';
  if (v === 'currentColor') return parseColor(currentColor ?? '#000000', null, gradients, degraded);
  const url = /^url\(\s*#([^)\s]+)\s*\)/.exec(v);
  if (url) {
    const g = gradients[url[1]];
    if (g) {
      degraded.add(`gradient ${url[1]} → first stop colour`);
      return g;
    }
    degraded.add(`fill ${v} not found → none`);
    return 'none';
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  if (NAMED[v.toLowerCase()]) return NAMED[v.toLowerCase()];
  degraded.add(`colour "${v}" → black`);
  return '#000000';
}

function gradientColors(root) {
  const out = {};
  const walk = (n) => {
    if ((n.tag === 'linearGradient' || n.tag === 'radialGradient') && n.attrs.id) {
      const stop = n.children.find((c) => c.tag === 'stop');
      const color = stop && (parseStyle(stop.attrs.style)['stop-color'] ?? stop.attrs['stop-color']);
      if (color && /^#[0-9a-f]{3,6}$/i.test(color)) out[n.attrs.id] = color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join('')}`.toUpperCase() : color.toUpperCase();
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

const num = (v, fallback = 0) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

function geometryOf(node) {
  const a = node.attrs;
  switch (node.tag) {
    case 'path':
      return a.d ? parsePathToSubpaths(a.d) : [];
    case 'rect': {
      const x = num(a.x);
      const y = num(a.y);
      const w = num(a.width);
      const h = num(a.height);
      if (w <= 0 || h <= 0) return [];
      let rx = a.rx !== undefined ? num(a.rx) : a.ry !== undefined ? num(a.ry) : 0;
      let ry = a.ry !== undefined ? num(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx || !ry) return parsePathToSubpaths(`M${x} ${y}H${x + w}V${y + h}H${x}Z`);
      return parsePathToSubpaths(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const rx = node.tag === 'circle' ? num(a.r) : num(a.rx);
      const ry = node.tag === 'circle' ? num(a.r) : num(a.ry);
      if (rx <= 0 || ry <= 0) return [];
      return parsePathToSubpaths(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
    }
    case 'line':
      return parsePathToSubpaths(`M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`);
    case 'polyline':
    case 'polygon': {
      const pts = (String(a.points ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
      if (pts.length < 4) return [];
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return parsePathToSubpaths(node.tag === 'polygon' ? `${d}Z` : d);
    }
    default:
      return null;
  }
}

const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'filter', 'symbol', 'marker']);

// svgText: the SVG source. frame: { x, y, width, height } in page px.
// colors: theme colours for recolourable (data-token) illustrations.
// fit: 'contain' (default) or 'cover'.
// → { shapes: [{ name, subpaths, fill, stroke, evenOdd }], degraded: [] }
export function svgToShapes(svgText, frame, { colors, fit = 'contain' } = {}) {
  const degraded = new Set();
  const text = colors ? recolorSvg(svgText, colors) : svgText;
  const root = parseXml(text);
  const svg = root.children.find((n) => n.tag === 'svg');
  if (!svg) throw new Error('not an SVG document');
  const vb = String(svg.attrs.viewBox ?? '')
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const [vx, vy, vw, vh] = vb.length === 4 ? vb : [0, 0, num(svg.attrs.width, frame.width), num(svg.attrs.height, frame.height)];
  const sx = frame.width / vw;
  const sy = frame.height / vh;
  const s = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  if (fit === 'cover' && Math.abs(sx - sy) > 1e-6) degraded.add('cover fit: shapes are not clipped to the frame');
  const base = multiply([1, 0, 0, 1, frame.x + (frame.width - vw * s) / 2, frame.y + (frame.height - vh * s) / 2], [s, 0, 0, s, -vx * s, -vy * s]);
  const rules = classRules(root);
  const gradients = gradientColors(root);
  const shapes = [];

  const walk = (node, inherited, matrix, opacity) => {
    if (SKIP.has(node.tag)) {
      if (['clipPath', 'mask', 'filter', 'pattern'].includes(node.tag)) degraded.add(`<${node.tag}> ignored`);
      return;
    }
    const cls = String(node.attrs.class ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .reduce((acc, c) => ({ ...acc, ...rules[c] }), {});
    const own = { ...pickPresentation(node.attrs), ...cls, ...parseStyle(node.attrs.style) };
    if (own.display === 'none') return;
    const style = { ...inherited };
    for (const k of INHERITED) if (own[k] !== undefined) style[k] = own[k];
    const m = node.attrs.transform ? multiply(matrix, parseTransform(node.attrs.transform)) : matrix;
    const op = opacity * (own.opacity !== undefined ? num(own.opacity, 1) : 1);
    for (const key of ['clip-path', 'mask', 'filter']) if (node.attrs[key] || own[key]) degraded.add(`${key} on <${node.tag}> ignored`);
    if (node.tag === 'image') {
      degraded.add('embedded <image> inside SVG skipped');
      return;
    }
    if (node.tag === 'use') {
      degraded.add('<use> skipped');
      return;
    }
    const geometry = node.tag === 'svg' || node.tag === 'g' || node.tag === 'a' ? null : geometryOf(node);
    if (geometry === null) {
      node.children.forEach((c) => walk(c, style, m, op));
      return;
    }
    if (!geometry.length || style.visibility === 'hidden') return;
    const fillColor = parseColor(style.fill ?? '#000000', style.color, gradients, degraded);
    const strokeColor = parseColor(style.stroke ?? 'none', style.color, gradients, degraded);
    const strokeWidth = num(style['stroke-width'], 1) * matrixScale(m);
    const fill = node.tag !== 'line' && fillColor !== 'none' ? { color: fillColor, alpha: clamp01(op * num(style['fill-opacity'], 1)) } : null;
    const stroke = strokeColor !== 'none' && strokeWidth > 0 ? { color: strokeColor, alpha: clamp01(op * num(style['stroke-opacity'], 1)), width: strokeWidth, cap: style['stroke-linecap'] ?? 'butt', join: style['stroke-linejoin'] ?? 'miter' } : null;
    if (!fill && !stroke) return;
    const subpaths = transformSubpaths(geometry, m);
    const b = bounds(subpaths);
    if (!Number.isFinite(b.x)) return;
    shapes.push({ name: node.attrs.id ?? `${node.tag}-${shapes.length + 1}`, subpaths, bounds: b, fill, stroke, evenOdd: style['fill-rule'] === 'evenodd' });
    if (style['fill-rule'] === 'evenodd') degraded.add('evenodd fill rule drawn as nonzero');
  };
  walk(svg, {}, base, 1);
  return { shapes, degraded: [...degraded] };
}

const PRESENTATION = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'opacity', 'color', 'display', 'visibility'];
const pickPresentation = (attrs) => Object.fromEntries(PRESENTATION.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export { IDENTITY };
