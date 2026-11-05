import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Gift, Download, ChevronRight } from 'lucide-react';
import SummaryApi from '../common';
import { customerChildState } from '../helpers/customerReturnNavigation';
import { COMPLIMENTARY_INVOICE_LABEL } from '../helpers/invoicePresentation';

// Send Upgrade (admin) and the Complimentary upgrades list (admin and customer) on a project page.
// The three messages and the ₹0 invoice are backend/helpers/complimentaryUpgrade.js; the review
// popup opens from the request's own response (helpers/emailReview.js), so this only asks for it.
const MESSAGES = [
  { event: 'project.upgrade.offer', label: 'Offer', hint: 'A complimentary upgrade is available' },
  { event: 'project.upgrade.started', label: 'Started', hint: 'The upgrade work has started' },
  { event: 'project.upgrade.completed', label: 'Completed', hint: 'Done. Also adds the ₹0 complimentary invoice' },
];

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');

const ComplimentaryUpgrades = ({ order, isAdminView, canSend, onChanged }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const upgrades = order?.complimentaryUpgrades || [];
  const showSend = isAdminView && canSend;
  if (!showSend && !upgrades.length) return null;

  const send = async (event) => {
    try {
      setBusy(true);
      const response = await fetch(`${SummaryApi.complimentaryUpgrade.url}/${order._id}/complimentary-upgrade`, {
        method: SummaryApi.complimentaryUpgrade.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      const result = await response.json();
      if (!result.success) toast.error(result.message || 'The message could not be prepared');
      setMenuOpen(false);
      await onChanged?.();
    } catch (error) {
      console.error('Error preparing the upgrade message:', error);
      toast.error('The message could not be prepared');
    } finally {
      setBusy(false);
    }
  };

  const shell = isAdminView
    ? 'rounded-[1.75rem] border border-[var(--glass-border)] bg-white p-5 shadow-sm'
    : 'relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150';
  const rowClass = isAdminView
    ? 'flex items-center justify-between gap-3 rounded-2xl border border-[var(--glass-border)] bg-slate-50 px-4 py-3'
    : 'flex items-center justify-between gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 transition hover:bg-[var(--glass-bg-hover)]';

  return (
    <section className={shell}>
      {!isAdminView && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />}
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-[var(--text-primary)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Complimentary upgrades</h2>
        </div>
        {showSend && (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Preparing…' : 'Send Upgrade'}
          </button>
        )}
      </div>

      {showSend && menuOpen && (
        <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MESSAGES.map((message) => (
            <button
              key={message.event}
              type="button"
              disabled={busy}
              onClick={() => send(message.event)}
              className="rounded-2xl border border-[var(--glass-border)] bg-slate-50 px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
            >
              <span className="block text-base font-semibold text-[var(--text-primary)]">{message.label}</span>
              <span className="mt-1 block text-sm text-[var(--text-secondary)]">{message.hint}</span>
            </button>
          ))}
        </div>
      )}

      {upgrades.length ? (
        <div className="relative mt-4 space-y-2">
          {upgrades.map((invoice) => (
            <div
              key={invoice._id}
              role={isAdminView ? undefined : 'button'}
              tabIndex={isAdminView ? undefined : 0}
              onClick={isAdminView ? undefined : () => navigate(`/invoice-detail/${invoice._id}`, { state: customerChildState(location) })}
              onKeyDown={isAdminView ? undefined : (event) => { if (event.key === 'Enter') navigate(`/invoice-detail/${invoice._id}`, { state: customerChildState(location) }); }}
              className={`${rowClass} ${isAdminView ? '' : 'cursor-pointer'}`}
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-[var(--text-primary)]">
                  {invoice.lineItems?.[0]?.name || 'Complimentary upgrade'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {formatDate(invoice.invoiceDate)} · {COMPLIMENTARY_INVOICE_LABEL} {invoice.invoiceNumber} · FREE
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`${SummaryApi.invoices.downloadDocument.url}/${invoice._id}/download`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)]"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                {!isAdminView && <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="relative mt-3 text-base text-[var(--text-secondary)]">
          Nothing sent yet. Completed adds a ₹0 complimentary invoice here and in the client's purchase history.
        </p>
      )}
    </section>
  );
};

export default ComplimentaryUpgrades;
