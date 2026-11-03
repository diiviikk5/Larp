// Joining with one paste, in the real desktop app: the host creates an invite on the People page and
// copies the ready-made message; a second install pastes that whole message into "Join a space".
//   npm run build && node test/invite-link.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-invite');
await fs.mkdir(out, { recursive: true });
const dirs = [await fs.mkdtemp(path.join(os.tmpdir(), 'larp-host-')), await fs.mkdtemp(path.join(os.tmpdir(), 'larp-friend-'))];
const launch = (data) => electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
const apps = [];
try {
  // Host: a space open to the network, then an invite from the People page.
  const host = await launch(dirs[0]); apps.push(host);
  const hp = await host.firstWindow();
  await hp.setViewportSize({ width: 1280, height: 900 });
  await hp.waitForFunction(() => Boolean(window.larp));
  await hp.evaluate(() => window.larp.createSpace({ spaceName: 'Build studio', kind: 'build', name: 'Divik', lan: true }));
  await hp.reload();
  await hp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await hp.locator('button', { hasText: 'Create invite code' }).click();
  const message = await hp.locator('.invite-message').textContent();
  await hp.screenshot({ path: path.join(out, 'host-invite.png'), fullPage: true });
  assert.match(message, /larp:\/\/join\?at=http/);
  assert.match(message, /larp-seven\.vercel\.app/);
  console.log('✓ host got a ready-to-send message:\n' + message.split('\n').map((l) => '    ' + l).join('\n'));

  // Friend: a second install pastes the whole message.
  const friend = await launch(dirs[1]); apps.push(friend);
  const fp = await friend.firstWindow();
  if (process.platform === 'darwin') {
    // Native macOS shortcuts are dispatched through application menu roles.
    // Playwright's fill/keyboard events alone can succeed without this menu.
    const editRoles = await friend.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items.flatMap((item) => item.submenu?.items.map((entry) => entry.role) || []) || []);
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      assert.ok(editRoles.some((entry) => entry?.toLowerCase() === role.toLowerCase()), `macOS Edit menu provides ${role}`);
    }
  }
  await fp.setViewportSize({ width: 1280, height: 900 });
  await fp.locator('button', { hasText: 'Join a space' }).first().click();
  await fp.locator('#your-name').fill('Arjun');
  await fp.locator('#invite-link').fill(message);
  const filledUrl = await fp.locator('#host-url').inputValue();
  const filledCode = await fp.locator('#invite').inputValue();
  assert.ok(filledUrl.startsWith('http') && filledCode.length >= 6, 'address and code filled in from the pasted message');
  await fp.screenshot({ path: path.join(out, 'friend-join.png'), fullPage: true });
  await fp.locator('button', { hasText: 'Join space' }).click();
  await fp.locator('.sidebar').waitFor({ timeout: 20000 });
  const joined = await fp.evaluate(() => window.larp.config());
  assert.equal(joined.mode, 'join');
  console.log(`✓ friend pasted the message, the form filled ${filledUrl} and the code, and Arjun joined`);
} finally {
  for (const app of apps) await app.close().catch(() => {});
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
}
