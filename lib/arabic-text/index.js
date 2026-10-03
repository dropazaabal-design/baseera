// ArabicText — public API (browser-safe). Node-only pieces live in
// lib/arabic-text/node/ (the Chromium typesetter, font CSS, PNG helpers).
export { ARABIC_TEXT_VERSION, LAYOUT_RULES_VERSION, normalizeSpec, validateSpec, fromMarkedText, toMarkedText, layoutKey, rasterKey, serializeArabicText, parseArabicText, compareStoredText } from './spec.js';
export { buildRuns, autoSpans, wordsOf, paragraphsOf } from './runs.js';
export { runsHtml, arabicTextHtml, paragraphStyle, markerCss, MARKER, esc } from './html.js';
export { FONT_REGISTRY, checkFontRequest } from './fonts.js';
export { EFFECTS, UNITS, EASINGS, normalizeMotion, validateMotion, planMotion, frameState, segmentsOf, bandsOf, highlightWords, framesOf } from './motion.js';
export { drawArabicTextFrame } from './canvas.js';
export { frameHtml } from './htmlMotion.js';
export { prepareFont, measureParagraph, measureBox, typesetSpec, joiningHolds, textMap } from './page.js';
export { registerTypesetter, createTypesetter, typesetters } from './typesetter.js';
