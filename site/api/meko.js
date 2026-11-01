// POST /api/meko { tool, args }: one Meko call for the caller's team (see _lib/cloud.mjs for the rules).
import { handle, body, teamOf, teamMeko } from './_lib/cloud.mjs';

export default handle(async (req) => {
  const team = teamOf(req);
  const { tool, args } = body(req);
  if (typeof tool !== 'string') throw Object.assign(new Error('Which tool?'), { status: 400 });
  return teamMeko(team, tool, args && typeof args === 'object' ? args : {});
});
