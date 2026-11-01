// The "Larp's own Codex profile" option in the real desktop app: the Add agent form, the profile's
// sign-in status, and that an agent saved with it runs Codex from Larp's data folder.
//   npm run build && node test/codex-profile.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-codex-profile');
await fs.mkdir(out, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-codex-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  const device = await page.evaluate(() => window.larp.createSpace({ spaceName: 'Build studio', kind: 'team', name: 'Divik', lan: false }));
  await page.reload();
  await page.locator('.sidebar .nav-item', { hasText: 'Agents' }).click();
  await page.locator('button', { hasText: 'Add agent' }).first().click();
  await page.locator('.runtime-card', { hasText: 'Codex' }).click();
  await page.locator('button', { hasText: "Larp's own Codex profile" }).click();
  await page.locator('.codex-profile .runtime-detail').filter({ hasNotText: 'Checking' }).waitFor({ timeout: 15000 });
  const shown = await page.locator('.codex-profile .runtime-detail').textContent();
  console.log('profile status shown:', shown);
  await page.screenshot({ path: path.join(out, 'add-agent-codex.png'), fullPage: true });

  const status = await page.evaluate(() => window.larp.codexProfile({ action: 'status' }));
  assert.ok(status.dir.startsWith(data), 'the profile lives in Larp\'s data folder');
  const spaceId = await page.evaluate(async (d) => (await (await fetch(d.url + '/api/state', { headers: { Authorization: 'Bearer ' + d.people[0].token } })).json()).spaces[0].id, device);
  const agent = await page.evaluate(([p, s]) => window.larp.addAgent({ personId: p.id, name: 'Nova', runtime: 'codex', spaceIds: [s], codexProfile: true }), [device.people[0], spaceId]);
  const saved = (await page.evaluate(() => window.larp.config())).host.agents[agent.id];
  assert.equal(saved.codexHome, status.dir);
  await page.evaluate((id) => window.larp.updateAgent({ agentId: id, patch: { codexProfile: false } }), agent.id);
  assert.equal((await page.evaluate(() => window.larp.config())).host.agents[agent.id].codexHome, null);
  console.log('✓ agent saved with Larp\'s Codex profile, and switched back to the computer\'s login');
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
