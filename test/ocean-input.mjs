// Regression: Ocean uses the regular controls, accepts drafts without an agent,
// preserves them across navigation/themes, and submits through the real task API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-ocean-input-'));
const env = { ...process.env, LARP_DATA_DIR: data, LARP_CLOUD: 'off', MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_NO_SPLASH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', '--ozone-platform=headless'], env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1264, height: 674 });
  await page.waitForFunction(() => Boolean(window.larp));
  const device = await page.evaluate(() => window.larp.createSpace({ spaceName: 'Ocean input check', kind: 'build', name: 'Tester', lan: false }));
  const state = () => page.evaluate(async d => (await fetch(`${d.url}/api/state`, { headers: { Authorization: `Bearer ${d.people[0].token}` } })).json(), device);
  const spaceId = (await state()).spaces[0].id;
  const nav = label => page.locator('.sidebar .nav-item').filter({ hasText: new RegExp(`^${label}$`) }).click();
  const theme = async preset => {
    await page.evaluate(preset => localStorage.setItem('larp.look', JSON.stringify({ preset })), preset);
    await page.reload();
    await page.locator('.sidebar').waitFor();
    await nav('Overview');
  };
  await theme('Ocean');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.ocean-home')).toHaveCount(0);
  // Cross-check geometry, clipping, and pointer access at real laptop sizes.
  for (const preset of ['Ocean', 'Ink']) {
    await theme(preset);
    for (const [width, height] of [[1264, 674], [960, 620], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.chat-scroll').evaluate(e => { e.scrollTop = e.scrollHeight; });
      const geometry = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        };
        const button = document.querySelector('.setup-list li:last-child button');
        const r = button.getBoundingClientRect();
        const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { scroll: rect('.chat-scroll'), quick: rect('.quick'), button: rect('.setup-list li:last-child button'), reachable: button.contains(target), horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(geometry.quick.top >= geometry.scroll.bottom - 1, `${preset} ${width}: composer overlaps scroll area`);
      assert.ok(geometry.button.bottom <= geometry.scroll.bottom + 1, `${preset} ${width}: last setup action clipped`);
      assert.ok(geometry.reachable, `${preset} ${width}: setup action cannot be clicked`);
      assert.ok(!geometry.horizontalOverflow, `${preset} ${width}: horizontal overflow`);
      await page.locator('.chat-scroll').evaluate(e => { e.scrollTop = 0; });
      if (preset === 'Ocean') {
        const fits = await page.evaluate(() => document.querySelector('.feed').getBoundingClientRect().bottom <= document.querySelector('.chat-scroll').getBoundingClientRect().bottom + 1);
        assert.ok(fits, `Ocean ${width}: setup panel should fit above composer at default text size`);
      }
      await page.screenshot({ path: `/tmp/larp-${preset.toLowerCase()}-overview-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1264, height: 674 });
  await theme('Ocean');
  const input = page.getByRole('textbox', { name: 'Describe a task', exact: true });
  await expect(input).toBeEditable();
  const draft = 'create file ocean-proof.txt with content "Ocean input works"';
  await input.click();
  await page.keyboard.type(draft);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Keep the ASCII background.');
  const text = `${draft}\nKeep the ASCII background.`;
  await expect(input).toHaveValue(text);
  await expect(page.locator('.quick .btn-primary').last()).toBeDisabled();
  await page.keyboard.press('Control+Enter');
  assert.equal((await state()).tasks.length, 0, 'no task submitted without an agent');
  await page.locator('.quick').getByRole('button', { name: 'Add agent', exact: true }).click();
  await nav('Overview');
  await expect(input).toHaveValue(text);
  await theme('Ink');
  await expect(input).toHaveValue(text);
  await theme('Ocean');
  await expect(input).toHaveValue(text);
  const before = await page.locator('.ocean-canvas').evaluate(c => c.toDataURL());
  await page.waitForTimeout(180);
  assert.notEqual(await page.locator('.ocean-canvas').evaluate(c => c.toDataURL()), before, 'ASCII sea still animates');
  const repoPath = path.join(data, 'fixture');
  await fs.mkdir(repoPath);
  await fs.writeFile(path.join(repoPath, 'README.md'), 'Ocean regression fixture\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath });
  execFileSync('git', ['add', 'README.md'], { cwd: repoPath });
  execFileSync('git', ['-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Initial fixture'], { cwd: repoPath });
  await page.evaluate(([personId, spaceId, repoPath]) => window.larp.addAgent({ personId, spaceIds: [spaceId], name: 'Ocean tester', runtime: 'scripted', repoPath }), [device.people[0].id, spaceId, repoPath]);
  await expect(page.locator('.quick .chip').first()).toContainText('Ocean tester');
  await expect(page.locator('.quick .btn-primary').last()).toBeEnabled();
  await input.press('Control+Enter');
  await expect.poll(async () => (await state()).tasks[0]?.status, { timeout: 20000 }).toBe('needs_review');
  const task = (await state()).tasks[0];
  assert.equal(task.instructions, text);
  assert.equal(await fs.readFile(path.join(data, 'larp', 'host', 'worktrees', task.id, 'ocean-proof.txt'), 'utf8'), 'Ocean input works');
  await nav('Overview');
  await page.screenshot({ path: '/tmp/larp-ocean-fixed.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: Ocean typing, multiline input, no-agent guard, draft retention, theme parity, animation, task execution; no renderer errors.');
} finally {
  await app.close();
  await fs.rm(data, { recursive: true, force: true });
}
