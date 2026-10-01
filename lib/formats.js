// Slide formats. `inset` reserves the zones Instagram Stories covers with
// its own UI (progress bar and profile at the top, reply bar at the bottom),
// so overlays and content stay visible there.
export const FORMATS = {
  portrait: { id: 'portrait', label: 'عمودي', ratio: '4:5', width: 1080, height: 1350, inset: { top: 0, bottom: 0 } },
  square: { id: 'square', label: 'مربع', ratio: '1:1', width: 1080, height: 1080, inset: { top: 0, bottom: 0 } },
  story: { id: 'story', label: 'قصة', ratio: '9:16', width: 1080, height: 1920, inset: { top: 250, bottom: 320 } },
};

export const formatOf = (id) => FORMATS[id] ?? FORMATS.portrait;
