import React, { useEffect, useMemo, useRef, useState } from 'react';
import SummaryApi from '../common';
import {
  buildTenureOptions,
  canChooseRelease,
  fileChoices,
  isFlexiblePlan,
  purchaseOptions,
  updateChoices,
} from '../helpers/serviceTenure';

// The customer plan builder (merasoftware/src/docs/plan.md §0.2 P4; layout = the approved
// prototype). The customer picks how to buy, for how long and — on a flexible plan — files per
// update and updates; the bill on the side is the backend quote, never a number worked out here.
//
// Used full size on pages/ServicePlanDetail.js and compact inside components/AddServiceModal.js.
// The parent owns payment: onChange({ ready, loading, error, quote, body }) hands it the quote
// and the exact purchase body (incl. quoteKey) to send to /api/customer/service-plan-order.
// `refreshToken` changing re-asks the price (the parent bumps it after a 409 "price changed").

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);

const PERIOD_WORDS = { monthly: 'month', quarterly: '3 months', half_yearly: '6 months', yearly: 'year' };

// Up to four quick picks inside the plan's range, on its step.
const filePresets = ({ min, max, step }) => {
  const onStep = (value) => value >= min && value <= max && (value - min) % step === 0;
  const picks = [10, 20, 50, 100].filter(onStep);
  return picks.length >= 2 ? picks : [min, max].filter((value, index, all) => all.indexOf(value) === index);
};

// Rows of the plan's own per-file rates (marginal slabs), for reading only.
const slabRows = (plan) => {
  const sp = plan?.servicePlan || {};
  const { max } = fileChoices(plan);
  const slabs = (sp.slabs || []).slice().sort((a, b) => a.fromFile - b.fromFile);
  const rows = [{ from: 1, rate: sp.ratePerFile }];
  slabs.forEach((slab) => rows.push({ from: slab.fromFile, rate: slab.ratePerFile }));
  return rows.map((row, index) => ({ ...row, to: index + 1 < rows.length ? rows[index + 1].from - 1 : max }));
};

const chipClass = (on) => `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on
  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-fg)]'
  : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'}`;

const segClass = (on) => `flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center transition ${on
  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]'
  : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'}`;

