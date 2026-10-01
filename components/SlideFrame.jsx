// Shows a full-size slide at any preview size. The transform lives on this
// wrapper, never on the slide node, so exports stay pixel-exact.
export default function SlideFrame({ scale, width, height, className = '', children }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: width * scale, height: height * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
