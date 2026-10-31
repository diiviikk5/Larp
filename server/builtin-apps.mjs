// The family apps that ship inside Larp (Swasthya for health, Kosh for money). The desktop app starts
// them on this computer, on their usual ports, with their data in Larp's own data folder, so
// "Open in Larp" works on any computer without setting anything up. If a copy is already running
// there (for example a developer's own), Larp leaves it alone and uses that one.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const APPS = [
  { id: 'swasthya', className: 'Swasthya', port: 5191, options: () => ({ geminiKey: process.env.GEMINI_API_KEY, geminiModel: process.env.GEMINI_MODEL }) },
  { id: 'kosh', className: 'Kosh', port: 5201, options: () => ({}) },
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon',
};

// The apps' sample family, varied per computer so two people's agents read different families:
// different names, money scaled up or down, appointments on other days. LARP_SAMPLE_FAMILY=0..3 picks one.
export const FAMILIES = [
  { family: 'Sharma', names: {}, money: 1, days: 0 },
  { family: 'Mehta', names: { Ravi: 'Rohit', Anita: 'Neha', Dadi: 'Nani', Aarav: 'Kabir', Isha: 'Tara' }, money: 0.7, days: 1 },
  { family: 'Iyer', names: { Ravi: 'Karthik', Anita: 'Priya', Dadi: 'Paati', Aarav: 'Advik', Isha: 'Meera' }, money: 1.3, days: 2 },
  { family: 'Khan', names: { Ravi: 'Imran', Anita: 'Sana', Dadi: 'Ammi', Aarav: 'Zaid', Isha: 'Aisha' }, money: 0.85, days: 3 },
];
const MONEY = new Set(['amount', 'balance', 'target', 'allowance']);

function familyFor() {
  const forced = Number(process.env.LARP_SAMPLE_FAMILY);
  if (Number.isInteger(forced) && FAMILIES[forced]) return FAMILIES[forced];
  const seed = `${os.hostname()}|${os.userInfo().username}`;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FAMILIES[h % FAMILIES.length];
}

/** Rename the sample family and shift its money and appointment days. */
export function remix(db, f) {
  if (!f.money || (f.money === 1 && !f.days && !Object.keys(f.names).length)) return db;
  let text = JSON.stringify(db);
  for (const [from, to] of Object.entries({ ...f.names, Sharma: f.family })) text = text.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  const out = JSON.parse(text);
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && MONEY.has(k)) o[k] = Math.round(v * f.money);
      else if (k === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && o.time && o.title) o[k] = new Date(Date.parse(v) + f.days * 86400000).toISOString().slice(0, 10);
      else walk(v);
    }
  };
  walk(out);
  if (out.budgets) for (const k of Object.keys(out.budgets)) out.budgets[k] = Math.round(out.budgets[k] * f.money);
  return out;
}

async function answers(port) {
  try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; }
}

/**
 * Start the shipped apps that aren't already running. appsDir holds apps/<id>/{server/api.mjs, dist};
 * dataDir gets one folder per app. Returns the servers started (close them on quit).
 */
export async function startBuiltinApps({ appsDir, dataDir, log = console.log }) {
  const servers = [];
  // LARP_APPS_PORT_OFFSET moves the apps (for running two copies of Larp on one computer, in tests).
  const offset = Number(process.env.LARP_APPS_PORT_OFFSET) || 0;
  for (const base of APPS) {
    const app = { ...base, port: base.port + offset };
    const dir = path.join(appsDir, app.id);
    try {
      await fs.access(path.join(dir, 'server', 'api.mjs'));
    } catch { continue; } // not shipped in this build
    if (await answers(app.port)) { log(`[larp apps] ${app.className} is already running on port ${app.port}; using it`); continue; }
    try {
      const mod = await import(pathToFileURL(path.join(dir, 'server', 'api.mjs')).href);
      const api = await new mod[app.className]({ dataDir: path.join(dataDir, app.id), ...app.options() }).load();
      // A first start gets the app's sample family, so there is something to look at and to ask agents about.
      if (!api.db?.members?.length && typeof api.loadSample === 'function') {
        await api.loadSample();
        const family = familyFor();
        api.db = remix(api.db, family);
        await api.save();
        log(`[larp apps] ${app.className}: sample ${family.family} family`);
      }
      const dist = path.join(dir, 'dist');
      const server = http.createServer(async (req, res) => {
        try {
          if (await api.handle(req, res)) return;
          const url = new URL(req.url, 'http://localhost');
          let file = path.join(dist, decodeURIComponent(url.pathname));
          if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
          try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(dist, 'index.html'); }
          const body = await fs.readFile(file);
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
          res.end(body);
        } catch {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(app.port, '127.0.0.1', resolve); });
      servers.push(server);
      log(`[larp apps] ${app.className} on http://127.0.0.1:${app.port}`);
    } catch (error) {
      log(`[larp apps] couldn't start ${app.className}: ${error.message}`);
    }
  }
  return servers;
}
