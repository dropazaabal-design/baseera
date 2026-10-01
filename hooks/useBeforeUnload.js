import { useEffect } from 'react';

// While `active`, closing or reloading the tab asks for confirmation, so a
// long export is not lost to an accidental click.
export default function useBeforeUnload(active) {
  useEffect(() => {
    if (!active) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
