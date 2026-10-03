import { ArabicRuns } from './ArabicText';
import { fromMarkedText } from '../lib/arabic-text/spec.js';

// Stored studio text uses *word* markers: they become mark spans (accent
// colour, or the marker band when the element has a highlight colour) and
// ArabicText renders the runs. The stored text itself is never changed.
export default function RichText({ text, highlight = null }) {
  const { text: plain, spans } = fromMarkedText(text ?? '', { mark: highlight ? 'highlight' : 'accent' });
  return <ArabicRuns text={plain} spans={spans} highlight={highlight} />;
}
