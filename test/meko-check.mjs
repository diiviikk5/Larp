// Checks the product's Meko connection end to end: connect, list tools, set up the agents'
// datapacks, write a note, recall it. Reads MEKO_API_KEY and LARP_TEAM from .env.
//   npm run meko:check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Meko, loadEnv } from '../server/meko.mjs';

await loadEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
if (!process.env.MEKO_API_KEY) {
  console.error('Set MEKO_API_KEY in E:\\Commonwork\\.env first (a product key from Meko Settings > API Keys).');
  process.exit(1);
}
const calls = [];
const meko = new Meko({ apiKey: process.env.MEKO_API_KEY, team: process.env.LARP_TEAM || 'larp', onCall: (c) => calls.push(c) });
try {
  const tools = (await meko.listTools()).map((t) => t.name);
  if (process.argv.includes("--schemas")) for (const t of await meko.listTools()) console.log(t.name, JSON.stringify(t.inputSchema?.properties ? Object.keys(t.inputSchema.properties) : t.inputSchema), "required:", t.inputSchema?.required);
  console.log(`✓ connected; ${tools.length} tools: ${tools.slice(0, 8).join(', ')}…`);
  for (const dp of ['desk', 'dispatch', 'technician', 'canon']) console.log(`✓ datapack ${meko.name(dp)} → ${await meko.datapack(dp)}`);
  const marker = `check ${Date.now()}`;
  await meko.remember({ agent: 'electricity', datapack: 'dispatch', to: 'dispatch', text: `Connectivity ${marker}: planned power cut in Hostel B from 18:00 to 22:00.` });
  console.log('✓ wrote a note into dispatch');
  await new Promise((r) => setTimeout(r, 2500));
  const hits = await meko.recall({ agent: 'dispatch', datapack: 'dispatch', query: 'power cut Hostel B' });
  console.log(`✓ recalled ${hits.length}: ${hits.slice(0, 2).map((h) => `${h.text.slice(0, 70)} (score ${h.score})`).join(' | ')}`);
} catch (error) {
  console.error('✗', error.message);
  process.exitCode = 1;
} finally {
  await meko.close();
  console.log(`\n${calls.length} logged calls:`, calls.map((c) => `${c.agent}:${c.tool}${c.ok ? '' : ' (failed)'}`).join(', '));
}
