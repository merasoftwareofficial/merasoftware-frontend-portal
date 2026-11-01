// Shares only unfinished reads. Screens that keep finished answers opt in through resourceCache.js.
export function createPendingReads() {
  const pending = new Map();
  let scope;
  let generation = 0;
  const aborted = () => Object.assign(new Error('Read cancelled'), { name: 'AbortError' });

  function cancelAll() {
    generation += 1;
    for (const entry of pending.values()) {
      entry.controller.abort();
      for (const cancel of [...entry.consumers]) cancel();
    }
    pending.clear();
  }

  function setScope(next) {
    if (scope === next) return;
    cancelAll();
    scope = next;
  }

  function read(key, load, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(aborted());
    const requestGeneration = generation;
    let entry = pending.get(key);
    if (!entry) {
      entry = { controller: new AbortController(), consumers: new Set() };
      pending.set(key, entry);
      entry.promise = Promise.resolve().then(() => {
        if (entry.controller.signal.aborted) throw aborted();
        return load(entry.controller.signal);
      }).finally(() => {
        if (pending.get(key) === entry) pending.delete(key);
      });
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener('abort', cancel);
        entry.consumers.delete(cancel);
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!entry.consumers.size) {
          if (pending.get(key) === entry) pending.delete(key);
          entry.controller.abort();
        }
        reject(aborted());
      };
      entry.consumers.add(cancel);
      signal?.addEventListener('abort', cancel, { once: true });
      entry.promise.then(value => {
        if (settled) return;
        if (requestGeneration !== generation) { cancel(); return; }
        settled = true;
        cleanup();
        resolve(value);
      }, error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
    });
  }

  return { read, setScope, cancelAll };
}
