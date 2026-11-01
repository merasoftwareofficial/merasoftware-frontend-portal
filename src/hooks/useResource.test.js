import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useResource } from './useResource';
import { cancelResourceReads, setResourceIdentity } from '../utils/resourceClient';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, requests;
function View({ id, url = '/list' }) {
  const { data, refresh, loading, error } = useResource(url);
  return <section data-id={id}><span>{loading ? 'loading' : data?.value || error}</span><button onClick={() => refresh()}>Refresh</button></section>;
}
beforeEach(() => {
  setResourceIdentity({ _id: 'one', role: 'customer' });
  requests = [];
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cancelResourceReads(); container.remove();
});
const reply = (request, value) => request.resolve({ ok: true, json: async () => ({ success: true, data: { value } }) });

test('two mounted consumers share one read; removing one preserves the other', async () => {
  await act(async () => root.render(<><View key="a" id="a" /><View key="b" id="b" /></>));
  expect(requests).toHaveLength(1);
  await act(async () => root.render(<View key="b" id="b" />));
  expect(requests[0].options.signal.aborted).toBe(false);
  await act(async () => reply(requests[0], 'fresh'));
  expect(container.textContent).toContain('fresh');
});

test('invalidation bursts during a pending read create only one trailing fresh read', async () => {
  await act(async () => root.render(<View />));
  await act(async () => { for (let i = 0; i < 20; i++) container.querySelector('button').click(); });
  expect(requests).toHaveLength(1);
  await act(async () => reply(requests[0], 'initial'));
  expect(requests).toHaveLength(2);
  expect(container.textContent).toContain('initial');
  await act(async () => reply(requests[1], 'latest'));
  expect(container.textContent).toContain('latest');
});

test('resource change and account switch never publish old data', async () => {
  await act(async () => root.render(<View url="/first" />));
  await act(async () => root.render(<View url="/second" />));
  expect(requests[0].options.signal.aborted).toBe(true);
  await act(async () => setResourceIdentity({ _id: 'two', role: 'customer' }));
  expect(requests[1].options.signal.aborted).toBe(true);
  await act(async () => { reply(requests[0], 'OLD FIRST'); reply(requests[1], 'OLD SECOND'); reply(requests[2], 'CURRENT'); });
  expect(container.textContent).toContain('CURRENT');
  expect(container.textContent).not.toContain('OLD');
});

test('failed background reads keep visible data and expose retry error', async () => {
  await act(async () => root.render(<View />));
  await act(async () => reply(requests[0], 'visible'));
  await act(async () => container.querySelector('button').click());
  await act(async () => requests[1].resolve({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }));
  expect(container.textContent).toContain('visible');
  await act(async () => container.querySelector('button').click());
  await act(async () => reply(requests[2], 'recovered'));
  expect(container.textContent).toContain('recovered');
});
