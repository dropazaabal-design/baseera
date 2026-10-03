// Browser entry of the demo reel: the project's reel engine (lib/video.js:
// capture with html-to-image, frame compositing, WebCodecs encoding) with
// the ArabicText adapter it now uses for text motion.
import { captureReel, drawFrame, encodeReel } from '../../lib/video.js';

globalThis.Reel = { captureReel, drawFrame, encodeReel };
