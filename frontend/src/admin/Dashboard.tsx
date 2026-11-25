import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus, Refresh } from '../components/Icons';
import { Spinner, useToast } from '../components/ui';
import { formatCount } from '../lib/format';
import { useAdminApi } from './useAdminApi';

export default function Dashboard() {
  const api = useAdminApi();
  const toast = useToast();
  const { data: stats, isPending, error } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.stats() });
  const rebuild = useMutation({
    mutationFn: () => api.rebuild(),
    onSuccess: () => toast('Rebuilding static pages, RSS and sitemap…'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <>
      <div className="admin-head">
        <h1>Dashboard</h1>
        <div className="actions">
          <button className="btn" onClick={() => rebuild.mutate()} disabled={rebuild.isPending} title="Re-render every static post page, RSS and sitemap">
            {rebuild.isPending ? <Spinner /> : <Refresh size={16} />} Rebuild site
          </button>
          <Link to="/admin/posts/new" className="btn btn-primary"><Plus size={16} /> New post</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{(error as Error).message}</div>}
      {isPending ? (
        <Spinner label="Loading stats" />
      ) : stats ? (
        <>
          <div className="stats">
            <div className="stat"><div className="label">Published</div><div className="value">{stats.posts.published}</div></div>
            <div className="stat"><div className="label">Drafts</div><div className="value">{stats.posts.draft}</div></div>
            <div className="stat"><div className="label">Scheduled</div><div className="value">{stats.posts.scheduled}</div></div>
            <div className="stat"><div className="label">Total views</div><div className="value">{formatCount(stats.totalViews)}</div></div>
            <Link to="/admin/comments" className={`stat ${stats.pendingComments ? 'attention' : ''}`}>
              <div className="label">Awaiting approval</div><div className="value">{stats.pendingComments}</div>
            </Link>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Most read</h2></div>
            <div className="panel-body">
              {stats.topPosts.length === 0 ? (
                <p className="hint" style={{ padding: '12px 0' }}>No views yet. Publish something and share it!</p>
              ) : (
                <ol className="top-list">
                  {stats.topPosts.map((p) => (
                    <li key={p.postId}>
                      <Link to={`/admin/posts/${p.postId}`}>{p.title}</Link>
                      <span className="hint">{formatCount(p.views)} views</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
