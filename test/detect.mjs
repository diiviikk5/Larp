// Prints what Larp detects about agent runtimes on this computer.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-detect-'));
const env = { ...process.env, MEKO_API_KEY: '', LARP_DATA_DIR: dir, LARP_NO_SPLASH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
const page = await app.firstWindow();
const started = Date.now();
const found = await page.evaluate(() => window.larp.detectRuntimes());
console.log(`detected in ${Date.now() - started}ms`);
console.log(JSON.stringify(found, null, 2));
await app.close();
await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
