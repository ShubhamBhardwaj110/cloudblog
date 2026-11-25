import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import * as comments from '../lib/comments.js';
import { env } from '../lib/env.js';
import type { Post } from '../lib/models.js';
import * as posts from '../lib/posts.js';
import { renderPostPage, renderRobots, renderRss, renderSitemap, type SiteInfo } from '../lib/render.js';
import * as views from '../lib/views.js';

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: 'info', msg, ...extra }));

const site = (): SiteInfo => ({ url: env.siteUrl, title: env.siteTitle, description: env.siteDescription });
const pageKey = (slug: string) => `posts/${slug}/index.html`;

/** The Vite-built index.html is the template for every prerendered page. */
async function loadTemplate(): Promise<string | undefined> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.siteBucket, Key: 'index.html' }));
    return await res.Body!.transformToString();
  } catch (err) {
    if ((err as Error).name === 'NoSuchKey') {
      log('index.html not deployed yet; skipping page renders');
      return undefined;
    }
    throw err;
  }
}

async function put(key: string, body: string, contentType: string, maxAge = 300) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.siteBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: `public, max-age=${maxAge}`,
    }),
  );
}

async function deleteKeys(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.siteBucket,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

async function renderPage(template: string | undefined, post: Post) {
  if (!template) return;
  await put(pageKey(post.slug), renderPostPage(template, post, site()), 'text/html; charset=utf-8');
}

async function renderFeeds() {
  const live = await posts.listPublished();
  await Promise.all([
    put('sitemap.xml', renderSitemap(live, site()), 'application/xml; charset=utf-8', 3600),
    put('rss.xml', renderRss(live, site()), 'application/rss+xml; charset=utf-8', 900),
    put('robots.txt', renderRobots(site()), 'text/plain; charset=utf-8', 86400),
  ]);
  return live;
}

async function invalidate(paths: string[]) {
  if (!env.distributionId || paths.length === 0) return;
  // Each invalidation path counts toward the 1,000 free paths/month; collapse big batches.
  const items = paths.length > 10 ? ['/*'] : [...new Set(paths)];
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: env.distributionId,
      InvalidationBatch: { CallerReference: `${Date.now()}-${Math.random()}`, Paths: { Quantity: items.length, Items: items } },
    }),
  );
  log('invalidated', { paths: items });
}

/** React to post writes: render, move or remove static pages, then refresh feeds. */
async function onStream(event: DynamoDBStreamEvent) {
  const template = await loadTemplate();
  const touched: string[] = [];

  for (const record of event.Records) {
    const img = record.dynamodb;
    const oldPost = img?.OldImage ? (unmarshall(img.OldImage as Record<string, AttributeValue>) as Post) : undefined;
    const newPost = img?.NewImage ? (unmarshall(img.NewImage as Record<string, AttributeValue>) as Post) : undefined;

    if (newPost && posts.isLive(newPost)) {
      await renderPage(template, newPost);
      touched.push(`/posts/${newPost.slug}`, `/posts/${newPost.slug}/*`);
    }
    if (oldPost && (!newPost || !posts.isLive(newPost) || newPost.slug !== oldPost.slug)) {
      await deleteKeys([pageKey(oldPost.slug)]);
      touched.push(`/posts/${oldPost.slug}`, `/posts/${oldPost.slug}/*`);
    }
    if (record.eventName === 'REMOVE' && oldPost) {
      const removed = await comments.removeAllForPost(oldPost.postId);
      await views.remove(oldPost.postId);
      log('cleaned up deleted post', { postId: oldPost.postId, comments: removed });
    }
  }

  if (touched.length) {
    await renderFeeds();
    await invalidate([...touched, '/sitemap.xml', '/rss.xml']);
  }
}

/** Re-render everything, e.g. after a frontend deploy changes asset hashes in index.html. */
async function rebuild() {
  const template = await loadTemplate();
  const summaries = await renderFeeds();
  const wanted = new Set<string>();
  for (const s of summaries) {
    const post = await posts.getById(s.postId);
    if (post && posts.isLive(post)) {
      await renderPage(template, post);
      wanted.add(pageKey(post.slug));
    }
  }
  // Remove orphaned pages (e.g. a post deleted while the stream was disabled).
  const stale: string[] = [];
  let ContinuationToken: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: env.siteBucket, Prefix: 'posts/', ContinuationToken }));
    for (const o of res.Contents ?? []) if (o.Key && !wanted.has(o.Key)) stale.push(o.Key);
    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);
  if (stale.length) await deleteKeys(stale);

  await invalidate(['/*']);
  log('rebuild complete', { pages: wanted.size, removed: stale.length });
}

/** Every few minutes: flip due scheduled posts to published (the stream then renders them). */
async function publishDue() {
  const due = await posts.listDueScheduled();
  for (const p of due) {
    try {
      await posts.publishScheduled(p.postId);
      log('published scheduled post', { postId: p.postId, slug: p.slug });
    } catch (err) {
      if ((err as Error).name !== 'ConditionalCheckFailedException') throw err;
    }
  }
}

type PublisherEvent = DynamoDBStreamEvent | { action: 'rebuild' } | { source: 'aws.scheduler' | 'aws.events' };

export const handler = async (event: PublisherEvent) => {
  if ('Records' in event) return onStream(event);
  if ('action' in event && event.action === 'rebuild') return rebuild();
  return publishDue();
};
