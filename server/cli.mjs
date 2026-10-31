// Run a coordinator without the desktop app: on an always-on machine, or hosted on a server.
//   node server/cli.mjs init --space "Build studio" --kind build --name Divik [--data ./larp-data]
//   node server/cli.mjs serve [--port 47821] [--lan] [--data ./larp-data]
// Hosted (Render, Fly, Railway, a VPS): PORT is set by the platform, the server listens on all
// interfaces, and a fresh server prints a one-time setup code. Join it from the desktop app with
// the server's https:// address and that code to become the owner of its first space.
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Coordinator } from './coordinator.mjs';
import { loadEnv } from './meko.mjs';
import { connectFromEnv } from './db.mjs';

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const next = rest[i + 1];
  flags[rest[i].slice(2)] = next && !next.startsWith('--') ? (i++, next) : true;
}
await loadEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
const dataDir = path.resolve(flags.data || process.env.LARP_DATA_DIR || 'larp-data');
const db = await connectFromEnv();
const coordinator = new Coordinator({ dataDir, db });
await coordinator.init();

if (command === 'init') {
  const { person, space, token } = coordinator.createSpaceWithOwner({ spaceName: flags.space || 'Build studio', kind: flags.kind || 'build', ownerName: flags.name || 'Owner' });
  await coordinator.store.flush();
  console.log(`Created ${space.name} for ${person.name}.`);
  console.log(`Owner token (keep it secret; use it to sign in from a browser at the coordinator address):\n${token}`);
  await coordinator.close();
} else if (command === 'serve') {
  const hosted = Boolean(process.env.PORT);
  const port = Number(flags.port || process.env.PORT || 47821);
  const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const urls = await coordinator.listen({ port, host: flags.lan || hosted ? '0.0.0.0' : '127.0.0.1', staticDir });
  console.log(`Larp coordinator listening on ${urls.join(', ')}`);
  console.log(`Storage: ${db ? `YugabyteDB at ${db.label}` : `local files in ${dataDir}${hosted ? ' (set YUGABYTE_URL, or attach a disk, or a restart loses everything)' : ''}`}`);
  console.log(`Agent memory: ${coordinator.memory.configured ? `Meko (${coordinator.memory.on ? 'on' : 'off'})` : 'off (set MEKO_API_KEY to turn it on)'}`);
  if (!Object.keys(coordinator.s.spaces).length) {
    coordinator.setupCode = (process.env.LARP_SETUP_CODE || crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8)).toUpperCase();
    console.log(`\nNo space yet. In the Larp desktop app choose "Join a space", enter this server's address and the setup code ${coordinator.setupCode}`);
    console.log('The first person to use it owns the first space; the code then stops working.\n');
  }
  const stop = async () => { await coordinator.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  console.log('Usage: node server/cli.mjs init|serve [--space name] [--kind build|home] [--name you] [--port 47821] [--lan] [--data dir]');
  process.exit(1);
}
