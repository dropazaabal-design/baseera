// Bundled for pages (Playwright, demo): everything that runs in a browser.
import * as page from './page.js';
import * as motion from './motion.js';
import * as canvas from './canvas.js';
import * as htmlMotion from './htmlMotion.js';
import * as html from './html.js';
import * as spec from './spec.js';
import * as runs from './runs.js';

globalThis.ArabicText = { ...page, ...motion, ...canvas, ...htmlMotion, ...html, ...spec, ...runs };
