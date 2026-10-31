// A hosted coordinator, started exactly as the Dockerfile starts it (PORT set, setup code),
// with two "laptops" joining it over HTTP and delegating work between them.
//   node test/hosted.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Host } from '../server/host.mjs';
import { git } from '../server/adapters/process.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-hosted-'));
const ok = (name) => console.log(`  ✓ ${name}`);
const port = 47960;
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/cli.mjs', 'serve'], {
  env: { ...process.env, PORT: String(port), LARP_SETUP_CODE: 'firstrun', LARP_DATA_DIR: path.join(root, 'server'), MEKO_API_KEY: '', YUGABYTE_URL: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
const until = async (fn, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = await fn().catch(() => null); if (v) return v; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`Timed out: ${label}\n${log}`);
};
const call = async (token, method, route, body) => {
  const r = await fetch(`${url}/api/${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(`${route}: ${data.error}`);
  return data;
};
const hosts = [];
try {
  console.log('\n▶ A fresh hosted server');
  const health = await until(() => fetch(`${url}/api/health`).then((r) => r.json()), 'server up');
  assert.equal(health.setup, true);
  assert.match(log, /setup code FIRSTRUN/);
  ok('Listens on PORT on all interfaces and prints its one-time setup code');
  await assert.rejects(call(null, 'POST', 'join', { code: 'WRONG', name: 'Eve' }));

  console.log('\n▶ First person claims it with the setup code, then invites a teammate');
  const divik = await call(null, 'POST', 'join', { code: 'firstrun', name: 'Divik' });
  assert.equal(divik.space.name, 'Build studio');
  await assert.rejects(call(null, 'POST', 'join', { code: 'firstrun', name: 'Eve' }), /invalid/);
  ok('Setup code made Divik the owner and then stopped working');
  const invite = await call(divik.token, 'POST', 'invites', { spaceId: divik.space.id });
  const arjun = await call(null, 'POST', 'join', { code: invite.code, name: 'Arjun' });
  ok('Arjun joined with an invite code');

  console.log('\n▶ Each laptop runs its own agent and connects out to the server');
  const repo = path.join(root, 'arjun-repo');
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(path.join(repo, 'hello.txt'), 'hi\n');
  await git(repo, ['init', '-q', '-b', 'main']);
  await git(repo, ['add', '-A']);
  await git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  const laptop = async (who, name) => {
    const { token } = await call(who.token, 'POST', 'hosts', { name });
    const host = new Host({ url, token, dataDir: path.join(root, name) });
    await host.start();
    hosts.push(host);
    return host;
  };
  await laptop(divik, 'divik-laptop');
  const arjunLaptop = await laptop(arjun, 'arjun-laptop');
  const agent = await arjunLaptop.addAgent({ ownerToken: arjun.token, name: 'Byte', runtime: 'scripted', spaceIds: [divik.space.id], repoPath: repo });
  await until(async () => (await call(divik.token, 'GET', 'state')).agents.every((a) => a.online), 'agent online');
  ok('Both laptops are online through the server');

  const task = await call(divik.token, 'POST', 'tasks', { spaceId: divik.space.id, agentId: agent.id, title: 'Greet', check: 'node -e "process.exit(require(\'fs\').readFileSync(\'hello.txt\',\'utf8\').includes(\'hello\')?0:1)"', instructions: 'replace "hi" with "hello" in hello.txt' });
  const approval = await until(async () => (await call(arjun.token, 'GET', 'state')).approvals.find((a) => a.taskId === task.id), 'approval');
  await call(arjun.token, 'POST', `approvals/${approval.id}`, { decision: 'approve' });
  const done = await until(async () => (await call(divik.token, 'GET', 'state')).tasks.find((t) => t.id === task.id && t.status === 'needs_review'), 'result');
  assert.equal(done.result.check.passed, true, done.result.check.output);
  ok('Divik delegated to Arjun\'s agent; it ran on Arjun\'s laptop and passed its check');

  const page = await fetch(url).then((r) => r.text());
  assert.match(page, /<div id="root">/);
  ok('The server also serves the phone web app');
  console.log('\nHosted checks passed.');
} finally {
  for (const h of hosts) await h.stop();
  server.kill();
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
