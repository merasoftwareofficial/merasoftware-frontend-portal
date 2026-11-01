import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { subscribeResourceScope } from '../utils/resourceClient';

// A list comes back as it was left, by the page's Back arrow, the browser's Back, the sidebar or F5.
// Keyed by path, because the Back arrow and the sidebar each make a new history entry.
const lastSearch = new Map();
const lastOpened = new Map();
subscribeResourceScope(() => { lastSearch.clear(); lastOpened.clear(); });

// Only a number goes to sessionStorage, so the position survives F5. Filters can hold a name: memory only.
const storageKey = path => `list-scroll:${path}`;
const readTop = path => { try { return Number(sessionStorage.getItem(storageKey(path))) || 0; } catch { return 0; } };
const writeTop = (path, top) => { try { sessionStorage.setItem(storageKey(path), String(top)); } catch { /* The position is a convenience. */ } };

export const rememberOpenedRow = (path, id) => lastOpened.set(path, id);
export const openedRow = path => lastOpened.get(path);

export function useListReturn(ready) {
  const { pathname, search } = useLocation();
  const type = useNavigationType();
  const navigate = useNavigate();
  const entered = useRef(false);
  const restored = useRef(false);
  const [settled, setSettled] = useState(false);

  // A sidebar link has no filters, so the first render here brings the last ones back. A click on
  // the link while already on this list has no filters either, and that one clears them.
  useLayoutEffect(() => {
    if (entered.current) { lastSearch.set(pathname, search); setSettled(true); return; }
    entered.current = true;
    const previous = lastSearch.get(pathname);
    if (!search && previous && type === 'PUSH') navigate(`${pathname}${previous}`, { replace: true, preventScrollReset: true });
    else { lastSearch.set(pathname, search); setSettled(true); }
  }, [pathname, search, type, navigate]);

  // Restore after the filters, because that navigation would otherwise undo it. Rows hidden by
  // a loader shorten the page, so their return restores it too.
  useLayoutEffect(() => {
    if (!ready) { restored.current = false; return undefined; }
    if (!settled || restored.current) return undefined;
    restored.current = true;
    const top = readTop(pathname);
    if (!top) return undefined;
    window.scrollTo(0, top);
    // The router's own restore runs after this effect, so repeat once it has.
    const frame = requestAnimationFrame(() => window.scrollTo(0, top));
    return () => cancelAnimationFrame(frame);
  }, [ready, settled, pathname]);

  // A layout effect: the scroll a shortened page causes must not be saved as the position.
  useLayoutEffect(() => {
    if (!ready || !settled) return undefined;
    const save = () => { if (window.location.pathname === pathname) writeTop(pathname, window.scrollY); };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [ready, settled, pathname]);
}
