import * as comments from '../lib/comments.js';
import { json, notFound, router } from '../lib/http.js';
import { publicComment, publicProfile } from '../lib/models.js';
import * as posts from '../lib/posts.js';
import * as profiles from '../lib/profiles.js';
import * as views from '../lib/views.js';

/** Short browser cache: posts change rarely, and this keeps API calls (and cost) down. */
const CACHE_SHORT = { 'cache-control': 'public, max-age=60' };
const NO_STORE = { 'cache-control': 'no-store' };

/** Anonymous, read-only API (plus the view counter). Everything that writes needs a login. */
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
    const list = await comments.listForPost(post.postId);
    return json(200, { comments: list.map(publicComment), postAuthorId: post.authorId }, { 'cache-control': 'public, max-age=15' });
  },

  'GET /authors/{handle}': async (_event, { handle }) => {
    const profile = await profiles.getByHandle(handle!);
    if (!profile || profile.status === 'suspended') throw notFound('Author');
    const now = new Date();
    const live = (await posts.listByAuthor(profile.userId))
      .filter((p) => posts.isLive(p, now))
      .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
    return json(200, { profile: publicProfile(profile), posts: live }, CACHE_SHORT);
  },
});
