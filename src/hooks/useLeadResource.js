import { useCallback, useEffect, useRef, useState } from 'react';

// One pending GET per mounted resource. No stored response/cache. A notification
// during a read schedules one follow-up read, so it cannot be lost or race it.
export function useLeadResource(url, onData) {
  const callback = useRef(onData); callback.current = onData;
  const state = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback((background = true) => {
    const current = state.current;
    if (!current || current.url !== url) return Promise.resolve();
    if (current.pending) { current.again = true; return current.pending; }
    const run = async () => {
      if (!background) setLoading(true);
      try {
        do {
          current.again = false;
          const response = await fetch(url, { credentials: 'include', signal: current.controller.signal });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || 'Could not refresh leads.');
          if (state.current !== current || current.controller.signal.aborted) return;
          callback.current(result.data, !current.loaded);
          current.loaded = true; setError('');
        } while (current.again && state.current === current);
      } catch (failure) {
        if (state.current === current && !current.controller.signal.aborted) setError(failure.message || 'Could not refresh leads.');
      } finally {
        if (state.current === current) { current.pending = null; setLoading(false); }
      }
    };
    current.pending = run();
    return current.pending;
  }, [url]);
  useEffect(() => {
    const current = { url, controller: new AbortController(), pending: null, loaded: false, again: false };
    state.current = current; setError('');
    void refresh(false);
    return () => { state.current = null; current.controller.abort(); };
  }, [url, refresh]);
  return { refresh, loading, error };
}
