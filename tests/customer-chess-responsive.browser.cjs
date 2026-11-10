// Renders the real chess board with the compiled portal CSS and a local board fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../../merasoftware/node_modules/esbuild');
const { chromium } = require('../../merasoftware/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const buildDir = path.resolve(process.env.PORTAL_UI_BUILD_DIR || path.join(root, 'build'));

(async () => {
  const cssDir = path.join(buildDir, 'static/css');
  const css = fs.readFileSync(path.join(cssDir, fs.readdirSync(cssDir).find(name => name.startsWith('main.') && name.endsWith('.css'))), 'utf8');
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import ChessBoardFlat from './src/chess/ChessBoardFlat';
        const board = Array.from({length: 8}, () => Array(8).fill(null));
        board[6][0] = { type: 'pawn', color: 'white' };
        createRoot(document.getElementById('root')).render(<ChessBoardFlat board={board} turn="white" assignedColor="white" onMove={(from, to) => { window.move = {from, to}; }} />);`,
      resolveDir: root, loader: 'jsx',
    },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent('<div id="root" style="width:calc(100% - 32px);margin:auto"></div>');
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const board = page.locator('#root > div');
      const box = await board.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `Board clipped at ${width}`);
      const squares = board.locator(':scope > div > div > div');
      assert.equal(await squares.count(), 64);
      const first = await squares.nth(0).boundingBox();
      assert.ok(Math.abs(first.width - first.height) < 0.1, `Non-square board at ${width}`);
      if (width >= 768) assert.ok(Math.abs(first.width - 64) < 0.1, `Desktop square size changed at ${width}`);
      await squares.nth(48).click();
      await squares.nth(40).click();
      assert.deepEqual(await page.evaluate(() => window.move), { from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
      console.log(`PASS chess board ${width}`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
