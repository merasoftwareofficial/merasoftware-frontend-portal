import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map();

// The router restores scroll before a list's data has arrived, when the page is still
// too short to reach the old position. This repeats it on Back/Forward once the list is there.
export function useListScroll(ready) {
  const { key } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (!ready) return undefined;
    // The history entry, not this component's key: the scroll a route change causes belongs to the new screen.
    const save = () => positions.set(window.history.state?.key || 'default', window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [ready]);
  useEffect(() => {
    if (!ready || type !== 'POP' || !positions.has(key)) return undefined;
    const top = positions.get(key);
    window.scrollTo(0, top);
    // A closing subpage hands back to its list one render later, so repeat once it has.
    const frame = requestAnimationFrame(() => window.scrollTo(0, top));
    return () => cancelAnimationFrame(frame);
  }, [ready, key, type]);
}
