import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { emailApi, registerEmailReview } from '../helpers/emailReview';
import EmailEditor, { docHasContent, EmailPreview, plainDoc } from './EmailEditor';
import './EmailReviewDialog.css';

const optionLabel = option => (option.system && option.id ? `${option.name} (built-in)` : option.name);

export default function EmailReviewDialog() {
  const [draft, setDraft] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [subject, setSubject] = useState('');
  const [subjectDoc, setSubjectDoc] = useState(undefined);
  const [channel, setChannel] = useState('');
  const [templateMeta, setTemplateMeta] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [reviewDoc, setReviewDoc] = useState(undefined);
  const [templateId, setTemplateId] = useState('current');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [templateNotice, setTemplateNotice] = useState('');
  const [templateAction, setTemplateAction] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [replacementId, setReplacementId] = useState('');
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  const load = useCallback(value => {
    setTemplateAction(''); setDirty(false); setPendingChoice(null);
    setSubject(value.templatePreviewSubject || value.subject); setSubjectDoc(value.templateSubjectDoc); setReviewDoc(value.templateDoc ?? value.doc ?? plainDoc(value.text));
    setTemplateId(value.selectedTemplateId || 'current'); setTemplateMeta(value.selectedTemplateId ? { id: value.selectedTemplateId, name: value.templateLabel, revision: value.templateRevision } : null);
    setTemplateName(`${value.templateLabel || 'Message'} copy`);
    setChannel(value.delivery?.channels?.length ? (value.delivery.channels.length === 2 ? 'both' : value.delivery.channels[0]) : value.defaultChannel || '');
    setHtml(value.templatePreviewHtml || value.html || ''); setPreviewError(''); setTemplateNotice(''); setDraft(value);
  }, []);
  const loadRemembered = useCallback(async value => {
    load(value); setBusy(true);
    try {
      if (!value.event || !value.templateOptions || value.delivery?.lockedAt || ['failed', 'sending'].includes(value.status)) return;
      const preference = await emailApi(`/preferences/${value.event}`);
      let next = value;
      if (preference?.templateId && value.templateOptions.some(option => option.id === preference.templateId)) {
        const selected = await emailApi(value._id ? `/drafts/${value._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ event: value.event, values: value.values, templateId: preference.templateId }) });
        next = { ...value, ...selected, templatePreviewSubject: selected.subject, templatePreviewHtml: selected.html };
      }
      load(next);
      if (preference?.channel && value.channelOptions?.length) setChannel(preference.channel);
      if (preference?.templateUnavailable) setTemplateNotice("Your last template is unavailable. The action's current template is shown.");
    } catch { setTemplateNotice('Saved selections could not be loaded. Current draft settings are shown.'); }
    finally { setBusy(false); }
  }, [load]);
  useEffect(() => {
    const unregister = registerEmailReview(value => new Promise(resolve => {
      resolver.current = resolve;
      void loadRemembered(value);
    }));
    const preparation = event => setPreparing(event.detail);
    window.addEventListener('email-review-preparing', preparation);
    const error = event => toast.error(`Action saved. Email was not confirmed as sent: ${event.detail}. Open Email Control to review.`);
    const result = event => {
      if (event.detail?.delivery) toast.success([event.detail.delivery.email === 'sent' ? 'Email sent' : '', event.detail.delivery.whatsapp === 'queued' ? 'WhatsApp queued' : ''].filter(Boolean).join(' · '));
      else if (event.detail === 'sent') toast.success('Email sent');
    };
    window.addEventListener('email-review-error', error);
    window.addEventListener('email-review-result', result);
    return () => { window.removeEventListener('email-review-preparing', preparation); unregister(); window.removeEventListener('email-review-error', error); window.removeEventListener('email-review-result', result); resolver.current?.({ choice: 'skip' }); };
  }, [loadRemembered]);
  useEffect(() => {
    if ((draft || preparing) && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!draft && !preparing) dialogRef.current?.close();
  }, [draft, preparing]);
  // Original-template previews also support unsaved Add Lead / phone-only proposal reviews.
  const options = draft?.templateOptions || [];
  const locked = !!draft?.delivery?.lockedAt || draft?.status === 'failed' || draft?.status === 'sending';
  const preview = async body => {
    setBusy(true); setPreviewError(''); setTemplateNotice('');
    try { return await emailApi(draft._id ? `/drafts/${draft._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ ...(!draft._id ? { event: draft.event, values: draft.values, templateId: templateId === 'current' ? undefined : templateId } : {}), ...body }) }); }
    catch (err) { setPreviewError(err.message); return null; }
    finally { setBusy(false); }
  };
  // A message type keeps the draft but loads that action's personal selections.
  const chooseType = async event => {
    if (dirty) { setPendingChoice(`type:${event}`); return; }
    await applyType(event);
  };
  const applyType = async event => {
    setBusy(true); setPreviewError('');
    try {
      const value = await emailApi(`/drafts/${draft._id}/message-type`, { method: 'POST', body: JSON.stringify({ event }) });
      await loadRemembered(value);
    } catch (error) { setPreviewError(error.message); }
    finally { setBusy(false); }
  };
  const chooseTemplate = async id => {
    if (dirty) { setPendingChoice(id); return; }
    await applyTemplate(id);
  };
  const remember = async fields => {
    if (!draft.event || !draft.templateOptions) return;
    try { await emailApi(`/preferences/${draft.event}`, { method: 'PUT', body: JSON.stringify(fields) }); }
    catch { setTemplateNotice('Selection applies now, but could not be remembered. Choose it again to retry.'); }
  };
  const applyTemplate = async id => {
    setPendingChoice(null); setTemplateAction('');
    if (id === 'current') { setSubject(draft.subject); setSubjectDoc(undefined); setTemplateMeta(null); setReviewDoc(draft.doc ?? plainDoc(draft.text)); setTemplateId(id); setHtml(draft.html || ''); setDirty(false); await remember({ templateId: null }); return; }
    const value = await preview({ templateId: id });
    if (value) { setSubject(value.subject); setSubjectDoc(value.templateSubjectDoc); setReviewDoc(value.templateDoc ?? value.doc ?? plainDoc(value.text)); setTemplateId(id); setHtml(value.html);
      setTemplateName(`${value.templateLabel || 'Message'} copy`);
      setTemplateMeta(value.selectedTemplateId ? { id: value.selectedTemplateId, name: value.templateLabel, revision: value.templateRevision } : null);
      setDirty(false); setBusy(true); await remember({ templateId: id || null }); setBusy(false); }
  };
  const updatePreview = async () => {
    const value = await preview({ subject, subjectDoc, doc: reviewDoc });
    if (value) setHtml(value.html);
  };
  const saveTemplate = async () => {
    if (busy || locked || (templateAction !== 'new' && !templateMeta)) return;
    setBusy(true); setPreviewError('');
    try {
      if (templateAction === 'delete') {
        await emailApi(`/templates/${templateMeta.id}`, { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt: templateMeta.revision, replacementTemplateId: replacementId || undefined }) });
        setDraft(current => ({ ...current, templateOptions: current.templateOptions.filter(option => option.id !== templateMeta.id) }));
        setTemplateMeta(null); setTemplateId('current'); setTemplateAction('');
        await remember({ templateId: null }); setTemplateNotice('Template deleted. Your current message is kept.'); return;
      }
      const updated = await emailApi(templateAction === 'new' ? '/templates' : `/templates/${templateMeta.id}`, { method: templateAction === 'new' ? 'POST' : templateAction === 'rename' ? 'PATCH' : 'PUT', body: JSON.stringify(templateAction === 'rename' ? { name: templateName.trim(), expectedUpdatedAt: templateMeta.revision } : { event: draft.event, ...(templateAction === 'new' && templateMeta ? { sourceTemplateId: templateMeta.id } : {}), name: templateAction === 'new' ? templateName.trim() : templateMeta.name, expectedUpdatedAt: templateMeta?.revision, subject, subjectDoc, doc: reviewDoc }) });
      setTemplateMeta({ id: updated._id, name: updated.name, revision: updated.updatedAt });
      setTemplateId(updated._id);
      setDraft(current => ({ ...current, templateOptions: [...(current.templateOptions || []).filter(option => option.id !== updated._id), { id: updated._id, name: updated.name, system: !!updated.system }] }));
      setTemplateNotice(templateAction === 'new' ? 'New template saved. Original unchanged.' : templateAction === 'rename' ? 'Template renamed. Message edits are kept separately.' : 'Template updated.');
      if (templateAction !== 'rename') setDirty(false);
      setTemplateAction(''); await remember({ templateId: updated._id });
      const refreshed = await emailApi(draft._id ? `/drafts/${draft._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ event: draft.event, values: draft.values, templateId: updated._id, subject, subjectDoc, doc: reviewDoc }) });
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
  if (!draft) return preparing ? createPortal(
    <dialog ref={dialogRef} aria-label="Preparing message" aria-busy="true" onCancel={event => event.preventDefault()} className="w-[min(680px,95vw)] rounded-2xl p-6 shadow-xl backdrop:bg-black/50">
      <h2 className="text-xl font-bold">Send message</h2><p role="status" className="my-3">Preparing your message…</p>
    </dialog>, document.body) : null;
  const isWhatsapp = draft.channel === 'whatsapp' || (!draft.to?.length && channel === 'whatsapp');
  const types = draft.messageTypes;
  const typeNote = types?.find(type => type.id === draft.event)?.note;
  const recipients = [...(draft.to || []), ...(draft.whatsappTo && !draft.to?.includes(draft.whatsappTo) ? [`+${draft.whatsappTo}`] : [])];
  return createPortal(
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); if (!busy) setPendingChoice('close'); }} aria-labelledby="email-review-title" className="review-window shadow-xl backdrop:bg-black/50">
      <div className="review-layout"><header className="review-header">
      <h2 id="email-review-title" className="text-xl font-bold">{types ? 'Send message' : draft.channelOptions ? 'Review message' : isWhatsapp ? 'Review WhatsApp message' : 'Review email'}</h2>
      <button type="button" aria-label="Close review" disabled={busy} onClick={() => setPendingChoice('close')}>×</button></header><div className="review-body">
      <details><summary className="cursor-pointer text-sm">To: {recipients.join(', ')} · Details</summary>
      <p className="my-2 text-sm text-slate-600">{types ? 'Nothing goes until you choose Send. The lead’s stage does not change.' : draft.description}</p>
      <p className="my-3 text-sm"><strong>To:</strong> {recipients.join(', ')}</p>
      {!!draft.attachments?.length && <p className="text-sm">Attachments: {draft.attachments.map(a => a.filename).join(', ')}</p>}
      {!!draft.attachments?.length && ['whatsapp', 'both'].includes(channel) && <p className="text-xs text-slate-500">Files are attached to email. WhatsApp sends the message and its links.</p>}
      </details>
      {!!draft.channelOptions?.length && <><label htmlFor="review-channel" className="mt-3 block">Send via</label>
        <select id="review-channel" className="mt-1 w-full rounded border p-2" value={channel} disabled={busy || locked} onChange={async event => { const selected = event.target.value; setChannel(selected); setBusy(true); await remember({ channel: selected }); setBusy(false); }}>
          {draft.channelOptions.map(option => <option key={option.id} value={option.id} disabled={!option.enabled}>{option.label}{!option.enabled ? ` — ${option.reason}` : ''}</option>)}
        </select></>}
      {draft.channelOptions?.find(option => option.id === channel)?.enabled === false && <p role="status" className="text-sm text-red-700">{draft.channelOptions.find(option => option.id === channel)?.reason}. Choose an available channel.</p>}
      {!!types && <>
        <label htmlFor="email-review-type" className="mt-4 block">Message type</label>
        <select id="email-review-type" disabled={busy || locked} className="mt-1 w-full rounded border p-2" value={draft.event} onChange={event => void chooseType(event.target.value)}>
          {types.map(type => <option key={type.id} value={type.id} disabled={!type.enabled}>{type.label}{type.reason ? ` — ${type.reason}` : ''}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">{typeNote || 'Changing the type replaces the message below.'}</p>
      </>}
      {!!options.length && <>
        <label htmlFor="email-review-template" className="mt-4 block">Template</label>
        <div className="review-template-select"><select id="email-review-template" disabled={busy || locked} className="mt-1 w-full rounded border p-2" value={templateId} onChange={e => void chooseTemplate(e.target.value)}>
          {(!types || templateId === 'current') && <option value="current">Current draft</option>}
          {options.map(option => <option key={option.id || 'built-in'} value={option.id}>{optionLabel(option)}</option>)}
        </select><button type="button" aria-label="Manage template" aria-expanded={!!templateAction} disabled={busy || locked} onClick={() => setTemplateAction(templateAction ? '' : 'menu')}>⋯</button></div>
      </>}
      {templateAction === 'menu' && <div className="review-template-tools" aria-label="Template actions">{[['update', 'Update this template'], ['new', 'Save as new template'], ['rename', 'Rename'], ['delete', 'Delete']].map(([action, label]) => <button key={action} type="button" disabled={busy || (action !== 'new' && !templateMeta) || (['rename', 'delete'].includes(action) && !!options.find(option => option.id === templateId)?.system)} onClick={() => { setTemplateName(action === 'rename' ? templateMeta?.name || '' : `${templateMeta?.name || 'Message'} copy`); setReplacementId(''); setTemplateAction(action); }}>{label}</button>)}</div>}
      {templateAction && templateAction !== 'menu' && <div className="review-template-tools">
        {['new', 'rename'].includes(templateAction) ? <><label htmlFor="review-template-name">{templateAction === 'new' ? 'New template name' : 'Template name'}</label><input autoFocus id="review-template-name" maxLength={100} disabled={busy} value={templateName} onChange={event => setTemplateName(event.target.value)} /></> : <span>{templateAction === 'delete' ? `Delete “${templateMeta?.name}”? Current message and history are kept.` : `Update “${templateMeta?.name}” for future messages?`}</span>}
        {templateAction === 'delete' && <><label htmlFor="replacement-template">If default, replace with</label><select id="replacement-template" value={replacementId} onChange={event => setReplacementId(event.target.value)} disabled={busy}><option value="">Choose replacement</option>{options.filter(option => option.id && option.id !== templateId).map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select></>}
        <button type="button" disabled={busy} onClick={() => setTemplateAction('')}>Cancel</button><button type="button" disabled={busy || (['new', 'rename'].includes(templateAction) && !templateName.trim()) || (['new', 'update'].includes(templateAction) && !docHasContent(reviewDoc))} onClick={() => void saveTemplate()}>{templateAction === 'new' ? 'Save template' : templateAction === 'rename' ? 'Save name' : templateAction === 'delete' ? 'Delete template' : 'Update template'}</button>
      </div>}
      {pendingChoice !== null && <div className="review-template-tools" role="alert"><span>{pendingChoice === 'close' ? "Don't send this message and close the review?" : 'Discard message edits and change selection?'}</span><button type="button" disabled={busy} onClick={() => setPendingChoice(null)}>Keep editing</button><button type="button" disabled={busy} onClick={() => pendingChoice === 'close' ? finish('skip') : pendingChoice.startsWith('type:') ? applyType(pendingChoice.slice(5)) : applyTemplate(pendingChoice)}>{pendingChoice === 'close' ? "Don't send and close" : 'Discard edits'}</button></div>}
      {subjectDoc ? <EmailEditor id="email-review-subject" label="Subject" value={subjectDoc} onChange={value => { setSubjectDoc(value); setDirty(true); }} singleLine compact disabled={busy || locked} variables={draft.editorFields?.variables} /> : <>
        <label htmlFor="email-review-subject" className="mt-4 block">Subject</label>
        <input id="email-review-subject" autoFocus maxLength={300} disabled={busy || locked} className="mt-1 w-full rounded border p-2" value={subject} onChange={e => { setSubject(e.target.value); setDirty(true); }} />
      </>}
      <EmailEditor id="email-review-message" label="Message" compact value={reviewDoc} onChange={value => { setReviewDoc(value); setDirty(true); }} disabled={busy || locked} variables={draft.editorFields?.variables} blocks={draft.editorFields?.blocks} />
      {(draft._id || templateMeta) && <button type="button" disabled={busy || locked || !subject.trim() || !docHasContent(reviewDoc)} className="mt-2 rounded border px-3 py-1 text-sm disabled:opacity-40" onClick={() => void updatePreview()}>Update preview</button>}
      {html && (draft.channelOptions ? <details className="mt-3"><summary className="cursor-pointer text-sm">Preview</summary><EmailPreview html={html} /></details> : <EmailPreview html={html} />)}
      {previewError && <p role="alert" className="mt-2 text-sm text-red-700">{previewError}</p>}
      {previewError && templateMeta && !locked && <button type="button" disabled={busy} className="text-sm underline" onClick={() => void chooseTemplate(templateMeta.id)}>Reload saved message</button>}
      {templateNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{templateNotice}</p>}
      <p className="my-3 text-xs text-slate-500">{locked ? 'This attempt keeps its original content and channels. Retry completes unfinished delivery only.' : `${dirty ? 'Edited for this message. ' : ''}Send does not save template changes. Channel and template selections are remembered for this action.`}</p>
      </div><footer className="review-footer flex justify-end gap-3">
        <button type="button" disabled={busy} className="rounded border px-4 py-2 disabled:opacity-40" onClick={() => finish('skip')}>{isWhatsapp ? 'Don’t Send' : 'Don’t Send Mail'}</button>
        <button type="button" disabled={busy || draft.status === 'sending' || !subject.trim() || !docHasContent(reviewDoc) || (!!draft.channelOptions && !locked && !draft.channelOptions.find(option => option.id === channel)?.enabled)} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => finish('send')}>{locked ? 'Retry unfinished' : channel === 'both' ? 'Send' : channel === 'whatsapp' || isWhatsapp ? 'Send WhatsApp' : 'Send Mail'}</button>
      </footer></div>
    </dialog>, document.body,
  );
}
