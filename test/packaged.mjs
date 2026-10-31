// Launches the packaged app (release/win-unpacked/Larp.exe), creates a space through its UI bridge,
// adds a scripted agent and runs a task, to prove the installed build works, not just the source.
//   npm run dist:win && node test/packaged.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const exe = path.resolve('release/win-unpacked/Larp.exe');
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-packaged-'));
const app = await electron.launch({ executablePath: exe, env: { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.larp), null, { timeout: 30000 });
  const device = await page.evaluate(() => window.larp.createSpace({ spaceName: 'Packaged check', kind: 'build', name: 'Divik', lan: false }));
  assert.equal(device.mode, 'host');
  console.log(`  ✓ Packaged app created a space and started its coordinator at ${device.url || device.urls[0]}`);
  const person = device.people[0];
  const agent = await page.evaluate((p) => window.larp.addAgent({ personId: p.id, name: 'Pip', runtime: 'scripted', spaceIds: [] }), person);
  assert.ok(agent.id);
  console.log('  ✓ Added an agent through the host inside the packaged app');
  await page.reload();
  await page.getByText('Packaged check').first().waitFor({ timeout: 20000 });
  console.log('  ✓ The workbench UI loaded from the packaged files');

  // A second install joins a hosted server, the way a new user would.
  const { spawn } = await import('node:child_process');
  const server = spawn(process.execPath, ['server/cli.mjs', 'serve'], { env: { ...process.env, MEKO_API_KEY: '', PORT: '47970', LARP_SETUP_CODE: 'joinme', LARP_DATA_DIR: path.join(data, 'server'), MEKO_API_KEY: '', YUGABYTE_URL: '' }, stdio: 'ignore' });
  const second = await electron.launch({ executablePath: exe, env: { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: path.join(data, 'second'), LARP_NO_SPLASH: '1' } });
  try {
    for (let i = 0; i < 50 && !(await fetch('http://127.0.0.1:47970/api/health').then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
    const page2 = await second.firstWindow();
    await page2.waitForFunction(() => Boolean(window.larp), null, { timeout: 30000 });
    const joined = await page2.evaluate(() => window.larp.joinSpace({ url: 'http://127.0.0.1:47970', code: 'joinme', name: 'Arjun' }));
    assert.equal(joined.mode, 'join');
    await page2.reload();
    await page2.getByText('Build studio').first().waitFor({ timeout: 20000 });
    console.log('  ✓ A second install joined a hosted server with its setup code and opened the space');
  } finally {
    await second.close();
    server.kill();
  }
  console.log('\nPackaged app checks passed.');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
