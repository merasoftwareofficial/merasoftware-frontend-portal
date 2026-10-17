import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SummaryApi from '../common';
import { BILLING_CYCLE_MONTHS, buildTenureOptions } from '../helpers/serviceTenure';
import Context from '../context';
import GlassPageState from '../components/GlassPageState';

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

const MANUAL_UNIT_LABELS = {
  day: 'day(s)',
  week: 'week(s)',
  month: 'month(s)',
};

const VALIDITY_UNIT_LABELS = {
  day: 'Day(s)',
  week: 'Week(s)',
  month: 'Month(s)',
  year: 'Year(s)',
};

const BILLING_CYCLE_LABELS = {
  weekly: 'Billed Weekly',
  monthly: 'Billed Monthly',
  quarterly: 'Billed Quarterly',
  half_yearly: 'Billed Every 6 Months',
  yearly: 'Billed Yearly',
  every_2_years: 'Billed Every 2 Years',
  every_3_years: 'Billed Every 3 Years',
  every_4_years: 'Billed Every 4 Years',
  every_5_years: 'Billed Every 5 Years',
};

// Billing periods and tenure choices come from the shared SSOT (helpers/serviceTenure.js).

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const getPortalAccessLine = (servicePlan) => {
  if (!servicePlan) return null;

  if (servicePlan.limitScope === 'unlimited') {
    return 'Unlimited portal access';
  }

  if (servicePlan.limitScope === 'manual') {
    const unitLabel = MANUAL_UNIT_LABELS[servicePlan.manualUnit] || '';
    return `${servicePlan.manualCount} use(s) per ${servicePlan.manualCount === 1 ? unitLabel.replace('(s)', '') : unitLabel}`;
  }

  const scopeLabel = LIMIT_SCOPE_LABELS[servicePlan.limitScope] || '';
  return `${servicePlan.portalAccessCount} use(s) ${scopeLabel}`;
};

const getValidityLine = (servicePlan) => {
  if (!servicePlan) return null;
  if (!servicePlan.billingCycle && !servicePlan.totalBillingCycles && !servicePlan.validityInDays) {
    return 'No automatic expiry';
  }
  if (servicePlan.billingCycle && servicePlan.totalBillingCycles) {
    const cycles = Number(servicePlan.totalBillingCycles);
    return `Ends after ${cycles} billing cycle${cycles === 1 ? '' : 's'}`;
  }
  const unitLabel = VALIDITY_UNIT_LABELS[servicePlan.validityUnit] || '';
  return `${servicePlan.validityValue} ${unitLabel}`;
};

const SectionHeading = ({ children }) => (
  <h2 className="border-b border-[var(--glass-border)] pb-2 text-xl font-bold text-[var(--text-primary)]">
    {children}
  </h2>
);

