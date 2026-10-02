import { useState } from 'react';
import CarouselEditor from './CarouselEditor';
import StudioEditor from './studio/StudioEditor';
import { openInStudio } from './studio/openInStudio.js';

// The single-file editor: a studio design (schema 2) opens the studio; a
// classic carousel opens the classic editor, which can convert it.
export default function App() {
  const seedText = document.getElementById('carousel-seed')?.textContent.trim();
  const seed = seedText ? JSON.parse(seedText) : null;
  const [mode, setMode] = useState(() => (seed?.schemaVersion === 2 ? 'studio' : localStorage.getItem('baseera.mode') === 'studio' && !seed ? 'studio' : 'classic'));
  const go = (next) => {
    try {
      localStorage.setItem('baseera.mode', next);
    } catch {
      /* private mode */
    }
    setMode(next);
  };
  if (mode === 'studio') return <StudioEditor onClassic={seed?.schemaVersion === 2 ? null : () => go('classic')} />;
  return (
    <CarouselEditor
      onOpenStudio={(doc) => {
        openInStudio(doc, seedText);
        go('studio');
      }}
    />
  );
}
