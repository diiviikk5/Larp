// Automatic updates, end to end: an installed-style Larp (an unpacked build) checks a feed that offers a
// newer version, downloads it in the background, and shows "Restart to update".
//   node test/update.mjs <unpacked app folder> <folder with latest.yml + newer installer> [screenshot folder]
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const [appDir, feedDir, out = os.tmpdir()] = process.argv.slice(2);
if (!appDir || !feedDir) { console.error('usage: node test/update.mjs <unpacked app> <feed folder> [shots]'); process.exit(2); }
const served = [];
const feed = http.createServer(async (req, res) => {
  const file = path.join(feedDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  served.push(path.basename(file));
  try { const body = await fs.readFile(file); res.writeHead(200, { 'Content-Length': body.length }); res.end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => feed.listen(0, '127.0.0.1', r));
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-update-'));
const app = await electron.launch({
  executablePath: path.join(appDir, 'Larp.exe'),
  env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1', LARP_UPDATE_URL: `http://127.0.0.1:${feed.address().port}` },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.waitForFunction(() => Boolean(window.larp));
  const before = await page.evaluate(() => window.larp.updateStatus());
  console.log(`running ${before.version}; feed offers ${(await fs.readFile(path.join(feedDir, 'latest.yml'), 'utf8')).match(/version: (.*)/)[1]}`);
  await page.locator('.update-bar').waitFor({ timeout: 240_000 });
  const after = await page.evaluate(() => window.larp.updateStatus());
  await page.screenshot({ path: path.join(out, 'update-bar.png') });
  assert.ok(after.ready, 'an update is ready');
  assert.ok(served.some((f) => f.endsWith('.exe')), 'the installer was downloaded');
  console.log(`✓ found and downloaded ${after.ready} in the background; the "Restart to update" bar is showing`);
} finally {
  await app.close();
  feed.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
