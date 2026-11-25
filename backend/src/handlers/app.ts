import { randomUUID } from 'node:crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getUser, type User } from '../lib/auth.js';
import * as comments from '../lib/comments.js';
import { env } from '../lib/env.js';
import { type ApiEvent, json, parseBody, router } from '../lib/http.js';
import {
  commentInputSchema,
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  postInputSchema,
  profileInputSchema,
  publicComment,
  reportInputSchema,
  toAuthorRef,
  uploadRequestSchema,
} from '../lib/models.js';
import * as posts from '../lib/posts.js';
import * as profiles from '../lib/profiles.js';
import * as views from '../lib/views.js';

const s3 = new S3Client({});
const sns = new SNSClient({});
const ok = (body: unknown, status = 200) => json(status, body, { 'cache-control': 'no-store' });

/** Resolve the caller's profile and refuse writes from suspended accounts. */
async function activeProfile(user: User) {
  const profile = await profiles.ensure(user);
  profiles.assertActive(profile);
  return profile;
}

const user = (e: ApiEvent) => getUser(e);

/** Every route here requires a signed-in user (JWT authorizer on API Gateway). */
export const handler = router({
  // ---------- Me ----------
  'GET /me': async (e) => {
    const u = user(e);
    const profile = await profiles.ensure(u);
    return ok({ profile, email: u.email, isAdmin: u.isAdmin, dailyPostLimit: posts.DAILY_POST_LIMIT });
  },

  'PUT /me': async (e) => {
    const u = user(e);
    const current = await activeProfile(u);
    const updated = await profiles.update(current, parseBody(e, profileInputSchema));
    const ref = toAuthorRef(updated);
    const before = toAuthorRef(current);
    // Re-stamp the new name/handle/avatar on this writer's posts (the publisher re-renders them).
    if (ref.author !== before.author || ref.authorHandle !== before.authorHandle || ref.authorAvatar !== before.authorAvatar) {
      await posts.syncAuthor(ref);
    }
    return ok({ profile: updated });
  },

  'GET /me/stats': async (e) => {
    const u = user(e);
    const mine = await posts.listByAuthor(u.sub);
    const viewMap = await views.many(mine.map((p) => p.postId));
    const byStatus = { draft: 0, published: 0, scheduled: 0 };
    for (const p of mine) byStatus[p.status]++;
    const top = mine
      .filter((p) => p.status === 'published')
      .map((p) => ({ postId: p.postId, title: p.title, slug: p.slug, views: viewMap.get(p.postId) ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    return ok({ posts: byStatus, totalPosts: mine.length, totalViews: [...viewMap.values()].reduce((a, b) => a + b, 0), topPosts: top });
  },

  // ---------- My posts ----------
  'GET /me/posts': async (e) => {
    const u = user(e);
    const mine = await posts.listByAuthor(u.sub);
    const viewMap = await views.many(mine.map((p) => p.postId));
    return ok({ posts: mine.map((p) => ({ ...p, views: viewMap.get(p.postId) ?? 0 })) });
  },

  'GET /me/posts/{postId}': async (e, { postId }) => ok({ post: await posts.getEditable(postId!, user(e)) }),

  'POST /me/posts': async (e) => {
    const u = user(e);
    const profile = await activeProfile(u);
    return ok({ post: await posts.create(parseBody(e, postInputSchema), toAuthorRef(profile), u) }, 201);
  },

  'PUT /me/posts/{postId}': async (e, { postId }) => {
    const u = user(e);
    await activeProfile(u);
    return ok({ post: await posts.update(postId!, parseBody(e, postInputSchema), u) });
  },

  // Comments, view counts and the static page are cleaned up by the publisher's stream handler.
  'DELETE /me/posts/{postId}': async (e, { postId }) => {
    await posts.getEditable(postId!, user(e));
    await posts.remove(postId!);
    return ok({ deleted: postId });
  },

  /**
   * Browser uploads straight to S3 with a short-lived presigned POST. S3 enforces
   * size and type; files land under the user's own prefix.
   */
  'POST /me/uploads': async (e) => {
    const u = user(e);
    await activeProfile(u);
    const { contentType } = parseBody(e, uploadRequestSchema);
    const now = new Date();
    const key = `media/u/${u.sub}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXTENSIONS[contentType]}`;
    const { url, fields } = await createPresignedPost(s3, {
      Bucket: env.mediaBucket,
      Key: key,
      Conditions: [['content-length-range', 1, MAX_UPLOAD_BYTES]],
      Fields: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
      Expires: 300,
    });
    return ok({ url, fields, publicUrl: `${env.mediaBaseUrl}/${key}` });
  },

  // ---------- Comments & reports ----------
  'POST /posts/{slug}/comments': async (e, { slug }) => {
    const u = user(e);
    const profile = await activeProfile(u);
    const { content } = parseBody(e, commentInputSchema);
    const post = await posts.getLiveBySlug(slug!);
    const comment = await comments.create(post, profile, content);
    return ok({ comment: publicComment(comment) }, 201);
  },

  'DELETE /posts/{slug}/comments/{commentKey}': async (e, { slug, commentKey }) => {
    const post = await posts.getBySlug(slug!);
    if (!post) return ok({ deleted: commentKey });
    await comments.removeAs(user(e), post.postId, commentKey!);
    return ok({ deleted: commentKey });
  },

  'POST /posts/{slug}/report': async (e, { slug }) => {
    const u = user(e);
    const reporter = await activeProfile(u);
    const { reason, details } = parseBody(e, reportInputSchema);
    const post = await posts.getLiveBySlug(slug!);
    if (env.alertsTopicArn) {
      await sns.send(
        new PublishCommand({
          TopicArn: env.alertsTopicArn,
          Subject: `Report (${reason}): ${post.title}`.replace(/[^\x20-\x7E]/g, '').slice(0, 99),
          Message: [
            `@${reporter.handle} reported a post as "${reason}".`,
            '',
            `Post:   ${post.title}`,
            `Author: ${post.author} (@${post.authorHandle})`,
            `Link:   ${env.siteUrl}/posts/${post.slug}`,
            '',
            details ? `Details: ${details}` : 'No details given.',
            '',
            `Moderate: ${env.siteUrl}/studio/admin/posts`,
          ].join('\n'),
        }),
      );
    }
    return ok({ status: 'received' }, 202);
  },
});
