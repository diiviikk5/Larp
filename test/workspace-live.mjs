// Opt-in: uses the user's signed-in Codex account for two small real agent turns.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Coordinator } from '../server/coordinator.mjs';
import { Host } from '../server/host.mjs';
import { loadEnv } from '../server/meko.mjs';
await loadEnv('.env'); process.env.LARP_CLOUD = 'off'; delete process.env.YUGABYTE_URL;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-real-team-'));
const c = new Coordinator({ dataDir: path.join(root, 'coordinator'), meko: null }); await c.init(); await c.listen({ port: 0, host: '127.0.0.1' });
const owner = c.createSpaceWithOwner({ spaceName: 'Real agent proof', ownerName: 'Local test', kind: 'build' });
const registration = c.registerHost(owner.person.id, { name: 'One laptop' });
const host = new Host({ url: `http://127.0.0.1:${c.server.address().port}`, token: registration.token, dataDir: path.join(root, 'host') }); await host.start();
try {
  // Reuse a real upstream installation from the UI test when present.
  const candidates = (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith('larp-workspace-ui-'));
  let source;
  for (const n of candidates) { const dir = path.join(os.tmpdir(), n, 'larp', 'skills', 'frontend-design'); if (await fs.stat(path.join(dir, 'SKILL.md')).then(() => true, () => false)) source = dir; }
  if (source) await fs.cp(source, path.join(host.skills.dir, 'frontend-design'), { recursive: true });
  else await host.skills.install('frontend-design');
  const common = { ownerToken: owner.token, runtime: 'codex', model: 'gpt-6-luna', spaceIds: [owner.space.id], skills: ['frontend-design'] };
  const lead = await host.addAgent({ ...common, name: 'Lead' }); await host.addAgent({ ...common, name: 'Reviewer' });
  const task = c.createTask(owner.person.id, { spaceId: owner.space.id, agentId: lead.id, title: 'Real shared-skill design review', kind: 'general', instructions: 'Use the assigned frontend-design skill to review this UI concept: a desktop agent workspace with a chat pane, live agent cards and a memory activity panel. First ask Reviewer for exactly two actionable design improvements by writing .larp/ask-Reviewer.md. Finish that turn. After Reviewer answers, return a concise combined recommendation, crediting Reviewer. Do not create other agents, run commands or edit project files. This is a small integration check; keep the final answer under 100 words.' });
  let last = '';
  for (let i = 0; i < 300; i++) {
    if (task.status !== last) { console.log('Lead:', task.status); last = task.status; }
    if (['needs_review', 'failed'].includes(task.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(task.status, 'needs_review', task.result?.error || 'Timed out');
  assert.ok(task.asks?.some((a) => a.to === 'Reviewer' && a.answered), 'Real Codex must actually ask and receive the reviewer response');
  const child = c.s.tasks[task.asks[0].childId];
  assert.ok(child.log.some((l) => l.kind === 'skill')); assert.ok(task.log.some((l) => l.kind === 'skill'));
  console.log('PASS: real Codex lead and reviewer on one laptop loaded the same upstream skill and exchanged a real answer.');
  console.log(task.result.summary);
} finally { await host.stop(); await c.close(); }
