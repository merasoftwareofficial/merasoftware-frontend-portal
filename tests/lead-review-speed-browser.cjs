// Send message's popup: the Message type dropdown appears only on a lead's draft, changes the same draft, and keeps the channel.
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
      window.calls = []; window.inline = true; window.failAction = false;
      const paragraph = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
      const channelOptions = [{ id: 'email', label: 'Email', enabled: true }, { id: 'whatsapp', label: 'WhatsApp', enabled: true }, { id: 'both', label: 'Both', enabled: true }];
      const messageTypes = [
        { id: 'lead.message', label: 'General message', enabled: true },
        { id: 'lead.created', label: 'New lead welcome', enabled: false, reason: 'Off in Email Templates' },
        { id: 'lead.finalMessage', label: 'Final message', enabled: true, note: 'This only sends the message.' },
      ];
      const review = (event, name, text) => ({ _id: 'draft1', event, status: 'pending', to: ['ravi@example.test'], subject: name, text, html: '<p>' + text + '</p>', doc: paragraph(text),
        selectedTemplateId: event + '-standard', templateLabel: 'Standard', templateDoc: paragraph(text), editorFields: { variables: [], blocks: [] },
        templateOptions: [{ id: event + '-standard', name: 'Standard', system: true }, { id: event + '-two', name: 'Second', system: false }],
        channelOptions, defaultChannel: 'both', messageTypes });
      window.fetch = async (url, options = {}) => {
        window.calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
        const json = data => new Response(JSON.stringify({ success: true, ...data }), { headers: { 'content-type': 'application/json' } });
        if (String(url).endsWith('/api/admin/leads/lead1/message') || String(url).endsWith('/api/admin/leads/lead1/final-message')) {
          await new Promise(resolve => setTimeout(resolve, 700));
          if (window.failAction) throw new Error('Simulated offline');
          return json({ emailStatus: 'awaiting-review', emailDraftIds: ['draft1'], ...(window.inline ? { emailReviewDraft: review('lead.message', 'A message for you', 'General text') } : {}) });
        }
        if (String(url).endsWith('/drafts/draft1/preview')) return json({ data: { subject: 'Second subject', text: 'Second text', doc: paragraph('Second text'), html: '<p>Second text</p>' } });
        if (String(url).endsWith('/drafts/draft1')) return json({ data: review('lead.message', 'A message for you', 'General text') });
        if (String(url).endsWith('/drafts/draft1/message-type')) return json({ data: review(JSON.parse(options.body).event, 'Your free website offer', 'Final text') });
        if (String(url).endsWith('/drafts/draft1/decision')) return json({ data: { status: 'queued', delivery: { channels: ['whatsapp'], email: 'not-selected', whatsapp: 'queued' } } });
        return json({ data: {} });
      };
      const { reviewEmail } = require('./src/helpers/emailReview');
      const EmailReviewDialog = require('./src/components/EmailReviewDialog').default;
      window.sendMessage = () => fetch('http://email.test/api/admin/leads/lead1/message', { method: 'POST' }).then(() => { window.finished = true; });
      window.sendFinal = () => fetch('http://email.test/api/admin/leads/lead1/final-message', { method: 'POST' }).then(() => { window.finalFinished = true; }).catch(() => { window.failed = true; });
      window.otherReview = () => reviewEmail({ _id: 'other', event: 'lead.proposal', status: 'pending', to: ['a@example.test'], subject: 'Other', text: 'Other text', html: '<p>Other</p>',
        templateOptions: [{ id: 'x', name: 'Standard' }], selectedTemplateId: 'x', templateLabel: 'Standard', doc: paragraph('Other text') }, 'Other description');
      createRoot(document.getElementById('root')).render(<EmailReviewDialog />);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.REACT_APP_BACKEND_URL': '"http://email.test"', 'process.env.NODE_ENV': '"production"' },
  });
  const app = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(script.outputFiles[0].text); }
    res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  let browser;
  try {
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${app.address().port}`);
    await page.waitForFunction(() => typeof window.sendMessage === 'function');
    await page.waitForTimeout(100);

    const start = Date.now();
    await page.evaluate(() => { window.sendMessage(); });
    await page.getByRole('dialog', { name: 'Preparing message' }).waitFor({ timeout: 500 });
    const shellMs = Date.now() - start;
    assert.equal(await page.evaluate(() => window.calls.length), 1);
    await page.waitForFunction(() => document.querySelector('#email-review-type'));
    console.log('Delayed API 700ms; popup shell visible in ' + shellMs + 'ms');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const type = page.getByLabel('Message type');
    assert.match(await page.getByRole('heading', { level: 2 }).innerText(), /Send message/);
    assert.doesNotMatch(await dialog.innerText(), /The action is saved/);
    assert.equal(await type.inputValue(), 'lead.message');
    assert.equal(await type.locator('option[value="lead.created"]').isDisabled(), true);
    assert.equal(await page.getByLabel('Template', { exact: true }).locator('option[value="current"]').count(), 0, 'no Current draft here');

    await page.getByLabel('Template', { exact: true }).selectOption('lead.message-two');
    await page.waitForFunction(() => document.querySelector('#review-subject')?.value === 'Second subject' || [...document.querySelectorAll('input')].some(el => el.value === 'Second subject'));
    await page.getByLabel('Send via').selectOption('whatsapp');
    await type.selectOption('lead.finalMessage');
    await page.waitForFunction(() => window.calls.some(call => call.url.endsWith('/message-type')));
    await page.getByText('This only sends the message.').waitFor();
    assert.equal(await page.getByLabel('Subject', { exact: true }).inputValue().catch(() => ''), 'Your free website offer');
    assert.equal(await page.getByLabel('Send via').inputValue(), 'whatsapp', 'the chosen channel stays');
    assert.equal(await dialog.evaluate(node => node.open), true);

    await page.getByRole('button', { name: 'Send WhatsApp', exact: true }).click();
    await page.waitForFunction(() => window.finished);
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.filter(call => call.url.endsWith('/drafts/draft1')).length, 0, 'no extra draft read with inline payload');
    assert.equal(calls.filter(call => call.url.endsWith('/decision')).length, 1, 'one decision only');
    const decision = calls.find(call => call.url.endsWith('/decision'));
    assert.equal(decision.body.choice, 'send');
    assert.equal(decision.body.channels, 'whatsapp');
    assert.equal(decision.body.templateId, 'lead.finalMessage-standard');

    await page.evaluate(() => { window.otherReview(); });
    await dialog.waitFor();
    assert.equal(await page.getByLabel('Message type').count(), 0, 'other popups stay as they were');
    assert.match(await dialog.innerText(), /Other description/);
    assert.equal(await page.getByLabel('Template', { exact: true }).locator('option[value="current"]').count(), 1);
    await page.getByRole('button', { name: /Don.t Send/ }).click();
    await page.evaluate(() => { window.failAction = true; window.sendFinal(); });
    await page.getByRole('dialog', { name: 'Preparing message' }).waitFor();
    await page.waitForFunction(() => window.failed);
    assert.equal(await page.locator('dialog[open]').count(), 0, 'network failure leaves no stuck popup');
    await page.evaluate(() => { window.failAction = false; window.inline = false; window.sendFinal(); });
    await page.getByLabel('Message type').waitFor();
    await page.getByRole('button', { name: /Don.t Send/ }).click();
    await page.waitForFunction(() => window.finalFinished);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.url.endsWith('/drafts/draft1')).length), 1, 'legacy payload still supported');
    assert.deepEqual(errors, []);
    console.log('lead message browser: pass');
  } finally {
    await browser?.close();
    app.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
