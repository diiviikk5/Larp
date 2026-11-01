// POST /api/join: a new Larp Cloud team for a coordinator. No sign-up: the token keeps teams apart.
import { handle, body, newTeam, PACKS } from './_lib/cloud.mjs';

export default handle(async (req) => {
  body(req);
  return { ...newTeam(), meko: Boolean(process.env.LARP_CLOUD_MEKO_KEY || process.env.MEKO_API_KEY), db: Boolean(process.env.LARP_CLOUD_DB_URL || process.env.YUGABYTE_URL), datapacks: Object.keys(PACKS) };
});
