/**
 * One-off migration from the original console-built tables (BlogPosts, BlogComments)
 * into the new Terraform-managed tables. Safe to re-run: post IDs are preserved and
 * writes are idempotent. Old tables are only read, never modified.
 *
 *   npm run migrate:legacy -w backend -- --dry-run
 *   npm run migrate:legacy -w backend
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Comment, Post } from '../src/lib/models.js';
import { excerpt, readingMinutes, slugify } from '../src/lib/text.js';

const OLD = { posts: 'BlogPosts', comments: 'BlogComments' };
const NEW = { posts: 'cloudblog-posts', comments: 'cloudblog-comments', views: 'cloudblog-views' };
const dryRun = process.argv.includes('--dry-run');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

async function scanAll(table: string) {
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...(r.Items ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const oldPosts = await scanAll(OLD.posts);
const oldComments = await scanAll(OLD.comments);
console.log(`Found ${oldPosts.length} posts and ${oldComments.length} comments in the legacy tables${dryRun ? ' (dry run)' : ''}`);

const used = new Set<string>();
const posts: Post[] = oldPosts.map((o) => {
  let slug = slugify(o.title ?? 'post');
  for (let i = 2; used.has(slug); i++) slug = `${slugify(o.title)}-${i}`;
  used.add(slug);
  const content = String(o.content ?? '');
  const created = o.createdAt ?? new Date().toISOString();
  const published = o.published !== false;
  return {
    postId: o.postId,
    slug,
    title: String(o.title ?? 'Untitled').slice(0, 200),
    excerpt: excerpt(content),
    content,
    coverImage: typeof o.imageUrl === 'string' && o.imageUrl.startsWith('https://') ? o.imageUrl : undefined,
    category: o.category || 'General',
    tags: Array.isArray(o.tags) ? [...new Set(o.tags.map((t: string) => slugify(String(t))))].slice(0, 10) : [],
    author: o.author || 'Anonymous',
    status: published ? 'published' : 'draft',
    publishedAt: published ? created : undefined,
    createdAt: created,
    updatedAt: o.updatedAt ?? created,
    readingMinutes: readingMinutes(content),
    featured: false,
  } satisfies Post;
});

const byId = new Map(posts.map((p) => [p.postId, p]));
const comments: Comment[] = oldComments
  .filter((c) => byId.has(c.postId))
  .map((c) => {
    const p = byId.get(c.postId)!;
    const createdAt = c.createdAt ?? new Date().toISOString();
    return {
      postId: c.postId,
      commentKey: `${createdAt}#${c.commentId}`,
      commentId: c.commentId,
      author: String(c.author ?? 'Anonymous').slice(0, 60),
      content: String(c.content ?? '').slice(0, 2000),
      status: 'approved', // these were already public on the old site
      createdAt,
      postSlug: p.slug,
      postTitle: p.title,
    };
  });
const orphans = oldComments.length - comments.length;

for (const p of posts) console.log(`  post  ${p.status.padEnd(9)} /posts/${p.slug}`);
console.log(`  ${comments.length} comments → approved${orphans ? ` (${orphans} skipped: their post no longer exists)` : ''}`);

if (dryRun) process.exit(0);

for (const p of posts) await ddb.send(new PutCommand({ TableName: NEW.posts, Item: p }));

for (let i = 0; i < comments.length; i += 25) {
  await ddb.send(new BatchWriteCommand({ RequestItems: { [NEW.comments]: comments.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) } }));
}

for (const o of oldPosts) {
  if (Number(o.views) > 0) await ddb.send(new PutCommand({ TableName: NEW.views, Item: { postId: o.postId, views: Number(o.views) } }));
}

console.log('✓ Migration complete. The publisher Lambda will render static pages from the posts stream.');
