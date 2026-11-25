import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { config } from '../lib/config';
import { useSession } from '../lib/session';
import { Cloud, Grid, LogOut, Pencil, Rss, UserIcon } from './Icons';
import { Avatar, ThemeToggle } from './ui';

function AccountMenu() {
  const { me, signOut, isAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  if (!me) return null;
  const p = me.profile;
  return (
    <div className="menu" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <Avatar name={p.displayName} src={p.avatarUrl} size={34} />
      </button>
      {open && (
        <div className="menu-pop" role="menu" onClick={() => setOpen(false)}>
          <div className="menu-head">
            <strong>{p.displayName}</strong>
            <span>@{p.handle}</span>
          </div>
          <Link to={`/@${p.handle}`} role="menuitem"><UserIcon size={16} /> Your profile</Link>
          <Link to="/studio" role="menuitem"><Grid size={16} /> Studio</Link>
          {isAdmin && <Link to="/studio/admin" role="menuitem"><Grid size={16} /> Admin</Link>}
          <button role="menuitem" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [scrolled, setScrolled] = useState(false);
  const { isSignedIn, isLoading, signIn } = useSession();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { siteTitle } = config();
  return (
    <>
      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="container">
          <Link to="/" className="brand" aria-label={`${siteTitle} home`}>
            <span className="brand-mark"><Cloud size={18} strokeWidth={2.2} /></span>
            {siteTitle}
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end className="hide-sm">Articles</NavLink>
            <a href="/rss.xml" aria-label="RSS feed" className="hide-sm"><Rss size={16} /></a>
            <ThemeToggle />
            {isLoading ? null : isSignedIn ? (
              <>
                <Link to="/studio/new" className="btn btn-sm btn-primary"><Pencil size={14} /> Write</Link>
                <AccountMenu />
              </>
            ) : (
              <>
                <button className="nav-link hide-sm" onClick={() => void signIn()}>Sign in</button>
                <button className="btn btn-sm btn-primary" onClick={() => void signIn('/studio/new')}>Start writing</button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>© {new Date().getFullYear()} {siteTitle}. Written by its community, served from the edge.</span>
          <nav aria-label="Footer">
            <a href="/rss.xml">RSS</a>
            <a href="/sitemap.xml">Sitemap</a>
            <Link to="/studio">Studio</Link>
          </nav>
        </div>
      </footer>
      <ScrollRestoration />
    </>
  );
}
