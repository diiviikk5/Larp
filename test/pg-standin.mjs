// Runs the memory test with its storage in a Postgres-wire server (PGlite), to exercise
// server/db.mjs when no YugabyteDB is reachable. YugabyteDB's YSQL speaks the same protocol;
// for the real thing, set YUGABYTE_URL and run `node test/memory.mjs`.
//   node test/pg-standin.mjs
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 55433, host: '127.0.0.1' });
await server.start();
const child = spawn(process.execPath, ['test/memory.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, YUGABYTE_URL: 'postgresql://postgres@127.0.0.1:55433/postgres?sslmode=disable', YUGABYTE_POOL: '1' }, // PGlite takes one connection
});
const code = await new Promise((r) => child.on('exit', r));
const { rows } = await db.query('select kind, count(*)::int n from larp_meko_calls group by kind order by kind');
console.log('\nRows in larp_meko_calls by kind:', rows.map((r) => `${r.kind}=${r.n}`).join(', '));
console.log('Rows in larp_events:', (await db.query('select count(*)::int n from larp_events')).rows[0].n);
await server.stop();
await db.close();
process.exit(code);
