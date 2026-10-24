import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import SummaryApi from '../../common';

// Admin view of one customer's offer reservations: extend a deadline, or force-apply the saved
// reserved price to a project. The backend re-checks every rule; this screen only collects input.
const ist = value => `${new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;
const inr = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const STATUS = { reserved: 'Reserved', expired: 'Expired', confirmed: 'Price locked', under_review: 'Payment under review' };
const RESOLUTION = {
  repriced: 'Price revised after the deadline',
  unchanged: 'Deadline passed — price unchanged',
  needs_review: 'Needs admin review',
  force_applied: 'Reserved price applied by admin',
};
// datetime-local wants the admin's local wall-clock time without a zone.
const localInput = date => {
  const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const post = async (path, body) => {
  const response = await fetch(`${SummaryApi.offerReservations.url}${path}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
  return result.data;
};
const projectName = project => project?.projectSnapshot?.displayName || project?.projectSnapshot?.categoryLabel || 'Project';

function ExtendForm({ row, onDone }) {
  const [until, setUntil] = useState(localInput(Math.max(Date.now(), Date.parse(row.deadline)) + 24 * 3600000));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await post(`/${row.id}/extend`, { until: new Date(until).toISOString(), reason });
      toast.success(result.notice === 'sent' ? 'Reservation extended. The customer was emailed the new deadline.' : 'Reservation extended.');
      onDone();
    } catch (error) { toast.error(error.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="block text-sm font-medium text-slate-700">New payment deadline
        <input type="datetime-local" value={until} onChange={event => setUntil(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Reason (kept in the audit history)
        <textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={300} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <button type="submit" disabled={busy || !reason.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Extend reservation'}</button>
    </form>
  );
}

function ForceApplyForm({ row, projects, onDone }) {
  const choices = projects.filter(project => project.orderVisibility !== 'cancelled' && (!row.projectId || String(project._id) === row.projectId));
  const [orderId, setOrderId] = useState(row.projectId || '');
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const loadPreview = async () => {
    setBusy(true); setPreview(null);
    try { setPreview(await post(`/${row.id}/force-apply/preview`, { orderId })); }
    catch (error) { toast.error(error.message); } finally { setBusy(false); }
  };
  const apply = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await post(`/${row.id}/force-apply`, { orderId, reason, confirmSlug: confirm.trim(), expectedRevision: preview.pricingRevision });
      toast.success('Reserved price applied to the project.');
      onDone();
    } catch (error) { toast.error(error.message); setPreview(null); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <label className="block text-sm font-medium text-slate-700">Project
        <select value={orderId} onChange={event => { setOrderId(event.target.value); setPreview(null); }} disabled={Boolean(row.projectId)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
          <option value="">Choose a project</option>
          {choices.map(project => <option key={project._id} value={project._id}>{projectName(project)} — {inr(project.totalAmount)}</option>)}
        </select>
      </label>
      <button type="button" onClick={loadPreview} disabled={busy || !orderId} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">{busy && !preview ? 'Checking…' : 'Show what will change'}</button>
      {preview && (
        <form onSubmit={apply} className="space-y-2">
          <div className="rounded-lg bg-white p-3 text-sm text-slate-800">
            <p>Project price: <strong>{inr(preview.before.finalPrice)}</strong> → <strong>{inr(preview.after.finalPrice)}</strong></p>
            <p>First bill: {inr(preview.before.firstBill)} → {inr(preview.after.firstBill)}</p>
            {preview.after.installments.length > 0 && <p>Installments: {preview.after.installments.map(inr).join(' + ')}</p>}
            <p className="mt-1 text-slate-600">{preview.note}</p>
          </div>
          <label className="block text-sm font-medium text-slate-700">Reason (kept in the audit history)
            <textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={300} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">To confirm, type the offer code <code className="rounded bg-white px-1">{preview.offerSlug}</code>
            <input value={confirm} onChange={event => setConfirm(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" disabled={busy || !reason.trim() || confirm.trim() !== preview.offerSlug} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Applying…' : 'Apply reserved price'}</button>
        </form>
      )}
    </div>
  );
}

export default function ReservedOffersPanel({ customerId, projects = [], onChanged }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${SummaryApi.offerReservations.url}/user/${customerId}`, { credentials: 'include', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Reserved offers could not be loaded');
      setRows(result.data.reservations || []); setError('');
    } catch (err) { setError(err.message); }
  }, [customerId]);
  useEffect(() => { if (customerId) void load(); }, [customerId, load]);
  const done = () => { setOpen({}); void load(); if (onChanged) onChanged(); };
  if (error) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!rows?.length) return null;
  const toggle = (id, form) => setOpen(current => ({ ...current, [id]: current[id] === form ? null : form }));
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Reserved offers</h3>
      <p className="text-sm text-slate-500">Reservations stay here as history. Times are India time.</p>
      <ul className="mt-4 space-y-3">
        {rows.map(row => {
          const canExtend = !row.confirmedAt && row.status !== 'confirmed' && (!row.resolution || row.resolution === 'unchanged');
          const canForce = row.status !== 'confirmed' && row.resolution !== 'force_applied';
          const project = projects.find(item => String(item._id) === row.projectId);
          return (
            <li key={row.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{row.title} · {inr(row.reservedPrice)}</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{STATUS[row.status] || row.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">Reserved {ist(row.reservedAt)} · Deadline {ist(row.deadline)}{row.extendedUntil ? ` (original ${ist(row.expiresAt)})` : ''}</p>
              <p className="text-sm text-slate-600">{project ? `Project: ${projectName(project)}` : row.projectId ? 'Linked to a project' : 'No project yet'}</p>
              {row.resolution && <p className="text-sm font-medium text-amber-700">{RESOLUTION[row.resolution] || row.resolution}{row.resolutionNote ? ` — ${row.resolutionNote}` : ''}</p>}
              {row.extensions?.length > 0 && <p className="text-xs text-slate-500">Extended {row.extensions.length} time(s); last reason: {row.extensions[row.extensions.length - 1].reason}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {canExtend && <button type="button" onClick={() => toggle(row.id, 'extend')} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800">Extend deadline</button>}
                {canForce && <button type="button" onClick={() => toggle(row.id, 'force')} className="rounded-xl border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800">Apply reserved price…</button>}
              </div>
              {open[row.id] === 'extend' && <ExtendForm row={row} onDone={done} />}
              {open[row.id] === 'force' && <ForceApplyForm row={row} projects={projects} onDone={done} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
