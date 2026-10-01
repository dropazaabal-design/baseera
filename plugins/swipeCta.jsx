import Icon from '../components/Icon';
import RichText from '../components/RichText';
import { Chips, Field, TextInput, ToggleRow } from '../components/ui';

function Overlay({ settings, ctx }) {
  const text = ctx.isLast ? settings.lastText : settings.text;
  if (!text) return null;
  return (
    <div
      className="absolute bottom-[60px] end-[96px] flex items-center whitespace-nowrap gap-[14px] rounded-full bg-(--c-accent) py-[14px] ps-[30px] pe-[24px] text-[30px] text-(--c-on-accent)"
      style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.4 }}
    >
      <RichText text={text} />
      {/* Drawn pointing "forward" (right); mirrored to point left in RTL,
          which is also the direction Instagram carousels are swiped. */}
      {!ctx.isLast && settings.showArrow && <Icon name="arrow" directional size={34} strokeWidth={2.5} />}
    </div>
  );
}

function Settings({ settings, onChange }) {
  return (
    <>
      <Field label="نص السحب">
        <TextInput value={settings.text} onChange={(e) => onChange({ text: e.target.value })} />
      </Field>
      <Chips options={['اسحب لليسار', 'اسحب لليسار 👈', 'تابع القراءة', 'المزيد في الشريحة التالية']} onPick={(text) => onChange({ text })} />
      <ToggleRow label="سهم اتجاه تلقائي" checked={settings.showArrow} onChange={(showArrow) => onChange({ showArrow })} />
      <Field label="نص الشريحة الأخيرة">
        <TextInput value={settings.lastText} onChange={(e) => onChange({ lastText: e.target.value })} />
      </Field>
      <Chips options={['احفظ البوست 📌', 'شاركه مع صديق 🔁', 'تابعنا للمزيد']} onPick={(lastText) => onChange({ lastText })} />
    </>
  );
}

export default {
  id: 'swipe',
  label: 'دعوة السحب والإجراء',
  description: 'تحثّ على السحب في كل شريحة، وعلى الحفظ في الأخيرة.',
  defaults: { enabled: true, text: 'اسحب لليسار', lastText: 'احفظ البوست 📌', showArrow: true },
  Overlay,
  Settings,
};
