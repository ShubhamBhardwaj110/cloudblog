import { randomUUID } from 'node:crypto';
import { BatchWriteCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from './auth.js';
import { ddb } from './db.js';
import { env } from './env.js';
import { HttpError, notFound } from './http.js';
import type { Comment, Post, Profile } from './models.js';

export async function listForPost(postId: string): Promise<Comment[]> {
  const items: Comment[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.commentsTable,
        KeyConditionExpression: 'postId = :postId',
        ExpressionAttributeValues: { ':postId': postId },
        ExclusiveStartKey,
      }),
    );
    items.push(...((res.Items ?? []) as Comment[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < 1000);
  return items;
}

/** Newest comments across the whole site (admin view). */
export async function listRecent(limit = 100): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.commentsTable,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :visible',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':visible': 'visible' },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as Comment[];
}

export async function create(post: Post, author: Profile, content: string): Promise<Comment> {
  const createdAt = new Date().toISOString();
  const commentId = randomUUID();
  const comment: Comment = {
    postId: post.postId,
    commentKey: `${createdAt}#${commentId}`,
    commentId,
    authorId: author.userId,
    author: author.displayName,
    authorHandle: author.handle,
    authorAvatar: author.avatarUrl,
    content,
    status: 'visible',
    createdAt,
    postSlug: post.slug,
    postTitle: post.title,
    postAuthorId: post.authorId,
  };
  await ddb.send(new PutCommand({ TableName: env.commentsTable, Item: comment }));
  return comment;
}

/** The commenter, the post's author, or an admin may delete a comment. */
export async function removeAs(user: User, postId: string, commentKey: string): Promise<Comment> {
  const res = await ddb.send(new GetCommand({ TableName: env.commentsTable, Key: { postId, commentKey } }));
  const c = res.Item as Comment | undefined;
  if (!c) throw notFound('Comment');
  if (!(user.isAdmin || c.authorId === user.sub || c.postAuthorId === user.sub)) {
    throw new HttpError(403, 'You can only delete your own comments or comments on your posts');
  }
  await ddb.send(new DeleteCommand({ TableName: env.commentsTable, Key: { postId, commentKey } }));
  return c;
}

export async function removeAllForPost(postId: string): Promise<number> {
  let removed = 0;
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.commentsTable,
        KeyConditionExpression: 'postId = :postId',
        ExpressionAttributeValues: { ':postId': postId },
        ProjectionExpression: 'postId, commentKey',
        ExclusiveStartKey,
      }),
    );
    const keys = res.Items ?? [];
    for (let i = 0; i < keys.length; i += 25) {
      const batch = keys.slice(i, i + 25);
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [env.commentsTable]: batch.map((Key) => ({ DeleteRequest: { Key } })) },
        }),
      );
      removed += batch.length;
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return removed;
}
