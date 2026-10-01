// Paths are drawn for LTR. `directional` icons (arrows, quotes) are mirrored
// under RTL via the Tailwind rtl: variant, so "forward" points left in Arabic.
const PATHS = {
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
  arrowBack: <path d="M20 12H5M11 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M7 7l10 10M17 7L7 17" />,
  bookmark: <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1z" />,
  share: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  follow: <path d="M15 19c0-2.8-2.7-5-6-5s-6 2.2-6 5M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6" />,
  quote: (
    <path d="M9.5 6C6.5 6 4 8.6 4 12v6h6v-6H7c0-1.9 1.1-3.2 2.5-3.2V6zm10 0c-3 0-5.5 2.6-5.5 6v6h6v-6h-3c0-1.9 1.1-3.2 2.5-3.2V6z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <path d="M9 9h10v10H9zM5 15V5h10" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  image: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4" />,
  reset: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
};

export default function Icon({ name, size = 24, directional = false, filled = false, strokeWidth = 2, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${directional ? 'rtl:-scale-x-100' : ''} ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
