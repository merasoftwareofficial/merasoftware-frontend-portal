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
export const requestPackageBuy = (packageId, choice) => call(SummaryApi.packageStartRequest, {
  body: { json: { packageId, choice, kind: 'buy' } }, fallback: 'Could not start your purchase. Please try again.',
});

export const purchasePackage = (body) => call(SummaryApi.packagePurchase, { body: { json: body }, fallback: 'The payment could not be completed.' });
