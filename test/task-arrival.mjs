// Exercise the new-task navigation race: POST succeeds before GET state includes it.
import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-task-arrival-'));
const env = { ...process.env, LARP_DATA_DIR: dir, LARP_PORT: '49121', LARP_APPS_PORT_OFFSET: '390', LARP_CLOUD: 'off', MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_NO_SPLASH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
 const page = await app.firstWindow(); const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.getByLabel('Your name', { exact: true }).fill('Race tester');
 await page.getByLabel('Space name', { exact: true }).fill('Task arrival');
 await page.getByRole('button', { name: 'Create space', exact: true }).click();
 await page.getByRole('heading', { name: 'Workspace', exact: true }).waitFor();
 await page.evaluate(async () => {
   const config = await window.larp.config(); const me = config.people.find(p => p.id === config.activePersonId);
   const state = await fetch(config.url + '/api/state', { headers: { Authorization: 'Bearer ' + me.token } }).then(r => r.json());
   await window.larp.addAgent({ personId: me.id, name: 'Tester', runtime: 'scripted', spaceIds: [state.spaces[0].id] });
 });
 await expect(page.getByLabel('Lead agent')).toContainText('Tester');
 let hideTasks = true;
 await page.route('**/api/state', async route => {
   const response = await route.fetch(); const state = await response.json();
   if (hideTasks) state.tasks = [];
   await route.fulfill({ response, json: state });
 });
 await page.keyboard.press('Control+n');
 await page.getByLabel('Instructions', { exact: true }).fill('New task must arrive without a renderer crash');
 await page.getByRole('button', { name: 'Create task', exact: true }).click();
 await expect(page.getByText('Loading task…', { exact: true })).toBeVisible();
 await expect(page.getByRole('dialog', { name: 'New task' })).toHaveCount(0);
 await expect(page.getByText('Task not found', { exact: true })).toHaveCount(0);
 hideTasks = false;
 await expect(page.locator('.detail-title h1')).toHaveText('New task must arrive without a renderer crash', { timeout: 15000 });
 await expect(page.getByText('Something went wrong on this screen', { exact: true })).toHaveCount(0);
 assert.deepEqual(errors, []);
 console.log('PASS new-task sheet closes, delayed task shows loading, then detail renders without React hook errors or a blank screen');
} finally { await app.close(); }
