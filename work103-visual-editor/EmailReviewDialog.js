import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { emailApi, registerEmailReview } from '../helpers/emailReview';
import EmailTextEditor, { EmailPreview } from './EmailTextEditor';

const optionLabel = option => (option.system && option.id ? `${option.name} (built-in)` : option.name);

export default function EmailReviewDialog() {
  const [draft, setDraft] = useState(null);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('current');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const unregister = registerEmailReview(value => new Promise(resolve => {
      resolver.current = resolve;
      setSubject(value.subject); setText(value.text); setTemplateId('current'); setHtml(value.html || ''); setPreviewError(''); setDraft(value);
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
  // Template choice and preview need a saved draft; only admins receive templateOptions.
  const options = draft?._id ? draft.templateOptions || [] : [];
  const preview = async body => {
    setBusy(true); setPreviewError('');
    try { return await emailApi(`/drafts/${draft._id}/preview`, { method: 'POST', body: JSON.stringify(body) }); }
    catch (err) { setPreviewError(err.message); return null; }
    finally { setBusy(false); }
  };
  const chooseTemplate = async id => {
    if (id === 'current') { setSubject(draft.subject); setText(draft.text); setTemplateId(id); setHtml(draft.html || ''); return; }
    const value = await preview({ templateId: id });
    if (value) { setSubject(value.subject); setText(value.text); setTemplateId(id); setHtml(value.html); }
  };
  const updatePreview = async () => {
    const value = await preview({ subject, text });
    if (value) setHtml(value.html);
  };
  const finish = choice => {
    resolver.current?.({ choice, subject, text, ...(options.length ? { templateId } : {}) }); resolver.current = null;
    dialogRef.current?.close(); setDraft(null);
  };
  if (!draft) return null;
  return createPortal(
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); finish('skip'); }} aria-labelledby="email-review-title" className="w-[min(680px,95vw)] max-h-[90vh] overflow-auto rounded-2xl p-6 shadow-xl backdrop:bg-black/50">
      <h2 id="email-review-title" className="text-xl font-bold">Review email</h2>
      <p className="my-2 text-sm text-slate-600">{draft.description}</p>
      <p className="my-3 text-sm"><strong>To:</strong> {(draft.to || []).join(', ')}</p>
      {!!draft.attachments?.length && <p className="text-sm">Attachments: {draft.attachments.map(a => a.filename).join(', ')}</p>}
      {!!options.length && <>
        <label htmlFor="email-review-template" className="mt-4 block">Template</label>
        <select id="email-review-template" disabled={busy} className="mt-1 w-full rounded border p-2" value={templateId} onChange={e => void chooseTemplate(e.target.value)}>
          <option value="current">Current draft</option>
          {options.map(option => <option key={option.id || 'built-in'} value={option.id}>{optionLabel(option)}</option>)}
        </select>
      </>}
      <label htmlFor="email-review-subject" className="mt-4 block">Subject</label>
      <input id="email-review-subject" autoFocus maxLength={300} disabled={busy} className="mt-1 w-full rounded border p-2" value={subject} onChange={e => setSubject(e.target.value)} />
      <EmailTextEditor id="email-review-message" label="Message" value={text} onChange={setText} disabled={busy} />
      {draft._id && <button type="button" disabled={busy || !subject.trim() || !text.trim()} className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-40" onClick={() => void updatePreview()}>Update preview</button>}
      {html && <EmailPreview html={html} />}
      {previewError && <p role="alert" className="mt-2 text-sm text-red-700">{previewError}</p>}
      <p className="my-3 text-xs text-slate-500">Edits apply to this email only. Change reusable templates in Email Control.</p>
      <div className="flex justify-end gap-3">
        <button type="button" disabled={busy} className="rounded border px-4 py-2 disabled:opacity-40" onClick={() => finish('skip')}>Don’t Send Mail</button>
        <button type="button" disabled={busy || !subject.trim() || !text.trim()} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => finish('send')}>Send Mail</button>
      </div>
    </dialog>, document.body,
  );
}
