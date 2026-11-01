import { ScrollRestoration } from 'react-router-dom';

// Tabs and list filters change how a screen is viewed, not which screen it is, so they
// share its scroll position. Any other query value still counts as a new screen.
const VIEW_PARAMS = ['tab', 'q', 'sort', 'source', 'status', 'behaviour', 'proposal', 'searchTerm', 'sortBy', 'currentPage', 'statusFilter', 'activeTab', 'view', 'filter', 'historyFilter', 'historySearch', 'showAllHistory'];
const scrollKey = location => {
  const params = new URLSearchParams(location.search);
  VIEW_PARAMS.forEach(name => params.delete(name));
  return `${location.pathname}?${params}`;
};

// Router-owned scroll state follows screens on Back/Forward; no dataset stored.
export default function ScrollToTop() {
  return <ScrollRestoration getKey={scrollKey} storageKey="portal-scroll-positions" />;
}
