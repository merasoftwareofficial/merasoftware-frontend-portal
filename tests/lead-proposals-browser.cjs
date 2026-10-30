// The real lead detail page in a browser against the real backend routes on an in-memory database. Only
// Google Drive is fake; WhatsApp stays in the queue and no mail is sent. Optional: LEAD_TEST_CSS=<built css>
// and LEAD_TEST_SHOTS=<folder> for styled screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const backend = path.resolve(__dirname, '../../backend');
const fromBackend = name => require(require.resolve(name, { paths: [backend] }));
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

process.env.RESEND_API_KEY = 'not-a-real-provider-key';
process.env.FROM_EMAIL = 'sender@example.test';
process.env.TOKEN_SECRET_KEY = 'browser-test-secret';
process.env.ENABLE_WHATSAPP = 'true';
const drivePath = require.resolve(path.join(backend, 'helpers/googleDriveService'));
class FakeDrive {
  async createFolder() { return 'folder'; }
  async uploadFile(name) { return { id: `drive-${name}` }; }
  getDownloadLink(id) { return `https://drive.example.test/${id}`; }
}
require.cache[drivePath] = { id: drivePath, filename: drivePath, loaded: true, exports: FakeDrive };

const mongoose = fromBackend('mongoose');
const express = fromBackend('express');
const jwt = fromBackend('jsonwebtoken');
const { MongoMemoryServer } = fromBackend('mongodb-memory-server');
const load = file => require(path.join(backend, file));
const leadModel = load('models/leadModel');
const userModel = load('models/userModel');
const { Queue } = load('whatsapp/src/models.js');
const { requestMiddleware } = load('helpers/emailController');
const leadFileUpload = load('middleware/leadFileUpload');

const css = process.env.LEAD_TEST_CSS ? fs.readFileSync(process.env.LEAD_TEST_CSS, 'utf8') : '';
const shots = process.env.LEAD_TEST_SHOTS;

