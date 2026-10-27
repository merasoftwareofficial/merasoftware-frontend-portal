import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SummaryApi from "../../common";
import displayINRCurrency from "../../helpers/displayCurrency";
import PaymentMethodFields from "../PaymentMethodFields";
import { createPaymentEntry, getPaymentEntryError, toPaymentRequest } from "../../helpers/paymentMethodRules";

// Admin views of one service plan (merasoftware/src/docs/plan.md Phase 2a), used by
// AdminClientWorkspace.js:
//   PlanOverviewPanel  — what was bought (frozen snapshot), term, "allowed right now"
//                        (order.uploadAllowance from helpers/serviceAllowance.js), release mode,
//                        and the cycle history.
//   StartPlanForClient — start a plan on the client's behalf. The price is always the portal's
//                        quote (admin quote route, hidden plans too); nothing is priced here.

const CYCLE_LABELS = { monthly: "Monthly", quarterly: "Every 3 months", half_yearly: "Every 6 months", yearly: "Yearly", one_time: "One-time" };
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const STATUS_LABELS = { pending_activation: "Waiting for project", active: "Active", paused: "Paused", expired: "Expired", inactive: "Inactive", cancelled: "Cancelled" };

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (value) => (value === null || value === undefined ? "—" : displayINRCurrency(value));

const Line = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-slate-500">{label}</span>
    <span className="max-w-[65%] text-right font-semibold text-slate-900">{children}</span>
  </div>
);

