import { describe, expect, it } from 'vitest';
import { commentInputSchema, type Post, postInputSchema } from '../src/lib/models.js';
import { isLive } from '../src/lib/posts.js';
import { renderPostPage, renderRss } from '../src/lib/render.js';

const site = { url: 'https://blog.example', title: 'CloudBlog', description: 'desc' };
const template = `<!doctype html><html><head><title>CloudBlog</title><meta name="description" content="default"><meta property="og:title" content="x"></head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`;

const post: Post = {
  postId: 'p1',
  slug: 'hello-world',
  title: 'Hello <World> & "friends"',
  excerpt: 'An excerpt',
  content: '# Body\n\n<script>alert(1)</script>',
  category: 'Tech',
  tags: ['aws'],
  author: 'Shubham',
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  readingMinutes: 1,
  featured: false,
};

describe('postInputSchema', () => {
  it('applies defaults and normalises tags', () => {
    const p = postInputSchema.parse({ title: 'T', content: 'c', author: 'a', tags: ['AWS Lambda', 'aws lambda', ''] });
    expect(p.status).toBe('draft');
    expect(p.category).toBe('General');
    expect(p.tags).toEqual(['aws-lambda']);
  });
  it('requires a date when scheduling', () => {
    expect(postInputSchema.safeParse({ title: 'T', content: 'c', author: 'a', status: 'scheduled' }).success).toBe(false);
  });
  it('rejects non-https cover images', () => {
    expect(postInputSchema.safeParse({ title: 'T', content: 'c', author: 'a', coverImage: 'javascript:x' }).success).toBe(false);
  });
});

describe('commentInputSchema', () => {
  it('trims and bounds input', () => {
    expect(commentInputSchema.safeParse({ author: '  ', content: 'hello' }).success).toBe(false);
    expect(commentInputSchema.safeParse({ author: 'a', content: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('isLive', () => {
  it('needs published status and a past date', () => {
    expect(isLive(post)).toBe(true);
    expect(isLive({ ...post, status: 'draft' })).toBe(false);
    expect(isLive({ ...post, publishedAt: '2999-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('renderPostPage', () => {
  const html = renderPostPage(template, post, site);
  it('sets an escaped title and replaces default SEO tags', () => {
    expect(html).toContain('<title>Hello &lt;World&gt; &amp; &quot;friends&quot; · CloudBlog</title>');
    expect(html).not.toContain('content="default"');
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://blog.example/posts/hello-world">');
  });
  it('prerenders sanitised article HTML into #root and keeps the app script', () => {
    expect(html).toContain('<div id="root"><article class="prerender">');
    expect(html).toContain('<h1>Body</h1>');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('/assets/index-abc.js');
  });
  it('JSON-LD cannot break out of its script tag', () => {
    const evil = renderPostPage(template, { ...post, title: '</script><script>alert(1)</script>' }, site);
    expect(evil).not.toContain('</script><script>alert(1)');
  });
});

describe('renderRss', () => {
  it('escapes XML', () => {
    expect(renderRss([post], site)).toContain('<title>Hello &lt;World&gt; &amp; &quot;friends&quot;</title>');
  });
});
