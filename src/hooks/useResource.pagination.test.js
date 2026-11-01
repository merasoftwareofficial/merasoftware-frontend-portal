import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useResource } from './useResource';
import { cancelResourceReads, setResourceIdentity } from '../utils/resourceClient';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, requests;
function View({ url = '/links?limit=2' }) {
  const resource = useResource(url, undefined, { paginated: true });
  return <><span>{resource.data?.items.map(row => row._id).join(',')}</span><output>{resource.error}</output>
    <button onClick={() => resource.loadMore()}>More</button><button onClick={() => resource.refresh()}>Refresh</button></>;
}
beforeEach(() => {
  setResourceIdentity({ _id: 'admin', role: 'admin' }); requests = [];
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); cancelResourceReads(); container.remove(); });
const reply = (index, ids, nextCursor = null) => requests[index].resolve({ ok: true, json: async () => ({ success: true, data: { items: ids.map(_id => ({ _id })), nextCursor } }) });
const click = text => [...container.querySelectorAll('button')].find(button => button.textContent === text).click();

test('duplicate load-more clicks share one page; overlapping rows are not duplicated', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a', 'b'], 'cursor-1'));
  await act(async () => { click('More'); click('More'); });
  expect(requests).toHaveLength(2);
  expect(requests[1].url).toBe('/links?limit=2&cursor=cursor-1');
  await act(async () => reply(1, ['b', 'c']));
  expect(container.querySelector('span').textContent).toBe('a,b,c');
  await act(async () => click('More'));
  expect(requests).toHaveLength(2);
});

test('refresh preserves loaded window, follows new cursors, and publishes atomically', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a', 'b'], 'old'));
  await act(async () => click('More'));
  await act(async () => reply(1, ['c', 'd'], 'tail'));
  await act(async () => click('Refresh'));
  await act(async () => reply(2, ['new', 'a'], 'fresh-cursor'));
  expect(container.querySelector('span').textContent).toBe('a,b,c,d');
  expect(requests[3].url).toContain('cursor=fresh-cursor');
  await act(async () => reply(3, ['b', 'c'], 'next'));
  expect(container.querySelector('span').textContent).toBe('new,a,b,c');
});

test('invalidation during append causes one canonical loaded-window refresh', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a'], 'old'));
  await act(async () => { click('More'); click('Refresh'); click('Refresh'); });
  await act(async () => reply(1, ['b']));
  expect(requests[2].url).toBe('/links?limit=2');
  await act(async () => reply(2, ['new'], 'fresh'));
  await act(async () => reply(3, ['a']));
  expect(requests).toHaveLength(4);
  expect(container.querySelector('span').textContent).toBe('new,a');
});

test('failed next page preserves rows and cursor for an explicit retry', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a'], 'retry-cursor'));
  await act(async () => click('More'));
  await act(async () => requests[1].resolve({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }));
  expect(container.querySelector('span').textContent).toBe('a');
  expect(container.querySelector('output').textContent).toBe('Unavailable');
  await act(async () => click('More'));
  expect(requests[2].url).toContain('cursor=retry-cursor');
  await act(async () => reply(2, ['b']));
  expect(container.querySelector('span').textContent).toBe('a,b');
});

test('an invalidation during a failed append still reconciles the visible list', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a'], 'next'));
  await act(async () => { click('More'); click('Refresh'); });
  await act(async () => requests[1].resolve({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }));
  expect(requests).toHaveLength(3);
  expect(requests[2].url).toBe('/links?limit=2');
  await act(async () => reply(2, ['CURRENT']));
  expect(container.querySelector('span').textContent).toBe('CURRENT');
});

test('customer change/unmount abort pending pages and cannot publish stale history', async () => {
  await act(async () => root.render(<View url="/customer-a/links" />));
  await act(async () => reply(0, ['a'], 'next'));
  await act(async () => click('More'));
  await act(async () => root.render(<View url="/customer-b/links" />));
  expect(requests[1].options.signal.aborted).toBe(true);
  expect(container.querySelector('span').textContent).toBe('');
  await act(async () => { reply(1, ['STALE']); reply(2, ['CURRENT']); });
  expect(container.querySelector('span').textContent).toBe('CURRENT');
  await act(async () => click('Refresh'));
  await act(async () => root.render(null));
  expect(requests[3].options.signal.aborted).toBe(true);
});

test('returning to the same tab keeps pagination depth but reads every page fresh', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(0, ['a'], 'next'));
  await act(async () => click('More'));
  await act(async () => reply(1, ['b']));
  await act(async () => root.render(<View url={null} />));
  await act(async () => root.render(<View />));
  expect(container.querySelector('span').textContent).toBe('a,b');
  await act(async () => reply(2, ['fresh-a'], 'fresh-next'));
  expect(requests).toHaveLength(4);
  expect(requests[3].url).toContain('cursor=fresh-next');
  await act(async () => reply(3, ['fresh-b']));
  expect(container.querySelector('span').textContent).toBe('fresh-a,fresh-b');
});
