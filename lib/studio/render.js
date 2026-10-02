import { base64Encode, dataUrlToBytes, utf8 } from './util.js';

// Shared rendering helpers (browser and Node).

// Colourable SVG assets mark recolourable parts with data-token="accent"
// (fill) and data-token-stroke="text" (stroke). The file stays valid SVG
// with its own default colours; renderers substitute the theme's colours, so
// switching palette or brand never regenerates an illustration.
export function recolorSvg(svg, colors) {
  const setAttr = (attrs, name, value) => {
    const re = new RegExp(`\\s${name}="[^"]*"`);
    return re.test(attrs) ? attrs.replace(re, ` ${name}="${value}"`) : `${attrs} ${name}="${value}"`;
  };
  return svg.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>/g, (m, tag, attrs = '', selfClose) => {
    const fill = /\sdata-token="(\w+)"/.exec(attrs);
    const stroke = /\sdata-token-stroke="(\w+)"/.exec(attrs);
    if (!fill && !stroke) return m;
    let a = attrs;
    if (fill && colors[fill[1]]) a = setAttr(a, 'fill', colors[fill[1]]);
    if (stroke && colors[stroke[1]]) a = setAttr(a, 'stroke', colors[stroke[1]]);
    return `<${tag}${a}${selfClose}>`;
  });
}

export const isColorable = (svg) => /\sdata-token(-stroke)?="\w+"/.test(svg);

const srcCache = new Map();

// URL an <img> can show for an asset under the given theme colours.
export function assetSrc(asset, colors) {
  if (!asset?.dataUrl) return null;
  if (!asset.colorable || asset.mediaType !== 'image/svg+xml') return asset.dataUrl;
  const key = `${asset.contentHash}:${Object.values(colors).join(',')}`;
  if (!srcCache.has(key)) {
    const decoded = dataUrlToBytes(asset.dataUrl);
    const svg = new TextDecoder().decode(decoded.bytes);
    srcCache.set(key, `data:image/svg+xml;base64,${base64Encode(utf8(recolorSvg(svg, colors)))}`);
    if (srcCache.size > 200) srcCache.delete(srcCache.keys().next().value);
  }
  return srcCache.get(key);
}
