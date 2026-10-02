import StudioEditor from './StudioEditor';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function StudioPage() {
  return <StudioEditor onClassic={() => window.location.assign(`${base}/`)} />;
}
