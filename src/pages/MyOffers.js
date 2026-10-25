import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import WorkspacePanel, { WorkspaceColumns } from '../components/WorkspacePanel';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, Tag } from 'lucide-react';
import { WEBSITE_URL } from '../helpers/brand';

const date = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
const money = value => `₹${Number(value).toLocaleString('en-IN')}`;
const columns = [
  { label: 'Offer', className: 'col-span-4' },
  { label: 'Status', className: 'col-span-2' },
  { label: 'Reserved price', className: 'col-span-2' },
  { label: 'Payment deadline', className: 'col-span-4' },
];
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
  const content = <ContentTag className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 text-[var(--text-primary)] sm:px-6 lg:px-8 lg:py-14" aria-labelledby="my-offers-title" data-clock-tick={tick}>
    <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
    <div className="relative mx-auto max-w-7xl">
      <header className="text-center">
        <h1 id="my-offers-title" className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">My Offers</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">Your reservations and payment deadlines. Expired offers stay in your history.</p>
      </header>

      <WorkspacePanel className="mt-10" title="Reserved offers" icon={Tag} actions={<GlassButton onClick={() => void refresh()}><RefreshCw size={16} />Refresh</GlassButton>}>
        {error && <div role="alert" className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] px-5 py-4 sm:px-6">
          <p className="text-base text-[var(--badge-error-fg)]">{error}</p>
          <GlassButton onClick={() => void refresh()}><RefreshCw size={16} />{rows ? 'Retry' : 'Try again'}</GlassButton>
        </div>}
        {!rows && !error && <div role="status" className="relative px-5 py-10 text-center text-base text-[var(--text-secondary)] sm:px-6">Loading your offers…</div>}
        {rows?.length === 0 && <div className="relative px-5 py-12 text-center sm:px-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border-strong)] bg-[var(--glass-bg)]"><Tag size={24} aria-hidden="true" /></div>
          <h3 className="mt-4 text-lg font-semibold">You have no reserved offers yet.</h3>
          <p className="mt-2 text-base text-[var(--text-secondary)]">Your reserved offers and their payment deadlines will appear here.</p>
        </div>}
        {rows?.length > 0 && <div className="hidden lg:block"><WorkspaceColumns columns={columns} /></div>}
        <div className="relative divide-y divide-[var(--divider)]">{rows?.map(row => {
      // The deadline in force (an admin extension moves it); the original stays as history.
      const due = row.deadline || row.expiresAt;
      const seconds = Math.max(0, Math.ceil((Date.parse(due) - now) / 1000));
      // under_review: a payment submitted before the deadline awaits approval; the price stays held.
      const review = row.status === 'under_review';
      const expired = row.status !== 'confirmed' && !review && seconds === 0;
      const locked = row.status === 'confirmed';
      return <article key={row.id} className={`px-5 py-5 sm:px-6 ${expired ? 'bg-[var(--glass-bg-subtle)]' : ''}`}>
        <div className="grid grid-cols-12 items-start gap-4">
          <div className="col-span-12 min-w-0 lg:col-span-4">
            <h3 className={`break-words text-lg font-semibold ${expired ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>{row.title}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Reserved {date(row.reservedAt)}</p>
          </div>
          <div className="col-span-12 lg:col-span-2"><Badge tone={expired ? 'neutral' : locked ? 'success' : 'pending'} icon={locked ? CheckCircle2 : expired ? Tag : Clock3}>
              {expired ? 'Expired' : locked ? 'Price locked' : review ? 'Payment under review' : 'Reserved'}
          </Badge></div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-2">
            <p className="mb-1 text-sm text-[var(--text-secondary)] lg:hidden">Reserved price</p>
            <p className={`text-lg font-semibold tabular-nums ${expired ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>{money(row.reservedPrice)}</p>
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-4">
            <p className="mb-1 text-sm text-[var(--text-secondary)] lg:hidden">Payment deadline</p>
            <p className="text-base font-medium">{date(due)}</p>
            {row.extendedUntil && <p className="mt-1 text-sm text-[var(--text-secondary)]">(extended by our team)</p>}
            {!expired && row.status === 'reserved' && <p className="mt-2 flex items-center gap-2 text-sm font-semibold tabular-nums text-[var(--badge-pending-fg)]"><Clock3 size={16} aria-hidden="true" />{Math.floor(seconds / 3600)}h {Math.floor(seconds % 3600 / 60)}m {seconds % 60}s remaining</p>}
          </div>
        </div>
        {review && <p className="mt-4 text-base text-[var(--text-secondary)]">Your payment was submitted before the deadline and is being verified. Your reserved price is held.</p>}
        {!row.projectId && !expired && <p className="mt-4 text-base text-[var(--text-secondary)]">Our team will help you create your project and complete payment.</p>}
        <details className="mt-4 border-t border-[var(--divider)] pt-4 text-base">
          <summary className="cursor-pointer rounded font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">Reserved terms</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--text-secondary)]">{row.terms.map((term, index) => <li key={index} className="break-words">{term}</li>)}</ul>
        </details>
      </article>;
    })}</div>
      </WorkspacePanel>
      {user?.role !== 'customer' && <div className="mt-6"><GlassButton as="a" href={WEBSITE_URL}><ArrowLeft size={16} />Back to website</GlassButton></div>}
    </div>
  </ContentTag>;
  return user?.role === 'customer' ? <DashboardLayout>{content}</DashboardLayout> : <div className="portal-surface min-h-screen">{content}</div>;
}
