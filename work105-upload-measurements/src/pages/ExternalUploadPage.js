import { useEffect, useRef, useState } from 'react';
import { FileText, LockKeyhole, ShieldCheck, Upload, X } from 'lucide-react';
import { ThemeProvider } from '../context/ThemeContext';
import SummaryApi from '../common';

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.message || 'Request failed');
  return payload;
};

const ExternalUploadContent = () => {
  const [stage, setStage] = useState('loading');
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const loadSession = async () => {
    const payload = await requestJson(SummaryApi.externalUploadSession.url);
    if (payload.data.requiresCredentials) {
      setStage('credentials');
      return;
    }
    setContext(payload.data.context);
    setStage('upload');
  };

  useEffect(() => {
    let active = true;
    const start = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const token = hash.get('token');
      if (token) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      try {
        if (token) {
          const payload = await requestJson(SummaryApi.externalUploadExchange.url, {
            method: SummaryApi.externalUploadExchange.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!active) return;
          if (payload.data.requiresCredentials) {
            setStage('credentials');
            return;
          }
        }
        await loadSession();
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'This upload link is unavailable');
        setStage('error');
      }
    };
    start();
    return () => { active = false; };
    // The bootstrap runs exactly once for the fragment supplied to this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyCredentials = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJson(SummaryApi.externalUploadCredentials.url, {
        method: SummaryApi.externalUploadCredentials.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      await loadSession();
    } catch (requestError) {
      setError(requestError.message || 'Credential verification failed');
    } finally {
      setBusy(false);
    }
  };

  const selectFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    const maxFiles = Number(context?.limits?.maxFiles || 0);
    const maxBytes = Number(context?.limits?.maxFileSizeBytes || 0);
    if (files.length + selected.length > maxFiles) {
      setError(`Maximum ${maxFiles} files are allowed per upload`);
    } else if (selected.some((file) => file.size > maxBytes)) {
      setError('One or more files exceed the 5 MB limit');
    } else {
      setError('');
      setFiles((current) => [...current, ...selected]);
    }
    event.target.value = '';
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || (!files.length && !instructions.trim())) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      const notes = instructions.trim() ? [{ text: instructions.trim(), timestamp: new Date().toISOString() }] : [];
      formData.append('instructions', JSON.stringify(notes));
      files.forEach((file) => formData.append('files', file, file.name));
      const payload = await requestJson(SummaryApi.externalUploadSubmit.url, {
        method: SummaryApi.externalUploadSubmit.method,
        body: formData,
      });
      setContext((current) => ({ ...current, requestId: payload.data?.requestId }));
      setStage('success');
    } catch (requestError) {
      setError(requestError.message || 'Upload could not be submitted');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)] px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 shadow-[var(--card-shadow)] backdrop-blur-xl sm:p-8">
        <div className="flex items-start gap-3 border-b border-[var(--divider)] pb-5">
          <ShieldCheck className="mt-0.5 text-emerald-500" size={26} />
          <div><h1 className="text-xl font-bold">Secure Data Upload</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Restricted upload access only. This link does not open the client portal.</p></div>
        </div>

        {stage === 'loading' && <p className="py-12 text-center text-sm text-[var(--text-secondary)]">Verifying secure link…</p>}

        {stage === 'error' && <div className="mt-6 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        {stage === 'credentials' && (
          <form onSubmit={verifyCredentials} className="mt-6 space-y-4">
            <div className="flex items-center gap-2"><LockKeyhole size={18} className="text-amber-500" /><h2 className="font-bold">Client verification required</h2></div>
            <p className="text-sm text-[var(--text-secondary)]">Enter the client portal email and password. Verification grants upload access only.</p>
            <label className="block"><span className="mb-1 block text-sm font-semibold">Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2.5" /></label>
            <label className="block"><span className="mb-1 block text-sm font-semibold">Password</span><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2.5" /></label>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Verifying…' : 'Verify and continue'}</button>
          </form>
        )}

        {stage === 'upload' && context && (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Selected {context.target.kind}</p><h2 className="mt-1 text-lg font-bold">{context.target.name}</h2></div>
            {!context.canUpload ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{context.refusal}</div> : <>
              <label className="block rounded-2xl border-2 border-dashed border-[var(--glass-border-strong)] p-6 text-center">
                <Upload className="mx-auto text-emerald-500" size={32} />
                <span className="mt-2 block text-sm font-semibold">Choose files ({files.length}/{context.limits.maxFiles})</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">JPG, TXT, RTF, PDF, DOC or DOCX · maximum 5 MB each</span>
                <input ref={fileInputRef} type="file" multiple accept={context.limits.extensions.join(',')} onChange={selectFiles} className="hidden" />
              </label>
              {files.length > 0 && <div className="divide-y divide-[var(--divider)] rounded-2xl border border-[var(--glass-border)]">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 p-3"><FileText size={17} className="text-emerald-500" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={17} /></button></div>)}</div>}
              <label className="block"><span className="mb-1 block text-sm font-semibold">Instructions</span><textarea rows={5} value={instructions} onChange={(event) => setInstructions(event.target.value)} className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2.5" placeholder="Add instructions for the admin" /></label>
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <button disabled={busy || (!files.length && !instructions.trim())} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Submitting…' : 'Submit data securely'}</button>
            </>}
          </form>
        )}

        {stage === 'success' && <div className="py-12 text-center"><ShieldCheck className="mx-auto text-emerald-500" size={44} /><h2 className="mt-4 text-xl font-bold">Data submitted successfully</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">The submission is now available to the admin.</p></div>}
      </div>
    </main>
  );
};

const ExternalUploadPage = () => <ThemeProvider><ExternalUploadContent /></ThemeProvider>;

export default ExternalUploadPage;
