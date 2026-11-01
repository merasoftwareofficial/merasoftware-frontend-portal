import { ScrollRestoration } from 'react-router-dom';

// Router-owned scroll state follows list URLs on Back/Forward; no dataset stored.
export default function ScrollToTop() {
  return <ScrollRestoration getKey={location => `${location.pathname}${location.search}`} storageKey="portal-scroll-positions" />;
}
