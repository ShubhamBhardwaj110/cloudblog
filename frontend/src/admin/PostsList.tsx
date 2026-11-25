import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { External, Pencil, Plus, Trash } from '../components/Icons';
import { Spinner, useToast } from '../components/ui';
import type { PostStatus, PostSummary } from '../lib/api';
import { formatCount, formatDateTime, timeAgo } from '../lib/format';
import { useAdminApi, useInvalidate } from './useAdminApi';

type Filter = 'all' | PostStatus;

export function StatusPill({ post }: { post: Pick<PostSummary, 'status' | 'publishedAt'> }) {
  const label = post.status === 'scheduled' ? `Scheduled · ${formatDateTime(post.publishedAt)}` : post.status[0]!.toUpperCase() + post.status.slice(1);
  return <span className={`pill pill-${post.status}`}>{label}</span>;
}

export default function PostsList() {
  const api = useAdminApi();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: posts, isPending, error } = useQuery({ queryKey: ['admin', 'posts'], queryFn: () => api.posts() });

  const remove = useMutation({
    mutationFn: (p: PostSummary) => api.remove(p.postId),
    onSuccess: (_d, p) => { toast(`Deleted “${p.title}”`); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const shown = (posts ?? []).filter((p) => filter === 'all' || p.status === filter);
  const count = (s: Filter) => (posts ?? []).filter((p) => s === 'all' || p.status === s).length;

  return (
    <>
      <div className="admin-head">
        <h1>Posts</h1>
        <Link to="/admin/posts/new" className="btn btn-primary"><Plus size={16} /> New post</Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="tabs" role="tablist">
            {(['all', 'published', 'draft', 'scheduled'] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {f[0]!.toUpperCase() + f.slice(1)} {posts && <span className="hint">{count(f)}</span>}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ margin: 16 }}>{(error as Error).message}</div>}
        {isPending ? (
          <div style={{ padding: 24 }}><Spinner label="Loading posts" /></div>
        ) : shown.length === 0 ? (
          <p className="hint" style={{ padding: 24 }}>Nothing here yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Title</th><th>Status</th><th>Updated</th><th className="num">Views</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.postId}>
                    <td className="title-cell">
                      <Link to={`/admin/posts/${p.postId}`}>{p.title}</Link>
                      <small>{p.category} · /posts/{p.slug}</small>
                    </td>
                    <td><StatusPill post={p} /></td>
                    <td title={formatDateTime(p.updatedAt)}>{timeAgo(p.updatedAt)}</td>
                    <td className="num">{formatCount(p.views ?? 0)}</td>
                    <td>
                      <div className="row-actions">
                        {p.status === 'published' && (
                          <a className="btn btn-sm btn-ghost" href={`/posts/${p.slug}`} target="_blank" rel="noopener" aria-label="View live"><External size={15} /></a>
                        )}
                        <Link className="btn btn-sm btn-ghost" to={`/admin/posts/${p.postId}`} aria-label="Edit"><Pencil size={15} /></Link>
                        <button
                          className="btn btn-sm btn-ghost btn-danger"
                          aria-label="Delete"
                          disabled={remove.isPending}
                          onClick={() => confirm(`Delete “${p.title}” and all its comments? This can’t be undone.`) && remove.mutate(p)}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
