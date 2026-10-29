import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import ServiceOfferSelector from '../components/ServiceOfferSelector';
import { QuoteBill } from '../components/PlanBuilder';
import usePlanQuote from '../hooks/usePlanQuote';
import SummaryApi from '../common';
import Context from '../context';
import { WEBSITE_URL } from '../helpers/brand';
import { initialPlanChoice, planChoiceBody, planChoiceQuery } from '../helpers/serviceTenure';
import { readCustomerPlanCatalogue } from '../helpers/customerPlanCatalogue';
import { evaluateServiceSurface, SURFACE } from '../helpers/serviceDependency';
import {
  checkoutChangeHref, checkoutDonePath, checkoutNextSteps, checkoutOrigin, checkoutResult,
  forgetPurchaseKey, isUpiReference, paymentSplit, purchaseKeyFor,
} from '../helpers/planCheckout';

// The plan checkout (merasoftware/src/docs/plan.md §4): one page where a client pays for a plan they
// already chose — on the website's plan page or the portal's plan builder — and then sees the result.
//   /checkout/:planId?<choice>&from=website|portal   summary → pay (wallet, or UPI for the remainder)
//   /checkout/done/:orderId?from=…                   the order's real status, two ways on, and an
//                                                    automatic return to where the client came from
// The backend re-prices the plan, decides the wallet/UPI split and guards repeats (purchase key);
// nothing here is trusted for money.

const UPI_PAYEE = { id: 'vacomputers.com@okhdfcbank', name: 'VA Computer' }; // one place later: plan.md §4.3
const REDIRECT_SECONDS = 10;
const DEFERRED_MODES = ['limited_uploads', 'pay_later'];

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const newTransactionId = () => `SVC${Date.now()}${Math.floor(Math.random() * 10000)}`;

const card = 'flex flex-col gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-5 sm:p-6';
const primaryButton = 'inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]';
const secondaryButton = 'inline-flex w-full items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-subtle)] disabled:cursor-not-allowed';

