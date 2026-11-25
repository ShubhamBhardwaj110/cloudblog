import { randomUUID } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import * as comments from '../lib/comments.js';
import { env } from '../lib/env.js';
import { type ApiEvent, HttpError, json, notFound, parseBody, query, router } from '../lib/http.js';
import {
  type CommentStatus,
  commentModerationSchema,
  EXTENSIONS,
  MAX_UPLOAD_BYTES,
  postInputSchema,
  uploadRequestSchema,
} from '../lib/models.js';
import * as posts from '../lib/posts.js';
import * as views from '../lib/views.js';

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const NO_STORE = { 'cache-control': 'no-store' };

/**
 * API Gateway's JWT authorizer has already verified the token signature,
 * issuer, audience and expiry. We additionally require the admins group,
 * so a future non-admin user in the pool can't reach these routes.
 */
function requireAdmin(event: ApiEvent): void {
  const claims = (event as APIGatewayProxyEventV2WithJWTAuthorizer).requestContext.authorizer?.jwt?.claims ?? {};
  const raw = claims['cognito:groups'];
  const groups = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').replace(/^\[|\]$/g, '').split(/[\s,]+/);
  if (!groups.includes(env.adminGroup)) throw new HttpError(403, 'Admin access required');
}

const ok = (body: unknown, status = 200) => json(status, body, NO_STORE);

const routes = router({
  'GET /admin/stats': async () => {
    const [all, viewMap, pending] = await Promise.all([posts.listAll(), views.all(), comments.countByStatus('pending')]);
    const byStatus = { draft: 0, published: 0, scheduled: 0 };
    for (const p of all) byStatus[p.status]++;
    const top = all
      .filter((p) => p.status === 'published')
      .map((p) => ({ postId: p.postId, title: p.title, slug: p.slug, views: viewMap.get(p.postId) ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    const totalViews = [...viewMap.values()].reduce((a, b) => a + b, 0);
    return ok({ posts: byStatus, totalPosts: all.length, totalViews, pendingComments: pending, topPosts: top });
  },

  'GET /admin/posts': async () => {
    const [all, viewMap] = await Promise.all([posts.listAll(), views.all()]);
    return ok({ posts: all.map((p) => ({ ...p, views: viewMap.get(p.postId) ?? 0 })) });
  },

  'GET /admin/posts/{postId}': async (_e, { postId }) => {
    const post = await posts.getById(postId!);
    if (!post) throw notFound('Post');
    return ok({ post });
  },

  'POST /admin/posts': async (event) => ok({ post: await posts.create(parseBody(event, postInputSchema)) }, 201),

  'PUT /admin/posts/{postId}': async (event, { postId }) =>
    ok({ post: await posts.update(postId!, parseBody(event, postInputSchema)) }),

  // Comments, view counts and the static page are cleaned up by the publisher's stream handler.
  'DELETE /admin/posts/{postId}': async (_e, { postId }) => {
    await posts.remove(postId!);
    return ok({ deleted: postId });
  },

  'GET /admin/comments': async (event) => {
    const status = (query(event, 'status') ?? 'pending') as CommentStatus;
    if (status !== 'pending' && status !== 'approved') throw new HttpError(400, 'status must be pending or approved');
    return ok({ comments: await comments.listByStatus(status) });
  },

  'PATCH /admin/comments/{postId}/{commentKey}': async (event, { postId, commentKey }) => {
    const { status } = parseBody(event, commentModerationSchema);
    return ok({ comment: await comments.setStatus(postId!, commentKey!, status) });
  },

  'DELETE /admin/comments/{postId}/{commentKey}': async (_e, { postId, commentKey }) => {
    await comments.remove(postId!, commentKey!);
    return ok({ deleted: commentKey });
  },

  /**
   * Browser uploads straight to S3 with a short-lived presigned POST.
   * S3 itself enforces the size limit and content type, so the Lambda
   * never handles image bytes (no payload limits, no extra cost).
   */
  'POST /admin/uploads': async (event) => {
    const { contentType } = parseBody(event, uploadRequestSchema);
    const now = new Date();
    const key = `media/images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXTENSIONS[contentType]}`;
    const { url, fields } = await createPresignedPost(s3, {
      Bucket: env.mediaBucket,
      Key: key,
      Conditions: [['content-length-range', 1, MAX_UPLOAD_BYTES]],
      Fields: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
      Expires: 300,
    });
    return ok({ url, fields, publicUrl: `${env.mediaBaseUrl}/${key}` });
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
    requireAdmin(event);
  } catch (err) {
    return json((err as HttpError).status ?? 403, { error: (err as Error).message });
  }
  return routes(event);
};
