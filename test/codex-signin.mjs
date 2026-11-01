// Codex sign-in from the Add agent form, in the real desktop app, with a stand-in Codex (test/fake-codex.cmd):
// "Sign in with ChatGPT" starts Codex's browser sign-in in the background (no terminal window), the form
// waits, notices by itself when the sign-in finishes, and Cancel stops a sign-in that isn't wanted.
//   npm run build && node test/codex-signin.mjs [screenshot folder]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-codex-signin');
await fs.mkdir(out, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-signin-'));
const fake = path.resolve('test/fake-codex.cmd');
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1', LARP_CODEX: fake } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  await page.evaluate(() => window.larp.createSpace({ spaceName: 'Build studio', kind: 'build', name: 'Divik', lan: false }));
  await page.reload();
  await page.locator('.sidebar .nav-item', { hasText: 'Agents' }).click();
  await page.locator('button', { hasText: 'Add agent' }).first().click();
  await page.locator('.runtime-card', { hasText: 'Codex' }).click();
  await page.locator('button', { hasText: "Larp's own Codex profile" }).click();
  const detail = page.locator('.codex-profile .runtime-detail');
  await detail.filter({ hasText: 'Not signed in yet' }).waitFor({ timeout: 15000 });

  // Cancel: a started sign-in can be stopped.
  await page.locator('button', { hasText: 'Sign in with ChatGPT' }).click();
  await detail.filter({ hasText: 'Waiting for you to sign in in your browser' }).waitFor({ timeout: 15000 });
  await page.locator('.codex-profile button', { hasText: 'Cancel' }).click();
  await page.locator('button', { hasText: 'Sign in with ChatGPT' }).waitFor({ timeout: 10000 });
  console.log('✓ a started sign-in can be cancelled');

  // Sign in: the form waits for the browser, then notices by itself.
  await page.locator('button', { hasText: 'Sign in with ChatGPT' }).click();
  await detail.filter({ hasText: 'Waiting for you to sign in in your browser' }).waitFor({ timeout: 15000 });
  const pending = await page.evaluate(() => window.larp.codexProfile({ action: 'status', own: true }));
  assert.equal(pending.pending, true);
  assert.match(pending.url, /^https:\/\/auth\.openai\.com\/oauth\/authorize/);
  await page.locator('button', { hasText: 'Open the sign-in page again' }).waitFor();
  await page.screenshot({ path: path.join(out, 'codex-signin-waiting.png') });
  console.log('✓ "Sign in with ChatGPT" started the browser sign-in in the background and kept its link');

  await fs.writeFile(path.join(pending.dir, 'auth.json'), '{}'); // the person finished signing in in the browser
  await detail.filter({ hasText: 'Logged in using ChatGPT' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(out, 'codex-signin-done.png') });
  const done = await page.evaluate(() => window.larp.codexProfile({ action: 'status', own: true }));
  assert.equal(done.signedIn, true);
  assert.equal(done.pending, false);
  console.log('✓ the form noticed the sign-in by itself: "Logged in using ChatGPT"');
  assert.deepEqual(errors, []);
  console.log('\nCodex sign-in checks passed.');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
