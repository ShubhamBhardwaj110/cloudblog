import { Link } from 'react-router';
import { ArrowLeft } from '../components/Icons';
import { usePageMeta } from '../components/ui';

export default function NotFound() {
  usePageMeta('Not found');
  return (
    <div className="container center-page">
      <div>
        <p className="kicker">404</p>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 550, fontSize: 'clamp(2rem, 5vw, 3.2rem)', letterSpacing: '-0.03em', margin: '12px 0' }}>
          This page drifted off.
        </h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 24 }}>The article may have moved, or it was never here.</p>
        <Link to="/" className="btn"><ArrowLeft size={16} /> Back to all articles</Link>
      </div>
    </div>
  );
}
