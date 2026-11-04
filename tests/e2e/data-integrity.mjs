import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Path traversal');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

const listen = () => new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server.address().port)));
const waitForApp = async page => {
  await page.goto(page.url().startsWith('file:') ? page.url() : page.url(), { waitUntil:'domcontentloaded' }).catch(() => {});
  await page.locator('#section-1').waitFor({ state:'attached', timeout:15000 });
  await page.waitForFunction(() => document.querySelectorAll('.section-card').length >= 7);
};
const storage = page => page.evaluate(() => ({
  inventory: JSON.parse(localStorage.getItem('anbar.inventory.v1') || '[]'),
  entries: JSON.parse(localStorage.getItem('anbar.entry-history.v1') || '[]'),
  shipments: JSON.parse(localStorage.getItem('anbar.shipments.v1') || '[]')
}));

async function exerciseApplication(browser, port, route, label) {
  const context = await browser.newContext({ acceptDownloads:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/${route}`, { waitUntil:'domcontentloaded' });
  await page.locator('#section-1').waitFor({ state:'attached', timeout:20000 });
  await page.waitForFunction(() => document.querySelectorAll('.section-card').length >= 7, null, { timeout:20000 });

  const code = '98765432';
  await page.locator('#supply-code').fill(code);
  await page.locator('#item-description').fill('کالای آزمون یکپارچه');
  await page.locator('#item-stock').fill('10');
  await page.locator('#confirm-all-imports').click();
  await page.waitForFunction(() => {
    const items = JSON.parse(localStorage.getItem('anbar.inventory.v1') || '[]');
    const entries = JSON.parse(localStorage.getItem('anbar.entry-history.v1') || '[]');
    return items.some(item => item.code === '98765432' && Number(item.stock) === 10) && entries.length === 1;
  });
  let data = await storage(page);
  assert.equal(data.inventory.find(item => item.code === code)?.stock, 10, `${label}: stock after initial entry`);
  assert.equal(data.entries.length, 1, `${label}: entry history`);

  // Existing code must require an explicit duplicate decision; cancellation must preserve the stored record.
  await page.locator('#supply-code').fill(code);
  await page.locator('#item-description').fill('شرح جایگزین آزمایشی');
  await page.locator('#item-stock').fill('99');
  await page.locator('#confirm-all-imports').click();
  await page.locator('#duplicate-dialog').waitFor({ state:'visible' });
  await page.locator('#duplicate-import-cancel').click();
  data = await storage(page);
  assert.equal(data.inventory.find(item => item.code === code)?.stock, 10, `${label}: duplicate cancellation must not overwrite stock`);

  // Attempt to send more than the current stock. No shipment or stock mutation is allowed.
  const sendInput = page.locator('#inventory-grid input[aria-label*="' + code + '"]');
  await sendInput.fill('11');
  await sendInput.dispatchEvent('change');
  await page.locator('#open-shipment-dialog').click();
  await page.locator('#shipment-dialog').waitFor({ state:'visible' });
  await page.locator('#shipment-location').fill('محل آزمون');
  await page.locator('.shipment-quantity').fill('11');
  await page.locator('#confirm-shipment').click();
  await page.waitForFunction(() => document.getElementById('shipment-feedback')?.textContent.includes('بیشتر از صفر'));
  data = await storage(page);
  assert.equal(data.inventory.find(item => item.code === code)?.stock, 10, `${label}: rejected over-shipment must preserve stock`);
  assert.equal(data.shipments.length, 0, `${label}: rejected over-shipment must not create shipment`);

  // Valid shipment should atomically reduce stock and create history.
  await page.locator('.shipment-quantity').fill('4');
  await page.locator('#confirm-shipment').click();
  await page.waitForFunction(() => {
    const items = JSON.parse(localStorage.getItem('anbar.inventory.v1') || '[]');
    const shipments = JSON.parse(localStorage.getItem('anbar.shipments.v1') || '[]');
    return items.some(item => item.code === '98765432' && Number(item.stock) === 6) && shipments.length === 1;
  });
  data = await storage(page);
  assert.equal(data.inventory.find(item => item.code === code)?.stock, 6, `${label}: stock after shipment`);
  assert.equal(data.shipments.length, 1, `${label}: shipment history`);

  // Kardex must reflect both sides of the same item lifecycle.
  await page.locator('a[href="#section-5"]').click();
  await page.locator('#kardex-code-search').fill(code);
  await page.locator('#kardex-code-suggestions .kardex-suggestion-option').first().click();
  await page.waitForFunction(() => {
    const body = document.getElementById('kardex-body');
    return body && body.querySelectorAll('tr').length >= 2;
  }, null, { timeout:10000 });
  const kardexText = await page.locator('#kardex-body').innerText();
  assert.match(kardexText, /ورود/);
  assert.match(kardexText, /خروج/);

  // Refresh must not lose the committed stock or histories.
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.locator('#section-1').waitFor({ state:'attached' });
  data = await storage(page);
  assert.equal(data.inventory.find(item => item.code === code)?.stock, 6, `${label}: stock after reload`);
  assert.equal(data.entries.length, 1, `${label}: entry history after reload`);
  assert.equal(data.shipments.length, 1, `${label}: shipment history after reload`);

  // Exported backup must be valid JSON and contain the tested inventory and histories.
  await page.locator('a[href="#section-3"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-backup-json').click();
  const download = await downloadPromise;
  const backupPath = `/tmp/anbar-e2e-${label.replace(/[^a-z0-9]/gi,'-')}.json`;
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.ok(Array.isArray(backup.inventory) && backup.inventory.some(item => item.code === code && Number(item.stock) === 6));
  assert.ok(Array.isArray(backup.entryHistory) && backup.entryHistory.length === 1);
  assert.ok(Array.isArray(backup.shipments) && backup.shipments.length === 1);

  assert.deepEqual(errors, [], `${label}: uncaught browser errors`);
  await context.close();
  console.log(`PASS ${label}: entry → inventory → kardex → shipment validation → reload → backup`);
}

const port = await listen();
let browser;
try {
  browser = await chromium.launch({ headless:true });
  await exerciseApplication(browser, port, '', 'multi-file');
  await exerciseApplication(browser, port, 'anbar-standalone.html', 'standalone');
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
