import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { fontFaceCss } from './fontCss.js';
import { alphaBounds, decodePng } from './png.js';
import { layoutKey, normalizeSpec, rasterKey } from '../spec.js';
import { registerTypesetter } from '../typesetter.js';

// The Chromium typesetter for Node (scripts, tests, exports): a headless
// Chromium page with the local font files, where lib/arabic-text/page.js
// lays out and measures, and element screenshots give transparent rasters.
// The same page code runs in the editor and in the video capture, so the
// numbers a script gets are the numbers the browser uses.

const root = path.resolve(import.meta.dirname, '../../..');

function loadPlaywright() {
  for (const base of [root, '/opt/node22/lib/node_modules/']) {
    try {
      return createRequire(path.join(base, 'noop.js'))('playwright');
    } catch {}
  }
  throw new Error('playwright is not available: the Chromium typesetter needs Playwright and a Chromium build');
}

function findChromium() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!fs.existsSync(dir)) return undefined;
  for (const d of fs.readdirSync(dir).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const exe = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

let bundleCache = null;
export async function pageBundle() {
  if (!bundleCache) {
    const out = await build({ entryPoints: [path.join(root, 'lib/arabic-text/page-entry.js')], bundle: true, write: false, format: 'iife', platform: 'browser', legalComments: 'none' });
    bundleCache = out.outputFiles[0].text;
  }
  return bundleCache;
}

/**
 * @param {{ executablePath?: string, families?: string[], extraFaces?: {family,weight,url}[] }} options
 */
export async function createChromiumTypesetter({ executablePath = findChromium(), families, extraFaces = [] } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath });
  const version = browser.version();
  const { css, fontsHash } = fontFaceCss({ families, extra: extraFaces });
  const script = await pageBundle();
  const env = { renderer: `chromium/${version}`, fonts: fontsHash };
  const pages = new Map();
  const cache = new Map();

  async function pageFor(scale) {
    if (!pages.has(scale)) {
      const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 2400, height: 4000 } });
      const page = await context.newPage();
      await page.setContent(`<!doctype html><html lang="ar"><head><meta charset="utf-8"><style>${css}\nhtml,body{margin:0;background:transparent}bdi{unicode-bidi:isolate}</style></head><body><div id="host" style="position:relative"></div></body></html>`);
      await page.addScriptTag({ content: script });
      pages.set(scale, page);
    }
    return pages.get(scale);
  }

  async function prepareFonts(requests) {
    const page = await pageFor(1);
    return page.evaluate(async (reqs) => Promise.all(reqs.map((r) => globalThis.ArabicText.prepareFont(document, r, r.text ?? ''))), requests);
  }

  async function typeset(input, { raster = true, scale = 1, marks = 'static' } = {}) {
    const spec = normalizeSpec(input);
    const key = { layout: layoutKey(spec, env), raster: rasterKey(spec, env, { scale, marks }) };
    const cacheId = raster ? key.raster : key.layout;
    if (cache.has(cacheId)) return { ...cache.get(cacheId), cached: true };
    const page = await pageFor(scale);
    const result = await page.evaluate(
      async ({ spec, marks }) => {
        const host = document.getElementById('host');
        host.innerHTML = '';
        return globalThis.ArabicText.typesetSpec(document, spec, { host, marks });
      },
      { spec, marks },
    );
    result.key = key;
    result.renderer = env.renderer;
    if (raster && result.layout) {
      const el = await page.$('[data-at-layer]');
      const png = await el.screenshot({ omitBackground: true });
      const img = decodePng(png);
      const L = result.layout.layer;
      const ink = alphaBounds(img);
      // Ink touching the raster's edge means the layer cut a mark or a tail.
      const clipped = Boolean(ink && (ink.x === 0 || ink.y === 0 || ink.x + ink.width >= img.width || ink.y + ink.height >= img.height));
      result.raster = {
        png,
        width: img.width,
        height: img.height,
        scale,
        ink: ink && { x: +(ink.x / scale + L.x).toFixed(2), y: +(ink.y / scale + L.y).toFixed(2), width: +(ink.width / scale).toFixed(2), height: +(ink.height / scale).toFixed(2) },
        clipped,
      };
      if (clipped) {
        result.ok = false;
        result.errors.push({ code: 'ink.clipped', message: 'حبر النص يلمس حافة الطبقة: علامة أو ذيل حرف سيُقص.' });
      }
    }
    cache.set(cacheId, result);
    return result;
  }

  // Renders arbitrary HTML (an HTML-engine frame) on a transparent page at
  // the given scale, with the same fonts.
  async function renderHtml(html, { width, height, scale = 1 } = {}) {
    const page = await pageFor(scale);
    await page.evaluate(
      async ({ html, width, height }) => {
        const host = document.getElementById('host');
        host.innerHTML = `<div id="frame" style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${html}</div>`;
        await document.fonts.ready;
      },
      { html, width, height },
    );
    return (await page.$('#frame')).screenshot({ omitBackground: true });
  }

  // Runs a function in the typesetter page (adapters, comparisons).
  async function evaluate(fn, arg, { scale = 1 } = {}) {
    return (await pageFor(scale)).evaluate(fn, arg);
  }

  return {
    name: 'chromium',
    version,
    env,
    prepareFonts,
    typeset,
    renderHtml,
    evaluate,
    pageFor,
    async close() {
      await browser.close();
    },
  };
}

registerTypesetter('chromium', createChromiumTypesetter, { engine: 'Chromium (HarfBuzz + Unicode bidi, HTML/CSS layout)' });
