import { z } from 'zod';
import { slugify } from './text.js';

export const POST_STATUSES = ['draft', 'published', 'scheduled'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export interface Post {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string; // markdown
  coverImage?: string;
  coverAlt?: string;
  category: string;
  tags: string[];
  author: string;
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
  'author', 'status', 'publishedAt', 'createdAt', 'updatedAt', 'readingMinutes', 'featured',
] as const satisfies readonly (keyof PostSummary)[];

export type CommentStatus = 'pending' | 'approved';

export interface Comment {
  postId: string;
  /** Sort key: `${createdAt}#${commentId}` keeps comments chronological per post. */
  commentKey: string;
  commentId: string;
  author: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  postSlug: string;
  postTitle: string;
}

/** Public shape: no moderation internals. */
export const publicComment = (c: Comment) => ({
  commentId: c.commentId,
  author: c.author,
  content: c.content,
  createdAt: c.createdAt,
});

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const httpsUrl = z.string().trim().max(1000).refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Must be an https:// URL');

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
    author: trimmed(1, 80),
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
  author: trimmed(1, 60),
  content: trimmed(2, 2000),
  /** Honeypot: hidden in the UI, so humans leave it empty and bots fill it in. */
  website: z.string().optional(),
});

export const commentModerationSchema = z.object({
  status: z.enum(['approved', 'pending']),
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
