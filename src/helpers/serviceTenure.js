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
// A range shows only its lowest price ("From ₹500 / update"), never the top of the range.
const RANGE_UNITS = { update: '/ update', month: '/ month', one_time: 'one-time' };
export const priceRangeText = (range) => {
  if (!range || !(Number(range.from) > 0)) return '';
  const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
  const amount = Number(range.to) > Number(range.from) ? `From ${money(range.from)}` : money(range.from);
  return `${amount} ${RANGE_UNITS[range.unit] || ''}`.trim();
};

// Monthly release is offered only when the admin lets the customer choose and the period is
// longer than one month (backend servicePlanAdmin.js setReleaseMode has the same rule).
export const canChooseRelease = (plan, cycleMonths) =>
  Boolean(plan?.servicePlan?.customerCanChooseRelease) && Number(cycleMonths) > 1;

// The exact quote/purchase body for a choice: only the parts this plan and purchase use. The builder
// and the checkout page (pages/PlanCheckout.js) both send this, so they can never ask different prices.
export const planChoiceBody = (plan, { purchase, tenureMonths, files, updates, releaseMode }) => {
  if (!purchase) return null;
  const flexible = isFlexiblePlan(plan);
  return {
    purchase,
    tenureMonths: purchase === 'one_time' ? undefined : tenureMonths,
    files: flexible ? files : undefined,
    updates: flexible ? updates : undefined,
    releaseMode: canChooseRelease(plan, BILLING_CYCLE_MONTHS[purchase]) ? releaseMode : undefined,
  };
};

// A choice body as a page address query, with the same keys the website's "Get this plan" sends
// (merasoftware/src/lib/public-plans.ts choiceQuery) and initialPlanChoice() reads back.
export const planChoiceQuery = (body) => {
  const query = new URLSearchParams({ purchase: body.purchase });
  if (body.tenureMonths) query.set('months', String(body.tenureMonths));
  if (body.files) query.set('files', String(body.files));
  if (body.updates) query.set('updates', String(body.updates));
  if (body.releaseMode) query.set('release', body.releaseMode);
  return query.toString();
};

// The builder's starting choice from a page address (?purchase=&months=&files=&updates=&release=,
// sent by the website's "Get this plan", merasoftware/src/lib/public-plans.ts choiceQuery). Each
// part is kept only when this plan offers it; anything else falls back to the builder's default.
// Same rules as the website's initialChoice(). The backend quote still checks the final choice.
export const initialPlanChoice = (plan, search) => {
  const query = new URLSearchParams(search || '');
  const purchases = purchaseOptions(plan);
  if (!purchases.length) return null;
  const purchase = purchases.find((option) => option.value === query.get('purchase')) || purchases[0];
  const number = (key) => (/^\d+$/.test(query.get(key) || '') ? Number(query.get(key)) : null);
  const months = number('months');
  const files = fileChoices(plan);
  const fileCount = number('files');
  const updates = updateChoices(plan);
  const release = query.get('release');
  return {
    purchase: purchase.value,
    tenureMonths: buildTenureOptions(plan, purchase.months).some((option) => option.months === months) ? months : purchase.months,
    files: fileCount !== null && fileCount >= files.min && fileCount <= files.max && (fileCount - files.min) % files.step === 0 ? fileCount : files.min || null,
    updates: updates.includes(number('updates')) ? number('updates') : updates[0] || null,
    releaseMode: canChooseRelease(plan, purchase.months) && ['all_at_once', 'monthly'].includes(release)
      ? release : plan?.servicePlan?.releaseMode || 'all_at_once',
  };
};
