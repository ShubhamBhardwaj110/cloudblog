import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import * as comments from '../lib/comments.js';
import { env } from '../lib/env.js';
import { json, parseBody, router } from '../lib/http.js';
import { commentInputSchema, type Comment, publicComment } from '../lib/models.js';
import * as posts from '../lib/posts.js';
import * as views from '../lib/views.js';

const sns = new SNSClient({});

/** Short browser cache: posts change rarely, and this keeps API calls (and cost) down. */
const CACHE_SHORT = { 'cache-control': 'public, max-age=60' };
const NO_STORE = { 'cache-control': 'no-store' };

async function notifyNewComment(comment: Comment): Promise<void> {
  if (!env.alertsTopicArn) return;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: env.alertsTopicArn,
        Subject: `New comment awaiting approval: ${comment.postTitle}`.replace(/[^\x20-\x7E]/g, '').slice(0, 99),
        Message: [
          `${comment.author} commented on "${comment.postTitle}":`,
          '',
          comment.content,
          '',
          `Approve or delete it: ${env.siteUrl}/admin/comments`,
        ].join('\n'),
      }),
    );
  } catch (err) {
    // A failed notification must never lose the reader's comment.
    console.error(JSON.stringify({ level: 'error', msg: 'SNS publish failed', error: (err as Error).message }));
  }
}

export const handler = router({
  'GET /posts': async () => json(200, { posts: await posts.listPublished() }, CACHE_SHORT),

  'GET /posts/{slug}': async (_event, { slug }) => {
    const post = await posts.getLiveBySlug(slug!);
    return json(200, { post: { ...post, views: await views.get(post.postId) } }, CACHE_SHORT);
  },

  'POST /posts/{slug}/views': async (_event, { slug }) => {
    const post = await posts.getLiveBySlug(slug!);
    return json(200, { views: await views.increment(post.postId) }, NO_STORE);
  },

  'GET /posts/{slug}/comments': async (_event, { slug }) => {
    const post = await posts.getLiveBySlug(slug!);
    const list = await comments.listApproved(post.postId);
    return json(200, { comments: list.map(publicComment) }, CACHE_SHORT);
  },

  'POST /posts/{slug}/comments': async (event, { slug }) => {
    const input = parseBody(event, commentInputSchema);
    // Honeypot tripped: pretend success so bots don't learn to adapt.
    if (input.website) return json(202, { status: 'pending' }, NO_STORE);

    const post = await posts.getLiveBySlug(slug!);
    const comment = await comments.create(post, input.author, input.content);
    await notifyNewComment(comment);
    return json(202, { status: 'pending', comment: publicComment(comment) }, NO_STORE);
  },
});
