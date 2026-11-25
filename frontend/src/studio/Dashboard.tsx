import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus } from '../components/Icons';
import { Spinner } from '../components/ui';
import { formatCount } from '../lib/format';
import { useSession } from '../lib/session';

export default function Dashboard() {
  const { api, me } = useSession();
  const { data: stats, isPending, error } = useQuery({ queryKey: ['studio', 'stats'], queryFn: () => api!.stats() });

  return (
    <>
      <div className="admin-head">
        <h1>Hi, {me?.profile.displayName.split(' ')[0]}</h1>
        <Link to="/studio/new" className="btn btn-primary"><Plus size={16} /> New post</Link>
      </div>

      {error && <div className="alert alert-error">{(error as Error).message}</div>}
      {isPending ? (
        <Spinner label="Loading your stats" />
      ) : stats ? (
        <>
          <div className="stats">
            <div className="stat"><div className="label">Published</div><div className="value">{stats.posts.published}</div></div>
            <div className="stat"><div className="label">Drafts</div><div className="value">{stats.posts.draft}</div></div>
            <div className="stat"><div className="label">Scheduled</div><div className="value">{stats.posts.scheduled}</div></div>
            <div className="stat"><div className="label">Total views</div><div className="value">{formatCount(stats.totalViews)}</div></div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Your most read</h2></div>
            <div className="panel-body">
              {stats.totalPosts === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <p className="hint" style={{ marginBottom: 14 }}>You haven’t written anything yet. Your first story is one click away.</p>
                  <Link to="/studio/new" className="btn btn-primary"><Plus size={16} /> Write your first post</Link>
                </div>
              ) : stats.topPosts.length === 0 ? (
                <p className="hint" style={{ padding: '12px 0' }}>Publish a post to start collecting views.</p>
              ) : (
                <ol className="top-list">
                  {stats.topPosts.map((p) => (
                    <li key={p.postId}>
                      <Link to={`/posts/${p.slug}`}>{p.title}</Link>
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
