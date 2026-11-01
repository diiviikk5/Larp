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
ALTER TABLE larp_events ADD COLUMN IF NOT EXISTS team_id text;
ALTER TABLE larp_meko_calls ADD COLUMN IF NOT EXISTS team_id text;
CREATE INDEX IF NOT EXISTS larp_meko_calls_team ON larp_meko_calls (team_id, at DESC);
`;

export class Yugabyte {
  /**
   * `team` keeps several Larps apart in one database (Larp Cloud serves everyone from one cluster):
   * the team's state is its own row and its events and Meko calls are tagged with it.
   * A coordinator with its own database leaves it unset (state row 'coordinator').
   */
  constructor(url, { team = null } = {}) {
    this.team = team;
    // Some networks drop many new connections to port 5433 but keep established ones: so connections
    // stay open (keep-alive, never closed for being idle), each attempt gives up quickly, and work retries.
    const options = { connectionString: url, max: Number(process.env.YUGABYTE_POOL) || 3, connectionTimeoutMillis: 6000, idleTimeoutMillis: 0, keepAlive: true };
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

  static async connect(url, attempts = 5, options = {}) {
    const db = new Yugabyte(url, options);
    try {
      await db.query(SCHEMA, [], attempts);
      const { rows } = await db.query('select version()', [], attempts);
      db.version = rows[0].version;
      return db;
    } catch (error) {
      await db.pool.end().catch(() => {});
      throw error;
    }
  }

  /** A query, retried when the connection (not the SQL) fails. */
  async query(sql, params = [], attempts = 3) {
    for (let i = 1; ; i++) {
      try {
        return await this.pool.query(sql, params);
      } catch (error) {
        const network = /timeout|terminated|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket|Connection/i.test(error.message);
        if (!network || i >= attempts) throw error;
        await new Promise((r) => setTimeout(r, 400 * i));
      }
    }
  }

  async close() { await this.pool.end(); }

  /** The same database, seen as another team (shares the connections). */
  as(team) {
    const view = Object.create(this);
    view.team = team;
    return view;
  }

  async loadState() {
    const { rows } = await this.query("select doc from larp_state where id = $1", [this.team || 'coordinator']);
    return rows[0]?.doc || null;
  }

  async saveState(state) {
    await this.query(
      `insert into larp_state (id, version, doc, updated_at) values ($3, $1, $2, now())
       on conflict (id) do update set version = excluded.version, doc = excluded.doc, updated_at = now()`,
      [state.version, state, this.team || 'coordinator'],
    );
  }

  async appendEvent(e) {
    await this.query(
      'insert into larp_events (id, at, space_id, type, actor, task_id, text, team_id) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing',
      [e.id, e.at, e.spaceId || null, e.type, e.actor || null, e.taskId || null, e.text || null, this.team],
    );
  }

  async logCall(c) {
    await this.query(
      `insert into larp_meko_calls (id, at, tool, kind, agent, agent_id, to_agent, to_id, datapack, space_id, task_id, summary, ok, skipped, ms, result_count, error, saved, team_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict (id) do nothing`,
      [c.id, c.at, c.tool, c.kind, c.agent, c.agentId, c.to, c.toId, c.datapack, c.spaceId, c.taskId, String(c.summary || '').slice(0, 240), Boolean(c.ok), Boolean(c.skipped), c.ms ?? null, c.resultCount ?? null, c.error ?? null, c.saved ?? null, this.team],
    );
  }

  /** Full-history counts for the memory view. */
  async stats(spaceIds) {
    const inSpaces = '(space_id is null or space_id = any($1)) and team_id is not distinct from $2::text';
    const team = this.team;
    const [total, byKind, byAgent, days, shared] = await Promise.all([
      this.query(`select count(*)::int n, coalesce(sum(saved), 0)::int saved from larp_meko_calls where not skipped and ${inSpaces}`, [spaceIds, team]),
      this.query(`select kind, count(*)::int n from larp_meko_calls where not skipped and ${inSpaces} group by kind`, [spaceIds, team]),
      this.query(
        `select agent, count(*) filter (where kind = 'recall')::int recalls, count(*) filter (where kind = 'write')::int writes,
                count(*) filter (where to_agent is not null)::int notes_sent, max(at) last_at
         from larp_meko_calls where not skipped and agent is not null and ${inSpaces} group by agent order by count(*) desc limit 12`, [spaceIds, team]),
      this.query(
        `select to_char(date_trunc('day', at), 'YYYY-MM-DD') as day, count(*)::int as n
         from larp_meko_calls where not skipped and at > now() - interval '14 days' and ${inSpaces} group by 1 order by 1`, [spaceIds, team]),
      this.query(
        `select agent, to_agent, count(*)::int n from larp_meko_calls
         where not skipped and to_agent is not null and ${inSpaces} group by agent, to_agent order by n desc limit 20`, [spaceIds, team]),
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
