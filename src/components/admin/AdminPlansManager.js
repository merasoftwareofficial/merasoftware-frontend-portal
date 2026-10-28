import React, { useEffect, useMemo, useState } from "react";
import { BILLING_CYCLES, DEPENDENCIES, LIMIT_SCOPES, TIMINGS, blankPlanForm, categoryKeyFrom, formFromPlan, planBody, planState, rangeText, rupees, } from "../../helpers/adminPlanForm";
import { useBlocker } from "react-router-dom";
import s from "./AdminPlansManager.module.css";
import { PlanCategoryPicker } from "./PlanCategoryPicker";
import { readAdminPlanCatalogue, sendAdminPlan } from "../../helpers/adminPlanApi";
const send = sendAdminPlan;
const message = (cause, fallback) => cause instanceof Error ? cause.message : fallback;
export function PlansManager({ initial, startCreating = false }) {
    const [catalogue, setCatalogue] = useState(initial);
    const [form, setForm] = useState(() => startCreating ? blankPlanForm(initial.categories.find(c => c.status === "active")?.key || "") : null);
    const [baseline, setBaseline] = useState(() => JSON.stringify(startCreating ? blankPlanForm(initial.categories.find(c => c.status === "active")?.key || "") : null));
    const [categoryDirty, setCategoryDirty] = useState(false);
    const [status, setStatus] = useState("all");
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dirty = !!form && JSON.stringify(form) !== baseline;
    const blocker = useBlocker(dirty || categoryDirty);
    useEffect(() => {
        if (blocker.state === "blocked") {
            if (window.confirm("Discard unsaved changes and leave Plans?")) blocker.proceed();
            else blocker.reset();
        }
    }, [blocker]);
    useEffect(() => {
        if (!dirty && !categoryDirty) return;
        const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty, categoryDirty]);
    async function reload() {
        setCatalogue(await readAdminPlanCatalogue());
    }
    function open(next) {
        if ((dirty || categoryDirty) && !window.confirm("Discard unsaved plan changes?"))
            return;
        setCategoryDirty(false);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setError("");
        setNotice("");
    }
    async function act(plan, action, confirmText) {
        if (confirmText && !window.confirm(confirmText))
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            let mode, confirmName;
            if (action === "purge" && window.confirm("Also permanently erase the catalogue record? Cancel keeps the archived record. Customer orders and bills stay either way.")) {
                mode = "hard";
                confirmName = window.prompt("Type the plan name exactly to permanently erase it:");
                if (confirmName === null)
                    return;
            }
            await send({ target: "plan", action, mode, confirmName, planId: plan._id, expectedUpdatedAt: plan.updatedAt ?? null });
            setNotice({ hide: "Plan hidden from customers.", unhide: "Plan is on sale.", retire: "Plan removed.", restore: "Plan restored.", purge: "Plan deleted." }[action]);
            await reload();
        }
        catch (cause) {
            setError(message(cause, "Could not change the plan."));
        }
        finally {
            setBusy(false);
        }
    }
    if (form)
        return <div className={s.manager}><PlanEditor form={form} setForm={setForm} catalogue={catalogue} dirty={dirty} onBack={() => open(null)} onSaved={async (saved) => { setBaseline(JSON.stringify(saved)); await reload(); }} onCategories={setCatalogue}/></div>;
    const known = new Set(catalogue.categories.map(category => category.key));
    const filtered = catalogue.plans.filter(plan => (status === "all" || planState(plan) === status) && plan.serviceName.toLowerCase().includes(search.trim().toLowerCase()));
    const groups = [
        ...catalogue.categories.map(category => ({ key: category.key, label: category.label, archived: category.status === "archived", plans: filtered.filter(plan => plan.servicePlan?.categoryKey === category.key) })),
        { key: "", label: "No category yet", archived: false, plans: filtered.filter(plan => !known.has(plan.servicePlan?.categoryKey || "")) },
    ].filter(group => group.plans.length);
    return <div className={`${s.manager} ${s.stack}`}>
    <p>A plan is repeat or ongoing work a client buys in the portal. Clients pay the price the portal works out from these settings; old purchases always keep what they bought.</p>
    <div className="form-actions"><button type="button" className="admin-action" disabled={busy} onClick={() => reload().catch(cause => setError(message(cause, "Could not reload plans.")))}>Refresh plans</button><button className="admin-button" disabled={busy} onClick={() => open(blankPlanForm(catalogue.categories.find(c => c.status === "active")?.key || ""))}>New plan +</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="form-columns"><label className="admin-field">Search plans<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label><label className="admin-field">Status<select value={status} onChange={e => setStatus(e.target.value)}>{["all", "On sale", "Hidden", "Retired"].map(value => <option key={value} value={value}>{value === "all" ? "All plans" : value}</option>)}</select></label></div>
    {!filtered.length && <p className={s.muted}>No plans yet.</p>}
    {groups.map(group => <section key={group.key || "none"} className={s.group}>
      <h2>{group.label}{group.archived ? " (archived)" : ""}</h2>
      {group.plans.map(plan => <article className={`admin-form ${s.card}`} key={plan._id}>
        <div className={s.cardHead}><h3>{plan.serviceName}</h3><span className={s[planState(plan).replace(" ", "").toLowerCase()]}>{planState(plan)}</span></div>
        <p className={s.muted}>{plan.servicePlan?.pricingMode === "flexible" ? "Client chooses files and updates" : "Fixed price"} · {rangeText(plan.priceRange)}{plan.servicePlan?.capability === "send_reminders" ? " · no uploads" : ""}</p>
        {!plan.canBeOnSale && !plan.retired && <p className={s.warn}>This plan cannot currently be shown. Review its settings.</p>}
        <div className="form-actions">
          {!plan.retired && <button className="admin-action" disabled={busy} onClick={() => open(formFromPlan(plan))}>Edit plan →</button>}
          {!plan.retired && <button className="admin-action" disabled={busy} onClick={() => open({ ...formFromPlan(plan), planId: "", serviceName: `${plan.serviceName} copy`, isHidden: true })}>Duplicate</button>}
          {!plan.retired && (plan.isHidden
                    ? <button className="admin-action" disabled={busy || !plan.canBeOnSale} onClick={() => act(plan, "unhide")}>Show to clients</button>
                    : <button className="admin-action" disabled={busy} onClick={() => act(plan, "hide")}>Hide from clients</button>)}
          {!plan.retired && <button className="admin-action" disabled={busy} onClick={() => act(plan, "retire", `Remove "${plan.serviceName}"? If nobody bought it, it is deleted. If clients bought it, it moves to Retired and their purchases stay unchanged.`)}>Remove</button>}
          {plan.retired && <button className="admin-action" disabled={busy} onClick={() => act(plan, "restore")}>Restore</button>}
          {plan.retired && <button className="admin-action" disabled={busy} onClick={() => act(plan, "purge", `Delete "${plan.serviceName}" for good? It leaves every list. Clients' purchases, bills and payments stay.`)}>Delete forever</button>}
        </div>
      </article>)}
    </section>)}
    <CategoriesPanel catalogue={catalogue} onChange={setCatalogue} onDirty={setCategoryDirty}/>
  </div>;
}
function CategoriesPanel({ catalogue, onChange, onDirty }) {
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { onDirty(!!draft); return () => onDirty(false); }, [draft, onDirty]);
    async function saveCategory(e) {
        e.preventDefault();
        if (!draft)
            return;
        setBusy(true);
        setError("");
        try {
            const { creating, key, label, description, linkedProjectCategory, status, sortOrder, updatedAt } = draft;
            await send({ target: "category", ...(creating ? { creating: true } : {}), key, label, expectedUpdatedAt: creating ? undefined : updatedAt ?? null, description: description || "", linkedProjectCategory: linkedProjectCategory || null, status, sortOrder: Number(sortOrder) });
            onChange(await readAdminPlanCatalogue());
            setDraft(null);
        }
        catch (cause) {
            setError(message(cause, "Could not save the category."));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className={`admin-form ${s.group}`}>
    <h2>Plan categories</h2>
    <p className={s.muted}>Groups for plans, separate from project categories. A category is never deleted, only archived; its key stays the same for ever.</p>
    <ul className={s.list}>{catalogue.categories.map(category => <li key={category.key}>
      <span><strong>{category.label}</strong> <small className={s.muted}>{category.key} · {category.usage?.plans ?? 0} plan(s){category.status === "archived" ? " · archived" : ""}{category.linkedProjectCategory ? ` · linked to ${catalogue.projectCategories.find(p => p.category === category.linkedProjectCategory)?.label ?? category.linkedProjectCategory}` : ""}</small></span>
      <button type="button" className="admin-action" onClick={() => setDraft({ ...category, creating: false })}>Edit</button>
    </li>)}</ul>
    {draft ? <form className={s.stack} onSubmit={saveCategory}><fieldset disabled={busy} className={s.plain}>
      <div className="form-columns">
        <label className="admin-field"><span>Category name</span><input required maxLength={60} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value, key: draft.creating ? categoryKeyFrom(e.target.value) : draft.key })}/></label>
        <label className="admin-field"><span>Permanent key</span><input required disabled={!draft.creating} pattern="[a-z][a-z0-9_]{2,39}" value={draft.key} onChange={e => setDraft({ ...draft, key: e.target.value })}/><small>Made from the name. Cannot be changed later.</small></label>
      </div>
      <label className="admin-field"><span>Description (optional)</span><textarea maxLength={500} rows={2} value={draft.description || ""} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
      <div className="form-columns">
        <label className="admin-field"><span>Linked project category (optional)</span><select value={draft.linkedProjectCategory || ""} onChange={e => setDraft({ ...draft, linkedProjectCategory: e.target.value || null })}><option value="">Not linked</option>{catalogue.projectCategories.filter(p => p.status !== "archived" || p.category === draft.linkedProjectCategory).map(p => <option key={p.category} value={p.category}>{p.label}</option>)}</select></label>
        <label className="admin-field"><span>Status</span><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="active">Active</option><option value="archived">Archived</option></select></label>
        <label className="admin-field"><span>Display order</span><input type="number" min={0} max={9999} required value={draft.sortOrder} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })}/></label>
      </div>
      <div className="form-actions"><button className="admin-button">{busy ? "Saving…" : draft.creating ? "Create category" : "Save category"}</button><button type="button" className="admin-action" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>{!draft.creating && <button type="button" className="admin-action" onClick={async () => {
                    if (!window.confirm("Discard category changes and reload?"))
                        return;
                    try {
                        const current = await readAdminPlanCatalogue();
                        onChange(current);
                        const category = current.categories.find(row => row.key === draft.key);
                        setDraft(category ? { ...category, creating: false } : null);
                        setError("");
                    }
                    catch (cause) {
                        setError(message(cause, "Could not reload categories."));
                    }
                }}>Reload category</button>}</div>
    </fieldset></form> : <div><button type="button" className="admin-action" onClick={() => setDraft({ creating: true, key: "", label: "", description: "", linkedProjectCategory: null, status: "active", sortOrder: catalogue.categories.length })}>+ New category</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
