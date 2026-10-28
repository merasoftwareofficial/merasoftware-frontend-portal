// Service plans (portal backend helpers/servicePlanCatalogue.js is the owner; docs/plan.md).
// The portal admin uses the shared catalogue API; every price comes from the backend quote,
// never from this file. This file only maps a stored plan to the visual form and back.
export const BILLING_CYCLES = [
    { key: "monthly", label: "Monthly", months: 1 },
    { key: "quarterly", label: "Every 3 months", months: 3 },
    { key: "half_yearly", label: "Every 6 months", months: 6 },
    { key: "yearly", label: "Yearly", months: 12 },
];
export const LIMIT_SCOPES = [
    ["per_month", "Per month"], ["per_plan", "For the whole plan"], ["per_day", "Per day"], ["per_week", "Per week"],
    ["per_quarter", "Per 3 months"], ["per_6_month", "Per 6 months"], ["per_year", "Per year"], ["unlimited", "Unlimited"],
];
export const DEPENDENCIES = [
    ["standalone_or_project", "On its own or with a website project"],
    ["project_required", "Only with a website project"],
    ["standalone_only", "Only on its own"],
];
export const TIMINGS = [
    ["during_and_after", "While the website is built and after"],
    ["during", "Only while the website is built"],
    ["after", "Only after the website is finished"],
];
const emptyBilling = () => ({ monthly: { on: false, discountPercent: 0 }, quarterly: { on: false, discountPercent: 0 }, half_yearly: { on: false, discountPercent: 0 }, yearly: { on: false, discountPercent: 0 } });
export const blankPlanForm = (categoryKey = "") => ({
    planId: "", serviceName: "", description: "", categoryKey, capability: "upload_data", dependency: "standalone_or_project", timing: "during_and_after",
    pricingMode: "fixed", purchaseType: "recurring", oneTimePrice: 0, monthlyReferencePrice: 0,
    billing: { ...emptyBilling(), monthly: { on: true, discountPercent: 0 } },
    limitScope: "per_month", portalAccessCount: 1, filesLimit: 20,
    filesMin: 5, filesMax: 50, filesStep: 5, ratePerFile: 0, slabs: [], updatesMin: 1, updatesMax: 4, allowOneTime: false,
    oneTimeValidityDays: 90, maxTenureMonths: 12, releaseMode: "all_at_once", customerCanChooseRelease: false, isHidden: true,
});
export function formFromPlan(plan) {
    const sp = plan.servicePlan || {};
    const base = blankPlanForm(sp.categoryKey || "");
    const billing = emptyBilling();
    (sp.billingOptions || []).forEach(option => { if (option.billingCycle in billing)
        billing[option.billingCycle] = { on: true, discountPercent: Number(option.discountPercent || 0) }; });
    return {
        ...base, planId: plan._id, expectedUpdatedAt: plan.updatedAt ?? null, serviceName: plan.serviceName, description: plan.description || "", isHidden: plan.isHidden,
        capability: sp.capability === "send_reminders" ? "send_reminders" : "upload_data",
        dependency: sp.dependency || base.dependency, timing: sp.timing || base.timing,
        pricingMode: sp.pricingMode === "flexible" ? "flexible" : "fixed",
        purchaseType: sp.purchaseType === "one_time" ? "one_time" : "recurring",
        oneTimePrice: sp.purchaseType === "one_time" ? plan.price : 0, monthlyReferencePrice: Number(sp.monthlyReferencePrice || 0), billing,
        limitScope: sp.limitScope || base.limitScope, portalAccessCount: Number(sp.portalAccessCount || 1), filesLimit: Number(sp.filesLimit || 20),
        filesMin: sp.files?.min ?? base.filesMin, filesMax: sp.files?.max ?? base.filesMax, filesStep: sp.files?.step ?? 1,
        ratePerFile: Number(sp.ratePerFile || 0), slabs: (sp.slabs || []).map(({ fromFile, ratePerFile }) => ({ fromFile, ratePerFile })),
        updatesMin: sp.updatesPerMonth?.min ?? base.updatesMin, updatesMax: sp.updatesPerMonth?.max ?? base.updatesMax, allowOneTime: Boolean(sp.allowOneTime),
        oneTimeValidityDays: Number(sp.oneTimeValidityDays || 90), maxTenureMonths: Number(sp.maxTenureMonths || 12),
        releaseMode: sp.releaseMode === "monthly" ? "monthly" : "all_at_once", customerCanChooseRelease: Boolean(sp.customerCanChooseRelease),
    };
}
/** The body the backend savePlan() reads (only the fields that apply to the chosen setup). */
export function planBody(form) {
    const billingOptions = BILLING_CYCLES.filter(({ key }) => form.billing[key].on).map(({ key }) => ({ billingCycle: key, discountPercent: Number(form.billing[key].discountPercent) || 0 }));
    const isUpload = form.capability === "upload_data";
    const flexible = isUpload && form.pricingMode === "flexible";
    const oneTimePossible = flexible ? form.allowOneTime : form.purchaseType === "one_time";
    const body = {
        serviceName: form.serviceName, description: form.description, categoryKey: form.categoryKey || undefined,
        capability: form.capability, dependency: form.dependency, timing: form.dependency === "standalone_only" ? undefined : form.timing,
        pricingMode: flexible ? "flexible" : "fixed", isHidden: form.isHidden,
        maxTenureMonths: form.maxTenureMonths, oneTimeValidityDays: oneTimePossible ? form.oneTimeValidityDays : undefined,
        releaseMode: form.releaseMode, customerCanChooseRelease: form.customerCanChooseRelease,
    };
    if (flexible) {
        Object.assign(body, {
            files: { min: form.filesMin, max: form.filesMax, step: form.filesStep }, ratePerFile: form.ratePerFile,
            slabs: form.slabs, updatesPerMonth: { min: form.updatesMin, max: form.updatesMax }, allowOneTime: form.allowOneTime, billingOptions,
        });
    }
    else {
        body.purchaseType = form.purchaseType;
        if (form.purchaseType === "one_time")
            body.oneTimePrice = form.oneTimePrice;
        else
            Object.assign(body, { monthlyReferencePrice: form.monthlyReferencePrice, billingOptions });
        if (isUpload)
            Object.assign(body, { limitScope: form.limitScope, portalAccessCount: form.limitScope === "unlimited" ? undefined : form.portalAccessCount, filesLimit: form.filesLimit });
    }
    return form.planId ? { ...body, planId: form.planId, expectedUpdatedAt: form.expectedUpdatedAt } : { ...body, creating: true };
}
export const rupees = (amount) => `₹${Math.round(amount).toLocaleString("en-IN")}`;
export function rangeText(range) {
    if (!range)
        return "Price not set";
    const amount = range.from === range.to ? rupees(range.from) : `${rupees(range.from)} – ${rupees(range.to)}`;
    return range.unit === "update" ? `${amount} per update` : range.unit === "month" ? `${amount} per month` : `${amount} one-time`;
}
export const planState = (plan) => plan.retired ? "Retired" : plan.isHidden ? "Hidden" : "On sale";
/** A permanent category key from its name: "Online Promotions" → "online_promotions". */
export const categoryKeyFrom = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 40);
