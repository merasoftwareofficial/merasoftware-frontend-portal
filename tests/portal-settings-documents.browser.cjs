// Real built portal with local API fixtures. No authenticated production data
// or mutations. Checks responsive Documents, retry and Settings keyboard access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const build = path.resolve(process.env.PORTAL_UI_BUILD_DIR || path.join(__dirname, '../build'));
const baseline = process.env.PORTAL_UI_BASELINE_DIR && path.resolve(process.env.PORTAL_UI_BASELINE_DIR);
const output = path.join(build, 'documents-settings-check');
fs.mkdirSync(output, { recursive: true });
let activeBuild = build, documentError = false, documentCalls = 0;
const user = { _id: 'audit', name: 'UI Audit Customer', email: 'audit@example.test', phone: '9999999999', age: 30, role: 'customer', roles: ['customer'], activeRole: 'customer', walletBalance: 0, isGuest: false };
const documents = [{ id: 'doc1', kind: 'proposal', version: 1, name: 'Website development proposal and maintenance agreement with a deliberately long file name.pdf', date: '2026-10-26T06:00:00Z', size: 254000, downloadLink: 'https://download.example.test/file.pdf' }];
const server = http.createServer((req, res) => {
  let file = path.resolve(activeBuild, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(activeBuild + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(activeBuild, 'index.html');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const hashes = new Map(), comparisons = [], browserErrors = [];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const makeContext = async (theme, width) => {
      const context = await browser.newContext({ viewport: { width, height: 980 }, timezoneId: 'Asia/Kolkata' });
      await context.addInitScript(theme => {
        if (!localStorage.getItem('theme')) localStorage.setItem('theme', theme);
        if (!localStorage.getItem('accent')) localStorage.setItem('accent', 'cyan');
      }, theme);
      await context.routeWebSocket('**/*', socket => socket.close());
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
        assert.equal(route.request().method(), 'GET', 'Audit must not submit profile changes or upload files');
        let data = [];
        if (url.pathname === '/api/user-details') data = user;
        else if (url.pathname === '/api/my-documents') { documentCalls++; data = { documents }; }
        const failed = documentError && url.pathname === '/api/my-documents';
        return route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { success: false, message: 'Documents temporarily unavailable' } : { success: true, data }) });
      });
      return context;
    };
    for (const [phase, folder] of [...(baseline ? [['before', baseline]] : []), ['after', build]]) {
      activeBuild = folder;
      for (const theme of ['light', 'dark', 'immersive']) {
        for (const width of [375, 768, 1024, 1840]) {
          const context = await makeContext(theme, width);
          const page = await context.newPage();
          page.on('pageerror', error => browserErrors.push(error.message));
          for (const name of ['documents', 'games', 'settings']) {
            await page.goto(origin + '/' + name);
            await page.locator('main.portal-surface h1').first().waitFor();
            await page.waitForTimeout(850);
            if (phase === 'after') {
              const geometry = await page.evaluate(() => {
                const main = document.querySelector('main.portal-surface');
                const heading = main.querySelector('h1');
                const back = [...main.querySelectorAll('button')].find(el => el.textContent.trim() === 'Back');
                const rect = element => element.getBoundingClientRect();
                const intersects = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                const subtitle = heading.parentElement.querySelector('p');
                return { overflow: document.documentElement.scrollWidth > innerWidth, overlap: back && subtitle ? intersects(rect(back), rect(subtitle)) : false };
              });
              assert.equal(geometry.overflow, false, `${name}/${theme}/${width}: overflow`);
              assert.equal(geometry.overlap, false, `${name}/${theme}/${width}: header overlap`);
            }
            const key = `${name}-${theme}-${width}`;
            const visual = await page.locator('main.portal-surface').evaluate(main => ({
              text: main.innerText,
              elements: [main, ...main.querySelectorAll('*')].map(el => {
                const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
                return {
                  box: [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 1000) / 1000),
                  style: ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'border', 'borderRadius', 'boxShadow', 'backdropFilter'].map(key =>
                    // This label became a button with intentionally rounded focus
                    // outlines. Its unfocused pixels must still match below.
                    key === 'borderRadius' && el.textContent.trim() === 'Change profile picture' ? '0px' : style[key]
                  ),
                };
              }),
            }));
            const screenshot = await page.screenshot({ path: path.join(output, `${phase}-${key}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
            const hash = createHash('sha256').update(screenshot).digest('hex');
            if (phase === 'before') hashes.set(key, { hash, visual });
            else if (baseline && (name !== 'documents' || width >= 640)) {
              assert.deepEqual(visual, hashes.get(key).visual, `Existing geometry, text or styles changed: ${key}`);
              let rasterDifferences = 0;
              if (hash !== hashes.get(key).hash) {
                const before = await sharp(path.join(output, `before-${key}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const after = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                assert.deepEqual(after.info, before.info);
                for (let index = 0; index < before.data.length; index += 4) {
                  if (before.data.subarray(index, index + 4).some((value, channel) => value !== after.data[index + channel])) rasterDifferences++;
                }
                // Backdrop-filter edge rasterization can vary between captures.
                // Only allow <=0.02% pixels AFTER exact geometry/text/style equality.
                assert.ok(rasterDifferences <= Math.ceil(after.info.width * after.info.height * 0.0002), `Existing pixels changed: ${key}, ${rasterDifferences}`);
              }
              comparisons.push({ key, rasterDifferences });
            }
          }
          await context.close();
          console.log(`PASS ${phase} ${theme} ${width}`);
        }
      }
    }
    activeBuild = build;
    const context = await makeContext('light', 375);
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    documentError = true;
    await page.goto(origin + '/documents');
    await page.getByRole('alert').getByText('Documents temporarily unavailable').waitFor();
    const callsBeforeRetry = documentCalls;
    documentError = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).press('Enter');
    await page.getByRole('link', { name: 'Download', exact: true }).waitFor();
    assert.equal(documentCalls, callsBeforeRetry + 1);
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(new URL(page.url()).pathname, '/documents');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForURL('**/dashboard');

    await page.goto(origin + '/settings');
    const themeGroup = page.getByRole('radiogroup', { name: 'Theme', exact: true });
    const colourGroup = page.getByRole('radiogroup', { name: 'Colour', exact: true });
    assert.equal(await themeGroup.locator('[role=radio][tabindex="0"]').count(), 1);
    assert.equal(await colourGroup.locator('[role=radio][tabindex="0"]').count(), 1);
    await themeGroup.getByRole('radio').first().focus();
    for (const [key, expected] of [['ArrowRight', 'dark'], ['ArrowDown', 'immersive'], ['ArrowRight', 'light'], ['ArrowLeft', 'immersive'], ['Home', 'light'], ['End', 'immersive'], ['ArrowUp', 'dark']]) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('html').getAttribute('data-theme'), expected);
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-checked')), 'true');
    }
    await page.keyboard.press('Tab');
    assert.equal(await colourGroup.getByRole('radio', { name: 'Cyan', exact: true }).evaluate(el => el === document.activeElement), true);
    for (const [key, expected] of [['ArrowRight', 'red'], ['ArrowLeft', 'cyan'], ['ArrowLeft', 'pink'], ['Home', 'cyan'], ['End', 'pink']]) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('html').getAttribute('data-accent'), expected);
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-checked')), 'true');
    }
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('html').getAttribute('data-accent'), 'pink');
    const picture = page.getByRole('button', { name: 'Change profile picture', exact: true });
    await picture.focus();
    for (const key of ['Enter', 'Space']) {
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press(key);
      assert.equal((await chooser).isMultiple(), false);
    }
    assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    await context.close();
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ comparisons, browserErrors, checks: ['header geometry', 'documents retry and Back', 'theme/colour arrows, wrapping, Home/End, Tab and persistence', 'picture chooser Enter/Space'] }, null, 2));
    assert.deepEqual(browserErrors, []);
    console.log(`PASS controls and responsive UI; ${comparisons.length} unchanged screenshots. Evidence: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
