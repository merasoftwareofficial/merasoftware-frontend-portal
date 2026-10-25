// Admin Reserved offers panel in an isolated browser. Transport is a fixture server; the real
// rules (admin role, revision, confirmation) are covered by backend tests/reservationRepricing.test.js.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import{Toaster}from'sonner';import Panel from './src/components/admin/ReservedOffersPanel';
      const projects=[{_id:'p1',projectSnapshot:{displayName:'Shop website'},totalAmount:10000,orderVisibility:'approved'},{_id:'p2',projectSnapshot:{displayName:'Old site'},totalAmount:8000,orderVisibility:'cancelled'}];
      createRoot(document.getElementById('root')).render(<><Toaster/><Panel customerId="c1" projects={projects} onChanged={()=>{window.changed=(window.changed||0)+1}}/></>);` },
    plugins: [{ name: 'api-fixture', setup(builder) {
      builder.onResolve({ filter: /^\.\.\/\.\.\/common$/ }, () => ({ path: 'api', namespace: 'fixture' }));
      builder.onLoad({ filter: /^api$/, namespace: 'fixture' }, () => ({ contents: `export default {offerReservations:{url:'/api/offer-reservations'}};` }));
    } }],
  });
  const now = Date.now();
  const rows = [
    { id: 'r1', title: 'Expired offer', offerSlug: 'diwali-offer', reservedPrice: 5000, status: 'expired', resolution: null, projectId: null,
      reservedAt: new Date(now - 80 * 3600000).toISOString(), expiresAt: new Date(now - 8 * 3600000).toISOString(), deadline: new Date(now - 8 * 3600000).toISOString(), extendedUntil: null, extensions: [] },
    { id: 'r2', title: 'Locked offer', offerSlug: 'locked', reservedPrice: 4000, status: 'confirmed', resolution: null, projectId: 'p1',
      reservedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), deadline: new Date(now + 3600000).toISOString(), extendedUntil: null, extensions: [] },
  ];
  const calls = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/offer-reservations')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (req.method === 'POST') calls.push({ url: req.url, body: JSON.parse(raw) });
      if (req.url === '/api/offer-reservations/user/c1') return res.end(JSON.stringify({ success: true, data: { reservations: rows } }));
      if (req.url === '/api/offer-reservations/r1/extend') return res.end(JSON.stringify({ success: true, data: { notice: 'sent' } }));
      if (req.url === '/api/offer-reservations/r1/force-apply/preview') return res.end(JSON.stringify({ success: true, data: { offerSlug: 'diwali-offer', pricingRevision: 1, previewToken: 'preview-fixture',
        before: { finalPrice: 10000, firstBill: 10000, installments: [] }, after: { finalPrice: 5000, firstBill: 5000, installments: [] }, note: 'Validity is overridden by an admin.' } }));
      if (req.url === '/api/offer-reservations/r1/force-apply') return res.end(JSON.stringify({ success: true, data: { finalPrice: 5000 } }));
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByText('Expired offer · ₹5,000').waitFor();
    // A price-locked reservation offers no admin action.
    const locked = page.locator('li').filter({ hasText: 'Locked offer' });
    assert.equal(await locked.getByRole('button').count(), 0);
    // Extend: reason required, ISO deadline sent.
    const expired = page.locator('li').filter({ hasText: 'Expired offer' });
    await expired.getByRole('button', { name: 'Extend deadline' }).click();
    assert.equal(await page.getByRole('button', { name: 'Extend reservation' }).isDisabled(), true);
    await page.getByLabel('Reason (kept in the audit history)').fill('Bank holiday');
    await page.getByRole('button', { name: 'Extend reservation' }).click();
    await page.waitForFunction(() => window.changed === 1);
    const extend = calls.find(call => call.url.endsWith('/extend'));
    assert.equal(extend.body.reason, 'Bank holiday'); assert.ok(Date.parse(extend.body.until) > Date.now());
    // Force-apply: cancelled projects hidden, preview shown, code must be typed exactly.
    await expired.getByRole('button', { name: 'Apply reserved price…' }).click();
    assert.equal(await page.locator('option', { hasText: 'Old site' }).count(), 0);
    await page.getByLabel('Project').selectOption('p1');
    await page.getByRole('button', { name: 'Show what will change' }).click();
    await page.getByText('Project price: ₹10,000 → ₹5,000').waitFor();
    await page.getByLabel('Reason (kept in the audit history)').fill('Paid by cheque in time');
    await page.getByLabel(/To confirm, type the offer code/).fill('diwali');
    assert.equal(await page.getByRole('button', { name: 'Apply reserved price', exact: true }).isDisabled(), true);
    await page.getByLabel(/To confirm, type the offer code/).fill('diwali-offer');
    await page.getByRole('button', { name: 'Apply reserved price', exact: true }).click();
    await page.waitForFunction(() => window.changed === 2);
    const force = calls.find(call => call.url.endsWith('/force-apply'));
    assert.deepEqual(force.body, { orderId: 'p1', reason: 'Paid by cheque in time', confirmSlug: 'diwali-offer', expectedRevision: 1, previewToken: 'preview-fixture' });
    assert.deepEqual(errors, []);
    console.log('PASS: admin Reserved offers panel — extend with reason, force-apply preview, typed confirmation and revision.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
