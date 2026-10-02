import CarouselEditor from './CarouselEditor';
import { openInStudio } from './studio/openInStudio.js';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function ClassicPage() {
  return (
    <CarouselEditor
      onOpenStudio={(doc) => {
        openInStudio(doc);
        window.location.assign(`${base}/studio/`);
      }}
    />
  );
}
