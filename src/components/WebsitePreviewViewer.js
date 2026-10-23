import React, { useEffect, useRef, useState } from 'react';
import { previewRequest } from '../helpers/websitePreviewApi';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
export default function WebsitePreviewViewer({ projectId, onClose }) {
  const handoff = useRef(null), pending = useRef(null), timer = useRef(null), version = useRef(null);
  const [src, setSrc] = useState(''), [error, setError] = useState(''), [mobile, setMobile] = useState(false), [expanded, setExpanded] = useState(false);
  const [handoffName] = useState(() => `website-preview-${crypto.randomUUID()}`);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; let submittedForm; const controller = new AbortController(); const timeout = { id: null };
    const name = handoffName;
    async function renew() {
      try {
        const nonce = crypto.randomUUID();
        const grant = await previewRequest(projectId, '/grant', { method: 'POST', body: JSON.stringify({ nonce }), signal: controller.signal });
        if (!alive) return;
        pending.current = { ...grant, nonce };
        const form = document.createElement('form'); form.method = 'POST'; form.action = `${grant.origin}/__website-preview/bootstrap`; form.target = name; form.hidden = true;
        const input = document.createElement('input'); input.name = 'token'; input.value = grant.token; form.append(input); document.body.append(form); submittedForm = form; form.submit();
        // Keep the form connected until navigation completes; early removal can cancel iframe POSTs.
        timeout.id = setTimeout(() => { submittedForm?.remove(); if (alive) { setError('Preview connection timed out. Try again.'); setSrc(''); } }, 18000);
      } catch (e) { if (alive) { setError(e.message); setSrc(''); } }
    }
    function ready(event) {
      const p = pending.current;
      if (!alive || !p || event.origin !== p.origin || event.source !== handoff.current?.contentWindow || event.data?.type !== 'website-preview-ready' || event.data.nonce !== p.nonce) return;
      clearTimeout(timeout.id); submittedForm?.remove(); pending.current = null; setError('');
      if (version.current !== event.data.versionId) { setSrc(`${p.origin}/?previewVersion=${encodeURIComponent(event.data.versionId)}`); version.current = event.data.versionId; }
      timer.current = setTimeout(renew, p.renewMs);
    }
    version.current = null; setSrc(''); setError(''); window.addEventListener('message', ready); renew();
    return () => { alive = false; controller.abort(); submittedForm?.remove(); clearTimeout(timer.current); clearTimeout(timeout.id); pending.current = null; window.removeEventListener('message', ready); };
  }, [projectId, retry, handoffName]);
  return <section aria-label="Website preview" className={`${expanded ? 'fixed inset-3 z-[100] overflow-auto shadow-2xl' : 'mt-5'} rounded-2xl border border-slate-300 bg-white p-4 text-slate-900`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Website Preview</h3><div className="flex flex-wrap gap-2">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setMobile(!mobile)}>{mobile ? 'Desktop view' : 'Mobile view'}</button>
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setExpanded(!expanded)}>{expanded ? 'Exit expanded view' : 'Expand preview'}</button>
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>Close preview</button>
    </div></div>
    <iframe ref={handoff} name={handoffName} title="Website preview authorization" sandbox={SANDBOX} hidden />
    {error ? <div role="alert" className="rounded-xl bg-amber-50 p-4"><p className="text-base">{error}</p><button className="mt-3 rounded-lg border px-4 py-2 text-base" onClick={() => setRetry(n => n + 1)}>Try again</button></div>
      : src ? <div className="overflow-auto bg-slate-100"><iframe src={src} title="Your website" sandbox={SANDBOX} referrerPolicy="no-referrer" className="mx-auto block border-0 bg-white" style={{ width: mobile ? 'min(390px, 100%)' : '100%', height: expanded ? 'calc(100vh - 150px)' : '72vh', minHeight: '420px' }} /></div>
        : <p className="py-8 text-base" role="status">Opening your private website preview…</p>}
  </section>;
}
