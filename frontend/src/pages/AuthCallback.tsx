import { Navigate } from 'react-router';
import { Spinner } from '../components/ui';
import { useSession } from '../lib/session';

/** Cognito redirects here; react-oidc-context exchanges the code, then we go back where the user was. */
export default function AuthCallback() {
  const { auth } = useSession();
  if (auth.error) {
    return (
      <div className="container center-page">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)' }}>Sign-in failed</h1>
          <p style={{ color: 'var(--ink-2)', margin: '8px 0 20px' }}>{auth.error.message}</p>
          <button className="btn btn-primary" onClick={() => void auth.signinRedirect()}>Try again</button>
        </div>
      </div>
    );
  }
  if (auth.isLoading || !auth.isAuthenticated) return <div className="center-page"><Spinner label="Signing you in" /></div>;
  const returnTo = (auth.user?.state as { returnTo?: string } | undefined)?.returnTo;
  const safe = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/auth/') ? returnTo : '/';
  return <Navigate to={safe} replace />;
}
