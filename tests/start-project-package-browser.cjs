// Get a Service → Start a Project (owner decision 10 Nov 2026), end to end in a browser: the real
// StartProjectRequest, StartProjectPackage and StartProjectRequestDetails pages (bundled alone with esbuild)
// against the REAL backend routes (routes/packageStarts.js, the call-back controller) on an in-memory MongoDB,
// signed in with a real session cookie. Covers:
//   package system off: the packages page lands straight on the call-back form (with its category dropdown);
//   package system on: a package card (price, main price crossed out, one "What's included" link) and the
//     call-back card; the package page (included work, payment options, the backend's price); a wallet payment
//     that creates the project; a UPI payment (QR, reference check) that waits for the team; a stale price
//     (409) that asks for the price again; the call-back form saving a lead; phone width without sideways scroll.
// Mail provider mocked and every other network call blocked. Needs a portal build for its CSS (npm run build).
// Usage (from frontend/): node tests/start-project-package-browser.cjs
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

const shots = path.join(require('node:os').tmpdir(), `start-project-package-${Date.now()}`);

(async () => {
  Object.assign(process.env, {
    TOKEN_SECRET_KEY: 'isolated-start-project-secret'.repeat(2), RESEND_API_KEY: 'isolated-no-real-key', FROM_EMAIL: 'sender@example.test',
    ADMIN_DASHBOARD_URL: 'https://portal.example.test', PORTFOLIO_WEBSITE_URL: 'https://website.example.test',
    PORTFOLIO_INTEGRATION_SECRET: 'isolated-test-secret-32-characters-long', PACKAGE_START_REQUESTS_ENABLED: 'false',
  });
  const nativeFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url) === 'https://api.resend.com/emails') return new Response(JSON.stringify({ id: 'isolated' }), { status: 200 });
    if (String(url).includes('/api/offers/live')) return new Response(JSON.stringify({ offers: [], catalogueOffers: [], packagePages: [] }), { status: 200 });
    throw new Error(`External network blocked: ${url}`);
  };
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  for (const file of fs.readdirSync(path.join(backend, 'models'))) if (file.endsWith('.js')) require(path.join(backend, 'models', file));
  const Order = require(path.join(backend, 'models/orderProductModel'));
  const User = require(path.join(backend, 'models/userModel'));
  const Lead = require(path.join(backend, 'models/leadModel'));
  const Category = require(path.join(backend, 'models/categoryBasePriceModel'));
  const StartRequest = require(path.join(backend, 'models/packageStartRequestModel'));
  const { savePackage } = require(path.join(backend, 'helpers/salesPackages'));
  await Promise.all([Order.init(), User.init(), Lead.init(), StartRequest.init()]);
  await Category.create({ category: 'standard_websites', basePrice: 10000 });
  const [rich, poor] = await User.create([
    { name: 'Rich Client', email: 'rich@example.test', roles: ['customer'], phone: '+919876500002', walletBalance: 20000 },
    { name: 'Poor Client', email: 'poor@example.test', roles: ['customer'], phone: '+919876500003', walletBalance: 0 },
  ]);
  const base = { description: 'A business website with everything to start.', status: 'published', category: 'standard_websites', billing: 'one_time',
    portalUploads: true, paymentOptions: ['full', 'installments_2'], regularPrice: 15000, discountedPrice: 10000, offerExtraPrice: 0, offerSlug: '',
    inclusions: ['5 pages', 'Mobile friendly design'], terms: ['Content is supplied by the client'], linkedPlanIds: [], order: 0, pages: [] };
  await savePackage({ ...base, id: '', name: 'Business Starter' }, true, []);
  await savePackage({ ...base, id: '', name: 'Monthly Care', billing: 'monthly', paymentOptions: undefined, regularPrice: 1500, discountedPrice: 1000,
    monthly: { pricing: 'fixed', billingOptions: [{ billingCycle: 'monthly', discountPercent: 0 }], maxTenureMonths: 12 } }, true, []);

  const cssDir = path.join(root, 'build/static/css');
  const css = fs.readFileSync(path.join(cssDir, fs.readdirSync(cssDir).find((name) => /^main\..*\.css$/.test(name))), 'utf8');
  const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.PUBLIC_URL': '""', 'process.env.REACT_APP_BACKEND_URL': '""' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import{Provider}from'react-redux';import{configureStore}from'@reduxjs/toolkit';import{BrowserRouter,Routes,Route,useParams}from'react-router-dom';
      import StartProject from './src/pages/startproject';import StartProjectRequest from './src/pages/StartProjectRequest';import StartProjectPackage from './src/pages/StartProjectPackage';import StartProjectRequestDetails from './src/pages/StartProjectRequestDetails';
      const initial={user:{user:{_id:'x',name:'Client',role:'customer',roles:['customer'],phone:'+919876500002'},initialized:true}};const store=configureStore({reducer:(s=initial)=>s});
      const Project=()=>{const{orderId}=useParams();return <h1>Project page {orderId}</h1>};
      createRoot(document.getElementById('root')).render(<Provider store={store}><BrowserRouter><Routes>
        <Route path="/start-new-project" element={<StartProject/>}/>
        <Route path="/start-new-project/project" element={<StartProjectRequest/>}/>
        <Route path="/start-new-project/project/package/:packageId" element={<StartProjectPackage/>}/>
        <Route path="/start-new-project/project/call-back" element={<StartProjectRequestDetails/>}/>
        <Route path="/start-new-project/project/:category" element={<StartProjectRequestDetails/>}/>
        <Route path="/project-details/:orderId" element={<Project/>}/>
      </Routes></BrowserRouter></Provider>);` },
    plugins: [{ name: 'isolated-shell', setup(builder) {
      builder.onResolve({ filter: /DashboardLayout$/ }, () => ({ path: 'shell', namespace: 'fixture' }));
      builder.onLoad({ filter: /^shell$/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Layout({children}){return <main className="portal-surface">{children}</main>}`, loader: 'jsx', resolveDir: root }));
    } }],
  });

  const authToken = require(path.join(backend, 'middleware/authToken'));
  const projectRequest = require(path.join(backend, 'controller/lead/customerProjectRequest'));
  const app = express(); app.use(express.json()); app.use(cookieParser());
  app.use('/api', require(path.join(backend, 'helpers/emailController')).requestMiddleware);
  app.use('/api/package-starts', authToken, require(path.join(backend, 'routes/packageStarts')));
  app.get('/api/customer/project-request/categories', authToken, projectRequest.getProjectRequestCategories);
  app.post('/api/customer/project-request', authToken, projectRequest.createProjectRequest);
  app.use('/api', (req, res) => res.json({ success: true, data: [] }));
  app.get('/app.js', (req, res) => res.type('application/javascript').send(Buffer.from(bundle.outputFiles[0].contents)));
  app.get('/app.css', (req, res) => res.type('text/css').send(css));
  app.use((req, res) => res.type('html').send('<!doctype html><html data-theme="light" data-accent="cyan"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.FORNTEND_URL = origin; // the backend's same-site check accepts this test portal
  const session = (user) => jwt.sign({ _id: String(user._id), role: 'customer' }, process.env.TOKEN_SECRET_KEY, { algorithm: 'HS256' });

  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const openAt = async (user, address, viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'token', value: session(user), url: origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + address);
    return { page, context };
  };
  const wallet = async (user) => (await User.findById(user._id).lean()).walletBalance;
  const noSidewaysScroll = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${label}: no sideways scroll`);
  try {
    // 1. Package system off: the packages page lands on the call-back form; the form asks what the enquiry is about.
    {
      const { page, context } = await openAt(rich, '/start-new-project/project');
      await page.getByRole('heading', { name: 'Arrange a call back' }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/start-new-project/project/call-back');
      await page.getByText('What is your enquiry about?').waitFor();
      console.log('PASS system off: Start a Project goes straight to the call-back form, with its category dropdown');
      await context.close();
    }

    process.env.PACKAGE_START_REQUESTS_ENABLED = 'true';

    // 2. System on: one-time package card (monthly one is not offered), call-back card, the package page.
    {
      const { page, context } = await openAt(rich, '/start-new-project/project');
      await page.getByRole('heading', { name: 'Business Starter' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Monthly Care' }).count(), 0, 'monthly packages are not listed');
      await page.getByText('₹10,000').first().waitFor();
      assert.equal(await page.locator('s', { hasText: '₹15,000' }).count(), 1, 'main price is crossed out');
      await page.getByRole('heading', { name: 'Arrange a call back' }).waitFor();
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(shots, 'packages-desktop.png'), fullPage: true });
      await page.getByRole('link', { name: /What's included/ }).click();
      await page.getByText('Mobile friendly design').waitFor();
      await page.getByRole('radio', { name: /2 installments/ }).click();
      await page.getByText('Due at the start').waitFor();
      await page.getByText('₹5,000').first().waitFor();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(shots, 'package-desktop.png'), fullPage: true });
      console.log('PASS packages page: one-time package card with its price, call-back card, package page with the backend price per payment option');

      // 3. Wallet pays the first installment: the project is created, the request closes, the client is led to the project.
      await page.getByRole('button', { name: 'Proceed to pay →' }).click();
      await page.getByRole('heading', { name: 'Your project is created' }).waitFor();
      assert.equal(await Order.countDocuments(), 1);
      assert.equal(await wallet(rich), 15000, 'the first installment came from the wallet');
      const order = await Order.findOne().lean();
      assert.equal(order.orderVisibility, 'approved');
      const request = await StartRequest.findOne({ userId: rich._id }).lean();
      assert.equal(request.closedReason, 'project_created', 'the buy request is closed by the project');
      assert.equal(await page.getByRole('link', { name: 'Open my project →' }).getAttribute('href'), `/project-details/${order._id}`);
      await page.screenshot({ path: path.join(shots, 'done-desktop.png'), fullPage: true });
      console.log('PASS wallet payment: one project, one debit, the buy request closed, link to the project');
      await context.close();
    }

    // 4. UPI: no wallet money, so the QR and the reference are asked for; the project waits for the team.
    {
      const { page, context } = await openAt(poor, '/start-new-project/project');
      await page.getByRole('link', { name: /What's included/ }).click();
      await page.getByRole('button', { name: 'Proceed to pay →' }).and(page.locator(':enabled')).click();
      await page.getByRole('heading', { name: /Pay ₹10,000 by UPI/ }).waitFor();
      assert.equal(await page.locator('svg[role="img"], svg').filter({ has: page.locator('path') }).count() > 0, true, 'the QR code is shown');
      const send = page.getByRole('button', { name: 'Send payment for checking' });
      assert.equal(await send.isDisabled(), true, 'no reference, no send');
      await page.getByLabel('UPI reference number').fill('12345');
      assert.equal(await send.isDisabled(), true, 'a short reference is not enough');
      await page.screenshot({ path: path.join(shots, 'upi-desktop.png'), fullPage: true });
      await page.getByLabel('UPI reference number').fill('123456789012');
      await send.click();
      await page.getByRole('heading', { name: 'Payment submitted' }).waitFor();
      const order = await Order.findOne({ userId: poor._id }).lean();
      assert.equal(order.orderVisibility, 'pending-approval', 'a UPI payment waits for the team');
      assert.equal(await wallet(poor), 0);
      console.log('PASS UPI payment: QR, reference check, the project waits for approval');
      await context.close();
    }

    // 5. The call-back form: choose the enquiry, fill the rest, a lead is saved. Then phone width.
    {
      const { page, context } = await openAt(poor, '/start-new-project/project');
      await page.getByRole('link', { name: /Ask for a call/ }).click();
      await page.getByRole('heading', { name: 'Arrange a call back' }).waitFor();
      await page.getByRole('button', { name: 'Request a callback' }).click();
      await page.getByRole('alert').getByText(/what your enquiry is about/).waitFor();
      await page.getByLabel('What is your enquiry about?').selectOption({ index: 1 });
      await page.getByLabel('What is your budget?').selectOption('under_30k');
      await page.getByLabel('Best time to call you').selectOption('morning');
      await page.getByRole('button', { name: 'Request a callback' }).click();
      await page.getByRole('heading', { name: /We'll call you soon/ }).waitFor();
      assert.equal(await Lead.countDocuments({ source: 'Portal – project request' }), 1);
      await page.goBack().catch(() => {});
      await context.close();
    }
    console.log('PASS call-back form: the enquiry type is required and chosen in the form; a lead is saved');

    // 6. A price that changed after the client saw it: nothing is bought, the new price is shown again.
    {
      const { page, context } = await openAt(rich, '/start-new-project/project/package/business-starter');
      await page.getByText('Package price').waitFor();
      const before = await Order.countDocuments();
      await savePackage({ ...base, id: 'business-starter', name: 'Business Starter', discountedPrice: 9000 }, false, []);
      await page.getByRole('button', { name: 'Proceed to pay →' }).click();
      await page.getByRole('alert').getByText(/Review the new price/).waitFor();
      await page.getByText('₹9,000').first().waitFor();
      assert.equal(await Order.countDocuments(), before, 'a refused price buys nothing');
      assert.equal(await wallet(rich), 15000);
      await context.close();
    }
    console.log('PASS stale price: refused with a notice, nothing bought, the new price is shown');

    {
      const { page, context } = await openAt(rich, '/start-new-project/project', { width: 390, height: 800 });
      await page.getByRole('heading', { name: 'Business Starter' }).waitFor();
      await noSidewaysScroll(page, 'packages page');
      await page.screenshot({ path: path.join(shots, 'packages-phone.png'), fullPage: true });
      await page.getByRole('link', { name: /What's included/ }).click();
      await page.getByRole('radio', { name: /Full payment/ }).waitFor();
      await noSidewaysScroll(page, 'package page');
      await page.screenshot({ path: path.join(shots, 'package-phone.png'), fullPage: true });
      await context.close();
    }
    console.log('PASS phone width: no sideways scroll on the packages page and the package page');

    assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
    console.log(`Screenshots: ${shots}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    global.fetch = nativeFetch;
    await mongoose.disconnect(); await database.stop();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
