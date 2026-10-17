import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, CalendarClock, AlertTriangle, Lock, Upload,
  List, X,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import UpdateRequestModal from '../components/UpdateRequestModal';
import SummaryApi from '../common';
import { isPlanItem } from '../helpers/orderType';
import { getInvoiceStatusText, isStatementInvoice } from '../helpers/invoicePresentation';
import { getNextCycleOutcome, getTimeUntilText, getTermRemainingText, CYCLE_OUTCOME } from '../helpers/servicePlanCycle';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';
import UploadedDataList from '../components/UploadedDataList';
import { downloadAuthenticatedFile } from '../helpers/downloadFile';

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  return `${formatDate(d)} at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
};
// -- Visual-only status derivation, mirrors UserUpdateDashboard.js's
// getCardVisualStatus so every page reads plan data the same way. --
const getPlanVisualStatus = (plan) => {
  const product = plan.productId || {};
  const isRecurring = Boolean(product.isMonthlyLimitedPlan || product.isMonthlyRenewablePlan);

  // Service Plan branch — checked first and returned early so none of the legacy
  // logic below (which reads fields a service plan simply doesn't have) ever runs
  // for one. Legacy plans fall through completely unchanged.
  if (plan.isServicePlan && plan.servicePlanSnapshot) {
    const snapshot = plan.servicePlanSnapshot;
    const status = plan.servicePlanStatus || 'active';

    const endDate = plan.servicePlanEndDate ? new Date(plan.servicePlanEndDate) : null;
    const daysLeft = endDate
      ? Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

    // A reminder-only service grants no portal allowance, so "uses left" is not a
    // meaningful concept for it — only its duration is.
    const isReminderOnly = snapshot.serviceBehavior === 'reminder_only';
    const isUnlimited = snapshot.limitScope === 'unlimited';
    const accessLimit = Number(snapshot.portalAccessCount || 0);
    const accessUsed = Number(plan.serviceAccessUsedInCycle || 0);
    const accessLeft = isReminderOnly || isUnlimited
      ? null
      : Math.max(0, accessLimit - accessUsed);

    const base = { isServicePlan: true, isRecurring: false, daysLeft, accessLeft, accessUsed, accessLimit, isReminderOnly, isUnlimited };

    if (status === 'pending_activation') return { ...base, badge: 'Waiting for project completion', tone: 'paused', canRequest: false };
    if (status === 'inactive' || status === 'cancelled') return { ...base, badge: 'Inactive', tone: 'closed', canRequest: false };
    if (status === 'expired') return { ...base, badge: 'Expired', tone: 'expired', canRequest: false };
    if (status === 'paused') return { ...base, badge: 'Paused', tone: 'paused', canRequest: false };
    if (daysLeft === 0) return { ...base, badge: 'Expired', tone: 'expired', canRequest: false };
    if (accessLeft === 0) return { ...base, badge: 'Cycle limit used', tone: 'used_up', canRequest: false };

    return { ...base, badge: 'Active', tone: 'active', canRequest: !isReminderOnly };
  }

  if (plan.planStatus === 'closed') {
    return { badge: 'Closed', tone: 'closed', isRecurring, canRequest: false };
  }

  if (isRecurring && plan.autoRenewalStatus === 'paused') {
    return { badge: 'Payment overdue', tone: 'paused', isRecurring, canRequest: false };
  }

  if (isRecurring && (plan.totalYearlyDaysRemaining ?? 0) <= 0) {
    return { badge: 'Yearly plan ended', tone: 'expired', isRecurring, canRequest: false };
  }

  if (isRecurring) {
    const used = plan.currentMonthUpdatesUsed || 0;
    const limit = plan.currentMonthUpdatesLimit || product.monthlyUpdateLimit || 1;
    const usedUp = used >= limit;
    return {
      badge: usedUp ? "This month's updates used" : 'Active',
      tone: usedUp ? 'used_up' : 'active',
      isRecurring,
      canRequest: !usedUp,
    };
  }

  // simple plan — gated by BOTH days-left AND updates-left independently
  const validityInDays = product.validityPeriod;
  const startDate = new Date(plan.createdAt);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (validityInDays || 0));
  const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));

  const updatesUsed = plan.updatesUsed || 0;
  const updateCount = product.updateCount || 0;
  const updatesLeft = Math.max(0, updateCount - updatesUsed);

  const isExpired = daysLeft <= 0;
  const isUsedUp = updatesUsed >= updateCount;

  if (isExpired) {
    return { badge: 'Expired', tone: 'expired', isRecurring, daysLeft, updatesLeft, canRequest: false };
  }
  if (isUsedUp) {
    return { badge: 'Updates used', tone: 'used_up', isRecurring, daysLeft, updatesLeft, canRequest: false };
  }
  return { badge: 'Active', tone: 'active', isRecurring, daysLeft, updatesLeft, canRequest: true };
};

// The status pill's colours belong to Badge. This map used to restate them in
// dark-only shades — `text-emerald-300` on `bg-emerald-500/20` measured 1.46 on a
// light card, so the label vanished into its own tint. Mapping the local tone names
// onto Badge's four keeps every call site unchanged.
const BADGE_TONE_CLASSES = {
  active: 'badge badge-success',
  used_up: 'badge badge-pending',
  expired: 'badge badge-neutral',
  paused: 'badge badge-error',
  closed: 'badge badge-neutral',
};

const PlanDetails = ({ isProjectServiceView = false }) => {
  const { orderId: routeOrderId, projectOrderId, serviceOrderId } = useParams();
  const orderId = serviceOrderId || routeOrderId;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state?.user?.user);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const [plan, setPlan] = useState(null);
  const [requests, setRequests] = useState([]);
  const [downloadingUploadId, setDownloadingUploadId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [stoppingRenewal, setStoppingRenewal] = useState(false);
  const [serviceActionMessage, setServiceActionMessage] = useState('');

  const fetchPlanDetails = useCallback(async () => {
    try {
      setLoading(true);
      setNotFound(false);

      // Uploads come from the shared per-order endpoint. It used to fetch every request
      // the customer had ever made and filter locally on `updatePlanId?._id === orderId`
      // — which only matched when the controller happened to populate that field, so the
      // history could silently come back empty. The server now decides what belongs to
      // this order, and returns the same shape the admin side reads.
      const [orderResponse, requestsResponse] = await Promise.all([
        fetch(`${SummaryApi.orderDetails.url}/${orderId}`, { credentials: 'include' }),
        fetch(`${SummaryApi.orderUploads.url}/${orderId}/uploads`, {
          method: SummaryApi.orderUploads.method,
          credentials: 'include',
        }),
      ]);

      const orderData = await orderResponse.json();
      if (!orderData.success || !orderData.data) {
        setPlan(null);
        setNotFound(true);
        return;
      }

      if (!isPlanItem(orderData.data)) {
        navigate(`/project-details/${orderId}`, { replace: true, state: location.state });
        return;
      }

      setPlan(orderData.data);

      const requestsData = await requestsResponse.json();
      // Already scoped to this order and sorted newest-first by the server.
      const planRequests = requestsData.success ? (requestsData.data || []) : [];
      setRequests(planRequests);
    } catch (error) {
      console.error('Error fetching plan details:', error);
      setPlan(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPlanDetails();
  }, [fetchPlanDetails]);

  const handleBack = () => {
    goToCustomerReturn(
      navigate,
      location,
      isProjectServiceView && projectOrderId ? `/project-details/${projectOrderId}` : '/projects-and-plans'
    );
  };
  const handleStopRenewal = async () => {
    try {
      setStoppingRenewal(true);
      const response = await fetch(SummaryApi.stopServiceRenewal.url, { method: SummaryApi.stopServiceRenewal.method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceOrderId: orderId }) });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Could not stop renewal');
      setServiceActionMessage(result.message);
      fetchPlanDetails();
    } catch (error) { setServiceActionMessage(error.message || 'Could not stop renewal'); } finally { setStoppingRenewal(false); }
  };

  // The upload zip is fetched, not linked to, so the session cookie travels with it —
  // see helpers/downloadFile.js. One at a time; the list shows which is preparing.
  const handleUploadDownload = async (attempt) => {
    if (!attempt?.id || downloadingUploadId) return;
    try {
      setDownloadingUploadId(attempt.id);
      // Same name the server sets in Content-Disposition, which a blob download cannot read.
      await downloadAuthenticatedFile(
        `${SummaryApi.downloadUploadZip.url}/${attempt.id}/download`,
        `uploaded-data-${attempt.id}.zip`
      );
      toast.success('Download started');
    } catch (error) {
      toast.error(error.message || 'Failed to download files');
    } finally {
      setDownloadingUploadId('');
    }
  };

  if (loading) {
    return (
      <DashboardLayout user={user}>
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <div className="rounded-lg p-8">
            <TriangleMazeLoader />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !plan) {
    return (
      <DashboardLayout user={user}>
        <div className="p-6">
          <div className="glass-panel rounded-lg p-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-[var(--danger-fg)]">Plan Not Found</h2>
            <p className="text-base text-[var(--text-primary)] mb-4">The plan you're looking for doesn't exist or you don't have access to it.</p>
            <button
              onClick={handleBack}
              className="rounded-lg bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]"
            >
              Back to Projects and Plans
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const product = plan.productId || {};
  const status = getPlanVisualStatus(plan);

  // What the customer bought is recorded ON THEIR ORDER, not only on the plan template:
  // orderItems[] snapshots the name/price at purchase time and servicePlanSnapshot freezes the
  // config (see orderProductModel.js). So when the admin retires a plan template, the order still
  // knows everything about itself — the plan is a catalogue entry, the order is the contract.
  // Reading productId FIRST keeps behaviour identical while the template exists; the snapshot is
  // the fallback that keeps a retired plan's purchase fully readable instead of showing blanks.
  const purchasedName =
    product.serviceName ||
    (plan.orderItems || []).find((item) => item.type === 'main')?.name ||
    plan.orderItems?.[0]?.name ||
    'Plan';

  // Where the allowance is read from is decided by WHAT KIND of order this is — the same
  // three-way answer backend/helpers/uploadType.js gives, because an order's allowance and
  // its display of that allowance must not come from different places.
  //
  // This was the page's central bug. getPlanVisualStatus() above already reads a service
  // plan correctly (from servicePlanSnapshot, frozen on the order), but the counter below
  // read `product.updateCount` — the LEGACY plan's field, which lives on the catalogue
  // product. A service plan has no such field, so the donut showed "0 / 0" and "Total
  // updates granted: 0" on a plan whose own description promises one update a month. The
  // badge said "Cycle limit used" while the counter said nothing had been granted: one
  // file, two sources, three contradicting answers on screen.
  //
  // Nothing about the allowance itself changes here — only which field is read.
  const isServiceKind = Boolean(plan.isServicePlan && plan.servicePlanSnapshot);

  // Whether the allowance comes back, and when — the same question the renewal cron asks.
  const nextCycle = getNextCycleOutcome(plan);

  // A statement is the whole plan stated once; the rest are the bills it is made of. They are
  // separated here rather than in the markup so the "is this a bill?" question is asked in one
  // place, by the same helper the invoice pages use.
  const serviceInvoices = plan.serviceInvoices || [];
  const statementInvoice = serviceInvoices.find(isStatementInvoice) || null;
  const billedInvoices = serviceInvoices.filter((invoice) => !isStatementInvoice(invoice));
  // amountPaid is the running total the payment helpers maintain on the invoice, so what has
  // arrived and what is still owed are read, never recomputed from the bills below.
  const statementPaid = Number(statementInvoice?.amountPaid || 0);
  const statementDue = Math.max(0, Number(statementInvoice?.amount || 0) - statementPaid);

  // How much of the PLAN's term is left. Deliberately computed next to nextCycle, because the
  // two answer different questions and the page used to blur them: the cycle line said when the
  // customer could send again, while this tile showed the whole plan's day count under the label
  // "Days left". A service plan with no end date has no term to count down, and says so instead.
  const termRemaining = getTermRemainingText(plan.servicePlanEndDate);

  // A service plan's allowance is per cycle, and so is its counter: status.accessLimit /
  // accessUsed come from the snapshot and serviceAccessUsedInCycle. An unlimited or
  // reminder-only service has no number to count, which is why totalUpdates can be null
  // rather than 0 — "no limit" and "none granted" are different facts and must not render
  // as the same zero.
  const totalUpdates = isServiceKind
    ? (status.isUnlimited || status.isReminderOnly ? null : status.accessLimit)
    : status.isRecurring
      ? (plan.currentMonthUpdatesLimit || product.monthlyUpdateLimit || 1)
      : (product.updateCount || 0);
  const usedUpdates = isServiceKind
    ? status.accessUsed
    : status.isRecurring
      ? (plan.currentMonthUpdatesUsed || 0)
      : (plan.updatesUsed || 0);
  const hasUpdateAllowance = typeof totalUpdates === 'number' && totalUpdates > 0;
  const donutPercentage = hasUpdateAllowance
    ? Math.min(100, Math.round((usedUpdates / totalUpdates) * 100))
    : 0;

  // The file cap was hardcoded in this page as "Up to 20 files, 5MB each" — a sentence that
  // stayed the same whatever the customer had bought. A service plan carries its own
  // filesLimit in the snapshot it froze at purchase, so the plan states its own limit.
  const filesPerRequest = isServiceKind
    ? Number(plan.servicePlanSnapshot?.filesLimit || 0)
    : 0;

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={handleBack}
              className="absolute left-0 inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]"
            >
              <ArrowLeft className="h-5 w-5" />
              Back
            </button>

            <div className="text-center">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                  {purchasedName}
                </h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONE_CLASSES[status.tone]}`}>
                  {status.badge}
                </span>
              </div>
              {/* Was the raw category with its underscores swapped for spaces —
                  `service_plan` became "service plan", which is the database's filing
                  label, not a description of what the customer owns. A plan's own name is
                  already the heading above; the only thing worth adding here is where this
                  plan sits, and that is only true when it is attached to a project. */}
              {isProjectServiceView && (
                <p className="mt-1 text-base text-[var(--text-secondary)] sm:text-lg">
                  Attached to your project
                </p>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

            {/* What this plan is, and what is owed on it.
                Was one run-on line per invoice — "Live Billing Statement · INV-202609-0005 ·
                ₹2980 · partially_paid" — four facts joined by dots, two of which mean nothing
                to the customer: the invoice number is how the system finds the record, and
                `partially_paid` is the database's own word. The heading above them said
                "Service controls" while holding no control at all, only the plan's description.
                Each bill is now a line the customer can read: what it is for, how much, and
                where it stands — with its action where an action exists. */}
            {plan.isServicePlan && (
              <section className="relative border-b border-[var(--glass-border)] px-5 py-4 text-[var(--text-primary)] sm:px-6">
                <p className="text-sm text-[var(--text-secondary)]">
                  {product.formattedDescriptions?.[0]?.content?.replace(/<[^>]*>/g, '') || 'No additional information for this plan.'}
                </p>

                {serviceActionMessage && (
                  <p className="mt-2 text-sm text-[var(--badge-success-fg)]">{serviceActionMessage}</p>
                )}
                {status.isReminderOnly && (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    This is a reminder plan — you do not send files on it.
                  </p>
                )}

                {/* What this plan costs, on one line.
                    This was a heading, a total, a paid/due line, a "Your bill" heading and a row
                    under it — five stacked lines on a full-width band, with the right half of the
                    page empty and the same figure printed twice: the header said "₹1,490 paid"
                    and the single row beneath it said "₹1,490 · Paid".
                    Measured against live data before rebuilding: no plan has more than one bill
                    (5 have exactly one, 3 have none), so the list and its heading were never
                    earned — a heading over a single row is furniture. Where a statement exists,
                    money is genuinely still owed on both, which makes the outstanding figure the
                    one thing worth saying loudly.
                    Three shapes exist in the data and each gets its own sentence. The money is
                    read from invoice.amountPaid, which the payment helpers maintain — nothing is
                    added up here.

                    ON THE WORDING, which was wrong once already: the statement's remainder is NOT
                    a debt. A plan bought for N cycles states its whole price up front, but only
                    the cycle that has started is ever billed — the rest has no invoice yet.
                    Measured across live data: every statement remainder equals exactly the cycles
                    not yet billed, and no issued bill is unpaid on any plan. So "₹1,490 still to
                    pay" told a customer who owes nothing that they were holding money back. It
                    leads with what HAS been paid, and says the rest arrives with the plan. */}
                {(statementInvoice || billedInvoices.length) ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--glass-border)] pt-3">
                    {statementInvoice ? (
                      statementDue > 0 ? (
                        <p className="text-base text-[var(--text-primary)]">
                          <span className="font-semibold">₹{statementPaid.toLocaleString('en-IN')} paid</span>
                          <span className="text-[var(--text-secondary)]">
                            {' '}of ₹{Number(statementInvoice.amount || 0).toLocaleString('en-IN')} for this plan.
                            {nextCycle.outcome === CYCLE_OUTCOME.RETURNS
                              ? ` The rest is billed as the plan runs — next on ${formatDate(nextCycle.returnsOn)}.`
                              : ' The rest is billed as the plan runs.'}
                          </span>
                        </p>
                      ) : (
                        <p className="text-base text-[var(--text-primary)]">
                          <span className="font-semibold">₹{Number(statementInvoice.amount || 0).toLocaleString('en-IN')}</span>
                          <span className="text-[var(--text-secondary)]"> for this plan — fully paid.</span>
                        </p>
                      )
                    ) : (
                      /* No statement: the plan was billed once and that bill is the whole story. */
                      <p className="text-base text-[var(--text-primary)]">
                        <span className="font-semibold">₹{Number(billedInvoices[0]?.amount || 0).toLocaleString('en-IN')}</span>
                        <span className="text-[var(--text-secondary)]">
                          {' '}for this plan — {getInvoiceStatusText(billedInvoices[0]).label.toLowerCase()}.
                        </span>
                      </p>
                    )}

                    {/* One link, to whichever record actually holds the detail. Two buttons that
                        both opened an invoice page sat here before. */}
                    <button
                      type="button"
                      onClick={() => navigate(`/invoice-detail/${(statementInvoice || billedInvoices[0])._id}`, { state: location.state })}
                      className="shrink-0 rounded-lg border border-[var(--glass-border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-hover)]"
                    >
                      Payment details
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            {/* Desktop 3-column layout, same skeleton as ProjectDetails.js */}
            <div className="relative hidden lg:grid lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:items-stretch">
              <aside className="relative h-[620px] border-r border-[var(--glass-border)]">
                <div className="flex h-full min-h-0 flex-col p-4">
                  <div className="flex items-center justify-center">
                      <div className="relative flex h-40 w-40 items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-[12px] border-[var(--glass-border)]"></div>
                        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="46"
                            fill="none"
                            stroke={status.tone === 'active' ? '#10B981' : '#94A3B8'}
                            strokeWidth="8"
                            strokeDasharray={`${donutPercentage * 2.89} 1000`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        {/* The customer's question is "how many do I have left", not "what
                            fraction of my quota is spent" — so the number left is the one
                            that is large, and the total is the small print under it.
                            A plan with no countable allowance (unlimited, or reminder-only)
                            says so in words: it used to render as "0 / 0", which reads as
                            nothing granted rather than no limit. */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                          {hasUpdateAllowance ? (
                            <>
                              <span className="text-3xl font-bold text-[var(--text-primary)]">
                                {Math.max(0, totalUpdates - usedUpdates)}
                              </span>
                              <span className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
                                of {totalUpdates} left
                              </span>
                            </>
                          ) : (
                            <span className="text-base font-semibold text-[var(--text-primary)]">
                              {status.isReminderOnly ? 'Reminders only' : 'No limit'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRequestModal(true)}
                      disabled={!status.canRequest}
                      className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-base font-semibold transition ${
                        status.canRequest
                          ? 'bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)] hover:bg-[rgb(var(--ink-rgb)/0.85)]'
                          : 'bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed'
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      Request Update
                    </button>

                    {/* When the allowance is spent, this line answers the only question the
                        customer has: when can I send something again?
                        It used to answer "More on <cycle end>" for every service, which is only
                        true of a service that has another cycle coming. A one-off plan has an end
                        date but nothing after it, so the sentence promised a renewal that would
                        never arrive; a service with no cycle end recorded printed "Invalid Date".
                        Whether a cycle is coming is decided by helpers/servicePlanCycle.js, which
                        asks what the renewal cron asks.
                        The wait is stated as a wait, not as a date: "11 Oct 2026" makes the reader
                        count on a calendar, and on the final day it reads as though nothing is
                        about to change. getTimeUntilText tightens from days to hours as it nears.
                        It can only be reached on the RETURNS branch, which the helper only returns
                        for a date it has already parsed — so it never renders an empty wait. */}
                    {status.tone === 'used_up' && (
                      <p className="mt-2 text-center text-sm text-[var(--badge-pending-fg)]">
                        {isServiceKind
                          ? nextCycle.outcome === CYCLE_OUTCOME.RETURNS
                            ? `You can send again ${getTimeUntilText(nextCycle.returnsOn)}.`
                            : nextCycle.outcome === CYCLE_OUTCOME.FINISHED
                              ? 'This plan has delivered everything it was bought for. Buy a new plan to keep sending.'
                              : 'You have used everything on this plan. Buy a new plan to keep sending.'
                          : status.isRecurring
                            ? `You can send again from ${formatDate(plan.monthlyLimitResetDate || plan.currentMonthExpiryDate)}.`
                            : 'You have used everything on this plan. Buy a new plan to keep sending.'}
                      </p>
                    )}
                    {status.tone === 'expired' && (
                      <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
                        {status.isRecurring ? 'Yearly plan has ended.' : 'Plan validity has expired.'}
                      </p>
                    )}
                    {status.tone === 'paused' && (
                      <p className="mt-2 flex items-start gap-1.5 text-center text-sm text-[var(--badge-error-fg)]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Payment overdue — clear invoice to continue.
                      </p>
                    )}
                    {status.tone === 'closed' && (
                      <p className="mt-2 flex items-start gap-1.5 text-center text-sm text-[var(--text-secondary)]">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        This plan was closed.
                      </p>
                    )}

                    {/* "Plan Snapshot" was a heading in the system's voice over three rows,
                        one of which ("Total updates granted") simply restated the donut above
                        it, and one of which ("Up to 20 files, 5MB each") was a sentence typed
                        into this page rather than read from the plan. What is left is what the
                        donut cannot say: how long the plan runs, and how much may be sent at
                        once — the file cap coming from the plan the customer actually bought. */}
                    <div className="mt-4 border-t border-[var(--glass-border)] pt-4">
                      <div className="space-y-2.5">
                        {/* This is the PLAN's own term — when the whole thing runs out — which is
                            a different question from when the allowance comes back (that answer
                            sits under the upload button). It was labelled "Days left" over a bare
                            day count: "164 days" is arithmetic, and read next to the cycle line it
                            was easy to take for the same thing. It now names what is expiring and
                            states the remainder in months and days.
                            Label above value, not beside it: this column is 280px wide, and a
                            label that says what is expiring plus a value in months AND days will
                            not share one line — side by side, both halves wrapped. */}
                        <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5">
                          <p className="text-sm text-[var(--text-secondary)]">{status.isRecurring ? 'Resets on' : termRemaining ? 'Plan expires in' : 'Plan runs for'}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]">
                            {status.isRecurring ? (
                              <>
                                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                {formatDate(plan.monthlyLimitResetDate || plan.currentMonthExpiryDate)}
                              </>
                            ) : (
                              <>
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {termRemaining || 'As long as you need'}
                              </>
                            )}
                          </p>
                        </div>
                        {filesPerRequest > 0 && (
                          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5">
                            <p className="text-sm text-[var(--text-secondary)]">Files you can send at once</p>
                            <p className="mt-0.5 text-base font-semibold text-[var(--text-primary)]">{filesPerRequest}</p>
                          </div>
                        )}
                      </div>
                    </div>
                </div>
              </aside>

              {/* Upload history. Was a two-column split — a list of requests on the left
                  and a details pane on the right that only filled once a row was picked.
                  Both halves are now one UploadedDataList, the same component the project
                  page and the admin workspace render, so every surface shows the same
                  records and offers the same zip download. */}
              <section className="relative min-w-0 h-[620px]">
                <div className="flex h-full min-h-0 flex-col p-4">
                  {/* One heading, not three. This was an eyebrow ("Uploaded Data"), a heading
                      ("Everything you have sent on this plan") and a counter chip ("1 request")
                      all saying the same thing in the same box. */}
                  <div className="flex flex-col gap-2 border-b border-[var(--glass-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">What you have sent</h2>
                    {requests.length > 0 && (
                      <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 text-sm font-semibold text-[var(--text-primary)] backdrop-blur-md">
                        {requests.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
                    <UploadedDataList
                      uploads={requests}
                      theme="glass"
                      emptyText="Nothing uploaded yet. Anything you send appears here."
                      onDownload={handleUploadDownload}
                      downloadingId={downloadingUploadId}
                    />
                  </div>
                </div>
              </section>
            </div>

              {/* Mobile stacked layout */}
              <div className="relative space-y-4 p-5 lg:hidden">
                <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                  {/* The status badge already sits beside the plan's name at the top of the
                      page, on mobile too. Labelling it again here — "Plan Status" over the same
                      words — told the customer nothing they had not just read. */}
                  <div className="relative flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-[var(--text-primary)]">{purchasedName}</h2>
                    </div>
                    <div className="relative flex h-24 w-24 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-8 border-[var(--glass-border)]"></div>
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="46"
                          fill="none"
                          stroke={status.tone === 'active' ? '#10B981' : '#94A3B8'}
                          strokeWidth="8"
                          strokeDasharray={`${donutPercentage * 2.89} 1000`}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      {/* Same count as the desktop donut, same wording — what is left, not
                          what is spent. Two layouts of one screen must not phrase the same
                          number two ways. */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                        {hasUpdateAllowance ? (
                          <>
                            <span className="text-lg font-bold text-[var(--text-primary)]">
                              {Math.max(0, totalUpdates - usedUpdates)}
                            </span>
                            <span className="text-sm font-medium text-[var(--text-secondary)]">left</span>
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {status.isReminderOnly ? 'Reminders' : 'No limit'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* The second tile counted requests, which the section directly below already
                      counts. What replaces it is the one fact neither the donut nor the badge
                      carries on mobile: how many files may go in one send.
                      The first tile also printed "null days" for a plan with no expiry — the
                      same hole the desktop panel had, phrased the same way now. */}
                  <div className="relative mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
                      <p className="text-sm text-[var(--text-secondary)]">{status.isRecurring ? 'Resets on' : termRemaining ? 'Plan expires in' : 'Plan runs for'}</p>
                      <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                        {status.isRecurring
                          ? formatDate(plan.monthlyLimitResetDate || plan.currentMonthExpiryDate)
                          : termRemaining || 'As long as you need'}
                      </p>
                    </div>
                    {filesPerRequest > 0 && (
                      <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
                        <p className="text-sm text-[var(--text-secondary)]">Files at once</p>
                        <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{filesPerRequest}</p>
                      </div>
                    )}
                  </div>

                  <div className="relative mt-4">
                    <button
                      type="button"
                      onClick={() => setShowRequestModal(true)}
                      disabled={!status.canRequest}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold transition ${
                        status.canRequest
                          ? 'bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)] hover:bg-[rgb(var(--ink-rgb)/0.85)]'
                          : 'bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed'
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      Request Update
                    </button>
                  </div>
                </section>

                <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                  {/* Same heading as the desktop column, for the same list. */}
                  <div className="relative flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">What you have sent</h2>
                    {requests.length > 0 && (
                      <span className="text-base font-semibold text-[var(--text-primary)]">{requests.length}</span>
                    )}
                  </div>

                  <div className="relative mt-3">
                    <UploadedDataList
                      uploads={requests}
                      theme="glass"
                      emptyText="Nothing uploaded yet. Anything you send appears here."
                      onDownload={handleUploadDownload}
                      downloadingId={downloadingUploadId}
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      {showRequestModal && (
        <UpdateRequestModal
          plan={plan}
          onClose={() => setShowRequestModal(false)}
          onSubmitSuccess={() => {
            setShowRequestModal(false);
            fetchPlanDetails();
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default PlanDetails;
