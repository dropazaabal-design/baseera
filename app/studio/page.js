'use client';

import dynamic from 'next/dynamic';

// The design studio: independent elements, chat edits, library and memory.
const Studio = dynamic(() => import('../../components/studio/StudioPage'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-zinc-500">جارٍ التحميل…</div>,
});

export default function Page() {
  return <Studio />;
}
