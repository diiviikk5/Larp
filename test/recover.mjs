// Never stuck on "Can't reach the space", in the real desktop app:
//  1. A host whose space can't start (every port taken, as when the copy just updated still holds one)
//     keeps trying by itself and comes up once a port is free, with no restart.
//  2. A friend whose host went away sees the screen with a way out: Try again works once the host is
//     back, and "Join or start another space" goes to the start screen with the old space to go back to.
//   npm run build && node test/recover.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-recover');
await fs.mkdir(out, { recursive: true });
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-recover-'));
const launch = (who, offset) => electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: path.join(root, who), LARP_NO_SPLASH: '1', LARP_APPS_PORT_OFFSET: String(offset) } });
const open = async (app) => {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForFunction(() => Boolean(window.larp));
  return page;
};
const apps = [];
const blockers = [];
try {
  // ---- 1. the host's own space can't start, then can ----
  let host = await launch('host', 0); apps.push(host);
  let hp = await open(host);
  const device = await hp.evaluate(() => window.larp.createSpace({ spaceName: 'Sharma home', kind: 'home', name: 'Divik', lan: true }));
  const port = Number(new URL(device.url).port);
  await host.close(); apps.splice(apps.indexOf(host), 1);
  // Every port Larp would try now answers (something else holds them).
  for (let p = port; p <= 47831; p++) {
    const s = net.createServer((c) => c.end());
    await new Promise((r) => s.listen(p, '127.0.0.1', r).on('error', r));
    blockers.push(s);
  }
  for (let p = 47821; p < port; p++) {
    const s = net.createServer((c) => c.end());
    await new Promise((r) => s.listen(p, '127.0.0.1', r).on('error', r));
    blockers.push(s);
  }
  host = await launch('host', 0); apps.push(host);
  hp = await open(host);
  await hp.locator('text=Can\'t reach the space').waitFor({ timeout: 20000 });
  await hp.locator('button', { hasText: 'Try again' }).waitFor();
  await hp.screenshot({ path: path.join(out, 'host-cant-start.png') });
  console.log('✓ the host shows "Can\'t reach the space" with Try again while its space can\'t start');
  for (const s of blockers.splice(0)) await new Promise((r) => s.close(r));
  await hp.locator('.sidebar').waitFor({ timeout: 30000 });
  console.log('✓ once a port was free, the space came up by itself and the app opened (no restart)');
  const log = await fs.readFile(path.join(root, 'host', 'larp', 'larp.log'), 'utf8');
  assert.match(log, /could not start this space/);
  console.log('✓ larp.log recorded why it couldn\'t start at first');

  // ---- 2. a friend whose host goes away ----
  await hp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await hp.locator('button', { hasText: 'Create invite code' }).click();
  const message = await hp.locator('.invite-message').textContent();
  const friend = await launch('friend', 100); apps.push(friend);
  const fp = await open(friend);
  await fp.locator('button', { hasText: 'Join a space' }).first().click();
  await fp.locator('#your-name').fill('Arjun');
  await fp.locator('#invite-link').fill(message);
  await fp.locator('button', { hasText: 'Join space' }).click();
  await fp.locator('.sidebar').waitFor({ timeout: 20000 });

  await host.close(); apps.splice(apps.indexOf(host), 1);
  await fp.reload();
  await fp.locator('text=Can\'t reach the space').waitFor({ timeout: 30000 });
  await fp.screenshot({ path: path.join(out, 'friend-host-gone.png') });
  console.log('✓ the friend sees "Can\'t reach the space" with a way out when the host is gone');

  host = await launch('host', 0); apps.push(host);
  await open(host);
  // The friend's app keeps asking by itself; Try again only makes it ask now.
  await fp.locator('button', { hasText: 'Try again' }).click({ timeout: 3000 }).catch(() => {});
  await fp.locator('.sidebar').waitFor({ timeout: 30000 });
  console.log('✓ the host came back and the friend reconnected (by itself, or with Try again)');

  await host.close(); apps.splice(apps.indexOf(host), 1);
  await fp.reload();
  await fp.locator('button', { hasText: 'Join or start another space' }).click({ timeout: 30000 });
  await fp.locator('button', { hasText: /^Back to / }).waitFor({ timeout: 10000 });
  await fp.screenshot({ path: path.join(out, 'friend-start-screen.png') });
  const cfg = await fp.evaluate(() => window.larp.config());
  assert.equal(cfg.mode, null);
  assert.equal(cfg.others.length, 1);
  console.log('✓ "Join or start another space" opened the start screen, with the old space to go back to');
  console.log('\nRecovery checks passed.');
} finally {
  for (const s of blockers) s.close();
  for (const a of apps) await a.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
