import { useEffect, useState } from 'react';

// The server's clock for an offer countdown: the visitor's own device clock may be wrong, so the time the
// backend sent (`serverNow`) is carried forward by how long this page has been open (the way
// pages/MyOffers.js does). Ticks once a second; returns milliseconds, or null until the server time is known.
export default function useServerNow(serverNow) {
  const [clock, setClock] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const server = Date.parse(serverNow);
    setClock(Number.isFinite(server) ? { server, client: performance.now() } : null);
  }, [serverNow]);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return clock ? clock.server + performance.now() - clock.client : null;
}
