import { Link } from 'react-router';
import type { PostSummary } from '../lib/api';
import { formatDate } from '../lib/format';
import { Avatar, Cover } from './ui';

export function PostMeta({ post, showAuthor = true }: { post: PostSummary; showAuthor?: boolean }) {
  return (
    <div className="meta">
      {showAuthor && (
        <>
          <span className="card-author"><Avatar name={post.author} src={post.authorAvatar} size={22} />{post.author}</span>
          <span className="dot" />
        </>
      )}
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
      <span className="dot" />
      <span>{post.readingMinutes} min read</span>
    </div>
  );
}

export function PostCard({ post, showAuthor = true }: { post: PostSummary; showAuthor?: boolean }) {
  return (
    <Link to={`/posts/${post.slug}`} className="card">
      <Cover post={post} />
      <div className="kicker">{post.category}</div>
      <h3>{post.title}</h3>
      <p>{post.excerpt}</p>
      <PostMeta post={post} showAuthor={showAuthor} />
    </Link>
  );
}

export function FeaturedPost({ post }: { post: PostSummary }) {
  return (
    <Link to={`/posts/${post.slug}`} className="featured">
      <Cover post={post} eager />
      <div>
        <div className="kicker">{post.featured ? 'Featured' : 'Latest'} · {post.category}</div>
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
        <div style={{ marginTop: 18 }}>
          <PostMeta post={post} />
        </div>
      </div>
    </Link>
  );
}

export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '16 / 10', borderRadius: 14 }} />
      <div className="skeleton" style={{ height: 12, width: '30%' }} />
      <div className="skeleton" style={{ height: 24, width: '85%' }} />
      <div className="skeleton" style={{ height: 14, width: '100%' }} />
      <div className="skeleton" style={{ height: 14, width: '70%' }} />
    </div>
  );
}