// One line of a summary; amounts in figures (`money`), names in plain text.
const Row = ({ label, value, strong, money = true }) => (
  <div className={`flex items-center justify-between gap-3 text-base ${strong ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
    <span>{label}</span><span className={money ? 'font-mono tabular-nums' : 'text-right'}>{value}</span>
  </div>
);

// A link that may leave the portal app (the website) or stay inside it.
const PlaceLink = ({ to, className, children }) => (to.external
  ? <a href={to.href} className={className}>{children}</a>
  : <Link to={to.href} className={className}>{children}</Link>);

const Shell = ({ header, children }) => {
  const user = useSelector((state) => state?.user?.user);
  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-clip px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto w-full max-w-2xl">
          {header}
          <div className={header ? 'mt-10' : ''}>{children}</div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const CheckoutScreen = ({ planId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(Context);
  const from = checkoutOrigin(location.search);
  const [plan, setPlan] = useState(null);
  const [loadState, setLoadState] = useState({ loaded: false, error: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const [offer, setOffer] = useState(null);
  const [step, setStep] = useState('review');
  const [upi, setUpi] = useState({ txnId: '', reference: '' });
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    readCustomerPlanCatalogue(controller.signal).then((catalogue) => {
      if (controller.signal.aborted) return;
      const found = catalogue.plans.find((row) => row._id === planId) || null;
      setPlan(found);
      setLoadState({ loaded: true, error: found ? '' : 'This plan is no longer available. Explore the current plans instead.' });
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadState({ loaded: true, error: error.message || 'Could not load this plan.' });
    });
    return () => controller.abort();
  }, [planId]);

  // The choice from the address, kept only where this plan offers it (same rule as the builder).
  const choice = useMemo(() => {
    const initial = plan && initialPlanChoice(plan, location.search);
    return initial ? planChoiceBody(plan, initial) : null;
  }, [plan, location.search]);
  const priced = usePlanQuote(plan, choice, refreshToken);
  const deferred = DEFERRED_MODES.includes(offer?.paymentPolicy?.mode);
  const split = paymentSplit(priced.quote?.firstPayment, context?.walletBalance);
  // One key per choice and offer, kept for this tab until the purchase succeeds (helpers/planCheckout.js).
  const keyScope = `${planId}?${choice ? planChoiceQuery(choice) : ''}|${offer?.slug || ''}`;
  const purchaseKey = useMemo(() => purchaseKeyFor(keyScope), [keyScope]);

  // A new price (or a lost quote) always returns to the summary, so nobody pays an amount they did not see.
  useEffect(() => { if (!priced.ready) setStep('review'); }, [priced.ready]);

  const buy = async ({ txnId, upiReference } = {}) => {
    const response = await fetch(SummaryApi.createServicePlanOrder.url, {
      method: SummaryApi.createServicePlanOrder.method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        planId,
        offerSlug: offer?.slug,
        offerQuoteKey: offer?.quoteKey,
        deferPayment: deferred,
        purchaseKey,
        ...priced.body,
        paymentDetails: { transactionId: txnId, upiTransactionId: upiReference || null },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw Object.assign(new Error(result.message || 'Could not complete the purchase.'), { status: response.status });
    return result.data;
  };

  const run = async (task) => {
    if (processing || !priced.ready) return;
    setProcessing(true); setNotice('');
    try {
      const created = await task();
      if (!created) return;
      forgetPurchaseKey(keyScope);
      context?.fetchWalletBalance?.();
      navigate(checkoutDonePath(created.orderId, from), { replace: true, state: { justPaid: true } });
    } catch (error) {
      // 409: the price changed, or this same purchase is already being processed. Nothing was
      // bought by this request; ask the price again so the summary shows what is true now.
      if (error.status === 409) setRefreshToken((value) => value + 1);
      setNotice(error.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Summary → pay: an agreed payment offer, the wallet alone, or the UPI step for the remainder.
  const pay = () => run(async () => {
    if (deferred) return buy();
    if (split.upi === 0) return buy({ txnId: newTransactionId() });
    setUpi({ txnId: newTransactionId(), reference: '' });
    setStep('upi');
    return null;
  });
  const sendUpi = () => run(() => buy({ txnId: upi.txnId, upiReference: upi.reference.trim() }));

  if (!loadState.loaded) return <Shell><GlassPageState message="Loading your checkout…" /></Shell>;
  if (!plan) {
    return (
      <Shell header={<CustomerPageHeader title="Plan not available" />}>
        <GlassPageState type="error" message={loadState.error} onRetry={() => window.location.reload()} />
      </Shell>
    );
  }

  const change = choice && { href: checkoutChangeHref(planId, choice, from, WEBSITE_URL), external: from === 'website' };
  const goBack = () => (change.external ? window.location.assign(change.href) : navigate(change.href));
  const header = <CustomerPageHeader title="Checkout" subtitle={plan.serviceName} onBack={change ? goBack : undefined} />;

  // Bought only inside a project (or not sold on its own): say so and show where to go instead.
  const eligibility = evaluateServiceSurface(plan, SURFACE.STANDALONE);
  if (!eligibility.allowed || !choice) {
    return (
      <Shell header={header}>
        <section className={`${card} text-[var(--text-secondary)]`}>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{eligibility.dependency === 'project_required' ? 'This plan needs a project' : 'This plan cannot be bought here'}</h2>
          <p>{eligibility.reason || 'This plan cannot be bought right now. Please contact support.'}</p>
          {eligibility.dependency === 'project_required' && <p>Open the project you want us to work on, then choose Add a Service and select this plan.</p>}
          <Link to="/projects-and-plans" className="self-start rounded-xl border border-[var(--glass-border-strong)] px-4 py-2 font-semibold text-[var(--text-primary)]">Open my projects</Link>
        </section>
      </Shell>
    );
  }

  const upiLink = `upi://pay?pa=${UPI_PAYEE.id}&pn=${encodeURIComponent(UPI_PAYEE.name)}&am=${split.upi}&cu=INR&tn=${encodeURIComponent(`Service Plan Payment - ${upi.txnId}`)}&tr=${upi.txnId}`;
  const payLabel = deferred ? `Activate with ${offer.title}` : split.upi === 0 ? `Pay ${formatPrice(split.total)} from wallet` : 'Continue to UPI';

  return (
    <Shell header={header}>
      {/* One focused column: what is bought, then how it is paid. */}
      <div className="flex flex-col gap-6">
        <section className={card} aria-labelledby="checkout-plan">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--eyebrow-fg)]">Your plan</span>
              <h2 id="checkout-plan" className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{plan.serviceName}</h2>
            </div>
            <PlaceLink to={change} className="shrink-0 text-sm font-semibold text-[var(--accent-soft-fg)] underline-offset-4 hover:underline">Change</PlaceLink>
          </div>
          <QuoteBill plan={plan} quote={priced.quote} loading={priced.loading} error={priced.error} />
          <p className="text-sm text-[var(--text-secondary)]">After buying, you use this plan in your client portal: send files, follow the work and see bills.</p>
        </section>

        <section className={card} aria-labelledby="checkout-pay">
          {step === 'review' ? (
            <>
              <h2 id="checkout-pay" className="text-lg font-semibold text-[var(--text-primary)]">Payment</h2>
              <ServiceOfferSelector planId={plan._id} onChange={setOffer} />
              <div className="flex flex-col gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4">
                <Row label="Amount due now" value={formatPrice(split.total)} strong />
                {deferred ? <Row label="To pay now" value={formatPrice(0)} /> : (
                  <>
                    <Row label="Paid from wallet" value={formatPrice(split.wallet)} />
                    {split.upi > 0 && <Row label="To pay by UPI" value={formatPrice(split.upi)} />}
                  </>
                )}
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Wallet balance: {formatPrice(context?.walletBalance)}.{' '}
                {deferred ? `Payment stays pending under ${offer.title}; nothing is taken now.`
                  : split.upi > 0 ? 'The UPI part is checked by our team; your plan starts when it is approved.'
                    : 'Your wallet covers it, so the plan starts at once.'}
              </p>
              <button type="button" className={primaryButton} disabled={processing || !priced.ready} onClick={pay}>
                {processing ? 'Processing…' : priced.ready ? payLabel : 'Working out the price…'}
              </button>
            </>
          ) : (
            <>
              <h2 id="checkout-pay" className="text-lg font-semibold text-[var(--text-primary)]">Pay {formatPrice(split.upi)} by UPI</h2>
              {split.wallet > 0 && <p className="text-sm text-[var(--text-secondary)]">{formatPrice(split.wallet)} comes from your wallet when you send this payment.</p>}
              <div className="mx-auto rounded-2xl bg-white p-4"><QRCodeSVG value={upiLink} size={192} /></div>
              <p className="text-center text-sm text-[var(--text-secondary)]">Scan with any UPI app, or pay to <span className="font-mono font-semibold text-[var(--text-primary)]">{UPI_PAYEE.id}</span> ({UPI_PAYEE.name}).</p>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">UPI reference number</span>
                <input
                  className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-soft-fg)] focus:ring-4 focus:ring-[var(--accent-soft-bg)]"
                  type="text" inputMode="numeric" autoComplete="off" placeholder="12-digit reference number"
                  value={upi.reference} onChange={(event) => setUpi((value) => ({ ...value, reference: event.target.value }))}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button type="button" className={primaryButton} disabled={processing || !priced.ready || !isUpiReference(upi.reference)} onClick={sendUpi}>
                  {processing ? 'Sending…' : 'Send payment for checking'}
                </button>
                <button type="button" className={secondaryButton} disabled={processing} onClick={() => setStep('review')}>Back</button>
              </div>
            </>
          )}
          {notice && <p role="alert" className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{notice}</p>}
        </section>
      </div>
    </Shell>
  );
};

