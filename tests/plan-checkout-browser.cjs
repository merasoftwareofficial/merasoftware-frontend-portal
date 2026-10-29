// Client buys a plan in the portal (merasoftware/src/docs/plan.md §4), end to end in a browser:
// the real ServicePlanDetail and PlanDetails pages (bundled alone with esbuild) against the REAL backend
// controllers on an in-memory MongoDB, signed in with a real session cookie. Covers wallet-only
// (active, uploads open), wallet + UPI (Approval Pending, uploads closed), admin rejection (Payment
// Rejected), a double click (one order, one debit), the success popup's two buttons and phone width.
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
      import ServicePlanDetail from './src/pages/ServicePlanDetail';import PlanDetails from './src/pages/PlanDetails';import Context from './src/context';
      const initial={user:{user:{_id:'${client._id}',name:'Plan Client',role:'customer',roles:['customer']},initialized:true}};const store=configureStore({reducer:(s=initial)=>s});
      function App(){const[walletBalance,setWallet]=useState(null);const fetchWalletBalance=()=>fetch('/fixture/wallet').then(r=>r.json()).then(d=>setWallet(d.walletBalance));React.useEffect(()=>{fetchWalletBalance()},[]);
        if(walletBalance===null)return null;
        return <Context.Provider value={{walletBalance,fetchWalletBalance}}><BrowserRouter><Routes><Route path="/service-plan-detail/:planId" element={<ServicePlanDetail/>}/><Route path="/plan-details/:orderId" element={<PlanDetails/>}/></Routes></BrowserRouter></Context.Provider>}
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
  app.post('/api/customer/service-plan-order', authToken, require(path.join(backend, 'controller/order/customerCreateServicePlanOrder')));
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
  const openPlanPage = async (viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'token', value: session(client, 'customer'), url: origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/service-plan-detail/${plan._id}`);
    const pay = page.getByRole('button', { name: /^Pay ₹/ });
    await pay.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^Pay ₹/.test(b.textContent) && !b.disabled));
    return { page, context, pay };
  };
  const wallet = async () => (await User.findById(client._id).lean()).walletBalance;
  try {
    // 1. Wallet covers it, and a double click: one order, one debit, active at once, uploads open.
    {
      const { page, context, pay } = await openPlanPage();
      await pay.click();
      const walletButton = page.getByRole('button', { name: 'Pay from Wallet' });
      await walletButton.dblclick();
      const popup = page.getByRole('dialog', { name: 'Your plan is active' });
      await popup.waitFor();
      assert.equal(await Order.countDocuments(), 1, 'double click made one order');
      assert.equal(await Transaction.countDocuments({ paymentMethod: 'wallet' }), 1, 'double click debited once');
      assert.equal(await wallet(), 3500);
      assert.equal(await popup.getByRole('link', { name: 'Back to website' }).getAttribute('href'), WEBSITE);
      await page.screenshot({ path: path.join(shots, 'wallet-popup.png') });
      await popup.getByRole('button', { name: 'View my plan →' }).click();
      const orderId = String((await Order.findOne().lean())._id);
      await page.waitForURL(`**/plan-details/${orderId}`);
      await page.getByText('Active', { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Request Update/ }).first().isEnabled(), true);
      console.log('PASS wallet only: one order and one debit on a double click; popup with both buttons; plan active, uploads open');
      await context.close();
    }

    // 2. Wallet + UPI: QR for the remainder only, reference sent, Approval Pending and no uploads.
    let pendingId;
    {
      await User.updateOne({ _id: client._id }, { $set: { walletBalance: 400 } });
      const { page, context, pay } = await openPlanPage();
      await pay.click();
      await page.getByRole('button', { name: 'Continue to UPI' }).click();
      await page.getByRole('heading', { name: 'Pay ₹1,100' }).waitFor();
      await page.getByPlaceholder('12-digit reference number').fill('412345678901');
      await page.getByRole('button', { name: 'Send payment for checking' }).click();
      const popup = page.getByRole('dialog', { name: 'Payment submitted' });
      await popup.waitFor();
      assert.match(await popup.innerText(), /will let you know when it is approved/);
      assert.equal(await wallet(), 0);
      pendingId = String((await Order.findOne().sort({ createdAt: -1 }).lean())._id);
      await popup.getByRole('button', { name: 'View my plan →' }).click();
      await page.waitForURL(`**/plan-details/${pendingId}`);
      await page.getByText('Approval Pending', { exact: true }).first().waitFor();
      await page.getByText('We are checking your payment. You can send your data once it is approved.').locator('visible=true').first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Request Update/ }).first().isDisabled(), true);
      await page.screenshot({ path: path.join(shots, 'plan-approval-pending.png'), fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll on a phone');
      // The phone layout has its own Request Update button: it carries the same reason, and no update says "Ready to use".
      await page.getByText('We are checking your payment. You can send your data once it is approved.').locator('visible=true').first().waitFor();
      assert.equal(await page.getByText('Ready to use', { exact: true }).count(), 0);
      assert.ok(await page.getByText('Opens after payment approval', { exact: true }).count() > 0);
      await page.screenshot({ path: path.join(shots, 'plan-approval-pending-phone.png'), fullPage: true });
      console.log('PASS wallet + UPI: QR for the remainder, popup, Approval Pending with uploads closed, phone width');
      await context.close();
    }

    // 3. The admin rejects the UPI payment: Payment Rejected with the reason; the wallet part comes back.
    {
      const upi = await Transaction.findOne({ orderId: pendingId, paymentMethod: 'upi' }).lean();
      const response = await nativeFetch(`${origin}/api/wallet/reject-transaction`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `token=${session(admin, 'admin')}` },
        body: JSON.stringify({ transactionId: upi.transactionId, rejectionReason: 'Payment not received' }) });
      assert.equal(response.status, 200, await response.text());
      assert.equal(await wallet(), 400);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: 'token', value: session(client, 'customer'), url: origin }]);
      const page = await context.newPage(); page.setDefaultTimeout(20_000);
      await page.goto(`${origin}/plan-details/${pendingId}`);
      await page.getByText('Payment Rejected', { exact: true }).first().waitFor();
      await page.getByText('Your payment was not approved: Payment not received').locator('visible=true').first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Request Update/ }).first().isDisabled(), true);
      await page.screenshot({ path: path.join(shots, 'plan-rejected.png'), fullPage: true });
      console.log('PASS rejected: Payment Rejected with the reason, uploads closed, wallet part returned');
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
