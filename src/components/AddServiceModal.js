import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Clock, ExternalLink, Loader2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import SummaryApi from '../common';
// The admin's dependency rule. This modal buys services attached to a project,
// so it asks the same question the backend will ask when the purchase is made.
import {
  SURFACE,
  canBuyOnSurface,
  isRedirectableFromProject,
  startsAfterProjectCompletion,
} from '../helpers/serviceDependency';
// How long a service may be bought for — shared with the standalone page so the
// two surfaces can never offer different terms.
import { BILLING_CYCLE_MONTHS, buildTenureOptions } from '../helpers/serviceTenure';
import Modal from './Modal';
import GlassButton from './GlassButton';
import ServiceOfferSelector from './ServiceOfferSelector';

// Add-on service picker, opened from a project's detail page.
//
// Deliberately a modal, not a page: the customer stays on their project (it is
// still visible behind the overlay), so no "which project am I buying for?"
// banner or back-navigation context needs to be carried anywhere.
//
// Payment is hybrid — wallet, UPI, or both — using the same two-step service purchase shape: if the wallet covers the
// total, pay instantly; otherwise show a QR for the REMAINDER only and collect the
// 12-digit UPI reference.
//
// The split shown here is only for display. The server re-derives it from the real
// balance and is the authority (a client-sent split was the original loophole,
// doc 51 Part B).
//
// A UPI payment covering several services becomes ONE parent transaction with one
// child per service, so the admin approves the batch once and every service in it
// activates together — see customerCreateServicePlanOrdersBulk.js.

const PLAN_TYPE_LABELS = {
  website_updates: 'Website Update',
  digital_marketing: 'Digital Marketing',
  google_business_setup: 'Google Business Setup',
  social_media_marketing: 'Social Media Marketing',
  other: 'Other',
};

const LIMIT_SCOPE_LABELS = {
  per_day: 'per day',
  per_week: 'per week',
  per_month: 'per month',
  per_quarter: 'per quarter',
  per_6_month: 'every 6 months',
  per_year: 'per year',
  per_plan: 'per plan',
  manual: 'per custom cycle',
};

const VALIDITY_UNIT_LABELS = { day: 'day', week: 'week', month: 'month', year: 'year' };

const BILLING_CYCLE_LABELS = {
  weekly: 'billed weekly',
  monthly: 'billed monthly',
  quarterly: 'billed quarterly',
  half_yearly: 'billed every 6 months',
  yearly: 'billed yearly',
  every_2_years: 'billed every 2 years',
  every_3_years: 'billed every 3 years',
  every_4_years: 'billed every 4 years',
  every_5_years: 'billed every 5 years',
};


const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getPriceOf = (plan) =>
  Number(plan.sellingPrice !== undefined && plan.sellingPrice !== null ? plan.sellingPrice : plan.price);

// One readable line describing what the service actually grants.
const getAccessLine = (servicePlan = {}) => {
  if (servicePlan.serviceBehavior === 'reminder_only') return 'Scheduled reminders';
  if (servicePlan.limitScope === 'unlimited') return 'Unlimited portal access';
  if (servicePlan.limitScope === 'manual') {
    return `${servicePlan.manualCount} use(s) per custom cycle`;
  }
  const scope = LIMIT_SCOPE_LABELS[servicePlan.limitScope];
  if (!servicePlan.portalAccessCount || !scope) return null;
  return `${servicePlan.portalAccessCount} use(s) ${scope}`;
};

const getValidityLine = (servicePlan = {}) => {
  if (!servicePlan.billingCycle && !servicePlan.totalBillingCycles && !servicePlan.validityInDays) {
    return 'No automatic expiry';
  }
  if (servicePlan.billingCycle && servicePlan.totalBillingCycles) {
    const billing = BILLING_CYCLE_LABELS[servicePlan.billingCycle] || 'billing';
    const cycles = Number(servicePlan.totalBillingCycles);
    return `${cycles} ${billing.toLowerCase()} cycle${cycles === 1 ? '' : 's'}`;
  }
  const unit = VALIDITY_UNIT_LABELS[servicePlan.validityUnit];
  if (!unit || !servicePlan.validityValue) return null;
  const plural = servicePlan.validityValue === 1 ? '' : 's';
  const billing = BILLING_CYCLE_LABELS[servicePlan.billingCycle];
  return `${servicePlan.validityValue} ${unit}${plural}${billing ? `, ${billing}` : ''}`;
};

