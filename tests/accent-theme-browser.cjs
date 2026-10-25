// Accent colour + theme: measured in a real browser against the BUILT stylesheet.
// Run after `npm run build`:  node tests/accent-theme-browser.cjs
// Proves: every accent x every theme clears contrast on its roles; status green does
// not follow the accent; a swatch previews its own preset; header ThemeSwitch and
// Settings → Appearance share one state; the choice persists; the pre-paint script
// in public/index.html applies both attributes and rejects junk values.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const cssDir = path.join(process.env.PORTAL_UI_BUILD_DIR || path.join(ROOT, 'build'), 'static/css');
const cssFile = fs.readdirSync(cssDir).find((f) => /^main\..*\.css$/.test(f));
const css = fs.readFileSync(path.join(cssDir, cssFile), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const prePaint = indexHtml.match(/<script>([\s\S]*?)<\/script>/)[1];

const THEMES = ['light', 'dark', 'immersive'];
const ACCENTS = ['cyan', 'red', 'green', 'purple', 'yellow', 'orange', 'magenta', 'pink'];

(async () => {
  const script = await build({
    stdin: {
      resolveDir: ROOT, loader: 'jsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {ThemeProvider} from './src/context/ThemeContext';
      import ThemeSwitch from './src/components/ThemeSwitch';
      import AppearanceSettingsSection from './src/components/settings/AppearanceSettingsSection';
      createRoot(document.getElementById('root')).render(
        <ThemeProvider><div id="header"><ThemeSwitch /></div><AppearanceSettingsSection /></ThemeProvider>
      );`,
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });

  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(script.outputFiles[0].text); return; }
    if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); res.end(css); return; }
    if (req.url === '/prepaint') {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html><head><script>${prePaint}</script></head><body></body></html>`);
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/app.css"><script>${prePaint}</script></head>
      <body class="portal-surface"><div id="root"></div>
      <div id="probe">
        <button id="solid" class="bg-accent-solid text-accent-on-solid">Pay</button>
        <span id="hover" style="background: rgb(var(--accent-solid-hover)); color: rgb(var(--accent-on-solid))">Hover</span>
        <span id="text" class="text-accent-text">Link</span>
        <span id="soft" style="background: var(--accent-soft-bg); color: var(--accent-soft-fg)">Chip</span>
        <span id="nav" style="background: var(--nav-active-bg); color: var(--nav-active-fg)">Nav</span>
        <span id="eyebrow" style="color: var(--eyebrow-fg)">Eyebrow</span>
        <span id="status" class="badge badge-success">Paid</span>
      </div>
      <script src="/app.js"></script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  try {
    const page = await browser.newPage();
    await page.goto(base);

    // ---- 1. contrast matrix ------------------------------------------------
    const measure = () => page.evaluate(() => {
      const parse = (s) => {
        const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
        const p = m[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
        return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
      };
      const over = (top, bottom) => top.c.map((v, i) => v * top.a + bottom[i] * (1 - top.a));
      const lum = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const pageBg = parse(getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)})`)).c;
      const pair = (id) => { const s = getComputedStyle(document.getElementById(id)); const bg = parse(s.backgroundColor); const fg = parse(s.color); const ground = bg && bg.a > 0 ? over(bg, pageBg) : pageBg; return cr(over(fg, ground), ground); };
      return {
        solid: pair('solid'), hover: pair('hover'), text: pair('text'), soft: pair('soft'), nav: pair('nav'), eyebrow: pair('eyebrow'),
        status: getComputedStyle(document.getElementById('status')).color,
      };
    });

    const statusByTheme = {};
    const rows = [];
    for (const theme of THEMES) {
      for (const accent of ACCENTS) {
        await page.evaluate(([t, a]) => { document.documentElement.setAttribute('data-theme', t); document.documentElement.setAttribute('data-accent', a); }, [theme, accent]);
        const m = await measure();
        rows.push({ theme, accent, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(2)) : v])) });
        for (const k of ['solid', 'hover', 'text', 'soft', 'nav', 'eyebrow']) {
          if (!(m[k] >= 4.5)) failures.push(`${theme}/${accent} ${k} ${m[k].toFixed(2)}`);
        }
        statusByTheme[theme] = statusByTheme[theme] || new Set();
        statusByTheme[theme].add(m.status);
      }
    }
    console.table(rows.map(({ status, ...r }) => r));
    for (const [theme, set] of Object.entries(statusByTheme)) {
      if (set.size !== 1) failures.push(`status colour changed with accent in ${theme}: ${[...set].join(' | ')}`);
      else console.log(`status (Paid) colour in ${theme}, same for all 8 accents:`, [...set][0]);
    }

    // ---- 2. swatch previews its own preset while <html> is another ----------
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.setAttribute('data-accent', 'cyan'); });
    const swatches = await page.$$eval('[role="radio"] [data-accent]', (els) => els.map((el) => [el.getAttribute('data-accent'), getComputedStyle(el).backgroundColor]));
    const swatchColours = new Set(swatches.map(([, c]) => c));
    assert.equal(swatches.length, 8, 'eight swatches');
    assert.equal(swatchColours.size, 8, `each swatch shows a distinct colour: ${JSON.stringify(swatches)}`);
    assert.equal(swatches.find(([a]) => a === 'cyan')[1], 'rgb(0, 184, 204)', 'cyan swatch = website --brand-cyan #00b8cc');
    console.log('swatches:', swatches.map(([a, c]) => `${a}=${c}`).join('  '));

    // ---- 3. one state: Settings click -> html + storage + header -----------
    await page.click('[role="radio"][aria-label="Pink"]');
    assert.equal(await page.getAttribute('html', 'data-accent'), 'pink');
    assert.equal(await page.evaluate(() => localStorage.getItem('accent')), 'pink');
    assert.equal(await page.getAttribute('[role="radio"][aria-label="Pink"]', 'aria-checked'), 'true');
    await page.click('#settings-theme-label ~ div [role="radio"]:has-text("Solid Dark")');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    const headerLabel = await page.textContent('#header button[aria-label="Change appearance"]');
    assert.match(headerLabel, /Solid Dark/, 'header ThemeSwitch shows the theme chosen in Settings');
    await page.click('#header button[aria-label="Change appearance"]');
    await page.click('#header [role="menuitemradio"]:has-text("Light")');
    assert.equal(await page.getAttribute('#settings-theme-label ~ div [role="radio"]:has-text("Light")', 'aria-checked'), 'true', 'Settings shows the theme chosen in the header');
    console.log('header <-> Settings: one state (both directions) OK');

    // ---- 4. persistence after reload ----------------------------------------
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-accent'), 'pink');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    assert.equal(await page.getAttribute('[role="radio"][aria-label="Pink"]', 'aria-checked'), 'true');
    console.log('reload keeps theme + accent OK');

    // ---- 5. pre-paint script alone (no React) -------------------------------
    const pre = await browser.newPage();
    await pre.goto(base + '/prepaint');
    const cases = [[null, null, 'light', 'cyan'], ['dark', 'orange', 'dark', 'orange'], ['bogus', 'evil"x', 'light', 'cyan']];
    for (const [t, a, et, ea] of cases) {
      await pre.evaluate(([t2, a2]) => { localStorage.clear(); if (t2) localStorage.setItem('theme', t2); if (a2) localStorage.setItem('accent', a2); }, [t, a]);
      await pre.reload();
      assert.deepEqual([await pre.getAttribute('html', 'data-theme'), await pre.getAttribute('html', 'data-accent')], [et, ea], `pre-paint ${t}/${a}`);
    }
    console.log('pre-paint script: default, saved and junk values OK');
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) { console.error('CONTRAST FAILURES:\n' + failures.join('\n')); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})().catch((error) => { console.error(error); process.exit(1); });
