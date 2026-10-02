import { FONT_IDS } from './measure.js';
import { isFiniteNumber, isObject } from './util.js';

// Data contracts of the design studio, with runtime validation. Every
// validator returns a list of { path, message } (empty when valid) instead of
// throwing, so callers can report all problems at once.
//
// All geometry is in pixels of the page (a 1080×1350 page is 1080 units
// wide). Destination adapters convert units when a destination needs to.

export const SCHEMA_VERSION = 2;

export const ELEMENT_KINDS = ['text', 'image', 'shape'];
export const EDITABILITY = ['native', 'partial', 'flattened'];
export const THEME_TOKENS = ['bg', 'surface', 'text', 'muted', 'accent', 'onAccent'];
export const FORMATS = {
  portrait: { id: 'portrait', ratio: '4:5', width: 1080, height: 1350, inset: { top: 0, bottom: 0 } },
  square: { id: 'square', ratio: '1:1', width: 1080, height: 1080, inset: { top: 0, bottom: 0 } },
  story: { id: 'story', ratio: '9:16', width: 1080, height: 1920, inset: { top: 250, bottom: 320 } },
};
export const SHAPES = ['rect', 'ellipse', 'path', 'line'];
export const ANIMATIONS = ['rise', 'fade', 'pop'];
export const PATCH_ACTIONS = ['replace_text', 'move', 'resize', 'update_style', 'replace_asset', 'delete', 'lock', 'layer', 'hide'];
export const DESIGN_STATUSES = ['candidate', 'used', 'approved', 'rejected'];
export const ASSET_KINDS = ['generated', 'user_upload', 'licensed'];
export const ASSET_USAGE = ['insertable', 'reference'];
export const MEMORY_ORIGINS = ['explicit_feedback', 'observed_pattern'];
export const SEVERITIES = ['error', 'warning'];

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const MAX_TEXT = 4000;
const MAX_COORD = 20000;

const err = (path, message) => ({ path, message });

export const isColor = (v) => typeof v === 'string' && (HEX.test(v) || v === 'none' || (v.startsWith('@') && THEME_TOKENS.includes(v.slice(1))));
export const isFontRef = (v) => typeof v === 'string' && (FONT_IDS.includes(v) || v === '@heading' || v === '@body');
export const isId = (v) => typeof v === 'string' && ID.test(v);

export function validateFrame(frame, path) {
  if (!isObject(frame)) return [err(path, 'frame must be an object { x, y, width, height }')];
  const out = [];
  for (const key of ['x', 'y', 'width', 'height']) {
    const v = frame[key];
    if (!isFiniteNumber(v)) out.push(err(`${path}.${key}`, 'must be a finite number'));
    else if (Math.abs(v) > MAX_COORD) out.push(err(`${path}.${key}`, `out of range (|${key}| ≤ ${MAX_COORD})`));
    else if ((key === 'width' || key === 'height') && v <= 0) out.push(err(`${path}.${key}`, 'must be greater than 0'));
  }
  return out;
}

const TEXT_STYLE_KEYS = {
  fontFamily: isFontRef,
  fontSize: (v) => isFiniteNumber(v) && v >= 6 && v <= 800,
  minFontSize: (v) => isFiniteNumber(v) && v >= 6 && v <= 800,
  color: isColor,
  accentColor: isColor,
  weight: (v) => Number.isInteger(v) && v >= 100 && v <= 900,
  direction: (v) => v === 'rtl' || v === 'ltr',
  align: (v) => ['start', 'center', 'end'].includes(v),
  verticalAlign: (v) => ['start', 'center', 'end'].includes(v),
  lineHeight: (v) => isFiniteNumber(v) && v >= 0.8 && v <= 3,
  // Single-line labels (pills, counters, handles) never wrap.
  nowrap: (v) => typeof v === 'boolean',
};
const SHAPE_KEYS = {
  fill: isColor,
  stroke: isColor,
  strokeWidth: (v) => isFiniteNumber(v) && v >= 0 && v <= 200,
  radius: (v) => isFiniteNumber(v) && v >= 0 && v <= 10000,
};
const COMMON_KEYS = {
  opacity: (v) => isFiniteNumber(v) && v >= 0 && v <= 1,
  rotation: (v) => isFiniteNumber(v) && v >= -180 && v <= 180,
};

export function validateTextStyle(style, path, { partial = false } = {}) {
  if (!isObject(style)) return [err(path, 'style must be an object')];
  const out = [];
  for (const [key, value] of Object.entries(style)) {
    if (!TEXT_STYLE_KEYS[key]) out.push(err(`${path}.${key}`, 'unknown text style property'));
    else if (!TEXT_STYLE_KEYS[key](value)) out.push(err(`${path}.${key}`, `invalid value ${JSON.stringify(value)}`));
  }
  if (!partial) {
    for (const key of ['fontFamily', 'fontSize', 'color', 'weight', 'direction', 'align', 'lineHeight']) {
      if (style[key] === undefined) out.push(err(`${path}.${key}`, 'required'));
    }
  }
  return out;
}

