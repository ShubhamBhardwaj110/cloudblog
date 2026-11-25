import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/global.css';
import './styles/article.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { loadConfig } from './lib/config';
import { SessionProvider } from './lib/session';
import AuthCallback from './pages/AuthCallback';
import AuthorPage from './pages/AuthorPage';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import PostPage from './pages/PostPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'posts/:slug', Component: PostPage },
      { path: 'auth/callback', Component: AuthCallback },
      { path: ':profile', Component: AuthorPage }, // "/@handle"
      { path: '*', Component: NotFound },
    ],
  },
  {
    // The editor and dashboards load only when someone opens the studio.
    path: '/studio/*',
    lazy: async () => ({ Component: (await import('./studio/StudioApp')).default }),
    HydrateFallback: () => <div className="center-page"><Spinner label="Loading studio" /></div>,
  },
  { path: '/admin/*', element: <Navigate to="/studio/admin" replace /> },
]);

const root = createRoot(document.getElementById('root')!);

loadConfig()
  .then(() => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </SessionProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
  })
  .catch((err: Error) => {
    root.render(
      <div className="center-page">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)' }}>Configuration missing</h1>
          <p style={{ color: 'var(--ink-2)' }}>{err.message}</p>
        </div>
      </div>,
    );
  });
