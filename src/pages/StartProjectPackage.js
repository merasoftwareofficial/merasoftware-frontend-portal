import { invalidatePortalResources } from '../hooks/usePortalUpdates';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, Clock3 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import { Row, Step } from '../components/PlanBuilder';
import useServerNow from '../hooks/useServerNow';
import { formatCurrency } from '../helpers/paymentLedger';
import { forgetPurchaseKey, isUpiReference, paymentSplit, purchaseKeyFor } from '../helpers/planCheckout';
import {
  ALREADY_BOUGHT, CYCLE_WORDS, PACKAGES_PATH, PAYMENT_OPTION_WORDS, monthlyCycles, monthlyGets, monthlyLengths, offerEnded, orderPath, purchasePackage,
  readPackageCatalogue, readPackagePaymentInfo, readPackageQuote, readPhoneCountries, requestPackageBuy, timeLeft,
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
  const [advanceAmount, setAdvanceAmount] = useState(0);
  // A monthly package (backend helpers/packagePlanOrder.js): the client picks how often to pay and for how long.
  const [pickedCycle, setPickedCycle] = useState('');
  const [pickedMonths, setPickedMonths] = useState(0);
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
  const [termsOpen, setTermsOpen] = useState(false);
  // This package's project still runs (backend helpers/packagePurchase.js): ask before a second purchase.
  const [bought, setBought] = useState(null);
  const [repeat, setRepeat] = useState(false);
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
  const monthly = item?.billing === 'monthly';
  const paymentOption = item && !monthly ? ((item.paymentOptions || []).includes(picked) ? picked : (item.paymentOptions || [])[0] || '') : '';
  const cycles = monthly ? monthlyCycles(item) : [];
  const billingCycle = monthly ? (cycles.some((row) => row.billingCycle === pickedCycle) ? pickedCycle : cycles[0]?.billingCycle || '') : '';
  const lengths = monthly ? monthlyLengths(item, billingCycle) : [];
  const tenureMonths = monthly ? (lengths.includes(pickedMonths) ? pickedMonths : lengths[lengths.length - 1] || 0) : 0;
  // The wallet balance and the UPI payee, shown before the client pays.
  useEffect(() => {
    if (!item) return undefined;
    const controller = new AbortController();
    readPackagePaymentInfo(controller.signal).then(setInfo).catch(() => {});
    return () => controller.abort();
  }, [item?.id, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  // The backend's price of the choice; a new choice or a refused (stale) price asks again.
  const choice = useMemo(() => (monthly ? (billingCycle && tenureMonths ? { billingCycle, tenureMonths } : null) : paymentOption ? { paymentOption, ...(advanceAmount > 0 ? { advanceAmount } : {}) } : null),
    [monthly, billingCycle, tenureMonths, paymentOption, advanceAmount]);
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
  // A second purchase the client confirmed is its own purchase, with its own key.
  const keyScope = `package:${packageId}?${monthly ? `${billingCycle}:${tenureMonths}` : `${paymentOption}:${advanceAmount || 'default'}`}${repeat ? '&repeat' : ''}`;
  const purchaseKey = useMemo(() => purchaseKeyFor(keyScope), [keyScope]);
  const split = info && q ? paymentSplit(q.dueNow, info.walletBalance) : null;
  const contactBody = needsPhone ? { countryCode: contact.countryCode, phone: contact.phone.trim() } : undefined;

  const buy = async (upiReference) => {
    const result = await purchasePackage({
      packageId, choice, quoteKey: q.quoteKey, dueNow: q.dueNow, creationKey: purchaseKey, ...contactBody,
      ...(upiReference ? { upiTransactionId: upiReference } : {}), ...(repeat ? { confirmRepeat: true } : {}),
    });
    invalidatePortalResources(['orders', 'payments', 'invoices', 'users', 'wallet']);
    forgetPurchaseKey(keyScope);
    setDone(result);
  };
  const run = async (task) => {
    if (!ready) return;
    setProcessing(true); setNotice('');
    try { await task(); } catch (error) {
      // Bought already and still running: ask the client (nothing was bought), not "the price changed".
      if (error.code === ALREADY_BOUGHT && error.details?.project) { setStep('review'); setBought(error.details.project); return; }
      // 428: the account has no mobile number yet; ask for it here and send it with the purchase.
      if (error.status === 428) setNeedsPhone(true);
      // 409: the price or terms changed. Nothing was bought; ask the price again so the page shows what is true now.
      if (error.status === 409) { setStep('review'); setRefreshToken((value) => value + 1); setRevision((value) => value + 1); }
      setNotice(error.message || 'The payment could not be completed. Please try again.');
    } finally { setProcessing(false); }
  };
  // "Pay" tells the team the client started buying (as the website does), then pays from the wallet or asks for the UPI remainder.
  const pay = () => run(async () => {
    await requestPackageBuy(packageId, choice, contactBody, repeat);
    const payment = await readPackagePaymentInfo();
    setInfo(payment);
    if (paymentSplit(q.dueNow, payment.walletBalance).upi > 0) { setReference(''); setStep('upi'); return; }
    await buy();
  });
  const sendUpi = () => run(() => buy(reference.trim()));
  // "Yes, buy another one": the purchase goes on once the page holds the answer (its own key, confirmRepeat).
  const repeatPending = React.useRef(false);
  const buyAnother = () => { setBought(null); repeatPending.current = true; setRepeat(true); };
  useEffect(() => { if (repeat && repeatPending.current) { repeatPending.current = false; pay(); } });

  if (done) {
    const Icon = done.approved ? CheckCircle2 : Clock;
    // A monthly package is a plan: its own plan page (invoices every period, updates, stop).
    if (done.plan) {
      return (
        <Shell header={<CustomerPageHeader title={done.approved ? 'Your plan is active' : 'Payment submitted'} />}>
          <section role="status" className={`${panel} items-center gap-4 p-6 text-center`}>
            <Icon className={`h-12 w-12 ${done.approved ? 'text-[var(--badge-success-fg)]' : 'text-[var(--badge-pending-fg)]'}`} strokeWidth={1.75} />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{item?.name}</h2>
            <p className="text-base text-[var(--text-secondary)]">{done.approved
              ? 'Payment received. Your plan is active: every billing period adds its bill to your plan, and you can stop it any time.'
              : 'Your plan is created. It starts once our team confirms your UPI payment.'}</p>
            <Link to={orderPath(done.orderId, true)} className={primaryButton}>Open my plan →</Link>
          </section>
        </Shell>
      );
    }
    return (
      <Shell header={<CustomerPageHeader title={done.approved ? 'Your project is created' : 'Payment submitted'} />}>
        <section role="status" className={`${panel} items-center gap-4 p-6 text-center`}>
          <Icon className={`h-12 w-12 ${done.approved ? 'text-[var(--badge-success-fg)]' : 'text-[var(--badge-pending-fg)]'}`} strokeWidth={1.75} />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{item?.name}</h2>
          <p className="text-base text-[var(--text-secondary)]">{done.approved
            ? 'Payment received. Your work will start within 4 to 24 hours. Follow its progress, send files and see invoices in your project.'
            : 'Your project is created. Once our team confirms your UPI payment, your work will start within 4 to 24 hours.'}</p>
          <Link to={orderPath(done.orderId)} className={primaryButton}>Open my project →</Link>
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
  const optionTitle = monthly ? (billingCycle ? `${CYCLE_WORDS[billingCycle].toLowerCase()}, ${tenureMonths} month${tenureMonths === 1 ? '' : 's'}` : '') : PAYMENT_OPTION_WORDS[paymentOption]?.title || '';
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
            <p className="text-sm text-[var(--text-muted)]">{monthly ? `${monthlyGets(item)}. Runs as a plan in your client portal; stop any time, with no bill after the period you paid for.` : item.portalUploads ? 'Send your files in your client portal while we build.' : 'Follow the progress in your client portal.'}</p>
            {item.terms.length > 0 && (
              <button type="button" onClick={() => setTermsOpen(true)} className="w-fit cursor-pointer text-sm font-semibold text-[var(--accent-soft-fg)] underline underline-offset-4 transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)]">Terms &amp; exclusions</button>
            )}
          </Step>
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
{monthly ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">How often do you want to pay?</span>
                <div role="radiogroup" aria-label="Billing period" className="flex flex-col gap-2">
                  {cycles.map((option) => (
                    <button
                      key={option.billingCycle} type="button" role="radio" aria-checked={billingCycle === option.billingCycle} disabled={processing}
                      onClick={() => setPickedCycle(option.billingCycle)}
                      className={`flex items-baseline justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)] ${billingCycle === option.billingCycle
                        ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]' : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] hover:border-[var(--glass-border-strong)]'}`}
                    >
                      <b className="text-base text-[var(--text-primary)]">{CYCLE_WORDS[option.billingCycle]}</b>
                      <span className="text-sm text-[var(--text-muted)]">{option.discountPercent ? `save ${option.discountPercent}%` : ''}</span>
                    </button>
                  ))}
                </div>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">For how long?</span>
                  <select aria-label="Length" disabled={processing} value={tenureMonths} onChange={(event) => setPickedMonths(Number(event.target.value))} className={`${field} cursor-pointer`}>
                    {lengths.map((months) => <option key={months} value={months}>{months} month{months === 1 ? '' : 's'}</option>)}
                  </select>
                  <span className="text-sm text-[var(--text-muted)]">The price stays the same for this whole time. To continue after it, you buy it again at the price of that day.</span>
                </label>
              </div>
) : (
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
                      <b className="text-base text-[var(--text-primary)]">{q?.advance && option === 'full' ? 'Advance + final balance' : PAYMENT_OPTION_WORDS[option]?.title || option}</b>
                      <span className="text-sm text-[var(--text-muted)]">{q?.advance && option === 'full' ? 'balance at 90% progress' : PAYMENT_OPTION_WORDS[option]?.detail}</span>
                    </button>
                  ))}
                </div>
                {q?.advance && <label className="mt-2 flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Advance to pay now</span>
                  <input aria-label="Advance to pay now" type="number" min={q.advance.minimum} max={q.finalPrice} step="0.01" disabled={processing}
                    value={advanceAmount || q.advance.selected} onChange={(event) => setAdvanceAmount(Number(event.target.value))} className={field} />
                  <span className="text-sm text-[var(--text-muted)]">Minimum {formatCurrency(q.advance.minimum)}. You may pay up to {formatCurrency(q.finalPrice)}.</span>
                </label>}
              </div>
)}

              {quoted.error ? <Notice>{quoted.error}</Notice>
                : !q ? <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Spinner />Working out the price…</p>
                  : (
                    <div className="flex flex-col gap-3" aria-live="polite">
                      {q.monthly ? (
                        <>
                          <div className="flex flex-col gap-2">
                            <Row label="Monthly price" value={formatCurrency(q.monthly.perMonthPrice)} />
                            {q.monthly.cycleMonths > 1 && <Row label={`× ${q.monthly.cycleMonths} months`} value={formatCurrency(q.monthly.perMonthPrice * q.monthly.cycleMonths)} />}
                            {q.monthly.discountPercent > 0 && <Row tone="good" label={`${q.monthly.discountPercent}% period discount`} value={`− ${formatCurrency(q.monthly.perMonthPrice * q.monthly.cycleMonths - q.monthly.cyclePrice)}`} />}
                            {offer && q.discountAmount > 0 && <Row tone="good" label={offer.title} value={`− ${formatCurrency(q.discountAmount)} in total`} />}
                          </div>
                          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed border-[var(--glass-border)] pt-3">
                            <span className="text-sm text-[var(--text-muted)]">{q.monthly.cycleMonths === 1 ? 'Per month' : CYCLE_WORDS[q.monthly.billingCycle]}</span>
                            <span className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(q.monthly.cyclePrice)}</span>
                          </div>
                          <Row label={`${q.monthly.totalCycles} payment${q.monthly.totalCycles === 1 ? '' : 's'} in total`} value={formatCurrency(q.finalPrice)} />
                        </>
                      ) : (
                      <>
                      <div className="flex flex-col gap-2">
                        <Row label="Package price" value={formatCurrency(q.regularPrice)} />
                        {offer && q.discountAmount > 0 && <Row tone="good" label={offer.title} value={`− ${formatCurrency(q.discountAmount)}`} />}
                        {q.installments.map((part) => (
                          <Row key={part.installmentNumber} label={`${q.advance && part.installmentNumber === 1 ? 'Advance' : `Installment ${part.installmentNumber}`} (${part.percentage}%)${part.progressThreshold == null ? ' · at the start' : ` · at ${part.progressThreshold}% progress`}`} value={formatCurrency(part.amount)} />
                        ))}
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed border-[var(--glass-border)] pt-3">
                        <span className="text-sm text-[var(--text-muted)]">{q.installments.length ? 'Due at the start' : 'Pay once'}</span>
                        <span className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(q.dueNow)}</span>
                      </div>
                      {q.installments.length > 0 && <Row label="Total" value={formatCurrency(q.finalPrice)} />}
                      </>
                      )}
                      {split && (
                        <div className="flex flex-col gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3">
                          <Row label="Paid from wallet" value={formatCurrency(split.wallet)} />
                          {split.upi > 0 && <Row label="To pay by UPI" value={formatCurrency(split.upi)} />}
                          <p className="text-sm text-[var(--text-muted)]">
                            Wallet balance: {formatCurrency(info.walletBalance)}.{' '}
                            {split.upi > 0 ? `The UPI part is checked by our team; your ${monthly ? 'plan' : 'project'} starts when it is approved.` : `Your wallet covers it, so your ${monthly ? 'plan starts' : 'project is created'} at once.`}
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
              <p className="text-sm text-[var(--text-muted)]">{monthly ? 'You pay the first period now (wallet first, then UPI). Your plan starts with it; each next period adds its bill to your plan.' : 'You pay the first payment now (wallet first, then UPI). Your project is created with it and runs in your client portal.'}</p>
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
      <Modal open={termsOpen} onClose={() => setTermsOpen(false)} eyebrow={item.name} title="Terms & exclusions" size="lg">
        <List lines={item.terms} />
      </Modal>
      <Modal open={Boolean(bought)} onClose={() => setBought(null)} eyebrow={item.name} title="You already bought this package">
        {bought && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-[var(--text-secondary)]">
              You bought <b className="text-[var(--text-primary)]">{bought.name}</b>
              {bought.boughtAt ? ` on ${new Date(bought.boughtAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}` : ''}.{' '}
              {bought.approved ? `Your ${bought.plan ? 'plan' : 'project'} is running.` : 'Your payment is being checked by our team.'} Paying again creates a <b className="text-[var(--text-primary)]">second {bought.plan ? 'plan' : 'project'}</b> and charges you again.
            </p>
            <Link to={orderPath(bought.orderId, bought.plan)} className={primaryButton}>{bought.plan ? 'Open my plan' : 'Open my project'}</Link>
            <button type="button" className={secondaryButton} onClick={buyAnother}>Yes, buy another one</button>
          </div>
        )}
      </Modal>
    </Shell>
  );
};

// A different package starts a fresh page: no earlier quote or payment step can leak into it.
export default function StartProjectPackage() {
  const { packageId } = useParams();
  return <PackageScreen key={packageId} packageId={packageId} />;
}
