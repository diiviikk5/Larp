// Agent memory through Meko, end to end, against a stand-in Meko MCP server:
//   1. Divik's agent works on demo-app and remembers what it did.
//   2. Divik delegates to Arjun's agent: Divik's agent hands its notes over (agent → agent).
//   3. A reviewer's fix becomes a lesson; Divik approves it into the space's knowledge.
//   4. Days later, Arjun's agent gets an unrelated-looking task and succeeds because it recalls the lesson.
//   5. With memory off, the same task fails: the lesson is what changed the outcome.
// Optionally also stores everything in YugabyteDB: YUGABYTE_URL=... node test/memory.mjs
//   node test/memory.mjs            (add --serve to keep the coordinator running and open the app on it)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { Meko } from '../server/meko.mjs';
import { connectFromEnv } from '../server/db.mjs';
import { git } from '../server/adapters/process.mjs';
import { startFakeMeko } from './fake-meko.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-memory-'));
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

const serve = process.argv.includes('--serve');
const fake = await startFakeMeko();
const db = await connectFromEnv();
const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator'), db, meko: new Meko({ apiKey: fake.token, url: fake.url, team: 'test' }) });
const hosts = [];
let url;
const api = async (token, method, route, body) => {
  const response = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: ${data.error}`);
  return data;
};
const state = (token) => api(token, 'GET', 'state');
const taskOf = (token, id, test) => until(async () => (await state(token)).tasks.find((t) => t.id === id && test(t)), `task ${id}`);

try {
  await coordinator.init();
  [url] = await coordinator.listen({ port: serve ? 47900 : 0, host: '127.0.0.1', staticDir: path.join(import.meta.dirname, '..', 'dist') });

  // demo-app has a bug: add() subtracts.
  const origin = path.join(root, 'origin');
  await fs.mkdir(origin, { recursive: true });
  await fs.writeFile(path.join(origin, 'math.js'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await fs.writeFile(path.join(origin, 'test.mjs'), "import { add } from './math.js';\nif (add(2, 3) !== 5) { console.error('add(2,3) should be 5'); process.exit(1); }\nconsole.log('all tests passed');\n");
  await fs.writeFile(path.join(origin, 'package.json'), '{"type":"module"}\n');
  await git(origin, ['init', '-q', '-b', 'main']);
  await git(origin, ['add', '-A']);
  await git(origin, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  const clone = async (who) => { const dir = path.join(root, who, 'demo-app'); await fs.mkdir(path.dirname(dir), { recursive: true }); await git(root, ['clone', '-q', origin, dir]); return dir; };

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
  const sol = await divikLaptop.addAgent({ ownerToken: divik, name: 'Sol', runtime: 'scripted', spaceIds: [build], repoPath: await clone('divik') });
  const byte = await arjunLaptop.addAgent({ ownerToken: arjun, name: 'Byte', runtime: 'scripted', spaceIds: [build], repoPath: await clone('arjun') });
  await until(async () => (await state(divik)).agents.every((a) => a.online), 'hosts online');
  assert.equal((await state(divik)).memory.on, true);
  // The team's skills library (a knowledge-base document). There is no apps library in this test.
  fake.addDocument('test-skills', '# Larp skills catalog\n\n## Test Driven Development\n\nWrite a failing test for the add function first, then make the tests pass.\n\n## Brand Design\n\nPick brand colours and typography for a landing page.');

  step('Day 1: Divik\'s agent works on demo-app and remembers it');
  let t = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: sol.id, title: 'Look at the add function in math.js', instructions: 'Read the add function in math.js; the add tests fail.' });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review');
  assert.equal(t.context.status, 'ready');
  const skill = t.context.items.find((i) => i.source === 'skill');
  assert.ok(skill?.text.includes('Test Driven Development'), 'the skills library suggested a matching skill');
  assert.ok(!t.context.items.some((i) => i.text.includes('Brand Design')), 'unrelated skills are not suggested');
  assert.ok(![...fake.packs.values()].some((p) => p.name === 'test-apps'), 'a missing library is not created');
  ok('Sol was shown the Test Driven Development skill from the skills library; no apps library was created');
  await until(() => [...fake.memories.values()].some((m) => m.text.includes('Look at the add function')), 'outcome remembered');
  const solPack = [...fake.packs.values()].find((p) => p.name.startsWith('test-agent-sol-'));
  assert.ok(solPack, 'Sol has its own datapack');
  ok(`Sol recalled before working, and remembered the outcome in ${solPack.name}`);

  step('Delegation: Sol hands its notes to Arjun\'s agent Byte');
  t = await api(divik, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'Fix the add function in math.js', check: 'node test.mjs', instructions: 'The add function in math.js is wrong; fix add.' });
  const approval = await until(async () => (await state(arjun)).approvals.find((a) => a.taskId === t.id), 'approval');
  await api(arjun, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review');
  const handoff = t.context.items.find((i) => i.source === 'handoff');
  assert.ok(handoff, 'Byte got a hand-off note from Sol');
  assert.match(handoff.text, /Hand-off from Divik's agent Sol/);
  const bytePack = [...fake.packs.values()].find((p) => p.name.startsWith('test-agent-byte-'));
  assert.ok([...fake.memories.values()].some((m) => m.datapack_id === bytePack.id && m.text.startsWith('Hand-off from')), 'note stored in Byte\'s datapack');
  assert.equal(t.result.check.passed, false, 'no fix instructions yet');
  ok('Sol\'s notes were written into Byte\'s datapack and shown to Byte');

  step('Review: feedback is remembered; the fix becomes a lesson Divik approves');
  const fix = 'replace "return a - b" with "return a + b" in math.js';
  await api(divik, 'POST', `tasks/${t.id}/revise`, { feedback: fix });
  t = await taskOf(divik, t.id, (x) => x.status === 'needs_review' && x.attempts.length === 2);
  assert.equal(t.result.check.passed, true, t.result.check.output);
  await api(divik, 'POST', `tasks/${t.id}/accept`, { lesson: `demo-app add bug: when add tests fail, ${fix}` });
  const lesson = await until(async () => (await state(divik)).memory.lessons.find((l) => l.status === 'promoted'), 'lesson promoted');
  assert.ok(fake.memories.get(lesson.memoryId).promoted);
  assert.ok([...fake.memories.values()].some((m) => m.datapack_id === solPack.id && m.text.includes("Arjun's agent Byte did")), 'Byte handed the outcome back to Sol');
  ok('Lesson promoted in the space datapack; Byte handed the result back to Sol');

  const trial = async () => {
    let x = await api(arjun, 'POST', 'tasks', { spaceId: build, agentId: byte.id, title: 'Make the add tests pass', check: 'node test.mjs', instructions: 'The add tests fail in demo-app. Make them pass.' });
    x = await taskOf(arjun, x.id, (y) => ['needs_review', 'failed'].includes(y.status));
    return x;
  };

  step('Days later: a new task on a fresh copy, memory on');
  const withMemory = await trial();
  assert.ok(withMemory.context.items.some((i) => i.source === 'space' && i.text.includes('return a + b')), 'recalled the space lesson');
  assert.equal(withMemory.result.check.passed, true, withMemory.result.check?.output);
  ok('Byte recalled the lesson and the check passed with no instructions about the fix');

  step('Same task with memory off');
  await api(divik, 'POST', 'memory/toggle', { on: false });
  const before = fake.calls.length;
  const withoutMemory = await trial();
  assert.equal(withoutMemory.context.status, 'off');
  assert.equal(withoutMemory.result.check.passed, false);
  assert.equal(fake.calls.length, before, 'no Meko calls while off');
  ok('Without memory the same task fails: the lesson is what changed the outcome');
  await api(divik, 'POST', 'memory/toggle', { on: true });

  step('Knowledge royalties: credit goes to whoever\'s memory did the saving');
  const state1 = (await state(divik)).memory;
  const divikId = (await state(divik)).me.id;
  const lessonCredit = state1.royalties[`person:${divikId}`];
  assert.ok(lessonCredit && lessonCredit.saved > 0 && lessonCredit.reuses >= 1, 'Divik earns credit when Byte reuses his lesson');
  const solCredit = state1.royalties[`agent:${sol.id}`];
  assert.ok(solCredit && solCredit.saved > 0, 'Sol earns credit for the notes it handed to Byte');
  assert.ok(state1.totals.saved > 0 && withMemory.context.saved > 0);
  ok(`Divik's lesson saved others ${lessonCredit.saved} tokens over ${lessonCredit.reuses} reuse(s); Sol's notes saved ${solCredit.saved}; Meko reports ${state1.totals.saved} saved in all`);

  step('Proof locker: an identical result is recognised as a duplicate');
  assert.ok(withMemory.proof?.artifactId, 'result stored as a Meko artifact');
  assert.equal(withMemory.proof.duplicateOf, t.id, 'Byte\'s later fix is byte-for-byte the one already accepted');
  ok(`Proof ${withMemory.proof.hash.slice(0, 12)}… matches the accepted task's proof; Meko returned the first task's artifact`);

  step('Agents sleep: duplicates merged, stale hand-offs forgotten');
  const byteMem = [...fake.memories.values()].filter((m) => m.datapack_id === bytePack.id);
  const fb = byteMem.find((m) => m.text.includes('asked for a change'));
  const twin = `${fb.text} `;
  fake.memories.set('mem_twin', { ...fb, id: 'mem_twin', text: twin, created_at: new Date(Date.now() - 3600_000).toISOString() });
  fake.memories.set('mem_old_handoff', { id: 'mem_old_handoff', datapack_id: bytePack.id, text: 'Hand-off from Divik\'s agent Sol for "an old task": notes', agent_id: 'Sol', created_at: new Date(Date.now() - 14 * 86400000).toISOString() });
  const digest = await api(divik, 'POST', 'memory/sleep', { agentId: byte.id });
  assert.ok(digest.merged.length >= 1, 'merged the duplicate');
  assert.ok(digest.forgot.some((f) => f.id === 'mem_old_handoff'), 'forgot the two-week-old hand-off');
  assert.ok(!fake.memories.has('mem_old_handoff'));
  assert.ok((await state(divik)).memory.sleep[byte.id]?.reviewed > 0);
  ok(`Byte reviewed ${digest.reviewed} memories: merged ${digest.merged.length}, forgot ${digest.forgot.length}, suggests ${digest.suggest.length} lesson(s)`);

  step('People can remove what an agent recalled');
  const item = withMemory.context.items.find((i) => i.source === 'memory' && i.id);
  if (item) {
    await api(arjun, 'POST', 'memory/forget', { datapack: item.datapack, memoryId: item.id, taskId: withMemory.id });
    assert.ok(!fake.memories.has(item.id));
    ok('Forgot one recalled memory');
  }

  step('Every Meko call is logged for the memory view');
  const view = (await state(divik)).memory;
  const real = view.calls.filter((c) => !c.skipped);
  assert.ok(real.length >= 10);
  assert.ok(real.some((c) => c.kind === 'promote') && real.some((c) => c.to === 'Byte') && real.some((c) => c.to === 'Sol'));
  const stats = await api(divik, 'GET', 'memory/stats');
  assert.ok(stats.total >= 10);
  ok(`${real.length} calls logged (${Object.entries(stats.byKind).map(([k, n]) => `${n} ${k}`).join(', ')}); stats from ${stats.source}`);
  if (db) {
    assert.equal(stats.source, 'yugabyte');
    assert.ok(stats.links.some((l) => l.agent === 'Sol' && l.to_agent === 'Byte'));
    ok(`The SQL store at ${stats.database} answered the agent-to-agent counts`);
  }

  console.log('\nAll memory checks passed.');
  if (serve) {
    console.log(`Serving ${url}. In the browser: localStorage.setItem('larp.phone', '${divik}'); location.reload()`);
    await new Promise(() => {});
  }
} finally {
  for (const host of hosts) await host.stop();
  await coordinator.close();
  await fake.close();
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
