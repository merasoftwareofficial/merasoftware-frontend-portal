import { getResourceScope, subscribeResourceScope } from './resourceClient';

// Last answers for the screens that opt in. Memory only, because these rows hold names and
// phone numbers: a page refresh, logout or account change empties it.
export const FRESH_MS = 5 * 60 * 1000; // No server call while younger than this and nothing changed.
export const MAX_AGE_MS = 30 * 60 * 1000; // Never shown once older than this.
const MAX_ENTRIES = 50;

// Which live-feed domains can change each answer. Send message's block reads leads, clients and the
// WhatsApp queue, so any change in those re-checks every lead screen. A client's "Updated" reads tickets.
export const LEAD_CACHE = { domains: ['leads', 'users', 'communication'] };
export const CLIENT_CACHE = { domains: ['clients', 'users', 'leads', 'tickets'] };

// Only endpoints with audited, owner-scoped reads opt in. Policy identity stays stable
// across renders; URL and query parameters remain part of the cache key.
const CUSTOMER_POLICIES = {
  orders: { domains: ['orders', 'payments', 'invoices', 'updates', 'catalog', 'users'] },
  invoices: { domains: ['invoices', 'orders', 'payments', 'catalog'] },
  orderDetail: { domains: ['orders', 'payments', 'invoices', 'updates', 'catalog', 'users', 'uploads', 'offers'], confirmedOnly: true },
  invoiceDetail: { domains: ['invoices', 'orders', 'payments', 'catalog'], confirmedOnly: true },
  documents: { domains: ['documents', 'users', 'referrals'] },
  tickets: { domains: ['tickets', 'users'] },
  referrals: { domains: ['referrals', 'payments'] },
  uploads: { domains: ['uploads', 'updates', 'orders'] },
  walletHistory: { domains: ['wallet', 'payments', 'users', 'orders', 'catalog'] },
};
export function customerCachePolicy(scope, url) {
  let identity;
  try { identity = JSON.parse(scope); } catch { return undefined; }
  if (!Array.isArray(identity) || identity[1] !== 'customer') return undefined;
  const path = String(url || '').split('?')[0];
  if (/\/get-order$/.test(path)) return CUSTOMER_POLICIES.orders;
  if (/\/order-details\/[^/]+$/.test(path)) return CUSTOMER_POLICIES.orderDetail;
  if (/\/my-invoices$/.test(path)) {
    const query = new URLSearchParams(String(url).split('?')[1] || '');
    return query.has('invoiceId') || query.has('orderId') ? CUSTOMER_POLICIES.invoiceDetail : CUSTOMER_POLICIES.invoices;
  }
  if (/\/my-documents$/.test(path)) return CUSTOMER_POLICIES.documents;
  if (/\/(get-user-tickets|get-ticket-details\/[^/]+)$/.test(path)) return CUSTOMER_POLICIES.tickets;
  if (/\/my-referred-leads$/.test(path)) return CUSTOMER_POLICIES.referrals;
  if (/\/wallet\/history$/.test(path)) return CUSTOMER_POLICIES.walletHistory;
  if (/\/orders\/[^/]+\/uploads$/.test(path)) return CUSTOMER_POLICIES.uploads;
  return undefined;
}

const entries = new Map();
const reading = new Set();
let feedConnected = false;

export const cacheKey = (scope, url, paginated = false) => JSON.stringify([scope, url, paginated]);

subscribeResourceScope(() => { entries.clear(); reading.clear(); feedConnected = false; });

export function setFeedConnected(value) { feedConnected = value; }
export const isFeedConnected = () => feedConnected;

// The feed was not listening for a while, so any answer may have missed a change.
export function markAllStale() {
  for (const entry of entries.values()) entry.stale = true;
  for (const read of reading) read.stale = true;
}

export function noteChanges(resources) {
  const changed = new Set((resources || []).map(item => item.domain));
  const hits = domains => domains.some(domain => changed.has(domain));
  for (const entry of entries.values()) if (hits(entry.domains)) entry.stale = true;
  for (const read of reading) if (hits(read.domains)) read.stale = true;
}

export function readCache(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age >= MAX_AGE_MS) { entries.delete(key); return null; }
  // A silent feed proves nothing while it is down, so `fresh` needs a live connection.
  return { data: entry.data, fresh: !entry.stale && feedConnected && age < FRESH_MS };
}

export const cacheAge = key => (entries.has(key) ? Date.now() - entries.get(key).at : null);

// A change that arrives during a read may not be in its answer: that answer is stored as stale.
export function beginCacheRead(policy) {
  const read = { domains: policy.domains, stale: false };
  reading.add(read);
  return read;
}
export function endCacheRead(read) { reading.delete(read); }

export function storeCache(key, data, policy, read) {
  entries.delete(key);
  entries.set(key, { data, at: Date.now(), stale: Boolean(read?.stale) || !feedConnected, domains: policy.domains });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export function removeCache(key) { entries.delete(key); }

// A saved lead's row shows its new values on return; the list still re-checks because the feed marked it stale.
export function patchCachedRow(url, id, fields) {
  const entry = entries.get(cacheKey(getResourceScope(), url));
  if (!entry || !Array.isArray(entry.data)) return;
  entry.data = entry.data.map(row => (String(row._id) === String(id) ? { ...row, ...fields } : row));
}
