// The family apps shipped inside Larp: a fresh desktop app starts Swasthya and Kosh by itself, connects
// them, and "Open in Larp" works for all three apps (Citylines, Swasthya, Kosh).
//   npm run build && node test/apps-builtin.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-apps');
await fs.mkdir(out, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-apps-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  await page.evaluate(() => window.larp.createSpace({ spaceName: 'Sharma home', kind: 'home', name: 'Divik', lan: false }));
  await page.reload();
  const apps = await (async () => {
    for (let i = 0; i < 40; i++) {
      const list = await page.evaluate(() => window.larp.appsList());
      if (list.every((a) => a.running && a.connected)) return list;
      await page.waitForTimeout(500);
    }
    return page.evaluate(() => window.larp.appsList());
  })();
  console.log(apps.map((a) => `${a.id}: running=${a.running} connected=${a.connected} ${a.url}`).join('\n'));
  assert.ok(apps.every((a) => a.running && a.connected), 'Swasthya and Kosh started inside Larp and connected');
  const kosh = await page.evaluate(() => window.larp.appsCall({ id: 'kosh', path: 'summary' }));
  const health = await page.evaluate(() => window.larp.appsCall({ id: 'swasthya', path: 'family' }));
  assert.ok(health.members.length > 0, 'Swasthya has its sample family');
  console.log(`✓ both started and connected; Swasthya family: ${health.members.map((m) => m.name).join(', ')}; Kosh summary keys: ${Object.keys(kosh).slice(0, 6).join(', ')}`);

  await page.locator('.sidebar .nav-item', { hasText: 'Apps' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'apps-tiles.png') });
  for (const name of ['Swasthya', 'Kosh', 'Citylines', 'EduSpace', 'Studio']) {
    await page.locator('.sidebar .nav-item', { hasText: 'Apps' }).click();
    await page.locator('.app-tile', { hasText: name }).locator('button', { hasText: 'Open in Larp' }).click();
    await page.locator('iframe.app-frame').waitFor({ timeout: 10000 });
    await page.waitForTimeout(3500);
    // The app's own interface must render inside the frame, not just an empty box.
    const frame = page.frameLocator('iframe.app-frame');
    const text = (await frame.locator('body').innerText({ timeout: 10000 })).replace(/\s+/g, ' ').trim();
    await page.screenshot({ path: path.join(out, `app-${name.toLowerCase()}.png`) });
    assert.ok(text.length > 80, `${name}'s full interface rendered (${text.length} characters)`);
    console.log(`✓ ${name}: full app inside Larp · "${text.slice(0, 70)}…"`);
  }
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
