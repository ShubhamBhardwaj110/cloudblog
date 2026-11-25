import { config } from './config';

export type PostStatus = 'draft' | 'published' | 'scheduled';

export interface AuthorRef {
  authorId: string;
  author: string;
  authorHandle: string;
  authorAvatar?: string;
}

export interface PostSummary extends AuthorRef {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  coverAlt?: string;
  category: string;
  tags: string[];
  status: PostStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
  featured: boolean;
  views?: number;
}

export interface Post extends PostSummary {
  content: string;
}

export interface PublicComment {
  commentId: string;
  commentKey: string;
  authorId: string;
  author: string;
  authorHandle?: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface AdminComment extends PublicComment {
  postId: string;
  postSlug: string;
  postTitle: string;
}

export interface PublicProfile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  website?: string;
  createdAt: string;
}

export interface Profile extends PublicProfile {
  status: 'active' | 'suspended';
  onboarded: boolean;
  updatedAt: string;
}

export interface Me {
  profile: Profile;
  email: string;
  isAdmin: boolean;
  dailyPostLimit: number;
}

export interface ProfileInput {
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  website?: string;
}

export interface PostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  coverAlt?: string;
  category: string;
  tags: string[];
  status: PostStatus;
  publishedAt?: string;
  featured: boolean;
}

export interface MyStats {
  posts: Record<PostStatus, number>;
  totalPosts: number;
  totalViews: number;
  topPosts: { postId: string; title: string; slug: string; views: number }[];
}

export interface SiteStats extends MyStats {
  users: number;
  newUsersThisWeek: number;
  suspendedUsers: number;
  topPosts: { postId: string; title: string; slug: string; author: string; views: number }[];
}

export interface AdminUser extends Profile {
  postCount: number;
}

export type ReportReason = 'spam' | 'abuse' | 'illegal' | 'copyright' | 'other';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

export async function request<T>(path: string, { method = 'GET', body, token, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${config().apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? data?.message ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

const enc = encodeURIComponent;

/** Turns a validation error into one readable line. */
export function errorMessage(e: unknown): string {
  const err = e as ApiError;
  return err?.details?.length ? `${err.details[0]!.field}: ${err.details[0]!.message}` : (err?.message ?? 'Something went wrong');
}

// ---- Anonymous ----
export const publicApi = {
  posts: (signal?: AbortSignal) => request<{ posts: PostSummary[] }>('/posts', { signal }).then((r) => r.posts),
  post: (slug: string, signal?: AbortSignal) =>
    request<{ post: Post & { views: number } }>(`/posts/${enc(slug)}`, { signal }).then((r) => r.post),
  view: (slug: string) => request<{ views: number }>(`/posts/${enc(slug)}/views`, { method: 'POST' }),
  comments: (slug: string, signal?: AbortSignal) =>
    request<{ comments: PublicComment[]; postAuthorId: string }>(`/posts/${enc(slug)}/comments`, { signal }),
  author: (handle: string, signal?: AbortSignal) =>
    request<{ profile: PublicProfile; posts: PostSummary[] }>(`/authors/${enc(handle)}`, { signal }),
};

// ---- Any signed-in user (Cognito ID token) ----
export function userApi(token: string) {
  const r = <T,>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, token });
  return {
    me: () => r<Me>('/me'),
    updateMe: (body: ProfileInput) => r<{ profile: Profile }>('/me', { method: 'PUT', body }).then((x) => x.profile),
    stats: () => r<MyStats>('/me/stats'),
    posts: () => r<{ posts: PostSummary[] }>('/me/posts').then((x) => x.posts),
    post: (id: string) => r<{ post: Post }>(`/me/posts/${enc(id)}`).then((x) => x.post),
    create: (body: PostInput) => r<{ post: Post }>('/me/posts', { method: 'POST', body }).then((x) => x.post),
    update: (id: string, body: PostInput) => r<{ post: Post }>(`/me/posts/${enc(id)}`, { method: 'PUT', body }).then((x) => x.post),
    remove: (id: string) => r(`/me/posts/${enc(id)}`, { method: 'DELETE' }),
    comment: (slug: string, content: string) =>
      r<{ comment: PublicComment }>(`/posts/${enc(slug)}/comments`, { method: 'POST', body: { content } }).then((x) => x.comment),
    deleteComment: (slug: string, commentKey: string) => r(`/posts/${enc(slug)}/comments/${enc(commentKey)}`, { method: 'DELETE' }),
    report: (slug: string, reason: ReportReason, details: string) =>
      r(`/posts/${enc(slug)}/report`, { method: 'POST', body: { reason, details } }),
    upload: async (file: File): Promise<string> => {
      const { url, fields, publicUrl } = await r<{ url: string; fields: Record<string, string>; publicUrl: string }>('/me/uploads', {
        method: 'POST',
        body: { contentType: file.type, size: file.size },
      });
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', file); // must be last for S3 POST policies
      const res = await fetch(url, { method: 'POST', body: form });
      if (!res.ok) throw new ApiError(res.status, 'Upload to S3 failed');
      return publicUrl;
    },
  };
}

// ---- Admins only ----
export function adminApi(token: string) {
  const r = <T,>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, token });
  return {
    stats: () => r<SiteStats>('/admin/stats'),
    posts: () => r<{ posts: PostSummary[] }>('/admin/posts').then((x) => x.posts),
    unpublish: (id: string) => r(`/admin/posts/${enc(id)}/unpublish`, { method: 'POST' }),
    remove: (id: string) => r(`/admin/posts/${enc(id)}`, { method: 'DELETE' }),
    comments: () => r<{ comments: AdminComment[] }>('/admin/comments').then((x) => x.comments),
    users: () => r<{ users: AdminUser[] }>('/admin/users').then((x) => x.users),
    suspend: (userId: string) => r<{ unpublished: number }>(`/admin/users/${enc(userId)}/suspend`, { method: 'POST' }),
    unsuspend: (userId: string) => r(`/admin/users/${enc(userId)}/unsuspend`, { method: 'POST' }),
    rebuild: () => r('/admin/rebuild', { method: 'POST' }),
  };
}
