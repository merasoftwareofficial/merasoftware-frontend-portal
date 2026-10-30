import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { emailApi, registerEmailReview } from '../helpers/emailReview';
import EmailEditor, { docHasContent, EmailPreview, plainDoc } from './EmailEditor';

const optionLabel = option => (option.system && option.id ? `${option.name} (built-in)` : option.name);

export default function EmailReviewDialog() {
  const [draft, setDraft] = useState(null);
  const [subject, setSubject] = useState('');
  const [subjectDoc, setSubjectDoc] = useState(undefined);
  const [channel, setChannel] = useState('');
  const [templateMeta, setTemplateMeta] = useState(null);
  const [reviewDoc, setReviewDoc] = useState(undefined);
  const [templateId, setTemplateId] = useState('current');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [templateNotice, setTemplateNotice] = useState('');
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const unregister = registerEmailReview(value => new Promise(resolve => {
      resolver.current = resolve;
      setSubject(value.templatePreviewSubject || value.subject); setSubjectDoc(value.templateSubjectDoc); setReviewDoc(value.templateDoc ?? value.doc ?? plainDoc(value.text));
      setTemplateId(value.selectedTemplateId || 'current'); setTemplateMeta(value.selectedTemplateId ? { id: value.selectedTemplateId, name: value.templateLabel, revision: value.templateRevision } : null);
      setChannel(value.delivery?.channels?.length ? (value.delivery.channels.length === 2 ? 'both' : value.delivery.channels[0]) : value.defaultChannel || '');
      setHtml(value.templatePreviewHtml || value.html || ''); setPreviewError(''); setTemplateNotice(''); setDraft(value);
    }));
    const error = event => toast.error(`Action saved. Email was not confirmed as sent: ${event.detail}. Open Email Control to review.`);
    const result = event => {
      if (event.detail?.delivery) toast.success([event.detail.delivery.email === 'sent' ? 'Email sent' : '', event.detail.delivery.whatsapp === 'queued' ? 'WhatsApp queued' : ''].filter(Boolean).join(' · '));
      else if (event.detail === 'sent') toast.success('Email sent');
    };
    window.addEventListener('email-review-error', error);
    window.addEventListener('email-review-result', result);
    return () => { unregister(); window.removeEventListener('email-review-error', error); window.removeEventListener('email-review-result', result); resolver.current?.({ choice: 'skip' }); };
  }, []);
  useEffect(() => {
    if (draft) dialogRef.current?.showModal();
  }, [draft]);
  // Original-template previews also support unsaved Add Lead / phone-only proposal reviews.
  const options = draft?.templateOptions || [];
  const locked = !!draft?.delivery?.lockedAt || draft?.status === 'failed' || draft?.status === 'sending';
  const preview = async body => {
    setBusy(true); setPreviewError(''); setTemplateNotice('');
    try { return await emailApi(draft._id ? `/drafts/${draft._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ ...(!draft._id ? { event: draft.event, values: draft.values, templateId: templateId === 'current' ? undefined : templateId } : {}), ...body }) }); }
    catch (err) { setPreviewError(err.message); return null; }
    finally { setBusy(false); }
  };
  const chooseTemplate = async id => {
    if (id === 'current') { setSubject(draft.subject); setSubjectDoc(undefined); setTemplateMeta(null); setReviewDoc(draft.doc ?? plainDoc(draft.text)); setTemplateId(id); setHtml(draft.html || ''); return; }
    const value = await preview({ templateId: id });
    if (value) { setSubject(value.subject); setSubjectDoc(value.templateSubjectDoc); setReviewDoc(value.templateDoc ?? value.doc ?? plainDoc(value.text)); setTemplateId(id); setHtml(value.html);
      setTemplateMeta(value.selectedTemplateId ? { id: value.selectedTemplateId, name: value.templateLabel, revision: value.templateRevision } : null); }
  };
  const updatePreview = async () => {
    const value = await preview({ subject, subjectDoc, doc: reviewDoc });
    if (value) setHtml(value.html);
  };
  const saveTemplate = async () => {
    if (!templateMeta || busy || locked) return;
    setBusy(true); setPreviewError('');
    try {
      const updated = await emailApi(`/templates/${templateMeta.id}`, { method: 'PUT', body: JSON.stringify({ name: templateMeta.name, subject, subjectDoc, doc: reviewDoc, expectedUpdatedAt: templateMeta.revision }) });
      setTemplateMeta({ id: updated._id, name: updated.name, revision: updated.updatedAt });
      setTemplateNotice('Selected template updated.');
      const refreshed = await emailApi(draft._id ? `/drafts/${draft._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ event: draft.event, values: draft.values, templateId: templateMeta.id, subject, subjectDoc, doc: reviewDoc }) });
      setHtml(refreshed.html);
    } catch (error) { setPreviewError(error.message); }
    finally { setBusy(false); }
  };
  const finish = async choice => {
    if (busy) return;
    const decision = { choice, subject, ...(subjectDoc ? { subjectDoc } : {}), doc: reviewDoc, ...(channel ? { channels: channel } : {}), ...(options.length ? { templateId } : {}) };
    if (draft._id) {
      setBusy(true); setPreviewError('');
      try {
        const result = await emailApi(`/drafts/${draft._id}/decision`, { method: 'POST', body: JSON.stringify(decision) });
        if (result.status === 'failed') {
          setPreviewError(`Email: ${result.delivery?.email || 'unavailable'} · WhatsApp: ${result.delivery?.whatsapp || 'unavailable'}. ${result.delivery?.failure || ''}`);
          setDraft({ ...draft, status: 'failed', delivery: { channels: result.delivery.channels, lockedAt: new Date().toISOString() } });
          return;
        }
        decision.processedResult = result;
      } catch (error) { setPreviewError(error.message); return; }
      finally { setBusy(false); }
    }
    resolver.current?.(decision); resolver.current = null;
    dialogRef.current?.close(); setDraft(null);
  };
  if (!draft) return null;
  const isWhatsapp = draft.channel === 'whatsapp';
  return createPortal(
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); finish('skip'); }} aria-labelledby="email-review-title" className="w-[min(680px,95vw)] max-h-[90vh] overflow-auto rounded-2xl p-6 shadow-xl backdrop:bg-black/50">
      <h2 id="email-review-title" className="text-xl font-bold">{draft.channelOptions ? 'Review message' : isWhatsapp ? 'Review WhatsApp message' : 'Review email'}</h2>
      <p className="my-2 text-sm text-slate-600">{draft.description}</p>
      <p className="my-3 text-sm"><strong>To:</strong> {(draft.to || []).join(', ')}</p>
      {!!draft.attachments?.length && <p className="text-sm">Attachments: {draft.attachments.map(a => a.filename).join(', ')}</p>}
      {!!draft.attachments?.length && ['whatsapp', 'both'].includes(channel) && <p className="text-xs text-slate-500">Files are attached to email. WhatsApp sends the message and its links.</p>}
      {!!draft.channelOptions?.length && <><label htmlFor="review-channel" className="mt-3 block">Send via</label>
        <select id="review-channel" className="mt-1 w-full rounded border p-2" value={channel} disabled={busy || locked} onChange={event => setChannel(event.target.value)}>
          {draft.channelOptions.map(option => <option key={option.id} value={option.id} disabled={!option.enabled}>{option.label}{!option.enabled ? ` — ${option.reason}` : ''}</option>)}
        </select></>}
      {!!options.length && <>
        <label htmlFor="email-review-template" className="mt-4 block">Template</label>
        <select id="email-review-template" disabled={busy || locked} className="mt-1 w-full rounded border p-2" value={templateId} onChange={e => void chooseTemplate(e.target.value)}>
          <option value="current">Current draft</option>
          {options.map(option => <option key={option.id || 'built-in'} value={option.id}>{optionLabel(option)}</option>)}
        </select>
      </>}
      {subjectDoc ? <EmailEditor id="email-review-subject" label="Subject" value={subjectDoc} onChange={setSubjectDoc} singleLine compact disabled={busy || locked} variables={draft.editorFields?.variables} /> : <>
        <label htmlFor="email-review-subject" className="mt-4 block">Subject</label>
        <input id="email-review-subject" autoFocus maxLength={300} disabled={busy || locked} className="mt-1 w-full rounded border p-2" value={subject} onChange={e => setSubject(e.target.value)} />
      </>}
      <EmailEditor id="email-review-message" label="Message" compact value={reviewDoc} onChange={setReviewDoc} disabled={busy || locked} variables={draft.editorFields?.variables} blocks={draft.editorFields?.blocks} />
      {(draft._id || templateMeta) && <button type="button" disabled={busy || locked || !subject.trim() || !docHasContent(reviewDoc)} className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-40" onClick={() => void updatePreview()}>Update preview</button>}
      {html && (draft.channelOptions ? <details className="mt-3"><summary className="cursor-pointer text-sm">Preview</summary><EmailPreview html={html} /></details> : <EmailPreview html={html} />)}
      {previewError && <p role="alert" className="mt-2 text-sm text-red-700">{previewError}</p>}
      {previewError && templateMeta && !locked && <button type="button" disabled={busy} className="text-sm underline" onClick={() => void chooseTemplate(templateMeta.id)}>Reload saved message</button>}
      {templateNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{templateNotice}</p>}
      <p className="my-3 text-xs text-slate-500">{locked ? 'This attempt keeps its original content and channels. Retry completes unfinished delivery only.' : templateMeta ? 'Send uses these edits once. Save template updates this saved message for future use.' : 'Edits apply to this message only; no reusable template is linked.'}</p>
      <div className="flex justify-end gap-3">
        {templateMeta && !locked && <button type="button" disabled={busy || !docHasContent(reviewDoc)} className="rounded border px-4 py-2 disabled:opacity-40" onClick={() => void saveTemplate()}>Save template</button>}
        <button type="button" disabled={busy} className="rounded border px-4 py-2 disabled:opacity-40" onClick={() => finish('skip')}>{isWhatsapp ? 'Don’t Send' : 'Don’t Send Mail'}</button>
        <button type="button" disabled={busy || draft.status === 'sending' || !subject.trim() || !docHasContent(reviewDoc) || (!!draft.channelOptions && !locked && !draft.channelOptions.find(option => option.id === channel)?.enabled)} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => finish('send')}>{locked ? 'Retry unfinished' : channel === 'both' ? 'Send' : channel === 'whatsapp' || isWhatsapp ? 'Send WhatsApp' : 'Send Mail'}</button>
      </div>
    </dialog>, document.body,
  );
}
