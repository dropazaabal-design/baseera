import FitBox from '../components/FitBox';
import RichText from '../components/RichText';
import { formatNumber } from '../lib/numerals.js';
import { Circle, SafeArea, nonEmpty } from './shared';

function Listicle({ data, ctx }) {
  const start = Number(data.start) || 1;
  return (
    <>
      <Circle size={340} top={-120} end={-120} opacity={0.1} />
      <SafeArea>
        <FitBox min={24} max={46} align="start">
          <h2 data-anim="rise" className="mb-[0.7em]" style={{ fontSize: '1.9em', fontWeight: 'var(--w-black)', lineHeight: 1.35 }}>
            <RichText text={data.title} />
          </h2>
          <ol className="flex flex-col gap-[0.55em]">
            {nonEmpty(data.items).map((item, i) => (
              <li key={i} data-anim="rise" className="flex items-start gap-[0.7em] rounded-[28px] bg-(--c-surface) px-[0.9em] py-[0.7em]">
                <span
                  className="grid size-[1.9em] shrink-0 place-items-center rounded-full bg-(--c-accent) text-(--c-on-accent)"
                  style={{ fontWeight: 'var(--w-black)', lineHeight: 1 }}
                >
                  {formatNumber(start + i, ctx.numerals)}
                </span>
                <span className="pt-[0.12em]" style={{ lineHeight: 1.65 }}>
                  <RichText text={item} />
                </span>
              </li>
            ))}
          </ol>
        </FitBox>
      </SafeArea>
    </>
  );
}

export default {
  id: 'listicle',
  label: 'قائمة خطوات',
  role: 'content',
  description: 'خطوات أو نقاط مرقّمة',
  fields: [
    { key: 'title', label: 'العنوان', type: 'textarea', rows: 2 },
    { key: 'items', label: 'العناصر', type: 'list', rows: 6 },
    { key: 'start', label: 'يبدأ الترقيم من', type: 'number', hint: 'لمتابعة الترقيم عبر أكثر من شريحة' },
  ],
  defaults: {
    title: 'خطوات *بسيطة* للبدء',
    items: ['حدّد هدفًا واضحًا واحدًا', 'قسّمه إلى مهام صغيرة', 'ابدأ بأسهل مهمة اليوم'],
    start: 1,
  },
  Component: Listicle,
};
