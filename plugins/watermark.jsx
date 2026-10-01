import RichText from '../components/RichText';
import { ToggleRow } from '../components/ui';
import { Avatar } from '../templates/shared';

function Overlay({ settings, ctx, template }) {
  const { brand } = ctx;
  const showBadge = settings.showBadge && !template.hideBrandBadge && (brand.name || brand.handle || brand.avatar);
  return (
    <>
      {settings.showLogo && brand.logo && (
        <img src={brand.logo} alt="" className="absolute start-[96px] h-[76px] w-auto max-w-[300px] object-contain"
          style={{ top: 'calc(var(--inset-top) + 40px)' }}
        />
      )}
      {showBadge && (
        <div className="absolute start-[96px] flex items-center gap-[18px]" style={{ bottom: 'calc(var(--inset-bottom) + 56px)' }}>
          <Avatar brand={brand} size={84} />
          <div className="whitespace-nowrap" style={{ lineHeight: 1.35 }}>
            {brand.name && (
              <div className="text-[30px]" style={{ fontWeight: 'var(--w-bold)' }}>
                <RichText text={brand.name} />
              </div>
            )}
            {brand.handle && (
              <div className="text-[26px] text-(--c-muted)">
                <RichText text={brand.handle} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Settings({ settings, onChange }) {
  return (
    <>
      <ToggleRow label="الشعار أعلى الشريحة" checked={settings.showLogo} onChange={(showLogo) => onChange({ showLogo })} />
      <ToggleRow label="شارة الحساب أسفل الشريحة" checked={settings.showBadge} onChange={(showBadge) => onChange({ showBadge })} />
      <p className="text-xs text-zinc-500">الاسم والمعرّف والشعار والصورة تُعدَّل من تبويب «التصميم» ← «الهوية».</p>
    </>
  );
}

export default {
  id: 'watermark',
  label: 'العلامة والهوية',
  description: 'شعارك وصورتك ومعرّفك على كل الشرائح.',
  defaults: { enabled: true, showLogo: true, showBadge: true },
  Overlay,
  Settings,
};
