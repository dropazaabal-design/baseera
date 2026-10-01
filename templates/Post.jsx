import FitBox from '../components/FitBox';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import { Circle, SafeArea, nonEmpty } from './shared';

// One image that carries the whole arc: Hook → Core content → CTA.
function Post({ data }) {
  return (
    <>
      <Circle size={520} top={-200} start={-180} opacity={0.12} />
      <SafeArea>
        <FitBox min={24} max={44}>
          <h1 data-anim="rise" style={{ fontSize: '2.2em', fontWeight: 'var(--w-black)', lineHeight: 1.3 }}>
            <RichText text={data.hook} />
          </h1>
          <div data-anim="fade" className="mt-[0.5em] h-[10px] w-[140px] rounded-full bg-(--c-accent)" />
          <ul className="mt-[0.9em] flex flex-col gap-[0.5em]">
            {nonEmpty(data.points).map((point, i) => (
              <li key={i} data-anim="rise" className="flex items-start gap-[0.5em]">
                <span className="mt-[0.3em] grid size-[1.1em] shrink-0 place-items-center rounded-full bg-(--c-accent) text-(--c-on-accent)">
                  <Icon name="check" size="0.7em" strokeWidth={3} />
                </span>
                <span style={{ lineHeight: 1.6 }}>
                  <RichText text={point} />
                </span>
              </li>
            ))}
          </ul>
          {data.cta && (
            <div className="mt-[1em]">
              <span
                data-anim="pop"
                className="inline-flex items-center gap-[0.4em] whitespace-nowrap rounded-full bg-(--c-accent) px-[1em] py-[0.45em] text-(--c-on-accent)"
                style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.4 }}
              >
                <RichText text={data.cta} />
                <Icon name="arrow" directional size="1em" strokeWidth={2.5} />
              </span>
            </div>
          )}
        </FitBox>
      </SafeArea>
    </>
  );
}

export default {
  id: 'post',
  label: 'منشور مفرد',
  role: 'post',
  ownsCta: true,
  description: 'خطّاف ← محتوى ← دعوة في صورة واحدة',
  fields: [
    { key: 'hook', label: 'الخطّاف', type: 'textarea', rows: 2, hint: 'أول ما يقرؤه المتابع: سؤال أو رقم أو وعد واضح' },
    { key: 'points', label: 'المحتوى', type: 'list', rows: 4 },
    { key: 'cta', label: 'الدعوة للإجراء', type: 'text' },
  ],
  defaults: {
    hook: 'توقّف! *٣ أخطاء* تقتل تفاعل منشوراتك',
    points: ['تنشر دون خطّاف في السطر الأول', 'تكدّس أفكارًا كثيرة في صورة واحدة', 'تنسى دعوة واضحة للتفاعل'],
    cta: 'احفظه وشاركه',
  },
  Component: Post,
};
