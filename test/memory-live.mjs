// The memory story against LIVE Meko (and YugabyteDB, when it answers), with the keys in .env:
// Sol works and remembers; Sol's notes are handed to Arjun's agent Byte; Byte's fix becomes a lesson
// Divik approves (memory_promote); later Byte recalls the lesson on a fresh copy and the check passes;
// with memory off the same task fails. Creates real datapacks named <LARP_TEAM>-…
//   node test/memory-live.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { Meko, loadEnv } from '../server/meko.mjs';
import { connectFromEnv } from '../server/db.mjs';
import { git } from '../server/adapters/process.mjs';

await loadEnv(path.join(import.meta.dirname, '..', '.env'));
if (!process.env.MEKO_API_KEY) { console.error('Set MEKO_API_KEY in .env'); process.exit(1); }
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-live-'));
const step = (n) => console.log(`\n▶ ${n}`);
const ok = (n) => console.log(`  ✓ ${n}`);
const show = (label, text) => console.log(`    ${label}: ${String(text).replace(/\s+/g, ' ').slice(0, 220)}`);
async function until(fn, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`Timed out waiting for: ${label}`);
}

const db = await connectFromEnv();
console.log(`Meko: live (team ${process.env.LARP_TEAM}) · storage: ${db ? 'YugabyteDB' : 'local files (YugabyteDB not reachable or not set)'}`);
const meko = new Meko({ apiKey: process.env.MEKO_API_KEY, team: process.env.LARP_TEAM || 'larp' });
const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator'), db, meko });
const hosts = [];
let url;
const api = async (token, method, route, body) => {
  const r = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(`${method} ${route}: ${data.error}`);
  return data;
};
const state = (t) => api(t, 'GET', 'state');
const taskOf = (t, id, test) => until(async () => (await state(t)).tasks.find((x) => x.id === id && test(x)), `task ${id}`, 300000);
const failedCalls = () => coordinator.s.mekoCalls.filter((c) => !c.ok);

