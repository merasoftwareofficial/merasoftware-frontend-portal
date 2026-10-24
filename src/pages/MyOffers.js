import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import { WEBSITE_URL } from '../helpers/brand';

const date = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
const money = value => `₹${Number(value).toLocaleString('en-IN')}`;
export default function MyOffers() {
  const user = useSelector(state => state?.user?.user);
  const [list, setList] = useState(null);
  const rows = list?.userId === user?._id ? list.items : null;
  const [error, setError] = useState('');
  const [clock, setClock] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(SummaryApi.offerReservations.url, { credentials: 'include', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not load your offers');
      setList({ userId: user?._id, items: result.data.reservations }); setClock({ server: Date.parse(result.data.serverNow), client: performance.now() }); setError('');
    } catch (err) { setError(err.message || 'Could not load your offers'); }
  }, [user?._id]);
  useEffect(() => {
    void refresh(); const timer = setInterval(() => void refresh(), 60000);
    const tickTimer = setInterval(() => setTick(value => value + 1), 1000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); clearInterval(tickTimer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  const now = clock ? clock.server + performance.now() - clock.client : 0;
  const content = <main className="mx-auto w-full max-w-4xl p-6" data-clock-tick={tick}>
    <h1 className="text-2xl font-bold">My offers</h1>
    <p className="mt-2">Your reservations and payment deadlines. Expired offers stay in your history.</p>
    {error && <p role="alert" className="mt-4">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>}
    {!rows && !error && <p className="mt-4">Loading your offers…</p>}
    {rows?.length === 0 && <p className="mt-4">You have no reserved offers yet.</p>}
    {rows?.map(row => {
      // The deadline in force (an admin extension moves it); the original stays as history.
      const due = row.deadline || row.expiresAt;
      const seconds = Math.max(0, Math.ceil((Date.parse(due) - now) / 1000));
      // under_review: a payment submitted before the deadline awaits approval; the price stays held.
      const review = row.status === 'under_review';
      const expired = row.status !== 'confirmed' && !review && seconds === 0;
      return <article key={row.id} className={`my-4 rounded-2xl border p-6 ${expired ? 'border-gray-300 bg-gray-100 text-gray-500' : 'border-[var(--field-border)] bg-[var(--glass-bg)]'}`}>
        <h2 className="text-xl font-semibold">{row.title}</h2>
        <p className="mt-2 font-semibold">{expired ? 'Expired' : row.status === 'confirmed' ? 'Price locked' : review ? 'Payment under review' : 'Reserved'} · {money(row.reservedPrice)}</p>
        {!expired && row.status === 'reserved' && <p>{Math.floor(seconds / 3600)}h {Math.floor(seconds % 3600 / 60)}m {seconds % 60}s remaining</p>}
        {review && <p className="mt-2">Your payment was submitted before the deadline and is being verified. Your reserved price is held.</p>}
        <p className="mt-3">Reserved: {date(row.reservedAt)}<br />Payment deadline: {date(due)}{row.extendedUntil ? ' (extended by our team)' : ''}</p>
        {!row.projectId && !expired && <p className="mt-3">Our team will help you create your project and complete payment.</p>}
        <details className="mt-3"><summary>Reserved terms</summary><ul className="list-disc pl-5">{row.terms.map((term, index) => <li key={index}>{term}</li>)}</ul></details>
      </article>;
    })}
    {user?.role === 'customer' ? <Link className="mt-4 inline-block underline" to="/dashboard">Back to dashboard</Link> : <a className="mt-4 inline-block underline" href={WEBSITE_URL}>Back to website</a>}
  </main>;
  return user?.role === 'customer' ? <DashboardLayout>{content}</DashboardLayout> : content;
}