const AddServiceModal = ({
  isOpen,
  onClose,
  projectOrderId,
  projectName,
  isProjectFinished,
  walletBalance = 0,
  onPurchased,
}) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  // A standalone-only service the customer tapped: it stays listed here, but is
  // bought elsewhere. Holding it in state lets the reason be shown and confirmed
  // before leaving the project, so the sale is redirected rather than refused.
  const [redirectPlan, setRedirectPlan] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [purchasedSummary, setPurchasedSummary] = useState(null);
  // UPI step (only reached when the wallet doesn't cover the total)
  const [showQR, setShowQR] = useState(false);
  const [upiLink, setUpiLink] = useState('');
  const [payTxnId, setPayTxnId] = useState('');
  const [upiReference, setUpiReference] = useState('');
  const [paymentOffer, setPaymentOffer] = useState(null);
  const [purchaseKey, setPurchaseKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!isOpen) return;

    // Reset per-open so a previous session's selection never carries over.
    setSelectedId(null);
    setPurchaseKey(crypto.randomUUID());
    setSelections({});
    setRedirectPlan(null);
    setPurchasedSummary(null);
    setShowQR(false);
    setUpiLink('');
    setPayTxnId('');
    setUpiReference('');
    setLoading(true);

    const fetchPlans = async () => {
      try {
        const response = await fetch(SummaryApi.allProduct.url);
        const dataResponse = await response.json();
        const servicePlans = (dataResponse?.data || []).filter(
          (product) =>
            product.category === 'service_plan' &&
            product.isServicePlan &&
            !product.isHidden &&
            // Retired plans are already excluded server-side; filtered here too so a
            // withdrawn plan can never be bought from a stale client payload.
            !product.retiredAt &&
            getPriceOf(product) > 0 &&
            // The admin's dependency rule. A standalone-only service is kept in the
            // list on purpose — tapping it explains where it is bought and takes the
            // customer there. Anything else that cannot be attached to a project is
            // not listed, because there is nowhere useful to send them.
            (canBuyOnSurface(product, SURFACE.PROJECT) || isRedirectableFromProject(product))
        );
        setPlans(servicePlans);
      } catch (error) {
        toast.error('Could not load services. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [isOpen]);

  // One service per purchase. A payment settles one order, so buying several at
  // once needed a payment that covered many — that grouping is gone, and this
  // modal now uses the same single-service purchase the standalone page uses.
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan._id === selectedId) || null,
    [plans, selectedId]
  );

  const getSelectedPrice = (plan) => {
    const cycle = selections[plan._id]?.selectedBillingCycle;
    const option = plan.servicePlan?.billingOptions?.find((item) => item.billingCycle === cycle);
    return Number(option?.pricePerCycle ?? getPriceOf(plan));
  };

  const hasCompleteSelection = (() => {
    if (!selectedPlan) return false;
    const options = selectedPlan.servicePlan?.billingOptions || [];
    if (!options.length) return true;
    const choice = selections[selectedPlan._id] || {};
    const cycleMonths = BILLING_CYCLE_MONTHS[choice.selectedBillingCycle] || 0;
    return Boolean(cycleMonths) && Boolean(choice.tenureMonths) && Number.isInteger(Number(choice.tenureMonths)) && Number(choice.tenureMonths) >= cycleMonths && Number(choice.tenureMonths) % cycleMonths === 0;
  })();

  const total = selectedPlan ? getSelectedPrice(selectedPlan) : 0;

  // Display-only split. The server re-derives this from the real balance and is the
  // authority — the client never tells the backend what to charge where.
  const walletPart = Math.min(Number(walletBalance || 0), total);
  const upiPart = Math.max(0, total - walletPart);
  const canPay = Boolean(selectedPlan) && hasCompleteSelection && total > 0;

  // Picking a service replaces whatever was picked before — only one at a time.
  // A standalone-only service is never selected at all: tapping it opens the
  // explanation instead, so it can never reach the purchase call (which the
  // backend would refuse anyway).
  const toggleSelection = (planId) => {
    const plan = plans.find((item) => item._id === planId);
    if (plan && isRedirectableFromProject(plan)) {
      setRedirectPlan(plan);
      return;
    }
    setSelectedId((current) => (current === planId ? null : planId));
  };

  // Confirmed: leave the project and continue on the page that actually sells
  // this service. The purchase is not cancelled, only moved to where it belongs.
  const handleRedirectConfirm = () => {
    const planId = redirectPlan?._id;
    setRedirectPlan(null);
    onClose?.();
    if (planId) navigate(`/service-plan-detail/${planId}`);
  };

  // The create call — the same single-service purchase endpoint the standalone
  // page uses, with the project attached. One payment, one order: no grouping,
  // no separate approval object.
  const createOrder = async ({ txnId, upiRef }) => {
    const choice = selections[selectedPlan._id] || {};
    const hasBillingOptions = Boolean(selectedPlan.servicePlan?.billingOptions?.length);
    const response = await fetch(SummaryApi.createServicePlanOrder.url, {
      method: SummaryApi.createServicePlanOrder.method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        planId: selectedPlan._id,
        offerSlug: paymentOffer?.slug,
        purchaseKey,
        offerQuoteKey: paymentOffer?.quoteKey,
        deferPayment: ['limited_uploads', 'pay_later'].includes(paymentOffer?.paymentPolicy?.mode),
        selectedBillingCycle: hasBillingOptions ? choice.selectedBillingCycle : undefined,
        tenureMonths: choice.tenureMonths === '' || choice.tenureMonths === undefined ? undefined : Number(choice.tenureMonths),
        linkedProjectOrderId: projectOrderId,
        addedDuringProjectPhase: isProjectFinished ? 'after_completion' : 'in_progress',
        paymentDetails: {
          transactionId: txnId,
          upiTransactionId: upiRef || null,
        },
      }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Could not add the service');
    return result.data;
  };

  // Step 1 — wallet covers everything: pay instantly. Otherwise show a QR for the
  // remainder only, exactly as the project-start flow does.
  const handlePay = async () => {
    if (!canPay || submitting) return;

    const txnId = `SVCB${Date.now()}${Math.floor(Math.random() * 10000)}`;
    if (['limited_uploads', 'pay_later'].includes(paymentOffer?.paymentPolicy?.mode)) {
      try { setSubmitting(true); const data = await createOrder({}); setPurchasedSummary(data); onPurchased?.(); }
      catch (error) { toast.error(error.message); } finally { setSubmitting(false); }
      return;
    }

    if (upiPart === 0) {
      try {
        setSubmitting(true);
        const data = await createOrder({ txnId });
        setPurchasedSummary(data);
        onPurchased?.();
        setTimeout(() => onClose?.(), 1800);
      } catch (error) {
        toast.error(error.message || 'Could not add the service');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setPayTxnId(txnId);
    const upiId = 'vacomputers.com@okhdfcbank';
    const payeeName = 'VA Computer';
    setUpiLink(
      `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${upiPart}&cu=INR&tn=${encodeURIComponent(
        `Service Payment - ${txnId}`
      )}&tr=${txnId}`
    );
    setShowQR(true);
  };

  // Step 2 (UPI path) — the customer paid the remainder and entered their reference.
  // A real UPI UTR is 12 digits, so anything shorter is rejected (doc 51 Bug 3).
  const handleVerifyUpi = async () => {
    if (submitting) return;
    if (!/^\d{12,}$/.test(upiReference.trim())) {
      toast.error('Enter the 12-digit UPI reference number');
      return;
    }
    try {
      setSubmitting(true);
      const data = await createOrder({ txnId: payTxnId, upiRef: upiReference.trim() });
      setShowQR(false);
      setPurchasedSummary(data);
      onPurchased?.();
      setTimeout(() => onClose?.(), 1800);
    } catch (error) {
      toast.error(error.message || 'Could not add the service');
    } finally {
      setSubmitting(false);
    }
  };

  // The single-service response reports how the money split; nothing waiting on
  // UPI means the service is already active.
  const purchaseApproved = purchasedSummary ? Number(purchasedSummary.upiPending || 0) <= 0 : false;
  const purchasedName = selectedPlan?.serviceName || 'Service';

  if (!isOpen) return null;

  // The dialog was hand-built: its backdrop was `bg-[var(--glass-bg-subtle)]`, a surface
  // FILL rather than a backdrop, so the page behind it was never dimmed (the same defect
  // CreateTicket.js had), and the panel carried a hardcoded `rounded-[1.75rem]` no other
  // panel in the portal uses. Modal owns the backdrop, the panel, the 2rem corner, the
  // mobile sheet, Escape-to-close and the scroll lock; its `title`/`onClose` replace the
  // hand-built header row and close button, and the subtitle keeps its place under them.
  const heading = purchasedSummary
    ? purchaseApproved
      ? 'Service added'
      : 'Submitted for approval'
    : showQR
    ? 'Pay the remaining amount'
    : isProjectFinished
    ? 'Ongoing servicing'
    : 'Add a service';

  const subheading = purchasedSummary
    ? purchaseApproved
      ? 'Your service is active now.'
      : 'Your service starts as soon as this payment is approved.'
    : showQR
    ? `Scan and pay ${formatPrice(upiPart)}`
    : `For ${projectName}`;

  return (
    <Modal open onClose={onClose} title={heading} size="lg">
      <div>
        <p className="-mt-4 mb-5 text-sm text-[var(--text-secondary)]">{subheading}</p>

        {/* Body */}
        <div className="min-h-0 flex-1">
          {purchasedSummary ? (
            <>
              {/* The tint and its icon are one status, so both come from the same badge
                  tone tokens. They were fixed emerald/amber alphas with `-300` icons —
                  dark-theme shades that washed out on the light panel. */}
              <div
                className={[
                  'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
                  purchaseApproved
                    ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)]'
                    : 'border-[var(--badge-pending-border)] bg-[var(--badge-pending-bg)]',
                ].join(' ')}
              >
                <span className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                  {purchaseApproved ? (
                    <Check className="h-4 w-4 text-[var(--badge-success-fg)]" />
                  ) : (
                    <Clock className="h-4 w-4 text-[var(--badge-pending-fg)]" />
                  )}
                  {purchasedName}
                </span>
                <span className="text-base text-[var(--text-secondary)]">{formatPrice(purchasedSummary.finalPrice)}</span>
              </div>

              {!purchaseApproved && (
                // `text-amber-100` on an amber tint is amber-on-amber in light mode.
                <p className="mt-4 rounded-xl border border-[var(--badge-pending-border)] bg-[var(--badge-pending-bg)] px-3 py-2 text-sm text-[var(--badge-pending-fg)]">
                  We've received your payment reference. This service activates once our team
                  confirms it — you don't need to pay again.
                </p>
              )}
            </>
          ) : showQR ? (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* The one deliberate `bg-white` in this file: a QR code is read by a
                  camera, not by a human, and scanners expect dark modules on a white
                  quiet zone. Theming this plate would break scanning in dark mode, so
                  it stays white in all three themes. */}
              <div className="rounded-2xl bg-white p-4">
                <QRCodeSVG value={upiLink} size={190} />
              </div>

              <div className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                <div className="flex items-center justify-between">
                  <span>Paid from wallet</span>
                  <span className="text-[var(--text-primary)]">{formatPrice(walletPart)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between font-semibold">
                  <span className="text-[var(--text-primary)]">Pay by UPI now</span>
                  <span className="text-[var(--text-primary)]">{formatPrice(upiPart)}</span>
                </div>
              </div>

              <label className="w-full">
                <span className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">
                  UPI reference number
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={upiReference}
                  onChange={(event) => setUpiReference(event.target.value.replace(/\D/g, ''))}
                  placeholder="12-digit reference"
                  className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  Find this in your UPI app after paying.
                </span>
              </label>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading services…
            </div>
          ) : plans.length === 0 ? (
            <p className="py-10 text-center text-base text-[var(--text-secondary)]">
              No services are available right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {plans.map((plan) => {
                const isSelected = selectedId === plan._id;
                const servicePlan = plan.servicePlan || {};
                const accessLine = getAccessLine(servicePlan);
                const validityLine = getValidityLine(servicePlan);
                // Listed, but bought elsewhere — tapping explains and redirects.
                const isSeparatePurchase = isRedirectableFromProject(plan);
                // Bought here and linked here; it simply starts once the project is
                // done. Only worth saying while the project is still running.
                const startsLater = !isSeparatePurchase && !isProjectFinished && startsAfterProjectCompletion(plan);

                return (
                  <li key={plan._id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleSelection(plan._id)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleSelection(plan._id); }}
                      className={[
                        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition',
                        isSeparatePurchase
                          ? 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg-subtle)]'
                          : isSelected
                          // Selection reads from border + ring, not a coloured fill —
                          // the same fix 2A.2 applied to ProjectDetailView's feature
                          // cards, where an opaque emerald fill measured 1.00:1 in light
                          // mode and the customer could not see what they had picked.
                          ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] ring-1 ring-[var(--accent-soft-fg)]'
                          : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg)]',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          isSeparatePurchase
                            ? 'border-[var(--glass-border-strong)] bg-transparent text-[var(--text-muted)]'
                            : isSelected
                            // The tick box is a filled mark: ink fill, page-ground tick,
                            // so the two invert together the way GlassButton's primary does.
                            ? 'border-transparent bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)]'
                            : 'border-[var(--glass-border-strong)] bg-transparent',
                        ].join(' ')}
                      >
                        {isSeparatePurchase ? (
                          <ExternalLink className="h-3 w-3" />
                        ) : (
                          isSelected && <Check className="h-3.5 w-3.5" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-base font-semibold text-[var(--text-primary)]">{plan.serviceName}</span>
                          <span className="text-base font-semibold text-[var(--text-primary)]">
                            {formatPrice(getSelectedPrice(plan))}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                          {PLAN_TYPE_LABELS[servicePlan.planType] || 'Service'}
                          {accessLine ? ` · ${accessLine}` : ''}
                        </span>
                        {validityLine && (
                          <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{validityLine}</span>
                        )}
                        {isSeparatePurchase && (
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                            <ExternalLink className="h-3 w-3" />
                            Bought separately
                          </span>
                        )}
                        {startsLater && (
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--badge-pending-border)] bg-[var(--badge-pending-bg)] px-2 py-1 text-xs font-semibold text-[var(--badge-pending-fg)]">
                            <Clock className="h-3 w-3" />
                            Starts when this project is completed
                          </span>
                        )}
                        {isSelected && servicePlan.billingOptions?.length > 0 && (
                          <span className="mt-3 grid gap-2 sm:grid-cols-2" onClick={(event) => event.stopPropagation()}>
                            <label><span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Billing period</span><select className="w-full rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-2.5 py-2 text-sm text-[var(--text-primary)]" value={selections[plan._id]?.selectedBillingCycle || ''} onChange={(event) => setSelections((current) => ({ ...current, [plan._id]: { ...current[plan._id], selectedBillingCycle: event.target.value, tenureMonths: '' } }))}><option value="">Select period</option>{servicePlan.billingOptions.map((option) => <option key={option.billingCycle} value={option.billingCycle}>{BILLING_CYCLE_LABELS[option.billingCycle]} — {formatPrice(option.pricePerCycle)}</option>)}</select></label>
                            <label><span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Total tenure</span><select required className="w-full rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-2.5 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50" disabled={!selections[plan._id]?.selectedBillingCycle} value={selections[plan._id]?.tenureMonths || ''} onChange={(event) => setSelections((current) => ({ ...current, [plan._id]: { ...current[plan._id], tenureMonths: event.target.value } }))}><option value="">Select tenure</option>{buildTenureOptions(BILLING_CYCLE_MONTHS[selections[plan._id]?.selectedBillingCycle]).map((option) => <option key={option.months} value={option.months}>{option.label}</option>)}</select></label>
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--glass-border)] px-6 py-5">
          {purchasedSummary ? (
            <GlassButton variant="primary" size="lg" onClick={onClose} className="w-full">
              Done
            </GlassButton>
          ) : showQR ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowQR(false)}
                disabled={submitting}
                className="rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg)] disabled:opacity-50"
              >
                Back
              </button>
              <GlassButton
                variant="primary"
                size="lg"
                onClick={handleVerifyUpi}
                disabled={submitting || upiReference.trim().length < 12}
                className="flex-1 disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
              >
                {submitting ? 'Submitting…' : 'Submit Payment'}
              </GlassButton>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-base text-[var(--text-primary)]">
                <span>{selectedPlan ? selectedPlan.serviceName : 'Select a service'}</span>
                <span className="font-bold">{formatPrice(total)}</span>
              </div>

              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Wallet balance: {formatPrice(walletBalance)}
              </p>

              <ServiceOfferSelector planId={selectedPlan?._id} onChange={setPaymentOffer} />
              {selectedPlan && !hasCompleteSelection && <p className="mt-2 text-sm text-[var(--badge-pending-fg)]">Select a billing period and tenure for this service.</p>}

              {/* Split breakdown — shown only when the payment actually is a split. */}
              {selectedPlan && upiPart > 0 && (
                <div className="mt-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between text-[var(--text-secondary)]">
                    <span>From wallet</span>
                    <span className="text-[var(--text-primary)]">{formatPrice(walletPart)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[var(--text-secondary)]">
                    <span>By UPI</span>
                    <span className="text-[var(--text-primary)]">{formatPrice(upiPart)}</span>
                  </div>
                </div>
              )}

              <GlassButton
                variant="primary"
                size="lg"
                onClick={handlePay}
                disabled={!canPay || submitting}
                className="mt-3 w-full disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
              >
                {submitting
                  ? 'Processing…'
                  : upiPart > 0
                  ? `Pay ${formatPrice(total)}`
                  : `Pay ${formatPrice(total)} from Wallet`}
              </GlassButton>
            </>
          )}
        </div>
      </div>

      {/* Standalone-only service: explain where it is bought, then take them there.
          The purchase is redirected, never refused — the customer keeps the sale
          and lands on the page that can actually complete it.

          This was an `absolute inset-0` overlay nested INSIDE the old hand-built panel,
          with the same surface-fill-as-backdrop defect. It is its own Modal now, which is
          what it always was: a second dialog over the first. */}
      {redirectPlan && (
        <Modal
          open
          onClose={() => setRedirectPlan(null)}
          eyebrow="Bought separately"
          title={redirectPlan.serviceName}
          size="sm"
          footer={(
            <div className="flex gap-3">
              <GlassButton strong onClick={() => setRedirectPlan(null)} className="flex-1">
                Stay here
              </GlassButton>
              <GlassButton variant="primary" onClick={handleRedirectConfirm} className="flex-1">
                Continue
              </GlassButton>
            </div>
          )}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            This service runs on its own and cannot be attached to
            {projectName ? ` ${projectName}` : ' this project'}. It is bought separately, and
            works the same either way.
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Continue to buy it on its own page?
          </p>
        </Modal>
      )}
    </Modal>
  );
};

export default AddServiceModal;
