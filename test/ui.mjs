// Drives two real Larp desktop instances (two "laptops") and a phone browser through every page.
// Screenshots go to work/screens.
//   node test/ui.mjs
import { _electron as electron, chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git } from '../server/adapters/process.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-ui-'));
const shots = path.resolve('work/screens');
await fs.mkdir(shots, { recursive: true });
for (const f of await fs.readdir(shots)) if (!f.startsWith('splash')) await fs.rm(path.join(shots, f));
// Pages fade in over 160ms; let that finish so screenshots show the settled state.
// A covered window pauses CSS transitions, so bring it forward and let the 160ms fade finish.
const shot = async (page, name) => { await page.bringToFront().catch(() => {}); await page.waitForTimeout(320); await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
const log = (s) => console.log('  ✓ ' + s);
const errors = [];

async function launch(name) {
  const env = { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: path.join(root, name), LARP_NO_SPLASH: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { app, page };
}

// A small repo with a failing test, cloned to both "laptops".
const origin = path.join(root, 'origin', 'demo-app');
await fs.mkdir(origin, { recursive: true });
await fs.writeFile(path.join(origin, 'math.js'), 'export function add(a, b) {\n  return a - b;\n}\n\nexport function double(n) {\n  return n * 2;\n}\n');
await fs.writeFile(path.join(origin, 'test.mjs'), "import { add } from './math.js';\nif (add(2, 3) !== 5) { console.error('add(2,3) should be 5, got', add(2, 3)); process.exit(1); }\nconsole.log('all tests passed');\n");
await fs.writeFile(path.join(origin, 'package.json'), '{"type":"module"}\n');
await git(origin, ['init', '-q', '-b', 'main']);
await git(origin, ['add', '-A']);
await git(origin, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
const repoA = path.join(root, 'a-repo', 'demo-app');
const repoB = path.join(root, 'b-repo', 'demo-app');
for (const dir of [repoA, repoB]) { await fs.mkdir(path.dirname(dir), { recursive: true }); await git(root, ['clone', '-q', origin, dir]); }

// The native folder picker can't be automated, so agents are added through the same bridge the form uses.
const addAgent = (page, fields) => page.evaluate(async (fields) => {
  const c = await window.larp.config();
  return window.larp.addAgent({ personId: c.activePersonId, runtime: 'scripted', spaceIds: [localStorage.getItem('larp.space')], ...fields });
}, fields);
const nav = (page, label) => page.locator('.sidebar .nav-item', { hasText: label }).first().click();

const apps = [];
let browser;
try {
  console.log('▶ Laptop A: Divik starts a Build space');
  const A = await launch('laptop-a'); apps.push(A.app);
  await A.page.getByRole('button', { name: 'Create space' }).waitFor();
  await shot(A.page, '01-onboarding');
  await A.page.getByLabel('Your name').fill('Divik');
  await A.page.getByRole('button', { name: 'Create space' }).click();
  await A.page.locator('.space-text strong', { hasText: 'Build studio' }).waitFor();
  await A.page.evaluate(() => localStorage.setItem('larp.look', JSON.stringify({ preset: 'Ink' })));
  await A.page.reload();
  await A.page.locator('.hello').waitFor();
  await shot(A.page, '02-overview-empty');
  await addAgent(A.page, { name: 'Atlas', repoPath: repoA });
  await A.page.reload();
  await nav(A.page, 'Agents');
  await A.page.locator('.agent-card', { hasText: 'Atlas' }).waitFor();
  log('Space created; Atlas added');

  await nav(A.page, 'People');
  await A.page.getByRole('button', { name: 'Create invite code' }).click();
  const code = (await A.page.locator('.copy-value.large code').innerText()).trim();
  await shot(A.page, '03-people-invite');
  log(`Invite code ${code}`);

  console.log('▶ Laptop B: Arjun joins');
  const B = await launch('laptop-b'); apps.push(B.app);
  await B.page.getByRole('button', { name: 'Join a space' }).click();
  await B.page.getByLabel('Your name').fill('Arjun');
  await B.page.getByLabel('Host address').fill('http://127.0.0.1:47821');
  await B.page.getByLabel('Invite code').fill(code);
  await B.page.getByRole('button', { name: 'Join space' }).click();
  await B.page.locator('.space-text strong', { hasText: 'Build studio' }).waitFor();
  await addAgent(B.page, { name: 'Byte', repoPath: repoB });
  log('Arjun joined from a second app instance and added Byte');

  console.log('▶ Divik delegates to Arjun’s agent');
  await A.page.getByRole('button', { name: /New task/ }).first().click();
  await A.page.getByRole('radio', { name: /Byte/ }).click();
  const chosen = await A.page.locator('.agent-option.selected').allInnerTexts();
  if (chosen.length !== 1 || !chosen[0].includes('Byte')) throw new Error('Expected only Byte to be selected, got: ' + JSON.stringify(chosen));
  await A.page.getByLabel('Title').fill('Fix add()');
  await A.page.getByLabel('Instructions').fill('replace "return a - b" with "return a * b" in math.js');
  await A.page.getByLabel('Check command').fill('node test.mjs');
  await shot(A.page, '04-new-task-sheet');
  await A.page.getByRole('button', { name: 'Send to Arjun' }).click();
  await A.page.getByText(/Waiting for Arjun to approve/).waitFor();
  await shot(A.page, '05-task-waiting');
  log('Task waits for Arjun’s approval');

  await B.page.getByRole('button', { name: /approvals waiting/ }).click();
  await shot(B.page, '06-arjun-inbox');
  await B.page.locator('.inbox-panel').getByRole('button', { name: 'Approve' }).click();
  log('Arjun approved from his inbox');

  await A.page.getByText(/Check failed on Arjun's machine/).waitFor({ timeout: 20000 });
  await shot(A.page, '07-task-check-failed');
  await A.page.getByRole('tab', { name: /Changes/ }).click();
  await A.page.locator('.diff-table').waitFor();
  await shot(A.page, '08-task-changes');
  await A.page.getByRole('tab', { name: /Check/ }).click();
  await shot(A.page, '09-task-check');
  await A.page.getByRole('tab', { name: /Conversation/ }).click();
  log('First attempt: diff and failed check shown');

  await A.page.getByLabel('Request changes').fill('replace "return a * b" with "return a + b" in math.js');
  await A.page.getByRole('button', { name: 'Send revision' }).click();
  await A.page.getByText(/Check passed on Arjun's machine/).waitFor({ timeout: 20000 });
  await shot(A.page, '10-task-verified');
  await A.page.getByRole('button', { name: /Accept & apply/ }).click();
  await A.page.getByText(/Applied on your machine/).first().waitFor({ timeout: 20000 });
  await shot(A.page, '11-task-applied');
  const applied = await git(repoA, ['branch', '--list', 'larp/accepted-*']);
  if (!applied.trim()) throw new Error('No accepted branch in Divik’s repo');
  log(`Revision passed; applied on Divik’s laptop as ${applied.trim()}`);

  console.log('▶ Divik starts a task for his own agent from the Overview composer');
  await nav(A.page, 'Overview');
  await A.page.locator('.quick .chip').first().click();
  await A.page.getByRole('option', { name: /Atlas/ }).click();
  await A.page.getByLabel('Describe a task').fill('Document double()\nreplace "export function double" with "/** Twice n. */\\nexport function double" in math.js');
  await shot(A.page, '12a-quick-compose');
  await A.page.locator('.quick').getByRole('button', { name: /^Start/ }).click();
  await A.page.getByText(/Check (passed|failed) on Divik's machine/).waitFor({ timeout: 20000 });
  await shot(A.page, '12b-own-task');
  if (!(await A.page.locator('.thread', { hasText: 'Document double()' }).count())) throw new Error('Task missing from sidebar threads');
  log('Own task ran straight away (no approval) and shows in the sidebar threads');

  await nav(A.page, 'Tasks');
  await A.page.locator('.table tr', { hasText: 'Fix add()' }).waitFor();
  await shot(A.page, '12-tasks');
  await nav(A.page, 'Overview');
  await shot(A.page, '13-overview');
  await nav(A.page, 'Activity');
  await shot(A.page, '14-activity');
  await A.page.keyboard.press('Control+k');
  await A.page.getByLabel('Search', { exact: true }).fill('fix');
  await shot(A.page, '15-command-palette');
  await A.page.keyboard.press('Escape');
  log('Tasks, Overview, Activity, and the command palette render');

  console.log('▶ Phone');
  await nav(A.page, 'Settings');
  await A.page.locator('.settings-nav .nav-item', { hasText: 'Phones' }).click();
  await A.page.getByRole('button', { name: 'Pair a new phone' }).click();
  const pair = (await A.page.locator('.copy-value.large code').innerText()).trim();
  await shot(A.page, '16-settings-phones');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await phone.goto('http://127.0.0.1:47821/');
  await shot(phone, '17-phone-pair');
  await phone.getByLabel('Pairing code').fill(pair);
  await phone.getByRole('button', { name: 'Pair this phone' }).click();
  await phone.locator('.hello h1').waitFor();
  await shot(phone, '18-phone-overview');
  await phone.locator('.tabbar .tab', { hasText: 'Tasks' }).click();
  await phone.locator('.table tr', { hasText: 'Fix add()' }).click();
  await phone.getByText(/Applied on your machine/).first().waitFor();
  await shot(phone, '19-phone-task');
  log('Phone paired and follows the task');

  console.log('▶ Home space');
  await A.page.locator('.sidebar .space-btn').click();
  await A.page.getByRole('menuitem', { name: 'New space' }).click();
  await A.page.getByPlaceholder('Space name').fill('Home circle');
  await A.page.getByRole('button', { name: 'Create space' }).click();
  await A.page.locator('.space-text strong', { hasText: 'Home circle' }).waitFor();
  const pip = await addAgent(A.page, { name: 'Pip' });
  await A.page.evaluate((id) => window.larp.updateAgent({ agentId: id, patch: { private: { calendar: [{ day: 'Sat', title: 'Dentist', from: '10:00', to: '12:30' }], budget: 2500 }, sharing: { availability: 'ask', budget: 'auto' } } }), pip.id);
  await A.page.reload();
  await nav(A.page, 'Plans');
  await A.page.getByLabel('What are you planning?').fill('Saturday lunch');
  await A.page.getByRole('button', { name: 'Ask everyone' }).click();
  await phone.reload();
  await phone.getByRole('button', { name: /approvals waiting/ }).click();
  await phone.locator('.inbox-panel').getByText(/Share with your circle/).waitFor({ timeout: 15000 });
  await shot(phone, '20-phone-share-request');
  await phone.locator('.inbox-panel').getByRole('button', { name: 'Approve' }).click();
  await A.page.getByText('Everyone answered').waitFor({ timeout: 15000 });
  await shot(A.page, '21-plans');
  if ((await A.page.locator('.page').innerText()).includes('Dentist')) throw new Error('Private event title leaked into the plan');
  log('Plan answered after a phone approval; event title stayed private');

  await nav(A.page, 'Money');
  await A.page.getByRole('button', { name: 'Add expense' }).first().click();
  await A.page.getByLabel('What was it for?').fill('Groceries');
  await A.page.getByLabel('Amount (₹)').fill('900');
  await A.page.locator('.sheet-foot').getByRole('button', { name: 'Add expense' }).click();
  await A.page.getByRole('cell', { name: 'Groceries', exact: true }).waitFor();
  await shot(A.page, '22-money');
  await nav(A.page, 'Care');
  await A.page.getByRole('button', { name: 'New checklist' }).first().click();
  await A.page.getByLabel('Title').fill('Clinic visit on Friday');
  await A.page.getByLabel('Items').fill('Insurance card\nPrevious reports\nDrive to the clinic');
  await A.page.getByRole('button', { name: 'Create checklist' }).click();
  await A.page.getByRole('button', { name: "I'll take it" }).first().click();
  await shot(A.page, '23-care');
  log('Money and Care work');

  await nav(A.page, 'Agents');
  await A.page.locator('.agent-card', { hasText: 'Pip' }).click();
  await A.page.getByText('Private to this computer').waitFor();
  await shot(A.page, '24-agent-detail');
  await nav(A.page, 'Agents');
  await A.page.getByRole('button', { name: 'Add agent' }).first().click();
  await shot(A.page, '25-agent-new');

  await A.page.evaluate(() => { const l = JSON.parse(localStorage.getItem('larp.look') || '{}'); localStorage.setItem('larp.look', JSON.stringify({ ...l, preset: 'Paper' })); });
  await A.page.reload();
  await A.page.locator('.sidebar .space-btn').click();
  await A.page.getByRole('menuitem', { name: /Build studio/ }).click();
  await nav(A.page, 'Overview');
  await shot(A.page, '26-light-overview');

  console.log(errors.length ? `\nRenderer errors:\n${errors.join('\n')}` : '\nNo renderer errors.');
  console.log('All UI checks passed. Screenshots in work/screens.');
} finally {
  await browser?.close();
  for (const app of apps) await app.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
