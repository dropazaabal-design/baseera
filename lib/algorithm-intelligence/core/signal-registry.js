import { DEFAULT_CONFIG } from '../config.js';
import { SIGNAL_CATALOG } from '../research/signal-catalog.js';
import { validateSources } from '../research/provenance.js';
import { PLATFORMS, PROVENANCE } from '../types.js';

// The one place engines look signals up. It merges the catalog (what a
// signal is and where it comes from) with the configuration (on/off
// switches and weight overrides) and, for one account, the adaptive weight
// factors learned from its history (learning/adaptive-weights.js).

export class SignalRegistry {
  constructor({ catalog = SIGNAL_CATALOG, config = DEFAULT_CONFIG, adaptive = null } = {}) {
    this.config = config;
    this.adaptive = adaptive; // { version, factors: { signalId: number } } or null
    this.byId = new Map();
    for (const s of catalog) {
      const override = config.signals?.[s.id] ?? {};
      this.byId.set(s.id, { ...s, enabled: override.enabled ?? s.enabled, ...(override.weight !== undefined && { weightOverride: override.weight }) });
    }
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  has(id) {
    return this.byId.has(id);
  }

  enabled(id) {
    return Boolean(this.byId.get(id)?.enabled);
  }

  list({ platform } = {}) {
    return [...this.byId.values()].filter((s) => !platform || s.platform === platform);
  }

  // A signal's weight in a group of the platform config (a score type or
  // the positive/negative blend): config weight, then the signal override,
  // then the account's adaptive factor. Disabled signals weigh 0.
  weight(id, base) {
    const s = this.byId.get(id);
    if (!s?.enabled) return 0;
    const w = s.weightOverride ?? base ?? 0;
    const factor = this.adaptive?.factors?.[id] ?? 1;
    return w * factor;
  }

  withAdaptive(adaptive) {
    const r = new SignalRegistry({ catalog: [...this.byId.values()].map(({ weightOverride, ...s }) => s), config: this.config, adaptive });
    return r;
  }
}

// Consistency checks between the catalog and a configuration: every signal
// a config names exists, every catalog entry has a valid provenance and
// sources that exist. Returns a list of problems (empty when consistent).
export function checkRegistry({ catalog = SIGNAL_CATALOG, config = DEFAULT_CONFIG } = {}) {
  const ids = new Set(catalog.map((s) => s.id));
  const out = [];
  for (const s of catalog) {
    if (!PLATFORMS.includes(s.platform)) out.push(`${s.id}: unknown platform ${s.platform}`);
    if (!PROVENANCE.includes(s.provenance)) out.push(`${s.id}: bad provenance ${s.provenance}`);
    if (!PROVENANCE.includes(s.relevance?.provenance)) out.push(`${s.id}: bad relevance provenance`);
    for (const p of validateSources(s.relevance?.sources)) out.push(`${s.id}: ${p}`);
    if (!s.id.startsWith(`${s.platform}.`)) out.push(`${s.id}: id must start with its platform`);
  }
  for (const [platform, pc] of Object.entries(config.platforms)) {
    const groups = { ...pc.scoreTypes, 'blend.positive': pc.blend.positive, 'blend.negative': pc.blend.negative };
    for (const [g, weights] of Object.entries(groups)) {
      for (const id of Object.keys(weights)) {
        if (!ids.has(id)) out.push(`${platform}.${g}: unknown signal ${id}`);
        else if (!id.startsWith(`${platform}.`)) out.push(`${platform}.${g}: ${id} belongs to another platform`);
      }
    }
  }
  return out;
}
