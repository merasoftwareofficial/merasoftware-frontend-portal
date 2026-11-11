import SummaryApi from '../common';

// Get a Service → Start a Project (pages/StartProjectRequest.js, pages/StartProjectPackage.js): the
// portal's own screens for the website's packages. Every rule and every price is the backend's
// (backend helpers/packagePurchase.js, helpers/salesPackages.js): the list, the price of a choice and
// the purchase all read one quote, so nothing here works out a price. This file only calls the backend.

export const PACKAGES_PATH = '/start-new-project/project';
export const CALLBACK_PATH = `${PACKAGES_PATH}/call-back`;
export const packagePath = (packageId) => `${PACKAGES_PATH}/package/${encodeURIComponent(packageId)}`;

// How a one-time package can be paid (the backend's payment options, backend helpers/projectInstallments.js).
export const PAYMENT_OPTION_WORDS = {
  full: { title: 'Full payment', detail: 'Pay once' },
  installments_2: { title: '2 installments', detail: '50% + 50%' },
  installments_3: { title: '3 installments', detail: '30% + 30% + 40%' },
};

// A monthly package (backend helpers/packagePlanOrder.js) runs as a plan: the client picks a billing period and a
// length from the package's own settings; the backend quote prices the choice (servicePlanPricing.js).
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
export const CYCLE_WORDS = { monthly: 'Monthly', quarterly: 'Every 3 months', half_yearly: 'Every 6 months', yearly: 'Yearly' };
export const monthlyCycles = (item) => (item?.monthly?.billingOptions || [])
  .filter((option) => CYCLE_MONTHS[option.billingCycle] <= Math.min(item.monthly.maxTenureMonths || 12, 12))
  .sort((a, b) => CYCLE_MONTHS[a.billingCycle] - CYCLE_MONTHS[b.billingCycle]);
export const monthlyLengths = (item, cycle) => {
  const step = CYCLE_MONTHS[cycle] || 0;
  const max = Math.min(item?.monthly?.maxTenureMonths || 12, 12);
  const out = [];
  for (let months = step; step && months <= max; months += step) out.push(months);
  return out;
};
export const monthlyGets = (item) => (!item?.portalUploads ? 'Progress updates from our team'
  : item.monthly?.uploadsPerMonth ? `${item.monthly.uploadsPerMonth} update${item.monthly.uploadsPerMonth === 1 ? '' : 's'} a month in your portal` : 'Unlimited updates in your portal');
// A bought package's page: a monthly package is a plan (its plan page), a one-time package a project.
export const orderPath = (orderId, plan = false) => `/${plan ? 'plan-details' : 'project-details'}/${orderId}`;

const call = async (spec, { body, signal, fallback }) => {
  const response = await fetch(spec.url, {
    method: spec.method,
    credentials: 'include',
    signal,
    ...(body?.json ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.json) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  // `code`/`details`: what the page should ask next (package_already_bought carries the running project).
  if (!response.ok || !result.success) throw Object.assign(new Error(result.message || fallback), { status: response.status, code: result.code, details: result.details });
  return result.data;
};

// { enabled, packages }: empty while the package system is off, so the portal shows only its call-back form.
export const readPackageCatalogue = (signal) => call(SummaryApi.packageCatalogue, { signal, fallback: 'Could not load the packages.' });

// The backend's quote of one choice: price, what is due now, the installments and the quoteKey the purchase must carry.
export const readPackageQuote = (packageId, choice, signal) => call(SummaryApi.packageQuote, {
  signal, body: { json: { packageId, choice } }, fallback: 'The price could not be worked out right now.',
});

// { walletBalance, upiId, payeeName }: what the payment step shows.
export const readPackagePaymentInfo = (signal) => call(SummaryApi.packagePaymentInfo, { signal, fallback: 'Could not load your payment details.' });

// "Proceed to pay" first tells the team the client started buying (as the website does); the purchase follows.
// `contact` ({ countryCode, phone }) is sent only for an account that has no mobile number yet (the backend asks with HTTP 428).
// `confirmRepeat`: the client said yes to a second purchase of a package they already bought (owner decision 11 Nov 2026).
export const requestPackageBuy = (packageId, choice, contact, confirmRepeat = false) => call(SummaryApi.packageStartRequest, {
  body: { json: { packageId, choice, kind: 'buy', ...contact, ...(confirmRepeat ? { confirmRepeat: true } : {}) } }, fallback: 'Could not start your purchase. Please try again.',
});
export const ALREADY_BOUGHT = 'package_already_bought';

export const purchasePackage = (body) => call(SummaryApi.packagePurchase, { body: { json: body }, fallback: 'The payment could not be completed.' });

// Country codes the backend accepts for a phone number (the same list its check uses). India alone if it cannot load.
export const readPhoneCountries = async (signal) => {
  const response = await fetch(SummaryApi.phoneCountries.url, { signal });
  const result = await response.json().catch(() => ({}));
  return result.success && result.data?.length ? result.data : [{ code: '+91', label: 'India', digits: 10 }];
};

// "2d 23h 58m 59s" until an offer ends: the website's wording (merasoftware src/components/campaign/package-card.tsx timeLeft).
const pad = (value) => String(value).padStart(2, '0');
export const timeLeft = (endsAt, now) => {
  const seconds = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ''}${pad(Math.floor(seconds / 3600) % 24)}h ${pad(Math.floor(seconds / 60) % 60)}m ${pad(seconds % 60)}s`;
};
// True once a listed offer has run out on the server clock: the list is then asked for again, so it shows the real price.
export const offerEnded = (offer, now) => Boolean(offer) && now !== null && Date.parse(offer.endsAt) <= now;
