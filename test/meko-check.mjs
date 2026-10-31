// Checks Larp's live Meko connection without creating anything: connect with the key in .env, find
// the team's skills and apps libraries (<LARP_TEAM>-skills, <LARP_TEAM>-apps) and search each one
// the way an agent does before a task. Datapacks are limited per account, so this never creates one.
//   npm run meko:check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Meko, loadEnv } from '../server/meko.mjs';

await loadEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
if (!process.env.MEKO_API_KEY) {
  console.error('Set MEKO_API_KEY in .env first (a key from Meko Settings > API Keys).');
  process.exit(1);
}
const team = process.env.LARP_TEAM || 'larp';
const calls = [];
const meko = new Meko({ apiKey: process.env.MEKO_API_KEY, team, onCall: (c) => calls.push(c) });
const checks = [
  { pack: 'skills', query: 'Build a scroll-driven landing page with GSAP animations' },
  { pack: 'apps', query: 'Remind the family which bills are due this month and who pays them' },
];
try {
  const tools = (await meko.listTools()).map((t) => t.name);
  console.log(`✓ connected as team "${team}"; ${tools.length} Meko tools`);
  for (const { pack, query } of checks) {
    const id = await meko.find(pack);
    if (!id) { console.log(`- ${meko.name(pack)}: not found (agents will skip this library)`); continue; }
    const hits = await meko.knowledge({ agent: 'check', datapack: pack, query, limit: 2 });
    const top = hits[0];
    console.log(`✓ ${meko.name(pack)}: "${query}" → ${top ? `${top.text.split('\n')[0].replace(/^Section: /, '')} (${top.match}, distance ${top.distance?.toFixed(2)})` : 'no passages'}`);
  }
} catch (error) {
  console.error('✗', error.message);
  process.exitCode = 1;
} finally {
  await meko.close();
  console.log(`\n${calls.length} calls: ${calls.map((c) => `${c.tool}${c.ok ? '' : ' (failed)'}`).join(', ')}`);
}
