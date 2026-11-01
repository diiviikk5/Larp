// GET /api/live: what every Larp's memory is doing, for the website's live page. Counts only:
// no memory text, task text, names or team ids ever leave the database here.
import { handle, database, cloudLabel } from './_lib/cloud.mjs';

export default handle(async (req, res) => {
  const db = await database();
  const q = (sql) => db.query(sql).then((r) => r.rows);
  const cloud = "team_id like 'tm%'";
  const [[totals], kinds, days, recent, [teams], [events]] = await Promise.all([
    q(`select count(*)::int calls, count(*) filter (where ok)::int ok, coalesce(sum(saved),0)::int saved,
              coalesce(round(avg(ms)),0)::int avg_ms, max(at) last_at from larp_meko_calls where not skipped and ${cloud}`),
    q(`select kind, count(*)::int n from larp_meko_calls where not skipped and ${cloud} group by kind order by n desc`),
    q(`select to_char(date_trunc('day', at), 'YYYY-MM-DD') as day, count(*)::int as n from larp_meko_calls
       where not skipped and ${cloud} and at > now() - interval '14 days' group by 1 order by 1`),
    q(`select at, tool, kind, ok, ms, result_count from larp_meko_calls where not skipped and ${cloud} order by at desc limit 30`),
    q(`select count(*)::int n from larp_state where id like 'tm%'`),
    q(`select count(*)::int n from larp_events where ${cloud}`),
  ]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  return { database: cloudLabel(), teams: teams.n, events: events.n, ...totals, kinds, days, recent, at: new Date().toISOString() };
});
