import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, publicApi } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useSession } from '../lib/session';
import { Trash } from './Icons';
import { Avatar, Spinner, useToast } from './ui';

export default function Comments({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { isSignedIn, me, api, signIn, isAdmin } = useSession();
  const { data, isPending } = useQuery({
    queryKey: ['comments', slug],
    queryFn: ({ signal }) => publicApi.comments(slug, signal),
  });
  const [content, setContent] = useState('');

  const add = useMutation({
    mutationFn: () => api!.comment(slug, content.trim()),
    onSuccess: () => {
      setContent('');
      void qc.invalidateQueries({ queryKey: ['comments', slug] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (commentKey: string) => api!.deleteComment(slug, commentKey),
    onSuccess: () => {
      toast('Comment deleted');
      void qc.invalidateQueries({ queryKey: ['comments', slug] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (content.trim().length >= 2) add.mutate();
  };

  const comments = data?.comments ?? [];
  const myId = me?.profile.userId;
  const ownsPost = !!myId && data?.postAuthorId === myId;
  const suspended = me?.profile.status === 'suspended';

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">{comments.length > 0 ? `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}` : 'Comments'}</h2>

      {isPending ? (
        <Spinner label="Loading comments" />
      ) : comments.length > 0 ? (
        <ol className="comment-list">
          {comments.map((c) => (
            <li key={c.commentId} className="comment">
              <Avatar name={c.author} src={c.authorAvatar} />
              <div>
                <header>
                  {c.authorHandle ? <Link to={`/@${c.authorHandle}`}><strong>{c.author}</strong></Link> : <strong>{c.author}</strong>}
                  <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
                  {(isAdmin || ownsPost || c.authorId === myId) && (
                    <button
                      className="btn btn-sm btn-ghost btn-danger"
                      style={{ marginLeft: 'auto', height: 26, padding: '0 8px' }}
                      aria-label="Delete comment"
                      onClick={() => confirm('Delete this comment?') && remove.mutate(c.commentKey)}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </header>
                {/* Rendered as text by React, so no HTML injection is possible. */}
                <p>{c.content}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ color: 'var(--ink-3)', marginBottom: 24 }}>No comments yet. Start the conversation.</p>
      )}

      {!isSignedIn ? (
        <div className="signin-prompt">
          <p>Sign in to join the conversation. It’s free and takes a minute.</p>
          <button className="btn btn-primary" onClick={() => void signIn()}>Sign in to comment</button>
        </div>
      ) : suspended ? (
        <div className="alert alert-error">Your account is suspended, so you can’t comment.</div>
      ) : (
        <form className="comment-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="c-body">Commenting as <strong>{me?.profile.displayName ?? '…'}</strong></label>
            <textarea id="c-body" className="textarea" value={content} onChange={(e) => setContent(e.target.value)} minLength={2} maxLength={2000} required placeholder="Share your thoughts…" />
          </div>
          <div className="row">
            <span className="hint">{content.length}/2000 · Be kind.</span>
            <button className="btn btn-primary" disabled={add.isPending || content.trim().length < 2}>
              {add.isPending ? <Spinner /> : 'Post comment'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
