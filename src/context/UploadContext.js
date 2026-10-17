import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { startUploadTiming } from '../utils/uploadTiming';
import { sendUpload } from '../utils/uploadTransport';

const UploadContext = createContext(null);
const activeStatuses = ['preparing', 'connecting', 'transferring', 'confirming_file', 'confirming', 'checking'];

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
    patch(entry.id, { status: 'complete', percent: 100, completedFiles: entry.totalFiles, result });
    // Release file bytes; successful retries are answered by the server record.
    entry.formData = null;
    entry.files = null;
    if (entry.surface === 'external' || ownerRef.current === entry.ownerId) {
      if (`${window.location.pathname}${window.location.search}` === entry.pagePath) entry.onSuccess?.(result);
      toast.success('Upload finished');
    }
  }, [patch]);

  const readStatus = useCallback(async entry => {
    const response = await fetch(`${entry.sessionUrl}/${entry.id}`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Upload status is unavailable. Please retry when connected.');
    return payload.data;
  }, []);

  const applyStatus = useCallback((entry, data) => {
    const received = new Set(data.files.filter(file => file.received).map(file => file.id));
    entry.received = received;
    const sentBytes = entry.manifest.files.reduce((sum, file) => sum + (received.has(file.id) ? file.size : 0), 0);
    patch(entry.id, {
      completedFiles: received.size,
      percent: entry.fileBytes ? Math.floor(sentBytes * 100 / entry.fileBytes) : 100,
      fileStates: entry.manifest.files.map(file => ({ id: file.id, name: file.name, percent: received.has(file.id) ? 100 : 0, received: received.has(file.id) })),
    });
    if (data.status === 'succeeded') { finish(entry, data.result); return true; }
    if (data.status !== 'processing') throw new Error('This upload session expired. Please start again.');
    return false;
  }, [finish, patch]);

  const execute = useCallback(async entry => {
    const version = entry.version = (entry.version || 0) + 1;
    entry.finished = false;
    entry.timing = startUploadTiming(`${entry.surface}_submit`, { fileCount: entry.totalFiles, fileBytes: entry.fileBytes });
    const live = () => current.current === entry && !entry.finished && version === entry.version;
    try {
      if (!entry.manifest) {
        patch(entry.id, { status: 'preparing', message: '' });
        const files = [];
        for (const file of entry.files) {
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          files.push({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size,
            sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') });
        }
        entry.manifest = { planId: entry.formData.get('planId'), serviceOrderId: entry.formData.get('serviceOrderId'),
          instructions: JSON.parse(entry.formData.get('instructions') || '[]'), files };
      }
      if (!live()) return;
      patch(entry.id, { status: 'connecting', message: '' });
      const beginUrl = new URL(entry.sessionUrl, window.location.origin);
      beginUrl.searchParams.set('uploadId', entry.id);
      let data;
      try {
        const response = await fetch(beginUrl, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entry.manifest), signal: AbortSignal.timeout(30000) });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not establish the upload connection');
        data = payload.data;
      } catch (error) {
        try { data = await readStatus(entry); } catch { throw error; }
      }
      if (!live() || applyStatus(entry, data)) return;
      for (let index = 0; index < entry.files.length; index++) {
        const file = entry.files[index];
        const descriptor = entry.manifest.files[index];
        if (entry.received.has(descriptor.id)) continue;
        const previousBytes = entry.manifest.files.reduce((sum, item) => sum + (entry.received.has(item.id) ? item.size : 0), 0);
        patch(entry.id, { status: 'transferring', currentFile: index + 1, currentName: file.name, currentPercent: 0 });
        const form = new FormData();
        form.append('file', file, file.name);
        let received;
        try {
          const { status, payload } = await sendUpload({ url: `${entry.sessionUrl}/${entry.id}/files/${descriptor.id}`, formData: form, timing: entry.timing,
            onTransfer: percent => {
              if (!live()) return;
              patch(entry.id, { status: percent === 100 ? 'confirming_file' : 'transferring', currentPercent: percent,
                percent: entry.fileBytes ? Math.floor((previousBytes + file.size * percent / 100) * 100 / entry.fileBytes) : 100,
                fileStates: entry.manifest.files.map(item => ({ id: item.id, name: item.name, received: entry.received.has(item.id),
                  percent: item.id === descriptor.id ? percent : entry.received.has(item.id) ? 100 : 0 })) });
            } });
          if (status >= 400 || !payload.success) throw new Error(payload.message || 'File receipt could not be confirmed');
          received = payload.data;
        } catch (error) {
          try {
            received = await readStatus(entry);
            if (!received.files.some(item => item.id === descriptor.id && item.received)) throw error;
          } catch { throw error; }
        }
        if (!live() || applyStatus(entry, received)) return;
      }
      patch(entry.id, { status: 'confirming', percent: 100 });
      try {
        const response = await fetch(`${entry.sessionUrl}/${entry.id}/complete`, { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(30000) });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Upload receipt could not be confirmed');
        if (live()) finish(entry, payload);
      } catch (error) {
        try { const status = await readStatus(entry); if (live() && applyStatus(entry, status)) return; } catch { /* Preserve the original failure. */ }
        throw error;
      }
    } catch (error) {
      if (!live()) return;
      entry.finished = true;
      entry.timing.finish('interrupted');
      patch(entry.id, { status: 'failed', message: error.message || 'Upload interrupted. Retry continues the same submission.' });
    }
  }, [applyStatus, finish, patch, readStatus]);

  const startUpload = useCallback(options => {
    if (current.current && !current.current.finished) throw new Error('An upload is already running. Open the upload panel to check it.');
    if (current.current && !['complete', 'failed'].includes(current.current.displayStatus)) {
      throw new Error('Resolve or dismiss the previous upload before starting another one.');
    }
    const id = crypto.randomUUID();
    const url = new URL(options.url, window.location.origin);
    url.searchParams.set('uploadId', id);
    if (!options.sessionUrl) throw new Error('Upload connection is unavailable');
    const entry = { ...options, files: options.formData.getAll('files'), sessionUrl: options.sessionUrl, id, ownerId: ownerRef.current, pagePath: `${window.location.pathname}${window.location.search}`, url: url.toString(), progressUrl: `${options.progressUrl}/${id}` };
    current.current = entry;
    setTask({ id, label: options.label, surface: options.surface, ownerId: entry.ownerId, totalFiles: options.totalFiles, completedFiles: 0, percent: 0, status: 'preparing' });
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
  const checkStatus = async () => {
    const entry = current.current;
    if (!entry) return;
    entry.finished = false;
    patch(entry.id, { status: 'checking' });
    try {
      if (!applyStatus(entry, await readStatus(entry))) {
        entry.finished = true;
        patch(entry.id, { status: 'failed', message: 'Received files are retained. Retry to continue this upload.' });
      }
    } catch (error) {
      entry.finished = true;
      patch(entry.id, { status: 'failed', message: error.message });
    }
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
  const label = task?.status === 'preparing' ? 'Preparing files…'
    : task?.status === 'connecting' ? 'Connecting…'
    : task?.status === 'transferring' ? `Uploading file ${task.currentFile} of ${task.totalFiles} — ${task.currentPercent}%`
    : task?.status === 'confirming_file' ? `Confirming file ${task.currentFile} of ${task.totalFiles}…`
    : task?.status === 'confirming' || task?.status === 'checking' ? 'Confirming upload…'
    : task?.status === 'complete' ? 'Upload finished ✓' : 'Upload needs attention';
  return <UploadContext.Provider value={{ startUpload, task }}>
    {children}
    {visible && <section aria-label="Upload progress" style={{ maxHeight: 'calc(100dvh - 7rem)', overflowY: 'auto' }} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-3 z-[100] w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-4 text-[var(--text-primary)] shadow-2xl sm:bottom-5 sm:right-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold" role="status">{label}</p>{!minimized && <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{task.label}</p>}</div>
        <button type="button" onClick={() => setMinimized(value => !value)} className="rounded-lg border border-[var(--glass-border)] px-3 py-1 text-sm">{minimized ? 'Expand' : 'Minimize'}</button>
      </div>
      {minimized && <p className="mt-1 text-sm">{task.completedFiles}/{task.totalFiles} files · Total {task.percent}%</p>}
      {!minimized && <>
        <div className="mt-3 flex justify-between text-sm"><span>Total upload</span><span>{task.percent}%</span></div>
        <progress aria-label="Total upload" className="mt-1 w-full accent-teal-600" value={task.percent} max="100" />
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{task.completedFiles} of {task.totalFiles} files uploaded</p>
        {task.fileStates?.length > 0 && <ul aria-label="File progress" className="mt-3 max-h-40 overflow-y-auto space-y-2">
          {task.fileStates.map(file => <li key={file.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{file.name}</span><span className="shrink-0">{file.received ? 'Uploaded ✓' : `${file.percent}%`}</span></li>)}
        </ul>}
        {active && <p className="mt-3 text-sm text-[var(--text-secondary)]">You can use other portal pages. Keep this browser page open until completion.</p>}
        {task.message && <p className="mt-3 text-sm">{task.message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {task.status === 'failed' && <button type="button" onClick={retry} className="rounded-lg bg-teal-700 px-3 py-2 text-white">Retry same upload</button>}
          {task.status === 'failed' && <button type="button" onClick={checkStatus} className="rounded-lg border border-[var(--glass-border)] px-3 py-2">Check status</button>}
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
