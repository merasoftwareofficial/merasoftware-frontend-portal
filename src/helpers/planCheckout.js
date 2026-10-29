import { planChoiceQuery } from './serviceTenure';

// The plan checkout page's rules (pages/PlanCheckout.js; merasoftware/src/docs/plan.md §4): its
// addresses, where the client goes back to, the shown wallet/UPI split and the purchase key.
// Nothing here decides money: the backend re-prices the plan and re-splits the payment itself.

export const CHECKOUT_ORIGINS = ['website', 'portal'];

// Where the client came from, read from the page address. Only these two words are understood;
// anything else is the portal. The website's address itself comes from helpers/brand.js, never the URL.
export const checkoutOrigin = (search) => {
  const from = new URLSearchParams(search || '').get('from');
  return CHECKOUT_ORIGINS.includes(from) ? from : 'portal';
};

// The checkout page for a choice body (as made by serviceTenure.js planChoiceBody).
export const checkoutPath = (planId, body, from) => `/checkout/${planId}?${planChoiceQuery(body)}&from=${from}`;

// "Change": back to where this choice was made, with the same choice.
export const checkoutChangeHref = (planId, body, from, websiteUrl) => (from === 'website'
  ? `${websiteUrl}/plans/${planId}?${planChoiceQuery(body)}`
  : `/service-plan-detail/${planId}?${planChoiceQuery(body)}`);

// The result page after paying; it keeps the origin so a reload still knows the way back.
export const checkoutDonePath = (orderId, from) => `/checkout/done/${orderId}?from=${from}`;

// Where the result page sends the client: automatically (`next`) and by its two buttons.
// A client from the website returns to My purchases there, with the new plan marked; one from the
// portal goes to the plan's own page. `external` addresses leave the portal app.
export const checkoutNextSteps = (orderId, from, websiteUrl) => {
  const plan = { label: 'View my plan →', href: `/plan-details/${orderId}`, external: false };
  if (from === 'website') {
    const purchases = { label: 'Back to website', href: `${websiteUrl}/account/purchases?new=${orderId}`, external: true };
    return { next: { ...purchases, place: 'your purchases on our website' }, primary: plan, secondary: purchases };
  }
  return {
    next: { ...plan, place: 'your plan' },
    primary: plan,
    secondary: { label: 'Back to services', href: '/start-new-project/services?tab=services', external: false },
  };
};

// The split shown before paying: the wallet is the client's own money and is used first; only the
// remainder needs UPI. The backend decides the real split again from the real balance.
export const paymentSplit = (price, walletBalance) => {
  const total = Math.max(0, Number(price) || 0);
  const wallet = Math.min(Math.max(0, Number(walletBalance) || 0), total);
  return { total, wallet, upi: total - wallet };
};

// UTR / UPI reference: 12 digits or more, digits only (same rule as every portal payment form).
export const isUpiReference = (value) => /^\d{12,}$/.test(String(value || '').trim());

// One purchase attempt = one key (backend customerCreateServicePlanOrder.js): kept for this tab and
// this exact choice and offer, so a reload or a second click can never charge twice. Forgotten after
// a successful purchase. Without storage (private mode) it still holds for the page's lifetime.
const KEY_PREFIX = 'plan-checkout-key:';
// sessionStorage can be missing or blocked (private mode, sandboxed frames): then there is none.
const tabStorage = () => { try { return window.sessionStorage; } catch { return null; } };
export const purchaseKeyFor = (scope, storage = tabStorage()) => {
  const name = KEY_PREFIX + scope;
  try {
    const saved = storage?.getItem(name);
    if (saved && /^[a-f\d-]{36}$/i.test(saved)) return saved;
  } catch { /* storage blocked: use a fresh key below */ }
  const key = crypto.randomUUID();
  try { storage?.setItem(name, key); } catch { /* storage blocked */ }
  return key;
};
export const forgetPurchaseKey = (scope, storage = tabStorage()) => {
  try { storage?.removeItem(KEY_PREFIX + scope); } catch { /* storage blocked */ }
};

// What the result page says for the order's real state (backend orderStatusEngine.js codes).
export const checkoutResult = (order) => {
  const code = order?.orderState?.code;
  if (code === 'plan_active') return { tone: 'success', title: 'Your plan is active', text: 'You can send your data from your plan page.', redirect: true };
  if (code === 'pending_approval') return { tone: 'pending', title: 'Payment submitted', text: 'We are checking your payment and will let you know when it is approved. You can send your data after that.', redirect: true };
  if (code === 'rejected') return { tone: 'error', title: 'Payment not approved', text: order?.rejectionReason ? `Reason: ${order.rejectionReason}. To get this plan, please buy it again.` : 'To get this plan, please buy it again.', redirect: false };
  return { tone: 'neutral', title: order?.orderState?.label || 'Processing', text: 'Open your plan to see where it stands.', redirect: false };
};
