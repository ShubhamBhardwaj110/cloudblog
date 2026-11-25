import { DeleteCommand, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './db.js';
import { env } from './env.js';

/**
 * View counts live in their own table so that bumping a counter doesn't
 * rewrite the post item (and fire the publisher's stream trigger).
 */
export async function increment(postId: string): Promise<number> {
  const res = await ddb.send(
    new UpdateCommand({
      TableName: env.viewsTable,
      Key: { postId },
      UpdateExpression: 'ADD #views :one',
      ExpressionAttributeNames: { '#views': 'views' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return Number(res.Attributes?.views ?? 0);
}

export async function get(postId: string): Promise<number> {
  const res = await ddb.send(new GetCommand({ TableName: env.viewsTable, Key: { postId } }));
  return Number(res.Item?.views ?? 0);
}

export async function all(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: env.viewsTable, ExclusiveStartKey }));
    for (const item of res.Items ?? []) map.set(item.postId as string, Number(item.views ?? 0));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return map;
}

export async function remove(postId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: env.viewsTable, Key: { postId } }));
}
