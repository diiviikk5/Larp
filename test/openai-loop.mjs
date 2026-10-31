// Drives Larp's own agent loop (the "Local or API model" runtime) end to end against a fake
// OpenAI-compatible server that answers with real tool calls: list, read, write, finish.
// Proves the loop, the tools, path safety, the worktree, the check and the result, with no model or cost.
//   node test/openai-loop.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { git } from '../server/adapters/process.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-loop-'));
const repo = path.join(root, 'shop');
await fs.mkdir(repo, { recursive: true });
await fs.writeFile(path.join(repo, 'cart.js'), 'export function total(items) {\n  return items.length;\n}\n');
await fs.writeFile(path.join(repo, 'test.mjs'), "import { total } from './cart.js';\nif (total([{ price: 2 }, { price: 3 }]) !== 5) { console.error('bad total'); process.exit(1); }\nconsole.log('ok');\n");
await fs.writeFile(path.join(repo, 'package.json'), '{"type":"module"}\n');
await git(repo, ['init', '-q', '-b', 'main']);
await git(repo, ['add', '-A']);
await git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);

// A scripted "model": each request gets the next step, and we record what the agent sent back.
const seen = [];
const steps = [
  { tool: 'list_files', args: {} },
  { tool: 'read_file', args: { path: 'cart.js' } },
  { tool: 'write_file', args: { path: '../escape.txt', content: 'should be refused' } },
  { tool: 'write_file', args: { path: 'cart.js', content: 'export function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n' } },
  { tool: 'finish', args: { summary: 'Fixed total() to sum prices.' } },
];
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  seen.push(request);
  const step = steps[Math.min(seen.length - 1, steps.length - 1)];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: seen.length === 1 ? 'Let me look at the code.' : null, tool_calls: [{ id: `call_${seen.length}`, type: 'function', function: { name: step.tool, arguments: JSON.stringify(step.args) } }] } }] }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator') });
await coordinator.init();
const [url] = await coordinator.listen({ port: 0 });
const { space, token, person } = coordinator.createSpaceWithOwner({ spaceName: 'Loop', kind: 'build', ownerName: 'Tester' });
const { token: hostToken } = coordinator.registerHost(person.id, { name: 'This computer' });
const host = new Host({ url, token: hostToken, dataDir: path.join(root, 'host') });
await host.start();

try {
  const agent = await host.addAgent({ ownerToken: token, name: 'Local', runtime: 'openai', model: 'fake-coder', baseUrl, spaceIds: [space.id], repoPath: repo });
  const task = coordinator.createTask(person.id, { spaceId: space.id, agentId: agent.id, title: 'Fix total', instructions: 'Make node test.mjs pass.', check: 'node test.mjs' });
  let done;
  for (let i = 0; i < 100 && !done; i++) {
    const t = coordinator.s.tasks[task.id];
    if (['needs_review', 'failed'].includes(t.status)) done = t;
    else await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(done, 'task finished');
  assert.equal(done.result.error, null, done.result.error);
  assert.equal(seen[0].model, 'fake-coder');
  assert.ok(seen[0].tools.some((t) => t.function.name === 'write_file'), 'tools were offered');
  assert.match(seen[1].messages.at(-1).content, /cart\.js/, 'list_files result went back to the model');
  assert.match(seen[2].messages.at(-1).content, /items\.length/, 'read_file result went back to the model');
  assert.match(seen[3].messages.at(-1).content, /outside the workspace/, 'writing outside the worktree was refused');
  await assert.rejects(fs.access(path.join(root, 'host', 'worktrees', 'escape.txt')));
  assert.equal(done.result.check.passed, true, done.result.check.output);
  assert.deepEqual(done.result.files, ['cart.js']);
  assert.equal(done.result.summary, 'Fixed total() to sum prices.');
  assert.ok(done.log.some((l) => l.kind === 'say' && l.text.includes('look at the code')), 'assistant text was streamed to the task log');
  console.log('✓ Local/API model loop: tools offered, results fed back, escape refused, fix written, check passed in the worktree');
} finally {
  await host.stop();
  await coordinator.close();
  server.close();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
