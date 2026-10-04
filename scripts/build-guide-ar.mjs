// Builds the Arabic user guide and prompt library from one Markdown source,
// docs/BASIRA-GUIDE-AR.md (the only file to edit by hand):
//
//   node scripts/build-guide-ar.mjs            contents, index, docs/prompts/*.md and the PDF
//   node scripts/build-guide-ar.mjs --no-pdf   the Markdown parts only (no browser)
//   node scripts/build-guide-ar.mjs --check    fail if anything generated is out of date
//   node scripts/build-guide-ar.mjs --html F   also write the page that is printed
//
// Generated in the guide: the table of contents (between TOC markers) and the
// prompt index (between INDEX markers). Generated next to it: one file per
// prompt family in docs/prompts/ and docs/BASIRA-GUIDE-AR.pdf, whose contents
// and index carry real page numbers (read back from the PDF's named
// destinations, then printed again until they hold). The PDF's keywords carry
// a hash of the source, so --check (and the tests) can tell a stale PDF.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { fontFaceCss } from '../lib/arabic-text/node/fontCss.js';

const root = path.resolve(import.meta.dirname, '..');
export const GUIDE = path.join(root, 'docs/BASIRA-GUIDE-AR.md');
export const PDF = path.join(root, 'docs/BASIRA-GUIDE-AR.pdf');
export const PROMPTS_DIR = path.join(root, 'docs/prompts');
export const MIN_PROMPTS = 150;

// Prompt families → library files. Every family used in the guide must be here.
export const PROMPT_FILES = [
  { file: 'carousel.md', title: 'الكاروسيل', families: ['P-START', 'P-BEG', 'P-CAR'] },
  { file: 'reel.md', title: 'الريلز', families: ['P-REEL'] },
  { file: 'social-post.md', title: 'المنشور والكابشن والهوكات', families: ['P-POST', 'P-CAP', 'P-HOOK'] },
  { file: 'x.md', title: 'منصة X', families: ['P-X'] },
  { file: 'facebook.md', title: 'Facebook', families: ['P-FB'] },
  { file: 'instagram.md', title: 'تحليل Instagram قبل النشر', families: ['P-IG'] },
  { file: 'algorithm-analysis.md', title: 'ذكاء المنصات والتشخيص والتعلم من السجل', families: ['P-ALG', 'P-AB', 'P-ACC', 'P-DIAG'] },
  { file: 'design.md', title: 'التصميم والطباعة العربية', families: ['P-DESIGN', 'P-TYPO'] },
  { file: 'editing.md', title: 'التعديل والتحسين والإصلاح والتكلفة', families: ['P-EDIT', 'P-IMP', 'P-FIX', 'P-COST'] },
  { file: 'research.md', title: 'البحث وإعادة التدوير والاستراتيجية', families: ['P-RES', 'P-REP', 'P-STR'] },
  { file: 'advanced.md', title: 'للمتقدمين: الشاملة والوصفات والذاكرة وCanva', families: ['P-WRITE', 'P-MASTER', 'P-DIR', 'P-EXP', 'P-RCP', 'P-MEM', 'P-CANVA'] },
];

const ID = /P-[A-Z]+(?:-[A-Z]+)?-\d+/g;
const PROMPT_HEADING = /^(P-[A-Z]+(?:-[A-Z]+)?-\d+) — (.+)$/;
const familyOf = (id) => id.split('-').slice(0, 2).join('-');
const seriesOf = (id) => id.replace(/-\d+$/, '');
const BLOCKS = ['TOC', 'INDEX'];

// ---------------------------------------------------------------- parsing

const plain = (s) => s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

