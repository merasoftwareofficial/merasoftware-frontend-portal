const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' }, define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import{Provider}from'react-redux';import{configureStore}from'@reduxjs/toolkit';import{BrowserRouter,Routes,Route}from'react-router-dom';import MyOffers from './src/pages/MyOffers';import ProtectedRoute from './src/components/ProtectedRoute';
      const initial={user:{user:{_id:'member-1',role:'member'},initialized:true}};const store=configureStore({reducer:(s=initial,a)=>a.type==='replace'?a.payload:s});window.replaceUser=u=>store.dispatch({type:'replace',payload:{user:{user:u,initialized:true}}});
      createRoot(document.getElementById('root')).render(<Provider store={store}><BrowserRouter><Routes><Route path="/my-offers" element={<ProtectedRoute><MyOffers/></ProtectedRoute>}/><Route path="/login" element={<p>Login fixture</p>}/></Routes></BrowserRouter></Provider>);` },
    plugins: [{ name: 'isolated-shell-and-api', setup(builder) {
      builder.onResolve({ filter: /DashboardLayout$/ }, () => ({ path: 'shell', namespace: 'fixture' }));
      builder.onLoad({ filter: /^shell$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Layout({children}){return <div data-testid="customer-shell">{children}</div>}`, loader: 'jsx', resolveDir: root }));
      builder.onResolve({ filter: /^\.\.\/common$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onLoad({ filter: /^api$/, namespace: 'fixture' }, () => ({ contents: `export default {offerReservations:{url:'/api/offer-reservations'}};` }));
    } }],
  });
  const now = Date.parse('2026-10-24T12:00:00Z');
  let rows = [
    { id: 'one', title: 'Active offer', reservedPrice: 5000, status: 'reserved', terms: ['Saved scope'], reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3600000).toISOString() },
    { id: 'two', title: 'Old offer', reservedPrice: 4000, status: 'expired', terms: ['Old scope'], reservedAt: new Date(now - 73 * 3600000).toISOString(), expiresAt: new Date(now - 3600000).toISOString() },
  ];
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/api/offer-reservations') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ success: true, data: { reservations: rows, serverNow: new Date(now).toISOString() } })); }
    res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/New_York' }); const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(() => { Date.now = () => 0; });
    await page.goto(`http://127.0.0.1:${server.address().port}/my-offers`);
    try { await page.getByRole('heading', { name: 'Active offer' }).waitFor({ timeout: 10000 }); }
    catch (error) { throw new Error(`${error.message}\nBrowser errors: ${errors.join('; ')}\nPage: ${await page.locator('body').innerText()}`); }
    assert.equal(await page.getByTestId('customer-shell').count(), 0, 'Member does not receive the general customer layout');
    assert.match(await page.locator('article').first().innerText(), /7[12]h .*remaining/);
    assert.match(await page.locator('article').last().getAttribute('class'), /bg-gray-100/);
    assert.match(await page.locator('article').last().innerText(), /Expired/);
    assert.match(await page.locator('article').first().innerText(), /IST/);
    await page.evaluate(() => window.replaceUser({ _id: 'member-1', role: 'customer' }));
    await page.getByTestId('customer-shell').waitFor();
    rows = []; await page.evaluate(() => window.replaceUser({ _id: 'member-2', role: 'member' }));
    await page.getByText('You have no reserved offers yet.').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Active offer' }).count(), 0);
    await page.evaluate(() => window.replaceUser(null));
    await page.waitForURL('**/login?next=%2Fmy-offers');
    assert.deepEqual(errors, []);
    console.log('PASS: portal My Offers member/customer access, server-time countdown, expired history, account switch and login continuation.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
