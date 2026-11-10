// Run against a current build: PORTAL_UI_BUILD_DIR=<build> node tests/customer-responsive-shell.browser.cjs
// API responses are local fixtures; no real purchase or network mutation is made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const build = path.resolve(process.env.PORTAL_UI_BUILD_DIR || path.join(__dirname, '../build'));
const user = { _id: 'audit', name: 'Test Customer', email: 'audit@example.test', role: 'customer', roles: ['customer'], activeRole: 'customer' };
const product = { _id: 'audit-product', serviceName: 'Test project', category: 'standard_websites', sellingPrice: 1000, additionalFeaturesData: [] };
const server = http.createServer((req, res) => {
  let file = path.resolve(build, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(build + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(build, 'index.html');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/user-details') data = user;
        if (url.pathname === '/api/product-details') data = product;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
      });

      await page.goto(origin + '/start-new-project/audit-product');
      await page.getByLabel('Change appearance').click();
      const menu = await page.getByRole('menu').boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width, `Appearance menu outside viewport at ${width}`);
      await page.getByLabel('Change appearance').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflows at ${width}`);

      await page.getByRole('button', { name: 'Add to Cart' }).click();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      const cart = page.getByLabel('Open cart, 1 item');
      const cartBox = await cart.boundingBox();
      if (width < 1024) {
        const nav = await page.locator('nav').filter({ has: page.getByRole('button', { name: 'More' }) }).boundingBox();
        assert.ok(cartBox.y + cartBox.height <= nav.y, `Cart overlaps navigation at ${width}`);
      }
      await cart.click();
      await page.getByText('Your Cart (1)').waitFor();
      console.log(`PASS customer shell ${width}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
