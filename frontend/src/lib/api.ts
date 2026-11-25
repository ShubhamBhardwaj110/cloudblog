import { config } from './config';

export type PostStatus = 'draft' | 'published' | 'scheduled';

export interface PostSummary {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  coverAlt?: string;
  category: string;
  tags: string[];
  author: string;
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
  author: string;
  content: string;
  createdAt: string;
}

export interface AdminComment extends PublicComment {
  postId: string;
  commentKey: string;
  status: 'pending' | 'approved';
  postSlug: string;
  postTitle: string;
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
  author: string;
  status: PostStatus;
  publishedAt?: string;
  featured: boolean;
}

export interface Stats {
  posts: Record<PostStatus, number>;
  totalPosts: number;
  totalViews: number;
  pendingComments: number;
  topPosts: { postId: string; title: string; slug: string; views: number }[];
}

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

// ---- Public ----
export const publicApi = {
  posts: (signal?: AbortSignal) => request<{ posts: PostSummary[] }>('/posts', { signal }).then((r) => r.posts),
  post: (slug: string, signal?: AbortSignal) =>
    request<{ post: Post & { views: number } }>(`/posts/${enc(slug)}`, { signal }).then((r) => r.post),
  view: (slug: string) => request<{ views: number }>(`/posts/${enc(slug)}/views`, { method: 'POST' }),
  comments: (slug: string, signal?: AbortSignal) =>
    request<{ comments: PublicComment[] }>(`/posts/${enc(slug)}/comments`, { signal }).then((r) => r.comments),
  addComment: (slug: string, body: { author: string; content: string; website?: string }) =>
    request<{ status: 'pending' }>(`/posts/${enc(slug)}/comments`, { method: 'POST', body }),
};

// ---- Admin (needs a Cognito access token) ----
export function adminApi(token: string) {
  const r = <T,>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, token });
  return {
    stats: () => r<Stats>('/admin/stats'),
    posts: () => r<{ posts: PostSummary[] }>('/admin/posts').then((x) => x.posts),
    post: (id: string) => r<{ post: Post }>(`/admin/posts/${enc(id)}`).then((x) => x.post),
    create: (body: PostInput) => r<{ post: Post }>('/admin/posts', { method: 'POST', body }).then((x) => x.post),
    update: (id: string, body: PostInput) =>
      r<{ post: Post }>(`/admin/posts/${enc(id)}`, { method: 'PUT', body }).then((x) => x.post),
    remove: (id: string) => r(`/admin/posts/${enc(id)}`, { method: 'DELETE' }),
    comments: (status: 'pending' | 'approved') =>
      r<{ comments: AdminComment[] }>(`/admin/comments?status=${status}`).then((x) => x.comments),
    moderate: (c: AdminComment, status: 'pending' | 'approved') =>
      r(`/admin/comments/${enc(c.postId)}/${enc(c.commentKey)}`, { method: 'PATCH', body: { status } }),
    removeComment: (c: AdminComment) =>
      r(`/admin/comments/${enc(c.postId)}/${enc(c.commentKey)}`, { method: 'DELETE' }),
    rebuild: () => r('/admin/rebuild', { method: 'POST' }),
    upload: async (file: File): Promise<string> => {
      const { url, fields, publicUrl } = await r<{ url: string; fields: Record<string, string>; publicUrl: string }>(
        '/admin/uploads',
        { method: 'POST', body: { contentType: file.type, size: file.size } },
      );
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', file); // must be last for S3 POST policies
      const res = await fetch(url, { method: 'POST', body: form });
      if (!res.ok) throw new ApiError(res.status, 'Upload to S3 failed');
      return publicUrl;
    },
  };
}
