// Builds the Claude plugin in claude-plugin/:
//   skills/arabic-carousel/assets/carousel.html   the full editor as one offline file
//   skills/arabic-carousel/references/schema.json templates, fonts, palettes, plugins
// and zips the plugin to dist/arabic-carousel-plugin.zip for upload.
// Run after changing templates, plugins, fonts or styles: npm run build:plugin
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import JSZip from 'jszip';

const root = path.resolve(import.meta.dirname, '..');
const pluginDir = path.join(root, 'claude-plugin');
const skillDir = path.join(pluginDir, 'skills/arabic-carousel');
const fontsource = path.join(root, 'node_modules/@fontsource');

const esbuildBase = { bundle: true, write: false, jsx: 'automatic', loader: { '.js': 'jsx' }, legalComments: 'none' };

async function bundleEditor() {
  const result = await build({
    ...esbuildBase,
    entryPoints: [path.join(root, 'scripts/standalone.jsx')],
    format: 'iife',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return result.outputFiles[0].text;
}

async function compileCss() {
  const from = path.join(root, 'app/globals.css');
  const result = await postcss([tailwind({ base: root, optimize: true })]).process(await fs.readFile(from, 'utf8'), { from });
  return result.css;
}

// Same weights as app/layout.js. Only the arabic and latin subsets, woff2
// only, inlined as data URLs so the file works offline and the exporter has
// nothing to fetch.
const FONT_WEIGHTS = { cairo: [400, 700, 800], tajawal: [400, 500, 700, 800], almarai: [400, 700, 800], 'readex-pro': [400, 600, 700] };

async function inlineFonts() {
  const rules = [];
  for (const [family, weights] of Object.entries(FONT_WEIGHTS)) {
    for (const weight of weights) {
      for (const subset of ['arabic', 'latin']) {
        const css = await fs.readFile(path.join(fontsource, family, `${subset}-${weight}.css`), 'utf8');
        const file = css.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
        const data = (await fs.readFile(path.join(fontsource, family, 'files', file))).toString('base64');
        rules.push(css.replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${data}) format('woff2');`));
      }
    }
  }
  return rules.join('\n');
}

// Raw-text elements end at the first "</tag", so escape it inside them.
const escapeRawText = (text, tag) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

async function buildHtml() {
  const [js, css, fonts] = await Promise.all([bundleEditor(), compileCss(), inlineFonts()]);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>كاروسيل عربي — بصيرة</title>
<style>${escapeRawText(fonts + css, 'style')}</style>
</head>
<body class="antialiased">
<div id="root"></div>
<script id="carousel-seed" type="application/json"></script>
<script>${escapeRawText(js, 'script')}</script>
</body>
</html>
`;
}

async function buildSchema() {
  const result = await build({ ...esbuildBase, entryPoints: [path.join(root, 'scripts/schema-entry.js')], format: 'esm', platform: 'node', packages: 'external' });
  const tmp = path.join(root, 'node_modules/.cache/carousel-schema.mjs');
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, result.outputFiles[0].text);
  const { templateList, overlayPlugins, PALETTES, FONTS } = await import(pathToFileURL(tmp).href);
  await fs.rm(tmp);
  return {
    templates: templateList.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      hideBrandBadge: Boolean(t.hideBrandBadge),
      fields: t.fields.map(({ key, label, type, hint }) => ({ key, label, type, ...(hint && { hint }) })),
    })),
    fonts: Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label })),
    palettes: PALETTES.map(({ id, name, colors }) => ({ id, name, colors })),
    numerals: ['arab', 'latn'],
    plugins: overlayPlugins.map((p) => ({ id: p.id, label: p.label, defaults: p.defaults })),
  };
}

async function zipDir(dir, out) {
  const zip = new JSZip();
  const walk = async (rel) => {
    for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) await walk(relPath);
      else zip.file(relPath, await fs.readFile(path.join(dir, relPath)));
    }
  };
  await walk('');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

const [html, schema] = await Promise.all([buildHtml(), buildSchema()]);
await fs.writeFile(path.join(skillDir, 'assets/carousel.html'), html);
await fs.writeFile(path.join(skillDir, 'references/schema.json'), `${JSON.stringify(schema, null, 2)}\n`);
const zipPath = path.join(root, 'dist/arabic-carousel-plugin.zip');
await zipDir(pluginDir, zipPath);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`carousel.html  ${kb(Buffer.byteLength(html))}`);
console.log(`plugin zip     ${kb((await fs.stat(zipPath)).size)} → ${path.relative(root, zipPath)}`);
