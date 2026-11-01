import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { resourceDomains, usePortalUpdates } from './usePortalUpdates';
import { getResourceScope, readResource, subscribeResourceScope } from '../utils/resourceClient';

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

// Background invalidations preserve visible data and coalesce into one trailing
// read. Completed data belongs to mounted UI, never to a response cache.
export function useResource(url, onData, { revision, paginated = false, eventId } = {}) {
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
  const key = JSON.stringify([scope, url, paginated]);
  const request = useCallback((background = true, append = false) => {
    const current = state.current;
    if (!current || current.key !== key || !url) return Promise.resolve();
    if (current.pending) { if (!append) current.again = true; return current.pending; }
    if (append && (!paginated || !current.result?.nextCursor)) return Promise.resolve();
    const run = async () => {
      if (!background && !current.loaded) setLoading(true);
      setRefreshing(current.loaded && !append); setLoadingMore(append);
      try {
        do {
          current.again = false;
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
            callback.current?.(data, !current.loaded);
            setSnapshot({ key, data });
            current.result = data; current.depth = depth;
            if (paginated) paginationWindow.current = { key, depth };
            current.loaded = true; setError(''); setLoading(false);
            append = false; setLoadingMore(false); setRefreshing(current.again);
          } catch (failure) {
            if (state.current !== current || current.controller.signal.aborted || failure.name === 'AbortError') return;
            setError(failure.message || 'Could not refresh data.');
            // Honor an actual invalidation received during a failed page read.
            // No automatic network retry without that explicit pending signal.
            append = false; setLoadingMore(false); setRefreshing(current.again && current.loaded);
          }
        } while (current.again && state.current === current);
      } finally {
        if (state.current === current) { current.pending = null; setLoading(false); setRefreshing(false); setLoadingMore(false); }
      }
    };
    current.pending = run();
    return current.pending;
  }, [key, url, scope, paginated]);
  const refresh = useCallback((background = true) => request(background), [request]);
  const loadMore = useCallback(() => request(true, true), [request]);
  useEffect(() => {
    const depth = paginated && paginationWindow.current?.key === key ? paginationWindow.current.depth : 1;
    const current = { key, controller: new AbortController(), pending: null, loaded: false, again: false, depth, result: null };
    state.current = current; setError(''); setLoading(Boolean(url)); setRefreshing(false); setLoadingMore(false);
    if (url) void refresh(false);
    return () => { state.current = null; current.controller.abort(); };
  }, [key, url, refresh, paginated]);
  useEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    void refresh();
  }, [revision, refresh]);
  const liveStatus = usePortalUpdates(refresh, resourceDomains(url), eventId);
  return { liveStatus, data: snapshot.key === key ? snapshot.data : undefined, refresh, loadMore, loading, refreshing, loadingMore, error };
}
