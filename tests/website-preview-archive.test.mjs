import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { extractWebsite } from '../src/helpers/websitePreviewArchive.js';
const policy = { zipBytes: 1024 * 1024, fileBytes: 10000, totalBytes: 20000, pathBytes: 240, fileCount: 10, mime: { html: 'text/html', js: 'application/javascript', css: 'text/css' } };
const zip = object => zipSync(Object.fromEntries(Object.entries(object).map(([name, value]) => [name, strToU8(value)])));
test('extracts a wrapped site, preserves case/clean route folders, and excludes packaging metadata', () => {
  const files = extractWebsite(zip({ 'site/index.html': 'hello', 'site/Services/index.html': 'service', 'site/assets/site.js': 'code', '__MACOSX/file': 'ignored' }), policy);
  assert.deepEqual(files.map(f => f.path).sort(), ['Services/index.html', 'assets/site.js', 'index.html']);
  assert.equal(new TextDecoder().decode(files.find(f => f.path === 'index.html').buffer), 'hello');
});
test('rejects missing index, traversal, reserved routes and server executables', () => {
  for (const name of ['../x.js', 'api/x.js', 'admin/index.html', 'bad.php', 'x\\y.js', 'x/%2f.js']) assert.throws(() => extractWebsite(zip({ 'index.html': 'ok', [name]: 'bad' }), policy), undefined, name);
  assert.throws(() => extractWebsite(zip({ 'other.html': 'hello' }), policy), /index.html/);
});
test('stops declared and actual decompression overruns', () => {
  assert.throws(() => extractWebsite(zip({ 'index.html': 'x'.repeat(10001) }), policy), /size limit/);
  const bytes = zip({ 'index.html': 'x'.repeat(1000) });
  const view = new DataView(bytes.buffer); let cursor = 0;
  while (cursor < bytes.length - 46 && view.getUint32(cursor, true) !== 0x02014b50) cursor++;
  view.setUint32(cursor + 24, 2, true);
  assert.throws(() => extractWebsite(bytes, policy), /size limit|does not match/);
});
test('rejects Unix symlinks and excessive file counts', () => {
  const bytes = zip({ 'index.html': 'hello' }), view = new DataView(bytes.buffer); let cursor = 0;
  while (cursor < bytes.length - 46 && view.getUint32(cursor, true) !== 0x02014b50) cursor++;
  view.setUint32(cursor + 38, 0xa1ff0000, true);
  assert.throws(() => extractWebsite(bytes, policy), /symlinks/);
  assert.throws(() => extractWebsite(zip({ 'index.html': 'ok', 'x.js': 'x' }), { ...policy, fileCount: 1 }), /too many/);
});
