import { randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './db.js';
import { env } from './env.js';
import { HttpError, notFound } from './http.js';
import { type Post, type PostInput, type PostSummary, SUMMARY_FIELDS } from './models.js';
import { excerpt, readingMinutes, slugify } from './text.js';

const MAX_LIST = 1000;

const summaryProjection = () => {
  const names: Record<string, string> = {};
  const expr = SUMMARY_FIELDS.map((f) => {
    names[`#${f}`] = f;
    return `#${f}`;
  }).join(', ');
  return { ProjectionExpression: expr, ExpressionAttributeNames: names };
};

/** Published posts whose publish time has arrived, newest first. */
export async function listPublished(now = new Date().toISOString()): Promise<PostSummary[]> {
  const items: PostSummary[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.postsTable,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :published AND publishedAt <= :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':published': 'published', ':now': now },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    items.push(...((res.Items ?? []) as PostSummary[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < MAX_LIST);
  return items;
}

/** Scheduled posts that are due to go live. */
export async function listDueScheduled(now = new Date().toISOString()): Promise<PostSummary[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.postsTable,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :scheduled AND publishedAt <= :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':scheduled': 'scheduled', ':now': now },
    }),
  );
  return (res.Items ?? []) as PostSummary[];
}

export async function listAll(): Promise<PostSummary[]> {
  const items: PostSummary[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: env.postsTable, ...summaryProjection(), ExclusiveStartKey }));
    items.push(...((res.Items ?? []) as PostSummary[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getById(postId: string): Promise<Post | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: env.postsTable, Key: { postId } }));
  return res.Item as Post | undefined;
}

export async function getBySlug(slug: string): Promise<Post | undefined> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.postsTable,
      IndexName: 'slug-index',
      KeyConditionExpression: 'slug = :slug',
      ExpressionAttributeValues: { ':slug': slug },
      Limit: 1,
    }),
  );
  return res.Items?.[0] as Post | undefined;
}

/** A post is publicly visible once published and its publish time has passed. */
export function isLive(post: Pick<Post, 'status' | 'publishedAt'>, now = new Date()): boolean {
  return post.status === 'published' && !!post.publishedAt && new Date(post.publishedAt) <= now;
}

export async function getLiveBySlug(slug: string): Promise<Post> {
  const post = await getBySlug(slug);
  if (!post || !isLive(post)) throw notFound('Post');
  return post;
}

async function uniqueSlug(base: string, selfId?: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const existing = await getBySlug(candidate);
    if (!existing || existing.postId === selfId) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function resolvePublishedAt(input: PostInput, existing?: Post): string | undefined {
  switch (input.status) {
    case 'draft':
      return undefined;
    case 'scheduled':
      return new Date(input.publishedAt!).toISOString();
    case 'published':
      // Keep the original publish date on edits; allow an explicit back-date.
      if (input.publishedAt) return new Date(input.publishedAt).toISOString();
      if (existing?.status === 'published' && existing.publishedAt) return existing.publishedAt;
      return new Date().toISOString();
  }
}

function build(input: PostInput, base: { postId: string; slug: string; createdAt: string }, existing?: Post): Post {
  const now = new Date().toISOString();
  const publishedAt = resolvePublishedAt(input, existing);
  // "Published" with a future date is really a scheduled post.
  const status = input.status === 'published' && publishedAt && publishedAt > now ? 'scheduled' : input.status;
  return {
    ...base,
    title: input.title,
    excerpt: input.excerpt || excerpt(input.content),
    content: input.content,
    coverImage: input.coverImage || undefined,
    coverAlt: input.coverAlt || undefined,
    category: input.category,
    tags: input.tags,
    author: input.author,
    status,
    publishedAt,
    createdAt: base.createdAt,
    updatedAt: now,
    readingMinutes: readingMinutes(input.content),
    featured: input.featured,
  };
}

export async function create(input: PostInput): Promise<Post> {
  const slug = await uniqueSlug(slugify(input.slug || input.title));
  const post = build(input, { postId: randomUUID(), slug, createdAt: new Date().toISOString() });
  await ddb.send(
    new PutCommand({ TableName: env.postsTable, Item: post, ConditionExpression: 'attribute_not_exists(postId)' }),
  );
  return post;
}

export async function update(postId: string, input: PostInput): Promise<Post> {
  const existing = await getById(postId);
  if (!existing) throw notFound('Post');
  const requested = slugify(input.slug || existing.slug);
  const slug = requested === existing.slug ? existing.slug : await uniqueSlug(requested, postId);
  const post = build(input, { postId, slug, createdAt: existing.createdAt }, existing);
  try {
    await ddb.send(
      new PutCommand({
        TableName: env.postsTable,
        Item: post,
        // Optimistic lock: fail if someone else saved in the meantime.
        ConditionExpression: 'updatedAt = :prev',
        ExpressionAttributeValues: { ':prev': existing.updatedAt },
      }),
    );
  } catch (e) {
    if ((e as Error).name === 'ConditionalCheckFailedException') {
      throw new HttpError(409, 'This post was changed by someone else. Reload and try again.');
    }
    throw e;
  }
  return post;
}

export async function publishScheduled(postId: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: env.postsTable,
      Key: { postId },
      UpdateExpression: 'SET #status = :published, updatedAt = :now',
      ConditionExpression: '#status = :scheduled',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':published': 'published', ':scheduled': 'scheduled', ':now': new Date().toISOString() },
    }),
  );
}

export async function remove(postId: string): Promise<Post> {
  const res = await ddb.send(
    new DeleteCommand({ TableName: env.postsTable, Key: { postId }, ReturnValues: 'ALL_OLD' }),
  );
  if (!res.Attributes) throw notFound('Post');
  return res.Attributes as Post;
}
