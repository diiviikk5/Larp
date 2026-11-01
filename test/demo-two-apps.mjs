// The demo, in two real copies of the desktop app on one machine: Divik hosts, Arjun joins by pasting
// the invite message, both add an agent on the demo project, and Divik's agent asks Arjun's for help.
//   npm run build && node test/demo-two-apps.mjs [screenshot folder]           (scripted agents, offline)
//   DEMO_RUNTIME=codex node test/demo-two-apps.mjs [folder]                     (real Codex, uses your plan)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { createDemoProject } from '../server/demo-project.mjs';

const runtime = process.env.DEMO_RUNTIME || 'scripted';
const out = process.argv[2] || path.join(os.tmpdir(), 'larp-demo');
await fs.mkdir(out, { recursive: true });
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-demo-'));
const launch = (who) => electron.launch({ args: ['.'], env: { ...process.env, MEKO_API_KEY: '', YUGABYTE_URL: '', LARP_CLOUD: 'off', LARP_DATA_DIR: path.join(root, who), LARP_NO_SPLASH: '1' } });
const until = async (fn, what, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 400)); }
  throw new Error(`Timed out: ${what}`);
};
const apps = [];
const step = (t) => console.log(`\n▶ ${t}`);
const ok = (t) => console.log(`  ✓ ${t}`);
try {
  step('Divik starts a space; Arjun joins by pasting the invite message');
  const divik = await launch('divik'); apps.push(divik);
  const dp = await divik.firstWindow();
  await dp.setViewportSize({ width: 1360, height: 900 });
  await dp.waitForFunction(() => Boolean(window.larp));
  await dp.evaluate(() => window.larp.createSpace({ spaceName: 'Build studio', kind: 'build', name: 'Divik', lan: true }));
  await dp.reload();
  await dp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await dp.locator('button', { hasText: 'Create invite code' }).click();
  const message = await dp.locator('.invite-message').textContent();

  const arjun = await launch('arjun'); apps.push(arjun);
  const ap = await arjun.firstWindow();
  await ap.setViewportSize({ width: 1360, height: 900 });
  await ap.locator('button', { hasText: 'Join a space' }).first().click();
  await ap.locator('#your-name').fill('Arjun');
  await ap.locator('#invite-link').fill(message);
  await ap.locator('button', { hasText: 'Join space' }).click();
  await ap.locator('.sidebar').waitFor({ timeout: 30000 });
  ok('Arjun is in Build studio');

  step(`Both add an agent on the demo project (${runtime})`);
  const divikRepo = await dp.evaluate(() => window.larp.createDemoProject());
  const arjunRepo = await createDemoProject(path.join(root, 'arjun-projects'));   // his own copy, elsewhere
  const add = (page, name, repoPath) => page.evaluate(async ([name, repoPath, runtime]) => {
    const d = await window.larp.config();
    const state = await (await fetch(d.url + '/api/state', { headers: { Authorization: 'Bearer ' + d.people[0].token } })).json();
    return window.larp.addAgent({ personId: d.people[0].id, name, runtime, spaceIds: [state.spaces[0].id], repoPath });
  }, [name, repoPath, runtime]);
  const sol = await add(dp, 'Sol', divikRepo);
  const byte = await add(ap, 'Byte', arjunRepo);
  const token = await dp.evaluate(async () => (await window.larp.config()).people[0].token);
  const url = await dp.evaluate(async () => (await window.larp.config()).url);
  const arjunToken = await ap.evaluate(async () => (await window.larp.config()).people[0].token);
  const api = async (t, method, route, body) => {
    const r = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
  };
  const state = (t = token) => api(t, 'GET', 'state');
  await until(async () => (await state()).agents.length === 2 && (await state()).agents.every((a) => a.online && a.repoId), 'both agents online');
  const [a1, a2] = (await state()).agents;
  assert.equal(a1.repoId, a2.repoId);
  ok(`Sol (Divik) and Byte (Arjun) are online on the same repo (${a1.repoId.slice(0, 8)}), in different folders`);

  step('Divik asks Sol; Sol asks Byte for help');
  const settleTests = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { settle } from '../src/settle.js';\n\ntest('settle', () => {\n  const expenses = [{ description: 'Groceries', amount: 1200, paidBy: 'Mum', splitAmong: ['Mum', 'Dad', 'Riya'] }, { description: 'Electricity', amount: 900, paidBy: 'Dad', splitAmong: ['Mum', 'Dad', 'Riya'] }];\n  assert.deepEqual(settle(expenses), [{ from: 'Riya', to: 'Mum', amount: 500 }, { from: 'Riya', to: 'Dad', amount: 200 }]);\n});\n";
  const settleCode = "import { paidBy, shares } from './expenses.js';\n\n/** Who pays whom, with the fewest payments: [{ from, to, amount }]. */\nexport function settle(expenses) {\n  const paid = paidBy(expenses);\n  const owed = shares(expenses);\n  const names = [...new Set([...Object.keys(paid), ...Object.keys(owed)])];\n  const balance = names.map((n) => ({ n, b: (paid[n] || 0) - (owed[n] || 0) }));\n  const debtors = balance.filter((x) => x.b < -0.005).sort((a, b) => a.b - b.b);\n  const creditors = balance.filter((x) => x.b > 0.005).sort((a, b) => b.b - a.b);\n  const out = [];\n  for (const d of debtors) {\n    for (const c of creditors) {\n      const amount = Math.min(-d.b, c.b);\n      if (amount < 0.005) continue;\n      out.push({ from: d.n, to: c.n, amount: Math.round(amount * 100) / 100 });\n      d.b += amount; c.b -= amount;\n    }\n  }\n  return out;\n}\n";
  // The scripted agent turns \n back into new lines and \" into quotes, once per hop.
  const esc = (s) => s.replace(/\n/g, '\\n').replace(/"/g, '\\"');
  const instructions = runtime === 'scripted'
    ? ['Add settle(expenses) in src/settle.js, and ask Byte to write its tests.',
      `create file src/settle.js with content "${esc(settleCode)}"`,
      `create file .larp/ask-Byte.md with content "${esc(`Please write tests for settle() in test/settle.test.js. create file test/settle.test.js with content "${settleTests}"`)}"`].join('\n')
    : 'Add settle(expenses) to this repo in src/settle.js: it returns who pays whom, with the fewest payments, as [{ from, to, amount }], using paidBy() and shares() from src/expenses.js. Write the code yourself, and ask Byte (Arjun\'s agent) to write the tests for it in test/settle.test.js. When Byte has answered and its tests are in your workspace, make sure `npm test` passes.';
  const task = await api(token, 'POST', 'tasks', { spaceId: (await state()).spaces[0].id, agentId: sol.id, title: 'Add settle() with tests from Byte', instructions, check: 'npm test' });
  const waiting = await until(async () => {
    const t = (await state()).tasks.find((x) => x.id === task.id);
    if (['failed', 'needs_review'].includes(t?.status)) throw new Error(`Sol ${t.status} without asking Byte: ${t.result?.error || t.result?.summary}`);
    return t?.status === 'waiting' ? t : null;
  }, 'Sol asks Byte', runtime === 'codex' ? 600_000 : 60_000);
  ok(`Sol asked Byte: "${waiting.asks[0].text.slice(0, 90).replace(/\n/g, ' ')}…"`);

  step('Arjun approves in his app; Byte answers; Sol finishes');
  const approval = await until(async () => (await state(arjunToken)).approvals.find((a) => a.kind === 'run_task'), 'Arjun sees the request');
  await api(arjunToken, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  const done = await until(async () => (await state()).tasks.find((t) => t.id === task.id && ['needs_review', 'failed'].includes(t.status)), 'Sol finishes', runtime === 'codex' ? 1_200_000 : 90_000);
  console.log(`  files: ${done.result.files.join(', ')} · check ${done.result.check?.passed ? 'passed' : 'FAILED'}`);
  if (done.status === 'failed') console.log('  error:', done.result.error);
  // Byte must really have answered: its own task succeeded and its changes reached Sol.
  const helper = (await state()).tasks.find((t) => t.id === done.asks[0].childId);
  console.log(`  Byte's task: ${helper.status}${helper.result?.error ? ` · ${helper.result.error.slice(0, 600)}` : ''}`);
  if (helper.status !== 'accepted') for (const l of helper.log.slice(-12)) console.log(`    [${l.kind}] ${String(l.text).slice(0, 300).replace(/\n/g, ' ')}`);
  assert.equal(helper.status, 'accepted', 'Byte answered');
  assert.ok(done.asks[0].answer.files.some((f) => f.includes('settle.test')), 'Byte wrote the tests');
  await dp.locator('.sidebar .nav-item', { hasText: 'Tasks' }).click();
  await dp.locator('text=Add settle() with tests from Byte').first().click();
  await dp.locator('.talk').waitFor({ timeout: 10000 });
  await dp.screenshot({ path: path.join(out, `demo-${runtime}-task.png`), fullPage: true });
  assert.equal(done.status, 'needs_review');
  assert.ok(done.result.files.some((f) => f.includes('settle.test')), 'Byte\'s tests are in the combined change');
  assert.equal(done.result.check.passed, true, done.result.check.output);
  ok('One combined change from both agents; npm test passed');
} finally {
  for (const a of apps) await a.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
