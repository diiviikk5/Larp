import { _electron as electron, chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-workspace-ui-'));
const env = { ...process.env, LARP_DATA_DIR: root, LARP_CLOUD: 'off', MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_NO_SPLASH: '1', LARP_APPS_PORT_OFFSET: '130' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let browser;
try {
  await page.getByLabel('Your name', { exact: true }).fill('Local tester');
  await page.getByLabel('Space name', { exact: true }).fill('Agent workshop');
  await page.getByRole('button', { name: 'Create space', exact: true }).click();
  await page.getByRole('heading', { name: 'Workspace', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create agent', exact: true }).click();
  await page.getByRole('button', { name: 'Skills', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Skills', exact: true }).waitFor();
  await page.getByLabel('Search skills').fill('frontend-design');
  await page.locator('.skill-library-card').first().waitFor();
  assert.ok(await page.locator('.skill-library-card').count());
  // Install a real upstream skill, not an invented local fixture.
  await page.locator('.skill-library-card').first().getByRole('button', { name: 'Install', exact: true }).click();
  await page.locator('.skill-library-card').first().getByRole('button', { name: 'Assign', exact: true }).waitFor({ timeout: 120000 });
  await page.locator('.skill-library-card').first().getByRole('button', { name: 'Assign', exact: true }).click();
  await page.getByRole('button', { name: 'Assigned', exact: false }).waitFor();
  console.log('PASS: website catalog loads, real GitHub skill installs and assigns to agent');
  await page.getByRole('button', { name: 'Apps', exact: true }).first().click();
  await page.locator('.app-tile').filter({ hasText: 'Studio' }).getByRole('button', { name: 'Open in Larp' }).click();
  await page.waitForTimeout(3000);
  const snapshot = await page.evaluate(() => window.larp.appSnapshot({ id: 'studio', action: 'read' }));
  assert.ok(snapshot.data?.projects?.length, 'Studio should sync its actual embedded state');
  await page.evaluate(() => window.larp.appsCall({ id: 'studio', method: 'POST', path: 'records', body: { collection: 'projects', record: { name: 'Agent sync proof', status: 'In review', description: 'Local bridge test', people: [], createdAt: new Date().toISOString() } } }));
  await expect.poll(async () => page.frames().find((f) => f.url().includes('/studio/'))?.evaluate(() => localStorage.getItem('larp.studio.v1')), { timeout: 12000 }).toContain('Agent sync proof');
  await page.frames().find((f) => f.url().includes('/studio/')).evaluate(() => { location.hash = '#projects'; });
  await expect(page.frameLocator('iframe').locator('body')).toContainText('Agent sync proof');
  console.log('PASS: embedded Studio reads and writes synchronize with the host');
  for (const [id, name] of [['citylines', 'Citylines'], ['eduspace', 'EduSpace']]) {
    await page.getByRole('button', { name: 'Apps', exact: true }).first().click();
    await page.locator('.app-tile').filter({ hasText: name }).getByRole('button', { name: 'Open in Larp' }).click();
    await expect.poll(() => page.evaluate((id) => window.larp.appsCall({ id, path: 'state' }).then((s) => !!s.data), id), { timeout: 12000 }).toBe(true);
    console.log(`PASS: ${name} embedded data synchronized with agent-accessible records`);
  }
  await page.getByRole('button', { name: 'Workspace', exact: true }).first().click();
  await page.waitForTimeout(400);
  await fs.mkdir('work/screens', { recursive: true }); await page.screenshot({ path: 'work/screens/workspace-new.png' });
  const config = await page.evaluate(() => window.larp.config());
  const response = await fetch(config.url + '/api/pair', { method: 'POST', headers: { Authorization: 'Bearer ' + config.people[0].token, 'Content-Type': 'application/json' }, body: '{}' });
  const pair = await response.json();
  browser = await chromium.launch({ channel: 'msedge' }); const phone = await browser.newPage({ viewport: { width: 390, height: 844 } }); phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto(config.url); await phone.getByLabel('Pairing code').fill(pair.code); await phone.getByRole('button', { name: 'Pair this phone' }).click();
  await phone.getByRole('heading', { name: 'Workspace', exact: true }).waitFor(); await phone.getByLabel('Message your agents').fill('Phone chat is ready');
  await phone.screenshot({ path: 'work/screens/workspace-phone.png' });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'Phone should not overflow horizontally');
  assert.deepEqual(errors, []); console.log('PASS: paired phone reaches the same workspace, composer is usable, no renderer errors');
} finally { await browser?.close(); await app.close(); }
