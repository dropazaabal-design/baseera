import { overlayPlugins } from '../../plugins';
import { Section, Toggle } from '../ui';

export default function PluginsPanel({ plugins, onChange }) {
  return overlayPlugins.map((p) => {
    const settings = plugins[p.id];
    return (
      <Section
        key={p.id}
        title={p.label}
        aside={<Toggle checked={settings.enabled} label={p.label} onChange={(enabled) => onChange(p.id, { enabled })} />}
      >
        <p className="text-xs text-zinc-500">{p.description}</p>
        {settings.enabled && <p.Settings settings={settings} onChange={(patch) => onChange(p.id, patch)} />}
      </Section>
    );
  });
}
