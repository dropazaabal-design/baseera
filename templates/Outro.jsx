import FitBox from '../components/FitBox';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import { Avatar, Circle, SafeArea, nonEmpty } from './shared';

function Outro({ data, ctx }) {
  const { brand } = ctx;
  const actions = [
    { icon: 'bookmark', label: data.save },
    { icon: 'share', label: data.share },
    { icon: 'follow', label: data.follow },
  ].filter((a) => a.label);

  return (
    <>
      <Circle size={900} bottom={-520} start={-260} opacity={0.1} />
      <SafeArea>
        <FitBox min={40} max={96}>
          <div className="flex flex-col items-center text-center">
            <div data-anim="pop">
              <Avatar brand={brand} size="2.4em" ring />
            </div>
            {(brand.name || brand.handle) && (
              <div data-anim="fade" className="mt-[0.7em]" style={{ fontSize: 'max(0.34em, 30px)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 'var(--w-bold)' }}>
                  <RichText text={brand.name} />
                </span>{' '}
                <span className="text-(--c-muted)">
                  <RichText text={brand.handle} />
                </span>
              </div>
            )}
            <h2 data-anim="rise" className="mt-[0.45em]" style={{ fontWeight: 'var(--w-black)', lineHeight: 1.3 }}>
              <RichText text={data.title} />
            </h2>
            {data.subtitle && (
              <p data-anim="rise" className="mt-[0.5em] text-(--c-muted)" style={{ fontSize: 'max(0.34em, 32px)', lineHeight: 1.7 }}>
                <RichText text={data.subtitle} />
              </p>
            )}
            {actions.length > 0 && (
              <div data-anim="rise" className="mt-[0.7em] flex w-full flex-wrap justify-center gap-[0.35em]" style={{ fontSize: 'max(0.32em, 30px)' }}>
                {actions.map((a, i) => (
                  <span
                    key={a.icon}
                    className={`flex items-center gap-[0.4em] whitespace-nowrap rounded-full px-[0.9em] py-[0.45em] ${
                      i === 0 ? 'bg-(--c-accent) text-(--c-on-accent)' : 'bg-(--c-surface)'
                    }`}
                    style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.4 }}
                  >
                    <Icon name={a.icon} size="1.1em" />
                    <RichText text={a.label} />
                  </span>
                ))}
              </div>
            )}
            {nonEmpty(data.socials).length > 0 && (
              <div data-anim="fade" className="mt-[0.6em] flex w-full flex-wrap justify-center gap-[0.3em]" style={{ fontSize: 'max(0.28em, 28px)' }}>
                {nonEmpty(data.socials).map((s, i) => (
                  <span key={i} className="whitespace-nowrap rounded-full border-2 border-(--c-muted) px-[0.8em] py-[0.25em] text-(--c-muted)" style={{ lineHeight: 1.5 }}>
                    <RichText text={s} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </FitBox>
      </SafeArea>
    </>
  );
}

export default {
  id: 'outro',
  label: 'خاتمة',
  role: 'cta',
  description: 'دعوة للحفظ والمتابعة وحساباتك',
  hideBrandBadge: true,
  ownsCta: true,
  fields: [
    { key: 'title', label: 'العنوان', type: 'textarea', rows: 2 },
    { key: 'subtitle', label: 'العنوان الفرعي', type: 'textarea', rows: 2 },
    { key: 'save', label: 'زر الحفظ', type: 'text' },
    { key: 'share', label: 'زر المشاركة', type: 'text' },
    { key: 'follow', label: 'زر المتابعة', type: 'text' },
    { key: 'socials', label: 'الحسابات والروابط', type: 'list', rows: 3 },
  ],
  defaults: {
    title: 'هل كان المحتوى *مفيدًا*؟',
    subtitle: 'تابعنا لتصلك أفكار عملية كل أسبوع.',
    save: 'احفظه',
    share: 'شاركه',
    follow: 'تابعنا',
    socials: ['@handle'],
  },
  Component: Outro,
};
