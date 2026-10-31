// Runs a real coding task through Larp with real agent runtimes, on a throwaway repo.
// It uses your own CLI sign-ins and costs one small task per runtime.
//   node test/real-agents.mjs claude codex hermes
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { git } from '../server/adapters/process.mjs';

const runtimes = process.argv.slice(2).length ? process.argv.slice(2) : ['claude'];
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-real-'));
const repo = path.join(root, 'shop');
await fs.mkdir(repo, { recursive: true });
await fs.writeFile(path.join(repo, 'cart.js'), `export function total(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal - discountPercent;
}
`);
await fs.writeFile(path.join(repo, 'test.mjs'), `import { total } from './cart.js';
const items = [{ price: 40, qty: 2 }, { price: 20, qty: 1 }];
const cases = [[total(items), 100], [total(items, 10), 90]];
for (const [got, want] of cases) if (got !== want) { console.error('expected', want, 'got', got); process.exit(1); }
console.log('all cart tests passed');
`);
await fs.writeFile(path.join(repo, 'package.json'), '{"type":"module"}\n');
await git(repo, ['init', '-q', '-b', 'main']);
await git(repo, ['add', '-A']);
await git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);

const coordinator = new Coordinator({ dataDir: path.join(root, 'coordinator') });
await coordinator.init();
const [url] = await coordinator.listen({ port: 0 });
const { space, token, person } = coordinator.createSpaceWithOwner({ spaceName: 'Real agents', kind: 'build', ownerName: 'Tester' });
const { token: hostToken } = coordinator.registerHost(person.id, { name: 'This computer' });
const host = new Host({ url, token: hostToken, dataDir: path.join(root, 'host') });
await host.start();

const results = [];
try {
  for (const runtime of runtimes) {
    console.log(`\n▶ ${runtime}`);
    // A ChatGPT-plan Codex sign-in needs a model the plan offers.
    const model = runtime === 'codex' ? (process.env.LARP_CODEX_MODEL || 'gpt-5.4') : undefined;
    const agent = await host.addAgent({ ownerToken: token, name: runtime, runtime, model, spaceIds: [space.id], repoPath: repo });
    const started = Date.now();
    const task = coordinator.createTask(person.id, {
      spaceId: space.id, agentId: agent.id, title: 'Fix cart total', check: 'node test.mjs',
      instructions: 'The tests in test.mjs fail. Fix the bug in cart.js so that `node test.mjs` passes: totals must count each item\'s qty, and the discount is a percentage. Do not change test.mjs.',
    });
    let done;
    while (Date.now() - started < 6 * 60_000) {
      const t = coordinator.s.tasks[task.id];
      if (['needs_review', 'failed'].includes(t.status)) { done = t; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    if (!done) { results.push({ runtime, ok: false, note: 'timed out after 6 minutes' }); console.log('  ✗ timed out'); continue; }
    for (const line of done.log.slice(-12)) console.log(`  · [${line.kind}] ${line.text.slice(0, 140).replace(/\n/g, ' ')}`);
    if (done.result?.error) {
      results.push({ runtime, ok: false, note: done.result.error.slice(0, 300) });
      console.log(`  ✗ agent error: ${done.result.error.slice(0, 300)}`);
      continue;
    }
    const check = done.result.check;
    console.log(`  files: ${done.result.files.join(', ') || 'none'}`);
    console.log(`  check: ${check?.passed ? 'PASSED' : 'FAILED'} (exit ${check?.exitCode}) ${check?.output.trim().split('\n').pop()}`);
    console.log(`  summary: ${done.result.summary.slice(0, 200).replace(/\n/g, ' ')}`);
    results.push({ runtime, ok: Boolean(check?.passed), seconds, files: done.result.files });
  }
} finally {
  await host.stop();
  await coordinator.close();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
console.log('\n' + JSON.stringify(results, null, 2));
