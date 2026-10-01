import FitBox from '../components/FitBox';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import { SafeArea } from './shared';

function Quote({ data }) {
  return (
    <>
      <Icon
        name="quote"
        filled
        directional
        size={420}
        className="absolute top-[120px] start-[60px] text-(--c-accent) opacity-[0.12]"
      />
      <SafeArea>
        <FitBox min={34} max={80}>
          <div className="border-s-[10px] border-(--c-accent) ps-[0.7em]">
            <blockquote style={{ fontWeight: 'var(--w-bold)', lineHeight: 1.65 }}>
              <RichText text={data.quote} />
            </blockquote>
          </div>
          {data.author && (
            <div className="mt-[1em] flex items-center gap-[0.6em]" style={{ fontSize: 'max(0.4em, 30px)' }}>
              {data.photo ? (
                <img src={data.photo} alt="" className="size-[2.4em] shrink-0 rounded-full object-cover ring-[0.12em] ring-(--c-accent)" />
              ) : (
                <span className="h-[4px] w-[2em] shrink-0 rounded-full bg-(--c-accent)" />
              )}
              <div style={{ lineHeight: 1.5 }}>
                <div style={{ fontWeight: 'var(--w-bold)' }}>
                  <RichText text={data.author} />
                </div>
                {data.role && (
                  <div className="text-(--c-muted)" style={{ fontSize: '0.8em' }}>
                    <RichText text={data.role} />
                  </div>
                )}
              </div>
            </div>
          )}
        </FitBox>
      </SafeArea>
    </>
  );
}

export default {
  id: 'quote',
  label: 'اقتباس',
  description: 'اقتباس مؤثر مع اسم قائله',
  fields: [
    { key: 'quote', label: 'نص الاقتباس', type: 'textarea', rows: 4 },
    { key: 'author', label: 'القائل', type: 'text' },
    { key: 'role', label: 'الصفة', type: 'text' },
    { key: 'photo', label: 'صورة القائل', type: 'image' },
  ],
  defaults: {
    quote: 'الطريقة الوحيدة لإنجاز عمل عظيم هي أن *تحبّ* ما تفعله.',
    author: 'اسم القائل',
    role: 'المنصب أو الجهة',
    photo: null,
  },
  Component: Quote,
};
