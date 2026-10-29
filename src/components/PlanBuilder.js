import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import usePlanQuote from '../hooks/usePlanQuote';
import Spinner from './Spinner';
import {
  buildTenureOptions,
  canChooseRelease,
  fileChoices,
  isFlexiblePlan,
  planChoiceBody,
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
// `action` (full size only) is the parent's pay control, shown at the bottom of the sticky bill.
// `intro` (full size only) is the parent's plan description, shown above the steps.
// `initial` (optional) is a starting choice already checked against this plan
// (helpers/serviceTenure.js initialPlanChoice); without it the builder starts on its defaults.

const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);

const PERIOD_WORDS = { monthly: 'month', quarterly: '3 months', half_yearly: '6 months', yearly: 'year' };
const BUY_WORDS = { one_time: 'one-time', monthly: 'monthly', quarterly: 'every 3 months', half_yearly: 'every 6 months', yearly: 'yearly' };

// Up to four quick picks inside the plan's range, on its step (compact builder).
const filePresets = ({ min, max, step }) => {
  const onStep = (value) => value >= min && value <= max && (value - min) % step === 0;
  const picks = [10, 20, 50, 100].filter(onStep);
  return picks.length >= 2 ? picks : [min, max].filter((value, index, all) => all.indexOf(value) === index);
};

// Full-size builder: at most five quick picks, only those inside the plan's range and step.
const wideFilePresets = ({ min, max, step }) =>
  [10, 20, 40, 60, 90].filter((value) => value >= min && value <= max && (value - min) % step === 0);

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

// Each step heading is a direct question, with no step number.
const Step = ({ title, extra, children, compact }) => (
  <div className={`flex flex-col gap-3 border-t border-[var(--glass-border)] first:border-t-0 ${compact ? 'py-3' : 'p-5'}`}>
    <div className="flex items-baseline gap-3">
      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-[var(--text-primary)]`}>{title}</h3>
      {extra && <span className="self-center">{extra}</span>}
    </div>
    {children}
  </div>
);

// A small ⓘ button that opens a bubble; closes on a click outside or Escape.
const InfoBubble = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="absolute left-0 top-6 z-20 w-64 rounded-xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-3 shadow-xl">
          {children}
        </div>
      )}
    </span>
  );
};

const Row = ({ label, value, tone }) => (
  <div className={`flex justify-between gap-3 text-sm ${tone === 'good' ? 'text-[var(--badge-success-fg)]' : 'text-[var(--text-secondary)]'}`}>
    <span>{label}</span><span className="font-mono tabular-nums">{value}</span>
  </div>
);

export const QuoteBill = ({ plan, quote, loading, error, compact }) => {
  const isUpload = plan?.servicePlan?.capability === 'upload_data';
  const flexible = isFlexiblePlan(plan);
  if (error) return <p className="rounded-xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">{error}</p>;
  if (!quote) {
    return loading
      ? <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Spinner />Working out the price…</p>
      : <p className="text-sm text-[var(--text-muted)]">Choose the options to see the price.</p>;
  }
  const oneTime = quote.purchase === 'one_time';
  const months = Number(quote.cycleMonths) || 1;
  const perCycleUpdates = quote.allowancePerCycle;
  // A new choice keeps the last bill on screen, dimmed, with the spinner over it until the
  // new price is in: nothing moves, and the client sees it is being worked out.
  return (
    <div className="relative" aria-busy={loading}>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center" role="status" aria-label="Updating the price"><Spinner size="page" /></span>}
    <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-live="polite">
      <div className="flex flex-col gap-2">
        {flexible && <Row label={`1 update · ${quote.files} files`} value={formatPrice(quote.updatePrice)} />}
        {flexible && <Row label={`× ${quote.updates} update${quote.updates === 1 ? '' : 's'}${oneTime ? '' : ' per month'}`} value={formatPrice(oneTime ? quote.totalPrice : quote.perMonthPrice)} />}
        {!oneTime && months > 1 && <Row label={`× ${months} months`} value={formatPrice(quote.subtotal)} />}
        {!oneTime && quote.discount > 0 && <Row tone="good" label={`${quote.discountPercent}% period discount`} value={`− ${formatPrice(quote.discount)}`} />}
      </div>
      {!compact && !oneTime ? (
        // Full size: the highlighted figure is the cost per month (backend period price ÷ its
        // months, display only); what is actually paid each period sits under it.
        <div className="flex flex-col gap-1 border-t border-dashed border-[var(--glass-border)] pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-sm text-[var(--text-muted)]">{months === 1 ? 'Per month' : 'Works out to'}</span>
            <span className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {formatPrice(Math.round(Number(quote.cyclePrice) / months))}<span className="text-base font-semibold text-[var(--text-muted)]"> / month</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-sm text-[var(--text-secondary)]">
            <span>{months === 1 ? 'Billed monthly' : `Pay every ${PERIOD_WORDS[quote.purchase]}`}</span>
            {months > 1 && <span className="font-mono tabular-nums">{formatPrice(quote.firstPayment)}</span>}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-dashed border-[var(--glass-border)] pt-3">
          <span className="text-sm text-[var(--text-muted)]">{oneTime ? 'Pay once' : months === 1 ? 'Pay per month' : `Pay every ${PERIOD_WORDS[quote.purchase]}`}</span>
          <span className={`${compact ? 'text-2xl' : 'text-3xl'} font-mono font-extrabold tabular-nums text-[var(--text-primary)]`}>{formatPrice(quote.firstPayment)}</span>
        </div>
      )}
      <div className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm ${compact ? 'bg-[var(--glass-bg-subtle)]' : 'bg-[rgb(var(--ink-rgb)/0.05)]'}`}>
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
    </div>
  );
};

