import RichText from '../components/RichText';
import { Field, Segmented, ToggleRow } from '../components/ui';
import { counterLabel } from '../lib/numerals.js';
import { mix } from '../lib/contrast.js';

function Overlay({ settings, ctx }) {
  const { index, total, colors, numerals } = ctx;
  if (total < 2) return null;
  return (
    <>
      {settings.showBar && (
        <div className="absolute inset-x-0 h-[12px]" style={{ top: 'var(--inset-top)', background: mix(colors.text, colors.bg, 0.86) }}>
          {/* Anchored at inline-start: fills from the right in RTL. Each slide
              shows (i+1)/n, so swiping reads as one continuous bar. */}
          <div
            className="absolute inset-y-0 start-0 rounded-e-full bg-(--c-accent)"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      )}
      {settings.showCounter && (
        <div
          className="absolute end-[96px] whitespace-nowrap rounded-full bg-(--c-surface) px-[26px] py-[8px] text-[28px] text-(--c-muted)"
          style={{ top: 'calc(var(--inset-top) + 52px)', fontWeight: 'var(--w-bold)', lineHeight: 1.5 }}
        >
          <RichText text={counterLabel(index, total, settings.style, numerals)} />
        </div>
      )}
    </>
  );
}

function Settings({ settings, onChange }) {
  return (
    <>
      <Field label="صيغة العداد">
        <Segmented
          value={settings.style}
          onChange={(style) => onChange({ style })}
          options={[
            { value: 'words', label: 'الشريحة ١ من ٥' },
            { value: 'fraction', label: '١/٥' },
          ]}
        />
      </Field>
      <ToggleRow label="شريط التقدّم العلوي" checked={settings.showBar} onChange={(showBar) => onChange({ showBar })} />
      <ToggleRow label="عدّاد الشرائح" checked={settings.showCounter} onChange={(showCounter) => onChange({ showCounter })} />
    </>
  );
}

export default {
  id: 'pagination',
  label: 'الترقيم وشريط التقدّم',
  description: 'عدّاد على كل شريحة وشريط تقدّم يمتد عبر الكاروسيل.',
  defaults: { enabled: true, style: 'words', showBar: true, showCounter: true },
  Overlay,
  Settings,
};
