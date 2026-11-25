import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { ArrowLeft, External, ImageIcon, Trash } from '../components/Icons';
import { Spinner, usePageMeta, useToast } from '../components/ui';
import { errorMessage, type Post, type PostInput, type PostStatus } from '../lib/api';
import { formatDateTime, fromLocalInput, toLocalInput } from '../lib/format';
import MarkdownEditor from './MarkdownEditor';
import { useSession } from '../lib/session';
import { useInvalidate } from './hooks';
import { StatusPill } from './MyPosts';

const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const empty = (): PostInput => ({
  title: '', slug: '', excerpt: '', content: '', coverImage: '', coverAlt: '',
  category: 'General', tags: [], status: 'draft', publishedAt: undefined, featured: false,
});

const fromPost = (p: Post): PostInput => ({
  title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, coverImage: p.coverImage ?? '', coverAlt: p.coverAlt ?? '',
  category: p.category, tags: p.tags, status: p.status, publishedAt: p.publishedAt, featured: p.featured,
});

function TagInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = slugify(draft);
    if (t && !value.includes(t) && value.length < 10) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag-token">#{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length ? '' : 'aws, serverless…'}
        aria-label="Add tag"
      />
    </div>
  );
}

export default function Editor() {
  const { postId } = useParams();
  const isNew = !postId;
  const { api: maybeApi, me, isAdmin } = useSession();
  const api = maybeApi!;
  const toast = useToast();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const coverInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<PostInput>(empty);
  const [baseline, setBaseline] = useState(() => JSON.stringify(empty()));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saved, setSaved] = useState<Post>();
  const [coverUploading, setCoverUploading] = useState(false);

  const { data: existing, isPending: loading, error: loadError } = useQuery({
    queryKey: ['studio', 'post', postId],
    queryFn: () => api.post(postId!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      const f = fromPost(existing);
      setForm(f);
      setBaseline(JSON.stringify(f));
      setSaved(existing);
    }
  }, [existing]);

  usePageMeta(form.title ? `Editing: ${form.title}` : 'New post');
  const dirty = JSON.stringify(form) !== baseline;

  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value));
      return next;
    });

  const save = useMutation({
    mutationFn: (input: PostInput) => (isNew ? api.create(input) : api.update(postId!, input)),
    onSuccess: (post) => {
      const f = fromPost(post);
      setForm(f);
      setBaseline(JSON.stringify(f));
      setSaved(post);
      invalidate();
      toast(post.status === 'published' ? 'Published. The static page will be live in a few seconds.' : post.status === 'scheduled' ? `Scheduled for ${formatDateTime(post.publishedAt)}` : 'Draft saved');
      if (isNew) navigate(`/studio/posts/${post.postId}`, { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const submit = (status: PostStatus = form.status) => {
    if (!form.title.trim()) return toast('Give your post a title first', 'error');
    if (!form.content.trim()) return toast('Write something before saving', 'error');
    if (status === 'scheduled' && !form.publishedAt) return toast('Pick a date and time to schedule for', 'error');
    // Switching a scheduled post to "published" means "publish now", not "keep the future date".
    const futureDate = !!form.publishedAt && new Date(form.publishedAt) > new Date();
    const publishedAt = status === 'draft' || (status === 'published' && futureDate) ? undefined : form.publishedAt;
    save.mutate({ ...form, status, publishedAt });
  };

  // Ctrl/Cmd+S saves.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); submitRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Guard against losing unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !save.isPending && currentLocation.pathname !== nextLocation.pathname && !(isNew && nextLocation.pathname.startsWith('/studio/posts/')));
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm('You have unsaved changes. Leave anyway?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  const uploadCover = async (file?: File) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      set('coverImage', await api.upload(file));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCoverUploading(false);
    }
  };

  if (!isNew && loading) return <Spinner label="Loading post" />;
  if (me?.profile.status === 'suspended') return <div className="alert alert-error">Suspended accounts can’t write or edit posts.</div>;
  if (loadError) return <div className="alert alert-error">{(loadError as Error).message}</div>;

  const live = saved?.status === 'published';
  const primaryLabel = form.status === 'published' ? (live ? 'Update' : 'Publish') : form.status === 'scheduled' ? 'Schedule' : 'Save draft';

  return (
    <>
      <div className="admin-head">
        <Link to="/studio/posts" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> My posts</Link>
        <div className="actions" style={{ alignItems: 'center' }}>
          <span className="hint">{dirty ? <><span className="dirty-dot" />Unsaved changes</> : saved ? `Saved ${formatDateTime(saved.updatedAt)}` : ''}</span>
          {live && <a className="btn btn-sm" href={`/posts/${saved.slug}`} target="_blank" rel="noopener"><External size={15} /> View</a>}
          <button className="btn btn-primary" onClick={() => submit()} disabled={save.isPending} title="Ctrl+S">
            {save.isPending ? <Spinner /> : primaryLabel}
          </button>
        </div>
      </div>

      {saved && me && saved.authorId !== me.profile.userId && (
        <div className="alert" style={{ marginBottom: 16, background: 'var(--info-soft)', color: 'var(--info)', borderColor: 'transparent' }}>
          You’re editing <strong>@{saved.authorHandle}</strong>’s post as an admin. It stays under their name.
        </div>
      )}
      <div className="editor">
        <div>
          <textarea
            className="editor-title"
            rows={1}
            placeholder="Post title"
            value={form.title}
            onChange={(e) => { set('title', e.target.value.replace(/\n/g, '')); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
            maxLength={200}
            aria-label="Title"
          />
          <MarkdownEditor value={form.content} onChange={(v) => set('content', v)} onUpload={(f) => api.upload(f)} onError={(m) => toast(m, 'error')} />
        </div>

        <div className="side-panel">
          <div className="panel">
            <div className="panel-head"><h2>Publishing</h2>{saved && <StatusPill post={saved} />}</div>
            <div className="panel-body">
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" className="select" value={form.status} onChange={(e) => set('status', e.target.value as PostStatus)}>
                  <option value="draft">Draft: only you can see it</option>
                  <option value="published">Published: live now</option>
                  <option value="scheduled">Scheduled: goes live later</option>
                </select>
              </div>
              {form.status === 'scheduled' && (
                <div className="field">
                  <label htmlFor="when">Publish at</label>
                  <input id="when" type="datetime-local" className="input" value={toLocalInput(form.publishedAt)} min={toLocalInput(new Date().toISOString())} onChange={(e) => set('publishedAt', fromLocalInput(e.target.value))} />
                  <span className="hint">Checked every 5 minutes.</span>
                </div>
              )}
              {form.status === 'published' && saved?.publishedAt && <span className="hint">First published {formatDateTime(saved.publishedAt)}</span>}
              {isAdmin && (
                <label className="switch">
                  <span>Feature on the home page <span className="hint">(admin)</span></span>
                  <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
                </label>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Cover image</h2></div>
            <div className="panel-body">
              <div className="cover-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void uploadCover(e.dataTransfer.files[0]); }}>
                {coverUploading ? (
                  <Spinner label="Uploading" />
                ) : form.coverImage ? (
                  <>
                    <img src={form.coverImage} alt="" />
                    <button type="button" className="btn btn-sm remove" onClick={() => set('coverImage', '')} aria-label="Remove cover"><Trash size={14} /></button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => coverInput.current?.click()}>
                    <ImageIcon size={16} /> Upload or drop an image
                  </button>
                )}
              </div>
              <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="field">
                <label htmlFor="alt">Alt text / caption</label>
                <input id="alt" className="input" value={form.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} maxLength={200} placeholder="Describe the image" />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Details</h2></div>
            <div className="panel-body">
              <div className="field">
                <label htmlFor="slug">URL</label>
                <input id="slug" className="input" value={form.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} placeholder="auto-from-title" />
                <span className="hint">/posts/{form.slug || slugify(form.title) || '…'}</span>
              </div>
              <div className="field">
                <label htmlFor="excerpt">Excerpt</label>
                <textarea id="excerpt" className="textarea" style={{ minHeight: 80 }} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={300} placeholder="Shown on cards and in search results. Leave blank to generate one." />
              </div>
              <div className="field">
                <label htmlFor="category">Category</label>
                <input id="category" className="input" value={form.category} onChange={(e) => set('category', e.target.value)} maxLength={40} />
              </div>
              <div className="field">
                <span className="label">Tags</span>
                <TagInput value={form.tags} onChange={(t) => set('tags', t)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
