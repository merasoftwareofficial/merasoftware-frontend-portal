// Real production app, including routing, Header, Sidebar and DashboardLayout.
// Only remote API responses are fixtures. Optional baseline build proves the
// shared visual-frame extraction preserves the existing customer pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const after = path.resolve(process.env.PORTAL_UI_BUILD_DIR || path.join(root, 'build'));
const baseline = process.env.PORTAL_UI_BASELINE_DIR && path.resolve(process.env.PORTAL_UI_BASELINE_DIR);
const output = path.join(after, 'workspace-ui-check');
fs.mkdirSync(output, { recursive: true });
const now = Date.parse('2026-10-26T06:00:00Z');
const createdAt = new Date(now).toISOString();
const user = { _id: 'audit-customer', name: 'UI Audit Customer', email: 'audit@example.test', role: 'customer', roles: ['customer'], activeRole: 'customer', walletBalance: 0, isGuest: false };
const service = { _id: 'audit-service', isServicePlan: true, isActive: true, servicePlanStatus: 'active', createdAt, updatedAt: createdAt, serviceInvoices: [], serviceAccessUsedInCycle: 1, servicePlanSnapshot: { serviceName: 'Audit maintenance', portalAccessCount: 5, filesLimit: 10, limitScope: 'monthly' }, productId: { serviceName: 'Audit maintenance', category: 'service_plan', validityPeriod: 365, updateCount: 5 }, totalAmount: 1000, amountPaid: 1000 };
const project = { _id: 'audit-project', isWebsiteProject: true, projectSnapshot: { displayName: 'Audit website project', category: 'standard_websites', categoryLabel: 'Website' }, productId: { serviceName: 'Audit website project', category: 'standard_websites' }, orderVisibility: 'approved', orderState: { code: 'in_progress', label: 'In progress', tone: 'pending', progress: 25 }, projectProgress: 25, totalAmount: 5000, amountPaid: 5000, createdAt, updatedAt: createdAt, projectNodes: [{ nodeId: 'stage-1', title: 'Design', status: 'active', progress: 25, percentage: 25, createdAt }], messages: [], linkedServices: [service], isPartialPayment: false, hasUnpaidInvoice: false };
const reserved = { id: 'active-offer', title: 'Digital offer', reservedPrice: 2099, reservedAt: createdAt, expiresAt: new Date(now + 72 * 3600000).toISOString(), status: 'reserved', terms: ['Reserved scope and payment terms'] };
const offers = [reserved,
  { ...reserved, id: 'extended', title: 'Extended offer', extendedUntil: new Date(now + 96 * 3600000).toISOString(), deadline: new Date(now + 96 * 3600000).toISOString() },
  { ...reserved, id: 'review', title: 'Review offer', status: 'under_review', expiresAt: new Date(now - 1000).toISOString(), projectId: 'audit-project' },
  { ...reserved, id: 'confirmed', title: 'Confirmed offer', status: 'confirmed', expiresAt: new Date(now - 1000).toISOString(), projectId: 'audit-project' },
  { ...reserved, id: 'expired', title: 'Expired offer', expiresAt: new Date(now - 1000).toISOString(), status: 'expired' },
];
const routes = ['/dashboard', '/projects-and-plans', '/order', '/project-details/audit-project', '/project-details/audit-project?view=project', '/plan-details/audit-service', '/documents', '/settings'];
const failures = [], results = [], signatures = new Map();
let buildDir = after, offerRows = offers;

