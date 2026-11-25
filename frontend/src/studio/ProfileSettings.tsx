import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ImageIcon, Trash } from '../components/Icons';
import { Avatar, Spinner, usePageMeta, useToast } from '../components/ui';
import { errorMessage, type ProfileInput } from '../lib/api';
import { useSession } from '../lib/session';
import { useInvalidate } from './hooks';

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])?$/;

export default function ProfileSettings() {
  const { me, api } = useSession();
  const toast = useToast();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const p = me!.profile;
  const [form, setForm] = useState<ProfileInput>({ handle: p.handle, displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl ?? '', website: p.website ?? '' });
  const [uploading, setUploading] = useState(false);
  usePageMeta('Your profile');

  useEffect(() => {
    setForm({ handle: p.handle, displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl ?? '', website: p.website ?? '' });
  }, [p]);

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const handleOk = HANDLE_RE.test(form.handle);
  const firstTime = !p.onboarded;

  const save = useMutation({
    mutationFn: () => api!.updateMe({ ...form, handle: form.handle.toLowerCase() }),
    onSuccess: () => {
      invalidate();
      toast('Profile saved');
      if (firstTime) navigate('/studio/new');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      set('avatarUrl', await api!.upload(file));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (handleOk) save.mutate();
  };

  return (
    <>
      <div className="admin-head">
        <h1>{firstTime ? 'Set up your profile' : 'Your profile'}</h1>
        {!firstTime && <Link to={`/@${p.handle}`} className="btn btn-sm">View public page</Link>}
      </div>

      <form className="panel profile-form" onSubmit={onSubmit}>
        <div className="panel-body">
          <div className="avatar-row">
            {uploading ? <div className="avatar" style={{ width: 88, height: 88, display: 'grid', placeItems: 'center', background: 'var(--bg-sunken)' }}><Spinner /></div> : <Avatar name={form.displayName || '?'} src={form.avatarUrl || undefined} size={88} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><ImageIcon size={15} /> Upload photo</button>
              {form.avatarUrl && <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => set('avatarUrl', '')}><Trash size={15} /> Remove</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} maxLength={60} required />
          </div>

          <div className="field">
            <label htmlFor="handle">Handle</label>
            <div className="input-prefix">
              <span>@</span>
              <input id="handle" className="input" value={form.handle} onChange={(e) => set('handle', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={24} required />
            </div>
            {handleOk ? (
              <span className="hint">Your page: {window.location.origin}/@{form.handle}</span>
            ) : (
              <span className="field-error">3–24 characters: letters, numbers and underscores (not at the start or end)</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" className="textarea" style={{ minHeight: 90 }} value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={280} placeholder="A line or two about you and what you write about." />
            <span className="hint">{form.bio.length}/280</span>
          </div>

          <div className="field">
            <label htmlFor="website">Website</label>
            <input id="website" className="input" type="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" pattern="https://.*" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={save.isPending || !handleOk}>
              {save.isPending ? <Spinner /> : firstTime ? 'Save and start writing' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
