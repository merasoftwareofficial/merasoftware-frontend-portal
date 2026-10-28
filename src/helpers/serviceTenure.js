// SSOT (portal side) for what a customer may choose when buying a service plan: how to buy it
// (one-time or a billing period), for how long, and — on a flexible plan — files and updates.
//
// It only lists choices the plan itself offers; it never works out a price. The price, and the
// final check of every choice, is the backend quote (POST /api/customer/service-plan-quote,
// helpers/servicePlanPricing.js quoteServicePlan()), and the purchase re-checks it again.
//
// Both purchase surfaces — the plan builder on the standalone service page and the compact one
// in the in-project Add-a-Service modal (components/PlanBuilder.js) — read from here, so the two
// can never offer different choices.

export const BILLING_CYCLE_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export const PURCHASE_LABELS = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: '6 months',
  yearly: 'Yearly',
};

// When the plan does not set its own maximum, the backend allows 12 months (servicePlanPricing.js
// MAX_TENURE_MONTHS); the plan's own maxTenureMonths is never more than that.
const DEFAULT_MAX_TENURE_MONTHS = 12;

export const isFlexiblePlan = (plan) => plan?.servicePlan?.pricingMode === 'flexible';

export const maxTenureMonths = (plan) =>
  Math.min(Number(plan?.servicePlan?.maxTenureMonths) || DEFAULT_MAX_TENURE_MONTHS, DEFAULT_MAX_TENURE_MONTHS);

// The ways this plan can be bought, in display order, each with its period discount.
export const purchaseOptions = (plan) => {
  const sp = plan?.servicePlan || {};
  const options = [];
  const oneTime = isFlexiblePlan(plan) ? Boolean(sp.allowOneTime) : sp.purchaseType === 'one_time';
  if (oneTime) options.push({ value: 'one_time', label: PURCHASE_LABELS.one_time, months: null, discountPercent: 0 });
  if (sp.purchaseType !== 'one_time' || isFlexiblePlan(plan)) {
    (sp.billingOptions || [])
      .filter((option) => BILLING_CYCLE_MONTHS[option.billingCycle] && BILLING_CYCLE_MONTHS[option.billingCycle] <= maxTenureMonths(plan))
      .sort((a, b) => BILLING_CYCLE_MONTHS[a.billingCycle] - BILLING_CYCLE_MONTHS[b.billingCycle])
      .forEach((option) => options.push({
        value: option.billingCycle,
        label: PURCHASE_LABELS[option.billingCycle],
        months: BILLING_CYCLE_MONTHS[option.billingCycle],
        discountPercent: Number(option.discountPercent) || 0,
      }));
  }
  return options;
};

// Every whole multiple of the billing period, up to the plan's own maximum length.
export const buildTenureOptions = (plan, cycleMonths) => {
  const cycle = Number(cycleMonths);
  const max = maxTenureMonths(plan);
  if (!cycle || cycle > max) return [];
  const options = [];
  for (let months = cycle; months <= max; months += cycle) {
    options.push({ months, label: months === 12 ? '1 year' : `${months} month${months === 1 ? '' : 's'}` });
  }
  return options;
};

// Files per update a flexible plan offers (min … max in its own step).
export const fileChoices = (plan) => {
  const files = plan?.servicePlan?.files || {};
  const min = Number(files.min) || 0;
  const max = Number(files.max) || 0;
  const step = Number(files.step) || 1;
  return { min, max, step };
};

export const updateChoices = (plan) => {
  const range = plan?.servicePlan?.updatesPerMonth || {};
  const min = Number(range.min) || 1;
  const max = Math.max(min, Number(range.max) || min);
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
};

// A plan card's price, from the backend's priceRange (GET /api/get-product). Display only.
const RANGE_UNITS = { update: '/ update', month: '/ month', one_time: 'one-time' };
export const priceRangeText = (range) => {
  if (!range || !(Number(range.from) > 0)) return '';
  const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
  const amount = Number(range.to) > Number(range.from) ? `${money(range.from)} – ${money(range.to)}` : money(range.from);
  return `${amount} ${RANGE_UNITS[range.unit] || ''}`.trim();
};

// Monthly release is offered only when the admin lets the customer choose and the period is
// longer than one month (backend servicePlanAdmin.js setReleaseMode has the same rule).
export const canChooseRelease = (plan, cycleMonths) =>
  Boolean(plan?.servicePlan?.customerCanChooseRelease) && Number(cycleMonths) > 1;
