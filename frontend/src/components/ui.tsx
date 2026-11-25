import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { PostSummary } from '../lib/api';
import { config } from '../lib/config';
import { coverGradient, storage } from '../lib/format';
import { Monitor, Moon, Sun } from './Icons';

/* ---------- Cover image with generated fallback ---------- */
export function Cover({ post, eager = false, className = '' }: { post: Pick<PostSummary, 'title' | 'coverImage' | 'coverAlt' | 'postId'>; eager?: boolean; className?: string }) {
  return (
    <div className={`cover ${className}`}>
      {post.coverImage ? (
        <img src={post.coverImage} alt={post.coverAlt ?? ''} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      ) : (
        <div className="cover-placeholder" style={{ background: coverGradient(post.postId + post.title) }} aria-hidden="true">
          <span>{post.title.trim().charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  if (src) {
    return <img className="avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} loading="lazy" />;
  }
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return (
    <span className="avatar" style={{ background: coverGradient(name), width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="spinner" />
      {label ? <span>{label}</span> : <span className="visually-hidden">Loading</span>}
    </span>
  );
}

/* ---------- Page <title> + description ---------- */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    const site = config().siteTitle;
    document.title = title ? `${title} · ${site}` : `${site}: ${config().siteTagline}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
  }, [title, description]);
}

/* ---------- Theme ---------- */
type Theme = 'system' | 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (storage.get('theme') as Theme) || 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      storage.remove('theme');
    } else {
      root.setAttribute('data-theme', theme);
      storage.set('theme', theme);
    }
  }, [theme]);

  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button className="icon-btn" onClick={() => setTheme(next[theme])} aria-label={`Theme: ${theme}. Switch to ${next[theme]}`} title={`Theme: ${theme}`}>
      <Icon />
    </button>
  );
}

/* ---------- Toasts ---------- */
interface Toast { id: number; message: string; kind: 'info' | 'error' }
const ToastCtx = createContext<(message: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
