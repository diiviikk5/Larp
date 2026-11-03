// Two people's agents working together on one repo, on two "laptops":
//   Divik asks his agent Sol to add sub(); Sol writes the code and asks Arjun's agent Byte for the tests.
//   Arjun approves; Byte writes them on his copy; Larp brings Byte's answer and changes back to Sol,
//   who finishes in the same workspace. The combined result passes its check and is applied on Divik's
//   laptop. The two copies sit in differently named folders: Larp matches them by their first commit.
//   npm run test:agents
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { git } from '../server/adapters/process.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-agents-'));
const step = (name) => console.log(`\n▶ ${name}`);
const ok = (name) => console.log(`  ✓ ${name}`);
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`Timed out waiting for: ${label}`);
}

const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator'), meko: null });
const hosts = [];
let url;
const api = async (token, method, route, body) => {
  const response = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: ${data.error}`);
  return data;
};
const state = (token) => api(token, 'GET', 'state');
const taskOf = (token, id, test, label) => until(async () => (await state(token)).tasks.find((t) => t.id === id && test(t)), label || `task ${id}`);

try {
  await coordinator.init();
  [url] = await coordinator.listen({ port: 0, host: '127.0.0.1' });

  // One repo, cloned by each person into a differently named folder.
  const origin = path.join(root, 'origin');
  await fs.mkdir(origin, { recursive: true });
  await fs.writeFile(path.join(origin, 'math.js'), 'export function add(a, b) {\n  return a + b;\n}\n');
  await fs.writeFile(path.join(origin, 'package.json'), '{"type":"module"}\n');
  await git(origin, ['init', '-q', '-b', 'main']);
  await git(origin, ['add', '-A']);
  await git(origin, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  const clone = async (who, folder) => { const dir = path.join(root, who, folder); await fs.mkdir(path.dirname(dir), { recursive: true }); await git(root, ['clone', '-q', origin, dir]); return dir; };

  const owner = coordinator.createSpaceWithOwner({ spaceName: 'Build studio', kind: 'build', ownerName: 'Divik' });
  const divik = owner.token;
  const build = owner.space.id;
  const invite = await api(divik, 'POST', 'invites', { spaceId: build });
  const arjun = (await (await fetch(`${url}/api/join`, { method: 'POST', body: JSON.stringify({ code: invite.code, name: 'Arjun' }) })).json()).token;
  const startHost = async (token, name) => {
    const { token: hostToken } = await api(token, 'POST', 'hosts', { name });
    const host = new Host({ url, token: hostToken, dataDir: path.join(root, 'hosts', name) });
    await host.start();
    hosts.push(host);
    return host;
  };
  const divikLaptop = await startHost(divik, 'Divik laptop');
  const arjunLaptop = await startHost(arjun, 'Arjun laptop');
  const divikRepo = await clone('divik', 'calc');
  const sol = await divikLaptop.addAgent({ ownerToken: divik, name: 'Sol', runtime: 'scripted', spaceIds: [build], repoPath: divikRepo });
  const byte = await arjunLaptop.addAgent({ ownerToken: arjun, name: 'Byte', runtime: 'scripted', spaceIds: [build], repoPath: await clone('arjun', 'my-calc-copy') });
  await until(async () => (await state(divik)).agents.every((a) => a.online), 'hosts online');
  const agents = (await state(divik)).agents;
  assert.ok(agents.every((a) => a.repoId) && agents[0].repoId === agents[1].repoId, 'both copies have the same repo identity');
  ok('Two laptops; the repo is in "calc" for Divik and "my-calc-copy" for Arjun, recognised as the same repo');

  // The scripted agent follows "create file … with content "…"" lines in its prompt. Sol's instructions
  // write sub.js and a question for Byte; the question carries what Byte should do.
  const testFile = "import { sub } from './sub.js';\nif (sub(5, 3) !== 2) { console.error('sub(5,3) should be 2'); process.exit(1); }\nconsole.log('sub tests passed');\n";
  const askByte = `Please write tests for sub() in sub.test.mjs. create file sub.test.mjs with content "${testFile.replace(/\n/g, '\\n')}"`;
  const instructions = [
    'Add a sub(a, b) function in sub.js, and ask Byte to write its tests.',
    'create file sub.js with content "export function sub(a, b) {\\n  return a - b;\\n}\\n"',
    `create file .larp/ask-Byte.md with content "${askByte.replace(/"/g, '\\"')}"`,
  ].join('\n');

  step('Divik asks Sol; Sol does its part and asks Byte');
  const task = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: sol.id, title: 'Add sub() with tests', check: 'node sub.test.mjs', instructions });
  const waiting = await taskOf(divik, task.id, (t) => t.status === 'waiting', 'Sol waiting on Byte');
  assert.equal(waiting.asks[0].to, 'Byte');
  assert.match(waiting.asks[0].text, /write tests for sub/);
  const approval = await until(async () => (await state(arjun)).approvals.find((a) => a.kind === 'run_task'), 'Arjun gets an approval');
  assert.match(approval.title, /Sol asks: Please write tests/);
  ok(`Sol wrote sub.js and asked Byte: "${waiting.asks[0].text.slice(0, 50)}…"; Arjun was asked to approve`);

  step('Arjun approves; Byte writes the tests on his laptop; the answer goes back to Sol');
  await api(arjun, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  const child = await taskOf(divik, waiting.asks[0].childId, (t) => t.status === 'accepted', 'Byte answered');
  assert.deepEqual(child.result.files, ['sub.test.mjs']);
  ok('Byte created sub.test.mjs in his own copy; the result was handed back automatically');

  step('Sol resumes with Byte\'s changes in its workspace and finishes');
  const done = await taskOf(divik, task.id, (t) => ['needs_review', 'failed'].includes(t.status), 'Sol finished');
  assert.equal(done.status, 'needs_review', done.result?.error);
  assert.deepEqual([...done.result.files].sort(), ['sub.js', 'sub.test.mjs']);
  assert.equal(done.result.check.passed, true, done.result.check.output);
  assert.ok(done.asks[0].answered && done.asks.length === 1, 'asked once, answered once');
  assert.ok(done.log.some((l) => /applied Byte's changes/.test(l.text)));
  assert.ok(!done.result.diff.includes('.larp/'), 'Larp\'s own notes are not part of the change');
  ok('One combined change (sub.js by Sol, sub.test.mjs by Byte); "node sub.test.mjs" passed');

  step('Divik accepts; it lands on his laptop as one branch');
  await api(divik, 'POST', `tasks/${task.id}/accept`, { applyHostId: divikLaptop.hostId || (await state(divik)).hosts.find((h) => h.name === 'Divik laptop').id });
  const applied = await taskOf(divik, task.id, (t) => ['applied', 'apply_failed'].includes(t.status), 'applied');
  assert.equal(applied.status, 'applied', applied.applied?.message);
  const files = await git(divikRepo, ['show', '--name-only', '--pretty=format:', applied.applied.branch]);
  assert.deepEqual(files.split('\n').filter(Boolean).sort(), ['sub.js', 'sub.test.mjs']);
  ok(`Committed on ${applied.applied.branch} in Divik's "calc" folder`);

  step('Work done by Byte alone also applies on Divik\'s differently named copy');
  let solo = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'Add a README', instructions: 'create file README.md with content "# calc\\n"' });
  const soloApproval = await until(async () => (await state(arjun)).approvals.find((a) => a.taskId === solo.id), 'approval for README');
  await api(arjun, 'POST', `approvals/${soloApproval.id}`, { decision: 'approve' });
  solo = await taskOf(divik, solo.id, (t) => t.status === 'needs_review', 'README done');
  await api(divik, 'POST', `tasks/${solo.id}/accept`, { applyHostId: (await state(divik)).hosts.find((h) => h.name === 'Divik laptop').id });
  solo = await taskOf(divik, solo.id, (t) => ['applied', 'apply_failed'].includes(t.status), 'README applied');
  assert.equal(solo.status, 'applied', solo.applied?.message);
  ok('Byte\'s README from "my-calc-copy" was applied in "calc": no need for matching folder names');

  step('Byte may read Arjun\'s apps; Arjun is told so when approving');
  let prompt = '';
  arjunLaptop.appContext = async () => [{ name: 'Kosh', kind: 'Family finance', text: 'summary: {"month":"2026-11","budgetLeft":4200}' }];
  const build0 = arjunLaptop.buildPrompt.bind(arjunLaptop);
  arjunLaptop.buildPrompt = (task, apps) => { prompt = build0(task, apps); return prompt; };
  await arjunLaptop.updateAgent(byte.id, { useApps: true });
  assert.equal((await state(divik)).agents.find((a) => a.id === byte.id).usesApps, true);
  let budget = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'How much can Arjun\'s family spend on dinner?', instructions: 'Check the budget.', kind: 'general' });
  const budgetApproval = await until(async () => (await state(arjun)).approvals.find((a) => a.taskId === budget.id), 'approval for budget');
  assert.match(budgetApproval.detail, /can request connected apps/);
  await api(arjun, 'POST', `approvals/${budgetApproval.id}`, { decision: 'approve' });
  budget = await taskOf(divik, budget.id, (t) => t.status === 'needs_review', 'budget answered');
  assert.ok(!prompt.includes('budgetLeft'), 'App records must not be preloaded');
  assert.ok(!budget.log.some((l) => l.text === 'Read Kosh for this task'));
  ok('Arjun\'s approval said Byte reads his apps; Byte\'s prompt did not preload private app records');

  console.log('\nAll agent-to-agent checks passed.');
} finally {
  for (const h of hosts) await h.stop();
  await coordinator.close();
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
