// Client buys a plan in the portal checkout (merasoftware/src/docs/plan.md §4), end to end in a browser:
// the real ServicePlanDetail, PlanCheckout and PlanDetails pages (bundled alone with esbuild) against the
// REAL backend controllers on an in-memory MongoDB, signed in with a real session cookie. Covers:
//   from the website: straight to checkout, Change back to the website, wallet with a double click (one
//     order, one debit), the result page, "Stay here", the automatic return to the website's My purchases;
//   from the portal: builder → checkout, a price change (409 → new price), the purchase key kept over a
//     reload, wallet + UPI (QR for the remainder only), the automatic return to the plan page with
//     Approval Pending and uploads closed, phone width;
//   an admin rejection: the result page tells it with no automatic return, the plan page says Payment Rejected.
// Mail provider mocked and every other network call blocked. Needs a portal build for its CSS (npm run build).
// Usage (from frontend/): node tests/plan-checkout-browser.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(root, '../backend');
const fromBackend = (name) => require(path.join(backend, 'node_modules', name));
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');
const express = fromBackend('express');
const cookieParser = fromBackend('cookie-parser');
const jwt = fromBackend('jsonwebtoken');
const mongoose = fromBackend('mongoose');
const { MongoMemoryReplSet } = fromBackend('mongodb-memory-server');

const WEBSITE = 'https://website.example.test';
const shots = path.join(require('node:os').tmpdir(), `plan-checkout-${Date.now()}`);

