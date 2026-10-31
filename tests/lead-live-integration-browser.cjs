// A WhatsApp Inquiry in the real Leads list and lead page, against the real backend routes on an in-memory database.
// The lead is made by the real Auto Reply job. Only Google Drive is fake; nothing is sent. Optional: LEAD_TEST_SHOTS=<folder>.
const assert = require('node:assert/strict');
const path = require('node:path');
const backend = path.resolve(__dirname, '../../backend');
const fromBackend = name => require(require.resolve(name, { paths: [backend] }));
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

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
const { MongoMemoryReplSet } = fromBackend('mongodb-memory-server');
const { MongoClient } = fromBackend('mongodb');
const load = file => require(path.join(backend, file));
const leadModel = load('models/leadModel');
const userModel = load('models/userModel');
const { Inbox, Queue, Rule, State, STATE_ID } = load('whatsapp/src/models.js');
const { processInbox } = load('helpers/autoReplyJobs');
const { requestMiddleware } = load('helpers/emailController');
const leadFileUpload = load('middleware/leadFileUpload');
const shots = process.env.LEAD_TEST_SHOTS;

(async () => {
  const db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = db.getUri();
  await mongoose.connect(db.getUri(), { dbName: 'merasoftware-fix-test' });
  await Promise.all([Queue.init(), Inbox.init(), Rule.init()]);
  const admin = await userModel.create({ name: 'Admin', email: 'admin@example.test', roles: ['admin'] });
  const token = jwt.sign({ _id: String(admin._id), email: admin.email, role: 'admin' }, process.env.TOKEN_SECRET_KEY);

  const app = express();
  app.use(express.json());
  app.use(fromBackend('cookie-parser')());
  app.use('/api', requestMiddleware);
  app.use('/api/email-control', load('routes/emailControl'));
  const admin_ = (req, res, next) => { req.userId = String(admin._id); req.userRole = 'admin'; next(); };
  app.get('/api/admin/lead-updates', load('middleware/authToken'), load('routes/leadUpdates'));
  app.get('/api/admin/final-message/count', (req,res) => res.json({success:true,data:{count:0}}));
  app.get('/api/admin/leads', admin_, load('controller/lead/getLeads'));
  app.get('/api/admin/leads/:leadId', admin_, load('controller/lead/getLeadDetail'));
  app.post('/api/admin/leads/:leadId', admin_, leadFileUpload, load('controller/lead/updateLead'));
  app.post('/api/admin/leads/:leadId/proposal', admin_, leadFileUpload, load('controller/lead/uploadProposal'));
  app.post('/api/admin/leads/:leadId/convert', admin_, load('controller/lead/convertLead'));
  let script = '';
  app.get('/app.js', (req, res) => res.type('application/javascript').send(script));
  app.get('*', (req, res) => res.type('html').send('<div id="root"></div><script src="/app.js"></script>'));
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
      import AdminLeadsPage from './src/pages/AdminLeadsPage';
      const store = configureStore({ reducer: { user: userReducer } });
      const leadId = new URLSearchParams(location.search).get('lead');
      createRoot(document.getElementById('root')).render(
        <Provider store={store}><MemoryRouter initialEntries={[leadId ? '/admin-panel/leads/' + leadId : '/admin-panel/leads']}>
          <Routes>
            <Route path="/admin-panel/leads" element={<AdminLeadsPage />} />
            <Route path="/admin-panel/leads/:leadId" element={<AdminLeadDetailPage />} />
          </Routes>
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
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const newInquiry = async (phone, id) => {
    await Inbox.create({ messageId: id, phone, text: 'Hello! Can I get more info on this?', profileName: 'Ravi WA', sentAt: new Date(), status: 'new' });
    await processInbox();
    return leadModel.findOne({ 'inquiry.message': { $exists: true }, phone: `+${phone}` }).lean();
  };
  const toast = text => page.getByText(text).first().waitFor();
  const openLead = async lead => { await page.goto(`${origin}/?lead=${lead._id}`); await page.getByText('WhatsApp ad message').waitFor(); };
  const followUp = async (stage, note) => {
    const form = page.locator('form').filter({ has: page.getByText('Stage', { exact: true }) }).first();
    await form.locator('button[type="button"]').first().click();
    await page.getByRole('option', { name: stage, exact: true }).click();
    await form.locator('textarea').first().fill(note);
    await form.locator('button[type="submit"]').click();
  };
  let passed = 0;
  const check = async (name, work) => { await work(); passed += 1; console.log(`  ok ${name}`); };

  try {
    await State.updateOne({ _id: STATE_ID }, { $set: { autoReply: { recognise: true, sendReplies: false, addLeads: true } } }, { upsert: true });
    const lead = await newInquiry('919876543210', 'first');
    assert.equal(lead.name, undefined);
    const other = await newInquiry('919111111111', 'second');

    console.log('Live integration: database and application ready');
    const worker = new MongoClient(db.getUri()); await worker.connect();
    const list = await context.newPage();
    try {
      await page.goto(`${origin}/?lead=${lead._id}`);
      await page.getByRole('heading', {name: '+919876543210'}).waitFor();
      await list.goto(origin); await list.getByText('+919876543210').first().waitFor();
      // Allow both SSE subscriptions to establish and finish their initial reconciliation.
      await page.waitForTimeout(1800);
      console.log('Live integration: both screens ready');
      const form = page.locator('form').filter({has: page.getByText('Stage', {exact:true})}).first();
      await form.locator('button[type="button"]').first().click();
      await page.getByRole('option',{name:'Negative',exact:true}).click();
      await form.locator('textarea').first().fill('My unsaved follow-up');
      await page.getByRole('button',{name:'Edit Lead',exact:true}).click();
      await page.getByPlaceholder('Lead full name').fill('Unsaved name');
      const start=Date.now();
      await worker.db('merasoftware-fix-test').collection(leadModel.collection.name).updateOne({_id:lead._id},{$set:{name:'Live worker update',status:'Contacted'}});
      await page.getByRole('heading',{name:'Live worker update',exact:true}).waitFor();
      await list.getByText(/\d+\. Live worker update/).waitFor();
      assert.equal(await page.getByPlaceholder('Lead full name').inputValue(),'Unsaved name','open editor stays intact');
      assert.equal(await form.locator('textarea').first().inputValue(),'My unsaved follow-up','unsaved follow-up stays intact');
      assert.match(await form.locator('button[type="button"]').first().innerText(),/Negative/,'selected follow-up stage stays intact');
      console.log('PASS real database -> SSE -> two actual Leads views, including separate worker connection; update visible in '+(Date.now()-start)+'ms. Open editor, follow-up text and selected stage preserved.');
      const {FinalMessage}=load('whatsapp/src/models.js');
      await worker.db('merasoftware-fix-test').collection(FinalMessage.collection.name).insertOne({leadId:lead._id,status:'replied',lastReplyText:'Live reply'});
      await page.getByText(/Final message replied: Live reply/).waitFor();
      console.log('PASS separate worker final-message reply refreshes the actual lead page.');
    } finally {await worker.close();await list.close();}

    assert.deepEqual(errors, [], 'no page errors');
    console.log('Real live integration checks passed');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    console.log('Live integration: closing database');
    await mongoose.disconnect();
    await db.stop();
  }
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
