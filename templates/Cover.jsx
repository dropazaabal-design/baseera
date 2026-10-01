import FitBox from '../components/FitBox';
import RichText from '../components/RichText';
import { Circle, SafeArea } from './shared';

function Cover({ data }) {
  return (
    <>
      <Circle size={760} top={-260} end={-280} opacity={0.14} />
      <Circle size={240} top={560} end={-140} opacity={0.16} ring />
      <SafeArea>
        <FitBox min={64} max={150}>
          {data.kicker && (
            <div className="mb-[0.55em]" style={{ fontSize: 'max(0.22em, 30px)' }}>
              <span
                data-anim="pop"
                className="inline-block whitespace-nowrap rounded-full bg-(--c-accent) px-[1em] py-[0.35em] text-(--c-on-accent)"
                style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.5 }}
              >
                <RichText text={data.kicker} />
              </span>
            </div>
          )}
          <h1 data-anim="rise" style={{ fontWeight: 'var(--w-black)', lineHeight: 1.3 }}>
            <RichText text={data.title} />
          </h1>
          <div data-anim="fade" className="mt-[0.4em] h-[12px] w-[160px] rounded-full bg-(--c-accent)" />
          {data.subtitle && (
            <p data-anim="rise" className="mt-[0.9em] text-(--c-muted)" style={{ fontSize: 'max(0.28em, 34px)', lineHeight: 1.7 }}>
              <RichText text={data.subtitle} />
            </p>
          )}
        </FitBox>
      </SafeArea>
    </>
  );
}

export default {
  id: 'cover',
  label: 'غلاف',
  role: 'hook',
  description: 'عنوان جذّاب يفتتح الكاروسيل',
  fields: [
    { key: 'kicker', label: 'الشارة', type: 'text' },
    { key: 'title', label: 'العنوان الرئيسي', type: 'textarea', rows: 3 },
    { key: 'subtitle', label: 'العنوان الفرعي', type: 'textarea', rows: 3 },
  ],
  defaults: {
    kicker: 'دليل عملي',
    title: 'عنوان *يشدّ* الانتباه من أول نظرة',
    subtitle: 'سطر داعم يوضّح الفائدة التي سيحصل عليها القارئ.',
  },
  Component: Cover,
};
