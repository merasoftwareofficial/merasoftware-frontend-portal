import React, { Component, lazy, Suspense, useState } from 'react';

class RouteBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div role="alert" className="p-6 text-center">
      <p>This screen could not be loaded.</p>
      <button type="button" onClick={() => { this.props.retry(); this.setState({ error: null }); }}>Retry</button>
    </div>;
    return this.props.children;
  }
}

export function lazyPage(load, name = 'default') {
  const factory = () => lazy(() => load().then(module => ({ default: module[name] })));
  return function LazyPage(props) {
    const [Page, setPage] = useState(factory);
    return <RouteBoundary retry={() => setPage(factory)}>
      <Suspense fallback={<div role="status" aria-live="polite" className="p-6 text-center">Loading screen…</div>}>
        <Page {...props} />
      </Suspense>
    </RouteBoundary>;
  };
}
