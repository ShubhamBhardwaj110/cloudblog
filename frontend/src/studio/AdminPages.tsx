import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { External, EyeOff, Pencil, Refresh, Search, Trash } from '../components/Icons';
import { Avatar, Spinner, useToast } from '../components/ui';
import { type AdminComment, type AdminUser, errorMessage, type PostStatus, type PostSummary } from '../lib/api';
import { formatCount, formatDate, formatDateTime, timeAgo } from '../lib/format';
import { useSession } from '../lib/session';
import { useInvalidate } from './hooks';
import { StatusPill, StatusTabs } from './MyPosts';

/* ---------------- Overview ---------------- */
export function AdminOverview() {
  const { admin } = useSession();
  const toast = useToast();
  const { data: s, isPending, error } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => admin!.stats() });
  const rebuild = useMutation({
    mutationFn: () => admin!.rebuild(),
    onSuccess: () => toast('Rebuilding static pages, RSS and sitemap…'),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <>
      <div className="admin-head">
        <h1>Site overview</h1>
        <button className="btn" onClick={() => rebuild.mutate()} disabled={rebuild.isPending} title="Re-render every static post page, RSS and sitemap">
          {rebuild.isPending ? <Spinner /> : <Refresh size={16} />} Rebuild site
        </button>
      </div>
      {error && <div className="alert alert-error">{(error as Error).message}</div>}
      {isPending ? <Spinner label="Loading" /> : s && (
        <>
          <div className="stats">
            <Link to="/studio/admin/users" className="stat"><div className="label">Writers</div><div className="value">{s.users}</div></Link>
            <div className="stat"><div className="label">New this week</div><div className="value">{s.newUsersThisWeek}</div></div>
            <Link to="/studio/admin/posts" className="stat"><div className="label">Published posts</div><div className="value">{s.posts.published}</div></Link>
            <div className="stat"><div className="label">Total views</div><div className="value">{formatCount(s.totalViews)}</div></div>
            <div className={`stat ${s.suspendedUsers ? 'attention' : ''}`}><div className="label">Suspended</div><div className="value">{s.suspendedUsers}</div></div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Most read across the site</h2></div>
            <div className="panel-body">
              {s.topPosts.length === 0 ? <p className="hint" style={{ padding: '12px 0' }}>No views yet.</p> : (
                <ol className="top-list">
                  {s.topPosts.map((p) => (
                    <li key={p.postId}>
                      <span><Link to={`/posts/${p.slug}`}>{p.title}</Link> <span className="hint">by {p.author}</span></span>
                      <span className="hint">{formatCount(p.views)} views</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- All posts ---------------- */
export function AdminPosts() {
  const { admin } = useSession();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [filter, setFilter] = useState<'all' | PostStatus>('published');
  const [q, setQ] = useState('');
  const { data: posts, isPending, error } = useQuery({ queryKey: ['admin', 'posts'], queryFn: () => admin!.posts() });

  const unpublish = useMutation({
    mutationFn: (p: PostSummary) => admin!.unpublish(p.postId),
    onSuccess: (_d, p) => { toast(`“${p.title}” is now a draft and hidden from the site`); invalidate(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (p: PostSummary) => admin!.remove(p.postId),
    onSuccess: (_d, p) => { toast(`Deleted “${p.title}”`); invalidate(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const needle = q.trim().toLowerCase();
  const shown = (posts ?? []).filter(
    (p) => (filter === 'all' || p.status === filter) && (!needle || `${p.title} ${p.author} ${p.authorHandle}`.toLowerCase().includes(needle)),
  );

  return (
    <>
      <div className="admin-head"><h1>All posts</h1></div>
      <div className="panel">
        <div className="panel-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <StatusTabs posts={posts} filter={filter} setFilter={setFilter} />
          <label className="search" style={{ maxWidth: 280 }}>
            <Search size={16} />
            <input className="input" placeholder="Search title or author" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error && <div className="alert alert-error" style={{ margin: 16 }}>{(error as Error).message}</div>}
        {isPending ? <div style={{ padding: 24 }}><Spinner label="Loading posts" /></div> : shown.length === 0 ? <p className="hint" style={{ padding: 24 }}>No posts match.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Updated</th><th className="num">Views</th><th /></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.postId}>
                    <td className="title-cell"><Link to={`/studio/posts/${p.postId}`}>{p.title}</Link><small>/posts/{p.slug}</small></td>
                    <td><Link to={`/@${p.authorHandle}`} className="card-author"><Avatar name={p.author} src={p.authorAvatar} size={22} />{p.author}</Link></td>
                    <td><StatusPill post={p} /></td>
                    <td title={formatDateTime(p.updatedAt)}>{timeAgo(p.updatedAt)}</td>
                    <td className="num">{formatCount(p.views ?? 0)}</td>
                    <td>
                      <div className="row-actions">
                        {p.status === 'published' && <a className="btn btn-sm btn-ghost" href={`/posts/${p.slug}`} target="_blank" rel="noopener" aria-label="View"><External size={15} /></a>}
                        <Link className="btn btn-sm btn-ghost" to={`/studio/posts/${p.postId}`} aria-label="Edit"><Pencil size={15} /></Link>
                        {p.status !== 'draft' && (
                          <button className="btn btn-sm btn-ghost" title="Unpublish (hide from the site)" aria-label="Unpublish" disabled={unpublish.isPending}
                            onClick={() => confirm(`Unpublish “${p.title}”? It becomes a draft that only its author can see.`) && unpublish.mutate(p)}>
                            <EyeOff size={15} />
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost btn-danger" aria-label="Delete" disabled={remove.isPending}
                          onClick={() => confirm(`Permanently delete “${p.title}” by ${p.author}?`) && remove.mutate(p)}>
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

/* ---------------- Users ---------------- */
export function AdminUsers() {
  const { admin, me } = useSession();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [q, setQ] = useState('');
  const { data: users, isPending, error } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => admin!.users() });

  const suspend = useMutation({
    mutationFn: (u: AdminUser) => admin!.suspend(u.userId),
    onSuccess: (r, u) => { toast(`@${u.handle} suspended; ${r.unpublished} post(s) taken offline`); invalidate(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const unsuspend = useMutation({
    mutationFn: (u: AdminUser) => admin!.unsuspend(u.userId),
    onSuccess: (_r, u) => { toast(`@${u.handle} can sign in again (their posts stay as drafts until they republish)`); invalidate(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (users ?? []).filter((u) => !n || `${u.displayName} ${u.handle}`.toLowerCase().includes(n));
  }, [users, q]);

  return (
    <>
      <div className="admin-head"><h1>Users</h1></div>
      <div className="panel">
        <div className="panel-head">
          <span className="hint">{users ? `${users.length} accounts` : ''}</span>
          <label className="search" style={{ maxWidth: 280 }}>
            <Search size={16} />
            <input className="input" placeholder="Search name or handle" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error && <div className="alert alert-error" style={{ margin: 16 }}>{(error as Error).message}</div>}
        {isPending ? <div style={{ padding: 24 }}><Spinner label="Loading users" /></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Writer</th><th>Joined</th><th className="num">Posts</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <Link to={`/@${u.handle}`} className="card-author" style={{ fontSize: '0.92rem' }}>
                        <Avatar name={u.displayName} src={u.avatarUrl} size={30} />
                        <span><strong>{u.displayName}</strong><br /><span className="hint">@{u.handle}</span></span>
                      </Link>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td className="num">{u.postCount}</td>
                    <td>{u.status === 'suspended' ? <span className="pill pill-pending">Suspended</span> : <span className="pill pill-published">Active</span>}</td>
                    <td>
                      <div className="row-actions">
                        {u.userId === me?.profile.userId ? <span className="hint">You</span> : u.status === 'active' ? (
                          <button className="btn btn-sm btn-danger" disabled={suspend.isPending}
                            onClick={() => confirm(`Suspend @${u.handle}? They'll be signed out, blocked from signing in, and all their posts will be hidden.`) && suspend.mutate(u)}>
                            Suspend
                          </button>
                        ) : (
                          <button className="btn btn-sm" disabled={unsuspend.isPending} onClick={() => unsuspend.mutate(u)}>Restore</button>
                        )}
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

/* ---------------- Comments ---------------- */
export function AdminComments() {
  const { api, admin } = useSession();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: comments, isPending, error } = useQuery({ queryKey: ['admin', 'comments'], queryFn: () => admin!.comments() });
  const remove = useMutation({
    mutationFn: (c: AdminComment) => api!.deleteComment(c.postSlug, c.commentKey),
    onSuccess: () => { toast('Comment deleted'); invalidate(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <>
      <div className="admin-head"><h1>Recent comments</h1></div>
      <div className="panel">
        {error && <div className="alert alert-error" style={{ margin: 16 }}>{(error as Error).message}</div>}
        {isPending ? <div style={{ padding: 24 }}><Spinner label="Loading comments" /></div> : !comments?.length ? <p className="hint" style={{ padding: 24 }}>No comments yet.</p> : (
          comments.map((c) => (
            <article key={c.commentKey} className="mod-card">
              <header>
                <Avatar name={c.author} src={c.authorAvatar} size={28} />
                {c.authorHandle ? <Link to={`/@${c.authorHandle}`}><strong>{c.author}</strong></Link> : <strong>{c.author}</strong>}
                <span title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                <span>on <Link to={`/posts/${c.postSlug}`} style={{ color: 'var(--accent)' }}>{c.postTitle}</Link></span>
              </header>
              <p>{c.content}</p>
              <div className="actions">
                <button className="btn btn-sm btn-danger" disabled={remove.isPending} onClick={() => confirm('Delete this comment permanently?') && remove.mutate(c)}>
                  <Trash size={15} /> Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </>
  );
}
