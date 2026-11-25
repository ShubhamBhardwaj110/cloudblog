import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { config } from '../lib/config';
import { Cloud, Rss } from './Icons';
import { ThemeToggle } from './ui';

export default function Layout() {
  const [scrolled, setScrolled] = useState(false);
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
            <NavLink to="/" end>Articles</NavLink>
            <a href="/rss.xml" aria-label="RSS feed"><Rss size={16} /><span className="nav-label">RSS</span></a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>© {new Date().getFullYear()} {siteTitle}. Served from the edge on AWS.</span>
          <nav aria-label="Footer">
            <a href="/rss.xml">RSS</a>
            <a href="/sitemap.xml">Sitemap</a>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>
      </footer>
      <ScrollRestoration />
    </>
  );
}
