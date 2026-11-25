import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/global.css';
import './styles/article.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { loadConfig } from './lib/config';
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
      { path: '*', Component: NotFound },
    ],
  },
  {
    // Editor, auth and admin screens load only when someone visits /admin.
    path: '/admin/*',
    lazy: async () => ({ Component: (await import('./admin/AdminApp')).default }),
    HydrateFallback: () => <div className="center-page"><Spinner label="Loading admin" /></div>,
  },
]);

const root = createRoot(document.getElementById('root')!);

loadConfig()
  .then(() => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
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
