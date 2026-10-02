// SVG path helpers for shape elements. Paths use only M/L/H/V/C/S/A/Z (the
// commands Canva's shape import accepts), absolute or relative.

// 24×24 icons, drawn for LTR (arrows point right). mirrorPath() flips them
// for RTL, where "forward" points left.
export const ICONS = {
  arrow: 'M4 12h15M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7L7 17',
  bookmark: 'M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1z',
  share: 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z',
  follow: 'M15 19c0-2.8-2.7-5-6-5s-6 2.2-6 5M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6',
  quote: 'M9.5 6C6.5 6 4 8.6 4 12v6h6v-6H7c0-1.9 1.1-3.2 2.5-3.2V6zm10 0c-3 0-5.5 2.6-5.5 6v6h6v-6h-3c0-1.9 1.1-3.2 2.5-3.2V6z',
};

// Icons drawn as outlines (stroke) rather than filled shapes.
export const STROKED = new Set(['arrow', 'check', 'x', 'bookmark', 'share', 'follow']);

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, A: 7, Z: 0 };

export function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvCcSsAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out = [];
  let i = 0;
  let cmd = null;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) throw new Error(`path must start with a command: ${d}`);
    const n = ARGS[cmd.toUpperCase()];
    if (n === undefined) throw new Error(`unsupported path command ${cmd}`);
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some(Number.isNaN)) throw new Error(`bad arguments for ${cmd} in ${d}`);
    out.push({ cmd, args });
    i += n;
    if (n === 0) cmd = null;
    // Extra coordinate pairs after M are implicit L.
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return out;
}

const fmt = (n) => String(Math.round(n * 1000) / 1000);

// Mirror horizontally inside a viewBox of the given width.
export function mirrorPath(d, width) {
  return parsePath(d)
    .map(({ cmd, args }) => {
      const abs = cmd === cmd.toUpperCase();
      const a = [...args];
      switch (cmd.toUpperCase()) {
        case 'M':
        case 'L':
          a[0] = abs ? width - a[0] : -a[0];
          break;
        case 'H':
          a[0] = abs ? width - a[0] : -a[0];
          break;
        case 'C':
          for (const k of [0, 2, 4]) a[k] = abs ? width - a[k] : -a[k];
          break;
        case 'S':
          for (const k of [0, 2]) a[k] = abs ? width - a[k] : -a[k];
          break;
        case 'A':
          a[2] = -a[2]; // rotation
          a[4] = a[4] ? 0 : 1; // sweep flag
          a[5] = abs ? width - a[5] : -a[5];
          break;
        default:
      }
      return cmd + a.map(fmt).join(' ');
    })
    .join('');
}

// Rounded rectangle and ellipse as paths (for destinations that only take paths).
export function rectPath(w, h, r = 0) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M0 0H${fmt(w)}V${fmt(h)}H0Z`;
  return [
    `M${fmt(rr)} 0H${fmt(w - rr)}`,
    `A${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(w)} ${fmt(rr)}V${fmt(h - rr)}`,
    `A${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(w - rr)} ${fmt(h)}H${fmt(rr)}`,
    `A${fmt(rr)} ${fmt(rr)} 0 0 1 0 ${fmt(h - rr)}V${fmt(rr)}`,
    `A${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(rr)} 0Z`,
  ].join('');
}

export function ellipsePath(w, h) {
  const rx = w / 2;
  const ry = h / 2;
  return `M0 ${fmt(ry)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(w)} ${fmt(ry)}A${fmt(rx)} ${fmt(ry)} 0 1 0 0 ${fmt(ry)}Z`;
}
