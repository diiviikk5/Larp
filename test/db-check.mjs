// Checks the YugabyteDB connection in .env: connects, creates Larp's tables, and shows what's stored.
//   npm run db:check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../server/meko.mjs';
import { Yugabyte } from '../server/db.mjs';

await loadEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
if (!process.env.YUGABYTE_URL) {
  console.error('Set YUGABYTE_URL (and YUGABYTE_CA for Aeon) in E:\\Commonwork\\.env first.');
  process.exit(1);
}
try {
  const db = await Yugabyte.connect(process.env.YUGABYTE_URL);
  console.log(`✓ connected to ${db.label}`);
  console.log(`  ${db.version.split(' on ')[0]}`);
  for (const table of ['larp_state', 'larp_events', 'larp_meko_calls']) {
    const { rows } = await db.pool.query(`select count(*)::int as n from ${table}`);
    console.log(`✓ ${table}: ${rows[0].n} rows`);
  }
  await db.close();
} catch (error) {
  console.error('✗', error.message);
  if (/self.signed|certificate/i.test(error.message)) console.error('  Set YUGABYTE_CA to the root.crt you downloaded from Aeon (Connect → download CA cert).');
  if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(error.message)) console.error('  Add your current IP to the cluster\'s IP allow list in Aeon.');
  if (/password authentication/i.test(error.message)) console.error('  Check the user and password in YUGABYTE_URL.');
  process.exit(1);
}