export const PlanOverviewPanel = ({ item, onChanged }) => {
  const [saving, setSaving] = useState(false);
  const snapshot = item?.servicePlanSnapshot || {};
  const breakdown = snapshot.priceBreakdown || {};
  const allowance = item?.uploadAllowance || null;
  const isUpload = snapshot.capability ? snapshot.capability === "upload_data" : snapshot.serviceBehavior !== "reminder_only";
  const cycle = item?.serviceSelectedBillingCycle || snapshot.selectedBillingCycle || null;
  const releaseMode = snapshot.releaseMode || "all_at_once";
  const canMonthly = isUpload && Number(snapshot.updatesPerMonth) > 0 && Number(item?.serviceBillingCycleMonths) > 1;
  const history = (item?.serviceCycleHistory || []).slice().sort((a, b) => (b.cycleNumber || 0) - (a.cycleNumber || 0));

  const changeRelease = async (next) => {
    if (saving || next === releaseMode) return;
    try {
      setSaving(true);
      const response = await fetch(`${SummaryApi.adminPlanReleaseMode.url}/${item._id}/release-mode`, {
        method: SummaryApi.adminPlanReleaseMode.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseMode: next }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not change how updates open");
      toast.success(next === "monthly" ? "Updates now open month by month" : "All updates of the period are open");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-500">What was bought</p>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Line label="Plan">{snapshot.serviceName || "—"}</Line>
            <Line label="Status">{STATUS_LABELS[item?.servicePlanStatus] || item?.servicePlanStatus || "—"}</Line>
            <Line label="Bought">{cycle ? `${CYCLE_LABELS[cycle] || cycle}${item?.serviceTenureMonths ? ` · ${item.serviceTenureMonths} months` : ""}` : "One-time"}</Line>
            {isUpload && snapshot.chosenFiles ? <Line label="Files per update">{snapshot.chosenFiles}</Line> : null}
            {isUpload && !snapshot.chosenFiles && snapshot.filesLimit ? <Line label="Files per update">{snapshot.filesLimit}</Line> : null}
            {isUpload && snapshot.updatesPerMonth ? <Line label="Updates per month">{snapshot.updatesPerMonth}</Line> : null}
            {isUpload && snapshot.chosenUpdates && !cycle ? <Line label="Updates bought">{snapshot.chosenUpdates}</Line> : null}
            {!isUpload ? <Line label="Uploads">None — we do the work</Line> : null}
            <Line label={cycle ? "Price per period" : "Price"}>{money(item?.serviceCyclePrice ?? breakdown.cyclePrice ?? item?.totalAmount)}</Line>
            {breakdown.discount > 0 ? <Line label="Discount">{money(breakdown.discount)} ({breakdown.discountPercent}%)</Line> : null}
            {breakdown.totalPrice && breakdown.totalCycles > 1 ? <Line label="Whole length">{money(breakdown.totalPrice)} over {breakdown.totalCycles} periods</Line> : null}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-500">Term and updates</p>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Line label="Started">{formatDate(item?.servicePlanStartDate)}</Line>
            <Line label="Ends">{item?.servicePlanEndDate ? formatDate(item.servicePlanEndDate) : "No end date"}</Line>
            {cycle ? <Line label="Current period">{`${item?.serviceCurrentCycleNumber || 1}${item?.serviceTotalCycles ? ` of ${item.serviceTotalCycles}` : ""} · ${formatDate(item?.serviceCurrentCycleStart)} – ${formatDate(item?.serviceCurrentCycleEnd)}`}</Line> : null}
            {cycle && item?.serviceNextBillingDate ? <Line label="Next bill">{formatDate(item.serviceNextBillingDate)}</Line> : null}
            {isUpload && allowance ? (
              <Line label="Open right now">
                {allowance.unlimited
                  ? "Unlimited"
                  : `${allowance.remaining} of ${allowance.limit} left${allowance.cycleLimit !== allowance.limit ? ` (${allowance.cycleLimit} this period)` : ""}`}
              </Line>
            ) : null}
            {isUpload && allowance?.nextReleaseAt ? <Line label="More open on">{formatDate(allowance.nextReleaseAt)}</Line> : null}
          </div>

          {isUpload && cycle ? (
            <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">How updates open</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[["all_at_once", "All at once"], ["monthly", "Month by month"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={saving || (value === "monthly" && !canMonthly)}
                    onClick={() => changeRelease(value)}
                    className={[
                      "rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                      releaseMode === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!canMonthly ? <p className="mt-2 text-xs text-slate-500">Month by month needs a plan bought per month for a period longer than one month.</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      {history.length > 0 ? (
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-bold text-slate-900">Periods</h3>
          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {history.map((row) => (
              <div key={`${row.cycleNumber}-${row.cycleStart}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-900">Period {row.cycleNumber}</span>
                <span className="text-slate-500">{formatDate(row.cycleStart)} – {formatDate(row.cycleEnd)}</span>
                <span className="text-slate-500">{row.accessUsed ?? 0} update(s) used</span>
                <span className="font-semibold text-slate-900">{row.paidAt ? `${money(row.amount)} paid ${formatDate(row.paidAt)}` : money(row.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const purchaseOptions = (plan) => {
  const sp = plan?.servicePlan || {};
  const flexible = sp.pricingMode === "flexible";
  const oneTime = flexible ? Boolean(sp.allowOneTime) : sp.purchaseType === "one_time";
  return [...(oneTime ? ["one_time"] : []), ...(sp.billingOptions || []).map((option) => option.billingCycle).filter((key) => CYCLE_MONTHS[key])];
};

export const StartPlanForClient = ({ customerId, projects = [], walletBalance = 0, onStarted, onClose }) => {
  const [plans, setPlans] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [choice, setChoice] = useState({ planId: "", purchase: "", tenureMonths: 0, files: 0, updates: 0, releaseMode: "", linkedProjectOrderId: "" });
  const [quote, setQuote] = useState(null);
  const [paymentMode, setPaymentMode] = useState("record");
  const [paymentEntry, setPaymentEntry] = useState(() => createPaymentEntry());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(SummaryApi.adminPlanCatalogue.url, { method: SummaryApi.adminPlanCatalogue.method, credentials: "include" });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Could not load plans");
        if (!cancelled) setPlans((result.data?.plans || []).filter((plan) => !plan.retired));
      } catch (error) {
        if (!cancelled) setLoadError(error.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const plan = useMemo(() => (plans || []).find((row) => row._id === choice.planId) || null, [plans, choice.planId]);
  const sp = plan?.servicePlan || {};
  const flexible = sp.pricingMode === "flexible";
  const options = purchaseOptions(plan);
  const cycleMonths = CYCLE_MONTHS[choice.purchase] || 0;
  const maxTenure = Math.min(Number(sp.maxTenureMonths) || 12, 12);
  const tenures = cycleMonths ? Array.from({ length: Math.floor(maxTenure / cycleMonths) }, (_, index) => (index + 1) * cycleMonths) : [];
  const fileSteps = flexible && sp.files ? Array.from({ length: Math.floor((sp.files.max - sp.files.min) / (sp.files.step || 1)) + 1 }, (_, index) => sp.files.min + index * (sp.files.step || 1)) : [];
  const updateCounts = flexible && sp.updatesPerMonth ? Array.from({ length: sp.updatesPerMonth.max - sp.updatesPerMonth.min + 1 }, (_, index) => sp.updatesPerMonth.min + index) : [];

  const pickPlan = (planId) => {
    const next = (plans || []).find((row) => row._id === planId);
    const nextSp = next?.servicePlan || {};
    const first = purchaseOptions(next)[0] || "";
    setChoice({
      ...choice, planId, purchase: first, tenureMonths: CYCLE_MONTHS[first] || 0,
      files: nextSp.pricingMode === "flexible" ? nextSp.files?.min || 0 : 0,
      updates: nextSp.pricingMode === "flexible" ? nextSp.updatesPerMonth?.min || 0 : 0,
      releaseMode: "",
    });
  };

  // The portal's quote for these choices; its quoteKey makes the start refuse a changed price.
  const request = plan && choice.purchase ? JSON.stringify({
    planId: plan._id, purchase: choice.purchase,
    tenureMonths: cycleMonths ? choice.tenureMonths : undefined,
    files: flexible ? choice.files : undefined, updates: flexible ? choice.updates : undefined,
    releaseMode: choice.releaseMode || undefined,
  }) : "";
  useEffect(() => {
    if (!request) { setQuote(null); return undefined; }
    let cancelled = false;
    setQuote({ for: request, loading: true });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(SummaryApi.adminPlanQuote.url, {
          method: SummaryApi.adminPlanQuote.method, credentials: "include",
          headers: { "Content-Type": "application/json" }, body: request,
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "No price for these choices");
        if (!cancelled) setQuote({ for: request, ...result.data });
      } catch (error) {
        if (!cancelled) setQuote({ for: request, error: error.message });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [request]);
  const ready = quote && quote.for === request && quote.quote && !quote.loading;

  const submit = async () => {
    if (!ready || submitting) return;
    let payment = { mode: "wallet" };
    if (paymentMode === "record") {
      const entryError = getPaymentEntryError(paymentEntry);
      if (entryError) { toast.error(entryError); return; }
      const paid = toPaymentRequest(paymentEntry);
      payment = { mode: "record", paymentMethod: paid.paymentMethod, transactionReference: paid.reference, paymentDetails: paid.paymentDetails };
    } else if (Number(walletBalance) < quote.quote.firstPayment) {
      toast.error("The client's wallet does not have enough balance");
      return;
    }
    try {
      setSubmitting(true);
      const response = await fetch(`${SummaryApi.adminStartPlanForClient.url}/${customerId}/service-plans`, {
        method: SummaryApi.adminStartPlanForClient.method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(request), quoteKey: quote.quoteKey, linkedProjectOrderId: choice.linkedProjectOrderId || undefined, payment }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not start the plan");
      toast.success("Plan started. The client has been told.");
      onStarted?.(result.data?.orderId);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const select = "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400";
  const label = "text-sm font-semibold text-slate-700";

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Start a plan for this client</h3>
          <p className="mt-1 text-sm text-slate-500">The price comes from the portal. The plan starts paid and the client is told.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Close</button>
      </div>

      {loadError ? <p className="mt-4 text-sm text-rose-600">{loadError}</p> : null}
      {!plans && !loadError ? <p className="mt-4 text-sm text-slate-500">Loading plans…</p> : null}

      {plans ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className={label}>Plan</span>
            <select className={select} value={choice.planId} onChange={(event) => pickPlan(event.target.value)}>
              <option value="">Choose a plan</option>
              {plans.map((row) => <option key={row._id} value={row._id}>{row.serviceName}{row.isHidden ? " (hidden from clients)" : ""}</option>)}
            </select>
          </label>

          {plan ? (
            <>
              <label className="block">
                <span className={label}>Bought as</span>
                <select className={select} value={choice.purchase} onChange={(event) => setChoice({ ...choice, purchase: event.target.value, tenureMonths: CYCLE_MONTHS[event.target.value] || 0 })}>
                  {options.map((key) => <option key={key} value={key}>{CYCLE_LABELS[key] || key}</option>)}
                </select>
              </label>
              {cycleMonths ? (
                <label className="block">
                  <span className={label}>Total length</span>
                  <select className={select} value={choice.tenureMonths} onChange={(event) => setChoice({ ...choice, tenureMonths: Number(event.target.value) })}>
                    {tenures.map((months) => <option key={months} value={months}>{months} month{months === 1 ? "" : "s"}</option>)}
                  </select>
                </label>
              ) : null}
              {flexible ? (
                <>
                  <label className="block">
                    <span className={label}>Files per update</span>
                    <select className={select} value={choice.files} onChange={(event) => setChoice({ ...choice, files: Number(event.target.value) })}>
                      {fileSteps.map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className={label}>{choice.purchase === "one_time" ? "Number of updates" : "Updates per month"}</span>
                    <select className={select} value={choice.updates} onChange={(event) => setChoice({ ...choice, updates: Number(event.target.value) })}>
                      {updateCounts.map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                </>
              ) : null}
              {sp.customerCanChooseRelease && cycleMonths > 1 ? (
                <label className="block">
                  <span className={label}>How updates open</span>
                  <select className={select} value={choice.releaseMode || sp.releaseMode || "all_at_once"} onChange={(event) => setChoice({ ...choice, releaseMode: event.target.value })}>
                    <option value="all_at_once">All at once</option>
                    <option value="monthly">Month by month</option>
                  </select>
                </label>
              ) : null}
              {sp.dependency !== "standalone_only" && projects.length ? (
                <label className="block">
                  <span className={label}>Add to a project (optional)</span>
                  <select className={select} value={choice.linkedProjectOrderId} onChange={(event) => setChoice({ ...choice, linkedProjectOrderId: event.target.value })}>
                    <option value="">{sp.dependency === "project_required" ? "Choose the project" : "On its own"}</option>
                    {projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}
                  </select>
                </label>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm md:col-span-2" aria-live="polite">
                {!quote || quote.loading || quote.for !== request ? <span className="text-slate-500">Working out the price…</span>
                  : quote.error ? <span className="text-rose-600">{quote.error}</span>
                  : (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>Pay now <strong className="text-slate-900">{money(quote.quote.firstPayment)}</strong></span>
                      {quote.quote.totalCycles > 1 ? <span>Whole length {money(quote.quote.totalPrice)} over {quote.quote.totalCycles} periods</span> : null}
                      {quote.quote.discount > 0 ? <span>Discount {money(quote.quote.discount)}</span> : null}
                      {quote.quote.allowancePerCycle !== null ? <span>{quote.quote.allowancePerCycle} update(s) {choice.purchase === "one_time" ? "in total" : "per period"}</span> : null}
                      {quote.quote.validityDays ? <span>Lasts {quote.quote.validityDays} days</span> : null}
                    </div>
                  )}
              </div>

              <div className="space-y-3 md:col-span-2">
                <span className={label}>How the client paid</span>
                <div className="flex flex-wrap gap-2">
                  {[["record", "Payment received (record it)"], ["wallet", `From the client's wallet (${money(walletBalance)})`]].map(([value, text]) => (
                    <button key={value} type="button" onClick={() => setPaymentMode(value)}
                      className={["rounded-xl border px-3 py-1.5 text-xs font-semibold", paymentMode === value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}>
                      {text}
                    </button>
                  ))}
                </div>
                {paymentMode === "record" ? (
                  <PaymentMethodFields entry={paymentEntry} onChange={setPaymentEntry} methods={["upi", "bank_transfer", "cheque", "cash"]} disabled={submitting} inputClassName={select} />
                ) : null}
              </div>

              <div className="md:col-span-2">
                <button type="button" disabled={!ready || submitting} onClick={submit}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? "Starting…" : ready ? `Start plan · ${money(quote.quote.firstPayment)}` : "Start plan"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