const server = http.createServer((req, res) => {
  let file = path.resolve(buildDir, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(buildDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(buildDir, 'index.html');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [phase, folder] of [...(baseline ? [['before', baseline]] : []), ['after', after]]) {
      buildDir = folder;
      for (const theme of ['light', 'dark', 'immersive']) {
        for (const width of [1840, 375]) {
          const context = await browser.newContext({ viewport: { width, height: 980 }, timezoneId: 'Asia/Kolkata' });
          await context.addInitScript(theme => { localStorage.setItem('theme', theme); localStorage.setItem('accent', 'cyan'); }, theme);
          await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
            let data = [];
            if (url.pathname === '/api/user-details') data = user;
            else if (url.pathname === '/api/get-order') data = [project, service];
            else if (url.pathname.startsWith('/api/order-details/')) data = url.pathname.endsWith('audit-service') ? service : project;
            else if (url.pathname === '/api/my-documents') data = { documents: [] };
            else if (url.pathname === '/api/offer-reservations') data = { reservations: offerRows, serverNow: createdAt };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
          });
          const page = await context.newPage();
          page.on('pageerror', error => failures.push(error.message));
          const references = {};
          for (const route of [...routes, ...(phase === 'after' ? ['/my-offers'] : [])]) {
            await page.goto(origin + route);
            await page.locator('main.portal-surface h1').first().waitFor();
            await page.waitForTimeout(950); // Real PageTransition and AnimatedSection.
            assert.equal(await page.getByText('Unexpected Application Error!', { exact: true }).count(), 0);
            const visual = await page.evaluate(() => {
              const main = document.querySelector('main.portal-surface');
              const h1 = main.querySelector('h1');
              const container = main.querySelector('[class*="max-w-7xl"]') || main.querySelector('[class*="max-w-4xl"]') || main.querySelector('[class*="max-w-3xl"]');
              const frame = main.querySelector('.surface');
              const info = element => {
                if (!element) return null;
                const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
                return { x: rect.x, y: rect.y, width: rect.width, fontSize: css.fontSize, lineHeight: css.lineHeight, padding: css.padding, radius: css.borderRadius, border: css.border, shadow: css.boxShadow, background: css.backgroundColor };
              };
              const header = main.querySelector('header') || h1.parentElement;
              return { heading: info(h1), container: info(container), frame: info(frame), frameGap: frame ? frame.getBoundingClientRect().y - header.getBoundingClientRect().bottom : null, overflow: document.documentElement.scrollWidth > innerWidth, theme: document.documentElement.dataset.theme };
            });
            const key = `${route}-${theme}-${width}`;
            const filename = `${phase}-${key.replaceAll('/', '_').replaceAll('?', '_').replaceAll('=', '_')}.png`;
            const screenshot = await page.screenshot({ path: path.join(output, filename), fullPage: true, animations: 'disabled', caret: 'hide' });
            const hash = createHash('sha256').update(screenshot).digest('hex');
            if (phase === 'before') signatures.set(key, { visual, hash });
            else if (baseline && route !== '/my-offers') {
              assert.deepEqual(visual, signatures.get(key).visual, `Existing geometry changed: ${key}`);
              if (hash !== signatures.get(key).hash) failures.push(`Existing screenshot changed: ${key}`);
            }
            if (phase === 'after') {
              references[route] = visual;
              assert.equal(visual.overflow, false, `${key} overflow`);
              if (route === '/my-offers') {
                const reference = references['/projects-and-plans'];
                assert.deepEqual(visual.container, reference.container, 'Offers shares the real Projects and Plans container');
                assert.deepEqual(visual.heading, reference.heading, 'Offers shares heading size and placement');
                const { y: offerY, ...offerFrame } = visual.frame;
                const { y: referenceY, ...referenceFrame } = reference.frame;
                assert.ok(offerY > 0 && referenceY > 0);
                assert.deepEqual(offerFrame, referenceFrame, 'Offers shares panel width and appearance');
                assert.equal(visual.frameGap, reference.frameGap, 'Same spacing below the page header, including wrapped subtitles');
                assert.equal(await page.locator('main.portal-surface article').count(), offers.length);
                await page.locator('article').first().locator('summary').focus();
                await page.keyboard.press('Enter');
                assert.equal(await page.locator('article').first().locator('details').getAttribute('open'), '');
              }
            }
            results.push({ phase, route, width, theme, visual, hash });
          }
          await context.close();
          console.log(`PASS ${phase} ${theme} ${width}`);
        }
      }
    }
    // Empty list uses the same frame; no background drop or detached card.
    offerRows = [];
    const page = await browser.newPage({ viewport: { width: 1840, height: 980 } });
    await page.route('**/api/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: pathname === '/api/user-details' ? user : pathname === '/api/offer-reservations' ? { reservations: [], serverNow: createdAt } : [] }) });
    });
    await page.goto(origin + '/my-offers');
    await page.getByRole('heading', { name: 'You have no reserved offers yet.' }).waitFor();
    await page.screenshot({ path: path.join(output, 'after-empty.png'), fullPage: true, animations: 'disabled' });
    await page.close();
    fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ failures, results }, null, 2));
    assert.deepEqual(failures, []);
    console.log(`PASS real portal layout, visual baseline and offer structure. Evidence: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
