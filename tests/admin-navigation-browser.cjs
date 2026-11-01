// Moving between admin screens by clicking, the way an admin does. Local API fixtures only; never contacts production.
// Scroll checks click through the DOM: Playwright's .click() scrolls its target into view first and would hide a jump.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const build = path.resolve(process.env.PORTAL_BUILD || path.join(__dirname, '../build'));
const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
};

const clients = Array.from({ length: 150 }, (_, i) => ({ _id: `c${i}`, name: `Client ${i}`, email: `c${i}@example.test`, phone: `98765${10000 + i}`, status: 'active', createdAt: '2026-10-01' }));
const orders = Array.from({ length: 40 }).flatMap((_, i) => [
  { _id: `p${i}`, status: 'active', projectName: `Project ${i}`, productId: { serviceName: `Project ${i}`, category: 'website' }, createdAt: '2026-10-01', price: 100 },
  { _id: `q${i}`, status: 'active', isServicePlan: true, productId: { serviceName: `Plan ${i}`, category: 'seo' }, createdAt: '2026-10-01', price: 100 },
]);
const leads = Array.from({ length: 40 }, (_, i) => ({ _id: `l${i}`, name: `Lead ${i}`, phone: `98765${20000 + i}`, email: `l${i}@example.test`, source: 'website', status: 'New', createdAt: '2026-10-01', updatedAt: '2026-10-01' }));
const person = role => ({ _id: `u-${role}`, name: `Audit ${role}`, email: 'audit@example.test', phone: '9999999999', age: 30, role, roles: [role], activeRole: role, walletBalance: 0, isGuest: false });

function fixture(pathname, user) {
  if (pathname === '/api/user-details') return user;
  if (pathname === '/api/admin/dashboard-summary') return { active: 1, inactive: 0, joinedThisMonth: 0, recentClients: [] };
  if (pathname === '/api/admin/clients') return clients;
  if (pathname === '/api/admin/leads') return leads;
  if (/^\/api\/admin\/leads\/l\d+$/.test(pathname)) return { ...leads[Number(pathname.split('/l').pop())], followUps: [], offerTargets: [], finalMessage: null, contactBlock: null, clientAvailable: false };
  if (pathname === '/api/admin/final-message/count') return { count: 0 };
  if (pathname === '/api/admin/settings') return { leadReferralRewardAmount: 100 };
  if (pathname === '/api/admin/my-settings') return { name: 'Audit admin', loginEmail: 'audit@example.test', contactEmail: 'audit@example.test', whatsappNumbers: [], countries: [] };
  if (pathname.endsWith('/plan-catalogue')) return { plans: [], categories: [], products: [] };
  if (pathname === '/api/admin/user-workspace') return { customer: clients[0], orders, renewals: [], transactions: [], invoices: [], updates: [], plans: [], summary: { walletBalance: 0 } };
  return [];
}

const server = http.createServer((request, response) => {
  let file = path.join(build, new URL(request.url, 'http://local').pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(build, 'index.html');
  response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

async function open(browser, origin, { role = 'admin', signedOut = false, width = 1440, chunk, apiDelay } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 700 } });
  const reads = [];
  const errors = [];
  const user = person(role);
  let navigations = 0;
  await context.addInitScript(() => {
    window.__feeds = [];
    window.EventSource = class {
      constructor() { window.__feeds.push(this); setTimeout(() => { if (!this.closed) this.onmessage?.({ data: '{"type":"ready"}' }); }, 150); }
      close() { this.closed = true; }
    };
    window.__frames = [];
    const sample = () => {
      window.__frames.push({ at: performance.now(), shell: !!document.querySelector('nav, aside, header'), loader: [...document.querySelectorAll('[role=status]')].some(node => /Loading screen/.test(node.textContent)) });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest()) navigations += 1;
    if (url.origin === origin && !url.pathname.startsWith('/api/')) {
      const action = /chunk\.js$/.test(url.pathname) ? chunk?.(navigations) : null;
      if (action === 'missing') return route.fulfill({ status: 404, body: 'gone' });
      if (typeof action === 'number') await new Promise(resolve => setTimeout(resolve, action));
      return route.continue();
    }
    if (url.pathname === '/api/userLogout') { reads.push({ path: 'LOGOUT', at: Date.now() }); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"message":"Signed out"}' }); }
    if (request.method() !== 'GET') return route.fulfill({ status: 405, contentType: 'application/json', body: '{"success":false}' });
    if (url.pathname === '/api/user-details' && signedOut) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' });
    if (url.pathname !== '/api/user-details') reads.push({ path: url.pathname, at: Date.now() });
    await new Promise(resolve => setTimeout(resolve, url.pathname === '/api/user-details' ? 0 : (apiDelay?.(url.pathname) ?? 200)));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: fixture(url.pathname, user) }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, reads, errors };
}

