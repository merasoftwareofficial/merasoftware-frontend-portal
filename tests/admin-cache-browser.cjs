// Kept data, list return and clickable headings on Leads, Lead detail and Clients. Local API fixtures only;
// never contacts production. Run after `npm run build`. Scroll checks click through the DOM, because Playwright's
// .click() scrolls its target into view and would hide a jump.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const build = path.resolve(process.env.PORTAL_BUILD || path.join(__dirname, '../build'));
const MIN = 60 * 1000;
let pass = 0; const failures = [];
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`); if (ok) pass += 1; else failures.push(name); };

const server = http.createServer((req, res) => {
  let file = path.join(build, new URL(req.url, 'http://local').pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(build, 'index.html');
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function open(browser, origin, { feed = true, delay = 300 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 700 } });
  const world = {
    delay, reads: [], fail: null, gone: new Set(),
    leads: Array.from({ length: 40 }, (_, i) => ({ _id: `l${i}`, name: `Lead ${i}`, phone: `98765${20000 + i}`, email: `l${i}@example.test`, source: 'WhatsApp', status: 'Contacted', createdAt: '2026-10-01', updatedAt: '2026-10-01' })),
    clients: Array.from({ length: 80 }, (_, i) => ({ _id: `c${i}`, name: `Client ${i}`, email: `c${i}@example.test`, phone: `98765${10000 + i}`, status: 'active', createdAt: '2026-10-01' })),
  };
  const user = { _id: 'u-admin', name: 'Audit', email: 'a@example.test', phone: '9999999999', age: 30, role: 'admin', roles: ['admin'], activeRole: 'admin', walletBalance: 0, isGuest: false };
  const fixture = p => {
    if (p === '/api/user-details') return user;
    if (p === '/api/admin/dashboard-summary') return { active: 1, inactive: 0, joinedThisMonth: 0, recentClients: [] };
    if (p === '/api/admin/leads') return world.leads;
    if (p === '/api/admin/clients') return world.clients;
    if (/^\/api\/admin\/leads\/l\d+$/.test(p)) return { ...world.leads.find(l => l._id === p.split('/').pop()), followUps: [], offerTargets: [], finalMessage: null, finalMessageCanStart: world.leads.find(l => l._id === p.split('/').pop())?.status === 'Negative', contactBlock: null, clientAvailable: false };
    if (p === '/api/admin/final-message/count') return { count: 0 };
    if (p === '/api/admin/user-workspace') return { customer: world.clients[0], orders: [], renewals: [], transactions: [], invoices: [], updates: [], plans: [], summary: { walletBalance: 0 } };
    return [];
  };
  await context.addInitScript(useFeed => {
    window.__offset = 0;
    const real = Date.now.bind(Date); Date.now = () => real() + window.__offset;
    window.__feeds = [];
    window.__vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => window.__vis });
    window.EventSource = class { constructor() { window.__feeds.push(this); if (useFeed) setTimeout(() => { if (!this.closed) this.onmessage?.({ data: '{"type":"ready"}' }); }, 100); } close() { this.closed = true; } };
    window.__push = resources => window.__feeds[window.__feeds.length - 1].onmessage({ data: JSON.stringify({ type: 'changed', resources, ids: [] }) });
    window.__seen = { emptyText: 0, loading: 0, updating: 0, oldName: 0 };
    const sample = () => {
      const text = document.querySelector('main')?.innerText || '';
      if (/No leads yet/.test(text) || (location.pathname.endsWith('/clients') && !/Admin Dashboard/.test(text) && /No clients found/.test(text))) window.__seen.emptyText += 1;
      if (/Loading\.\.\./.test(text)) window.__seen.loading += 1;
      if (document.querySelector('[data-updating]') || /Updating\.\.\./.test(text)) window.__seen.updating += 1;
      if (window.__old && text.includes(window.__old)) window.__seen.oldName += 1;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, feed);
  await context.routeWebSocket('**/*', s => s.close());
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() !== 'GET') return route.fulfill({ status: 405, contentType: 'application/json', body: '{"success":false}' });
    if (url.pathname !== '/api/user-details') world.reads.push(url.pathname);
    await new Promise(r => setTimeout(r, url.pathname === '/api/user-details' ? 0 : world.delay));
    const id = url.pathname.split('/').pop();
    if (world.gone.has(id)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Lead not found' }) }).catch(() => {});
    if (world.fail && url.pathname !== '/api/user-details') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"message":"Unavailable"}' }).catch(() => {});
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: fixture(url.pathname) }) }).catch(() => {});
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { context, page, world, errors };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const y = page => page.evaluate(() => window.scrollY);
const resetSeen = page => page.evaluate(() => { window.__seen = { emptyText: 0, loading: 0, updating: 0, oldName: 0 }; });
const seen = page => page.evaluate(() => window.__seen);
const openList = async (page, origin, q = '?q=Lead') => { await page.goto(`${origin}/admin-panel/leads${q}`); await page.waitForFunction(() => document.body.innerText.includes('Lead 39')); await wait(page, 1200); };
const scrollList = async (page, top = 800) => { await page.evaluate(t => window.scrollTo(0, t), top); await wait(page, 150); };
const clickVisibleRow = page => page.evaluate(() => {
  const row = [...document.querySelectorAll('main [role=button], main button.grid')].filter(n => /(Lead|Client) \d+/.test(n.textContent)).find(n => n.getBoundingClientRect().top > 120);
  const text = row.textContent.match(/(Lead|Client) \d+/)[0]; row.click(); return text;
});
const backArrow = page => page.evaluate(() => document.querySelector('[aria-label="Go back"]').click());
const push = (page, domain) => page.evaluate(d => window.__push([{ domain: d, ids: [], all: true }]), domain);
const actions = page => page.evaluate(() => {
  const b = re => [...document.querySelectorAll('main button')].find(n => re.test(n.textContent));
  return { edit: !!b(/Edit Lead/), send: b(/Send message/) ? !b(/Send message/).disabled : null };
});

async function run(browser, origin) {
  // 1 + 2: the owner's main complaint
  for (const way of ['page Back arrow', 'browser Back']) {
    const { context, page, world, errors } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    const opened = await clickVisibleRow(page);
    await wait(page, 800); await resetSeen(page);
    const before = world.reads.length;
    if (way.startsWith('page')) await backArrow(page); else await page.goBack();
    await wait(page, 60);
    const early = await y(page);
    await wait(page, 900);
    const s = await seen(page);
    const focus = await page.evaluate(() => document.activeElement?.textContent || '');
    check(`${way}: same scroll at once`, early === 800 && await y(page) === 800, { early, late: await y(page) });
    check(`${way}: no Loading and no empty flash`, s.loading === 0 && s.emptyText === 0, s);
    check(`${way}: no server read when nothing changed`, world.reads.length === before, world.reads.slice(before));
    check(`${way}: focus on the opened lead`, focus.includes(opened), { focus: focus.slice(0, 30), opened });
    check(`${way}: filter kept`, page.url().includes('q=Lead'), page.url());
    check(`${way}: no page errors`, errors.length === 0, errors);
    await context.close();
  }
  // 3: reopening an unchanged lead
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin);
    await page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await wait(page, 800); await backArrow(page); await wait(page, 300);
    const before = world.reads.length;
    await page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await wait(page, 80);
    const a = await actions(page);
    await wait(page, 500);
    check('same lead reopened: no server read', world.reads.length === before, world.reads.slice(before));
    check('same lead reopened: actions open at once', a.edit === true, a);
    await context.close();
  }
  // 4: a change elsewhere while the list is closed
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await clickVisibleRow(page); await wait(page, 800);
    world.leads[39] = { ...world.leads[39], name: 'Lead Changed' };
    await push(page, 'leads'); await wait(page, 400);
    await resetSeen(page); world.delay = 800;
    const before = world.reads.filter(r => r === '/api/admin/leads').length;
    await backArrow(page); await wait(page, 150);
    const during = await page.evaluate(() => ({ text: document.querySelector('main').innerText.includes('Lead 39'), updating: !!document.querySelector('[data-updating]') }));
    await wait(page, 1200);
    const late = await page.evaluate(() => document.querySelector('main').innerText.includes('Lead Changed'));
    check('change while away: old list shown with Updating sign', during.text && during.updating, during);
    check('change while away: new data replaces it', late, late);
    check('change while away: scroll kept', await y(page) === 800, await y(page));
    check('change while away: exactly one list read', world.reads.filter(r => r === '/api/admin/leads').length === before + 1, world.reads);
    check('change while away: no full Loading', (await seen(page)).loading === 0, await seen(page));
    await context.close();
  }
  // 5: stale lead detail keeps actions closed
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin);
    const click5 = () => page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await click5(); await wait(page, 800); await backArrow(page); await wait(page, 300);
    await push(page, 'communication'); await wait(page, 400);
    world.delay = 900;
    await click5(); await wait(page, 150);
    const early = await actions(page);
    const name = await page.evaluate(() => document.querySelector('h1')?.textContent);
    await wait(page, 1300);
    const late = await actions(page);
    check('whatsapp/email change makes lead detail re-check', world.reads.filter(r => r === '/api/admin/leads/l5').length >= 2, world.reads);
    check('stale detail: data shows, actions closed', name.includes('Lead 5') && !early.edit && early.send !== true, { early, name });
    check('stale detail: actions open after check', late.edit === true, late);
    await context.close();
  }
  // 6: age rules
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await clickVisibleRow(page); await wait(page, 800);
    await page.evaluate(m => { window.__offset += 6 * m; }, MIN);
    await resetSeen(page); world.delay = 700;
    const before = world.reads.length;
    await backArrow(page); await wait(page, 100);
    const s6 = await page.evaluate(() => ({ list: document.querySelector('main').innerText.includes('Lead 39'), updating: !!document.querySelector('[data-updating]') }));
    await wait(page, 1000);
    check('6 min old: data shown with Updating', s6.list && s6.updating, s6);
    check('6 min old: refreshed', world.reads.length > before, world.reads.slice(before));
    await scrollList(page);
    await clickVisibleRow(page); await wait(page, 1000);
    world.leads[39] = { ...world.leads[39], name: 'Lead Fresh' };
    await page.evaluate(m => { window.__offset += 31 * m; window.__old = 'Lead 39'; }, MIN);
    await resetSeen(page);
    await backArrow(page); await wait(page, 1500);
    const s31 = await seen(page);
    check('31 min old: old data never appears', s31.oldName === 0, s31);
    check('31 min old: loader shown', s31.loading > 0, s31);
    check('31 min old: new data arrives', await page.evaluate(() => document.querySelector('main').innerText.includes('Lead Fresh')), null);
    check('31 min old: scroll comes back after data', await y(page) === 800, await y(page));
    await context.close();
  }
  // 7: F5
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    world.leads[39] = { ...world.leads[39], name: 'Lead After F5' };
    const before = world.reads.length;
    await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Lead After F5'), null, { timeout: 8000 }); await wait(page, 700);
    check('F5: new data from server', world.reads.length > before, null);
    check('F5: filter kept', page.url().includes('q=Lead'), page.url());
    check('F5: scroll comes back', await y(page) === 800, await y(page));
    await context.close();
  }
  // 8: tab switch
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await page.evaluate(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await wait(page, 200);
    world.leads[39] = { ...world.leads[39], name: 'Lead After Tab' };
    await page.evaluate(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await wait(page, 1200);
    check('tab switch: new data appears', await page.evaluate(() => document.querySelector('main').innerText.includes('Lead After Tab')), null);
    check('tab switch: scroll kept', await y(page) === 800, await y(page));
    await context.close();
  }
  // 9: feed not available
  {
    const { context, page, world } = await open(browser, origin, { feed: false });
    await openList(page, origin); await scrollList(page);
    await clickVisibleRow(page); await wait(page, 800);
    const before = world.reads.length;
    await resetSeen(page);
    await backArrow(page); await wait(page, 900);
    check('feed down: list still instant, no Loading', (await seen(page)).loading === 0, await seen(page));
    check('feed down: always re-checks server', world.reads.length > before, world.reads.slice(before));
    check('feed down: scroll kept', await y(page) === 800, await y(page));
    await context.close();
  }
  // 10: another admin deleted the lead
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin);
    const click5 = () => page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await click5(); await wait(page, 800); await backArrow(page); await wait(page, 300);
    await push(page, 'leads'); await wait(page, 300);
    world.gone.add('l5');
    await click5(); await wait(page, 900);
    const a = await actions(page);
    check('deleted lead: says Lead not found', await page.evaluate(() => document.querySelector('main').innerText.includes('Lead not found')), null);
    check('deleted lead: actions closed', !a.edit && a.send !== true, a);
    await context.close();
  }
  // 11: typing survives ageing and a live refresh; focus is not stolen
  {
    const { context, page, world } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/leads/l5`);
    await page.waitForFunction(() => /Edit Lead/.test(document.body.innerText)); await wait(page, 800);
    const box = page.locator('main textarea').first();
    await box.click(); await box.fill('half typed note');
    await push(page, 'leads'); await wait(page, 700);
    const f1 = await page.evaluate(() => document.activeElement?.tagName);
    check('live refresh: focus stays in the note', f1 === 'TEXTAREA', f1);
    await page.evaluate(m => { window.__offset += 40 * m; window.dispatchEvent(new Event('focus')); }, MIN);
    await wait(page, 1000);
    check('old tab returns: typed note survives', await box.inputValue() === 'half typed note', await box.inputValue());
    check('old tab returns: body visible again', await page.evaluate(() => !document.querySelector('[data-lead-body]').hidden), null);
    await context.close();
  }
  // 12: own change shows at once on return
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin);
    await page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await wait(page, 800);
    world.leads[5] = { ...world.leads[5], name: 'Lead Saved', updatedAt: '2026-10-02' };
    await page.evaluate(() => window.__feeds[window.__feeds.length - 1].onmessage({ data: JSON.stringify({ type: 'changed', ids: ['l5'], resources: [{ domain: 'leads', ids: ['l5'] }] }) }));
    await wait(page, 700);
    world.delay = 1500;
    await backArrow(page); await wait(page, 150);
    const row = await page.evaluate(() => { const m = document.querySelector('main').innerText; return { saved: m.includes('Lead Saved'), old: /\bLead 5\b/.test(m) }; });
    check('saved lead: new row shows before the refresh ends', row.saved && !row.old, row);
    await wait(page, 1800);
    await context.close();
  }
  // 13: sidebar return
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await page.evaluate(() => [...document.querySelectorAll('aside a')].find(n => n.textContent.includes('Dashboard')).click());
    await wait(page, 900);
    check('another screen opens at the top', await y(page) === 0, await y(page));
    const before = world.reads.filter(r => r === '/api/admin/leads').length;
    await resetSeen(page);
    await page.evaluate(() => [...document.querySelectorAll('aside a')].find(n => /^\s*Leads/.test(n.textContent)).click());
    await wait(page, 900);
    check('sidebar return: filter back', page.url().includes('q=Lead'), page.url());
    check('sidebar return: scroll back', await y(page) === 800, await y(page));
    check('sidebar return: no Loading, no list read', (await seen(page)).loading === 0 && world.reads.filter(r => r === '/api/admin/leads').length === before, { s: await seen(page) });
    await context.close();
  }
  // 14: preload
  {
    const { context, page, world } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/dashboard`);
    await page.waitForSelector('aside'); await wait(page, 1500);
    const counts = () => ({ leads: world.reads.filter(r => r === '/api/admin/leads').length, clients: world.reads.filter(r => r === '/api/admin/clients').length });
    const c0 = counts();
    check('preload: each list read once', c0.leads === 1 && c0.clients === 1, c0);
    await resetSeen(page);
    await page.evaluate(() => [...document.querySelectorAll('aside a')].find(n => /^\s*Leads/.test(n.textContent)).click());
    await wait(page, 700);
    const s = await seen(page);
    check('preload: first Leads open has no Loading', s.loading === 0 && s.emptyText === 0, s);
    check('preload: no second read', counts().leads === 1, counts());
    await context.close();
  }
  // 15: errors
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await clickVisibleRow(page); await wait(page, 800);
    await push(page, 'leads'); await wait(page, 400);
    world.fail = true;
    await backArrow(page); await wait(page, 800);
    const t = await page.evaluate(() => document.querySelector('main').innerText);
    check('server error, recent data: data stays with message', t.includes('Lead 39') && /Unavailable/.test(t), t.slice(0, 100));
    check('server error: Refresh offered', /Refresh/.test(t), null);
    world.fail = false;
    await page.evaluate(m => { window.__offset += 31 * m; window.__old = 'Lead 39'; }, MIN);
    await clickVisibleRow(page).catch(() => {}); await wait(page, 800);
    world.fail = true;
    await page.evaluate(m => { window.__offset += 31 * m; }, MIN);
    await resetSeen(page);
    await backArrow(page); await wait(page, 900);
    const old = await seen(page);
    check('server error, old data: old data not shown', old.oldName === 0, old);
    await context.close();
  }
  // 16: Clients
  {
    const { context, page, world } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/clients`);
    await page.waitForFunction(() => document.body.innerText.includes('Client 79')); await wait(page, 1200);
    await scrollList(page);
    await clickVisibleRow(page); await wait(page, 1200);
    await resetSeen(page);
    const before = world.reads.filter(r => r === '/api/admin/clients').length;
    await backArrow(page); await wait(page, 100);
    const early = await y(page);
    await wait(page, 900);
    check('Clients Back arrow: same scroll', early === 800 && await y(page) === 800, { early, late: await y(page) });
    check('Clients Back arrow: no Loading, no read', (await seen(page)).loading === 0 && world.reads.filter(r => r === '/api/admin/clients').length === before, await seen(page));
    await page.evaluate(() => document.querySelector('main button.grid')?.click());
    await wait(page, 1000);
    await push(page, 'tickets'); await wait(page, 400);
    const b2 = world.reads.filter(r => r === '/api/admin/clients').length;
    await backArrow(page); await wait(page, 700);
    check('Clients: new ticket makes the list re-check', world.reads.filter(r => r === '/api/admin/clients').length === b2 + 1, world.reads.slice(-5));
    await context.close();
  }
  // 17: every action stays closed on unconfirmed data
  {
    const { context, page, world } = await open(browser, origin);
    world.leads[5] = { ...world.leads[5], status: 'Negative' };
    await openList(page, origin);
    const click5 = () => page.evaluate(() => [...document.querySelectorAll('main [role=button]')].find(n => /Lead 5(?!\d)/.test(n.textContent)).click());
    await click5(); await wait(page, 800); await backArrow(page); await wait(page, 300);
    await push(page, 'leads'); await wait(page, 300);
    world.delay = 900;
    await click5(); await wait(page, 150);
    const usable = () => page.evaluate(() => [...document.querySelectorAll('main button')].filter(n => !n.disabled && /Edit Lead|Send message|Start final message|Convert to Client|Add Follow-up|proposal/i.test(n.textContent)).map(n => n.textContent.trim()));
    const early = await usable();
    check('unconfirmed lead: no action usable', early.length === 0, early);
    await wait(page, 1300);
    const late = await usable();
    check('confirmed lead: actions usable', late.includes('Edit Lead') && late.includes('Send message') && late.includes('Start final message') && late.includes('Convert to Client'), late);
    await context.close();
  }
  // 18: a list left open past the limit
  {
    const { context, page, world } = await open(browser, origin);
    await openList(page, origin); await scrollList(page);
    await page.evaluate(m => { window.__offset += 31 * m; window.__old = 'Lead 39'; }, MIN);
    world.leads[39] = { ...world.leads[39], name: 'Lead Fresh' };
    await resetSeen(page); world.delay = 500;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await wait(page, 1300);
    const s = await seen(page);
    check('open list past 30 min: loader shown', s.loading > 0, s);
    check('open list past 30 min: new data, scroll kept', await page.evaluate(() => document.querySelector('main').innerText.includes('Lead Fresh')) && await y(page) === 800, await y(page));
    await context.close();
  }
  // Spinner on a fresh page, list and lead detail
  {
    const { context, page, world } = await open(browser, origin, { delay: 900 });
    await page.goto(`${origin}/admin-panel/leads`);
    await page.waitForSelector('[data-spinner]', { timeout: 5000 });
    const shell = await page.evaluate(() => ({ spin: !!document.querySelector('[data-spinner] svg.animate-spin'), heading: !!document.querySelector('button[aria-label="Sort by Lead"]'), search: !!document.querySelector('main input') }));
    check('fresh list: spinner, with headings and search already there', shell.spin && shell.heading && shell.search, shell);
    await page.waitForFunction(() => document.body.innerText.includes('Lead 39'));
    check('fresh list: spinner goes when data arrives', await page.evaluate(() => !document.querySelector('[data-spinner]')), null);
    await page.goto(`${origin}/admin-panel/leads/l5`);
    await page.waitForSelector('[data-spinner]', { timeout: 5000 });
    const detail = await page.evaluate(() => { const body = document.querySelector('[data-lead-body]'); return { title: !!document.querySelector('h1'), back: !!document.querySelector('[aria-label="Go back"]'), shown: !body.hidden && body.getBoundingClientRect().height > 100, sections: ['Contact', 'Current Stage', 'Proposals', 'Convert', 'Follow-ups'].every(name => body.innerText.toUpperCase().includes(name.toUpperCase())), passes: getComputedStyle(document.querySelector('[data-spinner]')).pointerEvents === 'none' }; });
    check('fresh lead: every section shows under the spinner, which blocks nothing', detail.title && detail.back && detail.shown && detail.sections && detail.passes, detail);
    await page.waitForFunction(() => /Edit Lead/.test(document.body.innerText));
    check('fresh lead: body shows when data arrives', await page.evaluate(() => !document.querySelector('[data-spinner]') && !document.querySelector('[data-lead-body]').hidden), null);
    world.delay = 0;
    await context.close();
  }
  // Nothing false shows while data is on its way
  {
    const { context, page } = await open(browser, origin, { delay: 1200 });
    await page.goto(`${origin}/admin-panel/leads`);
    await page.waitForSelector('[data-spinner]');
    check('loading list: no "Showing 0 of 0"', await page.evaluate(() => !/Showing 0 of 0/.test(document.querySelector('main').innerText)), null);
    await page.goto(`${origin}/admin-panel/leads/l5`);
    await page.waitForSelector('[data-spinner]');
    const lead = await page.evaluate(() => document.querySelector('main').innerText);
    check('loading lead: no invented status, N/A or empty message', !/Contacted|Neutral|N\/A|No proposals yet|No follow-ups yet/.test(lead.replace(/Dashboard[\s\S]*?Settings/, '')), lead.slice(0, 300));
    await page.goto(`${origin}/admin-panel/clients/c0`);
    await page.waitForSelector('[data-spinner]');
    const client = await page.evaluate(() => document.querySelector('main').innerText);
    check('loading client: spinner, tabs and section there, no false "No projects"', /Projects/.test(client) && /Create Project for Client/.test(client) && !/No projects found|No email available|N\/A/.test(client), client.slice(0, 300));
    await page.waitForFunction(() => !document.querySelector('[data-spinner]'), null, { timeout: 5000 });
    check('loaded client: content shows', await page.evaluate(() => /Create Project for Client/.test(document.querySelector('main').innerText)), null);
    await page.goto(`${origin}/admin-panel/dashboard`);
    await page.waitForSelector('main .animate-spin');
    const dash = await page.evaluate(() => ({ text: document.querySelector('main').innerText, spinners: document.querySelectorAll('main .animate-spin').length }));
    check('loading dashboard: no false 0, spinner in each count', !/Total Clients\s*0/.test(dash.text) && dash.spinners >= 4, { spinners: dash.spinners });
    await page.waitForFunction(() => /Active Clients\s*1/.test(document.querySelector('main').innerText), null, { timeout: 5000 });
    check('loaded dashboard: counts show', true, null);
    await context.close();
  }
  // 19: clickable headings
  {
    const { context, page, world } = await open(browser, origin);
    const row = (i, name, email, status, source, createdAt, updatedAt) => ({ _id: `l${i}`, name, phone: `98765${i}`, email, status, source, createdAt, updatedAt });
    world.leads = [
      row(0, 'Charlie', 'c@example.test', 'Won', 'WhatsApp', '2026-10-03', '2026-10-05'),
      row(1, 'alpha', '', 'Inquiry', 'Instagram', '2026-10-01', '2026-10-06'),
      row(2, 'Bravo', 'a@example.test', 'Contacted', 'WhatsApp', '2026-10-02', '2026-10-07'),
      row(3, 'Delta', 'b@example.test', 'Inquiry', '', '2026-10-04', '2026-10-04'),
    ];
    await page.goto(`${origin}/admin-panel/leads`);
    await page.waitForFunction(() => document.body.innerText.includes('Charlie')); await wait(page, 900);
    const order = () => page.evaluate(() => [...document.querySelectorAll('main [role=button]')].map(n => n.querySelector('p').textContent.match(/\d+\. (\w+)/)[1]));
    const head = async label => { const before = world.reads.length; await page.evaluate(l => document.querySelector(`button[aria-label="Sort by ${l}"]`).click(), label); await wait(page, 120); check(`sort ${label}: no server call`, world.reads.length === before, world.reads.slice(before)); return order(); };
    check('sort dropdown is gone', await page.evaluate(() => !document.querySelector('[aria-label="Sort leads"]')), null);
    check('default: Modified newest', (await order()).join() === 'Bravo,alpha,Charlie,Delta', await order());
    let r = await head('Lead'); check('Lead: A-Z', r.join() === 'alpha,Bravo,Charlie,Delta', r);
    r = await head('Lead'); check('Lead again: Z-A', r.join() === 'Delta,Charlie,Bravo,alpha', r);
    r = await head('Contact'); check('Contact: email A-Z', r.join() === 'Bravo,Delta,Charlie,alpha', r);
    r = await head('Status'); check('Status: filter order, newest inside', r.join() === 'alpha,Delta,Bravo,Charlie', r);
    r = await head('Source'); check('Source: grouped, blank last', r.join() === 'alpha,Bravo,Charlie,Delta', r);
    r = await head('Source'); check('Source again: blank still last', r.join() === 'Bravo,Charlie,alpha,Delta', r);
    r = await head('Added'); check('Added: newest first', r.join() === 'Delta,Charlie,Bravo,alpha', r);
    r = await head('Modified'); check('Modified: newest first', r.join() === 'Bravo,alpha,Charlie,Delta', r);
    r = await head('Modified'); check('Modified again: oldest first', r.join() === 'Delta,Charlie,alpha,Bravo', r);
    check('sort is in the URL', page.url().includes('sort=lastUpdatedAsc'), page.url());
    await page.locator('button[aria-label="Sort by Status"]').click(); await wait(page, 200);
    const look = await page.evaluate(() => {
      const read = label => { const style = getComputedStyle(document.querySelector(`button[aria-label="Sort by ${label}"]`)); return { color: style.color, weight: Number(style.fontWeight), ring: style.boxShadow }; };
      return { chosen: read('Status'), other: read('Lead') };
    });
    check('chosen heading is bold green', look.chosen.color === 'rgb(5, 150, 105)' && look.chosen.weight >= 800, look.chosen);
    check('other headings are plain', look.other.color !== look.chosen.color && look.other.weight < 800, look.other);
    check('a mouse click leaves no box', !/rgb\(110, 231, 183\)/.test(look.chosen.ring), look.chosen);
    await page.evaluate(() => document.querySelector('button[aria-label="Sort by Modified"]').click()); await wait(page, 120);
    await page.evaluate(() => document.querySelector('button[aria-label="Sort by Modified"]').click()); await wait(page, 120);
    check('Action heading is not clickable', await page.evaluate(() => !document.querySelector('button[aria-label="Sort by Action"]')), null);
    await page.evaluate(() => document.querySelector('main [role=button]').click()); await wait(page, 700);
    await backArrow(page); await wait(page, 300);
    check('sort survives the Back arrow', (await order()).join() === 'Delta,Charlie,alpha,Bravo', await order());
    await page.reload(); await page.waitForFunction(() => document.body.innerText.includes('Charlie')); await wait(page, 700);
    check('sort survives F5', (await order()).join() === 'Delta,Charlie,alpha,Bravo', await order());
    await context.close();
  }
  {
    const { context, page } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/clients`);
    await page.waitForFunction(() => document.body.innerText.includes('Client 79')); await wait(page, 900);
    check('Clients: sort dropdown is gone', await page.evaluate(() => !document.querySelector('[aria-label="Sort clients"]')), null);
    await page.evaluate(() => document.querySelector('button[aria-label="Sort by Client"]').click()); await wait(page, 120);
    const first = await page.evaluate(() => [...document.querySelectorAll('main button.grid')].slice(0, 3).map(n => n.textContent.match(/\d+\. (Client \d+)/)[1]));
    check('Clients: name A-Z, numbers in order', first.join() === 'Client 0,Client 1,Client 2', first);
    check('Clients: other headings clickable', await page.evaluate(() => ['Contact', 'Status', 'Joined', 'Updated'].every(l => document.querySelector(`button[aria-label="Sort by ${l}"]`)) && !document.querySelector('button[aria-label="Sort by Open"]')), null);
    await context.close();
  }
}

server.listen(0, async () => {
  const origin = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  try { await run(browser, origin); } catch (e) { console.log('CRASH', e.message); failures.push('crash'); }
  finally { await browser.close(); server.close(); }
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
});
