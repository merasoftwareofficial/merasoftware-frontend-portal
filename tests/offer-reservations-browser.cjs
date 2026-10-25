const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const buildDir = process.env.PORTAL_UI_BUILD_DIR || path.join(root, 'build');
  const cssDir = path.join(buildDir, 'static/css');
  const css = fs.readFileSync(path.join(cssDir, fs.readdirSync(cssDir).find(name => /^main\..*\.css$/.test(name))), 'utf8');
  const output = path.join(process.env.PORTAL_UI_BUILD_DIR || path.join(root, 'build'), 'my-offers-check');
  fs.mkdirSync(output, { recursive: true });
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    // react-scripts inlines these at build time; the isolated bundle must do the same.
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.PUBLIC_URL': '""', 'process.env.REACT_APP_WEBSITE_URL': '"https://website.example.test"' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import{Provider}from'react-redux';import{configureStore}from'@reduxjs/toolkit';import{BrowserRouter,Routes,Route}from'react-router-dom';import MyOffers from './src/pages/MyOffers';import ProtectedRoute from './src/components/ProtectedRoute';
      const initial={user:{user:{_id:'member-1',role:'member'},initialized:true}};const store=configureStore({reducer:(s=initial,a)=>a.type==='replace'?a.payload:s});window.replaceUser=u=>store.dispatch({type:'replace',payload:{user:{user:u,initialized:true}}});
      createRoot(document.getElementById('root')).render(<Provider store={store}><BrowserRouter><Routes><Route path="/my-offers" element={<ProtectedRoute><MyOffers/></ProtectedRoute>}/><Route path="/login" element={<p>Login fixture</p>}/></Routes></BrowserRouter></Provider>);` },
    plugins: [{ name: 'isolated-shell-and-api', setup(builder) {
      builder.onResolve({ filter: /DashboardLayout$/ }, () => ({ path: 'shell', namespace: 'fixture' }));
      builder.onLoad({ filter: /^shell$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Layout({children}){return <main className="portal-surface" data-testid="customer-shell">{children}</main>}`, loader: 'jsx', resolveDir: root }));
      builder.onResolve({ filter: /^\.\.\/common$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onLoad({ filter: /^api$/, namespace: 'fixture' }, () => ({ contents: `export default {offerReservations:{url:'/api/offer-reservations'}};` }));
    } }],
  });
  const now = Date.parse('2026-10-24T12:00:00Z');
  let rows = [
    { id: 'one', title: 'Active offer', reservedPrice: 5000, status: 'reserved', terms: ['Saved scope'], reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString() },
    // Original 72 hours ended an hour ago; an admin extended it by two days.
    { id: 'extended', title: 'Extended offer', reservedPrice: 4800, status: 'reserved', terms: ['Saved scope'], reservedAt: new Date(now - 73 * 3600000).toISOString(),
      expiresAt: new Date(now - 3600000).toISOString(), deadline: new Date(now + 48 * 3600000).toISOString(), extendedUntil: new Date(now + 48 * 3600000).toISOString() },
    { id: 'review', title: 'Paid offer', reservedPrice: 4500, status: 'under_review', projectId: 'project-1', terms: ['Paid scope'], reservedAt: new Date(now - 73 * 3600000).toISOString(), expiresAt: new Date(now - 3600000).toISOString() },
    { id: 'two', title: 'Old offer', reservedPrice: 4000, status: 'expired', terms: ['Old scope'], reservedAt: new Date(now - 73 * 3600000).toISOString(), expiresAt: new Date(now - 3600000).toISOString() },
    { id: 'locked', title: 'Confirmed offer', reservedPrice: 6000, status: 'confirmed', projectId: 'project-2', terms: ['Confirmed scope'], reservedAt: new Date(now - 73 * 3600000).toISOString(), expiresAt: new Date(now - 3600000).toISOString() },
  ];
  let fail = false;
  let delay = 500;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/static/media/')) {
      const file = path.resolve(buildDir, '.' + req.url);
      if (!file.startsWith(path.resolve(buildDir) + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', /\.png$/.test(file) ? 'image/png' : /\.svg$/.test(file) ? 'image/svg+xml' : 'application/octet-stream');
      return res.end(fs.readFileSync(file));
    }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/api/offer-reservations') {
      res.setHeader('Content-Type', 'application/json');
      return setTimeout(() => { res.statusCode = fail ? 503 : 200; res.end(JSON.stringify(fail ? { success: false, message: 'Offers temporarily unavailable' } : { success: true, data: { reservations: rows, serverNow: new Date(now).toISOString() } })); }, delay);
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html data-theme="light" data-accent="cyan"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/New_York' }); const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(() => { Date.now = () => 0; });
    await page.goto(`http://127.0.0.1:${server.address().port}/my-offers`);
    await page.getByRole('status').getByText('Loading your offers…').waitFor();
    try { await page.getByRole('heading', { name: 'Active offer' }).waitFor({ timeout: 10000 }); }
    catch (error) { throw new Error(`${error.message}\nBrowser errors: ${errors.join('; ')}\nPage: ${await page.locator('body').innerText()}`); }
    assert.equal(await page.getByTestId('customer-shell').count(), 0, 'Member does not receive the general customer layout');
    assert.match(await page.locator('article').first().innerText(), /7[12]h .*remaining/);
    assert.match(await page.locator('article').nth(3).getAttribute('class'), /glass-bg-subtle/);
    assert.match(await page.locator('article').nth(3).innerText(), /Expired/);
    assert.match(await page.locator('article').nth(4).innerText(), /Price locked/);
    assert.match(await page.locator('article').first().innerText(), /IST/);
    // An admin extension counts down to the new deadline and says so.
    assert.match(await page.locator('article').nth(1).innerText(), /4[78]h .*remaining/);
    assert.match(await page.locator('article').nth(1).innerText(), /extended by our team/);
    assert.doesNotMatch(await page.locator('article').nth(1).getAttribute('class'), /bg-gray-100/);
    // In-time payment awaiting approval stays out of the grey expired state after the deadline.
    assert.match(await page.locator('article').nth(2).innerText(), /Payment under review/);
    assert.doesNotMatch(await page.locator('article').nth(2).getAttribute('class'), /bg-gray-100/);
    const reservedTerms = page.locator('article').first().locator('summary');
    await reservedTerms.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('article').first().locator('details').getAttribute('open'), '');
    await page.keyboard.press('Enter');
    const appearances = new Set();
    for (const theme of ['light', 'dark', 'immersive']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [375, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme}/${width} has no horizontal overflow`);
        const visual = await page.locator('.surface').first().evaluate(el => {
          const style = getComputedStyle(el);
          const probe = document.createElement('div'); probe.style.color = 'var(--text-primary)'; el.append(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          return { color: style.color, expected, bg: style.backgroundColor, radius: parseFloat(style.borderRadius), shadow: style.boxShadow };
        });
        assert.equal(visual.color, visual.expected);
        assert.ok(visual.radius > 0 && visual.shadow !== 'none', 'shared surface geometry and depth are present');
        appearances.add(visual.bg);
        await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.ok(appearances.size > 1, 'surface adapts to theme');
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await page.evaluate(() => window.replaceUser({ _id: 'member-1', role: 'customer' }));
    await page.getByTestId('customer-shell').waitFor();
    assert.equal(await page.locator('main').count(), 1, 'Customer layout owns the only main landmark');
    assert.equal(await page.getByRole('link', { name: 'Back to dashboard' }).count(), 0, 'Top-level tab uses the portal navigation');
    delay = 0;
    const savedRows = rows;
    fail = true;
    await page.evaluate(() => window.replaceUser({ _id: 'error-member', role: 'member' }));
    await page.getByRole('alert').getByText('Offers temporarily unavailable').waitFor();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('heading', { name: 'Active offer' }).waitFor();
    // A failed background refresh keeps the already-loaded offer cards visible.
    fail = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.getByRole('alert').getByText('Offers temporarily unavailable').waitFor();
    assert.equal(await page.locator('article').count(), savedRows.length);
    fail = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    rows = []; await page.evaluate(() => window.replaceUser({ _id: 'member-2', role: 'member' }));
    await page.getByText('You have no reserved offers yet.').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Active offer' }).count(), 0);
    await page.evaluate(() => window.replaceUser(null));
    await page.waitForURL('**/login?next=%2Fmy-offers');
    assert.deepEqual(errors, []);
    console.log('PASS: My Offers — three themes at desktop/mobile widths, shared surfaces, keyboard terms, loading/error/retry, reserved/extended/review/confirmed/expired states, server-time countdown, customer/member access, account switch and login continuation.');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
