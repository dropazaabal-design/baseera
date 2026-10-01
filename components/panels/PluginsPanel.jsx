import { overlayPlugins } from '../../plugins';
import { Locked, Section, Toggle } from '../ui';

// `plugins` are the effective (policy-applied) settings, so a locked panel
// shows exactly what the slides render.
export default function PluginsPanel({ plugins, locked, onChange }) {
  return (
    <>
      {locked && (
        <p className="mx-5 mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
          الإضافات مقفلة في الوضع المؤسسي: الترقيم والعلامة إلزاميان، وباقي الإعدادات ثابتة كما هي.
        </p>
      )}
      {overlayPlugins.map((p) => {
        const settings = plugins[p.id];
        return (
          <Section
            key={p.id}
            title={p.label}
            aside={<Toggle checked={settings.enabled} disabled={locked} label={p.label} onChange={(enabled) => onChange(p.id, { enabled })} />}
          >
            <p className="text-xs text-zinc-500">{p.description}</p>
            {settings.enabled && (
              <Locked locked={locked}>
                <p.Settings settings={settings} onChange={(patch) => onChange(p.id, patch)} />
              </Locked>
            )}
          </Section>
        );
      })}
    </>
  );
}
