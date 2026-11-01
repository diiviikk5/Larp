// POST /api/db: the team's coordinator state, events and Meko call log in YugabyteDB.
//   { op: 'ping' }                         -> { version, database }
//   { op: 'load' }                         -> { state }
//   { op: 'sync', state?, events?, calls? } -> { ok, events, calls }
//   { op: 'stats', spaceIds }              -> { stats }
import { handle, body, teamOf, database, cloudLabel } from './_lib/cloud.mjs';

export default handle(async (req) => {
  const team = teamOf(req);
  const input = body(req);
  const db = (await database()).as(team);
  switch (input.op) {
    case 'ping':
      return { version: db.version, database: cloudLabel() };
    case 'load':
      return { state: await db.loadState() };
    case 'sync': {
      const events = Array.isArray(input.events) ? input.events.slice(-500) : [];
      const calls = Array.isArray(input.calls) ? input.calls.slice(-1000) : [];
      if (input.state && typeof input.state === 'object') await db.saveState(input.state);
      for (const e of events) if (e?.id && e.at && e.type) await db.appendEvent(e);
      for (const c of calls) if (c?.id && c.at && c.tool) await db.logCall({ ...c, kind: c.kind || 'other' });
      return { ok: true, events: events.length, calls: calls.length };
    }
    case 'stats': {
      const spaceIds = Array.isArray(input.spaceIds) ? input.spaceIds.map(String) : [];
      return { stats: { ...(await db.stats(spaceIds)), database: `Larp Cloud · ${cloudLabel()}` } };
    }
    default:
      throw Object.assign(new Error('Unknown op'), { status: 400 });
  }
});
