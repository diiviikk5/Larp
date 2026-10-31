// Screenshots of every main page in a theme (default Ocean), with a real task in the conversation view.
//   npm run build && node test/ocean-pages.mjs [outDir] [preset]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const out = process.argv[2] || path.join(os.tmpdir(), 'larp-pages');
const preset = process.argv[3] || 'Ocean';
await fs.mkdir(out, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-pages-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: data, LARP_NO_SPLASH: '1' } });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => Boolean(window.larp));
  const device = await page.evaluate(() => window.larp.createSpace({ spaceName: 'Build studio', kind: 'build', name: 'Divik', lan: false }));
  const api = (route, body) => page.evaluate(async ([d, route, body]) => {
    const r = await fetch(`${d.url}/api/${route}`, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + d.people[0].token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }, [device, route, body]);
  const spaceId = (await api('state')).spaces[0].id;
  const agent = await page.evaluate(([p, s]) => window.larp.addAgent({ personId: p.id, name: 'Sol', runtime: 'scripted', spaceIds: [s] }), [device.people[0], spaceId]);
  const task = await api('tasks', { spaceId, agentId: agent.id, title: 'Write a hello file', instructions: 'create file hello.txt with content "hello from Sol"' });
  await page.waitForTimeout(4000);
  await page.evaluate((p) => localStorage.setItem('larp.look', JSON.stringify({ preset: p })), preset);
  await page.reload();
  await page.waitForTimeout(2500);
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  const nav = async (label) => {
    if (await page.locator('.ocean-menu').isVisible().catch(() => false)) { await page.locator('.ocean-menu').click(); await page.waitForTimeout(400); }
    await page.locator('.sidebar .nav-item', { hasText: label }).first().click();
  };
  await shot('home');
  await nav('Tasks'); await shot('tasks');
  await page.locator('.content').getByText('Write a hello file').first().click(); await shot('task');
  await nav('Agents'); await shot('agents');
  await nav('Activity'); await shot('activity');
  await nav('Settings'); await shot('settings');
  console.log('task status:', (await api('state')).tasks.find((t) => t.id === task.id)?.status, '· errors:', errors.length ? errors : 'none');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
