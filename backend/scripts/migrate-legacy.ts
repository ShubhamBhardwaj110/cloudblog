/**
 * One-off migration from the original console-built tables (BlogPosts, BlogComments)
 * into the new Terraform-managed tables. Legacy posts are assigned to the owner's
 * account. Safe to re-run: IDs are preserved and writes are idempotent. The old
 * tables are only read, never modified.
 *
 *   npm run migrate:legacy -w backend -- --pool <userPoolId> --owner <email> --handle <handle> [--dry-run]
 */
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { type Comment, handleSchema, type Post, type Profile } from '../src/lib/models.js';
import { excerpt, readingMinutes, slugify } from '../src/lib/text.js';

const OLD = { posts: 'BlogPosts', comments: 'BlogComments' };
const NEW = {
  posts: 'cloudblog-posts',
  comments: 'cloudblog-comments',
  views: 'cloudblog-views',
  profiles: 'cloudblog-profiles',
  handles: 'cloudblog-handles',
};

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes('--dry-run');
const poolId = arg('pool');
const ownerEmail = arg('owner');
const ownerHandle = handleSchema.parse(arg('handle') ?? 'admin_writer');
if (!poolId || !ownerEmail) {
  console.error('Usage: --pool <userPoolId> --owner <email> [--handle <handle>] [--dry-run]');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const cognito = new CognitoIdentityProviderClient({});

const found = await cognito.send(new ListUsersCommand({ UserPoolId: poolId, Filter: `email = "${ownerEmail.replace(/"/g, '')}"`, Limit: 1 }));
const ownerSub = found.Users?.[0]?.Attributes?.find((a) => a.Name === 'sub')?.Value;
if (!ownerSub) {
  console.error(`No Cognito user with email ${ownerEmail} in ${poolId}`);
  process.exit(1);
}

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

// Owner profile: keep it if it already exists (e.g. they signed in first).
const existing = (await ddb.send(new GetCommand({ TableName: NEW.profiles, Key: { userId: ownerSub } }))).Item as Profile | undefined;
const now = new Date().toISOString();
const owner: Profile = existing ?? {
  userId: ownerSub,
  handle: ownerHandle,
  displayName: ownerHandle,
  bio: '',
  status: 'active',
  onboarded: false,
  createdAt: now,
  updatedAt: now,
};

const oldPosts = await scanAll(OLD.posts);
const oldComments = await scanAll(OLD.comments);
console.log(`Found ${oldPosts.length} posts and ${oldComments.length} comments; owner @${owner.handle} (${ownerSub})${dryRun ? ' [dry run]' : ''}`);

const used = new Set<string>();
const posts: Post[] = oldPosts.map((o) => {
  let slug = slugify(o.title ?? 'post');
  for (let i = 2; used.has(slug); i++) slug = `${slugify(o.title)}-${i}`;
  used.add(slug);
  const content = String(o.content ?? '');
  const created = o.createdAt ?? now;
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
    authorId: owner.userId,
    author: owner.displayName,
    authorHandle: owner.handle,
    authorAvatar: owner.avatarUrl,
    status: published ? 'published' : 'draft',
    publishedAt: published ? created : undefined,
    createdAt: created,
    updatedAt: o.updatedAt ?? created,
    readingMinutes: readingMinutes(content),
    featured: false,
  };
});

const byId = new Map(posts.map((p) => [p.postId, p]));
const comments: Comment[] = oldComments
  .filter((c) => byId.has(c.postId))
  .map((c) => {
    const p = byId.get(c.postId)!;
    const createdAt = c.createdAt ?? now;
    return {
      postId: c.postId,
      commentKey: `${createdAt}#${c.commentId}`,
      commentId: c.commentId,
      authorId: 'legacy', // pre-accounts guest comment; only the post author or an admin can delete it
      author: String(c.author ?? 'Guest').slice(0, 60),
      content: String(c.content ?? '').slice(0, 2000),
      status: 'visible',
      createdAt,
      postSlug: p.slug,
      postTitle: p.title,
      postAuthorId: p.authorId,
    };
  });

for (const p of posts) console.log(`  post  ${p.status.padEnd(9)} /posts/${p.slug}`);
console.log(`  ${comments.length} comments${oldComments.length - comments.length ? ` (${oldComments.length - comments.length} orphans skipped)` : ''}`);
if (dryRun) process.exit(0);

if (!existing) {
  await ddb.send(new PutCommand({ TableName: NEW.handles, Item: { handle: owner.handle, userId: owner.userId }, ConditionExpression: 'attribute_not_exists(handle)' }));
  await ddb.send(new PutCommand({ TableName: NEW.profiles, Item: owner }));
}
for (const p of posts) await ddb.send(new PutCommand({ TableName: NEW.posts, Item: p }));
for (let i = 0; i < comments.length; i += 25) {
  await ddb.send(new BatchWriteCommand({ RequestItems: { [NEW.comments]: comments.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) } }));
}
for (const o of oldPosts) {
  if (Number(o.views) > 0) await ddb.send(new PutCommand({ TableName: NEW.views, Item: { postId: o.postId, views: Number(o.views) } }));
}
console.log('✓ Migration complete. The publisher Lambda renders static pages from the posts stream.');