const domClick = (page, selector, text) => page.evaluate(([css, label]) => {
  const node = [...document.querySelectorAll(css)].find(item => !label || item.textContent.includes(label));
  if (!node) throw new Error(`Nothing to click: ${css} ${label}`);
  node.click();
}, [selector, text]);
const clickRow = (page, pattern) => page.evaluate(source => {
  const test = new RegExp(source);
  const [row] = [...document.querySelectorAll('main *')].filter(node => test.test(node.textContent.trim()) && node.textContent.trim().length < 80).sort((a, b) => a.textContent.length - b.textContent.length);
  if (!row) throw new Error(`No row: ${source}`);
  row.click();
}, pattern);
const scrollY = page => page.evaluate(() => window.scrollY);
const scrollTo = async (page, y) => { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(120); };

async function sidebarNavigation(browser, origin) {
  const { context, page, reads, errors } = await open(browser, origin);
  await page.goto(`${origin}/admin-panel/dashboard`);
  await page.waitForSelector('aside');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__sidebar = document.querySelector('aside'); });
  for (const [label, expectedReads] of [['Leads', 2], ['Clients', 1], ['Trash', 1], ['Dashboard', 1], ['Leads', 2], ['Clients', 1]]) {
    const before = reads.length;
    const clickedAt = Date.now();
    const from = await page.evaluate(() => { document.querySelector('aside').scrollTop = 120; return { at: performance.now(), feeds: window.__feeds.length }; });
    await domClick(page, 'aside a', label);
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(start => {
      const frames = window.__frames.filter(frame => frame.at >= start);
      return {
        shellMissing: frames.filter(frame => !frame.shell).length,
        loader: frames.filter(frame => frame.loader).length,
        sameSidebar: document.querySelector('aside') === window.__sidebar,
        sidebarScroll: document.querySelector('aside').scrollTop,
        newConnections: window.__feeds.length,
      };
    }, from.at);
    const made = reads.slice(before);
    check(`${label}: sidebar never leaves`, seen.shellMissing === 0 && seen.sameSidebar, seen);
    check(`${label}: no full loading screen`, seen.loader === 0, seen);
    check(`${label}: sidebar keeps its scroll`, seen.sidebarScroll === 120, seen);
    check(`${label}: data loads once`, made.length === expectedReads, made.map(read => read.path));
    check(`${label}: no new live connection`, seen.newConnections === from.feeds, seen);
    check(`${label}: read starts right after the click`, made[0] && made[0].at - clickedAt < 150, made[0] && made[0].at - clickedAt);
  }
  check('sidebar navigation: no page errors', errors.length === 0, errors);
  await context.close();
}

async function liveUpdateAfterNavigation(browser, origin) {
  const { context, page, reads } = await open(browser, origin);
  await page.goto(`${origin}/admin-panel/dashboard`);
  await page.waitForSelector('aside');
  await page.waitForTimeout(1500);
  await domClick(page, 'aside a', 'Clients');
  await page.waitForTimeout(1200);
  const before = reads.length;
  await page.evaluate(() => window.__feeds.at(-1).onmessage({ data: JSON.stringify({ type: 'changed', resources: [{ domain: 'clients', ids: [], all: true }] }) }));
  await page.waitForTimeout(800);
  check('live update still refreshes the open page', reads.slice(before).some(read => read.path === '/api/admin/clients'), reads.slice(before));
  await context.close();
}

