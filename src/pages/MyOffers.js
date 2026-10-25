import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import GlassPageState from '../components/GlassPageState';
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, Tag } from 'lucide-react';
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
  // DashboardLayout already owns the customer's main landmark.
  const ContentTag = user?.role === 'customer' ? 'section' : 'main';
  const content = <ContentTag className="min-h-full px-3 py-4 text-[var(--text-primary)] sm:px-5 lg:px-8 lg:py-7" aria-labelledby="my-offers-title" data-clock-tick={tick}>
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 text-center">
        <h1 id="my-offers-title" className="text-2xl font-bold tracking-tight sm:text-3xl">My offers</h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-[var(--text-secondary)]">Your reservations and payment deadlines. Expired offers stay in your history.</p>
      </header>

      {error && (rows ? (
        <Surface role="alert" size="compact" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-[var(--badge-error-fg)]">{error}</p>
          <GlassButton onClick={() => void refresh()}><RefreshCw size={16} />Retry</GlassButton>
        </Surface>
      ) : (
        <div role="alert"><GlassPageState type="error" message={error} onRetry={() => void refresh()} /></div>
      ))}
      {!rows && !error && <div role="status"><GlassPageState message="Loading your offers…" /></div>}
      {rows?.length === 0 && (
        <Surface radius="panel" className="flex flex-col items-center px-6 py-14 text-center">
          <Tag size={36} className="mb-4 text-[var(--text-muted)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">You have no reserved offers yet.</h2>
          <p className="mt-2 max-w-md text-base text-[var(--text-secondary)]">Your reserved offers and their payment deadlines will appear here.</p>
        </Surface>
      )}
      <div className="space-y-5">{rows?.map(row => {
      // The deadline in force (an admin extension moves it); the original stays as history.
      const due = row.deadline || row.expiresAt;
      const seconds = Math.max(0, Math.ceil((Date.parse(due) - now) / 1000));
      // under_review: a payment submitted before the deadline awaits approval; the price stays held.
      const review = row.status === 'under_review';
      const expired = row.status !== 'confirmed' && !review && seconds === 0;
      const locked = row.status === 'confirmed';
      return <Surface as="article" key={row.id} tone={expired ? 'subtle' : 'base'} radius="panel" size="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className={`break-words text-xl font-semibold ${expired ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>{row.title}</h2>
            <div className="mt-3"><Badge tone={expired ? 'neutral' : locked ? 'success' : 'pending'} icon={locked ? CheckCircle2 : expired ? Tag : Clock3}>
              {expired ? 'Expired' : locked ? 'Price locked' : review ? 'Payment under review' : 'Reserved'}
            </Badge></div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-sm text-[var(--text-secondary)]">Reserved price</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${expired ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>{money(row.reservedPrice)}</p>
          </div>
        </div>
        {!expired && row.status === 'reserved' && <p className="mt-5 flex flex-wrap items-center gap-2 text-base font-semibold tabular-nums text-[var(--badge-pending-fg)]"><Clock3 size={16} aria-hidden="true" />{Math.floor(seconds / 3600)}h {Math.floor(seconds % 3600 / 60)}m {seconds % 60}s remaining</p>}
        {review && <p className="mt-5 text-base text-[var(--text-secondary)]">Your payment was submitted before the deadline and is being verified. Your reserved price is held.</p>}
        <dl className="mt-5 grid gap-4 border-t border-[var(--divider)] pt-5 text-base sm:grid-cols-2">
          <div><dt className="text-sm text-[var(--text-secondary)]">Reserved</dt><dd className="mt-1 font-medium">{date(row.reservedAt)}</dd></div>
          <div><dt className="text-sm text-[var(--text-secondary)]">Payment deadline</dt><dd className="mt-1 font-medium">{date(due)}{row.extendedUntil && <span className="mt-1 block text-sm font-normal text-[var(--text-secondary)]">(extended by our team)</span>}</dd></div>
        </dl>
        {!row.projectId && !expired && <p className="mt-5 text-base text-[var(--text-secondary)]">Our team will help you create your project and complete payment.</p>}
        <details className="mt-5 border-t border-[var(--divider)] pt-4 text-base">
          <summary className="cursor-pointer rounded font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">Reserved terms</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--text-secondary)]">{row.terms.map((term, index) => <li key={index} className="break-words">{term}</li>)}</ul>
        </details>
      </Surface>;
    })}</div>
      <div className="mt-6">
        {user?.role === 'customer' ? <GlassButton as={Link} to="/dashboard"><ArrowLeft size={16} />Back to dashboard</GlassButton> : <GlassButton as="a" href={WEBSITE_URL}><ArrowLeft size={16} />Back to website</GlassButton>}
      </div>
    </div>
  </ContentTag>;
  return user?.role === 'customer' ? <DashboardLayout>{content}</DashboardLayout> : <div className="portal-surface min-h-screen">{content}</div>;
}
