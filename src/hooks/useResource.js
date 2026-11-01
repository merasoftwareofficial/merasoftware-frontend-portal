import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { resourceDomains, usePortalUpdates } from './usePortalUpdates';
import { getResourceScope, readResource, subscribeResourceScope } from '../utils/resourceClient';
import { MAX_AGE_MS, beginCacheRead, cacheAge, cacheKey, endCacheRead, isFeedConnected, readCache, removeCache, storeCache } from '../utils/resourceCache';

function cursorUrl(url, cursor) {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('cursor', cursor);
  return `${path}?${params}`;
}
function mergeItems(...pages) {
  const seen = new Set();
  return pages.flatMap(page => page.items || []).filter(item => {
    const id = item._id || item.id;
    if (!id) return true;
    if (seen.has(String(id))) return false;
    seen.add(String(id)); return true;
  });
}

// Background invalidations preserve visible data and coalesce into one trailing read.
// With `cache` (a policy from resourceCache.js, not for paginated reads) the last answer shows at
// once and is re-read only if it may be out of date. `confirmed` is true once the data on screen
// is known current: anything that decides an action waits for it. Without `cache` nothing is kept.
export function useResource(url, onData, { revision, paginated = false, eventId, cache } = {}) {
  const scope = useSyncExternalStore(subscribeResourceScope, getResourceScope);
  const callback = useRef(onData); callback.current = onData;
  const state = useRef(null);
  // Navigation metadata only: a hidden tab can restore its loaded page count
  // while re-reading the window. No responses are retained by this ref.
  const paginationWindow = useRef(null);
  const previousRevision = useRef(revision);
  const [snapshot, setSnapshot] = useState({ key: null, data: undefined });
  const [loading, setLoading] = useState(Boolean(url));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [expired, setExpired] = useState(false);
  const key = cacheKey(scope, url, paginated);
  const request = useCallback((background = true, append = false) => {
    const current = state.current;
    if (!current || current.key !== key || !url) return Promise.resolve();
    if (current.pending) { if (!append) current.again = true; return current.pending; }
    if (append && (!paginated || !current.result?.nextCursor)) return Promise.resolve();
    const run = async () => {
      if (!background && !current.loaded) setLoading(true);
      setRefreshing((current.loaded || current.cached) && !append); setLoadingMore(append);
      try {
        do {
          current.again = false;
          const cacheRead = cache ? beginCacheRead(cache) : null;
          try {
            let data, depth = 1;
            if (!paginated) data = await readResource(url, { signal: current.controller.signal });
            else if (append) {
              const page = await readResource(cursorUrl(url, current.result.nextCursor), { signal: current.controller.signal });
              data = { ...page, items: mergeItems(current.result, page) };
              depth = current.depth + 1;
            } else {
              const pages = [await readResource(url, { signal: current.controller.signal })];
              const cursors = new Set();
              // Reconcile the loaded window from fresh cursors, never append an old
              // cursor to a changed first page after another admin inserts/deletes.
              while (pages.length < current.depth && pages[pages.length - 1].nextCursor) {
                const cursor = pages[pages.length - 1].nextCursor;
                if (cursors.has(cursor)) throw new Error('Repeated page cursor. Refresh to retry.');
                cursors.add(cursor);
                pages.push(await readResource(cursorUrl(url, cursor), { signal: current.controller.signal }));
              }
              depth = pages.length;
              data = { ...pages[pages.length - 1], items: mergeItems(...pages) };
            }
            if (state.current !== current || current.controller.signal.aborted || getResourceScope() !== scope) return;
            if (cache) storeCache(key, data, cache, cacheRead);
            callback.current?.(data, !current.loaded);
            setSnapshot({ key, data }); setConfirmed(true); setExpired(false);
            current.result = data; current.depth = depth;
            if (paginated) paginationWindow.current = { key, depth };
            current.loaded = true; setError(''); setLoading(false);
            append = false; setLoadingMore(false); setRefreshing(current.again);
          } catch (failure) {
            if (state.current !== current || current.controller.signal.aborted || failure.name === 'AbortError') return;
            // It no longer exists: the kept answer must not stand in for it.
            if (cache && failure.status === 404) { removeCache(key); setConfirmed(false); callback.current?.(null, true); setSnapshot({ key, data: undefined }); }
            setError(failure.message || 'Could not refresh data.');
            // Honor an actual invalidation received during a failed page read.
            // No automatic network retry without that explicit pending signal.
            append = false; setLoadingMore(false); setRefreshing(current.again && current.loaded);
          } finally {
            if (cacheRead) endCacheRead(cacheRead);
          }
        } while (current.again && state.current === current);
      } finally {
        if (state.current === current) { current.pending = null; setLoading(false); setRefreshing(false); setLoadingMore(false); }
      }
    };
    current.pending = run();
    return current.pending;
  }, [key, url, scope, paginated, cache]);
  const refresh = useCallback((background = true) => request(background), [request]);
  const loadMore = useCallback(() => request(true, true), [request]);
  // A layout effect, so kept data is on screen before the first paint: no flash of an empty list.
  useLayoutEffect(() => {
    const depth = paginated && paginationWindow.current?.key === key ? paginationWindow.current.depth : 1;
    const current = { key, controller: new AbortController(), pending: null, loaded: false, again: false, depth, result: null };
    state.current = current; setError(''); setLoading(Boolean(url)); setRefreshing(false); setLoadingMore(false); setConfirmed(false); setExpired(false);
    const kept = cache && url ? readCache(key) : null;
    if (kept) {
      callback.current?.(kept.data, true);
      setSnapshot({ key, data: kept.data }); setLoading(false); setConfirmed(kept.fresh);
      current.result = kept.data;
      if (kept.fresh) current.loaded = true;
      else { current.cached = true; void refresh(true); }
    } else if (url) void refresh(false);
    return () => { state.current = null; current.controller.abort(); };
  }, [key, url, refresh, paginated, cache]);
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    void refresh();
  }, [revision, refresh]);
  // A screen left open: data past the limit is hidden until the new read, and a dead feed can't be trusted.
  useEffect(() => {
    if (!cache) return undefined;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const age = cacheAge(key);
      if (age === null) return;
      if (age >= MAX_AGE_MS) { setExpired(true); void refresh(); } else if (!isFeedConnected()) void refresh();
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, [cache, key, refresh]);
  const liveStatus = usePortalUpdates(refresh, resourceDomains(url), eventId);
  return { liveStatus, data: snapshot.key === key ? snapshot.data : undefined, refresh, loadMore, loading: loading || (expired && !error), refreshing, loadingMore, error, confirmed, expired };
}
