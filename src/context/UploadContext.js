import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { startUploadTiming } from '../utils/uploadTiming';
import { sendUpload } from '../utils/uploadTransport';

const UploadContext = createContext(null);
const activeStatuses = ['transferring', 'saving', 'checking'];

export function UploadProvider({ children }) {
  const [task, setTask] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const current = useRef(null);
  const ownerId = useSelector(state => state?.user?.user?._id);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const patch = useCallback((id, values) => {
    if (current.current?.id === id) {
      if (values.status) current.current.displayStatus = values.status;
      setTask(previous => previous?.id === id ? { ...previous, ...values } : previous);
    }
  }, []);

  const finish = useCallback((entry, result) => {
    if (current.current !== entry || entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.pollTimer);
    entry.pollController?.abort();
    entry.timing?.finish('success');
    patch(entry.id, { status: 'complete', completedFiles: entry.totalFiles, result });
    // Release file bytes; successful retries are answered by the server record.
    entry.formData = null;
    if (entry.surface === 'external' || ownerRef.current === entry.ownerId) {
      if (`${window.location.pathname}${window.location.search}` === entry.pagePath) entry.onSuccess?.(result);
      toast.success('Data uploaded and saved successfully');
    }
  }, [patch]);

  const poll = useCallback(async (entry, version = entry.version) => {
    if (current.current !== entry || entry.finished || version !== entry.version) return;
    entry.pollController = new AbortController();
    const pollTimeout = setTimeout(() => entry.pollController?.abort(), 10000);
    try {
      const response = await fetch(entry.progressUrl, { credentials: 'include', cache: 'no-store', signal: entry.pollController.signal });
      const payload = await response.json();
      if (current.current !== entry || entry.finished || version !== entry.version) return;
      if (response.ok && payload.success) {
        const data = payload.data;
        patch(entry.id, { completedFiles: data.completedFiles, phase: data.phase });
        if (data.status === 'succeeded') { finish(entry, data.result); return; }
        if (data.status === 'failed' || data.status === 'needs_review') {
          entry.finished = true;
          entry.timing?.finish('failed');
          patch(entry.id, { status: data.status === 'failed' ? 'failed' : 'needs_review', message: data.status === 'failed' ? 'Upload could not be saved. Retry uses the same submission.' : 'This upload needs a status check. Contact support before submitting again.' });
          return;
        }
      } else if (entry.transportEnded) {
        entry.finished = true;
        entry.timing?.finish('status_unavailable');
        patch(entry.id, { status: response.status === 404 ? 'failed' : 'unknown', message: response.status === 404 ? 'Upload was not received yet. Retry keeps the same submission identifier.' : 'Upload status is unavailable. Check status before starting another submission.' });
        return;
      }
    } catch (error) {
      if (current.current !== entry || entry.finished || version !== entry.version) return;
      if (entry.transportEnded) {
        entry.finished = true;
        patch(entry.id, { status: 'unknown', message: 'Connection unavailable. Check status when you are online.' });
        return;
      }
    } finally { clearTimeout(pollTimeout); }
    if (!entry.finished && current.current === entry && version === entry.version) entry.pollTimer = setTimeout(() => poll(entry, version), 1500);
  }, [finish, patch]);

  const execute = useCallback(async entry => {
    const version = entry.version = (entry.version || 0) + 1;
    entry.finished = false;
    entry.transportEnded = false;
    entry.timing = startUploadTiming(`${entry.surface}_submit`, { fileCount: entry.totalFiles, fileBytes: entry.fileBytes });
    patch(entry.id, { status: 'transferring', percent: 0, completedFiles: 0, message: '' });
    let polling = false;
    const startPolling = () => { if (!polling) { polling = true; void poll(entry); } };
    try {
      const { status, payload } = await sendUpload({ url: entry.url, formData: entry.formData, timing: entry.timing,
        onTransfer: percent => {
          if (entry.finished || current.current !== entry || version !== entry.version) return;
          patch(entry.id, { percent, status: percent === 100 ? 'saving' : 'transferring' });
          if (percent === 100) startPolling();
        },
      });
      if (entry.finished || current.current !== entry || version !== entry.version) return;
      entry.transportEnded = true;
      if (payload.success) { finish(entry, payload); return; }
      if (status === 202 || status >= 500) { patch(entry.id, { status: 'checking' }); startPolling(); return; }
      entry.finished = true;
      clearTimeout(entry.pollTimer);
      entry.pollController?.abort();
      entry.timing.finish('failed');
      patch(entry.id, { status: 'failed', message: payload.message || 'Upload was refused. Please check your files and access.' });
    } catch (error) {
      if (entry.finished || current.current !== entry || version !== entry.version) return;
      entry.transportEnded = true;
      patch(entry.id, { status: 'checking', message: error.message });
      startPolling();
    }
  }, [finish, patch, poll]);

  const startUpload = useCallback(options => {
    if (current.current && !current.current.finished) throw new Error('An upload is already running. Open the upload panel to check it.');
    if (current.current && !['complete', 'failed'].includes(current.current.displayStatus)) {
      throw new Error('Resolve or dismiss the previous upload before starting another one.');
    }
    const id = crypto.randomUUID();
    const url = new URL(options.url, window.location.origin);
    url.searchParams.set('uploadId', id);
    const entry = { ...options, id, ownerId: ownerRef.current, pagePath: `${window.location.pathname}${window.location.search}`, url: url.toString(), progressUrl: `${options.progressUrl}/${id}` };
    current.current = entry;
    setTask({ id, label: options.label, surface: options.surface, ownerId: entry.ownerId, totalFiles: options.totalFiles, completedFiles: 0, percent: 0, status: 'transferring' });
    setMinimized(false);
    void execute(entry);
    return id;
  }, [execute]);

  const retry = () => {
    const entry = current.current;
    if (!entry?.formData || !entry.finished) return;
    clearTimeout(entry.pollTimer);
    entry.pollController?.abort();
    void execute(entry);
  };
  const checkStatus = () => {
    const entry = current.current;
    if (!entry) return;
    clearTimeout(entry.pollTimer);
    entry.pollController?.abort();
    entry.finished = false;
    entry.version = (entry.version || 0) + 1;
    entry.transportEnded = true;
    patch(entry.id, { status: 'checking' });
    void poll(entry);
  };
  useEffect(() => {
    if (!task || !activeStatuses.includes(task.status)) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [task]);
  useEffect(() => () => {
    if (current.current) current.current.finished = true;
    clearTimeout(current.current?.pollTimer);
    current.current?.pollController?.abort();
  }, []);

  const visible = task && (task.surface === 'external' || task.ownerId === ownerId);
  const active = task && activeStatuses.includes(task.status);
  const label = task?.status === 'transferring' ? `Uploading to server: ${task.percent}%`
    : task?.status === 'complete' ? 'Upload complete'
    : task?.status === 'saving' || task?.status === 'checking'
      ? task.phase === 'finalizing' ? 'Saving submission…' : `Saving files: ${task.completedFiles}/${task.totalFiles}`
      : 'Upload needs attention';
  return <UploadContext.Provider value={{ startUpload, task }}>
    {children}
    {visible && <section aria-label="Upload progress" className="fixed bottom-20 right-3 z-[100] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-4 text-[var(--text-primary)] shadow-2xl sm:bottom-5 sm:right-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold" role="status">{label}</p>{!minimized && <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{task.label}</p>}</div>
        <button type="button" onClick={() => setMinimized(value => !value)} className="rounded-lg border border-[var(--glass-border)] px-3 py-1 text-sm">{minimized ? 'Expand' : 'Minimize'}</button>
      </div>
      {!minimized && <>
        {task.status === 'transferring' && <progress aria-label="Bytes sent to server" className="mt-3 w-full accent-teal-600" value={task.percent} max="100" />}
        {active && <p className="mt-3 text-sm text-[var(--text-secondary)]">You can use other portal pages. Keep this browser page open until completion.</p>}
        {task.message && <p className="mt-3 text-sm">{task.message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {task.status === 'failed' && <button type="button" onClick={retry} className="rounded-lg bg-teal-700 px-3 py-2 text-white">Retry same upload</button>}
          {['unknown', 'needs_review'].includes(task.status) && <button type="button" onClick={checkStatus} className="rounded-lg border border-[var(--glass-border)] px-3 py-2">Check status</button>}
          {['complete', 'failed'].includes(task.status) && <button type="button" onClick={() => { current.current = null; setTask(null); }} className="rounded-lg border border-[var(--glass-border)] px-3 py-2">Dismiss</button>}
        </div>
      </>}
    </section>}
  </UploadContext.Provider>;
}

export const useUploads = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error('UploadProvider is missing');
  return context;
};
