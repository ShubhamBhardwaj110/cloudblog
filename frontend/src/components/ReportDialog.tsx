import { useRef, useState } from 'react';
import { errorMessage, type ReportReason } from '../lib/api';
import { useSession } from '../lib/session';
import { Flag } from './Icons';
import { Spinner, useToast } from './ui';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'abuse', label: 'Harassment or hate' },
  { value: 'illegal', label: 'Illegal or dangerous content' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'other', label: 'Something else' },
];

export default function ReportButton({ slug }: { slug: string }) {
  const { isSignedIn, api, signIn } = useSession();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const open = () => (isSignedIn ? dialog.current?.showModal() : void signIn());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api!.report(slug, reason, details);
      dialog.current?.close();
      setDetails('');
      toast('Thanks. The moderators have been notified.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="icon-btn" onClick={open} aria-label="Report this post" title="Report"><Flag /></button>
      <dialog ref={dialog} className="modal" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <form onSubmit={submit}>
          <h2>Report this post</h2>
          <div className="radio-list" role="radiogroup">
            {REASONS.map((r) => (
              <label key={r.value}>
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                {r.label}
              </label>
            ))}
          </div>
          <div className="field">
            <label htmlFor="r-details">Details (optional)</label>
            <textarea id="r-details" className="textarea" style={{ minHeight: 80 }} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Send report'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
