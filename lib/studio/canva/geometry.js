// Vector geometry for native-file export: full SVG path syntax (every
// command, relative or absolute, packed arc flags) to absolute subpaths of
// straight lines and cubic Béziers, 2D affine transforms, and tight bounds.
// Arcs and quadratics become cubics, which survive any affine transform, so
// an SVG illustration can become editable vector shapes at any size.

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

export function parseSvgPath(d) {
  const s = String(d ?? '');
  const out = [];
  let i = 0;
  let cmd = null;
  const skip = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  const number = () => {
    skip();
    const m = NUM.exec(s.slice(i));
    if (!m) throw new Error(`bad number at ${i} in path "${s.slice(0, 60)}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = () => {
    skip();
    const c = s[i];
    if (c !== '0' && c !== '1') throw new Error(`bad arc flag at ${i} in path "${s.slice(0, 60)}"`);
    i++;
    return c === '1' ? 1 : 0;
  };
  for (;;) {
    skip();
    if (i >= s.length) break;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(s[i])) cmd = s[i++];
    else if (!cmd || cmd === 'Z' || cmd === 'z') throw new Error(`path must start with a command: "${s.slice(0, 60)}"`);
    const n = ARITY[cmd.toUpperCase()];
    const args = [];
    for (let k = 0; k < n; k++) args.push(cmd.toUpperCase() === 'A' && (k === 3 || k === 4) ? flag() : number());
    out.push({ cmd, args });
    if (n === 0) cmd = null;
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return out;
}

// Endpoint arc → cubic segments of at most 90° each (SVG spec F.6.5).
export function arcToCubics([x1, y1], rx, ry, angle, large, sweep, [x2, y2]) {
  if (x1 === x2 && y1 === y2) return [];
  if (!rx || !ry) return [{ type: 'L', to: [x2, y2] }];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den ? Math.sqrt(num / den) : 0;
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angleOf = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (x, y) => [cx + rx * x * cos - ry * y * sin, cy + rx * x * sin + ry * y * cos];
  const segs = [];
  let t = t1;
  for (let j = 0; j < n; j++) {
    const c1 = Math.cos(t);
    const s1 = Math.sin(t);
    const c2 = Math.cos(t + step);
    const s2 = Math.sin(t + step);
    segs.push({ type: 'C', c1: at(c1 - k * s1, s1 + k * c1), c2: at(c2 + k * s2, s2 - k * c2), to: at(c2, s2) });
    t += step;
  }
  segs[segs.length - 1].to = [x2, y2];
  return segs;
}

// Parsed commands → [{ start: [x, y], segs: [{ type: 'L', to } | { type: 'C', c1, c2, to }], closed }]
export function toSubpaths(commands) {
  const subpaths = [];
  let cur = [0, 0];
  let start = [0, 0];
  let sub = null;
  let lastCubic = null; // reflected control point source for S
  let lastQuad = null; // for T
  const open = () => {
    if (!sub) {
      sub = { start: [...cur], segs: [], closed: false };
      subpaths.push(sub);
    }
  };
  for (const { cmd, args } of commands) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const pt = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    let nextCubic = null;
    let nextQuad = null;
    switch (C) {
      case 'M':
        cur = pt(args[0], args[1]);
        start = [...cur];
        sub = { start: [...cur], segs: [], closed: false };
        subpaths.push(sub);
        break;
      case 'L':
      case 'H':
      case 'V': {
        open();
        const to = C === 'L' ? pt(args[0], args[1]) : C === 'H' ? [rel ? cur[0] + args[0] : args[0], cur[1]] : [cur[0], rel ? cur[1] + args[0] : args[0]];
        sub.segs.push({ type: 'L', to });
        cur = to;
        break;
      }
      case 'C': {
        open();
        const c1 = pt(args[0], args[1]);
        const c2 = pt(args[2], args[3]);
        const to = pt(args[4], args[5]);
        sub.segs.push({ type: 'C', c1, c2, to });
        nextCubic = c2;
        cur = to;
        break;
      }
      case 'S': {
        open();
        const c1 = lastCubic ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]] : [...cur];
        const c2 = pt(args[0], args[1]);
        const to = pt(args[2], args[3]);
        sub.segs.push({ type: 'C', c1, c2, to });
        nextCubic = c2;
        cur = to;
        break;
      }
      case 'Q':
      case 'T': {
        open();
        const q = C === 'Q' ? pt(args[0], args[1]) : lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : [...cur];
        const to = C === 'Q' ? pt(args[2], args[3]) : pt(args[0], args[1]);
        sub.segs.push({ type: 'C', c1: [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], c2: [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])], to });
        nextQuad = q;
        cur = to;
        break;
      }
      case 'A': {
        open();
        const to = pt(args[5], args[6]);
        sub.segs.push(...arcToCubics(cur, args[0], args[1], args[2], args[3], args[4], to));
        cur = to;
        break;
      }
      case 'Z':
        if (sub) {
          sub.closed = true;
          cur = [...start];
          sub = null;
        }
        break;
      default:
        throw new Error(`unsupported path command ${cmd}`);
    }
    lastCubic = nextCubic;
    lastQuad = nextQuad;
  }
  return subpaths.filter((p) => p.segs.length);
}

export const parsePathToSubpaths = (d) => toSubpaths(parseSvgPath(d));

// ---------------------------------------------------------------------------
// Affine matrices [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f.

export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// SVG transform attribute → matrix (functions compose left to right).
export function parseTransform(text) {
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(String(text ?? '')))) {
    const v = (match[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    let t = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (v.length === 6) t = v;
        break;
      case 'translate':
        t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((v[0] ?? 0) * Math.PI) / 180;
        const rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        t = v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], rot), [1, 0, 0, 1, -v[1], -v[2]]) : rot;
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
    }
    m = multiply(m, t);
  }
  return m;
}

export function transformSubpaths(subpaths, m) {
  return subpaths.map((p) => ({
    start: apply(m, p.start),
    closed: p.closed,
    segs: p.segs.map((s) => (s.type === 'L' ? { type: 'L', to: apply(m, s.to) } : { type: 'C', c1: apply(m, s.c1), c2: apply(m, s.c2), to: apply(m, s.to) })),
  }));
}

// Uniform scale factor of a matrix (for stroke widths).
export const matrixScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// Tight bounds, including the true extrema of each cubic.
export function bounds(subpaths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = ([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of subpaths) {
    let cur = p.start;
    add(cur);
    for (const s of p.segs) {
      if (s.type === 'C') for (const t of cubicExtrema(cur, s.c1, s.c2, s.to)) add(cubicAt(cur, s.c1, s.c2, s.to, t));
      add(s.to);
      cur = s.to;
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : { x: 0, y: 0, width: 0, height: 0 };
}

const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};

function cubicExtrema(p0, p1, p2, p3) {
  const ts = [];
  for (const k of [0, 1]) {
    const a = -p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k];
    const b = 2 * (p0[k] - 2 * p1[k] + p2[k]);
    const c = p1[k] - p0[k];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) ts.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) ts.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

// Subpaths → SVG path data with absolute M/L/C/Z only (accepted by Canva's
// insert_shape, which rejects Q/T).
export function subpathsToD(subpaths, digits = 2) {
  const f = (n) => String(Math.round(n * 10 ** digits) / 10 ** digits);
  return subpaths
    .map((p) => `M${f(p.start[0])} ${f(p.start[1])}${p.segs.map((s) => (s.type === 'L' ? `L${f(s.to[0])} ${f(s.to[1])}` : `C${[...s.c1, ...s.c2, ...s.to].map(f).join(' ')}`)).join('')}${p.closed ? 'Z' : ''}`)
    .join('');
}
