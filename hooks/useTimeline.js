import { useEffect, useMemo, useState } from 'react';
import { REEL, buildTimeline } from '../lib/timeline.js';

// Timeline state for a reel: the chosen duration and the scene timing
// derived from it. `specs` is null until the scenes have been captured.
export default function useTimeline(specs, initialDuration = REEL.duration) {
  const [duration, setDuration] = useState(initialDuration);
  const timeline = useMemo(() => specs && buildTimeline(specs, { duration }), [specs, duration]);
  return { timeline, duration, setDuration };
}

// Looping playhead for the preview. Kept separate so only the player
// re-renders every animation frame.
export function usePlayhead(duration, paused) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const running = playing && !paused;

  useEffect(() => {
    if (!running) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      setTime((t) => (t + (now - last) / 1000) % duration);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, duration]);

  return { time, playing, setPlaying, seek: setTime };
}
