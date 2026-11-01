import { useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

// Shareable list state, never form drafts or server datasets. A ref merges
// multiple updates in one event because Router search setters do not queue them.
export function useListState(defaults) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pending = useRef({ search: location.search, params });
  if (pending.current.search !== location.search) pending.current = { search: location.search, params };
  const values = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const raw = params.get(key);
    values[key] = raw === null ? fallback : typeof fallback === 'number'
      ? (/^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : fallback)
      : typeof fallback === 'boolean' ? raw === '1' : raw;
  }
  const update = patch => {
    const next = new URLSearchParams(pending.current.params);
    for (const [key, value] of Object.entries(patch)) {
      const resolved = typeof value === 'function' ? value(values[key]) : value;
      if (resolved === defaults[key] || resolved === '' || resolved === null) next.delete(key);
      else next.set(key, typeof resolved === 'boolean' ? (resolved ? '1' : '0') : String(resolved));
    }
    pending.current.params = next;
    setParams(next, { replace: true, state: location.state, preventScrollReset: true });
  };
  return [values, update];
}
