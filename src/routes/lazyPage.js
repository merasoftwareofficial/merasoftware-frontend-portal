import React, { Component, lazy, useState } from 'react';

const RELOADED = 'portal-chunk-reload';
const isMissingFile = error => /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i.test(`${error?.name} ${error?.message}`);

class RouteBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    if (!isMissingFile(error)) return;
    // A new deploy removed this tab's old files: the page's new files need one reload. Only one, or a really missing file would loop.
    try {
      if (sessionStorage.getItem(RELOADED)) return;
      sessionStorage.setItem(RELOADED, '1');
    } catch { return; }
    window.location.reload();
  }
  render() {
    if (this.state.error) return <div role="alert" className="p-6 text-center">
      <p>This screen could not be loaded.</p>
      <button type="button" onClick={() => { this.props.retry(); this.setState({ error: null }); }}>Retry</button>
    </div>;
    return this.props.children;
  }
}

// One lazy component per page for the whole session: a new one on every visit
// would suspend every time. The Suspense boundary lives above the routes.
export function lazyPage(load, name = 'default') {
  const factory = () => lazy(() => load().then(module => {
    try { sessionStorage.removeItem(RELOADED); } catch { /* storage blocked */ }
    return { default: module[name] };
  }));
  let Page = factory();
  return function LazyPage(props) {
    const [, setRetries] = useState(0);
    return <RouteBoundary retry={() => { Page = factory(); setRetries(count => count + 1); }}>
      <Page {...props} />
    </RouteBoundary>;
  };
}
