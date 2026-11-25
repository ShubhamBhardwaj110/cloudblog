import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Globe, Pencil } from '../components/Icons';
import { CardSkeleton, PostCard } from '../components/PostCard';
import { Avatar, usePageMeta } from '../components/ui';
import { ApiError, publicApi } from '../lib/api';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import NotFound from './NotFound';

/** Mounted at "/:profile" and only handles "/@handle"; anything else is a 404. */
export default function AuthorPage() {
  const { profile: segment = '' } = useParams();
  const handle = segment.startsWith('@') ? segment.slice(1).toLowerCase() : '';
  const { me } = useSession();
  const { data, error, isPending } = useQuery({
    queryKey: ['author', handle],
    queryFn: ({ signal }) => publicApi.author(handle, signal),
    enabled: !!handle,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  usePageMeta(data ? `${data.profile.displayName} (@${data.profile.handle})` : undefined, data?.profile.bio || undefined);

  if (!handle || (error instanceof ApiError && error.status === 404)) return <NotFound />;
  if (error) return <div className="container center-page"><p>{(error as Error).message}</p></div>;

  const isMe = me?.profile.handle === handle;
  return (
    <div className="container">
      {isPending || !data ? (
        <div className="author-hero" aria-busy="true">
          <div className="skeleton" style={{ width: 112, height: 112, borderRadius: '50%' }} />
          <div><div className="skeleton" style={{ height: 40, width: 280 }} /><div className="skeleton" style={{ height: 16, width: 160, marginTop: 12 }} /></div>
        </div>
      ) : (
        <header className="author-hero">
          <Avatar name={data.profile.displayName} src={data.profile.avatarUrl} size={112} />
          <div>
            <h1>{data.profile.displayName}</h1>
            <div className="handle">@{data.profile.handle} · Writing since {formatDate(data.profile.createdAt)}</div>
            {data.profile.bio && <p className="bio">{data.profile.bio}</p>}
            <div className="links">
              {data.profile.website && (
                <a href={data.profile.website} target="_blank" rel="noopener noreferrer nofollow"><Globe size={15} /> {data.profile.website.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
              )}
              <span>{data.posts.length} {data.posts.length === 1 ? 'article' : 'articles'}</span>
              {isMe && <Link to="/studio/profile" className="btn btn-sm"><Pencil size={14} /> Edit profile</Link>}
            </div>
          </div>
        </header>
      )}

      {isPending ? (
        <div className="grid">{Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}</div>
      ) : data && data.posts.length === 0 ? (
        <div className="empty">
          <h2>No articles yet</h2>
          <p>{isMe ? 'Your published posts will show up here.' : 'Check back soon.'}</p>
          {isMe && <Link to="/studio/new" className="btn btn-primary" style={{ marginTop: 16 }}>Write your first post</Link>}
        </div>
      ) : (
        <div className="grid">{data?.posts.map((p) => <PostCard key={p.postId} post={p} showAuthor={false} />)}</div>
      )}
    </div>
  );
}
