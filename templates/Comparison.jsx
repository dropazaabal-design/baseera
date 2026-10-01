import FitBox from '../components/FitBox';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import { SafeArea, nonEmpty } from './shared';

function Column({ label, items, positive }) {
  const chip = positive ? 'bg-(--c-accent) text-(--c-on-accent)' : 'bg-(--c-bg) text-(--c-muted)';
  return (
    <div data-anim="rise" className={`rounded-[36px] border-4 bg-(--c-surface) p-[0.9em] ${positive ? 'border-(--c-accent)' : 'border-transparent'}`}>
      <div className="mb-[0.7em]">
        <span className={`inline-block whitespace-nowrap rounded-full px-[0.9em] py-[0.25em] ${chip}`} style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.6 }}>
          <RichText text={label} />
        </span>
      </div>
      <ul className="flex flex-col gap-[0.6em]">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-[0.45em]">
            <span className={`mt-[0.28em] grid size-[1.1em] shrink-0 place-items-center rounded-full ${chip}`}>
              <Icon name={positive ? 'check' : 'x'} size="0.7em" strokeWidth={3} />
            </span>
            <span style={{ lineHeight: 1.6 }}>
              <RichText text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comparison({ data }) {
  return (
    <SafeArea>
      <FitBox min={22} max={40}>
        <h2 data-anim="rise" className="mb-[0.8em] text-center" style={{ fontSize: '1.9em', fontWeight: 'var(--w-black)', lineHeight: 1.35 }}>
          <RichText text={data.title} />
        </h2>
        {/* In RTL the grid places "before" on the right, so the eye moves
            right → left, the way Arabic is read. */}
        <div className="relative grid grid-cols-2 gap-[1.1em]">
          <Column label={data.beforeLabel} items={nonEmpty(data.before)} />
          <Column label={data.afterLabel} items={nonEmpty(data.after)} positive />
          <span
            data-anim="pop"
            className="absolute top-1/2 left-1/2 grid size-[1.8em] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-(--c-accent) text-(--c-on-accent)"
            style={{ boxShadow: '0 0 0 0.25em var(--c-bg)' }}
          >
            <Icon name="arrow" directional size="1em" strokeWidth={2.5} />
          </span>
        </div>
      </FitBox>
    </SafeArea>
  );
}

export default {
  id: 'comparison',
  label: 'قبل / بعد',
  role: 'content',
  description: 'مقارنة بين حالتين في عمودين',
  fields: [
    { key: 'title', label: 'العنوان', type: 'textarea', rows: 2 },
    { key: 'beforeLabel', label: 'عنوان العمود الأول', type: 'text' },
    { key: 'before', label: 'عناصر العمود الأول', type: 'list', rows: 4 },
    { key: 'afterLabel', label: 'عنوان العمود الثاني', type: 'text' },
    { key: 'after', label: 'عناصر العمود الثاني', type: 'list', rows: 4 },
  ],
  defaults: {
    title: 'الفرق *واضح*',
    beforeLabel: 'قبل',
    before: ['عمل بلا خطة', 'تشتّت مستمر', 'نتائج غير متوقعة'],
    afterLabel: 'بعد',
    after: ['خطة أسبوعية واضحة', 'تركيز عميق', 'نتائج قابلة للقياس'],
  },
  Component: Comparison,
};
