import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { registerEmailReview } from '../helpers/emailReview';

export default function EmailReviewDialog() {
  const [draft, setDraft] = useState(null);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const unregister = registerEmailReview(value => new Promise(resolve => {
      resolver.current = resolve;
      setSubject(value.subject); setText(value.text); setDraft(value);
    }));
    const error = event => toast.error(`Action saved. Email was not confirmed as sent: ${event.detail}. Open Email Control to review.`);
    const result = event => { if (event.detail === 'sent') toast.success('Email sent'); };
    window.addEventListener('email-review-error', error);
    window.addEventListener('email-review-result', result);
    return () => { unregister(); window.removeEventListener('email-review-error', error); window.removeEventListener('email-review-result', result); resolver.current?.({ choice: 'skip' }); };
  }, []);
  useEffect(() => {
    if (draft) dialogRef.current?.showModal();
  }, [draft]);
  const finish = choice => {
    resolver.current?.({ choice, subject, text }); resolver.current = null;
    dialogRef.current?.close(); setDraft(null);
  };
  if (!draft) return null;
  return createPortal(
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); finish('skip'); }} aria-labelledby="email-review-title" className="w-[min(680px,95vw)] max-h-[90vh] overflow-auto rounded-2xl p-6 shadow-xl backdrop:bg-black/50">
      <h2 id="email-review-title" className="text-xl font-bold">Review email</h2>
      <p className="my-2 text-sm text-slate-600">{draft.description}</p>
      <p className="my-3 text-sm"><strong>To:</strong> {(draft.to || []).join(', ')}</p>
      {!!draft.attachments?.length && <p className="text-sm">Attachments: {draft.attachments.map(a => a.filename).join(', ')}</p>}
      <label htmlFor="email-review-subject" className="mt-4 block">Subject</label>
      <input id="email-review-subject" autoFocus maxLength={300} className="mt-1 w-full rounded border p-2" value={subject} onChange={e => setSubject(e.target.value)} />
      <label htmlFor="email-review-message" className="mt-4 block">Message</label>
      <textarea id="email-review-message" rows={13} maxLength={100000} className="mt-1 w-full rounded border p-2" value={text} onChange={e => setText(e.target.value)} />
      <p className="my-3 text-xs text-slate-500">Edits apply to this email only. Change reusable templates in Email Control.</p>
      <div className="flex justify-end gap-3">
        <button type="button" className="rounded border px-4 py-2" onClick={() => finish('skip')}>Don’t Send Mail</button>
        <button type="button" disabled={!subject.trim() || !text.trim()} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => finish('send')}>Send Mail</button>
      </div>
    </dialog>, document.body,
  );
}