// GitHub's heading anchors (github-slugger): lower case, punctuation and
// symbols dropped, spaces to hyphens, repeats numbered.
export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = plain(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

// Generated blocks back to bare markers, so parsing never sees its own output.
export function stripGenerated(md) {
  let out = md;
  for (const name of BLOCKS) {
    out = out.replace(new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`), `<!-- ${name} -->`);
  }
  return out;
}

export function parseGuide(source) {
  const md = stripGenerated(source);
  const lines = md.split('\n');
  const slug = slugger();
  const headings = [];
  const problems = [];
  let fence = null;
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      fence = fence ? null : { line: i + 1, lang: line.slice(3).trim() };
      if (fence && fence.lang !== 'text') problems.push(`line ${i + 1}: code block without the text language (${fence.lang || 'none'})`);
      if (fence && headings.at(-1)?.prompt) headings.at(-1).blocks++;
      continue;
    }
    if (fence) continue;
    const h = /^(#{1,4}) (.+)$/.exec(line);
    if (!h) continue;
    const level = h[1].length;
    const text = h[2].trim();
    const m = PROMPT_HEADING.exec(text);
    if (level === 2) section = /^(\d+)\./.exec(text)?.[1] ?? null;
    headings.push({
      level,
      text,
      line: i,
      slug: slug(text),
      section,
      prompt: m ? { id: m[1], title: m[2].trim() } : null,
      blocks: 0,
    });
  }
  if (fence) problems.push(`line ${fence.line}: code block never closed`);
  const prompts = headings.filter((h) => h.prompt);
  for (const p of prompts) if (p.level < 3) problems.push(`${p.prompt.id}: prompt heading must be ### or ####`);
  return { md, lines, headings, prompts, families: familyTable(lines), problems };
}

// The table of family codes in the opening pages: | `P-CAR` | label |
function familyTable(lines) {
  const map = new Map();
  for (const line of lines) {
    const m = /^\| `(P-[A-Z]+)` \| ([^|]+) \|$/.exec(line);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

// Bodies of the prompts: from the heading to the next heading.
function promptBodies(parsed) {
  const { lines, headings } = parsed;
  const bodies = new Map();
  headings.forEach((h, k) => {
    if (!h.prompt) return;
    const end = headings[k + 1]?.line ?? lines.length;
    let body = lines.slice(h.line + 1, end);
    body = body.filter((l) => !/^<!-- \w+ -->$/.test(l));
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body.at(-1).trim()) body.pop();
    bodies.set(h.prompt.id, body.join('\n'));
  });
  return bodies;
}

export function validate(parsed, extraTexts = {}) {
  const problems = [...parsed.problems];
  const ids = new Map();
  for (const p of parsed.prompts) {
    const { id } = p.prompt;
    if (ids.has(id)) problems.push(`${id}: used twice (lines ${ids.get(id).line + 1} and ${p.line + 1})`);
    else ids.set(id, p);
    if (!p.blocks) problems.push(`${id}: no copyable text block`);
    if (!parsed.families.has(familyOf(id))) problems.push(`${id}: family ${familyOf(id)} is missing from the code table`);
    if (!PROMPT_FILES.some((f) => f.families.includes(familyOf(id)))) problems.push(`${id}: family ${familyOf(id)} has no prompt library file`);
  }
  // Numbers run 1..n in each series, with one width.
  const series = new Map();
  for (const p of parsed.prompts) {
    const s = seriesOf(p.prompt.id);
    series.set(s, [...(series.get(s) ?? []), p.prompt.id.slice(s.length + 1)]);
  }
  for (const [s, nums] of series) {
    nums.forEach((n, k) => {
      if (Number(n) !== k + 1) problems.push(`${s}-${n}: expected number ${k + 1} in sequence`);
      if (n.length !== nums[0].length) problems.push(`${s}-${n}: number width differs from ${s}-${nums[0]}`);
    });
  }
  for (const fam of parsed.families.keys()) {
    if (!parsed.prompts.some((p) => familyOf(p.prompt.id) === fam)) problems.push(`${fam}: in the code table but has no prompts`);
  }
  // Every mention of a prompt points at a real one.
  const mentions = { guide: parsed.lines.filter((l) => !/^#{1,4} /.test(l)).join('\n'), ...extraTexts };
  for (const [where, text] of Object.entries(mentions)) {
    for (const ref of new Set(text.match(ID) ?? [])) if (!ids.has(ref)) problems.push(`${where}: ${ref} is mentioned but does not exist`);
  }
  if (parsed.prompts.length < MIN_PROMPTS) problems.push(`only ${parsed.prompts.length} prompts (at least ${MIN_PROMPTS})`);
  return problems;
}

// ------------------------------------------------------- generated Markdown

const familyOrder = (parsed) => [...new Set(parsed.prompts.map((p) => familyOf(p.prompt.id)))];

function tocMarkdown(parsed, stats) {
  const out = ['<!-- TOC:start -->', '## المحتويات', ''];
  out.push(`عدد البرومبتات: **${stats.prompts}** · المجموعات: **${stats.families}** · الأقسام: **${stats.sections}**. فهرس الرموز كلها في [القسم 36](#${parsed.headings.find((h) => h.section === '36' && h.level === 2)?.slug ?? ''}).`, '');
  for (const h of parsed.headings) {
    if (h.prompt || h.level < 2 || h.level > 3) continue;
    out.push(`${h.level === 3 ? '  ' : ''}- [${plain(h.text)}](#${h.slug})`);
  }
  out.push('<!-- TOC:end -->');
  return out.join('\n');
}

const cell = (s) => s.replace(/\|/g, '\\|');

function indexMarkdown(parsed, stats) {
  const out = ['<!-- INDEX:start -->', `عدد البرومبتات: **${stats.prompts}** في **${stats.families}** مجموعة.`, ''];
  for (const fam of familyOrder(parsed)) {
    const items = parsed.prompts.filter((p) => familyOf(p.prompt.id) === fam);
    out.push(`**\`${fam}\` — ${parsed.families.get(fam)}** (${items.length})`, '', '| الرمز | البرومبت | القسم |', '|---|---|---|');
    for (const p of items) out.push(`| [${p.prompt.id}](#${p.slug}) | ${cell(plain(p.prompt.title))} | ${p.section ?? ''} |`);
    out.push('');
  }
  out.push('<!-- INDEX:end -->');
  return out.join('\n');
}

function promptFiles(parsed) {
  const bodies = promptBodies(parsed);
  const sectionOf = new Map();
  let current = null;
  for (const h of parsed.headings) {
    if (h.level === 2) current = h;
    if (h.prompt) sectionOf.set(h.prompt.id, current);
  }
  const files = {};
  const rows = [];
  for (const spec of PROMPT_FILES) {
    const items = parsed.prompts.filter((p) => spec.families.includes(familyOf(p.prompt.id)));
    const out = [
      `# مكتبة البرومبتات: ${spec.title}`,
      '',
      `> ملف مولَّد من [الدليل الكامل](../BASIRA-GUIDE-AR.md) بالأمر \`node scripts/build-guide-ar.mjs\`. عدّل الدليل لا هذا الملف.`,
      '',
      `يضم: ${spec.families.map((f) => `\`${f}\` ${parsed.families.get(f) ?? ''}`.trim()).join(' · ')}. عدد البرومبتات: **${items.length}**.`,
      '',
      'انسخ ما في المربع، واستبدل ما بين القوسين المربعين بكلامك (مثل `[TOPIC]`)، واحذف سطر أي متغير لا تعرف قيمته.',
    ];
    let lastSection = null;
    for (const p of items) {
      const sec = sectionOf.get(p.prompt.id);
      if (sec !== lastSection) {
        out.push('', `## ${plain(sec.text)}`, '', `في الدليل: [${plain(sec.text)}](../BASIRA-GUIDE-AR.md#${sec.slug})`);
        lastSection = sec;
      }
      out.push('', `### ${p.text}`, '', bodies.get(p.prompt.id));
    }
    files[spec.file] = `${out.join('\n')}\n`;
    rows.push(`| [${spec.file}](${spec.file}) | ${spec.title} | ${spec.families.map((f) => `\`${f}\``).join(' ')} | ${items.length} |`);
  }
  files['README.md'] = `${[
    '# مكتبة برومبتات بصيرة',
    '',
    `> ملفات مولَّدة من [الدليل الكامل](../BASIRA-GUIDE-AR.md) بالأمر \`node scripts/build-guide-ar.mjs\`. عدّل الدليل لا هذه الملفات.`,
    '',
    `البرومبتات نفسها التي في الدليل، مقسّمة حسب الموضوع ليسهل فتح ملف واحد والنسخ منه. العدد الكلي: **${parsed.prompts.length}**.`,
    '',
    '| الملف | الموضوع | الرموز | العدد |',
    '|---|---|---|---|',
    ...rows,
    '',
    'ملخص سريع لأهم البرومبتات والأوامر: [BASIRA-CHEATSHEET-AR.md](../BASIRA-CHEATSHEET-AR.md).',
  ].join('\n')}\n`;
  return files;
}

function statsOf(parsed) {
  return {
    prompts: parsed.prompts.length,
    families: familyOrder(parsed).length,
    sections: parsed.headings.filter((h) => h.level === 2 && h.section).length,
    withExample: parsed.prompts.filter((p) => p.blocks > 1).length,
  };
}

function insertBlock(md, name, content) {
  const marker = `<!-- ${name} -->`;
  if (!md.includes(marker)) throw new Error(`the guide has no ${marker} marker`);
  return md.replace(marker, () => content);
}

// The guide with its generated parts, the library files, and the numbers.
export function buildGuide(source, extraTexts = {}) {
  const parsed = parseGuide(source);
  const stats = statsOf(parsed);
  const problems = validate(parsed, extraTexts);
  let md = insertBlock(parsed.md, 'TOC', tocMarkdown(parsed, stats));
  md = insertBlock(md, 'INDEX', indexMarkdown(parsed, stats));
  return { md, files: promptFiles(parsed), stats, problems, parsed };
}

export function sourceHash(md) {
  const script = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  return crypto.createHash('sha256').update(md).update('\0').update(script).digest('hex').slice(0, 16);
}

export async function pdfSourceHash(file = PDF) {
  if (!fs.existsSync(file)) return null;
  const pdf = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  return /source-sha256:([0-9a-f]+)/.exec(pdf.getKeywords() ?? '')?.[1] ?? null;
}

// --------------------------------------------------------------- HTML / PDF

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function htmlIds(parsed) {
  const ids = new Map();
  parsed.headings.forEach((h, k) => ids.set(h, h.prompt ? h.prompt.id.toLowerCase() : `h-${k}`));
  return ids;
}

function inline(s, links) {
  return s
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code dir="auto"${part.length <= 50 ? ' class="nw"' : ''}>${esc(part.slice(1, -1))}</code>`;
      return esc(part)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => `<a href="${href.startsWith('#') ? `#${links.get(decodeURIComponent(href.slice(1))) ?? ''}` : href}">${text}</a>`);
    })
    .join('');
}

// A prompt line: variables marked; a line without Arabic kept left-to-right.
function promptLine(line) {
  const html = esc(line).replace(/\[([A-Z][A-Z0-9_-]*)\]/g, '<span class="var">[$1]</span>');
  return !/[؀-ۿ]/.test(line) && /[A-Za-z]/.test(line) ? `<span dir="ltr">${html}</span>` : html;
}

function bodyHtml(parsed, mdLines, ids, links, parts, flows) {
  const out = [];
  const headings = parsed.headings.filter((h) => !(h.level === 1));
  let hk = 0;
  let section = null;
  let i = 0;
  while (i < mdLines.length) {
    const line = mdLines[i];
    const block = /^<!-- (\w+) -->$/.exec(line);
    if (block) {
      out.push(parts[block[1]] ?? '');
      i++;
      continue;
    }
    if (/^<!--.*-->$/.test(line)) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const body = [];
      for (i++; i < mdLines.length && !/^```/.test(mdLines[i]); i++) body.push(mdLines[i]);
      i++;
      out.push(`<pre class="prompt" dir="rtl">${body.map(promptLine).join('\n')}</pre>`);
      continue;
    }
    const h = /^(#{2,4}) (.+)$/.exec(line);
    if (h) {
      const head = headings[hk++];
      const id = ids.get(head);
      if (head.prompt) {
        out.push(`<h${head.level} class="ph" id="${id}"><span class="pid" dir="ltr">${head.prompt.id}</span><span class="pt">${inline(head.prompt.title, links)}</span></h${head.level}>`);
      } else {
        if (head.level === 2) {
          if (section) out.push(`<div class="endmark" id="end-${section}"></div>`);
          section = id;
        }
        out.push(`<h${head.level} id="${id}"${flows.has(id) ? ' class="flow"' : ''}>${inline(head.text, links)}</h${head.level}>`);
      }
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < mdLines.length && mdLines[i].startsWith('|'); i++) rows.push(mdLines[i]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const [head, , ...rest] = rows;
      out.push(`<table${rest.length <= 10 ? ' class="whole"' : ''}><thead><tr>${cells(head).map((c) => `<th>${inline(c, links)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, links)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = /^(-|\d+\.) (.*)$/.exec(line);
    if (li) {
      const ordered = li[1] !== '-';
      const items = [];
      for (; i < mdLines.length; ) {
        const m = /^(-|\d+\.) (.*)$/.exec(mdLines[i]);
        if (!m) break;
        let text = m[2];
        for (i++; i < mdLines.length && /^\s{2,}\S/.test(mdLines[i]); i++) text += ` ${mdLines[i].trim()}`;
        items.push(`<li>${inline(text, links)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    for (; i < mdLines.length && mdLines[i].trim() && !/^(#|```|\||<!--|(-|\d+\.) )/.test(mdLines[i]); i++) para.push(mdLines[i].trim());
    const text = para.join(' ');
    out.push(`<p${/[:：]\**$/.test(text) ? ' class="lead"' : ''}>${inline(text, links)}</p>`);
  }
  if (section) out.push(`<div class="endmark" id="end-${section}"></div>`);
  return out.join('\n');
}

const pageOf = (pages, id) => (pages ? String(pages.dests[id] ?? '?') : '000');

// Sections open on a new page, unless the one before ends near the top of
// its last page: then the next one follows on that page (no near-empty pages).
const TOP = (20 / 25.4) * 72;
const BOTTOM = (18 / 25.4) * 72;
export function flowsFrom(parsed, layout) {
  const ids = htmlIds(parsed);
  const h2 = parsed.headings.filter((h) => h.level === 2).map((h) => ids.get(h));
  const flows = new Set();
  for (let k = 1; k < h2.length; k++) {
    const start = layout.dests[h2[k - 1]];
    const end = layout.dests[`end-${h2[k - 1]}`];
    const used = (layout.height - TOP - layout.tops[`end-${h2[k - 1]}`]) / (layout.height - TOP - BOTTOM);
    if (end > start && used < 0.3) flows.add(h2[k]);
  }
  return flows;
}

function tocHtml(parsed, ids, pages) {
  const rows = parsed.headings
    .filter((h) => !h.prompt && (h.level === 2 || h.level === 3))
    .map((h) => `<a class="toc-e l${h.level}" href="#${ids.get(h)}"><span class="tt">${esc(plain(h.text))}</span><span class="dots"></span><span class="pg" dir="ltr">${pageOf(pages, ids.get(h))}</span></a>`);
  return `<nav class="toc"><h2 id="toc" class="toc-h">المحتويات</h2>${rows.join('')}</nav>`;
}

function indexHtml(parsed, ids, pages, stats) {
  const groups = familyOrder(parsed).map((fam) => {
    const items = parsed.prompts.filter((p) => familyOf(p.prompt.id) === fam);
    const rows = items.map((p) => `<a class="ix-e" href="#${ids.get(p)}"><span class="id" dir="ltr">${p.prompt.id}</span><span class="tt">${esc(plain(p.prompt.title))}</span><span class="pg" dir="ltr">${pageOf(pages, ids.get(p))}</span></a>`);
    return `<div class="ix-fam"><span class="fam" dir="ltr">${fam}</span> ${esc(parsed.families.get(fam) ?? '')} <span class="n">(${items.length})</span></div>${rows.join('')}`;
  });
  return `<p class="ix-sum">عدد البرومبتات: <strong>${stats.prompts}</strong> في <strong>${stats.families}</strong> مجموعة. الرقم في آخر كل سطر رقم الصفحة.</p><div class="ix">${groups.join('')}</div>`;
}

function coverHtml(parsed, stats, pages) {
  const title = parsed.headings.find((h) => h.level === 1)?.text ?? '';
  const [brand, sub] = title.split(' — ');
  const firstH2 = parsed.headings.find((h) => h.level === 2).line;
  const intro = parsed.lines
    .slice(parsed.headings.find((h) => h.level === 1).line + 1, firstH2)
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p.replace(/\n/g, ' '), new Map())}</p>`)
    .join('');
  const tile = (n, label) => `<div class="tile"><b dir="ltr">${n}</b><span>${label}</span></div>`;
  return `<section class="cover"><div class="band"></div><div class="brand">${esc(brand)}</div><h1 id="cover">${esc(sub ?? '')}</h1><div class="intro">${intro}</div><div class="tiles">${tile(stats.prompts, 'البرومبتات')}${tile(stats.families, 'المجموعات')}${tile(stats.sections, 'الأقسام')}${tile(pages ? pages.count : '000', 'الصفحات')}</div><p class="gen">مولَّد آليًا من <code dir="ltr">docs/BASIRA-GUIDE-AR.md</code> بالأمر <code dir="ltr">node scripts/build-guide-ar.mjs</code></p></section>`;
}

function css(fonts) {
  return `${fonts}
@font-face{font-family:'GuideMono';src:local('DejaVu Sans Mono'),local('DejaVuSansMono');unicode-range:U+0000-024F,U+2000-206F,U+2190-21FF}
${['Cairo', 'Tajawal'].flatMap((family) => [[400, 'DejaVu Sans', 'DejaVuSans'], [700, 'DejaVu Sans Bold', 'DejaVuSans-Bold'], [800, 'DejaVu Sans Bold', 'DejaVuSans-Bold']].map(([weight, full, ps]) => `@font-face{font-family:'${family}';font-weight:${weight};src:local('${full}'),local('${ps}');unicode-range:U+2190-21FF}`)).join('\n')}
:root{--blue:#2E7BC5;--blue-d:#1D5E9C;--blue-s:#EAF2FB;--line:#D5E4F3;--ink:#14181F;--mute:#4A515A;--soft:#F6F9FC}
@page{size:A4;margin:20mm 16mm 18mm;
  @top-center{content:'بصيرة · الدليل الكامل ومكتبة البرومبتات';direction:rtl;font-family:'Tajawal';font-size:8pt;color:#8A939C}
  @bottom-center{content:counter(page);font-family:'Cairo';font-weight:700;font-size:9pt;color:var(--mute)}}
@page:first{@top-center{content:none}@bottom-center{content:none}}
*{box-sizing:border-box}
html{background:#fff}
body{margin:0;font-family:'Tajawal',sans-serif;font-size:11pt;line-height:1.75;color:var(--ink);font-synthesis:none;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3,h4{font-family:'Cairo',sans-serif;line-height:1.45;break-after:avoid;break-inside:avoid}
h2{break-before:page;font-weight:800;font-size:19pt;margin:0 0 10pt;padding-bottom:8pt;border-bottom:3px solid var(--blue)}
h3{font-weight:700;font-size:13.5pt;color:var(--blue-d);margin:16pt 0 6pt}
h4{font-weight:700;font-size:12pt;margin:12pt 0 4pt}
.ph{display:flex;align-items:baseline;gap:7pt;font-size:11.5pt;font-weight:700;color:var(--ink);margin:14pt 0 4pt}
.ph .pid{flex:none;font-family:'Cairo';font-size:8.5pt;font-weight:700;color:var(--blue-d);background:var(--blue-s);border:1px solid var(--line);border-radius:4px;padding:0 5pt;line-height:1.7}
p{margin:4pt 0;orphans:2;widows:2}
p.lead{break-after:avoid}
ul,ol{margin:4pt 0;padding-inline-start:18pt}
li{margin:1.5pt 0}
strong{font-weight:700}
a{color:var(--blue-d);text-decoration:none}
table{width:100%;border-collapse:collapse;margin:6pt 0 8pt;font-size:9.8pt;line-height:1.6}
th,td{border:1px solid var(--line);padding:3.5pt 6pt;text-align:start;vertical-align:top;overflow-wrap:anywhere}
th{background:var(--blue-s);font-family:'Cairo';font-weight:700}
tr{break-inside:avoid}
h2.flow{break-before:auto;margin-top:26pt}
.endmark{height:0}
.ends{display:none}
table.whole{break-inside:avoid}
thead{display:table-header-group}
pre{margin:4pt 0 8pt;white-space:pre-wrap;overflow-wrap:anywhere}
pre.prompt{background:var(--soft);border:1px solid var(--line);border-inline-start:4px solid var(--blue);border-radius:6px;padding:7pt 10pt;font-family:'Tajawal';font-size:10.3pt;line-height:1.75;break-inside:avoid}
.var{color:var(--blue-d);background:#DDEAF8;border-radius:3px;padding:0 1.5pt;font-family:'Cairo';font-size:9.3pt;font-weight:700}
code{font-family:'GuideMono','Tajawal',monospace;font-size:8.8pt;background:#EEF2F6;border-radius:3px;padding:0 3pt;overflow-wrap:anywhere}
code.nw{white-space:nowrap;overflow-wrap:normal}
.cover{height:257mm;display:flex;flex-direction:column;justify-content:center;break-after:page;position:relative}
.cover .band{position:absolute;top:0;inset-inline:0;height:6pt;background:var(--blue);border-radius:3pt}
.cover .brand{font-family:'Cairo';font-weight:800;font-size:48pt;line-height:1.3;color:var(--blue)}
.cover h1{font-size:24pt;font-weight:800;margin:0 0 16pt;border:0}
.cover .intro{font-size:12pt;color:var(--mute);max-width:150mm}
.cover .intro p{margin:6pt 0}
.tiles{display:flex;gap:8pt;margin:22pt 0 0}
.tile{flex:1;border:1px solid var(--line);background:var(--soft);border-radius:8pt;padding:9pt 10pt}
.tile b{display:block;font-family:'Cairo';font-weight:800;font-size:22pt;line-height:1.2;color:var(--blue-d);text-align:right}
.tile span{font-size:10pt;color:var(--mute)}
.cover .gen{position:absolute;bottom:0;inset-inline:0;font-size:8.5pt;color:#8A939C}
.toc-h{margin-bottom:8pt}
.toc-e{display:flex;align-items:baseline;gap:5pt;color:var(--ink);break-inside:avoid}
.toc-e.l2{font-family:'Cairo';font-weight:700;font-size:11pt;margin-top:5pt}
.toc-e.l3{font-size:9.8pt;color:var(--mute);padding-inline-start:16pt;line-height:1.6}
.toc-e .dots{flex:1;border-bottom:1px dotted #B8C2CC;min-width:12pt}
.toc-e .pg{flex:none;min-width:20pt;text-align:left;font-family:'Cairo';font-weight:700}
.ix-sum{margin-bottom:8pt}
.ix{columns:2;column-gap:9mm;column-rule:1px solid var(--line)}
.ix-fam{font-family:'Cairo';font-weight:700;font-size:10pt;color:var(--blue-d);margin:9pt 0 3pt;padding-bottom:2pt;border-bottom:1px solid var(--line);break-after:avoid;break-inside:avoid}
.ix-fam .fam{font-size:8.5pt}
.ix-fam .n{color:var(--mute);font-weight:400}
.ix-e{display:grid;grid-template-columns:62pt 1fr auto;gap:5pt;align-items:baseline;font-size:8.8pt;line-height:1.55;color:var(--ink);break-inside:avoid;padding:0.6pt 0}
.ix-e .id{font-family:'Cairo';font-weight:700;font-size:7.8pt;color:var(--blue-d);text-align:right}
.ix-e .pg{font-family:'Cairo';font-weight:700;color:var(--mute);min-width:16pt;text-align:left}`;
}

export function guideHtml(parsed, pages, stats, flows = new Set()) {
  const ids = htmlIds(parsed);
  const links = new Map(parsed.headings.map((h) => [h.slug, ids.get(h)]));
  const firstH2 = parsed.headings.find((h) => h.level === 2).line;
  const bodyLines = parsed.lines.slice(firstH2);
  const parts = { TOC: '', INDEX: indexHtml(parsed, ids, pages, stats) };
  // Links to the section ends, so the PDF records where each one falls.
  const ends = parsed.headings.filter((h) => h.level === 2).map((h) => `<a href="#end-${ids.get(h)}"></a>`).join('');
  const { css: fonts } = fontFaceCss({ families: ['Cairo', 'Tajawal'], weights: [400, 700, 800] });
  const title = esc(parsed.headings.find((h) => h.level === 1)?.text ?? 'بصيرة');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>${css(fonts)}</style></head><body>${coverHtml(parsed, stats, pages)}${tocHtml(parsed, ids, pages)}${bodyHtml(parsed, bodyLines, ids, links, parts, flows)}<div class="ends">${ends}</div></body></html>`;
}

async function readPages(buf) {
  const pdf = await PDFDocument.load(buf, { updateMetadata: false });
  const refs = pdf.getPages().map((p) => p.ref.toString());
  const dests = {};
  const tops = {};
  const dict = pdf.catalog.lookup(PDFName.of('Dests'));
  if (dict instanceof PDFDict) {
    for (const [name, value] of dict.entries()) {
      let target = pdf.context.lookup(value);
      if (target instanceof PDFDict) target = target.lookup(PDFName.of('D'));
      dests[name.decodeText()] = refs.indexOf(target.get(0).toString()) + 1;
      tops[name.decodeText()] = target.lookup(3)?.asNumber?.() ?? null;
    }
  }
  return { count: refs.length, height: pdf.getPage(0).getHeight(), dests, tops };
}

// Fonts the PDF actually embeds (a fallback font here means a missing glyph).
async function embeddedFonts(buf) {
  const pdf = await PDFDocument.load(buf, { updateMetadata: false });
  const names = new Set();
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type'))?.toString() === '/Font') {
      const base = obj.get(PDFName.of('BaseFont'))?.toString();
      if (base) names.add(base.replace(/^\/([A-Z]{6}\+)?/, ''));
    }
  }
  return [...names].sort();
}

const same = (a, b) => a && b && a.count === b.count && JSON.stringify(a.dests) === JSON.stringify(b.dests);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

export async function renderPdf(built, { out = PDF, htmlOut = null, hash } = {}) {
  const { parsed, stats } = built;
  const require = createRequire('/opt/node22/lib/node_modules/');
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  }
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
  try {
    const page = await browser.newPage();
    let pages = null;
    let flows = new Set();
    let buf = null;
    let html = '';
    for (let pass = 1; ; pass++) {
      if (pass > 45) throw new Error('page layout did not settle after 45 passes');
      html = guideHtml(parsed, pages, stats, flows);
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (pass === 1) await checkLayout(page);
      buf = await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
      const next = await readPages(buf);
      const nextFlows = flowsFrom(parsed, next);
      if (same(pages, next) && sameSet(flows, nextFlows)) break;
      pages = next;
      flows = nextFlows;
    }
    if (htmlOut) fs.writeFileSync(htmlOut, html);
    const missing = parsed.headings.filter((h) => h.level > 1 && !pages.dests[htmlIds(parsed).get(h)]);
    if (missing.length) throw new Error(`no page for: ${missing.map((h) => h.text).slice(0, 5).join(', ')}`);
    const fonts = await embeddedFonts(buf);
    const foreign = fonts.filter((f) => !/^(Cairo|Tajawal|DejaVuSans)/.test(f));
    if (foreign.length) throw new Error(`unexpected fonts in the PDF (missing glyphs?): ${foreign.join(', ')}`);
    const pdf = await PDFDocument.load(buf, { updateMetadata: false });
    pdf.setTitle('بصيرة — الدليل الكامل ومكتبة البرومبتات', { showInWindowTitleBar: true });
    pdf.setAuthor('بصيرة');
    pdf.setSubject(`دليل المستخدم ومكتبة البرومبتات (${stats.prompts} برومبت)`);
    pdf.setKeywords(['بصيرة', 'Basira', 'arabic-carousel', 'prompts', `source-sha256:${hash}`]);
    pdf.setCreator('scripts/build-guide-ar.mjs');
    pdf.setLanguage('ar');
    fs.writeFileSync(out, await pdf.save());
    return { file: out, pages: pages.count, bytes: fs.statSync(out).size, fonts, flowing: flows.size };
  } finally {
    await browser.close();
  }
}

// Before printing: every box fits the text column (nothing clipped or
// pushed off the page) and no web font failed.
async function checkLayout(page) {
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: Math.floor((178 / 25.4) * 96), height: 1200 });
  const report = await page.evaluate(() => {
    const width = document.body.clientWidth;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).display === 'inline') continue;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 || r.right > width + 1 || r.left < -1) over.push(`${el.tagName.toLowerCase()}: ${el.textContent.slice(0, 60)}`);
    }
    const failed = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);
    return { over, failed };
  });
  if (report.failed.length) throw new Error(`fonts failed to load: ${report.failed.join(', ')}`);
  if (report.over.length) throw new Error(`content wider than the page:\n${report.over.slice(0, 10).join('\n')}`);
}

// -------------------------------------------------------------------- main

function readExtra() {
  const sheet = path.join(root, 'docs/BASIRA-CHEATSHEET-AR.md');
  return fs.existsSync(sheet) ? { 'BASIRA-CHEATSHEET-AR.md': fs.readFileSync(sheet, 'utf8') } : {};
}

async function main(argv) {
  const check = argv.includes('--check');
  const noPdf = argv.includes('--no-pdf');
  const htmlAt = argv.indexOf('--html');
  const source = fs.readFileSync(GUIDE, 'utf8');
  const built = buildGuide(source, readExtra());
  if (built.problems.length) {
    console.error(built.problems.join('\n'));
    process.exit(1);
  }
  const hash = sourceHash(built.md);
  if (check) {
    const stale = [];
    if (built.md !== source) stale.push('docs/BASIRA-GUIDE-AR.md (contents or index)');
    for (const [file, text] of Object.entries(built.files)) {
      const at = path.join(PROMPTS_DIR, file);
      if (!fs.existsSync(at) || fs.readFileSync(at, 'utf8') !== text) stale.push(`docs/prompts/${file}`);
    }
    for (const file of fs.existsSync(PROMPTS_DIR) ? fs.readdirSync(PROMPTS_DIR) : []) if (!built.files[file]) stale.push(`docs/prompts/${file} (not generated)`);
    if ((await pdfSourceHash()) !== hash) stale.push('docs/BASIRA-GUIDE-AR.pdf');
    if (stale.length) {
      console.error(`out of date, run node scripts/build-guide-ar.mjs:\n${stale.join('\n')}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, ...built.stats }));
    return;
  }
  fs.writeFileSync(GUIDE, built.md);
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  for (const [file, text] of Object.entries(built.files)) fs.writeFileSync(path.join(PROMPTS_DIR, file), text);
  const result = { ...built.stats, guide: path.relative(root, GUIDE), prompts_dir: path.relative(root, PROMPTS_DIR) };
  if (!noPdf) Object.assign(result, { pdf: await renderPdf(built, { hash, htmlOut: htmlAt >= 0 ? argv[htmlAt + 1] : null }) });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
