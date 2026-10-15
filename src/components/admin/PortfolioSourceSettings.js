import React, { useState } from 'react';
import SummaryApi from '../../common';

export default function PortfolioSourceSettings({ item, onSaved }) {
  const [url, setUrl] = useState(item.projectLink || '');
  const [allowed, setAllowed] = useState(item.portfolioCaptureAllowed !== false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(`${SummaryApi.portfolioSource.url}/${item._id}/portfolio-source`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectLink: url, captureAllowed: allowed }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not save portfolio settings.');
      setMessage('Saved. This project will sync to the website admin as a draft.');
      if (onSaved) onSaved();
    } catch (cause) { setError(cause.message || 'Could not save.'); }
    finally { setBusy(false); }
  }
  return <details className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-slate-800">Portfolio website & screenshots</summary>
    <form onSubmit={save} className="mt-4 space-y-3">
      <label className="block text-sm text-slate-700">Public website URL<input type="url" maxLength={2000} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://client-website.com" className="mt-1 block w-full rounded-xl border border-slate-200 p-3" /></label>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allowed} onChange={event => setAllowed(event.target.checked)} />Automatically capture this public website</label>
      <p className="text-xs text-slate-500">Use manual screenshots for private or login-required projects. Review images and choose public visibility in the Next.js website admin.</p>
      <button type="submit" disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save portfolio source'}</button>
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    </form>
  </details>;
}
