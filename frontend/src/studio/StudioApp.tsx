import '../styles/studio.css';

import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { Chat, Cloud, External, FileText, Grid, LogOut, Plus, Shield, UserIcon, Users } from '../components/Icons';
import { Avatar, Spinner, ThemeToggle, usePageMeta } from '../components/ui';
import { config } from '../lib/config';
import { useSession } from '../lib/session';
import { AdminComments, AdminOverview, AdminPosts, AdminUsers } from './AdminPages';
import Dashboard from './Dashboard';
import Editor from './Editor';
import MyPosts from './MyPosts';
import ProfileSettings from './ProfileSettings';

export default function StudioApp() {
  const { isSignedIn, isLoading, me, meError, signIn } = useSession();
  const location = useLocation();
  usePageMeta('Studio');

  if (isLoading) return <div className="center-page"><Spinner label="Opening your studio" /></div>;

  if (!isSignedIn) {
    return (
      <div className="panel login-card">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-mark"><Cloud size={18} strokeWidth={2.2} /></span>
          {config().siteTitle}
        </div>
        <h1>Your writing studio</h1>
        <p style={{ color: 'var(--ink-2)' }}>Sign in or create a free account to start publishing.</p>
        <button className="btn btn-primary" onClick={() => void signIn(location.pathname)}>Sign in or sign up</button>
        <Link to="/" className="btn btn-ghost">Back to reading</Link>
      </div>
    );
  }

  if (meError || !me) {
    return <div className="center-page"><div className="alert alert-error">{(meError as Error)?.message ?? 'Could not load your profile'}</div></div>;
  }

  return <Shell />;
}

function Shell() {
  const { me, isAdmin, signOut } = useSession();
  const location = useLocation();
  const profile = me!.profile;
  const suspended = profile.status === 'suspended';

  const links = (
    <>
      <NavLink to="/studio" end><Grid size={17} /> Dashboard</NavLink>
      <NavLink to="/studio/posts" end><FileText size={17} /> My posts</NavLink>
      <NavLink to="/studio/new"><Plus size={17} /> New post</NavLink>
      <NavLink to="/studio/profile"><UserIcon size={17} /> Profile</NavLink>
      {isAdmin && (
        <>
          <div className="side-label"><Shield size={13} /> Admin</div>
          <NavLink to="/studio/admin" end><Grid size={17} /> Overview</NavLink>
          <NavLink to="/studio/admin/posts"><FileText size={17} /> All posts</NavLink>
          <NavLink to="/studio/admin/users"><Users size={17} /> Users</NavLink>
          <NavLink to="/studio/admin/comments"><Chat size={17} /> Comments</NavLink>
        </>
      )}
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
        <Link to={`/@${profile.handle}`}><External size={17} /> View my page</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="link" onClick={() => void signOut()}><LogOut size={17} /> Sign out</button>
          <ThemeToggle />
        </div>
        <div className="who">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size={28} />
          <span><strong>{profile.displayName}</strong><br />@{profile.handle}</span>
        </div>
      </aside>
      <div>
        <nav className="admin-mobile-nav">{links}<Link to="/">Site</Link></nav>
        <main className="admin-main">
          {suspended && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              Your account is suspended. Your posts are hidden and you can’t publish or comment.
            </div>
          )}
          {!profile.onboarded && !suspended && location.pathname !== '/studio/profile' && (
            <div className="welcome">
              <div>
                <strong>Welcome to {config().siteTitle}! 👋</strong>
                <p>Pick your public name and @handle before you publish. Readers will see them on your posts.</p>
              </div>
              <Link to="/studio/profile" className="btn btn-primary">Set up profile</Link>
            </div>
          )}
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="posts" element={<MyPosts />} />
            <Route path="new" element={<Editor key="new" />} />
            <Route path="posts/:postId" element={<Editor />} />
            <Route path="profile" element={<ProfileSettings />} />
            {isAdmin && (
              <>
                <Route path="admin" element={<AdminOverview />} />
                <Route path="admin/posts" element={<AdminPosts />} />
                <Route path="admin/users" element={<AdminUsers />} />
                <Route path="admin/comments" element={<AdminComments />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/studio" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
