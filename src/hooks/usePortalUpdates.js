import { useEffect, useRef, useState } from 'react';
import { subscribeResourceScope } from '../utils/resourceClient';
import { markAllStale, noteChanges, setFeedConnected } from '../utils/resourceCache';

// One transport per visible tab for every migrated domain. Queues hold only
// invalidation identifiers and are cleared on identity changes/disconnect.
const subscribers = new Set();
let source, timer, reconnectTimer, reconcile = false;
const resources = new Map();
let connectionStatus = 'connecting';
function status(value) { connectionStatus = value; for (const listener of subscribers) listener.status(value); }
function reset() {
  setFeedConnected(false);
  source?.close(); source = null;
  clearTimeout(timer); timer = null; clearTimeout(reconnectTimer); reconnectTimer = null;
  resources.clear(); reconcile = false;
}
function schedule(message) {
  if (message.type === 'ready' || message.type === 'resync') markAllStale(); else noteChanges(message.resources);
  reconcile ||= message.type === 'ready' || message.type === 'resync';
  for (const entry of message.resources || (message.type === 'changed' ? [{ domain: 'leads', ids: message.ids || [], all: message.all }] : [])) {
    const previous = resources.get(entry.domain) || { ids: new Set(), all: false };
    previous.all ||= entry.all;
    for (const id of entry.ids || []) { if (previous.ids.size < 200) previous.ids.add(id); else previous.all = true; }
    resources.set(entry.domain, previous);
  }
  if (document.visibilityState !== 'visible' || timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const listener of subscribers) {
      if (reconcile || listener.domains.some(domain => {
        const change = resources.get(domain);
        return change && (!listener.id || change.all || change.ids.has(listener.id));
      })) listener.update();
    }
    resources.clear(); reconcile = false;
  }, 200);
}
function connect() {
  if (source || !subscribers.size || document.visibilityState !== 'visible') return;
  if (typeof EventSource === 'undefined') { status('unavailable'); return; }
  const current = new EventSource(`${process.env.REACT_APP_BACKEND_URL}/api/portal-updates`, { withCredentials: true });
  source = current;
  current.onmessage = event => {
    if (source !== current) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'denied') { reset(); status('unavailable'); window.dispatchEvent(new Event('portal-session-check')); return; }
    if (message.type === 'unavailable') { retry(); return; }
    if (message.type === 'ready') { setFeedConnected(true); status('connected'); }
    schedule(message);
  };
  current.onerror = () => { if (source === current) retry(); };
}
function retry() {
  setFeedConnected(false);
  source?.close(); source = null; status('unavailable');
  if (!reconnectTimer && subscribers.size) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 5000);
}
function visible() {
  if (document.visibilityState !== 'visible') { reset(); return; }
  connect(); // ready reconciles subscription gaps after visibility/reconnect.
}
subscribeResourceScope(() => { reset(); status('connecting'); connect(); });

export function usePortalUpdates(onUpdate, domains = [], id) {
  const callback = useRef(onUpdate); callback.current = onUpdate;
  const [liveStatus, setLiveStatus] = useState(connectionStatus);
  const domainKey = JSON.stringify(domains);
  useEffect(() => {
    const selected = JSON.parse(domainKey);
    if (!selected.length) return;
    const listener = { status: setLiveStatus, domains: selected, id: id ? String(id) : null, update: () => callback.current() };
    subscribers.add(listener); setLiveStatus(connectionStatus);
    if (subscribers.size === 1) { document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible); }
    connect();
    return () => {
      subscribers.delete(listener);
      if (!subscribers.size) { reset(); connectionStatus = 'connecting'; document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); }
    };
  }, [domainKey, id]);
  return liveStatus;
}

// URL inventory for the shared hook. Explicit component consumers can subscribe
// to multiple domains; unknown endpoints keep their existing refresh behavior.
export function resourceDomains(url) {
  const path = String(url || '').split('?')[0];
  if (/\/admin\/clients\/[^/]+\/upload-links$/.test(path)) return ['upload-links', 'users', 'orders'];
  if (/\/admin\/clients$/.test(path)) return ['clients', 'users', 'leads', 'tickets'];
  if (/\/admin\/dashboard-summary$/.test(path)) return ['clients', 'users', 'leads'];
  if (/\/user-details$/.test(path)) return ['users'];
  if (/\/payment-records\//.test(path)) return ['invoices', 'payments', 'orders'];
  if (/\/credentials$/.test(path)) return ['users'];
  if (/\/documents$/.test(path)) return ['documents', 'users', 'leads'];
  if (/\/admin\/my-settings$/.test(path)) return ['users'];
  if (/\/get-user-tickets$|\/get-ticket-details\//.test(path)) return ['tickets'];
  if (/\/admin\/user-workspace$/.test(path)) return ['users', 'orders', 'payments', 'invoices', 'updates', 'offers'];
  if (/\/uploads$/.test(path)) return ['uploads', 'updates', 'orders'];
  if (/\/my-documents$/.test(path)) return ['documents', 'users', 'uploads'];
  if (/\/admin\/trash$/.test(path)) return ['leads', 'users', 'orders', 'catalog'];
  if (/\/admin\/settings$/.test(path)) return ['settings'];
  if (/\/my-invoices$/.test(path)) return ['invoices'];
  if (/\/(get-order|orders-list|order-list|order-details\/[^/]+)$/.test(path)) return ['orders', 'payments', 'invoices', 'updates'];
  if (/\/wallet\/history$/.test(path)) return ['wallet', 'payments', 'users'];
  if (/\/(category-base-prices|project-categories|service-plan-catalogue|plan-catalogue|service-plans|plan-products|feature-products)$/.test(path)) return ['catalog'];
  if (/\/offer-reservations$/.test(path)) return ['offers'];
  if (/\/my-referred-leads$/.test(path)) return ['referrals'];
  return [];
}
