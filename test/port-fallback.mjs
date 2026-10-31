// With port 47821 already taken, creating a space should host on the next free port.
import { _electron as electron } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const blocker = http.createServer((_, res) => res.end('busy'));
await new Promise((r) => blocker.listen(47821, '127.0.0.1', r));
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-port-'));
const env = { ...process.env, LARP_DATA_DIR: dir, LARP_NO_SPLASH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
app.process().stdout?.on('data', (d) => process.stdout.write('[main] ' + d));
app.process().stderr?.on('data', (d) => process.stdout.write('[main] ' + d));
try {
  const page = await app.firstWindow();
  await page.getByLabel('Your name').fill('Port');
  await page.getByRole('button', { name: 'Create space' }).click();
  await page.locator('.space-text strong, .error-text').first().waitFor();
  const err = await page.locator('.error-text').allInnerTexts();
  if (err.length) throw new Error('onboarding error: ' + err.join(' / '));
  const url = await page.evaluate(() => window.larp.config().then((c) => c.url));
  if (!/:4782[2-9]|:4783/.test(url)) throw new Error('expected a fallback port, got ' + url);
  console.log(`✓ port 47821 was busy; the space came up on ${url}`);
} finally {
  await app.close();
  blocker.close();
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
