import type { Post, PostSummary } from './models.js';
import { escapeHtml, renderMarkdown } from './text.js';

export interface SiteInfo {
  url: string;
  title: string;
  description: string;
}

const SEO_META = /<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi;
const ROOT_DIV = /<div id="root"><\/div>/;

const postUrl = (site: SiteInfo, slug: string) => `${site.url}/posts/${slug}`;

/** JSON that is safe inside <script>: no "</script>" or HTML comment breakouts. */
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/**
 * Turn the SPA's index.html into a crawlable page for one post:
 * real <title>, OpenGraph/Twitter cards, JSON-LD, and the article HTML
 * inside #root (React replaces it on load, so humans get the full app).
 */
export function renderPostPage(template: string, post: Post, site: SiteInfo): string {
  if (!ROOT_DIV.test(template)) throw new Error('Template is missing <div id="root"></div>');
  const url = postUrl(site, post.slug);
  const title = `${post.title} · ${site.title}`;
  const image = post.coverImage;

  const head = [
    `<meta name="description" content="${escapeHtml(post.excerpt)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapeHtml(site.title)}">`,
    `<meta property="og:title" content="${escapeHtml(post.title)}">`,
    `<meta property="og:description" content="${escapeHtml(post.excerpt)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    post.publishedAt ? `<meta property="article:published_time" content="${post.publishedAt}">` : '',
    `<meta property="article:section" content="${escapeHtml(post.category)}">`,
    ...post.tags.map((t) => `<meta property="article:tag" content="${escapeHtml(t)}">`),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(post.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(post.excerpt)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
    `<script type="application/ld+json">${safeJson({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: image ? [image] : undefined,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: { '@type': 'Person', name: post.author, url: `${site.url}/@${post.authorHandle}` },
      mainEntityOfPage: url,
      keywords: post.tags.join(', '),
    })}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');

  const article = `<article class="prerender">
      <p>${escapeHtml(post.category)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p>By <a href="/@${escapeHtml(post.authorHandle)}">${escapeHtml(post.author)}</a>${post.publishedAt ? ` · <time datetime="${post.publishedAt}">${post.publishedAt.slice(0, 10)}</time>` : ''}</p>
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.coverAlt ?? '')}">` : ''}
      ${renderMarkdown(post.content)}
    </article>`;

  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(SEO_META, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace(ROOT_DIV, `<div id="root">${article}</div>`);
}

const xml = (s: string) => escapeHtml(s);

export function renderSitemap(posts: PostSummary[], site: SiteInfo): string {
  const urls = [
    `  <url><loc>${xml(site.url)}/</loc><changefreq>daily</changefreq></url>`,
    ...posts.map(
      (p) => `  <url><loc>${xml(postUrl(site, p.slug))}</loc><lastmod>${p.updatedAt.slice(0, 10)}</lastmod></url>`,
    ),
    ...[...new Set(posts.map((p) => p.authorHandle))].map((h) => `  <url><loc>${xml(site.url)}/@${xml(h)}</loc></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function renderRss(posts: PostSummary[], site: SiteInfo): string {
  const items = posts.slice(0, 30).map(
    (p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${xml(postUrl(site, p.slug))}</link>
      <guid isPermaLink="false">${xml(p.postId)}</guid>
      <pubDate>${new Date(p.publishedAt!).toUTCString()}</pubDate>
      <dc:creator>${xml(p.author)}</dc:creator>
      <category>${xml(p.category)}</category>
      <description>${xml(p.excerpt)}</description>
    </item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(site.title)}</title>
    <link>${xml(site.url)}/</link>
    <description>${xml(site.description)}</description>
    <language>en</language>
    <atom:link href="${xml(site.url)}/rss.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`;
}

export function renderRobots(site: SiteInfo): string {
  return `User-agent: *\nDisallow: /studio\nDisallow: /auth\nSitemap: ${site.url}/sitemap.xml\n`;
}
