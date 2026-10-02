// Style compiler, step 1 of 3: extraction from a DESIGN.md (or similar)
// source. It separates what the source states explicitly (hex colours,
// type scale in px, line heights, radius limits, grid) from rules that need
// interpretation, and from rules that do not apply to Arabic (letter
// spacing, uppercase, title case, Latin families). Nothing is invented: a
// value the source does not give stays absent, and the vague parts are
// listed as ambiguous for a person (or the assistant, once, at setup) to
// interpret and record.
//
// Step 2 (normalisation into a style's tokens) and step 3 (RTL and brand
// adaptation) are recorded in each style's provenance, with what was taken
// from here and what was designed for Arabic.

const BOILERPLATE = /Token from style foundations|Derived from the surface token/;

const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));

export function extractDesignRules(markdown, source = {}) {
  const text = String(markdown ?? '');
  const lines = text.split(/\r?\n/);
  const explicit = { colors: {}, fonts: {}, typeScale: null, lineHeight: {}, radius: {}, grid: {}, spacing: {}, weights: null };
  const rules = [];
  const ambiguous = [];
  const notForArabic = [];
  let section = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,3}\s/.test(line)) {
      section = line.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').toLowerCase();
      continue;
    }
    if (!line || line.startsWith('>')) continue;
    // Colours: "- **Primary:** `#111111` — note" / "- **Background:** `#FAF7F2` (paper)".
    const color = /^\-\s*\*\*([^*:]+):\*\*\s*`?(#[0-9A-Fa-f]{6})`?\s*(.*)$/.exec(line);
    if (color) {
      const note = color[3].replace(/^[—–-]\s*/, '').trim();
      explicit.colors[color[1].trim().toLowerCase()] = { hex: color[2].toUpperCase(), ...(note && !BOILERPLATE.test(note) && { note }) };
      continue;
    }
    // Spacing scale ("Spacing scale: 4/8/12" or "8pt baseline grid").
    if (/spacing scale/i.test(line)) {
      const nums = (line.split(':').slice(1).join(':').match(/\d+(\.\d+)?/g) ?? []).map(Number);
      const base = /(\d+)pt baseline grid/i.exec(line);
      if (base) explicit.spacing.baseline = Number(base[1]);
      else if (nums.length > 1) explicit.spacing.scale = nums;
      continue;
    }
    // Type scale: "14/16/18/24/32/40" or "Scale (px): 12 · 14 · 16".
    const scale = /scale[^:]*:\**\s*([\d\s/·,.px]+)$/i.exec(line);
    if (scale && /\d/.test(scale[1])) {
      explicit.typeScale = scale[1].split(/[/·,]/).map(num).filter((n) => n > 0);
      continue;
    }
    if (/scale/i.test(line) && /\*\*scale:\*\*/i.test(line)) {
      ambiguous.push({ section, text: line.replace(/\*\*/g, ''), why: 'scale named, no values' });
      continue;
    }
    const families = /families:\*\*\s*(.+)$/i.exec(line);
    if (families) {
      for (const part of families[1].split(',')) {
        const [k, v] = part.split('=').map((x) => x?.trim());
        if (k && v) explicit.fonts[k] = { family: v, arabic: false };
      }
      notForArabic.push({ text: line.replace(/\*\*/g, ''), why: 'Latin families: Arabic text needs Cairo, Tajawal or another Arabic face' });
      continue;
    }
    const face = /^\-\s*\*\*(display[^*]*|body|headings?)[^*]*:\*\*\s*(.+)$/i.exec(line);
    if (face) {
      const role = /display|heading/i.test(face[1]) ? 'display' : 'body';
      const serif = /\bserif\b/i.test(face[2]) && !/sans/i.test(face[2]);
      explicit.fonts[role] = { family: face[2].replace(/[`"']/g, '').split(/ or |\(/)[0].trim(), category: serif ? 'serif' : /mono/i.test(face[2]) ? 'mono' : 'sans', arabic: false };
      notForArabic.push({ text: line.replace(/\*\*/g, ''), why: 'Latin face; the category (serif/sans) is kept as intent' });
      continue;
    }
    const weights = /weights:\*\*\s*([\d,\s]+)/i.exec(line);
    if (weights) {
      explicit.weights = weights[1].split(',').map(num).filter(Boolean);
      continue;
    }
    const lh = /line-height:\s*([\d.]+)\s*for\s*(\w+)(?:,\s*([\d.]+)\s*for\s*(\w+))?/i.exec(line);
    if (lh) {
      explicit.lineHeight[lh[2].toLowerCase()] = Number(lh[1]);
      if (lh[3]) explicit.lineHeight[lh[4].toLowerCase()] = Number(lh[3]);
      continue;
    }
    const rmax = /border-radius above (\d+)px/i.exec(line);
    const rmin = /border-radius below (\d+)px/i.exec(line);
    if (rmax || rmin) {
      if (rmax) explicit.radius.max = Number(rmax[1]);
      if (rmin) explicit.radius.min = Number(rmin[1]);
      rules.push({ section, kind: 'dont', text: line.replace(/^[-*✅❌\s]+/, '') });
      continue;
    }
    const cardRadius = /cards?:\*\*[^.]*?(\d+)px radius/i.exec(line);
    if (cardRadius) explicit.radius.card = Number(cardRadius[1]);
    const btnRadius = /buttons?:\*\*[^.]*?(\d+)px radius/i.exec(line);
    if (btnRadius) explicit.radius.button = Number(btnRadius[1]);
    const grid = /(\d+)-column grid(?:,\s*(\d+)px max-width)?(?:,\s*(\d+)px gutters?)?/i.exec(line);
    if (grid) explicit.grid = { columns: Number(grid[1]), ...(grid[2] && { maxWidth: Number(grid[2]) }), ...(grid[3] && { gutter: Number(grid[3]) }) };
    const base = /(\d+)pt baseline grid/i.exec(line);
    if (base) explicit.spacing.baseline = Number(base[1]);
    // Rules that make no sense for Arabic script.
    if (/letter-spacing|uppercase|title case|sentence-case|small caps/i.test(line)) {
      notForArabic.push({ text: line.replace(/^[-*✅❌\s]+/, ''), why: 'no letter spacing, case or title-casing in Arabic' });
      continue;
    }
    // Normative bullets: do / don't.
    if (/^[-*]\s*(✅|❌)|^[-*]\s*(do not|don't|never|avoid|prefer|use|keep|favor|one accent|let whitespace)/i.test(line)) {
      const kind = /❌|do not|don't|never|avoid|\bno\b/i.test(line) ? 'dont' : 'do';
      rules.push({ section, kind, text: line.replace(/^[-*✅❌\s]+/, '') });
      if (!/#[0-9A-F]{6}|\d+px|\d+(\.\d+)?\b/i.test(line)) ambiguous.push({ section, text: line.replace(/^[-*✅❌\s]+/, ''), why: 'guidance without a measurable value' });
      continue;
    }
  }
  const boilerplate = BOILERPLATE.test(text);
  return {
    kind: 'design-rules',
    source,
    boilerplate,
    explicit,
    rules,
    ambiguous,
    notForArabic,
    summary: {
      colors: Object.keys(explicit.colors).length,
      typeScale: explicit.typeScale?.length ?? 0,
      rules: rules.length,
      ambiguous: ambiguous.length,
      notForArabic: notForArabic.length,
    },
  };
}
