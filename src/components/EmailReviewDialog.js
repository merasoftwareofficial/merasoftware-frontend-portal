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
  const [showDetails, setShowDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const resolver = useRef(null);
  const dialogRef = useRef(null);
  const load = useCallback(value => {
    setTemplateAction(''); setDirty(false); setPendingChoice(null); setShowDetails(false); setShowPreview(false);
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
  // An open preview follows message edits a moment after typing stops, without locking the editor.
  useEffect(() => {
    if (!showPreview || !dirty || !draft || !(draft._id || templateMeta) || locked) return undefined;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const value = await emailApi(draft._id ? `/drafts/${draft._id}/preview` : '/review-preview', { method: 'POST', body: JSON.stringify({ ...(!draft._id ? { event: draft.event, values: draft.values, templateId: templateId === 'current' ? undefined : templateId } : {}), subject, subjectDoc, doc: reviewDoc }) });
        if (!stale) { setHtml(value.html); setPreviewError(''); }
      } catch (err) { if (!stale) setPreviewError(err.message); }
    }, 700);
    return () => { stale = true; clearTimeout(timer); };
  }, [showPreview, dirty, draft, templateMeta, templateId, locked, subject, subjectDoc, reviewDoc]);
  const startTemplateAction = action => {
    setTemplateName(action === 'rename' ? templateMeta?.name || '' : `${templateMeta?.name || 'Message'} copy`);
    setReplacementId(''); setTemplateNotice(''); setTemplateAction(action);
  };
  const saveTemplate = async (action = templateAction) => {
    if (busy || locked || (action !== 'new' && !templateMeta)) return;
    setBusy(true); setPreviewError('');
    try {
      if (action === 'delete') {
        await emailApi(`/templates/${templateMeta.id}`, { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt: templateMeta.revision, replacementTemplateId: replacementId || undefined }) });
        setDraft(current => ({ ...current, templateOptions: current.templateOptions.filter(option => option.id !== templateMeta.id) }));
        setTemplateMeta(null); setTemplateId('current'); setTemplateAction('');
        await remember({ templateId: null }); setTemplateNotice('Template deleted. Your current message is kept.'); return;
      }
      const updated = await emailApi(action === 'new' ? '/templates' : `/templates/${templateMeta.id}`, { method: action === 'new' ? 'POST' : action === 'rename' ? 'PATCH' : 'PUT', body: JSON.stringify(action === 'rename' ? { name: templateName.trim(), expectedUpdatedAt: templateMeta.revision } : { event: draft.event, ...(action === 'new' && templateMeta ? { sourceTemplateId: templateMeta.id } : {}), name: action === 'new' ? templateName.trim() : templateMeta.name, expectedUpdatedAt: templateMeta?.revision, subject, subjectDoc, doc: reviewDoc }) });
      setTemplateMeta({ id: updated._id, name: updated.name, revision: updated.updatedAt });
      setTemplateId(updated._id);
      setDraft(current => ({ ...current, templateOptions: [...(current.templateOptions || []).filter(option => option.id !== updated._id), { id: updated._id, name: updated.name, system: !!updated.system }] }));
      setTemplateNotice(action === 'new' ? 'New template saved. Original unchanged.' : action === 'rename' ? 'Template renamed. Message edits are kept separately.' : 'Template updated.');
      if (action !== 'rename') setDirty(false);
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
  const selectedOption = options.find(option => option.id === templateId);
  const builtIn = !!selectedOption?.system;
  return createPortal(
    <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); if (!busy) setPendingChoice('close'); }} aria-labelledby="email-review-title" className="review-window shadow-xl backdrop:bg-black/50">
      <div className="review-layout"><header className="review-header"><div className="min-w-0">
      <h2 id="email-review-title">{types ? 'Send message' : draft.channelOptions ? 'Review message' : isWhatsapp ? 'Review WhatsApp message' : 'Review email'}</h2>
      <button type="button" className="review-to" aria-expanded={showDetails} onClick={() => setShowDetails(open => !open)}>To: {recipients.join(', ')} {showDetails ? '▾' : '▸'}</button>
      {showDetails && <div className="review-to-details">
        <p>{types ? 'Nothing goes until you choose Send. The lead’s stage does not change.' : draft.description}</p>
        {!!draft.attachments?.length && <p>Attachments: {draft.attachments.map(a => a.filename).join(', ')}</p>}
        {!!draft.attachments?.length && ['whatsapp', 'both'].includes(channel) && <p>Files are attached to email. WhatsApp sends the message and its links.</p>}
      </div>}
      </div><button type="button" aria-label="Close review" disabled={busy} onClick={() => setPendingChoice('close')}>×</button></header><div className="review-body">
      {!!types && <div className="review-field">
        <label htmlFor="email-review-type">Message type</label>
        <select id="email-review-type" disabled={busy || locked} className="w-full rounded border p-2" value={draft.event} onChange={event => void chooseType(event.target.value)}>
          {types.map(type => <option key={type.id} value={type.id} disabled={!type.enabled}>{type.label}{type.reason ? ` — ${type.reason}` : ''}</option>)}
        </select>
        <p className="text-xs text-slate-500">{typeNote || 'Changing the type replaces the message below.'}</p>
      </div>}
      {(!!draft.channelOptions?.length || !!options.length) && <div className="review-row">
        {!!draft.channelOptions?.length && <div className="review-field"><label htmlFor="review-channel">Send via</label>
          <select id="review-channel" className="w-full rounded border p-2" value={channel} disabled={busy || locked} onChange={async event => { const selected = event.target.value; setChannel(selected); setBusy(true); await remember({ channel: selected }); setBusy(false); }}>
            {draft.channelOptions.map(option => <option key={option.id} value={option.id} disabled={!option.enabled}>{option.label}{!option.enabled ? ` — ${option.reason}` : ''}</option>)}
          </select></div>}
        {!!options.length && <div className="review-field"><label htmlFor="email-review-template">Template</label>
          <select id="email-review-template" disabled={busy || locked} className="w-full rounded border p-2" value={templateId} onChange={e => void chooseTemplate(e.target.value)}>
            {(!types || templateId === 'current') && <option value="current">Current draft</option>}
            {options.map(option => <option key={option.id || 'built-in'} value={option.id}>{optionLabel(option)}</option>)}
          </select></div>}
      </div>}
      {draft.channelOptions?.find(option => option.id === channel)?.enabled === false && <p role="status" className="text-sm text-red-700">{draft.channelOptions.find(option => option.id === channel)?.reason}. Choose an available channel.</p>}
      {pendingChoice !== null && <div className="review-alert" role="alert"><span>{pendingChoice === 'close' ? "Don't send this message and close the review?" : 'You have unsaved edits. Discard them and change selection?'}</span><button type="button" disabled={busy} onClick={() => setPendingChoice(null)}>Keep editing</button><button type="button" className="review-danger" disabled={busy} onClick={() => pendingChoice === 'close' ? finish('skip') : pendingChoice.startsWith('type:') ? applyType(pendingChoice.slice(5)) : applyTemplate(pendingChoice)}>{pendingChoice === 'close' ? "Don't send and close" : 'Discard edits'}</button></div>}
      {subjectDoc ? <div className="review-field"><EmailEditor id="email-review-subject" label="Subject" value={subjectDoc} onChange={value => { setSubjectDoc(value); setDirty(true); }} singleLine compact disabled={busy || locked} variables={draft.editorFields?.variables} /></div> : <div className="review-field">
        <label htmlFor="email-review-subject">Subject</label>
        <input id="email-review-subject" autoFocus maxLength={300} disabled={busy || locked} className="w-full rounded border p-2" value={subject} onChange={e => { setSubject(e.target.value); setDirty(true); }} />
      </div>}
      <div className="review-field"><EmailEditor id="email-review-message" label="Message" compact value={reviewDoc} onChange={value => { setReviewDoc(value); setDirty(true); }} disabled={busy || locked} variables={draft.editorFields?.variables} blocks={draft.editorFields?.blocks} /></div>
      {(!!options.length || !!html) && <div className="review-template-bar" role="group" aria-label="Template actions">
        {!templateAction ? <>
          {!!options.length && <span className="review-template-name">{templateMeta?.name || selectedOption?.name || 'Current draft'}{builtIn && <span className="review-tag">Built-in</span>}{dirty && <span className="review-tag review-tag-edited">Edited</span>}</span>}
          <div className="review-template-actions">
            {!!options.length && <>
              <button type="button" className="review-primary" disabled={busy || locked || !dirty || !templateMeta || builtIn || !docHasContent(reviewDoc)} onClick={() => void saveTemplate('update')}>Save</button>
              <button type="button" disabled={busy || locked || !docHasContent(reviewDoc)} onClick={() => startTemplateAction('new')}>Save as</button>
              <button type="button" disabled={busy || locked || !templateMeta || builtIn} onClick={() => startTemplateAction('rename')}>Rename</button>
              <button type="button" className="review-danger" disabled={busy || locked || !templateMeta || builtIn} onClick={() => startTemplateAction('delete')}>Delete</button>
            </>}
            {!!html && <button type="button" aria-expanded={showPreview} onClick={() => setShowPreview(open => !open)}>{showPreview ? 'Hide preview' : 'Preview'}</button>}
          </div>
          {!!options.length && !locked && <span className="review-template-hint">{builtIn ? 'Built-in template stays original. Use Save as to keep your changes.' : !templateMeta ? 'Use Save as to keep this message as a template.' : !dirty ? 'Edit the message to enable Save.' : 'Save updates this template for future messages.'}</span>}
        </> : templateAction === 'delete' ? <>
          <span className="review-template-question">Delete “{templateMeta?.name}”? The message on screen and sent history are kept.</span>
          <select id="replacement-template" aria-label="If this is the default, new default" value={replacementId} onChange={event => setReplacementId(event.target.value)} disabled={busy}><option value="">If default, new default…</option>{options.filter(option => option.id && option.id !== templateId).map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select>
          <div className="review-template-actions"><button type="button" className="review-danger review-solid" disabled={busy} onClick={() => void saveTemplate()}>Delete</button><button type="button" disabled={busy} onClick={() => setTemplateAction('')}>Cancel</button></div>
        </> : <>
          <label htmlFor="review-template-name">{templateAction === 'new' ? 'New name' : 'Rename to'}</label>
          <input autoFocus id="review-template-name" maxLength={100} disabled={busy} value={templateName} onChange={event => setTemplateName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setTemplateAction(''); } if (event.key === 'Enter' && templateName.trim()) { event.preventDefault(); void saveTemplate(); } }} />
          <div className="review-template-actions"><button type="button" className="review-primary" disabled={busy || !templateName.trim() || (templateAction === 'new' && !docHasContent(reviewDoc))} onClick={() => void saveTemplate()}>{templateAction === 'new' ? 'Save' : 'Save name'}</button><button type="button" disabled={busy} onClick={() => setTemplateAction('')}>Cancel</button></div>
          <span className="review-template-hint">{templateAction === 'new' ? 'Saves this message as a new template. The original stays unchanged.' : 'Only the name changes. Your message edits stay as they are.'}</span>
        </>}
      </div>}
      {templateNotice && <p role="status" className="text-sm text-emerald-700">{templateNotice}</p>}
      {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
      {previewError && templateMeta && !locked && <button type="button" disabled={busy} className="self-start text-sm underline" onClick={() => void chooseTemplate(templateMeta.id)}>Reload saved message</button>}
      {showPreview && !!html && <EmailPreview html={html} />}
      </div><footer className="review-footer">
        <p>{locked ? 'This attempt keeps its original content and channels. Retry completes unfinished delivery only.' : 'Send uses this message once. Template changes save only with Save.'}</p>
        <button type="button" disabled={busy} className="rounded border px-4 py-2 disabled:opacity-40" onClick={() => finish('skip')}>{isWhatsapp ? 'Don’t Send' : 'Don’t Send Mail'}</button>
        <button type="button" disabled={busy || draft.status === 'sending' || !subject.trim() || !docHasContent(reviewDoc) || (!!draft.channelOptions && !locked && !draft.channelOptions.find(option => option.id === channel)?.enabled)} className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-40" onClick={() => finish('send')}>{locked ? 'Retry unfinished' : channel === 'both' ? 'Send' : channel === 'whatsapp' || isWhatsapp ? 'Send WhatsApp' : 'Send Mail'}</button>
      </footer></div>
    </dialog>, document.body,
  );
}