function PlanEditor({ form, setForm, catalogue, dirty, onBack, onSaved, onCategories }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const update = (key, value) => setForm({ ...form, [key]: value });
    const isUpload = form.capability === "upload_data";
    const flexible = isUpload && form.pricingMode === "flexible";
    const oneTimePossible = flexible ? form.allowOneTime : form.purchaseType === "one_time";
    const recurringPossible = flexible || form.purchaseType === "recurring";
    const cycles = BILLING_CYCLES.filter(({ key }) => recurringPossible && form.billing[key].on);
    const purchases = [...(oneTimePossible ? [{ key: "one_time", label: "One-time", months: 0 }] : []), ...cycles];
    // Price preview: the unsaved settings are quoted by the portal (never worked out here).
    const [choice, setChoice] = useState({ purchase: "", tenureMonths: 1, files: form.filesMin, updates: form.updatesMin });
    const active = purchases.find(p => p.key === choice.purchase) ?? purchases[0];
    const months = active && "months" in active ? active.months : 0;
    const tenure = months ? Math.max(months, Math.floor(Math.min(choice.tenureMonths, form.maxTenureMonths) / months) * months) : 0;
    const body = useMemo(() => planBody(form), [form]);
    const request = active ? JSON.stringify({ target: "quote", settings: body, purchase: active.key, tenureMonths: tenure || undefined, files: flexible ? choice.files : undefined, updates: flexible ? choice.updates : undefined }) : "";
    const [quote, setQuote] = useState(null);
    useEffect(() => {
        if (!request)
            return;
        const timer = setTimeout(async () => {
            try {
                setQuote({ for: request, quote: (await send(JSON.parse(request))).quote });
            }
            catch (cause) {
                setQuote({ for: request, error: message(cause, "No price for these settings yet.") });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [request]);
    const shown = quote && quote.for === request ? quote : null;
    async function save(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const saved = await send({ target: "plan", ...body });
            const next = { ...form, planId: String(saved._id), expectedUpdatedAt: saved.updatedAt ?? null, isHidden: Boolean(saved.isHidden) };
            setForm(next);
            await onSaved(next);
            setNotice("Plan saved. Clients who already bought it keep what they bought.");
        }
        catch (cause) {
            setError(message(cause, "Could not save the plan."));
        }
        finally {
            setBusy(false);
        }
    }
    async function reloadSaved() {
        if (!form.planId || !window.confirm("Discard unsaved changes and reload the saved plan?"))
            return;
        setBusy(true);
        setError("");
        try {
            const current = await readAdminPlanCatalogue();
            const plan = current.plans.find(row => row._id === form.planId);
            if (!plan || plan.retired)
                throw new Error("This plan is no longer editable. Return to All plans.");
            const next = formFromPlan(plan);
            setForm(next);
            onCategories(current);
            await onSaved(next);
        }
        catch (cause) {
            setError(message(cause, "Could not reload the plan."));
        }
        finally {
            setBusy(false);
        }
    }
    const num = (key) => (e) => update(key, Number(e.target.value));
    return <>
    <div className="form-actions"><button className="admin-action" disabled={busy} onClick={onBack}>← All plans</button>{form.planId && <button type="button" className="admin-action" disabled={busy} onClick={reloadSaved}>Reload saved plan</button>}</div>
    <form className="admin-form" onSubmit={save}><fieldset disabled={busy} className={s.plain}>
      <h2>{form.planId ? "Edit plan" : "New plan"}</h2>
      <div className="form-columns">
        <label className="admin-field"><span>Plan name</span><input required maxLength={120} value={form.serviceName} onChange={e => update("serviceName", e.target.value)}/></label>
        <PlanCategoryPicker catalogue={catalogue} categoryKey={form.categoryKey} busy={busy} onBusy={setBusy}
          onSelect={key => update("categoryKey", key)} onCatalogue={onCategories} send={send} reload={readAdminPlanCatalogue} />
      </div>
      <label className="admin-field"><span>Description</span><textarea maxLength={2000} rows={3} value={form.description} onChange={e => update("description", e.target.value)}/><small>What the client gets. Shown on the plan card.</small></label>

      <fieldset className={s.box}><legend>How the work reaches us</legend>
        <label className={s.radio}><input type="radio" checked={isUpload} onChange={() => update("capability", "upload_data")}/> The client sends data (files and notes) through the portal for every update</label>
        <label className={s.radio}><input type="radio" checked={!isUpload} onChange={() => setForm({ ...form, capability: "send_reminders", pricingMode: "fixed" })}/> We do the work ourselves — no uploads</label>
      </fieldset>

      <div className="form-columns">
        <label className="admin-field"><span>Who can buy it</span><select value={form.dependency} onChange={e => update("dependency", e.target.value)}>{DEPENDENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {form.dependency !== "standalone_only" && <label className="admin-field"><span>When it can be added to a project</span><select value={form.timing} onChange={e => update("timing", e.target.value)}>{TIMINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      </div>

      <fieldset className={s.box}><legend>Price</legend>
        {isUpload && <div className={s.row}>
          <label className={s.radio}><input type="radio" checked={!flexible} onChange={() => update("pricingMode", "fixed")}/> Fixed price</label>
          <label className={s.radio}><input type="radio" checked={flexible} onChange={() => setForm({ ...form, pricingMode: "flexible" })}/> Client chooses files and updates (price per file)</label>
        </div>}
        {!flexible && <>
          <div className={s.row}>
            <label className={s.radio}><input type="radio" checked={form.purchaseType === "recurring"} onChange={() => update("purchaseType", "recurring")}/> Paid every period</label>
            <label className={s.radio}><input type="radio" checked={form.purchaseType === "one_time"} onChange={() => update("purchaseType", "one_time")}/> Paid once</label>
          </div>
          {form.purchaseType === "one_time"
                ? <label className="admin-field"><span>Price (₹)</span><input type="number" required min={1} max={10000000} value={form.oneTimePrice} onChange={num("oneTimePrice")}/></label>
                : <label className="admin-field"><span>Price per month (₹)</span><input type="number" required min={0} max={10000000} value={form.monthlyReferencePrice} onChange={num("monthlyReferencePrice")}/><small>Longer periods cost months × this price, less their discount.</small></label>}
          {isUpload && <div className="form-columns">
            <label className="admin-field"><span>Updates allowed</span><select value={form.limitScope} onChange={e => update("limitScope", e.target.value)}>{LIMIT_SCOPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {form.limitScope !== "unlimited" && <label className="admin-field"><span>Number of updates</span><input type="number" required min={1} max={1000} value={form.portalAccessCount} onChange={num("portalAccessCount")}/></label>}
            <label className="admin-field"><span>Files per update</span><input type="number" required min={1} max={100} value={form.filesLimit} onChange={num("filesLimit")}/></label>
          </div>}
        </>}
        {flexible && <>
          <div className="form-columns">
            <label className="admin-field"><span>Fewest files per update</span><input type="number" required min={1} max={100} value={form.filesMin} onChange={num("filesMin")}/></label>
            <label className="admin-field"><span>Most files per update</span><input type="number" required min={1} max={100} value={form.filesMax} onChange={num("filesMax")}/></label>
            <label className="admin-field"><span>Files go up in steps of</span><input type="number" required min={1} max={100} value={form.filesStep} onChange={num("filesStep")}/></label>
          </div>
          <label className="admin-field"><span>Cost per file (₹)</span><input type="number" required min={0} max={100000} value={form.ratePerFile} onChange={num("ratePerFile")}/></label>
          <div className={s.stack}><span className={s.label}>Cheaper price for more files (optional)</span>
            {form.slabs.map((slab, index) => <div className={s.inline} key={index}>
              <label>From file <input aria-label={`Cheaper price from file (row ${index + 1})`} type="number" min={2} max={100} value={slab.fromFile} onChange={e => update("slabs", form.slabs.map((row, i) => i === index ? { ...row, fromFile: Number(e.target.value) } : row))}/></label>
              <label>₹ per file <input aria-label={`Cost per file from that file (row ${index + 1})`} type="number" min={0} max={100000} value={slab.ratePerFile} onChange={e => update("slabs", form.slabs.map((row, i) => i === index ? { ...row, ratePerFile: Number(e.target.value) } : row))}/></label>
              <button type="button" className="admin-action" onClick={() => update("slabs", form.slabs.filter((_, i) => i !== index))}>Remove</button>
            </div>)}
            <div><button type="button" className="admin-action" onClick={() => update("slabs", [...form.slabs, { fromFile: (form.slabs.at(-1)?.fromFile ?? 1) + 10, ratePerFile: form.ratePerFile }])}>+ Add cheaper price</button></div>
          </div>
          <div className="form-columns">
            <label className="admin-field"><span>Fewest updates per month</span><input type="number" required min={1} max={100} value={form.updatesMin} onChange={num("updatesMin")}/></label>
            <label className="admin-field"><span>Most updates per month</span><input type="number" required min={1} max={100} value={form.updatesMax} onChange={num("updatesMax")}/></label>
          </div>
          <label className={s.radio}><input type="checkbox" checked={form.allowOneTime} onChange={e => update("allowOneTime", e.target.checked)}/> Can also be bought once (no repeat billing)</label>
        </>}
        {recurringPossible && <div className={s.stack}><span className={s.label}>Billing periods the client can pick</span>
          {BILLING_CYCLES.map(({ key, label }) => <div className={s.inline} key={key}>
            <label className={s.radio}><input type="checkbox" checked={form.billing[key].on} onChange={e => update("billing", { ...form.billing, [key]: { ...form.billing[key], on: e.target.checked } })}/> {label}</label>
            {form.billing[key].on && <label>Discount % <input aria-label={`${label} discount percent`} type="number" min={0} max={99} value={form.billing[key].discountPercent} onChange={e => update("billing", { ...form.billing, [key]: { ...form.billing[key], discountPercent: Number(e.target.value) } })}/></label>}
          </div>)}
        </div>}
      </fieldset>

      <fieldset className={s.box}><legend>Length and updates</legend>
        <div className="form-columns">
          {recurringPossible && <label className="admin-field"><span>Longest length a client can buy (months)</span><input type="number" required min={1} max={12} value={form.maxTenureMonths} onChange={num("maxTenureMonths")}/></label>}
          {oneTimePossible && <label className="admin-field"><span>A one-time purchase lasts (days)</span><input type="number" required min={1} max={3650} value={form.oneTimeValidityDays} onChange={num("oneTimeValidityDays")}/></label>}
        </div>
        {isUpload && recurringPossible && <>
          <div className={s.row}>
            <label className={s.radio}><input type="radio" checked={form.releaseMode === "all_at_once"} onChange={() => update("releaseMode", "all_at_once")}/> All updates of a period open at once</label>
            <label className={s.radio}><input type="radio" checked={form.releaseMode === "monthly"} onChange={() => update("releaseMode", "monthly")}/> Updates open month by month</label>
          </div>
          <label className={s.radio}><input type="checkbox" checked={form.customerCanChooseRelease} onChange={e => update("customerCanChooseRelease", e.target.checked)}/> Let the client choose this</label>
        </>}
      </fieldset>

      <label className={s.radio}><input type="checkbox" checked={!form.isHidden} onChange={e => update("isHidden", !e.target.checked)}/> Show this plan to clients</label>
      

      {purchases.length > 0 && <div className={`${s.box} ${s.preview}`} aria-live="polite">
        <span className={s.label}>Price check (worked out by the backend)</span>
        <div className={s.inline}>
          <label>Bought <select aria-label="Preview purchase" value={active?.key} onChange={e => setChoice({ ...choice, purchase: e.target.value })}>{purchases.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          {months > 0 && <label>for <input aria-label="Preview length in months" type="number" min={months} max={form.maxTenureMonths} step={months} value={tenure} onChange={e => setChoice({ ...choice, tenureMonths: Number(e.target.value) })}/> months</label>}
          {flexible && <label>Files <input aria-label="Preview files per update" type="number" min={form.filesMin} max={form.filesMax} step={form.filesStep} value={choice.files} onChange={e => setChoice({ ...choice, files: Number(e.target.value) })}/></label>}
          {flexible && <label>{active?.key === "one_time" ? "Updates" : "Updates / month"} <input aria-label="Preview updates" type="number" min={form.updatesMin} max={form.updatesMax} value={choice.updates} onChange={e => setChoice({ ...choice, updates: Number(e.target.value) })}/></label>}
        </div>
        <div className={s.quote}>{!shown ? <span className={s.muted}>Working out the price…</span>
                : shown.error ? <span className={s.warn}>{shown.error}</span>
                    : shown.quote && <>
            <span>First payment <strong>{rupees(shown.quote.firstPayment)}</strong></span>
            {shown.quote.totalCycles > 1 && <span>Total {rupees(shown.quote.totalPrice)} over {shown.quote.totalCycles} periods</span>}
            {shown.quote.discount > 0 && <span>Discount {rupees(shown.quote.discount)} ({shown.quote.discountPercent}%)</span>}
            {shown.quote.updatePrice !== null && <span>One update {rupees(shown.quote.updatePrice)}</span>}
            {shown.quote.allowancePerCycle !== null && <span>{shown.quote.allowancePerCycle} update(s) {active?.key === "one_time" ? "in total" : "per period"}</span>}
            {shown.quote.validityDays && <span>Lasts {shown.quote.validityDays} days</span>}
          </>}</div>
      </div>}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="admin-button" disabled={busy || (!dirty && !!form.planId)}>{busy ? "Saving…" : form.planId ? "Save plan" : "Create plan"}</button>
    </form>
  </>;
}
