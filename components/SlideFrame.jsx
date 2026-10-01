import { SLIDE_H, SLIDE_W } from '../lib/exportEngine.js';

// Shows a full-size 1080×1350 slide at any preview size. The transform lives
// on this wrapper, never on the slide node, so exports stay pixel-exact.
export default function SlideFrame({ scale, className = '', children }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
