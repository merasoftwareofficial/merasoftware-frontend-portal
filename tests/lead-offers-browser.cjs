// The real lead page and Leads list: categories, client behaviour, the do-not-disturb state and per-offer follow-ups.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

(async () => {
  const script = await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { BrowserRouter, Routes, Route } from 'react-router-dom';
      import Detail from './src/pages/AdminLeadDetailPage';
      import Leads from './src/pages/AdminLeadsPage';
      window.calls = [];
      const client = { _id: 'client1', name: 'Rajan', phone: '9876500000', email: 'r@example.test', status: 'Won', convertedToUserId: 'user1', clientBehaviour: 'Tough', clientAvailable: true, contactBlock: null,
        offerTargets: [{ offerSlug: 'dhamaka', offerTitle: 'Digital Dhamaka', stage: 'Positive' }, { offerSlug: 'seo', offerTitle: 'SEO Offer', stage: 'Won' }],
        followUps: [
          { _id: 'f1', note: 'General note', badge: 'Won', createdAt: '2026-10-01' },
          { _id: 'f2', note: 'Dhamaka note', badge: 'Positive', offerSlug: 'dhamaka', createdAt: '2026-10-02' },
          { _id: 'f3', note: 'SEO note', badge: 'Won', offerSlug: 'seo', createdAt: '2026-10-03' },
        ] };
      const waiting = { _id: 'lead2', name: 'Ravi', phone: '9876543210', status: 'Negative', followUps: [], offerTargets: [], finalMessage: { status: 'waiting', deadlineAt: '2026-11-02' },
        contactBlock: { reason: 'final-message', label: 'Final message: countdown', message: 'The final message countdown is running for this person, so nothing else goes until it ends.' } };
      const list = [
        { _id: 'client1', name: 'Rajan', phone: '9876500000', status: 'Won', convertedToUserId: 'user1', clientBehaviour: 'Tough', createdAt: '2026-10-30' },
        { _id: 'client2', name: 'Sunil', phone: '9876500001', status: 'Won', convertedToUserId: 'user2', createdAt: '2026-10-30' },
        { _id: 'lead2', name: 'Ravi', phone: '9876543210', status: 'Negative', contactBlock: { reason: 'final-message', label: 'Final message: countdown' }, createdAt: '2026-10-30' },
        { _id: 'lead3', name: 'Mohan', phone: '9876543211', status: 'Contacted', createdAt: '2026-10-30' },
      ];
      window.fetch = async (url, options = {}) => {
        const address = String(url);
        const form = options.body instanceof FormData ? Object.fromEntries(options.body.entries()) : options.body ? JSON.parse(options.body) : null;
        window.calls.push({ url: address, method: options.method || 'get', body: form });
        const json = data => new Response(JSON.stringify({ success: true, ...data }), { headers: { 'content-type': 'application/json' } });
        if (address.includes('final-message')) return json({ data: { count: 0 } });
        if (address.endsWith('/leads/lead2')) return json({ data: waiting });
        if (address.endsWith('/leads/client1')) return json({ data: client });
        if (address.endsWith('/leads')) return json({ data: list });
        return json({ data: [] });
      };
      createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path='/admin-panel/leads' element={<Leads/>}/><Route path='/admin-panel/leads/:leadId' element={<Detail/>}/></Routes></BrowserRouter>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.REACT_APP_BACKEND_URL': '"http://api.test"', 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'isolate-app-shell', setup(b) {
      b.onResolve({ filter: /^react-redux$/ }, () => ({ path: 'redux', namespace: 'test' }));
      b.onResolve({ filter: /^\.\.\/App$/ }, () => ({ path: 'app', namespace: 'test' }));
      b.onResolve({ filter: /\/AdminLayout$/ }, () => ({ path: 'layout', namespace: 'test' }));
      b.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ loader: 'js', contents: args.path === 'redux'
        ? "export const useSelector=fn=>fn({user:{user:{_id:'admin',roles:['admin']}}});export const useDispatch=()=>()=>{};"
        : args.path === 'app' ? 'export const useOnlineStatus=()=>({isOnline:true});' : 'export default function Layout({children}){return children}' }));
    } }],
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? script.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER', error.message); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const lastPost = () => page.evaluate(() => window.calls.filter(call => call.body).at(-1));

    await page.goto(`${origin}/admin-panel/leads/client1`);
    await page.getByRole('heading', { name: 'Offers' }).waitFor();
    assert.equal(await page.getByText('Dhamaka note').count(), 1);
    await page.getByRole('group', { name: 'Show follow-ups for' }).getByRole('button', { name: 'Digital Dhamaka' }).click();
    assert.equal(await page.getByText('General note').count(), 0);
    assert.equal(await page.getByText('Dhamaka note').count(), 1);
    await page.getByRole('group', { name: 'Show follow-ups for' }).getByRole('button', { name: 'General' }).click();
    assert.equal(await page.getByText('General note').count(), 1);
    assert.equal(await page.getByText('Dhamaka note').count(), 0);

    // Follow-up for an offer: the stage list is that offer's, and the offer goes with the note.
    await page.locator('button[aria-haspopup="listbox"]').filter({ hasText: 'General' }).click();
    await page.getByRole('option', { name: 'Digital Dhamaka' }).click();
    await page.locator('button[aria-haspopup="listbox"]').filter({ hasText: 'Positive' }).first().click();
    assert.deepEqual(await page.getByRole('option').allInnerTexts(), ['Neutral', 'Positive', 'Negative']);
    await page.getByRole('option', { name: 'Negative' }).click();
    await page.getByPlaceholder(/Add a follow-up note/).fill('Said no for now');
    await page.getByRole('button', { name: 'Add Follow-up' }).click();
    await page.waitForFunction(() => window.calls.some(call => call.body?.note === 'Said no for now'));
    const sent = await lastPost();
    assert.equal(sent.body.offerSlug, 'dhamaka');
    assert.equal(sent.body.badge, 'Negative');

    // Client behaviour: Wrong is not offered.
    await page.locator('button[aria-haspopup="listbox"]').filter({ hasText: 'Tough' }).click();
    const behaviours = await page.getByRole('option').allInnerTexts();
    assert.deepEqual(behaviours, ['Neutral', 'Positive', 'Active', 'Lazy', 'Tough', 'Negative', 'Unhappy', 'Dead']);
    await page.getByRole('option', { name: 'Active' }).click();
    await page.waitForFunction(() => window.calls.some(call => call.body?.action === 'setBehaviour'));
    assert.deepEqual((await page.evaluate(() => window.calls.find(call => call.body?.action === 'setBehaviour'))).body, { action: 'setBehaviour', behaviour: 'Active' });

    // Countdown: the badge and reason show, and Send message is off.
    await page.goto(`${origin}/admin-panel/leads/lead2`);
    await page.getByText('Final message: countdown').waitFor();
    await page.getByText(/countdown is running/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send message' }).isDisabled(), true);
    await page.locator('button[aria-haspopup="listbox"]').filter({ hasText: 'Negative' }).first().click();
    assert.ok((await page.getByRole('option').allInnerTexts()).includes('Wrong'), 'a lead can be marked Wrong');

    // Leads list: Neutral replaces Contacted, the badge shows, and Matured has its behaviour filter.
    await page.goto(`${origin}/admin-panel/leads`);
    await page.getByRole('button').filter({ hasText: 'Mohan' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Contacted', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Neutral', exact: true }).first().waitFor();
    await page.getByText('Final message: countdown').first().waitFor();
    assert.equal(await page.getByText('Client behaviour').count(), 0);
    await page.getByRole('button', { name: 'Matured', exact: true }).click();
    await page.getByText('Client behaviour').waitFor();
    // The status row also has these names, so the behaviour row is the last match.
    await page.getByRole('button', { name: 'Tough', exact: true }).last().click();
    assert.equal(await page.getByRole('button').filter({ hasText: 'Rajan' }).count() > 0, true);
    await page.getByRole('button').filter({ hasText: 'Sunil' }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Neutral', exact: true }).last().click();
    await page.getByRole('button').filter({ hasText: 'Sunil' }).waitFor();
    await page.getByRole('button').filter({ hasText: 'Rajan' }).waitFor({ state: 'detached' }); // no saved behaviour counts as Neutral

    assert.deepEqual(errors, []);
    console.log('PASS: offers, per-offer follow-ups, behaviour, countdown and list filters on the real portal pages.');
  } finally { await browser?.close(); server.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
