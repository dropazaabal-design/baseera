import pagination from './pagination';
import swipe from './swipeCta';
import watermark from './watermark';

// Overlay plugins render on top of every slide, in this order.
// The palette plugin (./palettes.js) is not an overlay: it resolves colours
// before any slide renders.
export const overlayPlugins = [pagination, swipe, watermark];

export const pluginDefaults = () => Object.fromEntries(overlayPlugins.map((p) => [p.id, { ...p.defaults }]));
