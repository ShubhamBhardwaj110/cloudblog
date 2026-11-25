import { z } from 'zod';
import { slugify } from './text.js';

export const POST_STATUSES = ['draft', 'published', 'scheduled'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Author details copied onto each post so listings never need a join. */
export interface AuthorRef {
  authorId: string; // Cognito sub
  author: string; // display name
  authorHandle: string;
  authorAvatar?: string;
}

export interface Post extends AuthorRef {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string; // markdown
  coverImage?: string;
  coverAlt?: string;
  category: string;
  tags: string[];
  status: PostStatus;
  /** Set for published/scheduled posts only, so drafts stay out of the status index. */
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
  featured: boolean;
}

export type PostSummary = Omit<Post, 'content'>;

export const SUMMARY_FIELDS = [
  'postId', 'slug', 'title', 'excerpt', 'coverImage', 'coverAlt', 'category', 'tags',
  'authorId', 'author', 'authorHandle', 'authorAvatar',
  'status', 'publishedAt', 'createdAt', 'updatedAt', 'readingMinutes', 'featured',
] as const satisfies readonly (keyof PostSummary)[];

export interface Comment {
  postId: string;
  /** Sort key: `${createdAt}#${commentId}` keeps comments chronological per post. */
  commentKey: string;
  commentId: string;
  authorId: string;
  author: string;
  authorHandle?: string;
  authorAvatar?: string;
  content: string;
  /** Constant partition for the "recent comments" index used by admins. */
  status: 'visible';
  createdAt: string;
  postSlug: string;
  postTitle: string;
  postAuthorId: string;
}

export const publicComment = (c: Comment) => ({
  commentId: c.commentId,
  commentKey: c.commentKey,
  authorId: c.authorId,
  author: c.author,
  authorHandle: c.authorHandle,
  authorAvatar: c.authorAvatar,
  content: c.content,
  createdAt: c.createdAt,
});

export interface Profile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  website?: string;
  status: 'active' | 'suspended';
  /** False until the user has confirmed their handle and name once. */
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export const publicProfile = (p: Profile) => ({
  userId: p.userId,
  handle: p.handle,
  displayName: p.displayName,
  bio: p.bio,
  avatarUrl: p.avatarUrl,
  website: p.website,
  createdAt: p.createdAt,
});

export const toAuthorRef = (p: Profile): AuthorRef => ({
  authorId: p.userId,
  author: p.displayName,
  authorHandle: p.handle,
  authorAvatar: p.avatarUrl,
});

// ---------- Input validation ----------

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const httpsUrl = z.string().trim().max(1000).refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Must be an https:// URL');

export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'api', 'about', 'auth', 'blog', 'help', 'login', 'logout', 'me', 'media', 'moderator',
  'new', 'posts', 'root', 'rss', 'settings', 'signup', 'sitemap', 'staff', 'studio', 'support', 'system', 'write',
]);

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])?$/, '3–24 characters: letters, numbers and underscores')
  .refine((h) => !RESERVED_HANDLES.has(h), 'That handle is reserved');

export const profileInputSchema = z.object({
  handle: handleSchema,
  displayName: trimmed(1, 60),
  bio: z.string().trim().max(280).default(''),
  avatarUrl: httpsUrl.optional(),
  website: httpsUrl.optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const postInputSchema = z
  .object({
    title: trimmed(1, 200),
    slug: z.string().trim().max(80).optional(),
    excerpt: z.string().trim().max(300).optional(),
    content: z.string().min(1).max(100_000),
    coverImage: httpsUrl.optional(),
    coverAlt: z.string().trim().max(200).optional(),
    category: trimmed(1, 40).default('General'),
    tags: z
      .array(z.string().trim().max(30))
      .max(10)
      .default([])
      .transform((tags) => [...new Set(tags.filter(Boolean).map(slugify))]),
    status: z.enum(POST_STATUSES).default('draft'),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    featured: z.boolean().default(false),
  })
  .refine((p) => p.status !== 'scheduled' || !!p.publishedAt, {
    message: 'publishedAt is required when scheduling a post',
    path: ['publishedAt'],
  });
export type PostInput = z.infer<typeof postInputSchema>;

export const commentInputSchema = z.object({
  content: trimmed(2, 2000),
});

export const reportInputSchema = z.object({
  reason: z.enum(['spam', 'abuse', 'illegal', 'copyright', 'other']),
  details: z.string().trim().max(1000).default(''),
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const uploadRequestSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Images must be 5 MB or smaller'),
});

export const EXTENSIONS: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
