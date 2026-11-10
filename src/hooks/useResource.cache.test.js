import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useResource } from './useResource';
import { invalidatePortalResources } from './usePortalUpdates';
import { cancelResourceReads, setResourceIdentity } from '../utils/resourceClient';
import { LEAD_CACHE, markAllStale, noteChanges, setFeedConnected } from '../utils/resourceCache';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, requests, identity = 0;
function View() {
  const { data, loading, confirmed } = useResource('/list', undefined, { cache: LEAD_CACHE });
  return <span>{loading ? 'loading' : `${data?.value}:${confirmed ? 'confirmed' : 'unconfirmed'}`}</span>;
}
beforeEach(() => {
  identity += 1;
  setResourceIdentity({ _id: `admin-${identity}`, role: 'admin' });
  setFeedConnected(true);
  requests = [];
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cancelResourceReads(); container.remove();
});
const reply = (request, value) => request.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { value } }) });
const show = () => act(async () => root.render(<View />));
const hide = () => act(async () => root.render(null));

test('unchanged data returns at once with no read', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide(); await show();
  expect(container.textContent).toBe('one:confirmed');
  expect(requests).toHaveLength(1);
});
test('a relevant change shows the old data unconfirmed, then the new data', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  noteChanges([{ domain: 'communication' }]);
  await show();
  expect(container.textContent).toBe('one:unconfirmed');
  await act(async () => reply(requests[1], 'two'));
  expect(container.textContent).toBe('two:confirmed');
});
test('an unrelated change costs no read', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  noteChanges([{ domain: 'catalog' }]);
  await show();
  expect(requests).toHaveLength(1);
});
test('a change during a read leaves that answer stale', async () => {
  await show();
  noteChanges([{ domain: 'leads' }]);
  await act(async () => reply(requests[0], 'one'));
  await hide(); await show();
  expect(container.textContent).toBe('one:unconfirmed');
  await act(async () => reply(requests[1], 'two'));
});
test('with the feed down every return re-checks', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  setFeedConnected(false);
  await show();
  expect(requests).toHaveLength(2);
  await act(async () => reply(requests[1], 'two'));
});
test('a reconnect makes everything re-check', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  markAllStale();
  await show();
  expect(requests).toHaveLength(2);
  await act(async () => reply(requests[1], 'two'));
});
test('a deleted record drops the kept answer', async () => {
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  markAllStale();
  await show();
  await act(async () => requests[1].resolve({ ok: false, status: 404, json: async () => ({ message: 'Lead not found' }) }));
  expect(container.textContent).toBe('undefined:unconfirmed');
});
test('an old answer past the limit is never shown', async () => {
  const realNow = Date.now;
  await show();
  await act(async () => reply(requests[0], 'one'));
  await hide();
  Date.now = () => realNow() + 31 * 60 * 1000;
  try {
    await show();
    expect(container.textContent).toBe('loading');
    await act(async () => reply(requests[1], 'two'));
  } finally { Date.now = realNow; }
});
test('another account never sees kept data, and nothing reaches browser storage', async () => {
  await show();
  await act(async () => reply(requests[0], 'SECRET'));
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('SECRET');
  await hide();
  await act(async () => setResourceIdentity({ _id: 'someone-else', role: 'admin' }));
  await show();
  expect(container.textContent).toBe('loading');
  await act(async () => reply(requests[requests.length - 1], 'theirs'));
  expect(container.textContent).toContain('theirs');
  await hide();
  await act(async () => setResourceIdentity({ _id: `admin-${identity}`, role: 'admin' }));
  await show();
  expect(container.textContent).toBe('loading');
  await act(async () => reply(requests[requests.length - 1], 'mine'));
});

 test('customer orders are reused across mounts and a relevant event invalidates them', async () => {
  setResourceIdentity({ _id: 'customer-one', role: 'customer' });
  setFeedConnected(true);
  function Customer() { const { data, loading } = useResource('/api/get-order'); return <span>{loading ? 'loading' : data?.value}</span>; }
  await act(async () => root.render(<Customer />));
  await act(async () => reply(requests[0], 'first'));
  await act(async () => root.render(null));
  setFeedConnected(true); // A portal shell subscriber keeps the real feed open across navigation.
  await act(async () => root.render(<Customer />));
  expect(container.textContent).toBe('first');
  expect(requests).toHaveLength(1);
  await act(async () => root.render(null));
  noteChanges([{ domain: 'catalog' }]);
  setFeedConnected(true);
  await act(async () => root.render(<Customer />));
  expect(requests).toHaveLength(2);
  await act(async () => reply(requests[1], 'updated'));
  expect(container.textContent).toBe('updated');
});

test('change during read must not mark that response confirmed', async () => {
  await show();
  noteChanges([{ domain: 'leads' }]);
  await act(async () => reply(requests[0], 'one'));
  expect(container.textContent).toBe('one:unconfirmed');
});


test('customer mutation invalidates a mounted ticket without a live feed', async () => {
  setResourceIdentity({ _id: 'customer-mutation', role: 'customer' });
  function Customer() { const { data } = useResource('/api/get-user-tickets?page=1'); return <span>{data?.value}</span>; }
  await act(async () => root.render(<Customer />));
  await act(async () => reply(requests[0], 'before'));
  await act(async () => { invalidatePortalResources(['tickets']); await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(requests).toHaveLength(2);
  await act(async () => reply(requests[1], 'after'));
  expect(container.textContent).toBe('after');
});

test('authorization failure clears retained customer data', async () => {
  setResourceIdentity({ _id: 'customer-private', role: 'customer' });
  function Customer() { const { data, refresh } = useResource('/api/get-order'); return <button onClick={refresh}>{data?.value || 'empty'}</button>; }
  await act(async () => root.render(<Customer />));
  await act(async () => reply(requests[0], 'private'));
  await act(async () => container.querySelector('button').click());
  await act(async () => requests[1].resolve({ ok: false, status: 403, json: async () => ({ message: 'Denied' }) }));
  expect(container.textContent).toBe('empty');
});

test('customer order details block actions until a stale entry is checked', async () => {
  setResourceIdentity({ _id: 'customer-detail', role: 'customer' });
  function Detail() {
    const { data, loading, error } = useResource('/api/order-details/one');
    return <span>{loading ? 'checking' : error ? 'error' : data?.value}</span>;
  }
  await act(async () => root.render(<Detail />));
  await act(async () => reply(requests[0], 'old detail'));
  await act(async () => root.render(null));
  noteChanges([{ domain: 'invoices' }]); setFeedConnected(true);
  await act(async () => root.render(<Detail />));
  expect(container.textContent).toBe('checking');
  await act(async () => reply(requests[1], 'new detail'));
  expect(container.textContent).toBe('new detail');
  await act(async () => root.render(null));
  noteChanges([{ domain: 'orders' }]); setFeedConnected(true);
  await act(async () => root.render(<Detail />));
  await act(async () => requests[2].resolve({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }));
  expect(container.textContent).toBe('error');
  expect(container.textContent).not.toContain('new detail');
});