try {
  await coordinator.init();
  [url] = await coordinator.listen({ port: 0, host: '127.0.0.1' });
  const origin = path.join(root, 'origin');
  await fs.mkdir(origin, { recursive: true });
  await fs.writeFile(path.join(origin, 'math.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await fs.writeFile(path.join(origin, 'test.mjs'), "import { add } from './math.js';\nif (add(2, 3) !== 5) { console.error('add(2,3) should be 5'); process.exit(1); }\nconsole.log('all tests passed');\n");
  await fs.writeFile(path.join(origin, 'package.json'), '{"type":"module"}\n');
  await git(origin, ['init', '-q', '-b', 'main']);
  await git(origin, ['add', '-A']);
  await git(origin, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  const clone = async (who) => { const dir = path.join(root, who, 'demo-app'); await fs.mkdir(path.dirname(dir), { recursive: true }); await git(root, ['clone', '-q', origin, dir]); return dir; };

  const owner = coordinator.createSpaceWithOwner({ spaceName: 'Memory demo', kind: 'build', ownerName: 'Divik' });
  const divik = owner.token;
  const build = owner.space.id;
  const invite = await api(divik, 'POST', 'invites', { spaceId: build });
  const arjun = (await (await fetch(`${url}/api/join`, { method: 'POST', body: JSON.stringify({ code: invite.code, name: 'Arjun' }) })).json()).token;
  const startHost = async (token, name) => {
    const { token: hostToken } = await api(token, 'POST', 'hosts', { name });
    const host = new Host({ url, token: hostToken, dataDir: path.join(root, 'hosts', name) });
    await host.start(); hosts.push(host); return host;
  };
  const sol = await (await startHost(divik, 'Divik laptop')).addAgent({ ownerToken: divik, name: 'Sol', runtime: 'scripted', spaceIds: [build], repoPath: await clone('divik') });
  const byte = await (await startHost(arjun, 'Arjun laptop')).addAgent({ ownerToken: arjun, name: 'Byte', runtime: 'scripted', spaceIds: [build], repoPath: await clone('arjun') });
  await until(async () => (await state(divik)).agents.every((a) => a.online), 'hosts online');
  assert.equal((await state(divik)).memory.on, true, 'memory on with the live key');

  step('Day 1: Sol works on demo-app and remembers it in Meko');
  let t = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: sol.id, title: 'Look at the add function in math.js', instructions: 'Read the add function in math.js; the add tests fail because add subtracts.' });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review');
  await new Promise((r) => setTimeout(r, 4000)); // Meko extracts facts from the conversation in the background
  ok(`Sol's task ran with memory ${t.context.status}; ${coordinator.s.mekoCalls.length} live Meko calls so far, ${failedCalls().length} failed`);

  step('Delegation: Divik asks Byte; Sol\'s notes are handed over through Meko');
  t = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'Fix the add function in math.js', check: 'node test.mjs', instructions: 'The add function in math.js is wrong; fix add.' });
  const approval = await until(async () => (await state(arjun)).approvals.find((a) => a.taskId === t.id), 'approval');
  await api(arjun, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review');
  for (const i of t.context.items) show(`recalled [${i.source} · ${i.from}]`, i.text);
  const handoff = t.context.items.find((i) => i.source === 'handoff');
  if (handoff) ok('Byte got a hand-off note from Sol, written into Byte\'s datapack in Meko');
  else console.log('  · Meko returned nothing from Sol relevant enough to hand over this time');

  step('Review: Divik\'s feedback fixes it; the fix becomes a lesson promoted in Meko');
  const fix = 'replace "return a - b" with "return a + b" in math.js';
  await api(divik, 'POST', `tasks/${t.id}/revise`, { feedback: fix });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review' && x.attempts.length === 2);
  assert.equal(t.result.check.passed, true, t.result.check.output);
  await api(divik, 'POST', `tasks/${t.id}/accept`, { lesson: `demo-app add bug: when add tests fail, ${fix}` });
  const lesson = await until(async () => (await state(divik)).memory.lessons.find((l) => l.status === 'promoted' || l.status === 'failed'), 'lesson promoted');
  assert.equal(lesson.status, 'promoted', JSON.stringify(lesson));
  ok(`Lesson promoted in ${meko.name('team')} under the space's key (memory ${lesson.memoryId})`);
  await new Promise((r) => setTimeout(r, 6000)); // let Meko index the promoted lesson

  const trial = async () => {
    let x = await api(arjun, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'Make the add tests pass', check: 'node test.mjs', instructions: 'The add tests fail in demo-app. Make them pass.' });
    return taskOf(arjun, x.id, (y) => ['needs_review', 'failed'].includes(y.status));
  };

  step('Later: Byte gets a new task on a fresh copy, with no hint about the fix (memory on)');
  const withMemory = await trial();
  for (const i of withMemory.context.items) show(`recalled [${i.source} · ${i.from}]`, i.text);
  show('Meko saved', `${withMemory.context.saved || 0} tokens on this recall (${withMemory.context.quality || 'n/a'} match)`);
  console.log(`  check: ${withMemory.result.check.passed ? 'PASSED' : 'failed'}`);

  step('Same task with memory off');
  await api(divik, 'POST', 'memory/toggle', { on: false });
  const before = coordinator.s.mekoCalls.length;
  const withoutMemory = await trial();
  console.log(`  memory ${withoutMemory.context.status}; check: ${withoutMemory.result.check.passed ? 'passed' : 'FAILED'}; Meko calls while off: ${coordinator.s.mekoCalls.length - before}`);
  await api(divik, 'POST', 'memory/toggle', { on: true });

  step('What Larp logged');
  const calls = coordinator.s.mekoCalls;
  const byTool = {};
  for (const c of calls) byTool[c.tool] = (byTool[c.tool] || 0) + 1;
  console.log(`  ${calls.length} live Meko calls, ${failedCalls().length} failed: ${Object.entries(byTool).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const c of failedCalls().slice(0, 5)) show(`failed ${c.tool}`, c.error);
  const stats = await api(divik, 'GET', 'memory/stats');
  console.log(`  Memory page statistics come from: ${stats.source} (${stats.total} calls${stats.saved ? `, ${stats.saved} tokens saved` : ''})`);
  assert.equal(withMemory.result.check.passed, true, 'with live Meko, the recalled lesson fixed it');
  assert.equal(withoutMemory.result.check.passed, false, 'without memory the same task fails');
  ok('Live Meko changed the outcome: with memory the check passed, without it the same task failed');
} finally {
  for (const h of hosts) await h.stop();
  await coordinator.close();
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