export function validateElement(el, path, { width, height } = {}) {
  if (!isObject(el)) return [err(path, 'element must be an object')];
  const out = [];
  if (!isId(el.id)) out.push(err(`${path}.id`, 'must match [A-Za-z0-9._:-], 1–80 chars'));
  if (!ELEMENT_KINDS.includes(el.kind)) out.push(err(`${path}.kind`, `must be one of ${ELEMENT_KINDS.join(', ')}`));
  out.push(...validateFrame(el.frame, `${path}.frame`));
  if (!Number.isInteger(el.z)) out.push(err(`${path}.z`, 'must be an integer'));
  if (typeof el.locked !== 'boolean') out.push(err(`${path}.locked`, 'must be true or false'));
  for (const [key, check] of Object.entries(COMMON_KEYS)) {
    if (el[key] !== undefined && !check(el[key])) out.push(err(`${path}.${key}`, `invalid value ${JSON.stringify(el[key])}`));
  }
  if (el.anim !== undefined && !ANIMATIONS.includes(el.anim)) out.push(err(`${path}.anim`, `must be one of ${ANIMATIONS.join(', ')}`));
  if (el.hidden !== undefined && typeof el.hidden !== 'boolean') out.push(err(`${path}.hidden`, 'must be true or false'));
  if (el.kind === 'text') {
    if (typeof el.text !== 'string') out.push(err(`${path}.text`, 'must be a string'));
    else if (el.text.length > MAX_TEXT) out.push(err(`${path}.text`, `longer than ${MAX_TEXT} characters`));
    out.push(...validateTextStyle(el.style, `${path}.style`));
  } else if (el.kind === 'image') {
    if (!isId(el.assetId)) out.push(err(`${path}.assetId`, 'must be an asset id'));
    if (typeof el.alt !== 'string') out.push(err(`${path}.alt`, 'must be a string (may be empty for decoration)'));
    if (el.fit !== undefined && !['contain', 'cover'].includes(el.fit)) out.push(err(`${path}.fit`, 'must be contain or cover'));
  } else if (el.kind === 'shape') {
    if (!SHAPES.includes(el.shape)) out.push(err(`${path}.shape`, `must be one of ${SHAPES.join(', ')}`));
    if (!isColor(el.fill)) out.push(err(`${path}.fill`, 'must be #RRGGBB, none or a theme token like @accent'));
    for (const [key, check] of Object.entries(SHAPE_KEYS)) {
      if (key !== 'fill' && el[key] !== undefined && !check(el[key])) out.push(err(`${path}.${key}`, `invalid value ${JSON.stringify(el[key])}`));
    }
    if (el.shape === 'path') {
      if (typeof el.path !== 'string' || !/^[MmLlHhVvCcSsAaZz0-9,.+\-eE\s]+$/.test(el.path)) {
        out.push(err(`${path}.path`, 'SVG path with M/L/H/V/C/S/A/Z commands only'));
      }
      if (!Array.isArray(el.viewBox) || el.viewBox.length !== 2 || !el.viewBox.every((v) => isFiniteNumber(v) && v > 0)) {
        out.push(err(`${path}.viewBox`, 'must be [width, height]'));
      }
    }
  }
  return out;
}

export function validatePage(page, path, assets) {
  if (!isObject(page)) return [err(path, 'page must be an object')];
  const out = [];
  if (!isId(page.id)) out.push(err(`${path}.id`, 'invalid page id'));
  for (const key of ['widthPx', 'heightPx']) {
    if (!Number.isInteger(page[key]) || page[key] < 40 || page[key] > 8000) out.push(err(`${path}.${key}`, 'integer between 40 and 8000'));
  }
  if (!Array.isArray(page.elements)) return [...out, err(`${path}.elements`, 'must be a list')];
  const seen = new Set();
  page.elements.forEach((el, i) => {
    const where = `${path}.elements[${i}]`;
    out.push(...validateElement(el, where, { width: page.widthPx, height: page.heightPx }));
    if (el?.id) {
      if (seen.has(el.id)) out.push(err(`${where}.id`, `duplicate element id "${el.id}" on this page`));
      seen.add(el.id);
    }
    if (el?.kind === 'image' && assets && isId(el.assetId) && !assets[el.assetId]) {
      out.push(err(`${where}.assetId`, `asset "${el.assetId}" is not in the document`));
    }
  });
  return out;
}

