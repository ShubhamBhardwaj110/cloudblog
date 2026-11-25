import '../styles/admin.css';

import { useQuery } from '@tanstack/react-query';
import { WebStorageStateStore } from 'oidc-client-ts';
import { useMemo } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { Chat, Cloud, External, FileText, Grid, LogOut, Plus } from '../components/Icons';
import { Spinner, ThemeToggle, usePageMeta } from '../components/ui';
import { config } from '../lib/config';
import Dashboard from './Dashboard';
import Editor from './Editor';
import Moderation from './Moderation';
import PostsList from './PostsList';
import { useAdminApi } from './useAdminApi';

export default function AdminApp() {
  const cfg = config();
  const oidc = useMemo(
    () => ({
      authority: `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`,
      client_id: cfg.clientId,
      redirect_uri: `${window.location.origin}/admin/callback`,
      post_logout_redirect_uri: `${window.location.origin}/`,
      response_type: 'code', // Authorization Code + PKCE (no client secret in the browser)
      scope: 'openid email profile',
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    }),
    [cfg],
  );
  return (
    <AuthProvider {...oidc}>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const auth = useAuth();
  const location = useLocation();
  usePageMeta('Admin');

  if (auth.isLoading || auth.activeNavigator) {
    return <div className="center-page"><Spinner label="Checking your session" /></div>;
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="panel login-card">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-mark"><Cloud size={18} strokeWidth={2.2} /></span>
          {config().siteTitle}
        </div>
        <h1>Writer’s desk</h1>
        <p style={{ color: 'var(--ink-2)' }}>Sign in to write, edit and moderate.</p>
        {auth.error && <div className="alert alert-error">{auth.error.message}</div>}
        <button
          className="btn btn-primary"
          onClick={() => {
            sessionStorage.setItem('returnTo', location.pathname === '/admin/callback' ? '/admin' : location.pathname);
            void auth.signinRedirect();
          }}
        >
          Sign in
        </button>
        <Link to="/" className="btn btn-ghost">Back to the blog</Link>
      </div>
    );
  }

  if (location.pathname === '/admin/callback') {
    const to = sessionStorage.getItem('returnTo') || '/admin';
    sessionStorage.removeItem('returnTo');
    return <Navigate to={to} replace />;
  }

  return <Shell />;
}

function Shell() {
  const auth = useAuth();
  const api = useAdminApi();
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.stats(), refetchInterval: 60_000 });
  const pending = stats?.pendingComments ?? 0;
  const { cognitoDomain, clientId } = config();

  const signOut = async () => {
    await auth.removeUser();
    // Cognito has no standard end_session endpoint, so use its /logout URL.
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(`${window.location.origin}/`)}`;
  };

  const links = (
    <>
      <NavLink to="/admin" end><Grid size={17} /> Dashboard</NavLink>
      <NavLink to="/admin/posts" end><FileText size={17} /> Posts</NavLink>
      <NavLink to="/admin/posts/new"><Plus size={17} /> New post</NavLink>
      <NavLink to="/admin/comments"><Chat size={17} /> Comments {pending > 0 && <span className="badge">{pending}</span>}</NavLink>
    </>
  );

  return (
    <div className="admin">
      <aside className="admin-side">
        <Link to="/" className="brand">
          <span className="brand-mark"><Cloud size={18} strokeWidth={2.2} /></span>
          {config().siteTitle}
        </Link>
        {links}
        <div className="spacer" />
        <a href="/" target="_blank" rel="noopener"><External size={17} /> View site</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="link" onClick={signOut}><LogOut size={17} /> Sign out</button>
          <ThemeToggle />
        </div>
        <div className="who" title={auth.user?.profile.email}>{auth.user?.profile.email}</div>
      </aside>
      <div>
        <nav className="admin-mobile-nav">{links}<a href="#" onClick={(e) => { e.preventDefault(); void signOut(); }}>Sign out</a></nav>
        <main className="admin-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="posts" element={<PostsList />} />
            <Route path="posts/new" element={<Editor key="new" />} />
            <Route path="posts/:postId" element={<Editor />} />
            <Route path="comments" element={<Moderation />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
