// Admin project detail: instant open, layout, views, upload warning, Uploaded Data badge, plan detail unchanged.
// Local API fixtures only; never contacts production. Run after `npm run build`.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../../merasoftware/node_modules/playwright');
const { zipSync, strToU8 } = require('fflate');

const build = path.resolve(process.env.PORTAL_BUILD || path.join(__dirname, '../build'));
const shots = process.env.PROJECT_DETAIL_SHOTS || '';
let pass = 0; const failures = [];
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`); if (ok) pass += 1; else failures.push(name); };

const server = http.createServer((req, res) => {
  let file = path.join(build, new URL(req.url, 'http://local').pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(build, 'index.html');
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

const date = '2026-10-01T10:00:00.000Z';
const user = { _id: 'u-admin', name: 'Audit', email: 'a@example.test', phone: '9999999999', age: 30, role: 'admin', roles: ['admin'], activeRole: 'admin', walletBalance: 0, isGuest: false };
const client = { _id: 'c0', name: 'Client Zero', email: 'c@example.test', status: 'active', createdAt: date };
const row = (id, extra = {}) => ({ _id: id, projectSnapshot: { displayName: `Project ${id}`, category: 'website' }, orderVisibility: 'approved', projectProgress: 40, createdAt: date, updatedAt: date, currentPhase: 'development', orderState: { label: 'In Progress', code: 'in_progress', phaseLabel: 'Development' }, ...extra });
const nodes = Array.from({ length: 12 }, (_, i) => ({ nodeId: `n${i}`, runId: 'r1', title: `Checkpoint ${i}`, cumulativeProgress: i * 4, status: i === 2 ? 'deleted' : 'active', visibleToClient: true, createdAt: date, messageIds: [] }));
const full = (id, extra = {}) => ({ ...row(id), projectRuns: [{ runId: 'r1', status: 'active' }], projectNodes: nodes, messages: [], linkedServices: [], serviceInvoices: [], projectLink: 'https://example.test', newUploadsCount: 0, userId: { _id: 'c0', name: 'Client' }, ...extra });
const plan = { ...row('p1'), isServicePlan: true, projectSnapshot: { displayName: 'Plan p1', category: 'service' } };

async function open(browser, origin, options = {}) {
  const world = { reads: [], delay: { detail: 300, workspace: 50 }, failDetail: false, detail: {}, uploads: [], transactions: [], holdUpload: false, viewport: { width: 1440, height: 900 }, ...options };
  const context = await browser.newContext({ viewport: world.viewport });
  await context.addInitScript(() => { window.EventSource = class { constructor() { setTimeout(() => this.onmessage?.({ data: '{"type":"ready"}' }), 30); } close() {} }; });
  await context.routeWebSocket('**/*', s => s.close());
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url()); const p = url.pathname;
    if (url.origin === origin && !p.startsWith('/api/')) return route.continue();
    if (p !== '/api/user-details') world.reads.push(`${request.method()} ${p}`);
    const isDetail = p.startsWith('/api/order-details/');
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { success: true, data } : { success: false, message: data }) }).catch(() => {});
    if (isDetail) await new Promise(r => setTimeout(r, world.delay.detail));
    if (p === '/api/admin/user-workspace') await new Promise(r => setTimeout(r, world.delay.workspace));
    if (request.method() === 'POST' && p.endsWith('/website-preview/uploads')) { world.uploadStarted = true; await new Promise(r => setTimeout(r, 60000)); return send({}); }
    if (p === '/api/user-details') return send(user);
    if (p === '/api/admin/user-workspace') return send({ customer: client, orders: world.orders || [row('o1'), row('o2'), plan], renewals: [], transactions: world.transactions, invoices: [], updates: [], plans: [], summary: { walletBalance: 0 } });
    if (isDetail) {
      const id = p.split('/').pop();
      if (world.failDetail) return send('Detail unavailable', 503);
      return send(id === 'p1' ? { ...plan, messages: [] } : full(id, world.detail));
    }
    if (/\/api\/orders\/[^/]+\/uploads$/.test(p)) return send(world.uploads);
    if (/\/api\/uploads\/[^/]+\/download$/.test(p)) { world.detail.newUploadsCount = 0; world.uploads = world.uploads.map(u => ({ ...u, isNew: false })); return route.fulfill({ status: 200, contentType: 'application/zip', body: 'zip' }); }
    if (/\/website-preview$/.test(p)) return send({ available: true, configured: true, host: 'preview.example.test', visible: false, currentVersion: null, serviceUrl: 'https://service.example.test', policy: { zipBytes: 5e6, totalBytes: 5e6, fileBytes: 5e6, pathBytes: 512, fileCount: 50, concurrency: 1, mime: { html: 'text/html' } } });
    return send([]);
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { context, page, world, errors };
}

const text = page => page.evaluate(() => document.querySelector('main')?.innerText || '');
const has = async (page, value) => (await text(page)).includes(value);
const waitText = (page, value) => page.waitForFunction(v => (document.querySelector('main')?.innerText || '').includes(v), value, { timeout: 15000 });
const clickText = (page, value) => page.evaluate(v => {
  const node = [...document.querySelectorAll('main button:not([role=tab]), main [role=button]')].find(n => n.textContent.includes(v) && n.offsetParent !== null);
  if (!node) throw new Error(`no button: ${v}`);
  node.click();
}, value);
const openList = async (page, origin) => { await page.goto(`${origin}/admin-panel/clients/c0?tab=projects`); await waitText(page, 'Project o1'); await page.waitForTimeout(400); };
const openProject = async (page, origin, wait = true) => { await openList(page, origin); await clickText(page, 'Project o1'); if (wait) await waitText(page, 'Checkpoint 11'); };
const disabled = (page, label) => page.evaluate(v => {
  const node = [...document.querySelectorAll('main button')].find(n => (n.getAttribute('aria-label') || n.textContent).includes(v));
  return node ? node.disabled : null;
}, label);

async function run(browser, origin) {
  // Phase 1: opens at once
  {
    const { context, page, world, errors } = await open(browser, origin, { delay: { detail: 2000, workspace: 50 } });
    await openList(page, origin);
    const ms = await page.evaluate(() => new Promise(resolve => {
      const row = [...document.querySelectorAll('main [role=button], main button.grid')].find(n => n.textContent.includes('Project o1'));
      const start = performance.now(); row.click();
      const tick = () => {
        const t = document.querySelector('main').innerText;
        if (t.includes('Back to Projects') && t.includes('Project o1') && document.querySelector('main [data-spinner]')) return resolve(performance.now() - start);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    check('opens with name and spinner within 100ms on a 2s API', ms < 100, ms);
    check('status and progress come from the list row at once', await has(page, 'In Progress') && await has(page, '40% complete') && await has(page, 'Development'), await text(page));
    check('Add Node form shows but is closed', await disabled(page, 'Add Node') === true && await has(page, 'Loading current progress'), await text(page));
    check('More is closed until the full record', await disabled(page, 'More actions') === true, null);
    await waitText(page, 'Checkpoint 11');
    check('More opens after the full record', await disabled(page, 'More actions') === false, null);
    const before = world.reads.length;
    await page.evaluate(() => [...document.querySelectorAll('main button')].find(n => n.textContent.includes('Back to Projects')).click());
    await waitText(page, 'Active projects first');
    check('Back returns to the list', page.url().includes('tab=projects') && !page.url().includes('project='), page.url());
    check('Back adds no project read', !world.reads.slice(before).some(r => r.includes('order-details')), world.reads.slice(before));
    check('no page errors', errors.length === 0, errors);
    await context.close();
  }
  // Phase 1: a failed read is visible and can be retried
  {
    const { context, page, world, errors } = await open(browser, origin, { failDetail: true });
    await openProject(page, origin, false);
    await waitText(page, 'Could not open this project');
    check('failed read shows the error', await has(page, 'Detail unavailable'), await text(page));
    check('failed read leaves the list', !(await has(page, 'Active projects first')), null);
    world.failDetail = false;
    await clickText(page, 'Try again');
    await waitText(page, 'Checkpoint 11');
    check('Try again opens the project', !(await has(page, 'Could not open')), await text(page));
    check('no page errors after failure', errors.length === 0, errors);
    await context.close();
  }
  // Phase 1: refresh of the URL has no row; a pending payment must not read as "no payment"
  {
    const pending = { _id: 't1', orderId: 'o1', status: 'pending', amount: 100, type: 'payment', date };
    const { context, page, errors } = await open(browser, origin, { delay: { detail: 50, workspace: 1500 }, transactions: [pending], detail: { orderVisibility: 'pending-approval' }, orders: [row('o1', { orderVisibility: 'pending-approval' })] });
    await page.goto(`${origin}/admin-panel/clients/c0?tab=projects&project=o1`);
    await waitText(page, 'Checkpoint 11');
    check('project is ahead of the workspace in this case', !(await has(page, 'Payment submitted')), await text(page));
    check('no false "no payment" alert while payments load', !(await has(page, 'waiting for your approval')), await text(page));
    await waitText(page, 'Payment submitted, awaiting approval');
    check('real payment alert after payments load', !(await has(page, 'waiting for your approval')), await text(page));
    check('Payments button counts the pending payment', await page.evaluate(() => [...document.querySelectorAll('main button:not([role=tab])')].find(n => n.textContent.includes('Payments')).textContent.includes('1')), null);
    check('no page errors on refresh', errors.length === 0, errors);
    await context.close();
  }
  // Phase 2: layout
  {
    const { context, page, world, errors } = await open(browser, origin);
    await openProject(page, origin);
    const main = await text(page);
    check('nodes and Add Node sit above the fold', await page.evaluate(() => {
      const heading = [...document.querySelectorAll('main h3')].find(n => n.textContent.includes('Add Node'));
      return heading && heading.getBoundingClientRect().top < window.innerHeight;
    }), null);
    check('the fake checkbox is gone', !main.includes('Always hide deleted nodes'), null);
    check('Payments, Portfolio and Reset are off the main page', !main.includes('payment and invoice history') && !main.includes('Portfolio website') && !main.includes('Reset history') && !main.includes('Reset History'), main);
    const blue = await page.evaluate(() => [...document.querySelectorAll('main section.space-y-5 button')].filter(n => (n.getAttribute('class') || '').split(' ').some(c => c.startsWith('bg-blue-') || c.startsWith('text-blue-') || c.startsWith('border-blue-'))).map(n => n.outerHTML.slice(0, 160)));
    check('no blue buttons on the page', blue.length === 0, blue);
    check('project opens without reading uploads', !world.reads.some(r => r.endsWith('/uploads')), world.reads);
    const barBefore = await page.evaluate(() => [...document.querySelectorAll('main input[type=checkbox]')][0].getBoundingClientRect().top);
    await page.evaluate(() => document.querySelector('main input[type=checkbox]').click());
    await waitText(page, '1 selected');
    const barAfter = await page.evaluate(() => [...document.querySelectorAll('main input[type=checkbox]')][0].getBoundingClientRect().top);
    check('ticking a node does not move the list', barBefore === barAfter, { barBefore, barAfter });
    await page.evaluate(() => document.querySelector('main input[type=checkbox]').click());
    await clickText(page, 'Checkpoint 11');
    await waitText(page, 'Selected Node');
    await clickText(page, 'Add Node');
    await waitText(page, 'Valid range');
    check('Add Node returns from a node', !(await has(page, 'Selected Node')), null);
    if (shots) await page.screenshot({ path: path.join(shots, 'project-main.png'), fullPage: true });

    await page.evaluate(() => document.querySelector('[aria-label="More actions"]').click());
    const menu = await text(page);
    check('More holds the rare actions', ['Project Info', 'Portfolio Website', 'Reset History', 'Cancel Project', 'Delete Project'].every(v => menu.includes(v)), menu);
    const menuBox = await page.evaluate(() => { const r = document.querySelector('[role=menu]').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.bottom - 12); return { inMenu: Boolean(top?.closest('[role=menu]')), right: r.right, width: innerWidth }; });
    check('More menu is not clipped', menuBox.inMenu && menuBox.right <= menuBox.width, menuBox);
    if (shots) await page.screenshot({ path: path.join(shots, 'project-more.png') });
    await page.keyboard.press('Escape');
    check('Escape closes More', !(await has(page, 'Delete Project')), null);
    await page.evaluate(() => document.querySelector('[aria-label="More actions"]').click());
    await clickText(page, 'Reset History');
    await waitText(page, 'Reset project timeline');
    check('Reset History opens its panel with the confirm step', await has(page, 'Confirm reset'), null);
    await page.evaluate(() => document.querySelector('[aria-label="More actions"]').click());
    await clickText(page, 'Project Info');
    await page.waitForSelector('[role=dialog]');
    check('Project Info popup', (await page.evaluate(() => document.querySelector('[role=dialog]').innerText)).includes('Current Phase'), null);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('[aria-label="More actions"]').click());
    await clickText(page, 'Portfolio Website');
    await page.waitForSelector('[role=dialog] form');
    check('Portfolio popup has the saved link', await page.evaluate(() => document.querySelector('[role=dialog] input[type=url]').value) === 'https://example.test', null);
    await page.evaluate(() => document.querySelector('[aria-label="Close"]').click());

    // Views live in the URL
    await clickText(page, 'Website');
    await waitText(page, 'Website Preview');
    check('Website opens as a view', page.url().includes('view=website') && page.url().includes('project=o1'), page.url());
    check('Website button read the status once', world.reads.filter(r => r.endsWith('/website-preview')).length === 1, world.reads);
    if (shots) await page.screenshot({ path: path.join(shots, 'project-website.png'), fullPage: true });
    await page.goBack();
    await waitText(page, 'Checkpoint 11');
    check('browser Back closes the view, not the project', page.url().includes('project=o1') && !page.url().includes('view='), page.url());
    const before = world.reads.length;
    await clickText(page, 'Payments');
    await waitText(page, 'payment and invoice history');
    check('Payments needs no new read', world.reads.length === before, world.reads.slice(before));
    await page.reload();
    await waitText(page, 'payment and invoice history');
    check('Refresh keeps the view', page.url().includes('view=payments'), page.url());
    await clickText(page, 'Back to Project');
    await waitText(page, 'Checkpoint 11');
    check('Back to Project keeps the project open', page.url().includes('project=o1') && !page.url().includes('view='), page.url());
    await page.evaluate(() => document.querySelector('[aria-label="Go back"]').click());
    await waitText(page, 'Active projects first');
    check('header Back closes the project', !page.url().includes('project='), page.url());
    await clickText(page, 'Project o1');
    await waitText(page, 'Checkpoint 11');
    await clickText(page, 'Payments');
    await waitText(page, 'payment and invoice history');
    await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(n => n.textContent.includes('Plans')).click());
    await waitText(page, 'Plan p1');
    check('changing tab drops project and view', !page.url().includes('project=') && !page.url().includes('view='), page.url());
    check('no page errors in layout flow', errors.length === 0, errors);
    await context.close();
  }
  // Phase 2: a running upload
  {
    const { context, page, world, errors } = await open(browser, origin);
    const dialogs = []; let accept = false;
    page.on('dialog', d => { dialogs.push(d.message()); accept ? d.accept() : d.dismiss(); });
    await openProject(page, origin);
    await clickText(page, 'Website');
    await waitText(page, 'Upload Website ZIP');
    const zip = zipSync({ 'index.html': strToU8('<!doctype html><title>x</title><h1>x</h1>') });
    await page.setInputFiles('main input[type=file]', { name: 'site.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Cancel upload') || document.querySelector('[role=alert]'), null, { timeout: 15000 });
    check('the upload is running', await has(page, 'Cancel upload'), await text(page));
    await clickText(page, 'Back to Project');
    await waitText(page, 'Checkpoint 11');
    check("the project's own view changes ask nothing", dialogs.length === 0, dialogs);
    await clickText(page, 'Website');
    await waitText(page, 'Website Preview');
    check('the upload survives a view change', await has(page, 'Cancel upload'), await text(page));
    await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(n => n.textContent.includes('Plans')).click());
    await page.waitForTimeout(300);
    check('leaving the project warns', dialogs.length === 1 && /upload is running/.test(dialogs[0]), dialogs);
    check('refusing keeps the project and the upload', page.url().includes('project=o1') && await has(page, 'Cancel upload'), page.url());
    accept = true;
    await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(n => n.textContent.includes('Plans')).click());
    await waitText(page, 'Plan p1');
    check('accepting leaves the project', dialogs.length === 2 && !page.url().includes('project='), dialogs);
    check('no page errors during upload', errors.length === 0, errors);
    check('upload reached the server', world.uploadStarted === true, null);
    await context.close();
  }
  // Phase 3: the Uploaded Data badge
  {
    const uploads = [
      { id: 'u-new', orderId: 'o1', isPlanUpload: false, isNew: true, status: 'pending', deliveryStatus: 'ready', createdAt: date, notes: [], files: [{ id: 'f', name: 'new.zip', size: 10 }], statusHistory: [], hasDownloadableFiles: true },
      { id: 'u-old', orderId: 'o1', isPlanUpload: false, isNew: false, status: 'pending', deliveryStatus: 'ready', createdAt: date, notes: [], files: [{ id: 'g', name: 'old.zip', size: 10 }], statusHistory: [], hasDownloadableFiles: true },
    ];
    const { context, page, world, errors } = await open(browser, origin, { detail: { newUploadsCount: 1 }, uploads });
    await openProject(page, origin);
    const label = () => page.evaluate(() => [...document.querySelectorAll('main button')].find(n => n.textContent.includes('Uploaded Data')).textContent);
    check('badge shows the count', (await label()).includes('1'), await label());
    await clickText(page, 'Uploaded Data');
    await waitText(page, 'new.zip');
    check('uploads are read only now', world.reads.filter(r => r.endsWith('/uploads')).length === 1, world.reads);
    check('subpage says new, not pending', await has(page, '1 new') && !(await has(page, 'pending')) && !(await has(page, 'Pending')), await text(page));
    check('the new upload is tagged', await page.evaluate(() => (document.querySelector('main').innerText.match(/\bNew\b/g) || []).length === 1), await text(page));
    if (shots) await page.screenshot({ path: path.join(shots, 'project-uploads.png'), fullPage: true });
    await clickText(page, 'Download');
    await page.waitForFunction(() => !/\bNew\b/.test(document.querySelector('main').innerText), null, { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('main').innerText.includes('1 new'), null, { timeout: 8000 });
    check('download clears the tag without the live feed', !(await has(page, '1 new')), await text(page));
    await clickText(page, 'Back to Project');
    await waitText(page, 'Checkpoint 11');
    await page.waitForTimeout(500);
    check('download clears the badge', !/\d/.test(await label()), await label());
    check('no page errors with the badge', errors.length === 0, errors);
    await context.close();
  }
  // Plan detail keeps its layout
  {
    const uploads = [{ id: 'u-plan', orderId: 'p1', isPlanUpload: true, isNew: true, status: 'pending', deliveryStatus: 'ready', createdAt: date, notes: [], files: [], statusHistory: [], hasDownloadableFiles: false }];
    const { context, page, world, errors } = await open(browser, origin, { uploads });
    await page.goto(`${origin}/admin-panel/clients/c0?tab=plans`);
    await waitText(page, 'Plan p1');
    await clickText(page, 'Plan p1');
    await waitText(page, 'Back to Plans');
    await page.waitForTimeout(600);
    const main = await text(page);
    check('plan still shows Portfolio and Payments in the page', main.includes('Portfolio website') && main.includes('payment and invoice history'), main);
    check('plan still has its Delete button', await disabled(page, 'Delete plan') === false, null);
    check('plan reads its uploads on open', world.reads.some(r => r.endsWith('/uploads')), world.reads);
    await clickText(page, 'Uploaded Data');
    await waitText(page, 'Upload History');
    check('plan subpage keeps pending', await has(page, '1 pending'), await text(page));
    check('no page errors in plan', errors.length === 0, errors);
    await context.close();
  }
  // Phone width
  {
    const { context, page, errors } = await open(browser, origin, { viewport: { width: 375, height: 800 } });
    await openProject(page, origin);
    check('no sideways scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await page.evaluate(() => document.documentElement.scrollWidth));
    if (shots) await page.screenshot({ path: path.join(shots, 'project-phone.png'), fullPage: true });
    check('no page errors at phone width', errors.length === 0, errors);
    await context.close();
  }
}

server.listen(0, '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try { await run(browser, origin); }
  catch (error) { failures.push(error.message); console.log('FAIL stopped:', error.message); }
  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
});
