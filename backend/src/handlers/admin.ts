import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { getUser, requireAdmin } from '../lib/auth.js';
import * as comments from '../lib/comments.js';
import { env } from '../lib/env.js';
import { type ApiEvent, HttpError, json, router } from '../lib/http.js';
import { publicComment } from '../lib/models.js';
import * as posts from '../lib/posts.js';
import * as profiles from '../lib/profiles.js';
import * as views from '../lib/views.js';

const lambda = new LambdaClient({});
const cognito = new CognitoIdentityProviderClient({});
const ok = (body: unknown, status = 200) => json(status, body, { 'cache-control': 'no-store' });

/** Site-wide moderation. Every route requires the Cognito "admins" group. */
const routes = router({
  'GET /admin/stats': async () => {
    const [all, viewMap, users] = await Promise.all([posts.listAll(), views.all(), profiles.listAll()]);
    const byStatus = { draft: 0, published: 0, scheduled: 0 };
    for (const p of all) byStatus[p.status]++;
    const top = all
      .filter((p) => p.status === 'published')
      .map((p) => ({ postId: p.postId, title: p.title, slug: p.slug, author: p.author, views: viewMap.get(p.postId) ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    return ok({
      posts: byStatus,
      totalPosts: all.length,
      totalViews: [...viewMap.values()].reduce((a, b) => a + b, 0),
      users: users.length,
      newUsersThisWeek: users.filter((u) => u.createdAt >= weekAgo).length,
      suspendedUsers: users.filter((u) => u.status === 'suspended').length,
      topPosts: top,
    });
  },

  'GET /admin/posts': async () => {
    const [all, viewMap] = await Promise.all([posts.listAll(), views.all()]);
    return ok({ posts: all.map((p) => ({ ...p, views: viewMap.get(p.postId) ?? 0 })) });
  },

  'POST /admin/posts/{postId}/unpublish': async (_e, { postId }) => {
    await posts.unpublish(postId!);
    return ok({ status: 'draft' });
  },

  'DELETE /admin/posts/{postId}': async (_e, { postId }) => {
    await posts.remove(postId!);
    return ok({ deleted: postId });
  },

  'GET /admin/comments': async () => ok({ comments: (await comments.listRecent()).map((c) => ({ ...publicComment(c), postId: c.postId, postSlug: c.postSlug, postTitle: c.postTitle })) }),

  'GET /admin/users': async () => {
    const [users, all] = await Promise.all([profiles.listAll(), posts.listAll()]);
    const counts = new Map<string, number>();
    for (const p of all) counts.set(p.authorId, (counts.get(p.authorId) ?? 0) + 1);
    return ok({ users: users.map((u) => ({ ...u, postCount: counts.get(u.userId) ?? 0 })) });
  },

  /**
   * Suspend: block sign-in, revoke refresh tokens, and take every post offline.
   * Existing ID tokens expire within the hour, and writes are refused meanwhile
   * because the profile is marked suspended.
   */
  'POST /admin/users/{userId}/suspend': async (e, { userId }) => {
    if (userId === getUser(e).sub) throw new HttpError(400, "You can't suspend yourself");
    const profile = await profiles.setStatus(userId!, 'suspended');
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: env.userPoolId, Username: userId }));
    await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: env.userPoolId, Username: userId }));
    const theirs = await posts.listByAuthor(userId!);
    for (const p of theirs) if (p.status !== 'draft') await posts.unpublish(p.postId);
    return ok({ user: profile, unpublished: theirs.filter((p) => p.status !== 'draft').length });
  },

  'POST /admin/users/{userId}/unsuspend': async (_e, { userId }) => {
    const profile = await profiles.setStatus(userId!, 'active');
    await cognito.send(new AdminEnableUserCommand({ UserPoolId: env.userPoolId, Username: userId }));
    return ok({ user: profile });
  },

  'POST /admin/rebuild': async () => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.PUBLISHER_FUNCTION!,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ action: 'rebuild' })),
      }),
    );
    return ok({ status: 'started' }, 202);
  },
});

export const handler = async (event: ApiEvent) => {
  try {
    requireAdmin(getUser(event));
  } catch (err) {
    return json((err as HttpError).status ?? 403, { error: (err as Error).message });
  }
  return routes(event);
};