export function validateDocument(doc) {
  if (!isObject(doc)) return [err('', 'document must be an object')];
  const out = [];
  if (doc.schemaVersion !== SCHEMA_VERSION) out.push(err('schemaVersion', `must be ${SCHEMA_VERSION} (run the migration first)`));
  if (!isId(doc.id)) out.push(err('id', 'invalid document id'));
  if (!Number.isInteger(doc.revision) || doc.revision < 1) out.push(err('revision', 'integer ≥ 1'));
  if (typeof doc.creatorId !== 'string' || !doc.creatorId) out.push(err('creatorId', 'required'));
  if (doc.brandId !== undefined && doc.brandId !== null && !isId(doc.brandId)) out.push(err('brandId', 'invalid brand id'));
  if (typeof doc.brief !== 'string') out.push(err('brief', 'must be a string'));
  if (!Array.isArray(doc.pages) || !doc.pages.length) out.push(err('pages', 'need at least one page'));
  else if (doc.pages.length > 20) out.push(err('pages', 'at most 20 pages'));
  if (doc.assets !== undefined && !isObject(doc.assets)) out.push(err('assets', 'must be an object keyed by asset id'));
  const pageIds = new Set();
  (Array.isArray(doc.pages) ? doc.pages : []).forEach((page, i) => {
    out.push(...validatePage(page, `pages[${i}]`, doc.assets ?? {}));
    if (page?.id) {
      if (pageIds.has(page.id)) out.push(err(`pages[${i}].id`, `duplicate page id "${page.id}"`));
      pageIds.add(page.id);
    }
  });
  for (const [id, asset] of Object.entries(isObject(doc.assets) ? doc.assets : {})) {
    out.push(...validateAsset(asset, `assets.${id}`));
    if (asset?.id !== id) out.push(err(`assets.${id}.id`, 'must equal its key'));
  }
  if (doc.theme !== undefined) {
    if (!isObject(doc.theme?.colors)) out.push(err('theme.colors', 'required'));
    else {
      for (const token of THEME_TOKENS) {
        if (!HEX.test(doc.theme.colors[token] ?? '')) out.push(err(`theme.colors.${token}`, 'must be #RRGGBB'));
      }
    }
  }
  return out;
}

export function validateAsset(asset, path = 'asset') {
  if (!isObject(asset)) return [err(path, 'asset must be an object')];
  const out = [];
  if (!isId(asset.id)) out.push(err(`${path}.id`, 'invalid asset id'));
  if (!/^[0-9a-f]{64}$/.test(asset.contentHash ?? '')) out.push(err(`${path}.contentHash`, 'must be a sha-256 hex digest'));
  if (typeof asset.storageRef !== 'string' || !asset.storageRef) out.push(err(`${path}.storageRef`, 'required'));
  if (!/^(image|video)\/[a-z0-9.+-]+$/.test(asset.mediaType ?? '')) out.push(err(`${path}.mediaType`, 'must be an image/* or video/* type'));
  for (const key of ['widthPx', 'heightPx']) {
    if (!isFiniteNumber(asset[key]) || asset[key] <= 0) out.push(err(`${path}.${key}`, 'must be greater than 0'));
  }
  if (!Array.isArray(asset.tags) || !asset.tags.every((t) => typeof t === 'string')) out.push(err(`${path}.tags`, 'must be a list of strings'));
  if (!isObject(asset.provenance) || !ASSET_KINDS.includes(asset.provenance.kind)) {
    out.push(err(`${path}.provenance.kind`, `must be one of ${ASSET_KINDS.join(', ')}`));
  }
  if (asset.usage !== undefined && !ASSET_USAGE.includes(asset.usage)) out.push(err(`${path}.usage`, `must be one of ${ASSET_USAGE.join(', ')}`));
  return out;
}

const PATCH_PAYLOAD = {
  replace_text: (p) => (typeof p.text === 'string' && p.text.length <= MAX_TEXT ? null : 'needs { text } (string)'),
  move: (p) =>
    ['x', 'y', 'dx', 'dy'].some((k) => p[k] !== undefined) && ['x', 'y', 'dx', 'dy'].every((k) => p[k] === undefined || isFiniteNumber(p[k]))
      ? null
      : 'needs numeric x/y or dx/dy',
  resize: (p) =>
    ['width', 'height', 'scale'].some((k) => p[k] !== undefined) &&
    ['width', 'height', 'scale'].every((k) => p[k] === undefined || (isFiniteNumber(p[k]) && p[k] > 0))
      ? null
      : 'needs positive width/height or scale',
  update_style: (p) => (isObject(p) && Object.keys(p).length ? null : 'needs at least one style property'),
  replace_asset: (p) => (isId(p.assetId) ? null : 'needs { assetId }'),
  delete: () => null,
  lock: (p) => (typeof p.locked === 'boolean' ? null : 'needs { locked: true|false }'),
  layer: (p) => (Number.isInteger(p.z) || ['front', 'back', 'forward', 'backward'].includes(p.to) ? null : 'needs { z } or { to: front|back|forward|backward }'),
  hide: (p) => (typeof p.hidden === 'boolean' ? null : 'needs { hidden: true|false }'),
};

