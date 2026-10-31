// End-to-end test of the multi-person, multi-agent flows with the offline scripted agent.
// Runs a real coordinator over HTTP, three hosts, real git repositories and real check commands.
//   node test/e2e.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { git } from '../server/adapters/process.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-e2e-'));
const step = (name) => console.log(`\n▶ ${name}`);
const ok = (name) => console.log(`  ✓ ${name}`);

async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let url;
async function api(token, method, route, body) {
  const response = await fetch(`${url}/api/${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: ${data.error}`);
  return data;
}
const state = (token) => api(token, 'GET', 'state');

// A small repo with a failing test, cloned to two "laptops".
async function makeRepo() {
  const origin = path.join(root, 'origin', 'demo-app');
  await fs.mkdir(origin, { recursive: true });
  await fs.writeFile(path.join(origin, 'math.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await fs.writeFile(path.join(origin, 'test.mjs'), "import { add } from './math.js';\nif (add(2, 3) !== 5) { console.error('add(2,3) should be 5, got', add(2, 3)); process.exit(1); }\nconsole.log('all tests passed');\n");
  await fs.writeFile(path.join(origin, 'package.json'), '{"type":"module"}\n');
  await git(origin, ['init', '-q', '-b', 'main']);
  await git(origin, ['add', '-A']);
  await git(origin, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  const clones = {};
  for (const who of ['divik', 'arjun']) {
    const dir = path.join(root, who, 'demo-app');
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await git(root, ['clone', '-q', origin, dir]);
    clones[who] = dir;
  }
  return clones;
}

const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator') });
const hosts = [];
try {
  await coordinator.init();
  [url] = await coordinator.listen({ port: 0, host: '127.0.0.1' });
  const repos = await makeRepo();

  step('Build studio: two people, two laptops');
  const owner = coordinator.createSpaceWithOwner({ spaceName: 'Build studio', kind: 'build', ownerName: 'Divik' });
  const divik = owner.token;
  const build = owner.space.id;
  const invite = await api(divik, 'POST', 'invites', { spaceId: build });
  const joined = await (await fetch(`${url}/api/join`, { method: 'POST', body: JSON.stringify({ code: invite.code, name: 'Arjun' }) })).json();
  const arjun = joined.token;
  ok('Arjun joined with a one-time invite code');
  await assert.rejects(fetch(`${url}/api/join`, { method: 'POST', body: JSON.stringify({ code: invite.code, name: 'Eve' }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); }));
  ok('The same invite code cannot be reused');

  const startHost = async (token, name) => {
    const { token: hostToken } = await api(token, 'POST', 'hosts', { name });
    const host = new Host({ url, token: hostToken, dataDir: path.join(root, 'hosts', name) });
    await host.start();
    hosts.push(host);
    return host;
  };
  const divikLaptop = await startHost(divik, 'Divik laptop');
  const arjunLaptop = await startHost(arjun, 'Arjun laptop');
  const divikAgent = await divikLaptop.addAgent({ ownerToken: divik, name: 'Sol', runtime: 'scripted', spaceIds: [build], repoPath: repos.divik });
  const arjunAgent = await arjunLaptop.addAgent({ ownerToken: arjun, name: 'Byte', runtime: 'scripted', spaceIds: [build], repoPath: repos.arjun });
  await assert.rejects(divikLaptop.addAgent({ ownerToken: 'not-a-token', name: 'X', runtime: 'scripted', spaceIds: [build] }));
  ok('Agents register only with their owner\'s consent');
  await until(async () => (await state(divik)).agents.every((a) => a.online), 'both hosts online');
  ok('Both hosts are online');

  step('Delegation needs the agent owner\'s approval');
  let task = await api(divik, 'POST', 'tasks', {
    spaceId: build, agentId: arjunAgent.id, title: 'Fix add()', check: 'node test.mjs',
    instructions: 'replace "return a - b" with "return a * b" in math.js',
  });
  assert.equal(task.status, 'awaiting_approval');
  const pending = (await state(arjun)).approvals.find((a) => a.taskId === task.id);
  assert.ok(pending, 'Arjun sees the approval');
  assert.equal((await state(divik)).approvals.length, 0, 'Divik cannot approve on Arjun\'s behalf');
  await assert.rejects(api(divik, 'POST', `approvals/${pending.id}`, { decision: 'approve' }));
  await api(arjun, 'POST', `approvals/${pending.id}`, { decision: 'approve' });
  ok('Only Arjun could approve running the task on his laptop');

  step('First attempt fails the check, so it is not marked verified');
  task = await until(async () => (await state(divik)).tasks.find((t) => t.id === task.id && t.status === 'needs_review'), 'first result');
  assert.equal(task.result.check.passed, false);
  assert.match(task.result.diff, /return a \* b/);
  assert.deepEqual(task.result.files, ['math.js']);
  ok(`Check failed as expected (exit ${task.result.check.exitCode}); diff and files reported`);

  step('Revision with feedback passes the check');
  await api(divik, 'POST', `tasks/${task.id}/revise`, { feedback: 'replace "return a * b" with "return a + b" in math.js' });
  task = await until(async () => (await state(divik)).tasks.find((t) => t.id === task.id && t.status === 'needs_review' && t.attempts.length === 2), 'second result');
  assert.equal(task.result.check.passed, true, task.result.check.output);
  assert.match(task.result.check.output, /all tests passed/);
  ok('Check passed on Arjun\'s machine on the second attempt');

  step('Conflict awareness across machines');
  const own = await api(divik, 'POST', 'tasks', {
    spaceId: build, agentId: divikAgent.id, title: 'Document add()', check: 'node test.mjs',
    instructions: 'replace "export function add" with "/** Adds numbers. */\\nexport function add" in math.js',
  });
  assert.equal(own.status, 'queued', 'Your own agent needs no approval');
  const flagged = await until(async () => (await state(divik)).tasks.find((t) => t.id === own.id && t.conflicts.length), 'conflict flag');
  assert.deepEqual(flagged.conflicts[0].files, ['math.js']);
  ok('Both tasks touching math.js were flagged before merging');

  step('Accepting applies the change on the requester\'s own laptop');
  await api(divik, 'POST', `tasks/${task.id}/accept`, { applyHostId: divikLaptop.me.host.id });
  task = await until(async () => (await state(divik)).tasks.find((t) => t.id === task.id && ['applied', 'apply_failed'].includes(t.status)), 'apply');
  assert.equal(task.status, 'applied', task.applied?.message);
  const branchFile = await git(repos.divik, ['show', `${task.applied.branch}:math.js`]);
  assert.match(branchFile, /return a \+ b/);
  ok(`Applied on Divik's laptop as branch ${task.applied.branch}; main branch untouched`);

  step('Home circle: three people sharing one laptop, each with their own phone');
  const mum = coordinator.createSpaceWithOwner({ spaceName: 'Home circle', kind: 'home', ownerName: 'Mum' });
  const home = mum.space.id;
  const familyLaptop = await startHost(mum.token, 'Family laptop');
  const people = { mum: mum.token };
  for (const name of ['Dad', 'Riya']) {
    const inv = await api(mum.token, 'POST', 'invites', { spaceId: home });
    people[name.toLowerCase()] = (await (await fetch(`${url}/api/join`, { method: 'POST', body: JSON.stringify({ code: inv.code, name }) })).json()).token;
  }
  const phones = {};
  for (const [who, token] of Object.entries(people)) {
    const { code } = await api(token, 'POST', 'pair', {});
    phones[who] = (await (await fetch(`${url}/api/pair/claim`, { method: 'POST', body: JSON.stringify({ code, label: `${who}'s phone` }) })).json()).token;
  }
  ok('Each person paired their own phone');
  const homeAgents = {};
  for (const [who, token] of Object.entries(people)) {
    homeAgents[who] = await familyLaptop.addAgent({ ownerToken: token, name: `${who}-agent`, runtime: 'scripted', spaceIds: [home] });
  }
  await familyLaptop.updateAgent(homeAgents.mum.id, { private: { calendar: [{ day: 'Sat', title: 'Doctor appointment', from: '09:00', to: '12:00' }], budget: 3000 }, sharing: { availability: 'auto', budget: 'auto' } });
  await familyLaptop.updateAgent(homeAgents.dad.id, { private: { availability: { Sat: [{ from: '11:00', to: '20:00' }] }, budget: 5000 } });
  await familyLaptop.updateAgent(homeAgents.riya.id, { private: { availability: { Sat: [{ from: '13:00', to: '22:00' }] }, budget: 2000 }, sharing: { budget: 'never' } });
  ok('Three agents on one laptop, each with private data that stays on the laptop');

  const plan = await api(phones.riya, 'POST', 'plans', { spaceId: home, title: 'Saturday outing', day: 'Sat', fields: ['availability', 'budget'] });
  const dadAsk = await until(async () => (await state(phones.dad)).approvals.find((a) => a.kind === 'share'), 'Dad share request');
  assert.match(dadAsk.detail, /11:00–20:00/);
  assert.equal((await state(phones.mum)).approvals.filter((a) => a.kind === 'share').length, 0, 'Mum auto-shares');
  await api(phones.dad, 'POST', `approvals/${dadAsk.id}`, { decision: 'approve' });
  const riyaAsk = await until(async () => (await state(phones.riya)).approvals.find((a) => a.kind === 'share'), 'Riya share request');
  assert.doesNotMatch(riyaAsk.detail, /budget/, 'Riya never shares budget, so she is not even asked');
  await api(phones.riya, 'POST', `approvals/${riyaAsk.id}`, { decision: 'approve' });
  const done = await until(async () => (await state(mum.token)).plans.find((p) => p.id === plan.id && p.result.complete), 'plan complete');
  assert.deepEqual(done.result.windows, [{ from: '13:00', to: '20:00' }]);
  assert.equal(done.result.budgetPerPerson, 3000);
  const mumAnswer = done.queries.find((q) => q.personId === mum.person.id).answer;
  assert.ok(!JSON.stringify(done).includes('Doctor'), 'Event titles never leave the laptop');
  assert.deepEqual(mumAnswer.availability, [{ from: '12:00', to: '22:00' }]);
  ok('Common time 13:00–20:00, budget up to ₹3000; Mum\'s appointment title was never shared');

  const snoop = await api(phones.dad, 'POST', 'plans', { spaceId: home, title: 'What is everyone doing?', day: 'Sat', fields: ['calendar'] });
  const denied = await until(async () => (await state(phones.dad)).plans.find((p) => p.id === snoop.id && p.result.complete), 'calendar request settled');
  assert.ok(denied.queries.every((q) => q.answer.calendar.denied), 'Every full-calendar request was denied');
  assert.ok((await state(mum.token)).events.some((e) => e.type === 'plan.denied'), 'Denials are logged');
  ok('A request for full calendars was denied for everyone and logged');

  step('Shared expenses and a care checklist');
  const ids = Object.fromEntries((await state(mum.token)).people.map((p) => [p.name, p.id]));
  await api(people.dad, 'POST', 'expenses', { spaceId: home, description: 'Groceries', amount: 900 });
  await api(people.mum, 'POST', 'expenses', { spaceId: home, description: 'Cab', amount: 300, splitAmong: [ids.Mum, ids.Riya] });
  const settle = (await state(mum.token)).settlements[home];
  // Groceries ₹900 split three ways; cab ₹300 split between Mum and Riya.
  assert.equal(Math.round(settle.balance[ids.Dad]), 600);
  assert.equal(Math.round(settle.balance[ids.Mum]), -150);
  assert.equal(Math.round(settle.balance[ids.Riya]), -450);
  assert.equal(settle.transfers.reduce((sum, t) => sum + t.amount, 0), 600);
  ok(`Settlement: ${settle.transfers.map((t) => `${Object.keys(ids).find((k) => ids[k] === t.from)} → ${Object.keys(ids).find((k) => ids[k] === t.to)} ₹${t.amount}`).join(', ')}`);

  const list = await api(people.mum, 'POST', 'checklists', { spaceId: home, title: 'Clinic visit Friday', items: ['Insurance card', 'Previous reports', 'Drive to clinic'] });
  await api(phones.dad, 'POST', `checklists/${list.id}/items/${list.items[2].id}`, { take: true });
  const after = (await state(mum.token)).checklists.find((c) => c.id === list.id);
  assert.equal(after.items[2].ownerId, ids.Dad);
  assert.equal(after.items.filter((i) => !i.ownerId).length, 2);
  ok('Dad took "Drive to clinic" from his phone; 2 items still need an owner');

  step('Spaces are isolated');
  const outsider = await state(divik);
  assert.ok(!outsider.spaces.some((s) => s.id === home) && !outsider.plans.length, 'Divik cannot see the Home circle');
  ok('People only see spaces they belong to');

  console.log('\nAll end-to-end checks passed.');
} finally {
  for (const host of hosts) await host.stop();
  await coordinator.close();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
