// Larp Cloud end to end, offline: the site's API handlers (site/api) run against a stand-in Meko and a
// Postgres-wire database, and two coordinators use them with no keys of their own.
//   node test/cloud.mjs
// Checks: teams can't see each other's memories (even promoted ones), the libraries are read-only,
// tokens are checked, the coordinator stores in the cloud database, and /api/live shows counts only.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { startFakeMeko } from './fake-meko.mjs';

const ok = (cond, label) => { if (!cond) { console.error(`  ✗ ${label}`); process.exitCode = 1; throw new Error(label); } console.log(`  ✓ ${label}`); };
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-cloud-'));

const fake = await startFakeMeko();
for (const name of ['team', 'skills', 'apps']) fake.packs.set(`dp_${name}`, { id: `dp_${name}`, name: `cloud-${name}` });
fake.documents.push({ id: 'doc1', datapack_id: 'dp_skills', document_id: 'd1', text: 'skill: write tests first with node test runner' });
const pg = await PGlite.create();
const pgServer = new PGLiteSocketServer({ db: pg, port: 55434, host: '127.0.0.1' });
await pgServer.start();

Object.assign(process.env, {
  LARP_CLOUD_MEKO_KEY: fake.token, MEKO_URL: fake.url, LARP_CLOUD_SECRET: 'test-secret',
  LARP_CLOUD_TEAM_PACK: 'dp_team', LARP_CLOUD_SKILLS_PACK: 'dp_skills', LARP_CLOUD_APPS_PACK: 'dp_apps',
  LARP_CLOUD_DB_URL: 'postgresql://postgres@127.0.0.1:55434/postgres?sslmode=disable', YUGABYTE_POOL: '1',
});