export function validatePatch(patch, path = 'patch') {
  if (!isObject(patch)) return [err(path, 'patch must be an object')];
  const out = [];
  if (!isId(patch.pageId)) out.push(err(`${path}.pageId`, 'invalid page id'));
  if (!isId(patch.elementId)) out.push(err(`${path}.elementId`, 'invalid element id'));
  if (!PATCH_ACTIONS.includes(patch.action)) {
    out.push(err(`${path}.action`, `must be one of ${PATCH_ACTIONS.join(', ')}`));
    return out;
  }
  if (!isObject(patch.payload)) {
    out.push(err(`${path}.payload`, 'must be an object'));
    return out;
  }
  const problem = PATCH_PAYLOAD[patch.action](patch.payload);
  if (problem) out.push(err(`${path}.payload`, problem));
  return out;
}

// Style properties a patch may set, per element kind.
export function validateStylePayload(kind, payload, path) {
  const out = [];
  for (const [key, value] of Object.entries(payload)) {
    const check = COMMON_KEYS[key] ?? (kind === 'text' ? TEXT_STYLE_KEYS[key] : kind === 'shape' ? SHAPE_KEYS[key] : undefined);
    if (!check) out.push(err(`${path}.${key}`, `not a style property of a ${kind} element`));
    else if (!check(value)) out.push(err(`${path}.${key}`, `invalid value ${JSON.stringify(value)}`));
  }
  return out;
}

export function validateMemoryRecord(rec, path = 'memory') {
  if (!isObject(rec)) return [err(path, 'record must be an object')];
  const out = [];
  if (!isId(rec.id)) out.push(err(`${path}.id`, 'invalid id'));
  if (typeof rec.creatorId !== 'string' || !rec.creatorId) out.push(err(`${path}.creatorId`, 'required'));
  if (!isObject(rec.scope)) out.push(err(`${path}.scope`, 'must be an object'));
  else {
    for (const [key, value] of Object.entries(rec.scope)) {
      if (!['brandId', 'platform', 'format', 'projectId'].includes(key)) out.push(err(`${path}.scope.${key}`, 'unknown scope key'));
      else if (typeof value !== 'string' || !value) out.push(err(`${path}.scope.${key}`, 'must be a non-empty string'));
    }
  }
  if (typeof rec.preference !== 'string' || !rec.preference) out.push(err(`${path}.preference`, 'required'));
  if (typeof rec.evidence !== 'string') out.push(err(`${path}.evidence`, 'must be a string'));
  if (!MEMORY_ORIGINS.includes(rec.origin)) out.push(err(`${path}.origin`, `must be one of ${MEMORY_ORIGINS.join(', ')}`));
  if (typeof rec.confirmed !== 'boolean') out.push(err(`${path}.confirmed`, 'must be true or false'));
  if (!isFiniteNumber(rec.confidence) || rec.confidence < 0 || rec.confidence > 1) out.push(err(`${path}.confidence`, 'number in [0, 1]'));
  if (typeof rec.updatedAt !== 'string' || Number.isNaN(Date.parse(rec.updatedAt))) out.push(err(`${path}.updatedAt`, 'ISO date'));
  return out;
}

export function validateCapabilities(caps) {
  const out = [];
  for (const key of ['createDesign', 'insertText', 'updateText', 'setFontFamily', 'insertAsset', 'positionElements', 'preview']) {
    if (typeof caps?.[key] !== 'boolean') out.push(err(key, 'must be true or false'));
  }
  if (!Array.isArray(caps?.exportFormats) || !caps.exportFormats.every((f) => ['png', 'pdf', 'svg'].includes(f))) {
    out.push(err('exportFormats', 'list of png, pdf, svg'));
  }
  return out;
}

export function validateDelivery(result) {
  const out = [];
  if (typeof result?.saved !== 'boolean') out.push(err('saved', 'must be true or false'));
  if (!EDITABILITY.includes(result?.editability)) out.push(err('editability', `must be one of ${EDITABILITY.join(', ')}`));
  if (!Array.isArray(result?.files)) out.push(err('files', 'must be a list'));
  if (!Array.isArray(result?.limitations)) out.push(err('limitations', 'must be a list'));
  return out;
}

export class ContractError extends Error {
  constructor(what, problems) {
    super(`${what}: ${problems.map((p) => `${p.path || '(root)'} ${p.message}`).join('; ')}`);
    this.name = 'ContractError';
    this.problems = problems;
  }
}

export function assertValid(what, problems) {
  if (problems.length) throw new ContractError(what, problems);
}