async function scrolling(browser, origin) {
  {
    const { context, page } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/clients/c0?tab=projects`);
    await page.waitForSelector('[role=tab]');
    await page.waitForTimeout(1500);
    for (const tab of ['Plans', 'Projects', 'Plans']) {
      await scrollTo(page, 150);
      await page.evaluate(name => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent.trim().startsWith(name)).click(), tab);
      await page.waitForTimeout(700);
      const y = await scrollY(page);
      check(`workspace tab ${tab}: page does not jump`, y === 150, y);
    }
    await scrollTo(page, 500);
    await clickRow(page, '(^|\\s|\\.)Plan 5(\\s|$)');
    await page.waitForTimeout(1200);
    const opened = await scrollY(page);
    check('workspace subpage opens at the top', page.url().includes('plan=') && opened === 0, { url: page.url(), opened });
    await page.goBack();
    await page.waitForTimeout(1200);
    const back = await scrollY(page);
    check('Back from a subpage returns to the list position', back === 500, back);
    await context.close();
  }
  {
    const { context, page } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/clients`);
    await page.waitForFunction(() => document.documentElement.scrollHeight > 3000);
    await page.waitForTimeout(800);
    await scrollTo(page, 1200);
    await domClick(page, 'aside a', 'Dashboard');
    await page.waitForTimeout(1300);
    check('a new screen opens at the top', await scrollY(page) === 0, await scrollY(page));
    await page.goBack();
    await page.waitForTimeout(1500);
    const back = await scrollY(page);
    check('Back to the clients list restores its position', back === 1200, back);
    await scrollTo(page, 200);
    await page.evaluate(() => {
      const input = document.querySelector('main input[placeholder*="Search clients"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Client');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const filtered = await scrollY(page);
    check('typing in a list filter does not jump', page.url().includes('q=Client') && filtered === 200, { url: page.url(), filtered });
    await context.close();
  }
}

async function leadPreview(browser, origin) {
  const { context, page, reads } = await open(browser, origin, { apiDelay: pathname => (/\/leads\/l\d+$/.test(pathname) ? 900 : 100) });
  await page.goto(`${origin}/admin-panel/leads`);
  await page.waitForFunction(() => document.body.innerText.includes('Lead 3'));
  await page.waitForTimeout(1500);
  const before = reads.length;
  await clickRow(page, '(^|\\s|\\.)Lead 3(\\s|$)');
  await page.waitForTimeout(300);
  const early = await page.evaluate(() => ({ title: document.querySelector('h1')?.textContent || '', buttons: [...document.querySelectorAll('main button')].filter(node => /Edit Lead/.test(node.textContent)).length, send: [...document.querySelectorAll('main button')].find(node => /Send message/.test(node.textContent))?.disabled }));
  check('lead name shows immediately', early.title.includes('Lead 3'), early);
  check('lead actions stay closed until full data arrives', early.buttons === 0 && early.send !== false, early);
  await page.waitForTimeout(1300);
  const late = await page.evaluate(() => [...document.querySelectorAll('main button')].filter(node => /Edit Lead/.test(node.textContent)).length);
  check('lead actions open after full data', late === 1, late);
  check('lead detail reads once', reads.slice(before).filter(read => read.path === '/api/admin/leads/l3').length === 1, reads.slice(before));
  await context.close();
}

async function slowFile(browser, origin) {
  let slow = false;
  const { context, page } = await open(browser, origin, { chunk: () => (slow ? 1500 : null) });
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; window.cancelIdleCallback = () => {}; });
  await page.goto(`${origin}/admin-panel/dashboard`);
  await page.waitForSelector('aside');
  await page.waitForTimeout(1200);
  slow = true;
  await domClick(page, 'aside a', 'Money Management');
  await page.waitForTimeout(200);
  const current = await page.evaluate(() => [...document.querySelectorAll('aside a')].find(node => node.textContent.includes('Money Management'))?.getAttribute('aria-current'));
  check('slow file: the clicked link responds at once', current === 'page', current);
  await page.waitForTimeout(1800);
  check('slow file: the screen opens', page.url().endsWith('/admin-panel/money-management') && await page.getByText('Unexpected Application Error!').count() === 0, page.url());
  await context.close();
}

async function missingFile(browser, origin) {
  for (const recovers of [false, true]) {
    let gone = false;
    const { context, page } = await open(browser, origin, { chunk: navigation => (gone && (!recovers || navigation === 1) ? 'missing' : null) });
    await page.addInitScript(() => { window.requestIdleCallback = () => 0; window.cancelIdleCallback = () => {}; });
    let documents = 0;
    page.on('request', request => { if (request.isNavigationRequest()) documents += 1; });
    await page.goto(`${origin}/admin-panel/dashboard`);
    await page.waitForSelector('aside');
    await page.waitForTimeout(1000);
    gone = true;
    await domClick(page, 'aside a', 'Money Management');
    await page.waitForTimeout(3500);
    const state = await page.evaluate(() => ({ failed: !!document.querySelector('[role=alert]'), sidebar: document.querySelectorAll('aside').length }));
    if (recovers) check('new deploy: one reload opens the screen', documents === 2 && !state.failed && state.sidebar === 1, { documents, ...state });
    else check('file really missing: one reload, then an error beside the sidebar', documents === 2 && state.failed && state.sidebar === 1, { documents, ...state });
    await context.close();
  }
}

