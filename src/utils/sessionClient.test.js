import { createSessionClient } from './sessionClient';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const reply = (status, data) => ({ status, ok: status >= 200 && status < 300,
  json: async () => ({ success: true, data }) });

let client;
let callbacks;
beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  global.fetch = jest.fn();
  callbacks = { onUser: jest.fn(), onSignedOut: jest.fn(), onError: jest.fn(), onChecking: jest.fn() };
  client = createSessionClient({ url: '/api/user-details', method: 'get', ...callbacks });
});
afterEach(() => { client.cancel(); jest.useRealTimers(); });

test('concurrent checks share one request and establish only the current server user', async () => {
  const request = deferred();
  fetch.mockReturnValue(request.promise);
  const first = client.check();
  const second = client.check();
  expect(first).toBe(second);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(callbacks.onUser).not.toHaveBeenCalled();
  const user = { _id: 'current', role: 'customer' };
  request.resolve(reply(200, user));
  expect(await first).toEqual(user);
  expect(callbacks.onUser).toHaveBeenCalledWith(user);
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
});

test('only 401 clears the session', async () => {
  fetch.mockResolvedValue(reply(401));
  await client.check();
  expect(callbacks.onSignedOut).toHaveBeenCalledTimes(1);
  expect(callbacks.onError).not.toHaveBeenCalled();
});

test.each([403, 429, 500, 502, 503])('HTTP %s reports a retryable error without logout', async (status) => {
  fetch.mockResolvedValue(reply(status));
  await client.check();
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
  expect(callbacks.onUser).not.toHaveBeenCalled();
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(reply(200, { _id: 'recovered', role: 'admin' }));
  await client.check();
  expect(callbacks.onUser).toHaveBeenCalledWith({ _id: 'recovered', role: 'admin' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('network error and malformed JSON do not log out', async () => {
  fetch.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce({
    status: 200, ok: true, json: async () => { throw new Error('Bad JSON'); },
  });
  await client.check();
  await client.check();
  expect(callbacks.onError).toHaveBeenCalledTimes(2);
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
});

test('offline checks make no request and recover when retried online', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await client.check();
  expect(fetch).not.toHaveBeenCalled();
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  fetch.mockResolvedValue(reply(200, { _id: 'online', role: 'customer' }));
  await client.check();
  expect(callbacks.onUser).toHaveBeenCalledTimes(1);
});

test('a login supersedes an older 401 even if fetch ignores abort', async () => {
  const old = deferred();
  fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply(200, { _id: 'new', role: 'admin' }));
  const previous = client.check();
  await client.check({ force: true });
  old.resolve(reply(401));
  await previous;
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
  expect(callbacks.onUser).toHaveBeenCalledTimes(1);
});

test('logout or unmount prevents an old successful check restoring the user', async () => {
  const old = deferred();
  fetch.mockReturnValue(old.promise);
  const previous = client.check();
  client.cancel();
  old.resolve(reply(200, { _id: 'old', role: 'admin' }));
  await previous;
  expect(callbacks.onUser).not.toHaveBeenCalled();
});

test('a hanging request times out without logout', async () => {
  jest.useFakeTimers();
  fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = client.check();
  jest.advanceTimersByTime(15000);
  await pending;
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  expect(callbacks.onSignedOut).not.toHaveBeenCalled();
});
