import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, Clock3 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import Spinner from '../components/Spinner';
import { Row, Step } from '../components/PlanBuilder';
import useServerNow from '../hooks/useServerNow';
import { formatCurrency } from '../helpers/paymentLedger';
import { forgetPurchaseKey, isUpiReference, paymentSplit, purchaseKeyFor } from '../helpers/planCheckout';
import {
  PACKAGES_PATH, PAYMENT_OPTION_WORDS, offerEnded, purchasePackage, readPackageCatalogue, readPackagePaymentInfo, readPackageQuote,
  readPhoneCountries, requestPackageBuy, timeLeft,
} from '../helpers/packageStart';

// Start a Project → one package (/start-new-project/project/package/:packageId), laid out like the plan page
// (pages/ServicePlanDetail.js + components/PlanBuilder.js): the package's details on the left (what is included,
// terms), a sticky "Your package" card on the right with how to pay, the backend's price, what the wallet and UPI
// will pay, and the payment itself. On a phone the details come first and the payment card follows. The steps are
// the website's package page (merasoftware /package/<id>/customize); every price, the wallet/UPI split and the
// project are the backend's (helpers/packagePurchase.js) — nothing on this page works out money.

const panel = 'flex flex-col rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)]';
const asidePanel = `${panel} gap-4 p-5 lg:sticky lg:top-20`;
const primaryButton = 'inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]';
const secondaryButton = 'inline-flex w-full items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-subtle)] disabled:cursor-not-allowed';
const field = 'w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-soft-border)]';
const Eyebrow = ({ children }) => <span className="text-xs font-bold uppercase tracking-wider text-[var(--eyebrow-fg)]">{children}</span>;
const List = ({ lines }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-[var(--text-secondary)]">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>;
const Notice = ({ children }) => <p role="alert" className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{children}</p>;

const Shell = ({ header, wide = false, children }) => {
  const user = useSelector((state) => state?.user?.user);
  return (
    <DashboardLayout user={user}>
      {/* overflow-clip, not hidden: a hidden ancestor would stop the sticky card (components/PlanBuilder.js). */}
      <div className="relative min-h-[calc(100vh-4rem)] overflow-clip px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className={`relative mx-auto w-full ${wide ? 'max-w-7xl' : 'max-w-2xl'}`}>
          {header}
          <div className={header ? 'mt-10' : ''}>{children}</div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// Only for an account with no mobile number yet (the backend asks with HTTP 428): the country list is the backend's own.
const PhoneFields = ({ value, onChange, disabled }) => {
  const [countries, setCountries] = useState([{ code: '+91', label: 'India', digits: 10 }]);
  useEffect(() => {
    const controller = new AbortController();
    readPhoneCountries(controller.signal).then(setCountries).catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-[var(--text-primary)]">Your mobile number</span>
      <div className="flex gap-2">
        <select aria-label="Country code" disabled={disabled} value={value.countryCode} onChange={(event) => onChange({ ...value, countryCode: event.target.value })} className={`${field} w-auto cursor-pointer px-3`}>
          {countries.map((row) => <option key={row.code} value={row.code}>{row.label} ({row.code})</option>)}
        </select>
        <input aria-label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" disabled={disabled} value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} className={`${field} min-w-0`} />
      </div>
      <span className="text-sm text-[var(--text-muted)]">We need it to set up your project.</span>
    </div>
  );
};

const PackageScreen = ({ packageId }) => {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [picked, setPicked] = useState('');
  const [quote, setQuote] = useState({ for: '', value: null, error: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState('review');
  const [reference, setReference] = useState('');
  const [needsPhone, setNeedsPhone] = useState(false);
  const [contact, setContact] = useState({ countryCode: '+91', phone: '' });
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(null);
  const now = useServerNow(catalogue?.serverNow);

  const item = useMemo(() => (catalogue?.enabled ? catalogue.packages.find((row) => row.id === packageId) || null : null), [catalogue, packageId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    readPackageCatalogue(controller.signal)
      .then(setCatalogue)
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [revision]);
  // The client's pick, else the package's first option: known from the first frame, so nothing flashes.
  const paymentOption = item ? (item.paymentOptions.includes(picked) ? picked : item.paymentOptions[0] || '') : '';
  // The wallet balance and the UPI payee, shown before the client pays.
  useEffect(() => {
    if (!item) return undefined;
    const controller = new AbortController();
    readPackagePaymentInfo(controller.signal).then(setInfo).catch(() => {});
    return () => controller.abort();
  }, [item?.id, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend's price of the choice; a new choice or a refused (stale) price asks again.
  const choice = useMemo(() => (paymentOption ? { paymentOption } : null), [paymentOption]);
  const asked = JSON.stringify({ packageId, choice, refreshToken });
  useEffect(() => {
    if (!choice || !item) return undefined;
    const controller = new AbortController();
    readPackageQuote(packageId, choice, controller.signal)
      .then((value) => setQuote({ for: asked, value, error: '' }))
      .catch((error) => { if (!controller.signal.aborted) setQuote({ for: asked, value: null, error: error.message }); });
    return () => controller.abort();
  }, [asked, choice, packageId, item]);
  const quoted = quote.for === asked ? quote : { value: null, error: '' };
  const q = quoted.value;
  const ready = Boolean(q) && !processing;

  // The offer on this page ended: ask for the package and its price again, so the page shows what is true now.
  const ended = offerEnded(q?.offer, now);
  useEffect(() => { if (ended) { setStep('review'); setRevision((value) => value + 1); setRefreshToken((value) => value + 1); } }, [ended]);

  // One key per package and choice, kept for this tab until the purchase succeeds: a reload or a second click never charges twice.
  const keyScope = `package:${packageId}?${paymentOption}`;
  const purchaseKey = useMemo(() => purchaseKeyFor(keyScope), [keyScope]);
  const split = info && q ? paymentSplit(q.dueNow, info.walletBalance) : null;
  const contactBody = needsPhone ? { countryCode: contact.countryCode, phone: contact.phone.trim() } : undefined;

  const buy = async (upiReference) => {
    const result = await purchasePackage({
      packageId, choice, quoteKey: q.quoteKey, dueNow: q.dueNow, creationKey: purchaseKey, ...contactBody,
      ...(upiReference ? { upiTransactionId: upiReference } : {}),
    });
    forgetPurchaseKey(keyScope);
    setDone(result);
  };
  const run = async (task) => {
    if (!ready) return;
    setProcessing(true); setNotice('');
    try { await task(); } catch (error) {
      // 428: the account has no mobile number yet; ask for it here and send it with the purchase.
      if (error.status === 428) setNeedsPhone(true);
      // 409: the price or terms changed. Nothing was bought; ask the price again so the page shows what is true now.
      if (error.status === 409) { setStep('review'); setRefreshToken((value) => value + 1); setRevision((value) => value + 1); }
      setNotice(error.message || 'The payment could not be completed. Please try again.');
    } finally { setProcessing(false); }
  };
  // "Pay" tells the team the client started buying (as the website does), then pays from the wallet or asks for the UPI remainder.
  const pay = () => run(async () => {
    await requestPackageBuy(packageId, choice, contactBody);
    const payment = await readPackagePaymentInfo();
    setInfo(payment);
    if (paymentSplit(q.dueNow, payment.walletBalance).upi > 0) { setReference(''); setStep('upi'); return; }
    await buy();
  });
  const sendUpi = () => run(() => buy(reference.trim()));

  if (done) {
    const Icon = done.approved ? CheckCircle2 : Clock;
    return (
      <Shell header={<CustomerPageHeader title={done.approved ? 'Your project is created' : 'Payment submitted'} />}>
        <section role="status" className={`${panel} items-center gap-4 p-6 text-center`}>
          <Icon className={`h-12 w-12 ${done.approved ? 'text-[var(--badge-success-fg)]' : 'text-[var(--badge-pending-fg)]'}`} strokeWidth={1.75} />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{item?.name}</h2>
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
        {loadError ? <GlassPageState type="error" message={loadError} onRetry={() => setRevision((value) => value + 1)} />
          : !catalogue ? <GlassPageState message="Loading the package…" />
            : <GlassPageState type="error" message="This package is not available right now." onRetry={() => navigate(PACKAGES_PATH)} />}
      </Shell>
    );
  }

  const offer = q?.offer && !ended ? q.offer : null;
  const optionTitle = PAYMENT_OPTION_WORDS[paymentOption]?.title || '';
  const upiLink = info && split && split.upi > 0
    ? `upi://pay?pa=${info.upiId}&pn=${encodeURIComponent(info.payeeName)}&am=${split.upi}&cu=INR&tn=${encodeURIComponent(`${item.name} project`)}` : '';
  const phoneMissing = needsPhone && !contact.phone.trim();
  const header = <CustomerPageHeader title={item.name} subtitle={item.description} onBack={() => (processing ? undefined : navigate(PACKAGES_PATH))} />;

  return (
    <Shell header={header} wide>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* The package itself: what is included and the terms. */}
        <div className={`${panel} min-w-0`}>
          <Step title="What's included">
            <List lines={item.inclusions} />
            <p className="text-sm text-[var(--text-muted)]">{item.portalUploads ? 'Send your files in your client portal while we build.' : 'Follow the progress in your client portal.'}</p>
          </Step>
          {item.terms.length > 0 && <Step title="Terms & exclusions"><List lines={item.terms} /></Step>}
        </div>

        <aside className={asidePanel} aria-label="Your package">
          {step === 'review' || !split ? (
            <>
              <div>
                <Eyebrow>Your package</Eyebrow>
                <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{item.name}{optionTitle ? `, ${optionTitle.toLowerCase()}` : ''}</h3>
              </div>
              {offer && (
                <span role="timer" aria-label="Time left on this offer" className="badge badge-pending inline-flex w-fit items-center gap-1.5 px-3 py-1 text-sm font-semibold tabular-nums">
                  <Clock3 size={14} aria-hidden="true" />{now === null ? '—' : `${offer.title} ends in ${timeLeft(offer.endsAt, now)}`}
                </span>
              )}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">How do you want to pay?</span>
                <div role="radiogroup" aria-label="Payment option" className="flex flex-col gap-2">
                  {item.paymentOptions.map((option) => (
                    <button
                      key={option} type="button" role="radio" aria-checked={paymentOption === option} disabled={processing}
                      onClick={() => setPicked(option)}
                      className={`flex items-baseline justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)] ${paymentOption === option
                        ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:border-[var(--glass-border-strong)]'}`}
                    >
                      <b className="text-base text-[var(--text-primary)]">{PAYMENT_OPTION_WORDS[option]?.title || option}</b>
                      <span className="text-sm text-[var(--text-muted)]">{PAYMENT_OPTION_WORDS[option]?.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              {quoted.error ? <Notice>{quoted.error}</Notice>
                : !q ? <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Spinner />Working out the price…</p>
                  : (
                    <div className="flex flex-col gap-3" aria-live="polite">
                      <div className="flex flex-col gap-2">
                        <Row label="Package price" value={formatCurrency(q.regularPrice)} />
                        {offer && q.discountAmount > 0 && <Row tone="good" label={offer.title} value={`− ${formatCurrency(q.discountAmount)}`} />}
                        {q.installments.map((part) => (
                          <Row key={part.installmentNumber} label={`Installment ${part.installmentNumber} (${part.percentage}%)${part.progressThreshold == null ? ' · at the start' : ` · at ${part.progressThreshold}% progress`}`} value={formatCurrency(part.amount)} />
                        ))}
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed border-[var(--glass-border)] pt-3">
                        <span className="text-sm text-[var(--text-muted)]">{q.installments.length ? 'Due at the start' : 'Pay once'}</span>
                        <span className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(q.dueNow)}</span>
                      </div>
                      {q.installments.length > 0 && <Row label="Total" value={formatCurrency(q.finalPrice)} />}
                      {split && (
                        <div className="flex flex-col gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3">
                          <Row label="Paid from wallet" value={formatCurrency(split.wallet)} />
                          {split.upi > 0 && <Row label="To pay by UPI" value={formatCurrency(split.upi)} />}
                          <p className="text-sm text-[var(--text-muted)]">
                            Wallet balance: {formatCurrency(info.walletBalance)}.{' '}
                            {split.upi > 0 ? 'The UPI part is checked by our team; your project starts when it is approved.' : 'Your wallet covers it, so your project is created at once.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

              {needsPhone && <PhoneFields value={contact} onChange={setContact} disabled={processing} />}
              <button type="button" className={primaryButton} disabled={!ready || phoneMissing} onClick={pay}>
                {processing ? <><Spinner className="mr-2" />Processing…</>
                  : !q ? <><Spinner className="mr-2" />Working out the price…</>
                    : split && split.upi === 0 ? `Pay ${formatCurrency(split.total)} from wallet` : split ? 'Continue to UPI' : 'Proceed to pay →'}
              </button>
              <p className="text-sm text-[var(--text-muted)]">You pay the first payment now (wallet first, then UPI). Your project is created with it and runs in your client portal.</p>
            </>
          ) : (
            <>
              <div>
                <Eyebrow>Your package</Eyebrow>
                <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Pay {formatCurrency(split.upi)} by UPI</h3>
              </div>
              {split.wallet > 0 && <p className="text-sm text-[var(--text-secondary)]">{formatCurrency(split.wallet)} comes from your wallet when you send this payment.</p>}
              <div className="mx-auto rounded-2xl bg-white p-3"><QRCodeSVG value={upiLink} size={176} className="h-auto max-w-full" /></div>
              <p className="text-center text-sm text-[var(--text-secondary)]">Scan with any UPI app, or pay to <span className="font-mono font-semibold text-[var(--text-primary)]">{info.upiId}</span> ({info.payeeName}), then enter the UPI reference (UTR) of your payment.</p>
              <a href={upiLink} className="self-center text-sm font-semibold text-[var(--accent-soft-fg)] underline underline-offset-4">Open my UPI app</a>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">UPI reference (12 digits or more)</span>
                <input
                  className={field} type="text" inputMode="numeric" autoComplete="off" placeholder="Reference number" disabled={processing}
                  value={reference} onChange={(event) => setReference(event.target.value.replace(/\D/g, ''))}
                />
              </label>
              <button type="button" className={primaryButton} disabled={!ready || !isUpiReference(reference)} onClick={sendUpi}>
                {processing ? <><Spinner className="mr-2" />Sending…</> : `I have paid ${formatCurrency(split.upi)}`}
              </button>
              <button type="button" className={secondaryButton} disabled={processing} onClick={() => setStep('review')}>Back</button>
              <p className="text-sm text-[var(--text-muted)]">Your project is created with this payment. A UPI payment is checked by our team before work starts.</p>
            </>
          )}
          {processing && <p role="status" className="portal-wait text-center text-sm text-[var(--text-secondary)]">Confirming your payment… please don’t close this page.</p>}
          {notice && <Notice>{notice}</Notice>}
        </aside>
      </div>
    </Shell>
  );
};

// A different package starts a fresh page: no earlier quote or payment step can leak into it.
export default function StartProjectPackage() {
  const { packageId } = useParams();
  return <PackageScreen key={packageId} packageId={packageId} />;
}
