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

const call = async (spec, { body, signal, fallback }) => {
  const response = await fetch(spec.url, {
    method: spec.method,
    credentials: 'include',
    signal,
    ...(body?.json ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.json) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw Object.assign(new Error(result.message || fallback), { status: response.status });
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
export const requestPackageBuy = (packageId, choice, contact) => call(SummaryApi.packageStartRequest, {
  body: { json: { packageId, choice, kind: 'buy', ...contact } }, fallback: 'Could not start your purchase. Please try again.',
});

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
