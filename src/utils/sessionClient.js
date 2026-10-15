// Only a server response establishes identity. Browser storage is a display cache.
// Share concurrent checks and ignore responses superseded by login/logout.
export function createSessionClient({ url, method, onUser, onSignedOut, onError, onChecking }) {
  let pending = null;
  let generation = 0;

  function cancel() {
    generation += 1;
    pending?.controller.abort();
    pending = null;
  }

  function check({ force = false } = {}) {
    if (force) cancel();
    if (pending) return pending.promise;

    const current = generation;
    const controller = new AbortController();
    onChecking();
    const timer = setTimeout(() => controller.abort(), 15000);
    const promise = (async () => {
      try {
        if (!navigator.onLine) throw new Error('offline');
        const response = await fetch(url, { method, credentials: 'include', signal: controller.signal });
        if (current !== generation) return null;
        if (response.status === 401) {
          onSignedOut();
          return null;
        }
        if (!response.ok) throw new Error(`Session service returned ${response.status}`);
        const body = await response.json();
        if (current !== generation) return null;
        if (!body.success || !body.data?._id || !body.data?.role) throw new Error('Invalid session response');
        onUser(body.data);
        return body.data;
      } catch (error) {
        if (current === generation) {
          onError(navigator.onLine
            ? 'Could not verify your session. Please try again.'
            : 'You are offline. Reconnect to verify your session.');
        }
        return null;
      } finally {
        clearTimeout(timer);
        if (current === generation) pending = null;
      }
    })();
    pending = { promise, controller };
    // An offline check can finish synchronously before pending is assigned.
    promise.finally(() => { if (pending?.promise === promise) pending = null; });
    return promise;
  }

  return { check, cancel };
}
