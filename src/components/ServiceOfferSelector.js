import React, { useEffect, useState } from 'react';
import SummaryApi from '../common';
import Spinner from './Spinner';
// `disabled`: the parent is busy (a payment is being sent), so the offer cannot change under it.
export default function ServiceOfferSelector({ planId, onChange, disabled = false }) {
  const [offers, setOffers] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    onChange(null); setSelected(''); setOffers([]); setError('');
    if (!planId) return;
    const controller = new AbortController(); setLoading(true);
    fetch(`${SummaryApi.servicePlanOffers.url}/${planId}`, { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Payment offers unavailable');
      setOffers(result.data || []);
    }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [planId, onChange, reload]);
  const offer = offers.find(item => item.slug === selected);
  return <div className="my-4 space-y-2 text-base">
    <label className="block">Payment offer (optional){loading && <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-sm text-[var(--text-muted)]" role="status"><Spinner />Loading offers…</span>}<select aria-label="Service payment offer" className="mt-2 w-full rounded-xl border p-3 text-[var(--text-primary)] bg-[var(--glass-bg)]" disabled={loading || disabled} value={selected} onChange={event => { setSelected(event.target.value); onChange(offers.find(item => item.slug === event.target.value) || null); }}><option value="">No offer — standard payment</option>{offers.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>
    {error && <p role="alert">{error}. <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>Retry offers</button></p>}
    {offer && <p>{offer.paymentPolicy.mode.replaceAll('_', ' ')} · Payment due in {offer.paymentPolicy.dueDays} day(s).{offer.paymentPolicy.mode === 'limited_uploads' ? ` ${offer.paymentPolicy.uploadAllowance} submissions before payment.` : ''} Existing billing price and service quota apply.</p>}
  </div>;
}
