import { createPendingReads } from './pendingReads';

const reads = createPendingReads();
let scope = 'anonymous';
const listeners = new Set();
export const getResourceScope = () => scope;
export const subscribeResourceScope = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function setResourceIdentity(user) {
  const next = user?._id ? JSON.stringify([String(user._id), user.role || '', [...(user.roles || [])].sort()]) : 'anonymous';
  if (next === scope) return;
  scope = next;
  reads.setScope(next);
  for (const listener of listeners) listener();
}

// GET only: callers retain mutation/review ordering and explicit retry ownership.
export function readResource(url, { signal, method = 'GET', headers, ...options } = {}) {
  if (method.toUpperCase() !== 'GET') throw new Error('Resource reads must use GET');
  const headerEntries = (headers ? [...new Headers(headers).entries()] : []).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([scope, String(url), headerEntries, options]);
  return reads.read(key, async transportSignal => {
    const response = await fetch(url, { credentials: 'include', ...options, method: 'GET', headers, signal: transportSignal });
    const result = await response.json();
    if (!response.ok || !result.success) throw Object.assign(new Error(result.message || `Could not load data (${response.status})`), { status: response.status });
    return result.data;
  }, { signal });
}

export function cancelResourceReads() { reads.cancelAll(); }
