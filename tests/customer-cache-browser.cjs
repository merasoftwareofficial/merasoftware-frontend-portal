// Customer navigation and live invalidation against local fixtures; never contacts production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../../merasoftware/node_modules/playwright');
const build = path.resolve(__dirname, '../build');
const server = http.createServer((req, res) => {
  let file = path.resolve(build, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(build + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(build, 'index.html');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], requests = [];
  let name = 'Project before change';
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__feeds = [];
    window.EventSource = class {
      constructor() { this.closed = false; window.__feeds.push(this); setTimeout(() => { if (!this.closed) this.onmessage?.({ data: JSON.stringify({ type: 'ready' }) }); }, 20); }
      close() { this.closed = true; }
    };
    window.__change = domain => window.__feeds.filter(feed => !feed.closed).forEach(feed => feed.onmessage?.({ data: JSON.stringify({ type: 'changed', resources: [{ domain, all: true, ids: [] }] }) }));
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, body: '{}' });
    requests.push(url.pathname);
    let data = [];
    if (url.pathname === '/api/user-details') data = { _id: 'customer-a', name: 'Customer A', role: 'customer', roles: ['customer'], walletBalance: 10 };
    if (url.pathname === '/api/get-order') data = [{ _id: 'order-a', isWebsiteProject: true, projectSnapshot: { displayName: name }, projectProgress: 20, orderState: { code: 'in_progress', label: 'In Progress' }, createdAt: '2026-01-01' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) }).catch(() => {});
  });
  const count = () => requests.filter(p => p === '/api/get-order').length;
  try {
    await page.goto(origin + '/dashboard');
    await page.getByText(name).first().waitFor();
    await page.waitForTimeout(1000);
    const initial = count();
    await page.locator('a[href="/projects-and-plans"]').first().click();
    await page.getByText(name).first().waitFor();
    await page.waitForTimeout(350);
    assert.equal(count(), initial, 'navigation should reuse the shared orders response');
    name = 'Project after change';
    await page.evaluate(() => window.__change('orders'));
    await page.getByText(name).first().waitFor({ state: 'attached', timeout: 5000 });
    assert.ok(count() > initial, 'live change must re-read orders');
    const beforeDisconnect = count();
    name = 'Project after disconnect';
    await page.evaluate(() => window.__feeds.filter(feed => !feed.closed).forEach(feed => feed.onerror?.()));
    await page.locator('a[href="/dashboard"]').first().click();
    await page.getByText(name).first().waitFor({ state: 'attached', timeout: 5000 });
    assert.ok(count() > beforeDisconnect, 'a disconnected feed must force a server read');
    const beforeReload = count();
    name = 'Project after reload';
    await page.reload();
    await page.getByText(name).first().waitFor({ state: 'attached', timeout: 5000 });
    assert.ok(count() > beforeReload, 'browser reload must re-read orders');
    assert.deepEqual(errors, []);
    console.log('PASS customer navigation, live invalidation and browser reload');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
