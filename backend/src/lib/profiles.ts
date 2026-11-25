import { GetCommand, PutCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './db.js';
import { env } from './env.js';
import { HttpError, notFound } from './http.js';
import { handleSchema, type Profile, type ProfileInput, RESERVED_HANDLES } from './models.js';
import type { User } from './auth.js';

/**
 * Handles are unique, enforced by a separate `handles` table keyed by handle
 * (conditional writes in a transaction), so two users can never grab the same one.
 */

export async function get(userId: string): Promise<Profile | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: env.profilesTable, Key: { userId } }));
  return res.Item as Profile | undefined;
}

export async function getByHandle(handle: string): Promise<Profile | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: env.handlesTable, Key: { handle: handle.toLowerCase() } }));
  return res.Item ? get(res.Item.userId as string) : undefined;
}

function suggestHandle(user: User): string {
  const base = (user.name || user.email.split('@')[0] || 'writer')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18);
  const ok = handleSchema.safeParse(base);
  return ok.success ? base : `writer_${user.sub.slice(0, 6)}`;
}

/** First authenticated request: create a profile with a provisional, unique handle. */
export async function ensure(user: User): Promise<Profile> {
  const existing = await get(user.sub);
  if (existing) return existing;

  const now = new Date().toISOString();
  const base = suggestHandle(user);
  for (let i = 0; i < 20; i++) {
    const handle = i === 0 ? base : `${base.slice(0, 18)}${Math.floor(100 + Math.random() * 9000)}`;
    if (RESERVED_HANDLES.has(handle)) continue;
    const profile: Profile = {
      userId: user.sub,
      handle,
      displayName: user.name || handle,
      bio: '',
      status: 'active',
      onboarded: false,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: env.handlesTable, Item: { handle, userId: user.sub }, ConditionExpression: 'attribute_not_exists(handle)' } },
            { Put: { TableName: env.profilesTable, Item: profile, ConditionExpression: 'attribute_not_exists(userId)' } },
          ],
        }),
      );
      return profile;
    } catch (e) {
      if ((e as Error).name !== 'TransactionCanceledException') throw e;
      // Either the handle was taken (try another) or a parallel request created the profile.
      const raced = await get(user.sub);
      if (raced) return raced;
    }
  }
  throw new HttpError(500, 'Could not allocate a handle');
}

export async function update(current: Profile, input: ProfileInput): Promise<Profile> {
  const next: Profile = {
    ...current,
    handle: input.handle,
    displayName: input.displayName,
    bio: input.bio,
    avatarUrl: input.avatarUrl || undefined,
    website: input.website || undefined,
    onboarded: true,
    updatedAt: new Date().toISOString(),
  };
  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
    { Put: { TableName: env.profilesTable, Item: next, ConditionExpression: 'updatedAt = :prev', ExpressionAttributeValues: { ':prev': current.updatedAt } } },
  ];
  if (next.handle !== current.handle) {
    items.push(
      { Put: { TableName: env.handlesTable, Item: { handle: next.handle, userId: current.userId }, ConditionExpression: 'attribute_not_exists(handle)' } },
      { Delete: { TableName: env.handlesTable, Key: { handle: current.handle } } },
    );
  }
  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (e) {
    if ((e as Error).name === 'TransactionCanceledException') {
      const reasons = (e as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
      if (reasons[1]?.Code === 'ConditionalCheckFailed') throw new HttpError(409, `@${next.handle} is already taken`);
      throw new HttpError(409, 'Your profile changed in another tab. Reload and try again.');
    }
    throw e;
  }
  return next;
}

export async function setStatus(userId: string, status: Profile['status']): Promise<Profile> {
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: env.profilesTable,
        Key: { userId },
        UpdateExpression: 'SET #status = :s, updatedAt = :now',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':s': status, ':now': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return res.Attributes as Profile;
  } catch (e) {
    if ((e as Error).name === 'ConditionalCheckFailedException') throw notFound('User');
    throw e;
  }
}

export async function listAll(): Promise<Profile[]> {
  const items: Profile[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: env.profilesTable, ExclusiveStartKey }));
    items.push(...((res.Items ?? []) as Profile[]));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Used by the legacy migration to create the owner's profile directly. */
export async function put(profile: Profile): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.handlesTable, Item: { handle: profile.handle, userId: profile.userId } }));
  await ddb.send(new PutCommand({ TableName: env.profilesTable, Item: profile }));
}

export function assertActive(profile: Profile): void {
  if (profile.status === 'suspended') throw new HttpError(403, 'Your account is suspended');
}