const ServicePlanDetail = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { planId } = useParams();
  const context = useContext(Context);
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  // In-page payment step: the order and its payment are created together
  // in one backend call, so a payment-less order can never exist.
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [upiLink, setUpiLink] = useState('');
  const [payTxnId, setPayTxnId] = useState('');
  const [upiTransactionId, setUpiTransactionId] = useState('');
  const [payProcessing, setPayProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setLoadError('');
        const response = await fetch(SummaryApi.productDetails.url, {
          method: SummaryApi.productDetails.method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: planId }),
        });
        if (!response.ok) throw new Error('Could not load this service');
        const dataResponse = await response.json();
        setPlan(dataResponse?.data || null);
      } catch (error) {
        setLoadError(error.message || 'Could not load this service.');
      } finally {
        setLoaded(true);
      }
    };
    fetchPlan();
  }, [planId]);

  const handleBack = () => goToCustomerReturn(navigate, location, '/start-new-project/services?tab=services');

  const generateTransactionId = () =>
    `SVC${Date.now()}${Math.floor(Math.random() * 10000)}`;

  // Creates the order + its payment atomically. The backend re-derives the price
  // and the wallet/UPI split itself — nothing here is trusted for money.
  const createServicePlanOrder = async ({ txnId, upiRef }) => {
    const response = await fetch(SummaryApi.createServicePlanOrder.url, {
      method: SummaryApi.createServicePlanOrder.method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        // This page is the standalone purchase surface. Buying a service FOR a
        // project happens in AddServiceModal, opened from the project itself.
        planId: plan._id,
        selectedBillingCycle: plan?.servicePlan?.billingOptions?.length ? selectedBillingCycle : undefined,
        tenureMonths: tenureMonths === '' ? undefined : Number(tenureMonths),
        paymentDetails: {
          transactionId: txnId,
          upiTransactionId: upiRef || null,
        },
      }),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Could not complete the purchase');
    }
    return result.data;
  };

  // Wallet/UPI split for display + flow choice. The wallet is the customer's own
  // money so it applies first; only the remainder needs UPI. The backend
  // independently re-derives this same split from the real balance.
  const catalogueBillingOptions = plan?.servicePlan?.billingOptions || [];
  const selectedBillingOption = catalogueBillingOptions.find((option) => option.billingCycle === selectedBillingCycle);
  const selectedCycleMonths = BILLING_CYCLE_MONTHS[selectedBillingCycle] || 0;
  const planPrice = Number(selectedBillingOption?.pricePerCycle ?? plan?.sellingPrice ?? plan?.price ?? 0);
  const currentWalletBalance = Number(context?.walletBalance || 0);
  const currentWalletPart = Math.min(currentWalletBalance, planPrice);
  const currentUpiPart = Math.max(0, planPrice - currentWalletPart);
  const handleOpenPayment = () => {
    setShowPaymentModal(true);
  };

  // Step 1: customer confirmed the summary → start the wallet/UPI flow.
  const handleConfirmPayment = async () => {
    if (payProcessing) return;
    if (catalogueBillingOptions.length && !selectedBillingOption) return toast.error('Select a billing period first.');
    if (!tenureMonths) return toast.error('Select the total service tenure.');
    if (!Number.isInteger(Number(tenureMonths)) || Number(tenureMonths) < selectedCycleMonths || Number(tenureMonths) % selectedCycleMonths !== 0) return toast.error('Total tenure must be a whole multiple of the billing period.');
    try {
      setPayProcessing(true);

      // Wallet covers the whole amount → instant debit, auto-approved, no UPI.
      if (currentUpiPart === 0) {
        await createServicePlanOrder({ txnId: generateTransactionId() });
        context?.fetchWalletBalance?.();
        setShowPaymentModal(false);
        setShowSuccess(true);
        return;
      }

      // Wallet doesn't fully cover it → UPI QR for the remainder only.
      const txnId = generateTransactionId();
      setPayTxnId(txnId);
      const upiId = 'vacomputers.com@okhdfcbank';
      const payeeName = 'VA Computer';
      setUpiLink(
        `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${currentUpiPart}&cu=INR&tn=${encodeURIComponent(
          `Service Plan Payment - ${txnId}`
        )}&tr=${txnId}`
      );
      setShowQR(true);
    } catch (error) {
      toast.error(error.message || 'Payment failed. Please try again.');
    } finally {
      setPayProcessing(false);
    }
  };

  // Step 2 (QR path): customer entered their UPI reference → submit for approval.
  const handleVerifyUpi = async () => {
    const trimmedUpiId = upiTransactionId.trim();
    // UPI UTR/reference is 12-digit numeric — same rule as the customize flow.
    if (!/^\d{12,}$/.test(trimmedUpiId)) {
      toast.error('UPI transaction ID must be at least 12 digits');
      return;
    }
    try {
      setPayProcessing(true);
      await createServicePlanOrder({ txnId: payTxnId, upiRef: trimmedUpiId });
      context?.fetchWalletBalance?.();
      setShowQR(false);
      setShowPaymentModal(false);
      setShowSuccess(true);
    } catch (error) {
      toast.error(error.message || 'Verification failed. Please try again.');
    } finally {
      setPayProcessing(false);
    }
  };

  if (!loaded) {
    return (
      <DashboardLayout user={user}>
        <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <div className="relative mx-auto w-full max-w-7xl"><GlassPageState message="Loading service details…" /></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout user={user}>
        <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 pb-10 sm:px-6 lg:px-8 lg:py-12">
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-5 py-10 text-center text-[var(--text-primary)] shadow-[0_25px_80px_-35px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
              <GlassPageState type="error" message={loadError || 'This service could not be found.'} onRetry={() => window.location.reload()} />
              <button
                type="button"
                onClick={handleBack}
                className="mt-4 rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-2 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]"
              >
                Back to Plans
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const servicePlan = plan.servicePlan || {};
  const description = plan.formattedDescriptions?.[0]?.content || '';
  const planTypeLabel = PLAN_TYPE_LABELS[servicePlan.planType] || 'Service Plan';
  const isReminderOnly = servicePlan.serviceBehavior === 'reminder_only';
  const portalAccessLine = getPortalAccessLine(servicePlan);
  const validityLine = getValidityLine(servicePlan);
  const billingCycleLabel = BILLING_CYCLE_LABELS[servicePlan.billingCycle];
  const hasPrice = plan.price !== undefined && plan.price !== null;
  const hasSellingPrice = plan.sellingPrice !== undefined && plan.sellingPrice !== null;
  const showStrikethroughBasePrice = hasPrice && hasSellingPrice && Number(plan.price) !== Number(plan.sellingPrice);

  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 pb-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
          <article className="relative overflow-hidden rounded-[2rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-primary)] shadow-[0_25px_80px_-35px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150">
            {/* Header */}
            <div className="relative bg-[var(--glass-bg-subtle)] px-5 py-5 text-[var(--text-primary)] sm:px-6 lg:px-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {plan.serviceName}
              </h1>
              <p className="mt-2 text-base font-medium text-[var(--text-primary)]">{planTypeLabel}</p>
            </div>

            <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
              {/* 1. Description */}
              {description && (
                <section>
                  <SectionHeading>What is this plan?</SectionHeading>
                  <div
                    className="prose prose-lg prose-invert mt-3 max-w-none text-base leading-7 text-[var(--text-secondary)]"
                    dangerouslySetInnerHTML={{ __html: description }}
                  />
                </section>
              )}

              {/* 2. What You Get — a reminder-only service has no portal
                  allowance to list, so the whole section is skipped. */}
              {!isReminderOnly && (
              <section>
                <SectionHeading>What You Get</SectionHeading>
                <ul className="mt-3 space-y-2">
                  {portalAccessLine && (
                    <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--badge-success-fg)]" />
                      {portalAccessLine}
                    </li>
                  )}
                  {servicePlan.filesLimit && (
                    <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--badge-success-fg)]" />
                      Up to {servicePlan.filesLimit} file(s) per request
                    </li>
                  )}
                </ul>
              </section>
              )}

              {/* 3. Plan Validity */}
              <section>
                <SectionHeading>Plan Validity</SectionHeading>
                <ul className="mt-3 space-y-2">
                  {validityLine && (
                    <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--badge-success-fg)]" />
                      Valid for {validityLine}
                    </li>
                  )}
                  {billingCycleLabel && (
                    <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--badge-success-fg)]" />
                      {billingCycleLabel}
                    </li>
                  )}
                </ul>
              </section>

              {/* 4. Price */}
              {hasSellingPrice && (
                <section>
                  <SectionHeading>Price</SectionHeading>
                  <div className="mt-3 flex items-baseline gap-3">
                    {showStrikethroughBasePrice && (
                      <span className="text-lg text-[var(--text-muted)] line-through">{formatPrice(plan.price)}</span>
                    )}
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{formatPrice(plan.sellingPrice)}</span>
                  </div>
                </section>
              )}
            </div>

            {/* 5. Purchase action */}
            <div className="border-t border-[var(--glass-border)] px-5 py-6 sm:px-8 sm:py-8">
              <button
                type="button"
                onClick={handleOpenPayment}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] sm:w-auto"
              >
                Proceed to Payment
              </button>
            </div>
          </article>
        </div>
      </div>

      {/* Payment confirmation — wallet first, UPI QR only for any remainder. */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-bg-subtle)] px-4 py-6">
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--menu-bg)] p-6 text-[var(--text-primary)] shadow-2xl backdrop-blur-2xl">
            {!showQR ? (
              <>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Confirm your purchase</h2>
                <p className="mt-1 text-base text-[var(--text-secondary)]">{plan.serviceName}</p>

                {catalogueBillingOptions.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label><span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">Billing period</span><select className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)]" value={selectedBillingCycle} onChange={(event) => { setSelectedBillingCycle(event.target.value); setTenureMonths(''); }}><option value="">Select billing period</option>{catalogueBillingOptions.map((option) => <option key={option.billingCycle} value={option.billingCycle}>{BILLING_CYCLE_LABELS[option.billingCycle]} — {formatPrice(option.pricePerCycle)}</option>)}</select></label>
                    <label><span className="mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]">Total tenure</span><select required className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] disabled:opacity-50" disabled={!selectedBillingCycle} value={tenureMonths} onChange={(event) => setTenureMonths(event.target.value)}><option value="">Select tenure</option>{buildTenureOptions(selectedCycleMonths).map((option) => <option key={option.months} value={option.months}>{option.label}</option>)}</select></label>
                  </div>
                )}
                {catalogueBillingOptions.length > 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">{tenureMonths && selectedCycleMonths ? `${Number(tenureMonths) / selectedCycleMonths} billing cycles. ` : ''}First selected period is paid now; further invoices follow this billing period until the selected tenure ends.</p>}

                <div className="mt-5 space-y-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4">
                  <div className="flex items-center justify-between text-base text-[var(--text-secondary)]">
                    <span>Amount due</span>
                    <span className="font-semibold">{formatPrice(planPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base text-[var(--text-secondary)]">
                    <span>Paid from wallet</span>
                    <span className="font-semibold">{formatPrice(currentWalletPart)}</span>
                  </div>
                  {currentUpiPart > 0 && (
                    <div className="flex items-center justify-between border-t border-[var(--glass-border)] pt-2 text-base text-[var(--text-secondary)]">
                      <span>To pay via UPI</span>
                      <span className="font-semibold">{formatPrice(currentUpiPart)}</span>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Wallet balance: {formatPrice(currentWalletBalance)}
                  {currentUpiPart > 0
                    ? ' — the remaining amount needs admin approval after you pay by UPI.'
                    : ' — this purchase is covered by your wallet and activates immediately.'}
                </p>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={payProcessing}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
                  >
                    {payProcessing ? 'Processing…' : currentUpiPart === 0 ? 'Pay from Wallet' : 'Continue to UPI'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    disabled={payProcessing}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg)] disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Pay {formatPrice(currentUpiPart)}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Scan the QR, then enter the UPI reference number from your payment app.
                </p>

                {/* Stays white in every theme on purpose: a QR code is read by a camera,
                    which expects dark modules on a white quiet zone. */}
                <div className="mt-4 flex justify-center rounded-2xl border border-[var(--glass-border)] bg-white p-4">
                  <QRCodeSVG value={upiLink} size={190} />
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-base font-semibold text-[var(--text-secondary)]">
                    UPI Reference Number
                  </span>
                  <input
                    className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--badge-success-fg)] focus:ring-4 focus:ring-[var(--badge-success-bg)]"
                    type="text"
                    inputMode="numeric"
                    placeholder="12-digit reference number"
                    value={upiTransactionId}
                    onChange={(event) => setUpiTransactionId(event.target.value)}
                  />
                </label>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleVerifyUpi}
                    disabled={payProcessing || upiTransactionId.trim().length < 12}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
                  >
                    {payProcessing ? 'Submitting…' : 'Send payment for checking'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQR(false)}
                    disabled={payProcessing}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg)] disabled:cursor-not-allowed"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--glass-bg-subtle)] px-4 py-6">
          <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--glass-border-strong)] bg-[var(--menu-bg)] p-6 text-center text-[var(--text-primary)] shadow-2xl backdrop-blur-2xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--badge-success-fg)]" />
            <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
              {currentUpiPart === 0 ? 'Your service is active' : 'Payment submitted'}
            </h2>
            <p className="mt-2 text-base text-[var(--text-secondary)]">
              {currentUpiPart === 0
                ? `${plan.serviceName} has been activated.`
                : 'We’re checking your payment. We’ll let you know when it is confirmed.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/projects-and-plans')}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]"
            >
              View My Plans
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ServicePlanDetail;
