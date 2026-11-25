import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, External, Trash } from '../components/Icons';
import { Avatar, Spinner, useToast } from '../components/ui';
import type { AdminComment } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { useAdminApi, useInvalidate } from './useAdminApi';

export default function Moderation() {
  const api = useAdminApi();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');
  const { data: comments, isPending, error } = useQuery({
    queryKey: ['admin', 'comments', status],
    queryFn: () => api.comments(status),
  });

  const moderate = useMutation({
    mutationFn: ({ c, to }: { c: AdminComment; to: 'approved' | 'pending' }) => api.moderate(c, to),
    onSuccess: (_d, { to }) => { toast(to === 'approved' ? 'Comment approved and now public' : 'Comment hidden'); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({
    mutationFn: (c: AdminComment) => api.removeComment(c),
    onSuccess: () => { toast('Comment deleted'); invalidate(); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <>
      <div className="admin-head">
        <h1>Comments</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={status === 'pending'} onClick={() => setStatus('pending')}>Awaiting approval</button>
          <button role="tab" aria-selected={status === 'approved'} onClick={() => setStatus('approved')}>Approved</button>
        </div>
      </div>

      <div className="panel">
        {error && <div className="alert alert-error" style={{ margin: 16 }}>{(error as Error).message}</div>}
        {isPending ? (
          <div style={{ padding: 24 }}><Spinner label="Loading comments" /></div>
        ) : !comments?.length ? (
          <p className="hint" style={{ padding: 24 }}>{status === 'pending' ? 'All caught up: nothing waiting for review. 🎉' : 'No approved comments yet.'}</p>
        ) : (
          comments.map((c) => (
            <article key={c.commentKey} className="mod-card">
              <header>
                <Avatar name={c.author} size={28} />
                <strong>{c.author}</strong>
                <span title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                <span>on <a href={`/posts/${c.postSlug}`} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>{c.postTitle} <External size={12} style={{ display: 'inline' }} /></a></span>
              </header>
              <p>{c.content}</p>
              <div className="actions">
                {status === 'pending' ? (
                  <button className="btn btn-sm btn-primary" onClick={() => moderate.mutate({ c, to: 'approved' })} disabled={moderate.isPending}>
                    <Check size={15} /> Approve
                  </button>
                ) : (
                  <button className="btn btn-sm" onClick={() => moderate.mutate({ c, to: 'pending' })} disabled={moderate.isPending}>Unpublish</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => confirm('Delete this comment permanently?') && remove.mutate(c)} disabled={remove.isPending}>
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
