import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CardSkeleton, FeaturedPost, PostCard } from '../components/PostCard';
import { Search } from '../components/Icons';
import { usePageMeta } from '../components/ui';
import { publicApi } from '../lib/api';
import { config } from '../lib/config';

export const postsQuery = { queryKey: ['posts'], queryFn: ({ signal }: { signal: AbortSignal }) => publicApi.posts(signal) };

export default function Home() {
  const { data: posts, isPending, error, refetch } = useQuery(postsQuery);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category');
  const tag = params.get('tag');
  const query = useDeferredValue(q.trim().toLowerCase());
  const { siteTagline } = config();
  usePageMeta(undefined, siteTagline);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'q' });
  };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts ?? []) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [posts]);

  const filtered = useMemo(
    () =>
      (posts ?? []).filter(
        (p) =>
          (!category || p.category === category) &&
          (!tag || p.tags.includes(tag)) &&
          (!query || `${p.title} ${p.excerpt} ${p.tags.join(' ')} ${p.category}`.toLowerCase().includes(query)),
      ),
    [posts, category, tag, query],
  );

  const isFiltering = !!(category || tag || query);
  const featured = !isFiltering ? (filtered.find((p) => p.featured) ?? filtered[0]) : undefined;
  const rest = featured ? filtered.filter((p) => p !== featured) : filtered;

  return (
    <div className="container">
      <section className="hero">
        <h1>
          Notes from the <em>cloud</em>, written by hand.
        </h1>
        <p>{siteTagline}</p>
      </section>

      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <span className="visually-hidden">Search articles</span>
          <input
            className="input"
            type="search"
            placeholder="Search articles…"
            value={q}
            onChange={(e) => set('q', e.target.value || null)}
          />
        </label>
        {categories.length > 1 && (
          <div className="chips" role="group" aria-label="Filter by category">
            <button className="chip" aria-pressed={!category} onClick={() => set('category', null)}>All</button>
            {categories.map((c) => (
              <button key={c} className="chip" aria-pressed={category === c} onClick={() => set('category', category === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {tag && (
        <div className="filter-note">
          Showing posts tagged <strong>#{tag}</strong>
          <button className="btn btn-sm btn-ghost" onClick={() => set('tag', null)}>Clear</button>
        </div>
      )}

      {error ? (
        <div className="empty">
          <h2>Couldn’t load articles</h2>
          <p>{(error as Error).message}</p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => refetch()}>Try again</button>
        </div>
      ) : isPending ? (
        <div className="grid">{Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <h2>{isFiltering ? 'Nothing matches that' : 'No articles yet'}</h2>
          <p>{isFiltering ? 'Try a different search or category.' : 'The first story is on its way.'}</p>
        </div>
      ) : (
        <>
          {featured && <FeaturedPost post={featured} />}
          <div className="grid">
            {rest.map((p) => <PostCard key={p.postId} post={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
