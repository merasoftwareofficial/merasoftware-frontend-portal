import { createPendingReads } from './pendingReads';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('shares concurrent reads but never retains a completed response', async () => {
  const reads = createPendingReads();
  const task = deferred();
  const load = jest.fn(() => task.promise);
  const first = reads.read('list?page=1', load);
  const second = reads.read('list?page=1', load);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  task.resolve(['one']);
  expect(await first).toEqual(['one']);
  expect(await second).toEqual(['one']);
  await reads.read('list?page=1', load);
  expect(load).toHaveBeenCalledTimes(2);
});

test('one consumer unmount does not abort another consumer', async () => {
  const reads = createPendingReads();
  const task = deferred();
  let transportSignal;
  const load = signal => { transportSignal = signal; return task.promise; };
  const controller = new AbortController();
  const first = reads.read('detail', load, { signal: controller.signal });
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = reads.read('detail', load);
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(transportSignal.aborted).toBe(false);
  task.resolve('current');
  expect(await second).toBe('current');
});

test('last consumer cancellation aborts transport and a revisit starts a fresh read', async () => {
  const reads = createPendingReads();
  const controller = new AbortController();
  let transportSignal;
  const first = reads.read('detail', signal => {
    transportSignal = signal;
    return new Promise(() => {});
  }, { signal: controller.signal });
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(transportSignal.aborted).toBe(true);
  expect(await reads.read('detail', async () => 'fresh')).toBe('fresh');
});

test('account/role change rejects old consumers even when transport ignores abort', async () => {
  const reads = createPendingReads();
  reads.setScope('user-a:customer');
  const task = deferred();
  const old = reads.read('same-url', () => task.promise);
  const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  reads.setScope('user-b:customer');
  await rejected;
  const current = reads.read('same-url', async () => 'user-b');
  task.resolve('user-a');
  expect(await current).toBe('user-b');
});

test('different query keys stay independent and failures can be retried', async () => {
  const reads = createPendingReads();
  const load = jest.fn(async () => { throw new Error('offline'); });
  await expect(reads.read('page=1', load)).rejects.toThrow('offline');
  await expect(reads.read('page=1', load)).rejects.toThrow('offline');
  expect(load).toHaveBeenCalledTimes(2);
  expect(await Promise.all([
    reads.read('page=1', async () => 1), reads.read('page=2', async () => 2),
  ])).toEqual([1, 2]);
});

test('pre-aborted consumers never start a request', async () => {
  const reads = createPendingReads();
  const controller = new AbortController();
  controller.abort();
  const load = jest.fn();
  await expect(reads.read('detail', load, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(load).not.toHaveBeenCalled();
});
