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
      window.emailCalls = [];
      window.fetch = async (url, options = {}) => {
        window.emailCalls.push({ url: String(url), options });
        const json = data => new Response(JSON.stringify({ success: true, ...data }), { headers: { 'content-type': 'application/json' } });
        if (String(url).endsWith('/api/action')) return json({ emailStatus: 'awaiting-review', emailDraftIds: ['draft1'] });
        if (String(url).endsWith('/api/admin-action')) return json({ emailStatus: 'awaiting-review', emailDraftIds: ['draft2'] });
        const paragraph = (...content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
        if (String(url).endsWith('/drafts/draft2')) return json({ data: { _id: 'draft2', to: ['client@example.test'], subject: 'Project Cancelled', text: 'Hello Ravi', html: '<p>prepared mail</p>',
          doc: paragraph({ type: 'text', text: 'Hello ' }, { type: 'emailVariable', attrs: { key: 'name' } }),
          editorFields: { variables: [{ key: 'name', label: 'Customer name', hint: 'The customer’s name' }], blocks: [] },
          templateOptions: [{ id: 'sys1', name: 'Standard', system: true }, { id: 'short1', name: 'Short', system: false }] } });
        if (String(url).endsWith('/drafts/draft2/preview')) {
          const body = JSON.parse(options.body);
          return json({ data: body.templateId ? { subject: 'Short subject', text: 'Short text', doc: paragraph({ type: 'text', text: 'Short text' }), html: '<p>short mail</p>' } : { html: '<p>edited preview</p>' } });
        }
        if (String(url).endsWith('/drafts/draft1')) return new Response(JSON.stringify({ success: true, data: { _id: 'draft1', to: ['client@example.test'], subject: 'Action invoice', text: 'Invoice message', attachments: [{ filename: 'invoice.pdf' }] } }), { headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ success: true, data: { status: 'sent' } }), { headers: { 'content-type': 'application/json' } });
      };
      const { reviewEmail } = require('./src/helpers/emailReview');
      const EmailReviewDialog = require('./src/components/EmailReviewDialog').default;
      window.askEmail = () => reviewEmail({ to: ['lead@example.test'], subject: 'Welcome', text: 'Hello lead' }, 'The lead will be added with either choice.').then(result => { window.emailDecision = result; });
      window.runAction = () => fetch('http://email.test/api/action', { method: 'POST' }).then(() => { window.actionFinished = true; });
      window.runAdminAction = () => fetch('http://email.test/api/admin-action', { method: 'POST' }).then(() => { window.adminActionFinished = true; });
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
    await page.waitForFunction(() => typeof window.askEmail === 'function');
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.askEmail(); });
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /lead@example.test/);
    await page.getByLabel('Subject', { exact: true }).fill('Edited welcome');
    await page.getByLabel('Message', { exact: true }).fill('Edited message');
    await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.waitForFunction(() => window.emailDecision);
    const leadDecision = await page.evaluate(() => window.emailDecision);
    assert.equal(leadDecision.choice, 'send'); assert.equal(leadDecision.subject, 'Edited welcome'); assert.equal(leadDecision.text, undefined);
    assert.deepEqual(leadDecision.doc, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited message' }] }] });
    assert.equal(await page.evaluate(() => window.emailCalls.length), 0, 'Preview never sends');
    await page.evaluate(() => { window.emailDecision = null; window.askEmail(); });
    await page.getByRole('button', { name: 'Don’t Send Mail' }).click();
    await page.waitForFunction(() => window.emailDecision);
    assert.equal(await page.evaluate(() => window.emailDecision.choice), 'skip');
    await page.evaluate(() => { window.emailDecision = null; window.askEmail(); });
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.emailDecision);
    assert.equal(await page.evaluate(() => window.emailDecision.choice), 'skip');
    await page.evaluate(() => { window.runAction(); });
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /invoice.pdf/);
    assert.equal(await page.evaluate(() => !!window.actionFinished), false);
    assert.equal(await page.getByLabel('Template', { exact: true }).count(), 0, 'Customers get no template choice');
    await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.waitForFunction(() => window.actionFinished);
    const decisions = await page.evaluate(() => window.emailCalls.filter(call => call.url.endsWith('/decision')));
    assert.equal(decisions.length, 1); assert.equal(JSON.parse(decisions[0].options.body).choice, 'send');
    assert.equal(JSON.parse(decisions[0].options.body).templateId, undefined, 'No template choice without templateOptions');

    await page.evaluate(() => { window.runAdminAction(); });
    await page.getByRole('dialog').waitFor();
    const srcdoc = () => page.locator('iframe[title="Email preview"]').getAttribute('srcdoc');
    assert.match(await srcdoc(), /prepared mail/);
    const message = page.getByLabel('Message', { exact: true });
    // A detail shows as a named chip; no {{ }} is visible.
    assert.equal(await message.locator('[data-email-variable="name"]').innerText(), 'Customer name');
    assert.doesNotMatch(await message.innerText(), /\{\{/);
    assert.deepEqual(await page.getByLabel('Template', { exact: true }).locator('option').allTextContents(), ['Current draft', 'Standard (built-in)', 'Short']);
    await page.getByLabel('Template', { exact: true }).selectOption('short1');
    await page.waitForFunction(() => document.getElementById('email-review-subject').value === 'Short subject');
    await page.waitForFunction(() => document.getElementById('email-review-message').innerText.trim() === 'Short text');
    assert.match(await srcdoc(), /short mail/);
    await message.click(); await page.keyboard.press('Control+A');
    await page.getByRole('button', { name: 'B Bold', exact: true }).click();
    await page.getByRole('button', { name: '• List', exact: true }).click();
    assert.equal(await message.locator('ul li strong').innerText(), 'Short text');
    await page.keyboard.press('End'); await page.keyboard.type(' for ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Customer name' });
    await page.getByRole('button', { name: 'Update preview', exact: true }).click();
    await page.waitForFunction(() => /edited preview/.test(document.querySelector('iframe[title="Email preview"]').getAttribute('srcdoc')));
    await page.getByRole('button', { name: 'Send Mail', exact: true }).click();
    await page.waitForFunction(() => window.adminActionFinished);
    const adminDecision = await page.evaluate(() => JSON.parse(window.emailCalls.filter(call => call.url.endsWith('/drafts/draft2/decision'))[0].options.body));
    assert.equal(adminDecision.subject, 'Short subject'); assert.equal(adminDecision.templateId, 'short1'); assert.equal(adminDecision.text, undefined);
    const item = adminDecision.doc.content[0];
    assert.equal(item.type, 'bulletList');
    const nodes = item.content[0].content[0].content;
    assert.deepEqual(nodes[0], { type: 'text', text: 'Short text for ', marks: [{ type: 'bold' }] });
    assert.equal(nodes[1].type, 'emailVariable'); assert.equal(nodes[1].attrs.key, 'name'); assert.equal(nodes.length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS: visual editor (chips, Bold, List, Insert detail), Send, Don’t Send, Escape, attachment preview, shared action interception, admin template choice and live preview.');
  } finally { await browser?.close(); await new Promise(resolve => app.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