// The site's handlers behind a tiny server shaped like Vercel's (parsed JSON body, res.status().json()).
const handlers = {};
for (const name of ['join', 'meko', 'db', 'live']) handlers[name] = (await import(`../site/api/${name}.js`)).default;
const api = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  req.body = raw ? JSON.parse(raw) : {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  const handler = handlers[new URL(req.url, 'http://x').pathname.replace(/^\/api\//, '')];
  if (!handler) return res.status(404).json({ error: 'no route' });
  await handler(req, res);
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));
process.env.LARP_CLOUD = `http://127.0.0.1:${api.address().port}`;
delete process.env.MEKO_API_KEY; // the coordinators have no key of their own: only the "cloud" does
const cloudKey = fake.token;

const { Meko } = await import('../server/meko.mjs');
const { CloudStore, cloudCredentials } = await import('../server/cloud.mjs');
const { Coordinator } = await import('../server/coordinator.mjs');

try {
  ok(await fs.readFile('server/db.mjs', 'utf8') === await fs.readFile('site/api/_lib/db.mjs', 'utf8'), 'site/api/_lib/db.mjs matches server/db.mjs (copy it after changing the store)');
  console.log('Meko through Larp Cloud');
  const dirA = path.join(root, 'a'); const dirB = path.join(root, 'b');
  const a = new Meko({ cloudDir: dirA, team: 'cloud' });
  const b = new Meko({ cloudDir: dirB, team: 'cloud' });
  ok(a.configured && a.via === 'cloud', 'a coordinator with no key has memory through Larp Cloud');
  const credsA = await cloudCredentials(dirA);
  const credsB = await cloudCredentials(dirB);
  ok(credsA.team !== credsB.team && /^tm[0-9a-f]{12}$/.test(credsA.team), 'each coordinator joins as its own team');
  ok(JSON.parse(await fs.readFile(path.join(dirA, 'cloud.json'), 'utf8')).token === credsA.token, 'the team token is kept in cloud.json');

  const added = await a.remember({ agent: 'Sol', key: 'agent-sol-1111', datapack: 'team', text: 'Sharma family budget uses the Kosh savings jar for trips' });
  ok(added.id, 'team A writes a memory');
  const stored = fake.memories.get(added.id);
  ok(stored.agent_id === `${credsA.team}~agent-sol-1111`, 'Meko stores it under the team-scoped agent_id');
  ok(fake.packs.size === 3, 'no datapack was created');

  const hitsA = await a.recall({ agent: 'Sol', key: 'agent-sol-1111', datapack: 'team', query: 'Sharma budget savings jar' });
  ok(hitsA.length === 1, 'team A recalls its memory');
  const hitsB = await b.recall({ agent: 'Sol', key: 'agent-sol-1111', datapack: 'team', query: 'Sharma budget savings jar' });
  ok(hitsB.length === 0, "team B, with an agent of the same name, doesn't see it");

  await a.promote({ agent: 'Sol', key: 'agent-sol-1111', datapack: 'team', memoryIds: [added.id] });
  const sharedA = await a.search({ agent: 'Sol', key: 'space-home-2222', datapack: 'team', query: 'Sharma budget savings jar', source: 'auto' });
  const sharedB = await b.search({ agent: 'Sol', key: 'space-home-2222', datapack: 'team', query: 'Sharma budget savings jar', source: 'auto' });
  ok(sharedA.items.length === 1 && sharedA.items[0].writer === 'agent-sol-1111', 'team A sees its promoted lesson, with its own names');
  ok(sharedB.items.length === 0, "team B doesn't see team A's promoted lesson");

  const skills = await a.knowledge({ agent: 'Sol', datapack: 'skills', query: 'write tests first' });
  ok(skills.length === 1, 'both teams read the skills library');
  await a.remember({ agent: 'Sol', datapack: 'skills', text: 'graffiti' }).then(() => ok(false, 'library write refused'), (e) => ok(/read-only/.test(e.message), 'the skills library is read-only'));
  await a.call('memory_delete_all', { datapack_id: 'dp_team' }).then(() => ok(false, 'tool refused'), (e) => ok(/doesn't allow/.test(e.message), 'tools outside the list are refused'));
  const forged = await fetch(`${process.env.LARP_CLOUD}/api/meko`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credsB.team}.${credsA.token.split('.')[1]}` }, body: JSON.stringify({ tool: 'memory_search', args: {} }) });
  ok(forged.status === 401, 'a forged team token is refused');

  console.log('YugabyteDB through Larp Cloud');
  const store = await CloudStore.connect(dirA);
  ok(/Larp Cloud/.test(store.label), `store attaches (${store.label})`);
  await store.saveState({ version: 7, people: {}, note: 'state A' });
  await store.appendEvent({ id: 'evt_a1', at: new Date().toISOString(), type: 'task.created', text: 'secret task text', spaceId: 'spc_1' });
  await store.logCall({ id: 'call_a1', at: new Date().toISOString(), tool: 'context_search', kind: 'recall', agent: 'Sol', summary: 'secret query', ok: true, skipped: false, ms: 120, spaceId: 'spc_1' });
  await store.close();
  ok((await store.loadState())?.note === 'state A', 'the team reads its state back');
  ok((await (await CloudStore.connect(dirB)).loadState()) === null, "another team doesn't get it");
  const rows = (await pg.query("select team_id, count(*)::int n from larp_events group by team_id")).rows;
  ok(rows.length === 1 && rows[0].team_id === credsA.team && rows[0].n === 1, 'events are stored with the team id');
  const stats = await store.stats(['spc_1']);
  ok(stats.total === 1 && stats.byKind.recall === 1, 'stats count the team\'s calls');

  console.log('A coordinator with no keys');
  const coordinator = new Coordinator({ dataDir: path.join(root, 'coord') });
  await coordinator.init();
  ok(coordinator.memory.configured && coordinator.memory.on, 'agent memory is on out of the box');
  for (let i = 0; i < 40 && !coordinator.db; i++) await new Promise((r) => setTimeout(r, 100));
  ok(coordinator.db && /Larp Cloud/.test(coordinator.db.label), 'it attaches the cloud database in the background');
  await coordinator.close();
  const states = (await pg.query("select count(*)::int n from larp_state where id like 'tm%'")).rows[0].n;
  ok(states === 2, 'its state reached the database');

  console.log('Live page');
  const live = await (await fetch(`${process.env.LARP_CLOUD}/api/live`)).json();
  ok(live.calls >= 1 && live.teams === 2 && Array.isArray(live.recent), `counts: ${live.calls} calls, ${live.teams} teams, ${live.events} events`);
  ok(!JSON.stringify(live).includes('secret'), 'no task or memory text is shown');
  ok(!fake.calls.some((c) => JSON.stringify(c.args).includes(cloudKey)), 'the Meko key never travels in tool arguments');
  console.log('\nLarp Cloud checks passed.');
} finally {
  api.close();
  await pgServer.stop();
  await pg.close();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
