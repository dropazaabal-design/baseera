import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDomMeasure, loadDocFonts } from './domMeasure.js';
import { composeAll } from '../../lib/studio/document.js';
import { createHistory, pushHistory, redo, undo } from '../../lib/studio/patch.js';
import { LocalStorageStore } from '../../lib/studio/store.js';
import { openStudio } from '../../lib/studio/studio.js';
import { createSampleDesign } from '../../lib/studio/sample.js';
import { validateDocument } from '../../lib/studio/contracts.js';

const DOC_KEY = 'baseera.studio.doc';

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = Math.imul(h, 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// The document to open: the embedded one (the plugin's file), the last
// autosave for it, or the sample. A saved copy that no longer validates
// (older schema, damaged storage) is ignored rather than opened broken.
export function initialStudioDoc() {
  const seedText = document.getElementById('carousel-seed')?.textContent.trim();
  const seed = seedText ? JSON.parse(seedText) : null;
  const key = seedText ? `${DOC_KEY}:${hash(seedText)}` : DOC_KEY;
  const fresh = () => (seed?.schemaVersion === 2 ? seed : createSampleDesign());
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(key));
    if (saved && validateDocument(saved).length) saved = null;
  } catch {
    saved = null;
  }
  return { doc: saved ?? fresh(), key, fresh };
}

export default function useStudio(initial) {
  const studio = useMemo(() => {
    try {
      return openStudio(new LocalStorageStore('baseera.studio/'), { session: 'editor' });
    } catch {
      return null;
    }
  }, []);
  const [history, setHistory] = useState(() => createHistory(initial.doc, 80));
  const [measureReady, setMeasureReady] = useState(false);
  const measureRef = useRef(null);
  const doc = history.present;

  // Exact layout once the fonts are in: the CLI laid the file out with the
  // calibrated estimate; here the real glyphs decide. Not an undo step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadDocFonts(doc);
      await document.fonts.ready;
      if (cancelled) return;
      measureRef.current = createDomMeasure();
      setHistory((h) => ({ ...h, present: composeAll(h.present, { measure: measureRef.current }) }));
      setMeasureReady(true);
    })();
    return () => {
      cancelled = true;
      measureRef.current?.dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    try {
      localStorage.setItem(initial.key, JSON.stringify(doc));
      setSaveError(null);
    } catch {
      setSaveError('تعذّر الحفظ التلقائي: مساحة التخزين في المتصفح ممتلئة.');
    }
  }, [doc, initial.key]);

  // Layout options for edits: the DOM measure once fonts are loaded.
  const layoutOptions = useCallback(() => ({ measure: measureRef.current ?? undefined }), []);

  const commit = useCallback((next, label) => setHistory((h) => (next === h.present ? h : pushHistory(h, next, label))), []);
  const relayout = useCallback(() => setHistory((h) => pushHistory(h, composeAll(h.present, { measure: measureRef.current ?? undefined }), 'إعادة التوزيع')), []);
  const reset = useCallback(() => setHistory((h) => pushHistory(h, initial.fresh(), 'استعادة الأصل')), [initial]);

  // Keyboard: Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y (not while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      // In a text field Ctrl+Z undoes typing; an empty field (e.g. the chat
      // box after sending) gives it back to the design.
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && e.target.value !== '';
      if (!(e.ctrlKey || e.metaKey) || typing) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        setHistory(undo);
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        setHistory(redo);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    studio,
    doc,
    history,
    layoutOptions,
    measureReady,
    saveError,
    commit,
    relayout,
    reset,
    undo: () => setHistory(undo),
    redo: () => setHistory(redo),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
