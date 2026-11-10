import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import Spinner from '../components/Spinner';
import { formatCurrency } from '../helpers/paymentLedger';
import { forgetPurchaseKey, isUpiReference, paymentSplit, purchaseKeyFor } from '../helpers/planCheckout';
import {
  PACKAGES_PATH, PAYMENT_OPTION_WORDS, purchasePackage, readPackageCatalogue, readPackagePaymentInfo, readPackageQuote, requestPackageBuy,
} from '../helpers/packageStart';

// Start a Project → one package (/start-new-project/project/package/:packageId): what is included, how to pay,
// the backend's price, and the payment itself — the same steps as the website's package page
// (merasoftware /package/<id>/customize), in the portal's own screens. Every price, the split between
// wallet and UPI and the project itself are the backend's (helpers/packagePurchase.js); the wallet pays
// first, a UPI remainder is checked by the team. Nothing on this page works out money.

const card = 'flex flex-col gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-5 sm:p-6';
const primaryButton = 'inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]';
const secondaryButton = 'inline-flex w-full items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-subtle)] disabled:cursor-not-allowed';
const Eyebrow = ({ children }) => <span className="text-xs font-bold uppercase tracking-wider text-[var(--eyebrow-fg)]">{children}</span>;
const Row = ({ label, value, strong, good }) => (
  <div className={`flex items-center justify-between gap-3 text-base ${strong ? 'font-semibold text-[var(--text-primary)]' : good ? 'text-[var(--badge-success-fg)]' : 'text-[var(--text-secondary)]'}`}>
    <span>{label}</span><span className="font-mono tabular-nums">{value}</span>
  </div>
);
const List = ({ lines }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-[var(--text-secondary)]">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>;

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

const PackageScreen = ({ packageId }) => {
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [paymentOption, setPaymentOption] = useState('');
  const [quote, setQuote] = useState({ for: '', value: null, error: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState('review');
  const [reference, setReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    readPackageCatalogue(controller.signal).then((catalogue) => {
      const found = catalogue.enabled ? catalogue.packages.find((row) => row.id === packageId) : null;
      setItem(found || null);
      setPaymentOption((current) => (found?.paymentOptions.includes(current) ? current : found?.paymentOptions[0] || ''));
      if (!found) setLoadError('This package is not available right now.');
    }).catch((error) => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [packageId, loadRevision]);

  // The backend's price of the choice; a new choice or a refused (stale) price asks again.
  const choice = useMemo(() => (paymentOption ? { paymentOption } : null), [paymentOption]);
  const asked = JSON.stringify({ packageId, choice, refreshToken });
  useEffect(() => {
    if (!choice) return undefined;
    const controller = new AbortController();
    readPackageQuote(packageId, choice, controller.signal)
      .then((value) => setQuote({ for: asked, value, error: '' }))
      .catch((error) => { if (!controller.signal.aborted) setQuote({ for: asked, value: null, error: error.message }); });
    return () => controller.abort();
  }, [asked, choice, packageId]);
  const quoted = quote.for === asked ? quote : { value: null, error: '' };
  const ready = Boolean(quoted.value) && !processing;

  // One key per package and choice, kept for this tab until the purchase succeeds: a reload or a second click never charges twice.
  const keyScope = `package:${packageId}?${paymentOption}`;
  const purchaseKey = useMemo(() => purchaseKeyFor(keyScope), [keyScope]);
  const split = info && quoted.value ? paymentSplit(quoted.value.dueNow, info.walletBalance) : null;

  const buy = async (upiReference) => {
    const result = await purchasePackage({
      packageId, choice, quoteKey: quoted.value.quoteKey, dueNow: quoted.value.dueNow, creationKey: purchaseKey,
      ...(upiReference ? { upiTransactionId: upiReference } : {}),
    });
    forgetPurchaseKey(keyScope);
    setDone(result);
  };
  const run = async (task) => {
    if (!ready) return;
    setProcessing(true); setNotice('');
    try { await task(); } catch (error) {
      // 409: the price or terms changed. Nothing was bought; ask the price again so the page shows what is true now.
      if (error.status === 409) { setStep('review'); setRefreshToken((value) => value + 1); }
      setNotice(error.message || 'The payment could not be completed. Please try again.');
    } finally { setProcessing(false); }
  };
  // "Proceed to pay" tells the team the client started buying (as the website does), then pays from the wallet or asks for the UPI remainder.
  const pay = () => run(async () => {
    await requestPackageBuy(packageId, choice);
    const payment = await readPackagePaymentInfo();
    setInfo(payment);
    if (paymentSplit(quoted.value.dueNow, payment.walletBalance).upi > 0) { setReference(''); setStep('upi'); return; }
    await buy();
  });
  const sendUpi = () => run(() => buy(reference.trim()));

  if (done) {
    const Icon = done.approved ? CheckCircle2 : Clock;
    return (
      <Shell header={<CustomerPageHeader title={done.approved ? 'Your project is created' : 'Payment submitted'} />}>
        <section role="status" className={`${card} items-center text-center`}>
          <Icon className={`h-12 w-12 ${done.approved ? 'text-[var(--badge-success-fg)]' : 'text-[var(--badge-pending-fg)]'}`} strokeWidth={1.75} />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{item.name}</h2>
          <p className="text-base text-[var(--text-secondary)]">{done.approved
            ? 'Payment received. Your work will start within 4 to 24 hours. Follow its progress, send files and see invoices in your project.'
            : 'Your project is created. Once our team confirms your UPI payment, your work will start within 4 to 24 hours.'}</p>
          <Link to={`/project-details/${done.orderId}`} className={primaryButton}>Open my project →</Link>
        </section>
      </Shell>
    );
  }

  if (!item) {
    return (
      <Shell header={<CustomerPageHeader title="Package" onBack={() => navigate(PACKAGES_PATH)} />}>
        {loadError ? <GlassPageState type="error" message={loadError} onRetry={() => setLoadRevision((value) => value + 1)} /> : <GlassPageState message="Loading the package…" />}
      </Shell>
    );
  }

  const q = quoted.value;
  const upiLink = info && split && split.upi > 0
    ? `upi://pay?pa=${info.upiId}&pn=${encodeURIComponent(info.payeeName)}&am=${split.upi}&cu=INR&tn=${encodeURIComponent(`${item.name} project`)}` : '';
  const header = <CustomerPageHeader title={item.name} subtitle={item.description} onBack={() => (processing ? undefined : navigate(PACKAGES_PATH))} />;

  return (
    <Shell header={header}>
      <div className="flex flex-col gap-6">
        <section className={card} aria-labelledby="package-included">
          <Eyebrow>What's included</Eyebrow>
          <h2 id="package-included" className="sr-only">What's included</h2>
          <List lines={item.inclusions} />
          {item.portalUploads && <p className="text-sm text-[var(--text-muted)]">You can send your files in your client portal while we build.</p>}
          {item.terms.length > 0 && (
            <details className="text-[var(--text-secondary)]">
              <summary className="cursor-pointer text-base font-semibold text-[var(--text-primary)]">Terms &amp; exclusions</summary>
              <div className="mt-3"><List lines={item.terms} /></div>
            </details>
          )}
        </section>

        <section className={card} aria-labelledby="package-pay">
          {step === 'review' ? (
            <>
              <h2 id="package-pay" className="text-lg font-semibold text-[var(--text-primary)]">How do you want to pay?</h2>
              <div role="radiogroup" aria-label="Payment option" className="grid gap-2.5 sm:grid-cols-3">
                {item.paymentOptions.map((option) => (
                  <button
                    key={option} type="button" role="radio" aria-checked={paymentOption === option} disabled={processing}
                    onClick={() => setPaymentOption(option)}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${paymentOption === option
                      ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:border-[var(--glass-border-strong)]'}`}
                  >
                    <b className="text-base text-[var(--text-primary)]">{PAYMENT_OPTION_WORDS[option]?.title || option}</b>
                    <span className="text-sm text-[var(--text-muted)]">{PAYMENT_OPTION_WORDS[option]?.detail}</span>
                  </button>
                ))}
              </div>
              {quoted.error ? <p role="alert" className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{quoted.error}</p>
                : !q ? <p className="flex items-center text-sm text-[var(--text-muted)]"><Spinner className="mr-2" />Working out the price…</p>
                  : (
                    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4" aria-live="polite">
                      <Row label="Package price" value={formatCurrency(q.regularPrice)} />
                      {q.offer && q.discountAmount > 0 && <Row good label={`${q.offer.title} offer`} value={`− ${formatCurrency(q.discountAmount)}`} />}
                      {q.installments.map((part) => (
                        <Row key={part.installmentNumber} label={`Installment ${part.installmentNumber} (${part.percentage}%)${part.progressThreshold == null ? ' · at the start' : ` · at ${part.progressThreshold}% progress`}`} value={formatCurrency(part.amount)} />
                      ))}
                      <Row strong label={q.installments.length ? 'Due at the start' : 'Pay once'} value={formatCurrency(q.dueNow)} />
                      {q.installments.length > 0 && <Row label="Total" value={formatCurrency(q.finalPrice)} />}
                    </div>
                  )}
              <p className="text-sm text-[var(--text-muted)]">You pay the first payment now (wallet first, then UPI). Your project is created with it and runs in your client portal.</p>
              <button type="button" className={primaryButton} disabled={!ready} onClick={pay}>
                {processing ? <><Spinner className="mr-2" />Processing…</> : q ? 'Proceed to pay →' : <><Spinner className="mr-2" />Working out the price…</>}
              </button>
            </>
          ) : (
            <>
              <h2 id="package-pay" className="text-lg font-semibold text-[var(--text-primary)]">Pay {formatCurrency(split.upi)} by UPI</h2>
              {split.wallet > 0 && <p className="text-sm text-[var(--text-secondary)]">{formatCurrency(split.wallet)} comes from your wallet when you send this payment.</p>}
              <div className="mx-auto rounded-2xl bg-white p-4"><QRCodeSVG value={upiLink} size={192} /></div>
              <p className="text-center text-sm text-[var(--text-secondary)]">Scan with any UPI app, or pay to <span className="font-mono font-semibold text-[var(--text-primary)]">{info.upiId}</span> ({info.payeeName}).</p>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">UPI reference number</span>
                <input
                  className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-soft-fg)] focus:ring-4 focus:ring-[var(--accent-soft-bg)]"
                  type="text" inputMode="numeric" autoComplete="off" placeholder="12-digit reference number" disabled={processing}
                  value={reference} onChange={(event) => setReference(event.target.value.replace(/\D/g, ''))}
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button type="button" className={primaryButton} disabled={!ready || !isUpiReference(reference)} onClick={sendUpi}>
                  {processing ? <><Spinner className="mr-2" />Sending…</> : 'Send payment for checking'}
                </button>
                <button type="button" className={secondaryButton} disabled={processing} onClick={() => setStep('review')}>Back</button>
              </div>
            </>
          )}
          {processing && <p role="status" className="portal-wait text-center text-sm text-[var(--text-secondary)]">Confirming your payment… please don’t close this page.</p>}
          {notice && <p role="alert" className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{notice}</p>}
        </section>
      </div>
    </Shell>
  );
};

// A different package starts a fresh page: no earlier quote or payment step can leak into it.
export default function StartProjectPackage() {
  const { packageId } = useParams();
  return <PackageScreen key={packageId} packageId={packageId} />;
}
