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
        if (String(url).endsWith('/templates/smart-template')) return json({ data: { _id: 'smart-template', name: 'Saved message', updatedAt: '2026-10-30T12:01:00.000Z' } });
        if (String(url).endsWith('/drafts/smart-draft/preview')) return json({ data: { html: '<p>Dear Ravi, updated</p>' } });
        if (String(url).endsWith('/drafts/smart-draft/decision')) return json({ data: { status: 'queued', delivery: { email: 'not-selected', whatsapp: 'queued', channels: ['whatsapp'] } } });
        if (String(url).endsWith('/drafts/draft2')) return json({ data: { _id: 'draft2', to: ['client@example.test'], subject: 'Project Cancelled', text: 'Hello Ravi', html: '<p>prepared mail</p>',
          doc: paragraph({ type: 'text', text: 'Hello ' }, { type: 'emailVariable', attrs: { key: 'name' } }),
          editorFields: { variables: [{ key: 'name', label: 'Customer name', hint: 'The customer’s name', value: 'Ravi' }], blocks: [] },
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
      window.askSmart = () => reviewEmail({ _id: 'smart-draft', event: 'lead.proposal', status: 'pending', to: ['ravi@example.test'], subject: 'For Ravi', text: 'Dear Ravi', html: '<p>Dear Ravi</p>',
        templateDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear ' }, { type: 'emailVariable', attrs: { key: 'name' } }] }] },
        templateSubjectDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'For ' }, { type: 'emailVariable', attrs: { key: 'name' } }] }] },
        selectedTemplateId: 'smart-template', templateLabel: 'Saved message', templateRevision: '2026-10-30T12:00:00.000Z',
        templateOptions: [{ id: 'smart-template', name: 'Saved message' }], editorFields: { variables: [{ key: 'name', label: 'Customer name', value: 'Ravi' }], blocks: [] },
        defaultChannel: 'both', channelOptions: [{ id: 'email', label: 'Email', enabled: true }, { id: 'whatsapp', label: 'WhatsApp', enabled: true }, { id: 'both', label: 'Both', enabled: true }]
      }).then(result => { window.smartDecision = result; });
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
    // The details guide explains every detail with this email's own value.
    await page.locator('summary').filter({ hasText: /^Available details$/ }).click();
    const guideName = page.getByRole('region', { name: 'Available details for Message' }).getByRole('listitem').filter({ hasText: 'Customer name' });
    await guideName.getByText('The customer’s name', { exact: true }).waitFor();
    await guideName.getByText('In this email: Ravi', { exact: true }).waitFor();
    assert.deepEqual(await page.getByLabel('Template', { exact: true }).locator('option').allTextContents(), ['Current draft', 'Standard (built-in)', 'Short']);
    await page.getByLabel('Template', { exact: true }).selectOption('short1');
    await page.waitForFunction(() => document.getElementById('email-review-subject').value === 'Short subject');
    await page.waitForFunction(() => document.getElementById('email-review-message').innerText.trim() === 'Short text');
    // The editor is read-only while the template preview loads; edit only once it is editable again.
    await page.waitForFunction(() => document.getElementById('email-review-message').getAttribute('contenteditable') === 'true');
    assert.match(await srcdoc(), /short mail/);
    await message.click(); await page.keyboard.press('Control+A');
    await page.getByRole('button', { name: 'B Bold', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'email-review-message');
    await page.getByRole('button', { name: '• List', exact: true }).click();
    assert.equal(await message.locator('ul li strong').innerText(), 'Short text');
    // Toolbar buttons hand focus back to the editor a moment later; type only once it has it.
    await page.waitForFunction(() => document.activeElement?.id === 'email-review-message');
    await page.keyboard.press('End'); await page.keyboard.type(' for ');
    await page.getByLabel('Insert detail into Message').selectOption({ label: 'Customer name' });
    await page.keyboard.type(' and ');
    await guideName.getByRole('button', { name: 'Customer name', exact: true }).click();
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
    assert.equal(nodes[1].type, 'emailVariable'); assert.equal(nodes[1].attrs.key, 'name');
    assert.equal(nodes[2].text, ' and '); assert.equal(nodes[3].type, 'emailVariable'); assert.equal(nodes[3].attrs.key, 'name'); assert.equal(nodes.length, 4);
    assert.deepEqual(errors, []);
    await page.evaluate(() => { window.askSmart(); });
    await page.getByRole('heading', { name: 'Review message', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Send via').inputValue(), 'both');
    assert.equal(await message.locator('[data-email-variable="name"]').innerText(), 'Customer name');
    await message.click(); await page.keyboard.press('End'); await page.keyboard.type(', updated');
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Selected template updated.' }).waitFor();
    const saved = await page.evaluate(() => window.emailCalls.filter(call => call.url.endsWith('/templates/smart-template')));
    assert.equal(saved.length, 1); assert.equal(saved[0].options.method, 'PUT');
    const savedBody = JSON.parse(saved[0].options.body);
    assert.ok(JSON.stringify(savedBody.doc).includes('emailVariable'));
    assert.ok(!JSON.stringify(savedBody.doc).includes('Ravi'));
    assert.equal(savedBody.expectedUpdatedAt, '2026-10-30T12:00:00.000Z');
    await page.getByLabel('Send via').selectOption('whatsapp');
    await page.getByRole('button', { name: 'Send WhatsApp', exact: true }).click();
    await page.waitForFunction(() => window.smartDecision);
    const smart = await page.evaluate(() => window.smartDecision);
    assert.equal(smart.channels, 'whatsapp'); assert.equal(smart.processedResult.status, 'queued');
    assert.equal(await page.evaluate(() => window.emailCalls.filter(call => call.url.endsWith('/drafts/smart-draft/decision')).length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: legacy review plus compact channel selection, original name chips, same-template PUT and processed delivery without duplicate submit.');
  } finally { await browser?.close(); await new Promise(resolve => app.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
