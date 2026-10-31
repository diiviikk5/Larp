// Visual check of Ocean mode and the connected-apps pages in the real desktop app.
//   npm run build && node test/ocean-apps.mjs   (Swasthya and Kosh running locally for the apps part)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-ocean');
await fs.mkdir(out, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-ocean-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  const device = await page.evaluate(() => window.larp.createSpace({ spaceName: 'Sharma home', kind: 'home', name: 'Divik', lan: false }));
  const spaceId = await page.evaluate(async (d) => (await (await fetch(d.url + '/api/state', { headers: { Authorization: 'Bearer ' + d.people[0].token } })).json()).spaces[0].id, device);
  await page.evaluate(([p, s]) => window.larp.addAgent({ personId: p.id, name: 'Sol', runtime: 'scripted', spaceIds: [s] }), [device.people[0], spaceId]);
  await page.evaluate(() => localStorage.setItem('larp.look', JSON.stringify({ preset: 'Ocean' })));
  await page.reload();
  await page.locator('.ocean-title').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, 'ocean-home-1.png') });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(out, 'ocean-home-2.png') });
  await page.locator('.ocean-box textarea').fill('Plan Saturday lunch for the family');
  await page.screenshot({ path: path.join(out, 'ocean-typing.png') });
  console.log('send enabled after typing:', await page.locator('.ocean-send').isEnabled());
  await page.locator('.ocean-menu').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, 'ocean-drawer.png') });
  await page.locator('.sidebar .nav-item', { hasText: 'Apps' }).click();
  await page.waitForTimeout(2500);
  const apps = await page.evaluate(() => window.larp.appsList());
  console.log('apps:', apps.map((a) => `${a.id} running=${a.running} connected=${a.connected}`).join(' | '));
  for (const a of apps.filter((x) => x.running)) await page.evaluate((id) => window.larp.appsConnect({ id }), a.id);
  await page.waitForTimeout(6500);
  await page.screenshot({ path: path.join(out, 'apps.png') });
  for (const a of apps.filter((x) => x.running)) {
    await page.locator('.app-tile', { hasText: a.name }).locator('button', { hasText: 'Open in Larp' }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, `app-${a.id}.png`), fullPage: true });
    await page.locator('.app-view .back').click();
    await page.waitForTimeout(1200);
  }
  // The same apps in the regular dark theme.
  await page.evaluate(() => localStorage.setItem('larp.look', JSON.stringify({ preset: 'Ink' })));
  await page.reload();
  await page.waitForTimeout(2500);
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