const PlanBuilder = ({ plan, compact = false, onChange, refreshToken = 0, action = null, intro = null, initial = null }) => {
  const flexible = isFlexiblePlan(plan);
  const purchases = useMemo(() => purchaseOptions(plan), [plan]);
  const files = useMemo(() => fileChoices(plan), [plan]);
  const updates = useMemo(() => updateChoices(plan), [plan]);

  const [purchase, setPurchase] = useState(() => initial?.purchase || purchases[0]?.value || '');
  const cycleMonths = purchases.find((option) => option.value === purchase)?.months || null;
  const tenures = useMemo(() => buildTenureOptions(plan, cycleMonths), [plan, cycleMonths]);
  const [tenureMonths, setTenureMonths] = useState(() => initial?.tenureMonths || purchases[0]?.months || null);
  const [fileCount, setFileCount] = useState(() => initial?.files || files.min || null);
  const [updateCount, setUpdateCount] = useState(() => initial?.updates || updates[0] || null);
  const [releaseMode, setReleaseMode] = useState(() => initial?.releaseMode || plan?.servicePlan?.releaseMode || 'all_at_once');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const releaseChoice = canChooseRelease(plan, cycleMonths);
  const choice = useMemo(
    () => planChoiceBody(plan, { purchase, tenureMonths, files: fileCount, updates: updateCount, releaseMode }),
    [plan, purchase, tenureMonths, fileCount, updateCount, releaseMode],
  );

  // The backend price for this choice (hooks/usePlanQuote.js); handed to the parent as it changes.
  const priced = usePlanQuote(plan, choice, refreshToken);
  useEffect(() => { onChangeRef.current?.(priced); }, [priced]);

  const choosePurchase = (value) => {
    setPurchase(value);
    setTenureMonths(purchases.find((option) => option.value === value)?.months || null);
  };

  if (!purchases.length) {
    const unavailable = <p className="text-sm text-[var(--text-muted)]">This plan cannot be bought right now. Please contact support.</p>;
    return compact || !intro ? unavailable : <div className="flex flex-col gap-6">{intro}{unavailable}</div>;
  }

  const oneTime = purchase === 'one_time';
  const activeSlab = (row) => fileCount >= row.from;
  const presets = compact ? filePresets(files) : wideFilePresets(files);
  const pricing = !compact && (
    <InfoBubble label="File pricing">
      <table className="w-full border-collapse text-sm" aria-label="Price per file">
        <tbody>
          {slabRows(plan).map((row) => (
            <tr key={row.from} className={activeSlab(row) ? 'bg-[var(--accent-soft-bg)]' : ''}>
              <td className="px-2 py-1.5 text-[var(--text-secondary)]">Files {row.from}–{row.to}</td>
              <td className="px-2 py-1.5 text-right font-mono text-[var(--text-primary)]">{formatPrice(row.rate)} / file</td>
            </tr>
          ))}
        </tbody>
      </table>
    </InfoBubble>
  );
  const steps = [];
  // Full size asks each step as a question; the compact pop-up keeps its short labels.
  if (flexible) {
    steps.push(
      <Step key="files" title={compact ? 'Files per update' : 'How many files in each update?'} extra={pricing} compact={compact}>
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
        {presets.length > 0 && (
          <div className={`flex-wrap gap-2 ${compact ? 'flex' : 'hidden sm:flex'}`}>
            {presets.map((value) => (
              <button key={value} type="button" aria-pressed={fileCount === value} className={chipClass(fileCount === value)} onClick={() => setFileCount(value)}>{value} files</button>
            ))}
          </div>
        )}
      </Step>,
      <Step
        key="updates"
        title={compact
          ? oneTime ? 'Number of updates' : 'Updates per month'
          : oneTime ? 'How many updates do you need?' : 'How many updates do you need each month?'}
        compact={compact}
      >
        {compact ? (
          <div className="grid grid-cols-4 gap-2">
            {updates.map((value) => (
              <button key={value} type="button" aria-pressed={updateCount === value} className={segClass(updateCount === value)} onClick={() => setUpdateCount(value)}>
                <b className="text-base">{value}</b><span className="text-xs text-[var(--text-muted)]">update{value === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        ) : (
          <select
            aria-label={oneTime ? 'Number of updates' : 'Updates per month'}
            className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-base font-semibold text-[var(--text-primary)] sm:w-64"
            value={updateCount || ''}
            onChange={(event) => setUpdateCount(Number(event.target.value))}
          >
            {updates.map((value) => (
              <option key={value} value={value}>{value} update{value === 1 ? '' : 's'}{oneTime ? '' : ' per month'}</option>
            ))}
          </select>
        )}
        <p className="text-xs text-[var(--text-muted)]">Each update gets its own {fileCount} files.</p>
      </Step>,
    );
  }
  if (purchases.length > 1 || !oneTime) {
    steps.push(
      <Step key="purchase" title="How do you want to pay?" compact={compact}>
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
      <Step key="length" title="For how long?" compact={compact}>
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
        <Step key="release" title="When should your updates open?" compact={compact}>
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

  const bill = <QuoteBill plan={plan} quote={priced.quote} loading={priced.loading} error={priced.error} compact={compact} />;

  if (compact) {
    return (
      <div className="flex flex-col">
        {steps}
        <div className="border-t border-[var(--glass-border)] pt-3">{bill}</div>
      </div>
    );
  }
  // Bill heading = what is chosen (prototype), from the selections, not from the price.
  const choiceTitle = flexible
    ? `${fileCount} files × ${updateCount} update${updateCount === 1 ? '' : 's'}, ${BUY_WORDS[purchase] || ''}`
    : plan.serviceName;
  // Solid cards on the page glass, as in the approved prototype. This grid is the whole page layout:
  // `intro` (the page's plan description) sits above the steps, so the bill can stay sticky below the
  // 4rem top bar for the full page. Every ancestor must keep overflow visible or clip, never hidden.
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {intro}
        <div className="flex flex-col rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)]">
          {steps.length ? steps : <Step title="One-time purchase"><p className="text-sm text-[var(--text-secondary)]">Nothing to choose: this plan is bought once.</p></Step>}
        </div>
      </div>
      <aside className="flex flex-col gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-5 lg:sticky lg:top-20">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--eyebrow-fg)]">Your plan</span>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{choiceTitle}</h3>
        </div>
        {bill}
        {action}
      </aside>
    </div>
  );
};

export default PlanBuilder;
