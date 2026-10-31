// Picking Ocean in Settings must bring the sea in immediately, without a restart.
//   npm run build && node test/ocean-switch.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-switch-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.larp));
  await page.evaluate(() => window.larp.createSpace({ spaceName: 'Home', kind: 'home', name: 'Divik', lan: false }));
  await page.reload();
  await page.locator('.nav-item', { hasText: 'Settings' }).click();
  await page.locator('button', { hasText: 'Appearance' }).first().click();
  await page.locator('.theme-tile', { hasText: 'Ocean' }).click();
  await page.locator('.ocean-canvas').waitFor({ timeout: 5000 });
  // The sea is drawing: count non-transparent pixels on the canvas after a moment.
  await page.waitForTimeout(1500);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('.ocean-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
    return n;
  });
  assert.ok(painted > 2000, `creatures should be drawn (opaque pixels: ${painted})`);
  console.log(`✓ Switching to Ocean in Settings mounts the sea right away (${painted} opaque pixels of creatures)`);
  await page.locator('.ocean-menu').click();
  await page.locator('.sidebar .nav-item', { hasText: 'Overview' }).click();
  await page.locator('.ocean-title').waitFor({ timeout: 5000 });
  console.log('✓ Home shows "what\'s on your mind?"');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
