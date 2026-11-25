import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ApiError, publicApi } from '../lib/api';
import { storage, timeAgo } from '../lib/format';
import { Avatar, Spinner } from './ui';

export default function Comments({ slug }: { slug: string }) {
  const { data: comments, isPending } = useQuery({
    queryKey: ['comments', slug],
    queryFn: ({ signal }) => publicApi.comments(slug, signal),
  });
  const [author, setAuthor] = useState(() => storage.get('commenter') ?? '');
  const [content, setContent] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [sent, setSent] = useState(false);

  const submit = useMutation({
    mutationFn: () => publicApi.addComment(slug, { author: author.trim(), content: content.trim(), website }),
    onSuccess: () => {
      storage.set('commenter', author.trim());
      setContent('');
      setSent(true);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSent(false);
    submit.mutate();
  };

  const err = submit.error as ApiError | null;
  const count = comments?.length ?? 0;

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">{count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : 'Comments'}</h2>

      {isPending ? (
        <Spinner label="Loading comments" />
      ) : count > 0 ? (
        <ol className="comment-list">
          {comments!.map((c) => (
            <li key={c.commentId} className="comment">
              <Avatar name={c.author} />
              <div>
                <header>
                  <strong>{c.author}</strong>
                  <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
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

      <form className="comment-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input id="c-name" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60} required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="c-body">Comment</label>
          <textarea id="c-body" className="textarea" value={content} onChange={(e) => setContent(e.target.value)} minLength={2} maxLength={2000} required />
        </div>
        {/* Bots fill every field; people never see this one. */}
        <div className="visually-hidden" aria-hidden="true">
          <label htmlFor="c-website">Website</label>
          <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {err && <div className="alert alert-error">{err.details?.[0]?.message ?? err.message}</div>}
        {sent && <div className="alert alert-success">Thanks! Your comment will appear once it’s approved.</div>}
        <div className="row">
          <span className="hint">Comments are moderated. Be kind.</span>
          <button className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? <Spinner /> : 'Post comment'}
          </button>
        </div>
      </form>
    </section>
  );
}