(async () => {
  process.env.TOKEN_SECRET_KEY = 'isolated-plan-checkout-secret'.repeat(2);
  process.env.RESEND_API_KEY = 'isolated-no-real-key'; process.env.FROM_EMAIL = 'sender@example.test';
  process.env.ADMIN_DASHBOARD_URL = 'https://portal.example.test';
  const nativeFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails') return new Response(JSON.stringify({ id: 'isolated' }), { status: 200 });
    if (String(url).includes('/api/offers/live')) return new Response(JSON.stringify({ offers: [], catalogueOffers: [] }), { status: 200 });
    throw new Error(`External network blocked: ${url}`);
  };
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  // Every model the server registers at start (populate() needs them all, e.g. "Developer").
  for (const file of fs.readdirSync(path.join(backend, 'models'))) if (file.endsWith('.js')) require(path.join(backend, 'models', file));
  const Order = require(path.join(backend, 'models/orderProductModel'));
  const Product = require(path.join(backend, 'models/productModel'));
  const User = require(path.join(backend, 'models/userModel'));
  const Transaction = require(path.join(backend, 'models/transactionModel'));
  await Promise.all([Order.init(), Transaction.init()]);
  const [admin, client] = await User.create([
    { name: 'Plan Admin', email: 'admin@example.test', roles: ['admin'] },
    { name: 'Plan Client', email: 'client@example.test', roles: ['customer'], walletBalance: 5000 },
  ]);
  const plan = await Product.create({
    serviceName: 'Single Page Addition', category: 'service_plan', isServicePlan: true, price: 1500, sellingPrice: 1500,
    servicePlan: { capability: 'upload_data', serviceBehavior: 'portal_access_control', dependency: 'standalone_or_project', timing: 'during_and_after', purchaseType: 'one_time', limitScope: 'per_plan', portalAccessCount: 5, filesLimit: 20 },
  });

  const cssDir = path.join(root, 'build/static/css');
  const css = fs.readFileSync(path.join(cssDir, fs.readdirSync(cssDir).find((name) => /^main\..*\.css$/.test(name))), 'utf8');
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.PUBLIC_URL': '""', 'process.env.REACT_APP_BACKEND_URL': '""', 'process.env.REACT_APP_WEBSITE_URL': JSON.stringify(WEBSITE) },
    stdin: { resolveDir: root, loader: 'jsx', contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{Provider}from'react-redux';import{configureStore}from'@reduxjs/toolkit';import{BrowserRouter,Routes,Route}from'react-router-dom';
      import ServicePlanDetail from './src/pages/ServicePlanDetail';import PlanCheckout,{PlanCheckoutDone}from './src/pages/PlanCheckout';import PlanDetails from './src/pages/PlanDetails';import Context from './src/context';
      const initial={user:{user:{_id:'${client._id}',name:'Plan Client',role:'customer',roles:['customer']},initialized:true}};const store=configureStore({reducer:(s=initial)=>s});
      function App(){const[walletBalance,setWallet]=useState(null);const fetchWalletBalance=()=>fetch('/fixture/wallet').then(r=>r.json()).then(d=>setWallet(d.walletBalance));React.useEffect(()=>{fetchWalletBalance()},[]);
        if(walletBalance===null)return null;
        return <Context.Provider value={{walletBalance,fetchWalletBalance}}><BrowserRouter><Routes>
          <Route path="/service-plan-detail/:planId" element={<ServicePlanDetail/>}/><Route path="/checkout/:planId" element={<PlanCheckout/>}/>
          <Route path="/checkout/done/:orderId" element={<PlanCheckoutDone/>}/><Route path="/plan-details/:orderId" element={<PlanDetails/>}/>
        </Routes></BrowserRouter></Context.Provider>}
      createRoot(document.getElementById('root')).render(<Provider store={store}><App/></Provider>);` },
    plugins: [{ name: 'isolated-shell', setup(builder) {
      builder.onResolve({ filter: /DashboardLayout$/ }, () => ({ path: 'shell', namespace: 'fixture' }));
      builder.onLoad({ filter: /^shell$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Layout({children}){return <main className="portal-surface">{children}</main>}`, loader: 'jsx', resolveDir: root }));
    } }],
  });

  const authToken = require(path.join(backend, 'middleware/authToken'));
  const quotes = require(path.join(backend, 'controller/order/servicePlanQuote'));
  const approvals = require(path.join(backend, 'controller/user/transactionApprovalController'));
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api', require(path.join(backend, 'helpers/emailController')).requestMiddleware);
  app.get('/api/customer/service-plan-catalogue', authToken, quotes.customerCatalogue);
  app.post('/api/customer/service-plan-quote', authToken, quotes.customerQuote);
  app.get('/api/customer/service-plan-offers/:planId', authToken, require(path.join(backend, 'controller/order/servicePlanOffers')));
  // `orderDelay` slows the purchase answer when a test wants to see the waiting state.
  let orderDelay = 0;
  const slowOrder = (req, res, next) => (orderDelay ? setTimeout(next, orderDelay) : next());
  app.post('/api/customer/service-plan-order', slowOrder, authToken, require(path.join(backend, 'controller/order/customerCreateServicePlanOrder')));
  app.get('/api/order-details/:orderId', authToken, require(path.join(backend, 'controller/order/getOrderDetails')));
  app.get('/api/orders/:orderId/uploads', authToken, require(path.join(backend, 'controller/order/getOrderUploads')));
  app.post('/api/wallet/reject-transaction', authToken, approvals.rejectTransaction);
  app.use('/api', (req, res) => res.json({ success: true, data: [] }));
  app.get('/fixture/wallet', async (req, res) => res.json({ walletBalance: (await User.findById(client._id).lean()).walletBalance }));
  app.get('/app.js', (req, res) => res.type('application/javascript').send(Buffer.from(bundle.outputFiles[0].contents)));
  app.get('/app.css', (req, res) => res.type('text/css').send(css));
  app.use((req, res) => res.type('html').send('<!doctype html><html data-theme="light" data-accent="cyan"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = (user, role) => jwt.sign({ _id: String(user._id), role }, process.env.TOKEN_SECRET_KEY, { algorithm: 'HS256' });

  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const openAt = async (address, viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'token', value: session(client, 'customer'), url: origin }]);
    // The website is not running here: its pages answer with a marker, so a return to it can be seen.
    await context.route(`${WEBSITE}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Website fixture</h1>' }));
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + address);
    return { page, context };
  };
  const payButton = (page, name) => page.getByRole('button', { name }).and(page.locator(':enabled'));
  const wallet = async () => (await User.findById(client._id).lean()).walletBalance;
  const newestOrder = async () => String((await Order.findOne().sort({ createdAt: -1 }).lean())._id);
  try {
    // 1. From the website: checkout at once, Change goes back there, wallet + double click, result, Stay here.
    {
      const { page, context } = await openAt(`/checkout/${plan._id}?purchase=one_time&from=website`);
      await page.getByRole('heading', { name: 'Checkout' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Change' }).getAttribute('href'), `${WEBSITE}/plans/${plan._id}?purchase=one_time`);
      const pay = payButton(page, 'Pay ₹1,500 from wallet');
      await pay.waitFor();
      await page.screenshot({ path: path.join(shots, 'checkout-desktop.png'), fullPage: true });
      await pay.dblclick();
      await page.getByRole('heading', { name: 'Your plan is active' }).waitFor();
      const orderId = await newestOrder();
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, `/checkout/done/${orderId}?from=website`);
      assert.equal(await Order.countDocuments(), 1, 'double click made one order');
      assert.equal(await Transaction.countDocuments({ paymentMethod: 'wallet' }), 1, 'double click debited once');
      assert.equal(await wallet(), 3500);
      assert.equal(await page.getByRole('link', { name: 'View my plan →' }).getAttribute('href'), `/plan-details/${orderId}`);
      assert.equal(await page.getByRole('link', { name: 'Back to website' }).getAttribute('href'), `${WEBSITE}/account/purchases?new=${orderId}`);
      await page.getByText(/Taking you to your purchases on our website in \d+s\./).waitFor();
      await page.screenshot({ path: path.join(shots, 'result-active.png'), fullPage: true });
      await page.getByRole('button', { name: 'Stay here' }).click();
      await page.waitForTimeout(11_000);
      assert.equal(new URL(page.url()).pathname, `/checkout/done/${orderId}`, 'Stay here keeps the client on the result');
      assert.equal(await page.getByText(/Taking you to/).count(), 0);
      console.log('PASS from the website: straight to checkout, Change back to the website, one order and one debit on a double click, result with both ways on, Stay here');
      await context.close();
    }

    // 2. A second website purchase is left alone: after 10 seconds it returns to the website's My purchases.
    //    Its answer is slow (9s): the waiting state shows (not in the first moment, so fast work never
    //    flashes it), the card is locked, and after 8s the line says it can take a few seconds.
    {
      const { page, context } = await openAt(`/checkout/${plan._id}?purchase=one_time&from=website`);
      await payButton(page, 'Pay ₹1,500 from wallet').waitFor();
      orderDelay = 9000;
      const firstMoment = await page.evaluate(async () => {
        [...document.querySelectorAll('button')].find((button) => button.textContent === 'Pay ₹1,500 from wallet').click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const seen = (selector) => [...document.querySelectorAll(selector)].some((node) => Number(getComputedStyle(node).opacity) > 0);
        return { spinner: seen('.portal-spinner'), words: seen('.portal-wait') };
      });
      assert.deepEqual(firstMoment, { spinner: false, words: false }, 'nothing flashes in the first moment');
      await page.getByRole('button', { name: 'Processing…' }).locator('svg.portal-spinner').waitFor();
      await page.getByRole('status').filter({ hasText: 'Confirming your payment… please don’t close this page.' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Change' }).getAttribute('aria-disabled'), 'true', 'Change is locked while paying');
      assert.equal(await page.getByLabel('Service payment offer').isDisabled(), true, 'the offer is locked while paying');
      await page.getByRole('status').filter({ hasText: 'Still working, this can take a few seconds. Please keep this page open.' }).waitFor({ timeout: 10_000 });
      await page.getByRole('heading', { name: 'Your plan is active' }).waitFor({ timeout: 15_000 });
      orderDelay = 0;
      const orderId = await newestOrder();
      // The website takes a moment to answer: the result shows it is taking the client there.
      await context.route(`${WEBSITE}/account/**`, (route) => setTimeout(() => route.fulfill({ contentType: 'text/html', body: '<h1>Website fixture</h1>' }), 1500));
      // Read inside the page: Playwright waits on the started navigation, the page itself does not.
      const leavingShown = await page.evaluate(() => new Promise((resolve) => {
        const timer = setInterval(() => {
          const line = [...document.querySelectorAll('[role="status"]')].find((node) => node.textContent === 'Taking you to your purchases on our website…');
          const spinner = line?.querySelector('svg.portal-spinner');
          if (spinner && Number(getComputedStyle(spinner).opacity) > 0) { clearInterval(timer); resolve(true); }
        }, 50);
        setTimeout(() => { clearInterval(timer); resolve(false); }, 13_000);
      }));
      assert.equal(leavingShown, true, 'the automatic return shows a spinner while the website loads');
      await page.waitForURL(`${WEBSITE}/account/purchases?new=${orderId}`, { timeout: 15_000 });
      console.log('PASS slow payment: no flash, spinner + locked card + waiting line, the slow line after 8s; the result returns a website client to My purchases, with a spinner on the way');
      await context.close();
    }

    // 3. From the portal: builder → checkout; a price change; the key survives a reload; wallet + UPI; return to the plan.
    let pendingId;
    {
      await User.updateOne({ _id: client._id }, { $set: { walletBalance: 400 } });
      const { page, context } = await openAt(`/service-plan-detail/${plan._id}`);
      await payButton(page, 'Continue to checkout →').click();
      await page.waitForURL(`**/checkout/${plan._id}?purchase=one_time&from=portal`);
      assert.equal(await page.getByRole('link', { name: 'Change' }).getAttribute('href'), `/service-plan-detail/${plan._id}?purchase=one_time`);
      await payButton(page, 'Continue to UPI').waitFor();
      const keyBefore = await page.evaluate(() => Object.entries(sessionStorage).find(([name]) => name.startsWith('plan-checkout-key:'))?.[1]);
      await page.reload();
      await payButton(page, 'Continue to UPI').waitFor();
      assert.equal(await page.evaluate(() => Object.entries(sessionStorage).find(([name]) => name.startsWith('plan-checkout-key:'))?.[1]), keyBefore, 'a reload keeps the purchase key');

      // The admin changes the price after the summary was shown: nothing is bought, the new price shows.
      await Product.updateOne({ _id: plan._id }, { $set: { price: 1800, sellingPrice: 1800 } });
      await payButton(page, 'Continue to UPI').click();
      await page.getByRole('heading', { name: 'Pay ₹1,100 by UPI' }).waitFor();
      await page.getByPlaceholder('12-digit reference number').fill('412345678901');
      const ordersBefore = await Order.countDocuments();
      orderDelay = 1500; // slow refusal: the UPI step locks with a spinner, then unlocks with the message
      await payButton(page, 'Send payment for checking').click();
      await page.getByRole('button', { name: 'Sending…' }).locator('svg.portal-spinner').waitFor();
      assert.equal(await page.getByPlaceholder('12-digit reference number').isDisabled(), true, 'the reference is locked while sending');
      assert.equal(await page.locator('section').getByRole('button', { name: 'Back', exact: true }).isDisabled(), true);
      await page.getByRole('alert').filter({ hasText: 'The plan or its price changed. Check the new price and try again.' }).waitFor();
      orderDelay = 0;
      assert.equal(await page.locator('.portal-wait').count(), 0, 'the waiting line goes with the answer');
      assert.equal(await Order.countDocuments(), ordersBefore, 'nothing bought at the old price');
      assert.equal(await wallet(), 400, 'nothing taken at the old price');
      await page.getByText('₹1,800').first().waitFor();
      await payButton(page, 'Continue to UPI').click();
      await page.getByRole('heading', { name: 'Pay ₹1,400 by UPI' }).waitFor();
      await page.locator('svg path[shape-rendering="crispEdges"]').first().waitFor(); // the UPI QR (qrcode.react)
      await page.getByPlaceholder('12-digit reference number').fill('412345678902');
      await page.screenshot({ path: path.join(shots, 'checkout-upi.png'), fullPage: true });
      await payButton(page, 'Send payment for checking').click();
      await page.getByRole('heading', { name: 'Payment submitted' }).waitFor();
      pendingId = await newestOrder();
      assert.equal(await wallet(), 0);
      assert.equal(await page.getByRole('link', { name: 'Back to services' }).getAttribute('href'), '/start-new-project/services?tab=services');
      await page.getByText(/Taking you to your plan in \d+s\./).waitFor();
      await page.waitForURL(`**/plan-details/${pendingId}`, { timeout: 15_000 });
      await page.getByText('Approval Pending', { exact: true }).first().waitFor();
      await page.getByText('We are checking your payment. You can send your data once it is approved.').locator('visible=true').first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Request Update/ }).first().isDisabled(), true);
      console.log('PASS from the portal: builder → checkout, price change refused then the new price, key kept over a reload, wallet + UPI, back to the plan with uploads closed');
      await context.close();
    }

    // 4. Phone width: the checkout and its UPI step fit, with no sideways scroll.
    {
      await User.updateOne({ _id: client._id }, { $set: { walletBalance: 0 } });
      const { page, context } = await openAt(`/checkout/${plan._id}?purchase=one_time&from=website`, { width: 375, height: 812 });
      await payButton(page, 'Continue to UPI').click();
      await page.getByRole('heading', { name: 'Pay ₹1,800 by UPI' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll on a phone');
      await page.screenshot({ path: path.join(shots, 'checkout-upi-phone.png'), fullPage: true });
      console.log('PASS phone width: checkout and UPI step with no sideways scroll');
      await context.close();
    }

    // 5. The admin rejects: the result page says so (no automatic return), the plan page shows Payment Rejected.
    {
      const upi = await Transaction.findOne({ orderId: pendingId, paymentMethod: 'upi' }).lean();
      const response = await nativeFetch(`${origin}/api/wallet/reject-transaction`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `token=${session(admin, 'admin')}` },
        body: JSON.stringify({ transactionId: upi.transactionId, rejectionReason: 'Payment not received' }) });
      assert.equal(response.status, 200, await response.text());
      assert.equal(await wallet(), 400, 'the wallet part came back');
      const { page, context } = await openAt(`/checkout/done/${pendingId}?from=portal`);
      await page.getByRole('heading', { name: 'Payment not approved' }).waitFor();
      await page.getByText('Reason: Payment not received. To get this plan, please buy it again.').waitFor();
      assert.equal(await page.getByText(/Taking you to/).count(), 0);
      await page.screenshot({ path: path.join(shots, 'result-rejected.png'), fullPage: true });
      await page.goto(`${origin}/plan-details/${pendingId}`);
      await page.getByText('Payment Rejected', { exact: true }).first().waitFor();
      await page.getByText('Your payment was not approved: Payment not received').locator('visible=true').first().waitFor();
      console.log('PASS rejected: the result page says why with no automatic return; the plan page shows Payment Rejected');
      await context.close();
    }
    assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
    console.log(`Screenshots: ${shots}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    await mongoose.disconnect(); await database.stop();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
