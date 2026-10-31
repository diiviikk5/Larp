// Demo round 2 with real agents: each person's agent reads its own family's apps, and they combine
// what they know. Two copies of the desktop app on one computer, each with its own Swasthya and Kosh
// (Divik's Sharma family, Arjun's Mehta family). Sol plans a dinner, asks Byte about Arjun's family,
// Arjun approves, Byte answers from Arjun's apps, and Sol's plan uses both families.
//   npm run build && node test/demo-round2.mjs [screenshot folder]      (real Codex; DEMO_MODEL picks the model)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const model = process.env.DEMO_MODEL || 'gpt-6-luna';
const out = process.argv[2] || path.join(os.tmpdir(), 'larp-round2');
await fs.mkdir(out, { recursive: true });
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-round2-'));
const launch = (who, offset, family) => electron.launch({ args: ['.'], env: {
  ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: path.join(root, who), LARP_NO_SPLASH: '1',
  LARP_APPS_PORT_OFFSET: String(offset), LARP_SAMPLE_FAMILY: String(family),
} });
const until = async (fn, what, ms = 60_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`Timed out: ${what}`);
};
const step = (t) => console.log(`\n▶ ${t}`);
const ok = (t) => console.log(`  ✓ ${t}`);
const SHARMA = ['Sharma', 'Ravi', 'Anita', 'Dadi', 'Aarav', 'Isha'];
const MEHTA = ['Mehta', 'Rohit', 'Neha', 'Nani', 'Kabir', 'Tara'];
const mentions = (text, names) => names.filter((n) => new RegExp(`\\b${n}\\b`).test(text || ''));
const apps = [];
try {
  step('Divik (Sharma family) starts a space; Arjun (Mehta family) joins with the invite message');
  const divik = await launch('divik', 100, 0); apps.push(divik);
  const dp = await divik.firstWindow();
  await dp.setViewportSize({ width: 1360, height: 900 });
  await dp.waitForFunction(() => Boolean(window.larp));
  await dp.evaluate(() => window.larp.createSpace({ spaceName: 'Two families', kind: 'build', name: 'Divik', lan: true }));
  await dp.reload();
  await dp.locator('.sidebar .nav-item', { hasText: 'People' }).click();
  await dp.locator('button', { hasText: 'Create invite code' }).click();
  const message = await dp.locator('.invite-message').textContent();
  const arjun = await launch('arjun', 200, 1); apps.push(arjun);
  const ap = await arjun.firstWindow();
  await ap.setViewportSize({ width: 1360, height: 900 });
  await ap.locator('button', { hasText: 'Join a space' }).first().click();
  await ap.locator('#your-name').fill('Arjun');
  await ap.locator('#invite-link').fill(message);
  await ap.locator('button', { hasText: 'Join space' }).click();
  await ap.locator('.sidebar').waitFor({ timeout: 30000 });
  for (const [page, who] of [[dp, 'Divik'], [ap, 'Arjun']]) {
    const list = await until(async () => { const l = await page.evaluate(() => window.larp.appsList()); return l.every((a) => a.running && a.connected) && l; }, `${who}'s apps`);
    const fam = await page.evaluate(() => window.larp.appsCall({ id: 'kosh', path: 'family' }));
    ok(`${who}'s Swasthya and Kosh run inside Larp (${list.map((a) => a.url.split(':').pop()).join(', ')}); family: ${fam.members.map((m) => m.name).join(', ')}`);
  }

  step(`Both add a Codex agent (${model}) that can read its owner's apps`);
  const add = (page, name) => page.evaluate(async ([name, model]) => {
    const d = await window.larp.config();
    const state = await (await fetch(d.url + '/api/state', { headers: { Authorization: 'Bearer ' + d.people[0].token } })).json();
    return window.larp.addAgent({ personId: d.people[0].id, name, runtime: 'codex', model, spaceIds: [state.spaces[0].id], useApps: true });
  }, [name, model]);
  const sol = await add(dp, 'Sol');
  await add(ap, 'Byte');
  const token = await dp.evaluate(async () => (await window.larp.config()).people[0].token);
  const url = await dp.evaluate(async () => (await window.larp.config()).url);
  const arjunToken = await ap.evaluate(async () => (await window.larp.config()).people[0].token);
  const api = async (t, method, route, body) => {
    const r = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
  };
  const state = (t = token) => api(t, 'GET', 'state');
  await until(async () => { const s = await state(); return s.agents.length === 2 && s.agents.every((a) => a.online && a.usesApps); }, 'agents online');
  ok('Sol (Divik) and Byte (Arjun) are online; both read their owner\'s apps');

  step('Divik asks Sol to plan a dinner for both families');
  const instructions = 'Plan a dinner this week for our two families. Use my Kosh and Swasthya to check my family\'s dining budget and when we are busy, and ask Byte (Arjun\'s agent) for his family\'s budget and free evenings from his apps. Suggest one evening and a place that fits both budgets, and name the people from both families who are coming.';
  const task = await api(token, 'POST', 'tasks', { spaceId: (await state()).spaces[0].id, agentId: sol.id, title: 'Dinner for both families', instructions, kind: 'general' });
  const waiting = await until(async () => {
    const t = (await state()).tasks.find((x) => x.id === task.id);
    if (['failed', 'needs_review'].includes(t?.status)) throw new Error(`Sol ${t.status} without asking Byte: ${t.result?.error || t.result?.summary}`);
    return t?.status === 'waiting' ? t : null;
  }, 'Sol asks Byte', 900_000);
  assert.ok(waiting.log.some((l) => /Read Swasthya and Kosh/.test(l.text)), 'Sol read Divik\'s apps');
  ok(`Sol read Divik's apps and asked Byte: "${waiting.asks[0].text.slice(0, 110).replace(/\n/g, ' ')}…"`);

  step('Arjun approves (the approval says Byte reads his apps); Byte answers from them');
  const approval = await until(async () => (await state(arjunToken)).approvals.find((a) => a.kind === 'run_task'), 'Arjun sees the request');
  assert.match(approval.detail, /can read your connected apps/);
  await api(arjunToken, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  const done = await until(async () => (await state()).tasks.find((t) => t.id === task.id && ['needs_review', 'failed'].includes(t.status)), 'Sol finishes', 1_500_000);
  const helper = (await state()).tasks.find((t) => t.id === done.asks[0].childId);
  console.log(`  Byte's task: ${helper.status}${helper.result?.error ? ` · ${helper.result.error.slice(0, 400)}` : ''}`);
  assert.equal(helper.status, 'accepted', 'Byte answered');
  assert.ok(helper.log.some((l) => /Read Swasthya and Kosh/.test(l.text)), 'Byte read Arjun\'s apps');
  const byteSaid = done.asks[0].answer.text;
  console.log(`  Byte answered: ${byteSaid.slice(0, 400).replace(/\n/g, ' ')}`);
  assert.ok(mentions(byteSaid, MEHTA).length, 'Byte\'s answer is about the Mehta family');
  assert.equal(done.status, 'needs_review', done.result?.error);
  const plan = done.result.summary;
  console.log(`  Sol's plan: ${plan.slice(0, 700).replace(/\n/g, ' ')}`);
  assert.ok(mentions(plan, SHARMA).length && mentions(plan, MEHTA).length, 'the plan uses both families');
  await dp.locator('.sidebar .nav-item', { hasText: 'Tasks' }).click();
  await dp.locator('text=Dinner for both families').first().click();
  await dp.locator('.talk').waitFor({ timeout: 10000 });
  await dp.screenshot({ path: path.join(out, 'round2-task.png'), fullPage: true });
  ok(`Sol's plan names ${mentions(plan, SHARMA).join(', ')} (Divik's family) and ${mentions(plan, MEHTA).join(', ')} (Arjun's family)`);
} finally {
  for (const a of apps) await a.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
