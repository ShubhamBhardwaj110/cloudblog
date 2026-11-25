import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import Comments from '../components/Comments';
import { LinkIcon, LinkedIn, Pencil, XLogo } from '../components/Icons';
import ReportButton from '../components/ReportDialog';
import { PostCard } from '../components/PostCard';
import { Avatar, Cover, usePageMeta, useToast } from '../components/ui';
import { ApiError, publicApi } from '../lib/api';
import { formatCount, formatDate } from '../lib/format';
import { type Heading, renderMarkdown } from '../lib/markdown';
import { useSession } from '../lib/session';
import { postsQuery } from './Home';
import NotFound from './NotFound';

function useReadingProgress(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [ref]);
}

function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [headings]);

  if (headings.length < 2) return <aside className="toc" />;
  return (
    <aside className="toc" aria-label="Table of contents">
      <h4>On this page</h4>
      <ol>
        {headings.map((h) => (
          <li key={h.id} className={`depth-${h.depth}`}>
            <a href={`#${h.id}`} className={active === h.id ? 'active' : ''}>{h.text}</a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Share({ title, slug }: { title: string; slug: string }) {
  const toast = useToast();
  const url = window.location.href.split('#')[0]!;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard');
    } catch {
      toast('Couldn’t copy the link', 'error');
    }
  };
  const e = encodeURIComponent;
  return (
    <div className="share">
      <span>Share this article</span>
      <button className="icon-btn" onClick={copy} aria-label="Copy link"><LinkIcon /></button>
      <a className="icon-btn" href={`https://x.com/intent/post?text=${e(title)}&url=${e(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X"><XLogo /></a>
      <a className="icon-btn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn"><LinkedIn /></a>
      <ReportButton slug={slug} />
    </div>
  );
}

export default function PostPage() {
  const { slug = '' } = useParams();
  const progress = useRef<HTMLDivElement>(null);
  const { data: post, error, isPending } = useQuery({
    queryKey: ['post', slug],
    queryFn: ({ signal }) => publicApi.post(slug, signal),
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
  const { data: all } = useQuery(postsQuery);
  const [views, setViews] = useState<number>();
  const { me, isAdmin } = useSession();
  useReadingProgress(progress);
  usePageMeta(post?.title, post?.excerpt);

  // Count one view per post per browser session.
  useEffect(() => {
    if (!post) return;
    const key = `viewed:${post.slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* storage unavailable: still count */ }
    publicApi.view(post.slug).then((r) => setViews(r.views)).catch(() => {});
  }, [post]);

  const rendered = useMemo(() => (post ? renderMarkdown(post.content) : undefined), [post]);

  const related = useMemo(() => {
    if (!post || !all) return [];
    return all
      .filter((p) => p.postId !== post.postId)
      .map((p) => ({ p, score: (p.category === post.category ? 2 : 0) + p.tags.filter((t) => post.tags.includes(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.p);
  }, [post, all]);

  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error) return <div className="center-page"><p>Couldn’t load this article. {(error as Error).message}</p></div>;
  if (isPending || !post || !rendered) {
    return (
      <div className="container" aria-busy="true">
        <div className="article-header">
          <div className="skeleton" style={{ height: 14, width: 120, margin: '0 auto' }} />
          <div className="skeleton" style={{ height: 52, width: '90%', margin: '20px auto' }} />
          <div className="skeleton" style={{ height: 20, width: '60%', margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  const shownViews = views ?? post.views;
  return (
    <>
      <div className="progress" ref={progress} aria-hidden="true" />
      <article className="container">
        <header className="article-header">
          <Link to={`/?category=${encodeURIComponent(post.category)}`} className="kicker">{post.category}</Link>
          <h1>{post.title}</h1>
          {post.excerpt && <p className="dek">{post.excerpt}</p>}
          <div className="byline">
            <Link to={`/@${post.authorHandle}`}><Avatar name={post.author} src={post.authorAvatar} /></Link>
            <div>
              <Link to={`/@${post.authorHandle}`}><strong>{post.author}</strong></Link>
              <div className="meta">
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                <span className="dot" />
                <span>{post.readingMinutes} min read</span>
                {shownViews > 0 && (<><span className="dot" /><span>{formatCount(shownViews)} views</span></>)}
              </div>
            </div>
            {(isAdmin || me?.profile.userId === post.authorId) && (
              <Link to={`/studio/posts/${post.postId}`} className="btn btn-sm" style={{ marginLeft: 8 }}><Pencil size={14} /> Edit</Link>
            )}
          </div>
        </header>

        {post.coverImage && (
          <figure className="article-cover">
            <Cover post={post} eager />
            {post.coverAlt && <figcaption>{post.coverAlt}</figcaption>}
          </figure>
        )}

        <div className="article-layout">
          <div />
          <div className="prose" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          <Toc headings={rendered.headings} />
        </div>

        <div className="article-end">
          {post.tags.length > 0 && (
            <div className="tags-row">
              {post.tags.map((t) => <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="chip">#{t}</Link>)}
            </div>
          )}
          <Share title={post.title} slug={post.slug} />
          <Comments slug={post.slug} />
        </div>
      </article>

      {related.length > 0 && (
        <section className="related container">
          <h2>Keep reading</h2>
          <div className="grid">{related.map((p) => <PostCard key={p.postId} post={p} />)}</div>
        </section>
      )}
    </>
  );
}