const Step = ({ number, title, children, compact }) => (
  <div className={`flex flex-col gap-3 border-t border-[var(--glass-border)] first:border-t-0 ${compact ? 'py-3' : 'p-5'}`}>
    <div className="flex items-baseline gap-3">
      {!compact && <span className="font-mono text-sm font-bold text-[var(--accent-soft-fg)]">{number}</span>}
      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-[var(--text-primary)]`}>{title}</h3>
    </div>
    {children}
  </div>
);

const Row = ({ label, value, tone }) => (
  <div className={`flex justify-between gap-3 text-sm ${tone === 'good' ? 'text-[var(--badge-success-fg)]' : 'text-[var(--text-secondary)]'}`}>
    <span>{label}</span><span className="font-mono tabular-nums">{value}</span>
  </div>
);

export const QuoteBill = ({ plan, quote, loading, error, compact }) => {
  const isUpload = plan?.servicePlan?.capability === 'upload_data';
  const flexible = isFlexiblePlan(plan);
  if (error) return <p className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{error}</p>;
  if (!quote) return <p className="text-sm text-[var(--text-muted)]">{loading ? 'Working out the price…' : 'Choose the options to see the price.'}</p>;
  const oneTime = quote.purchase === 'one_time';
  const months = Number(quote.cycleMonths) || 1;
  const perCycleUpdates = quote.allowancePerCycle;
  return (
    <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-live="polite">
      <div className="flex flex-col gap-2">
        {flexible && <Row label={`1 update · ${quote.files} files`} value={formatPrice(quote.updatePrice)} />}
        {flexible && <Row label={`× ${quote.updates} update${quote.updates === 1 ? '' : 's'}${oneTime ? '' : ' per month'}`} value={formatPrice(oneTime ? quote.totalPrice : quote.perMonthPrice)} />}
        {!oneTime && months > 1 && <Row label={`× ${months} months`} value={formatPrice(quote.subtotal)} />}
        {!oneTime && quote.discount > 0 && <Row tone="good" label={`${quote.discountPercent}% period discount`} value={`− ${formatPrice(quote.discount)}`} />}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed border-[var(--glass-border)] pt-3">
        <span className="text-sm text-[var(--text-muted)]">{oneTime ? 'Pay once' : months === 1 ? 'Pay per month' : `Pay every ${PERIOD_WORDS[quote.purchase]}`}</span>
        <span className={`${compact ? 'text-2xl' : 'text-3xl'} font-mono font-extrabold tabular-nums text-[var(--text-primary)]`}>{formatPrice(quote.firstPayment)}</span>
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-sm">
        {isUpload && perCycleUpdates ? (
          <b className="text-[var(--text-primary)]">
            You get {perCycleUpdates} update{perCycleUpdates === 1 ? '' : 's'}{quote.files ? ` · ${quote.files} files each` : ''}{oneTime ? '' : ` every ${PERIOD_WORDS[quote.purchase]}`}
          </b>
        ) : null}
        {!oneTime && (
          <span className="text-[var(--text-secondary)]">
            {quote.totalCycles > 1
              ? `${quote.tenureMonths} months in total: ${quote.totalCycles} payments of ${formatPrice(quote.cyclePrice)} (${formatPrice(quote.totalPrice)}). The first is paid now.`
              : `${quote.tenureMonths} month${quote.tenureMonths === 1 ? '' : 's'}, paid now.`}
          </span>
        )}
        {!oneTime && quote.releaseMode === 'monthly' && <span className="text-[var(--text-secondary)]">Updates open month by month.</span>}
        {/* The order uses the validity only for upload plans (backend servicePlanPurchase.js). */}
        {oneTime && isUpload && quote.validityDays ? <span className="text-[var(--text-secondary)]">Use your updates within {quote.validityDays} days.</span> : null}
      </div>
    </div>
  );
};

const PlanBuilder = ({ plan, compact = false, onChange, refreshToken = 0 }) => {
  const flexible = isFlexiblePlan(plan);
  const purchases = useMemo(() => purchaseOptions(plan), [plan]);
  const files = useMemo(() => fileChoices(plan), [plan]);
  const updates = useMemo(() => updateChoices(plan), [plan]);

  const [purchase, setPurchase] = useState(() => purchases[0]?.value || '');
  const cycleMonths = purchases.find((option) => option.value === purchase)?.months || null;
  const tenures = useMemo(() => buildTenureOptions(plan, cycleMonths), [plan, cycleMonths]);
  const [tenureMonths, setTenureMonths] = useState(() => purchases[0]?.months || null);
  const [fileCount, setFileCount] = useState(() => files.min || null);
  const [updateCount, setUpdateCount] = useState(() => updates[0] || null);
  const [releaseMode, setReleaseMode] = useState(plan?.servicePlan?.releaseMode || 'all_at_once');
  const [state, setState] = useState({ loading: false, error: '', quote: null, quoteKey: '' });
  const requestRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const releaseChoice = canChooseRelease(plan, cycleMonths);
  const choice = useMemo(() => {
    if (!purchase) return null;
    return {
      purchase,
      tenureMonths: purchase === 'one_time' ? undefined : tenureMonths,
      files: flexible ? fileCount : undefined,
      updates: flexible ? updateCount : undefined,
      releaseMode: releaseChoice ? releaseMode : undefined,
    };
  }, [purchase, tenureMonths, flexible, fileCount, updateCount, releaseChoice, releaseMode]);

  const request = JSON.stringify({ planId: plan?._id, choice, refreshToken });

  // Ask the backend for the price whenever a choice changes; only the newest answer counts.
  useEffect(() => {
    if (!choice || !plan?._id) return undefined;
    const ticket = requestRef.current + 1;
    requestRef.current = ticket;
    setState({ request, loading: true, error: '', quote: null, quoteKey: '' });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(SummaryApi.servicePlanQuote.url, {
          method: SummaryApi.servicePlanQuote.method,
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ planId: plan._id, ...choice }),
        });
        const result = await response.json().catch(() => ({}));
        if (requestRef.current !== ticket) return;
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not work out the price. Please try again.');
        setState({ request, loading: false, error: '', quote: result.data.quote, quoteKey: result.data.quoteKey });
      } catch (error) {
        if (requestRef.current !== ticket) return;
        setState({ request, loading: false, error: error.message, quote: null, quoteKey: '' });
      }
    }, 250);
    return () => { clearTimeout(timer); requestRef.current += 1; };
  }, [choice, plan?._id, refreshToken, request]);

  useEffect(() => {
    const current = state.request === request;
    const ready = Boolean(current && state.quote && state.quoteKey && !state.loading && !state.error);
    onChangeRef.current?.({
      ready,
      loading: !current || state.loading,
      error: current ? state.error : '',
      quote: current ? state.quote : null,
      body: ready ? { ...choice, quoteKey: state.quoteKey } : null,
    });
  }, [state, choice, request]);

  const choosePurchase = (value) => {
    setPurchase(value);
    setTenureMonths(purchases.find((option) => option.value === value)?.months || null);
  };

  if (!purchases.length) {
    return <p className="text-sm text-[var(--text-muted)]">This plan cannot be bought right now. Please contact support.</p>;
  }

  const oneTime = purchase === 'one_time';
  const activeSlab = (row) => fileCount >= row.from;
  const steps = [];
  if (flexible) {
    steps.push(
      <Step key="files" number={steps.length + 1} title="Files per update" compact={compact}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`${compact ? 'text-2xl' : 'text-4xl'} font-mono font-extrabold leading-none text-[var(--text-primary)]`}>{fileCount}</span>
          <span className="text-sm text-[var(--text-muted)]">files in each update</span>
        </div>
        <input
          type="range"
          aria-label="Files per update"
          className="h-7 w-full accent-[rgb(var(--accent-solid))]"
          min={files.min}
          max={files.max}
          step={files.step}
          value={fileCount || files.min}
          onChange={(event) => setFileCount(Number(event.target.value))}
        />
        <div className="flex justify-between font-mono text-xs text-[var(--text-muted)]"><span>{files.min}</span><span>{files.max}</span></div>
        <div className="flex flex-wrap gap-2">
          {filePresets(files).map((value) => (
            <button key={value} type="button" aria-pressed={fileCount === value} className={chipClass(fileCount === value)} onClick={() => setFileCount(value)}>{value} files</button>
          ))}
        </div>
        {!compact && (
          <table className="w-full border-collapse text-sm" aria-label="Price per file">
            <tbody>
              {slabRows(plan).map((row) => (
                <tr key={row.from} className={activeSlab(row) ? 'bg-[var(--accent-soft-bg)]' : ''}>
                  <td className="border-t border-[var(--glass-border)] px-3 py-1.5 text-[var(--text-secondary)]">Files {row.from}–{row.to}</td>
                  <td className="border-t border-[var(--glass-border)] px-3 py-1.5 text-right font-mono text-[var(--text-primary)]">{formatPrice(row.rate)} / file</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Step>,
      <Step key="updates" number={steps.length + 2} title={oneTime ? 'Number of updates' : 'Updates per month'} compact={compact}>
        <div className="grid grid-cols-4 gap-2">
          {updates.map((value) => (
            <button key={value} type="button" aria-pressed={updateCount === value} className={segClass(updateCount === value)} onClick={() => setUpdateCount(value)}>
              <b className="text-base">{value}</b><span className="text-xs text-[var(--text-muted)]">update{value === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)]">Each update gets its own {fileCount} files.</p>
      </Step>,
    );
  }
  if (purchases.length > 1 || !oneTime) {
    steps.push(
      <Step key="purchase" number={steps.length + 1} title="How do you want to pay?" compact={compact}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {purchases.map((option) => (
            <button key={option.value} type="button" aria-pressed={purchase === option.value} className={segClass(purchase === option.value)} onClick={() => choosePurchase(option.value)}>
              <b className="text-sm">{option.label}</b>
              <span className={`text-xs ${option.discountPercent ? 'font-bold text-[var(--badge-success-fg)]' : 'text-[var(--text-muted)]'}`}>
                {option.value === 'one_time' ? 'no repeat' : option.discountPercent ? `save ${option.discountPercent}%` : `billed every ${PERIOD_WORDS[option.value]}`}
              </span>
            </button>
          ))}
        </div>
      </Step>,
    );
  }
  if (!oneTime) {
    steps.push(
      <Step key="length" number={steps.length + 1} title="For how long?" compact={compact}>
        <div className="flex flex-wrap gap-2">
          {tenures.map((option) => (
            <button key={option.months} type="button" aria-pressed={tenureMonths === option.months} className={chipClass(tenureMonths === option.months)} onClick={() => setTenureMonths(option.months)}>{option.label}</button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)]">The plan ends after this time. You pay one period at a time; the first now.</p>
      </Step>,
    );
    if (releaseChoice) {
      steps.push(
        <Step key="release" number={steps.length + 1} title="When should your updates open?" compact={compact}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={releaseMode === 'all_at_once'} className={segClass(releaseMode === 'all_at_once')} onClick={() => setReleaseMode('all_at_once')}>
              <b className="text-sm">All at once</b><span className="text-xs text-[var(--text-muted)]">use them any time in the period</span>
            </button>
            <button type="button" aria-pressed={releaseMode === 'monthly'} className={segClass(releaseMode === 'monthly')} onClick={() => setReleaseMode('monthly')}>
              <b className="text-sm">Month by month</b><span className="text-xs text-[var(--text-muted)]">unused ones carry forward</span>
            </button>
          </div>
        </Step>,
      );
    }
  }

  const bill = <QuoteBill plan={plan} quote={state.request === request ? state.quote : null} loading={state.request !== request || state.loading} error={state.request === request ? state.error : ''} compact={compact} />;

  if (compact) {
    return (
      <div className="flex flex-col">
        {steps}
        <div className="border-t border-[var(--glass-border)] pt-3">{bill}</div>
      </div>
    );
  }
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex flex-col rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
        {steps.length ? steps : <Step number={1} title="One-time purchase"><p className="text-sm text-[var(--text-secondary)]">Nothing to choose: this plan is bought once.</p></Step>}
      </div>
      <aside className="flex flex-col gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-5 lg:sticky lg:top-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--eyebrow-fg)]">Your plan</span>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{plan.serviceName}</h3>
        </div>
        {bill}
      </aside>
    </div>
  );
};

export default PlanBuilder;
