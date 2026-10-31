// Optional YugabyteDB storage for the coordinator (YSQL, Postgres-compatible).
// Holds the state snapshot, the full event history and every Meko call, so history
// survives the machine and the memory view can answer questions with SQL.
//   YUGABYTE_URL=postgresql://admin:<password>@<host>.aws.yugabyte.cloud:5433/yugabyte
//   YUGABYTE_CA=path/to/root.crt   (Aeon only: the CA certificate it lets you download)
import fs from 'node:fs';
import pg from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS larp_state (
  id text PRIMARY KEY,
  version bigint NOT NULL,
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS larp_events (
  id text PRIMARY KEY,
  at timestamptz NOT NULL,
  space_id text,
  type text NOT NULL,
  actor text,
  task_id text,
  text text
);
CREATE INDEX IF NOT EXISTS larp_events_space_at ON larp_events (space_id, at DESC);
CREATE TABLE IF NOT EXISTS larp_meko_calls (
  id text PRIMARY KEY,
  at timestamptz NOT NULL,
  tool text NOT NULL,
  kind text NOT NULL,
  agent text,
  agent_id text,
  to_agent text,
  to_id text,
  datapack text,
  space_id text,
  task_id text,
  summary text,
  ok boolean NOT NULL,
  skipped boolean NOT NULL,
  ms integer,
  result_count integer,
  error text
);
CREATE INDEX IF NOT EXISTS larp_meko_calls_space_at ON larp_meko_calls (space_id, at DESC);
ALTER TABLE larp_meko_calls ADD COLUMN IF NOT EXISTS saved integer;
`;

export class Yugabyte {
  constructor(url) {
    const options = { connectionString: url, max: Number(process.env.YUGABYTE_POOL) || 4 };
    // YugabyteDB Aeon serves TLS signed by its own CA: YUGABYTE_CA points to the root.crt it gives you.
    // On a hosted server there is no file to point at, so the certificate can come as text instead.
    // Pasted into a one-line env field, its line breaks may arrive as literal "\n".
    const ca = process.env.YUGABYTE_CA_PEM?.replace(/\\n/g, '\n') || (process.env.YUGABYTE_CA && fs.readFileSync(process.env.YUGABYTE_CA, 'utf8'));
    if (ca) {
      const clean = new URL(url);
      for (const key of ['sslmode', 'sslrootcert', 'ssl']) clean.searchParams.delete(key);
      options.connectionString = clean.toString();
      options.ssl = { ca, rejectUnauthorized: true };
    }
    this.pool = new pg.Pool(options);
    this.pool.on('error', (error) => console.error('[larp db]', error.message));
    this.label = new URL(url).host;
  }

  static async connect(url) {
    const db = new Yugabyte(url);
    await db.pool.query(SCHEMA);
    const { rows } = await db.pool.query('select version()');
    db.version = rows[0].version;
    return db;
  }

  async close() { await this.pool.end(); }

  async loadState() {
    const { rows } = await this.pool.query("select doc from larp_state where id = 'coordinator'");
    return rows[0]?.doc || null;
  }

  async saveState(state) {
    await this.pool.query(
      `insert into larp_state (id, version, doc, updated_at) values ('coordinator', $1, $2, now())
       on conflict (id) do update set version = excluded.version, doc = excluded.doc, updated_at = now()`,
      [state.version, state],
    );
  }

  async appendEvent(e) {
    await this.pool.query(
      'insert into larp_events (id, at, space_id, type, actor, task_id, text) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing',
      [e.id, e.at, e.spaceId || null, e.type, e.actor || null, e.taskId || null, e.text || null],
    );
  }

  async logCall(c) {
    await this.pool.query(
      `insert into larp_meko_calls (id, at, tool, kind, agent, agent_id, to_agent, to_id, datapack, space_id, task_id, summary, ok, skipped, ms, result_count, error, saved)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) on conflict (id) do nothing`,
      [c.id, c.at, c.tool, c.kind, c.agent, c.agentId, c.to, c.toId, c.datapack, c.spaceId, c.taskId, c.summary, c.ok, c.skipped, c.ms, c.resultCount, c.error, c.saved ?? null],
    );
  }

  /** Full-history counts for the memory view. */
  async stats(spaceIds) {
    const inSpaces = '(space_id is null or space_id = any($1))';
    const [total, byKind, byAgent, days, shared] = await Promise.all([
      this.pool.query(`select count(*)::int n, coalesce(sum(saved), 0)::int saved from larp_meko_calls where not skipped and ${inSpaces}`, [spaceIds]),
      this.pool.query(`select kind, count(*)::int n from larp_meko_calls where not skipped and ${inSpaces} group by kind`, [spaceIds]),
      this.pool.query(
        `select agent, count(*) filter (where kind = 'recall')::int recalls, count(*) filter (where kind = 'write')::int writes,
                count(*) filter (where to_agent is not null)::int notes_sent, max(at) last_at
         from larp_meko_calls where not skipped and agent is not null and ${inSpaces} group by agent order by count(*) desc limit 12`, [spaceIds]),
      this.pool.query(
        `select to_char(date_trunc('day', at), 'YYYY-MM-DD') as day, count(*)::int as n
         from larp_meko_calls where not skipped and at > now() - interval '14 days' and ${inSpaces} group by 1 order by 1`, [spaceIds]),
      this.pool.query(
        `select agent, to_agent, count(*)::int n from larp_meko_calls
         where not skipped and to_agent is not null and ${inSpaces} group by agent, to_agent order by n desc limit 20`, [spaceIds]),
    ]);
    return {
      total: total.rows[0].n,
      saved: total.rows[0].saved,
      byKind: Object.fromEntries(byKind.rows.map((r) => [r.kind, r.n])),
      byAgent: byAgent.rows,
      days: days.rows,
      links: shared.rows,
      database: this.label,
    };
  }
}

/** Connect when YUGABYTE_URL is set; otherwise Larp keeps everything in local files. */
export async function connectFromEnv() {
  const url = process.env.YUGABYTE_URL;
  if (!url) return null;
  try {
    return await Yugabyte.connect(url);
  } catch (error) {
    console.error(`[larp] could not reach YugabyteDB at ${url.replace(/\/\/[^@]*@/, '//***@')}: ${error.message}. Using local files.`);
    return null;
  }
}