(async () => {
  const db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri(), { dbName: 'lead-browser-isolated-test' });
  await Queue.init();
  const admin = await userModel.create({ name: 'Admin', email: 'admin@example.test', roles: ['admin'] });
  const token = jwt.sign({ _id: String(admin._id), email: admin.email, role: 'admin' }, process.env.TOKEN_SECRET_KEY);

  const app = express();
  app.use(express.json());
  app.use(fromBackend('cookie-parser')());
  app.use('/api', requestMiddleware);
  app.use('/api/email-control', load('routes/emailControl'));
  const admin_ = (req, res, next) => { req.userId = String(admin._id); req.userRole = 'admin'; next(); };
  app.get('/api/admin/leads/:leadId', admin_, load('controller/lead/getLeadDetail'));
  app.post('/api/admin/leads/:leadId', admin_, leadFileUpload, load('controller/lead/updateLead'));
  app.post('/api/admin/leads/:leadId/proposal', admin_, leadFileUpload, load('controller/lead/uploadProposal'));
  app.post('/api/admin/leads/:leadId/proposal/:version/whatsapp', admin_, load('controller/lead/sendProposalWhatsapp'));
  let script = '';
  app.get('/app.js', (req, res) => res.type('application/javascript').send(script));
  app.get('*', (req, res) => res.type('html').send(`<style>${css}</style><div id="root"></div><script src="/app.js"></script>`));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const stubs = {
    name: 'stubs',
    setup(context) {
      context.onResolve({ filter: /(^|\/)App$/ }, args => ({ path: args.path, namespace: 'stub-app' }));
      context.onLoad({ filter: /.*/, namespace: 'stub-app' }, () => ({ loader: 'js', contents: 'export const useOnlineStatus = () => ({ isOnline: true });' }));
      context.onResolve({ filter: /AdminLayout$/ }, args => ({ path: args.path, namespace: 'stub-layout' }));
      context.onLoad({ filter: /.*/, namespace: 'stub-layout' }, () => ({ loader: 'jsx', resolveDir: path.resolve(__dirname, '..'), contents: 'export default ({ children }) => <div>{children}</div>;' }));
    },
  };
  const bundle = await build({
    stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'jsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Provider } from 'react-redux';
      import { configureStore } from '@reduxjs/toolkit';
      import { MemoryRouter, Route, Routes } from 'react-router-dom';
      import { Toaster } from 'sonner';
      import userReducer from './src/store/userSlice';
      import EmailReviewDialog from './src/components/EmailReviewDialog';
      import AdminLeadDetailPage from './src/pages/AdminLeadDetailPage';
      const store = configureStore({ reducer: { user: userReducer } });
      const leadId = new URLSearchParams(location.search).get('lead');
      createRoot(document.getElementById('root')).render(
        <Provider store={store}><MemoryRouter initialEntries={['/admin-panel/leads/' + leadId]}>
          <Routes><Route path="/admin-panel/leads/:leadId" element={<AdminLeadDetailPage />} /></Routes>
          <EmailReviewDialog /><Toaster />
        </MemoryRouter></Provider>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', plugins: [stubs],
    loader: { '.js': 'jsx', '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl' },
    define: { 'process.env.REACT_APP_BACKEND_URL': JSON.stringify(origin), 'process.env.NODE_ENV': '"production"', 'process.env': '{}', global: 'window' },
    logLevel: 'error',
  });
  script = bundle.outputFiles[0].text;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addCookies([{ name: 'token', value: token, url: origin }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const open = async lead => {
    await page.goto(`${origin}/?lead=${lead._id}`);
    await page.getByRole('heading', { name: 'Proposals' }).waitFor();
    await page.getByRole('button', { name: 'Add Proposal' }).waitFor();
  };
  const stageBox = () => page.locator('form').filter({ has: page.getByText('Stage', { exact: true }) }).first();
  const addFollowUp = async (note, choose) => {
    const form = stageBox();
    if (choose) {
      await form.locator('button[type="button"]').first().click();
      await page.getByRole('option', { name: choose, exact: true }).click();
    }
    await form.locator('textarea').fill(note);
    await form.locator('button[type="submit"]').click();
    await page.getByText(note).first().waitFor();
  };
  const addProposal = async ({ amount, note, name = 'offer.pdf', size = 2000 }) => {
    await page.getByRole('button', { name: 'Add Proposal' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Proposal' });
    await dialog.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 1) });
    if (amount) await dialog.getByLabel(/Amount/).fill(amount);
    if (note) await dialog.getByLabel(/Note/).fill(note);
    await dialog.getByRole('button', { name: 'Add Proposal' }).click();
  };
  const fresh = id => leadModel.findById(id).lean();
  const shot = name => (shots ? page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }) : null);
  let failed = false;
  const step = async (name, run) => {
    try { await run(); console.log('PASS', name); }
    catch (error) { failed = true; console.log('FAIL', name, '\n  ', String(error.message).slice(0, 400)); await shot(`fail-${name.replace(/\W+/g, '-')}`); }
  };

  const phoneLead = await leadModel.create({ name: 'Ravi Phone', phone: '9876543210', status: 'Contacted' });

  await step('the dropdown offers only Keep current, Positive and Negative', async () => {
    await open(phoneLead);
    await stageBox().locator('button[type="button"]').first().click();
    const options = await page.getByRole('option').allInnerTexts();
    assert.deepEqual(options.map(text => text.trim()), ['Keep current status (Contacted)', 'Positive', 'Negative']);
    await page.keyboard.press('Escape');
    await shot('1-contacted');
  });

  await step('a follow-up left on Keep current does not change the status', async () => {
    await open(phoneLead);
    await addFollowUp('Called, will think');
    const row = await fresh(phoneLead._id);
    assert.equal(row.status, 'Contacted');
    assert.equal(row.followUps[0].badge, 'Contacted');
  });

  await step('Add Proposal sets the status, lists the version and adds the timeline entry', async () => {
    await open(phoneLead);
    await addProposal({ amount: '25000', note: 'First offer' });
    await page.getByRole('dialog', { name: 'Review WhatsApp message' }).waitFor();
    const row = await fresh(phoneLead._id);
    assert.equal(row.status, 'Proposal Sent');
    assert.equal(row.proposals[0].amount, 25000);
    assert.ok(row.followUps.some(item => item.note === 'Proposal v1 added, ₹25,000. First offer'));
  });

  await step('the phone-only popup is for WhatsApp, and nothing is queued before Send', async () => {
    const dialog = page.getByRole('dialog', { name: 'Review WhatsApp message' });
    assert.match(await dialog.innerText(), /919876543210/);
    assert.equal(await Queue.countDocuments(), 0);
    await shot('2-whatsapp-review');
    await dialog.getByRole('button', { name: 'Send WhatsApp' }).click();
    for (const end = Date.now() + 3000; Date.now() < end && !(await Queue.countDocuments()); await page.waitForTimeout(50));
    const rows = await Queue.find().lean();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].to, '919876543210');
    assert.match(rows[0].text, /₹25,000/);
    assert.match(rows[0].text, /drive-offer\.pdf/);
  });

  await step('the page shows the version and status after the proposal', async () => {
    await open(phoneLead);
    await page.getByText('v1 · ₹25,000').waitFor();
    await page.getByText('First offer', { exact: true }).waitFor();
    assert.ok(await page.getByText('Proposal Sent').count() > 0);
    await shot('3-proposal-sent');
  });

  await step('a note on a Proposal Sent lead keeps it; Positive moves it on', async () => {
    await open(phoneLead);
    await stageBox().locator('button[type="button"]').first().click();
    const options = await page.getByRole('option').allInnerTexts();
    assert.deepEqual(options.map(text => text.trim()), ['Keep current status (Proposal Sent)', 'Contacted', 'Positive', 'Negative']);
    await page.keyboard.press('Escape');
    await addFollowUp('Client read it');
    assert.equal((await fresh(phoneLead._id)).status, 'Proposal Sent');
    await addFollowUp('Client said yes', 'Positive');
    assert.equal((await fresh(phoneLead._id)).status, 'Positive');
  });

  await step('v2 on a Positive lead keeps Positive', async () => {
    await open(phoneLead);
    await addProposal({});
    const dialog = page.getByRole('dialog', { name: 'Review WhatsApp message' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Don’t Send' }).click();
    const row = await fresh(phoneLead._id);
    assert.equal(row.status, 'Positive');
    assert.equal(row.proposals.length, 2);
    assert.equal(await Queue.countDocuments(), 1, "Don't Send queues nothing");
  });

  await step('an old Proposal Sent follow-up can be edited', async () => {
    const old = await leadModel.create({ name: 'Old', phone: '9000000011', status: 'Contacted', followUps: [{ note: 'Old entry', badge: 'Proposal Sent', createdAt: new Date(Date.now() - 86400000) }, { note: 'Newer entry', badge: 'Contacted' }] });
    await open(old);
    const entry = page.locator('div.rounded-2xl').filter({ hasText: 'Old entry' }).last();
    await entry.getByRole('button', { name: /edit/i }).click();
    const editing = page.locator('form').filter({ has: page.locator('textarea') }).nth(1);
    assert.match(await editing.locator('button[type="button"]').first().innerText(), /Proposal Sent/);
    await editing.locator('textarea').fill('Old entry edited');
    await editing.locator('button[type="submit"]').click();
    await page.getByText('Old entry edited').waitFor();
    assert.equal((await fresh(old._id)).followUps[0].badge, 'Proposal Sent');
  });

  await step('a file over 5 MB is refused on the screen and saves nothing', async () => {
    const big = await leadModel.create({ name: 'Big', phone: '9000000012', status: 'Contacted' });
    await open(big);
    await addProposal({ name: 'big.pdf', size: 6 * 1024 * 1024 });
    await page.getByText('The file must be 5 MB or smaller').first().waitFor();
    assert.equal((await fresh(big._id)).proposals.length, 0);
  });

  await step('a lead with an email gets the normal email review', async () => {
    const before = await Queue.countDocuments();
    const mail = await leadModel.create({ name: 'Mail Lead', phone: '9000000013', email: 'mail@example.test', status: 'Contacted' });
    await open(mail);
    await addProposal({ amount: '5000' });
    const dialog = page.getByRole('dialog', { name: 'Review email' });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /mail@example\.test/);
    await dialog.getByRole('button', { name: 'Don’t Send Mail' }).click();
    await page.waitForTimeout(200);
    assert.equal(await Queue.countDocuments(), before);
    assert.equal((await fresh(mail._id)).status, 'Proposal Sent');
  });

  await step('a converted lead shows its proposals but no Add Proposal or follow-up form', async () => {
    const won = await leadModel.create({ name: 'Won', phone: '9000000014', status: 'Won', convertedToUserId: new mongoose.Types.ObjectId(), proposals: [{ version: 1, name: 'x.pdf', amount: 100, downloadLink: 'https://drive.example.test/x' }] });
    await page.goto(`${origin}/?lead=${won._id}`);
    await page.getByText('v1 · ₹100').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add Proposal' }).count(), 0);
  });

  assert.deepEqual(errors, [], 'no page errors');
  await browser.close();
  server.close();
  await mongoose.disconnect();
  await db.stop();
  if (failed) process.exit(1);
  console.log('All lead browser checks passed');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
