// Self-hosted fonts (bundled from npm): same-origin, so the exporter can read
// and inline them. Only the weights mapped in lib/fonts.js are loaded.
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/800.css';
import '@fontsource/almarai/400.css';
import '@fontsource/almarai/700.css';
import '@fontsource/almarai/800.css';
import '@fontsource/readex-pro/400.css';
import '@fontsource/readex-pro/600.css';
import '@fontsource/readex-pro/700.css';
import './globals.css';

export const metadata = {
  title: 'بصيرة — مولّد الكاروسيل العربي',
  description: 'صمّم كاروسيل عربي بمقاس 1080×1350 وصدّره PNG أو ZIP.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
