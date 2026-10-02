'use client';

import dynamic from 'next/dynamic';

// The editor is browser-only (localStorage, ResizeObserver, canvas export),
// so it skips prerendering. Everything below this line is plain React.
const CarouselEditor = dynamic(() => import('../components/ClassicPage'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-zinc-500">جارٍ التحميل…</div>,
});

export default function Page() {
  return <CarouselEditor />;
}
