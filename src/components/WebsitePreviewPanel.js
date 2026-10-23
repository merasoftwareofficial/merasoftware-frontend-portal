import React, { useCallback, useEffect, useRef, useState } from 'react';
import { put } from '@vercel/blob/client';
import { previewRequest, previewServiceRequest } from '../helpers/websitePreviewApi';
import WebsitePreviewViewer from './WebsitePreviewViewer';

export default function WebsitePreviewPanel({ projectId, admin = false }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [host, setHost] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [open, setOpen] = useState(false);
  const worker = useRef(null), abort = useRef(null), alive = useRef(true), fileInput = useRef(null);
  const load = useCallback(async () => { const value = await previewRequest(projectId); if (alive.current) { setData(value); setHost(value.host || ''); } }, [projectId]);
  useEffect(() => { alive.current = true; setData(null); setOpen(false); load().catch(e => { if (alive.current) setError(e.message); });
    return () => { alive.current = false; worker.current?.terminate(); abort.current?.abort(); }; }, [load]);
  async function mutate(body) { setBusy(true); setError(''); try { await previewRequest(projectId, '', { method: 'PATCH', body: JSON.stringify(body) }); await load(); } catch (e) { setError(e.message); } finally { if (alive.current) setBusy(false); } }
  async function upload(file) {
    if (!file || !data) return;
    setBusy(true); setError(''); setNotice(''); setProgress('Checking and extracting website ZIP…'); abort.current = new AbortController();
    try {
      if (file.size > data.policy.zipBytes) throw new Error(`ZIP exceeds the ${Math.round(data.policy.zipBytes / 1024 ** 2)} MiB compressed size limit.`);
      const buffer = await file.arrayBuffer();
      const files = await new Promise((resolve, reject) => {
        worker.current = new Worker(new URL('../workers/websitePreview.worker.js', import.meta.url));
        worker.current.onmessage = event => { worker.current.terminate(); worker.current = null; event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.files); };
        worker.current.onerror = () => { worker.current?.terminate(); worker.current = null; reject(new Error('Website ZIP could not be extracted.')); };
        abort.current.signal.addEventListener('abort', () => { worker.current?.terminate(); worker.current = null; reject(new Error('Upload cancelled. Your previous preview is unchanged.')); }, { once: true });
        worker.current.postMessage({ buffer, policy: data.policy }, [buffer]);
      });
      const uploadState = await previewRequest(projectId, '/uploads', { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), files: files.map(({ path, size }) => ({ path, size })) }), signal: abort.current.signal });
      const batch = () => previewRequest(projectId, `/uploads/${uploadState.versionId}/tokens`, { method: 'POST', body: '{}', signal: abort.current.signal });
      let scope = await batch();
      const tokenData = await previewServiceRequest(data.serviceUrl, 'tokens', scope, abort.current.signal);
      const byPath = new Map(tokenData.tokens.map(t => [t.path, t])); let next = 0, done = 0;
      await Promise.all(Array.from({ length: Math.min(data.policy.concurrency, files.length) }, async () => {
        while (next < files.length) {
          if (abort.current.signal.aborted) throw new Error('Upload cancelled.');
          const file = files[next++], spec = byPath.get(file.path);
          await put(spec.key, new Blob([file.buffer], { type: spec.contentType }), { access: 'private', token: spec.token,
            contentType: spec.contentType, abortSignal: abort.current.signal });
          done++; if (alive.current) setProgress(`Uploaded ${done} of ${files.length} files`);
        }
      }));
      setProgress('Verifying files and activating the website…');
      scope = await batch(); // Fresh short-lived finalization capability, even after a long upload.
      await previewServiceRequest(data.serviceUrl, 'complete', { capability: scope.capability }, abort.current.signal);
      if (alive.current) { setNotice('Website uploaded and verified. Client visibility is unchanged.'); await load(); }
    } catch (e) { abort.current?.abort(); if (alive.current) setError(e.message || 'Website upload failed. Your previous preview is unchanged.'); }
    finally { worker.current?.terminate(); worker.current = null; if (alive.current) { setBusy(false); setProgress(''); if (fileInput.current) fileInput.current.value = ''; } }
  }
  async function cleanup() { setBusy(true); setError(''); try {
    const batch = await previewRequest(projectId, '/cleanup', { method: 'POST', body: '{}' });
    const result = await previewServiceRequest(data.serviceUrl, 'cleanup', batch);
    setNotice(`${result.cleaned} expired website upload(s) cleaned.`);
  } catch (e) { setError(e.message); } finally { if (alive.current) setBusy(false); } }
  if (!admin && (!data?.available || (error && !open))) return null;
  if (!data) return admin ? <p className="my-4 text-base" role="status">{error || 'Loading website preview…'}</p> : null;
  return <section className="my-5 rounded-2xl border border-slate-300 bg-white p-5 text-slate-900" aria-label="Website preview management">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Website Preview</h2><p className="mt-1 text-base text-slate-600">{admin ? 'Upload a static website for this project. Files are stored privately on Vercel.' : 'Explore the website prepared for your project.'}</p></div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{data.visible ? 'Visible to client' : 'Hidden from client'}</span></div>
    {admin && <>
      {!data.configured && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-base">Preview storage and service credentials need setup before uploads can start.</p>}
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); mutate({ host }); }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Project preview hostname<input className="mt-1 block w-full rounded-lg border p-2 text-base" value={host} onChange={e => setHost(e.target.value)} placeholder="deepinteriors-preview.merasoftware.com" disabled={busy || Boolean(data.host)} required /></label>
        {!data.host && <button className="rounded-lg border px-4 py-2 text-base" disabled={busy}>Save hostname</button>}
      </form><p className="mt-2 text-sm text-slate-500">This hostname must be connected to the Next.js Vercel project with working HTTPS.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className={`rounded-lg bg-slate-900 px-4 py-2 text-base text-white ${busy || !data.configured || !data.host ? 'opacity-50' : 'cursor-pointer'}`}>{data.currentVersion ? 'Replace Website ZIP' : 'Upload Website ZIP'}
          <input ref={fileInput} type="file" accept=".zip,application/zip" className="sr-only" disabled={busy || !data.configured || !data.host} onChange={e => upload(e.target.files?.[0])} /></label>
        <button className="rounded-lg border px-4 py-2 text-base" disabled={busy || !data.currentVersion} onClick={() => mutate({ visible: !data.visible })}>{data.visible ? 'Hide from Client' : 'Show to Client'}</button>
        <button className="rounded-lg border px-4 py-2 text-base" disabled={busy || !data.configured} onClick={cleanup}>Clean expired uploads</button>
        {busy && progress && <button className="rounded-lg border px-4 py-2 text-base" onClick={() => abort.current?.abort()}>Cancel upload</button>}
      </div>
    </>}
    {data.available && !open && <button className="mt-4 rounded-lg border px-4 py-2 text-base" onClick={() => setOpen(true)}>View Website Preview</button>}
    {progress && <p className="mt-4 text-base" role="status">{progress}</p>}{notice && <p className="mt-4 text-base text-emerald-700" role="status">{notice}</p>}{error && <p className="mt-4 text-base text-red-700" role="alert">{error}</p>}
    {open && <WebsitePreviewViewer projectId={projectId} onClose={() => setOpen(false)} />}
  </section>;
}
