import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/helpers/emailReview.js', import.meta.url), 'utf8').replace(/export /g, '');
function setup(inline = true, fail = false) {
  const calls = [], events = [];
  const draft = { _id: 'draft-1', subject: 'Hello' };
  const window = { location: { href: 'https://portal.test/' }, dispatchEvent: e => events.push(e), fetch: async url => {
    calls.push(String(url));
    if (fail) throw new Error('offline');
    const data = String(url).includes('/email-control/') ? { success: true, data: draft } : { success: true, emailStatus: 'awaiting-review', emailDraftIds: [draft._id], ...(inline ? { emailReviewDraft: draft } : {}) };
    return { ok: true, headers: new Map([['content-type', 'application/json']]), json: async () => data, clone() { return this; } };
  } };
  const context = vm.createContext({ window, URL, Promise, process: { env: { REACT_APP_BACKEND_URL: 'https://api.test' } }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(source, context);
  return { context, window, calls, events };
}
for (const inline of [true, false]) test(`review uses ${inline ? 'inline data without draft GET' : 'legacy draft endpoint'} and waits for decision`, async () => {
  const state = setup(inline);
  let finish;
  state.context.registerEmailReview(() => new Promise(resolve => { finish = resolve; }));
  let completed = false;
  const request = state.window.fetch('https://api.test/api/admin/leads/123/message', { method: 'POST' }).then(() => { completed = true; });
  for (let n = 0; n < 20 && !finish; n++) await Promise.resolve();
  assert.equal(typeof finish, 'function');
  assert.equal(completed, false);
  assert.equal(state.calls.length, inline ? 1 : 2);
  assert.equal(state.events[0].detail, true);
  finish({ processedResult: { status: 'skipped' } });
  await request;
  assert.equal(state.events.at(-1).detail, false);
  assert.equal(state.calls.length, inline ? 1 : 2);
});
test('preparation ends when the network fails', async () => {
  const state = setup(true, true);
  await assert.rejects(state.window.fetch('https://api.test/api/admin/leads/123/final-message', { method: 'POST' }), /offline/);
  assert.equal(state.events.at(-1).detail, false);
});