async function everyRoute(browser, origin) {
  const { context, page, errors } = await open(browser, origin);
  for (const route of ['settings', 'dashboard', 'leads', 'leads/l1', 'clients', 'clients/c0', 'clients/c0/payments/order/p0', 'website-management/plans', 'project-setup/base-price', 'project-setup/features', 'trash', 'money-management', 'project-details/p0']) {
    await page.goto(`${origin}/admin-panel/${route}`);
    await page.waitForSelector('aside', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    const seen = await page.evaluate(() => ({ sidebars: [...document.querySelectorAll('aside')].filter(node => node.textContent.includes('Modules')).length, headers: document.querySelectorAll('header').length, name: document.querySelector('aside p')?.textContent, crashed: document.body.innerText.includes('Unexpected Application Error!') }));
    check(`${route}: one sidebar, one header, real name`, seen.sidebars === 1 && seen.headers === 1 && seen.name === 'Audit admin' && !seen.crashed, seen);
  }
  check('every route: no page errors', errors.length === 0, errors);
  await context.close();
}

async function logoutAndGuards(browser, origin) {
  {
    const { context, page, reads } = await open(browser, origin);
    await page.goto(`${origin}/admin-panel/clients/c0/payments/order/p0`);
    await page.waitForSelector('aside');
    await page.waitForTimeout(800);
    await domClick(page, 'aside button', 'Logout');
    await page.waitForTimeout(900);
    check('logout works on the payment page', reads.some(read => read.path === 'LOGOUT') && !page.url().includes('/admin-panel/'), page.url());
    await context.close();
  }
  {
    const { context, page, reads } = await open(browser, origin, { role: 'customer' });
    await page.goto(`${origin}/admin-panel/clients`);
    await page.waitForTimeout(1200);
    check('a customer cannot open admin', page.url().endsWith('/unauthorized') && !reads.some(read => read.path.startsWith('/api/admin')), { url: page.url(), reads });
    await context.close();
  }
  {
    const { context, page } = await open(browser, origin, { signedOut: true });
    await page.goto(`${origin}/admin-panel/clients`);
    await page.waitForTimeout(1200);
    check('signed out goes to login', new URL(page.url()).pathname === '/login', page.url());
    await context.close();
  }
}

async function keyboard(browser, origin) {
  const { context, page } = await open(browser, origin);
  // Trash, then Down to Money Management: a screen with no list of its own to take focus.
  await page.goto(`${origin}/admin-panel/trash`);
  await page.waitForSelector('aside');
  await page.waitForTimeout(800);
  await page.keyboard.press('Control+ArrowLeft');
  const sidebar = await page.evaluate(() => document.activeElement?.getAttribute('aria-current'));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const stillInSidebar = await page.evaluate(() => !!document.activeElement?.closest('aside'));
  await page.keyboard.press('Control+ArrowRight');
  const main = await page.evaluate(() => document.activeElement?.tagName);
  check('keyboard: Ctrl+Left reaches the sidebar', sidebar === 'page', sidebar);
  check('keyboard: focus stays on the sidebar after opening a screen', stillInSidebar, stillInSidebar);
  check('keyboard: Ctrl+Right reaches the page', main === 'MAIN', main);
  await context.close();
}

async function phone(browser, origin) {
  const { context, page, reads, errors } = await open(browser, origin, { width: 375 });
  await page.goto(`${origin}/admin-panel/dashboard`);
  await page.waitForFunction(() => document.querySelector('h1,h2'));
  await page.waitForTimeout(2500);
  for (const [label, expectedReads] of [['Clients', 1], ['Dashboard', 1], ['Leads', 2]]) {
    const before = reads.length;
    const from = await page.evaluate(() => performance.now());
    await domClick(page, 'a', label);
    await page.waitForTimeout(1300);
    const loader = await page.evaluate(start => window.__frames.filter(frame => frame.at >= start && frame.loader).length, from);
    check(`phone ${label}: no full loading screen, data loads once`, loader === 0 && reads.length - before === expectedReads, { loader, reads: reads.slice(before).map(read => read.path) });
  }
  check('phone: no page errors', errors.length === 0, errors);
  await context.close();
}

async function customer(browser, origin) {
  const { context, page, errors } = await open(browser, origin, { role: 'customer' });
  await page.goto(`${origin}/dashboard`);
  await page.waitForTimeout(1500);
  for (const route of ['/wallet', '/dashboard', '/documents', '/wallet']) {
    await page.evaluate(next => { history.pushState({}, '', next); dispatchEvent(new PopStateEvent('popstate')); }, route);
    await page.waitForTimeout(900);
    check(`customer ${route}: screen opens`, await page.getByText('Unexpected Application Error!').count() === 0 && await page.locator('[role=alert]').count() === 0, page.url());
  }
  check('customer: no page errors', errors.length === 0, errors);
  await context.close();
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const run of [sidebarNavigation, liveUpdateAfterNavigation, scrolling, leadPreview, slowFile, missingFile, everyRoute, logoutAndGuards, keyboard, phone, customer]) await run(browser, origin);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `FAILED ${failures.length} checks` : 'PASS admin navigation');
  process.exit(failures.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
