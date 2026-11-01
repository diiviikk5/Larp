// The Settings → Telegram screen in the real desktop app, against a stand-in Telegram API:
// connect a bot as the keeper, then see the "Link my Telegram" step.
//   npm run build && node test/telegram-ui.mjs [screenshot folder]
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-telegram-ui');
await fs.mkdir(out, { recursive: true });
const api = http.createServer(async (req, res) => {
  for await (const _ of req);
  const method = req.url.split('/')[2];
  const result = method === 'getMe' ? { id: 1, is_bot: true, username: 'sharma_home_bot' } : method === 'getUpdates' ? await new Promise((r) => setTimeout(() => r([]), 500)) : true;
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result }));
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-tgui-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1', LARP_TELEGRAM_API: `http://127.0.0.1:${api.address().port}` } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForFunction(() => Boolean(window.larp));
  await page.evaluate(() => window.larp.createSpace({ spaceName: 'Sharma home', kind: 'home', name: 'Mum', lan: false }));
  await page.reload();
  await page.locator('.sidebar .nav-item', { hasText: 'Settings' }).click();
  await page.locator('.settings-nav .nav-item', { hasText: 'Telegram' }).click();
  await page.screenshot({ path: path.join(out, 'telegram-setup.png') });
  await page.locator('input[placeholder^="123456789"]').fill('123456789:' + 'A'.repeat(35));
  await page.locator('button', { hasText: 'Connect bot' }).click();
  await page.locator('button', { hasText: 'Link my Telegram' }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(out, 'telegram-connected.png') });
  assert.ok(await page.locator('text=@sharma_home_bot').count());
  console.log('✓ keeper connected @sharma_home_bot from Settings; "Link my Telegram" is shown');
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  await app.close();
  api.closeAllConnections(); api.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
