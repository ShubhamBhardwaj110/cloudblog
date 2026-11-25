import { randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from './auth.js';
import { ddb } from './db.js';
import { env } from './env.js';
import { HttpError, notFound } from './http.js';
import { type AuthorRef, type Post, type PostInput, type PostSummary, SUMMARY_FIELDS } from './models.js';
import { excerpt, readingMinutes, slugify } from './text.js';

const MAX_LIST = 1000;
/** Writers can create this many posts per rolling 24 hours (spam brake; admins exempt). */
export const DAILY_POST_LIMIT = 10;

const summaryProjection = () => {
  const names: Record<string, string> = {};
  const expr = SUMMARY_FIELDS.map((f) => {
    names[`#${f}`] = f;
    return `#${f}`;
  }).join(', ');
  return { ProjectionExpression: expr, ExpressionAttributeNames: names };
};

async function queryAll<T>(input: ConstructorParameters<typeof QueryCommand>[0], max = MAX_LIST): Promise<T[]> {
  const items: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...((res.Items ?? []) as T[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < max);
  return items;
}

/** Published posts whose publish time has arrived, newest first. */
export function listPublished(now = new Date().toISOString()): Promise<PostSummary[]> {
  return queryAll<PostSummary>({
    TableName: env.postsTable,
    IndexName: 'status-index',
    KeyConditionExpression: '#status = :published AND publishedAt <= :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':published': 'published', ':now': now },
    ScanIndexForward: false,
  });
}

/** Scheduled posts that are due to go live. */
export function listDueScheduled(now = new Date().toISOString()): Promise<PostSummary[]> {
  return queryAll<PostSummary>({
    TableName: env.postsTable,
    IndexName: 'status-index',
    KeyConditionExpression: '#status = :scheduled AND publishedAt <= :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':scheduled': 'scheduled', ':now': now },
  });
}

/** Every post by one author (any status), most recently edited first. */
export function listByAuthor(authorId: string): Promise<PostSummary[]> {
  return queryAll<PostSummary>({
    TableName: env.postsTable,
    IndexName: 'author-index',
    KeyConditionExpression: 'authorId = :a',
    ExpressionAttributeValues: { ':a': authorId },
    ScanIndexForward: false,
  });
}

export async function countCreatedSince(authorId: string, sinceIso: string): Promise<number> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.postsTable,
      IndexName: 'author-index',
      KeyConditionExpression: 'authorId = :a AND updatedAt >= :since',
      FilterExpression: 'createdAt >= :since',
      ExpressionAttributeValues: { ':a': authorId, ':since': sinceIso },
      Select: 'COUNT',
    }),
  );
  return res.Count ?? 0;
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

export const canEdit = (post: Pick<Post, 'authorId'>, user: User) => user.isAdmin || post.authorId === user.sub;

/** Load a post the user may edit, or fail with 404 (never reveal other people's drafts). */
export async function getEditable(postId: string, user: User): Promise<Post> {
  const post = await getById(postId);
  if (!post || !canEdit(post, user)) throw notFound('Post');
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

function build(
  input: PostInput,
  base: { postId: string; slug: string; createdAt: string; author: AuthorRef; featured: boolean },
  existing?: Post,
): Post {
  const now = new Date().toISOString();
  const publishedAt = resolvePublishedAt(input, existing);
  // "Published" with a future date is really a scheduled post.
  const status = input.status === 'published' && publishedAt && publishedAt > now ? 'scheduled' : input.status;
  return {
    postId: base.postId,
    slug: base.slug,
    ...base.author,
    title: input.title,
    excerpt: input.excerpt || excerpt(input.content),
    content: input.content,
    coverImage: input.coverImage || undefined,
    coverAlt: input.coverAlt || undefined,
    category: input.category,
    tags: input.tags,
    status,
    publishedAt,
    createdAt: base.createdAt,
    updatedAt: now,
    readingMinutes: readingMinutes(input.content),
    featured: base.featured,
  };
}

export async function create(input: PostInput, author: AuthorRef, user: User): Promise<Post> {
  if (!user.isAdmin) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    if ((await countCreatedSince(author.authorId, since)) >= DAILY_POST_LIMIT) {
      throw new HttpError(429, `You can create up to ${DAILY_POST_LIMIT} posts per day. Please try again tomorrow.`);
    }
  }
  const slug = await uniqueSlug(slugify(input.slug || input.title));
  const post = build(input, {
    postId: randomUUID(),
    slug,
    createdAt: new Date().toISOString(),
    author,
    featured: user.isAdmin && input.featured, // only admins curate the home page
  });
  await ddb.send(
    new PutCommand({ TableName: env.postsTable, Item: post, ConditionExpression: 'attribute_not_exists(postId)' }),
  );
  return post;
}

export async function update(postId: string, input: PostInput, user: User): Promise<Post> {
  const existing = await getEditable(postId, user);
  const requested = slugify(input.slug || existing.slug);
  const slug = requested === existing.slug ? existing.slug : await uniqueSlug(requested, postId);
  const post = build(
    input,
    {
      postId,
      slug,
      createdAt: existing.createdAt,
      // Ownership never changes on edit, even when an admin edits someone else's post.
      author: { authorId: existing.authorId, author: existing.author, authorHandle: existing.authorHandle, authorAvatar: existing.authorAvatar },
      featured: user.isAdmin ? input.featured : existing.featured,
    },
    existing,
  );
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
      throw new HttpError(409, 'This post was changed elsewhere. Reload and try again.');
    }
    throw e;
  }
  return post;
}

/** Take a post offline (admin moderation, suspension). The author can republish unless suspended. */
export async function unpublish(postId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.postsTable,
        Key: { postId },
        UpdateExpression: 'SET #status = :draft, updatedAt = :now REMOVE publishedAt',
        ConditionExpression: 'attribute_exists(postId)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':draft': 'draft', ':now': new Date().toISOString() },
      }),
    );
  } catch (e) {
    if ((e as Error).name === 'ConditionalCheckFailedException') throw notFound('Post');
    throw e;
  }
}

/** Keep the denormalised author name/handle/avatar on posts in sync with the profile. */
export async function syncAuthor(ref: AuthorRef): Promise<number> {
  const mine = await listByAuthor(ref.authorId);
  for (const p of mine) {
    await ddb.send(
      new UpdateCommand({
        TableName: env.postsTable,
        Key: { postId: p.postId },
        UpdateExpression: ref.authorAvatar
          ? 'SET author = :n, authorHandle = :h, authorAvatar = :a'
          : 'SET author = :n, authorHandle = :h REMOVE authorAvatar',
        ExpressionAttributeValues: { ':n': ref.author, ':h': ref.authorHandle, ...(ref.authorAvatar ? { ':a': ref.authorAvatar } : {}) },
      }),
    );
  }
  return mine.length;
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
