import { randomUUID } from 'node:crypto';
import { BatchWriteCommand, DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './db.js';
import { env } from './env.js';
import { notFound } from './http.js';
import type { Comment, CommentStatus, Post } from './models.js';

export async function listApproved(postId: string): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.commentsTable,
      KeyConditionExpression: 'postId = :postId',
      FilterExpression: '#status = :approved',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':postId': postId, ':approved': 'approved' },
    }),
  );
  return (res.Items ?? []) as Comment[];
}

export async function listByStatus(status: CommentStatus, limit = 100): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.commentsTable,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as Comment[];
}

export async function countByStatus(status: CommentStatus): Promise<number> {
  let count = 0;
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: env.commentsTable,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        Select: 'COUNT',
        ExclusiveStartKey,
      }),
    );
    count += res.Count ?? 0;
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return count;
}

export async function create(post: Post, author: string, content: string): Promise<Comment> {
  const createdAt = new Date().toISOString();
  const commentId = randomUUID();
  const comment: Comment = {
    postId: post.postId,
    commentKey: `${createdAt}#${commentId}`,
    commentId,
    author,
    content,
    status: 'pending',
    createdAt,
    postSlug: post.slug,
    postTitle: post.title,
  };
  await ddb.send(new PutCommand({ TableName: env.commentsTable, Item: comment }));
  return comment;
}

export async function setStatus(postId: string, commentKey: string, status: CommentStatus): Promise<Comment> {
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: env.commentsTable,
        Key: { postId, commentKey },
        UpdateExpression: 'SET #status = :status',
        ConditionExpression: 'attribute_exists(postId)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return res.Attributes as Comment;
  } catch (e) {
    if ((e as Error).name === 'ConditionalCheckFailedException') throw notFound('Comment');
    throw e;
  }
}

export async function remove(postId: string, commentKey: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: env.commentsTable, Key: { postId, commentKey } }));
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