// A plan change starts a fresh checkout: no previous quote or payment step can leak into it.
export default function PlanCheckout() {
  const { planId } = useParams();
  return <CheckoutScreen key={planId} planId={planId} />;
}

const RESULT_LOOK = {
  success: { Icon: CheckCircle2, color: 'text-[var(--badge-success-fg)]', badge: 'badge badge-success' },
  pending: { Icon: Clock, color: 'text-[var(--badge-pending-fg)]', badge: 'badge badge-pending' },
  error: { Icon: XCircle, color: 'text-[var(--badge-error-fg)]', badge: 'badge badge-error' },
  neutral: { Icon: Clock, color: 'text-[var(--text-muted)]', badge: 'badge badge-neutral' },
};

// After paying: the order as the backend sees it now, so the page tells the truth on every visit.
// Straight after a payment it returns the client to where they came from unless they stay.
export function PlanCheckoutDone() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const from = checkoutOrigin(location.search);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS);
  const [stayed, setStayed] = useState(!location.state?.justPaid);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${SummaryApi.orderDetails.url}/${orderId}`, { credentials: 'include', signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!result.success || !result.data?.isServicePlan) throw new Error(result.message || 'This purchase could not be found.');
        setOrder(result.data);
      })
      .catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, [orderId]);

  const result = order && checkoutResult(order);
  const steps = checkoutNextSteps(orderId, from, WEBSITE_URL);
  const counting = Boolean(result?.redirect) && !stayed;
  const { href: nextHref, external: nextExternal } = steps.next;

  // Any click or key press means the client is reading or acting: the automatic return stops.
  useEffect(() => {
    if (!counting) return undefined;
    const stop = () => setStayed(true);
    document.addEventListener('pointerdown', stop);
    document.addEventListener('keydown', stop);
    const timer = setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => { clearInterval(timer); document.removeEventListener('pointerdown', stop); document.removeEventListener('keydown', stop); };
  }, [counting]);
  useEffect(() => {
    if (!counting || seconds > 0) return;
    if (nextExternal) window.location.assign(nextHref);
    else navigate(nextHref);
  }, [counting, seconds, nextHref, nextExternal, navigate]);

  if (error) {
    return <Shell header={<CustomerPageHeader title="Purchase" />}><GlassPageState type="error" message={error} onRetry={() => window.location.reload()} /></Shell>;
  }
  if (!order) return <Shell><GlassPageState message="Checking your purchase…" /></Shell>;

  const look = RESULT_LOOK[result.tone];
  return (
    <Shell>
      <section className={`${card} mx-auto max-w-lg text-center`} aria-labelledby="checkout-result">
        <look.Icon className={`mx-auto h-12 w-12 ${look.color}`} aria-hidden="true" />
        <h1 id="checkout-result" className="text-2xl font-bold text-[var(--text-primary)]">{result.title}</h1>
        <p className="text-base text-[var(--text-secondary)]">{result.text}</p>
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-left">
          <Row label="Plan" value={order.servicePlanSnapshot?.serviceName || 'Plan'} strong money={false} />
          <Row label="Amount" value={formatPrice(order.totalAmount)} />
          <div className="flex items-center justify-between gap-3 text-base text-[var(--text-secondary)]">
            <span>Status</span><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${look.badge}`}>{order.orderState?.label}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <PlaceLink to={steps.primary} className={primaryButton}>{steps.primary.label}</PlaceLink>
          <PlaceLink to={steps.secondary} className={secondaryButton}>{steps.secondary.label}</PlaceLink>
        </div>
        {counting && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-[var(--text-muted)]">
            <span aria-live="off">Taking you to {steps.next.place} in {Math.max(0, seconds)}s.</span>
            <button type="button" className="font-semibold text-[var(--text-primary)] underline underline-offset-4" onClick={() => setStayed(true)}>Stay here</button>
          </p>
        )}
      </section>
    </Shell>
  );
}
