// Joining another space from inside the app: two installs each start their own space; the friend opens
// the space menu, chooses "Join another space", pastes the host's invite, works there, and switches
// back to their own space from the same menu.
//   npm run build && node test/join-another.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-join-another');
await fs.mkdir(out, { recursive: true });
const dirs = [await fs.mkdtemp(path.join(os.tmpdir(), 'larp-host-')), await fs.mkdtemp(path.join(os.tmpdir(), 'larp-friend-'))];
const launch = (data, offset) => electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1', LARP_APPS_PORT_OFFSET: String(offset) } });
const apps = [];
const open = async (app) => {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  return page;
};
const spaceName = (page) => page.locator('.sidebar .space-btn strong').first().textContent();
try {
  const host = await launch(dirs[0], 0); apps.push(host);
  const hp = await open(host);
  await hp.evaluate(() => window.larp.createSpace({ spaceName: 'Sharma home', kind: 'home', name: 'Divik', lan: true }));
  await hp.reload();
  await hp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await hp.locator('button', { hasText: 'Create invite code' }).click();
  const message = await hp.locator('.invite-message').textContent();

  const friend = await launch(dirs[1], 100); apps.push(friend);
  const fp = await open(friend);
  await fp.evaluate(() => window.larp.createSpace({ spaceName: 'Mehta home', kind: 'home', name: 'Arjun', lan: false }));
  await fp.reload();
  await fp.locator('.sidebar').waitFor();
  assert.equal(await spaceName(fp), 'Mehta home');
  console.log('✓ the friend is in their own space first (Mehta home)');

  // Inside the app: space menu → Join another space → paste the whole message.
  await fp.locator('.sidebar .space-btn').click();
  await fp.locator('.dropdown-item', { hasText: 'Join another space' }).click();
  await fp.locator('.dropdown-form textarea').fill(message);
  await fp.screenshot({ path: path.join(out, 'join-another.png') });
  await fp.locator('.dropdown-form button', { hasText: 'Join space' }).click();
  await fp.locator('.confirm button', { hasText: 'Continue' }).click().catch(() => {}); // only when hosting
  await fp.waitForFunction(() => document.querySelector('.sidebar .space-btn strong')?.textContent === 'Sharma home', null, { timeout: 30000 });
  const joined = await fp.evaluate(() => window.larp.config());
  assert.equal(joined.mode, 'join');
  assert.equal(joined.others.length, 1);
  assert.match(joined.others[0].label, /Mehta home/);
  console.log(`✓ from the space menu, Arjun joined Sharma home (${joined.url}); Mehta home is saved to come back to`);

  // The host sees Arjun as a member.
  await hp.reload();
  await hp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await hp.locator('text=Arjun').first().waitFor({ timeout: 15000 });
  console.log('✓ the host sees Arjun in Sharma home');

  // Back to their own space from the same menu.
  await fp.locator('.sidebar .space-btn').click();
  await fp.screenshot({ path: path.join(out, 'switch-back-menu.png') });
  await fp.locator('.dropdown-item', { hasText: 'Mehta home' }).click();
  await fp.waitForFunction(() => document.querySelector('.sidebar .space-btn strong')?.textContent === 'Mehta home', null, { timeout: 30000 });
  const back = await fp.evaluate(() => window.larp.config());
  assert.equal(back.mode, 'host');
  assert.match(back.others[0].label, /Sharma home/);
  console.log('✓ Arjun switched back to Mehta home (hosted on his computer again); Sharma home is listed to switch to');

  // And over to the host's space again, without a new invite.
  await fp.locator('.sidebar .space-btn').click();
  await fp.locator('.dropdown-item', { hasText: 'Sharma home' }).click();
  await fp.locator('.confirm button', { hasText: 'Continue' }).click();
  await fp.waitForFunction(() => document.querySelector('.sidebar .space-btn strong')?.textContent === 'Sharma home', null, { timeout: 30000 });
  console.log('✓ and back to Sharma home with no new invite (after confirming his own space pauses)');
  await fp.screenshot({ path: path.join(out, 'back-in-sharma.png') });
  console.log('\nJoin-another checks passed.');
} finally {
  for (const app of apps) await app.close().catch(() => {});
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
}
