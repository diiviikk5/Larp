// Larp Cloud: Meko memory and YugabyteDB storage hosted by us, so a fresh install needs no keys.
// The service (site/api on the Larp website) holds the Meko key and the database password. Each
// coordinator joins once and gets its own team token; the service keeps teams apart (their own
// agent_ids in the shared Meko datapack, their own rows in the database).
//   LARP_CLOUD=https://larp-seven.vercel.app   (the installed app uses this by default)
//   LARP_CLOUD=off                              (keep everything on this machine)
// A MEKO_API_KEY or YUGABYTE_URL of your own always wins over Larp Cloud.
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_CLOUD = 'https://larp-seven.vercel.app';

/** The Larp Cloud address, or null when it's off. */
export function cloudUrl() {
  const value = process.env.LARP_CLOUD;
  if (!value || /^(off|0|false|no|none)$/i.test(value)) return null;
  return value.replace(/\/+$/, '');
}

const joining = new Map(); // data dir -> Promise<{ url, team, token }>

/** This coordinator's Larp Cloud team, joining on first use. Kept in <dir>/cloud.json. */
export function cloudCredentials(dir, url = cloudUrl()) {
  const key = `${dir}|${url}`;
  if (!joining.has(key)) {
    joining.set(key, (async () => {
      const file = path.join(dir, 'cloud.json');
      try {
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        if (saved.url === url && saved.token) return saved;
      } catch { /* not joined yet */ }
      const response = await fetch(`${url}/api/join`, { method: 'POST', signal: AbortSignal.timeout(20_000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.token) throw new Error(body.error || `Larp Cloud answered ${response.status}`);
      const creds = { url, team: body.team, token: body.token, joinedAt: new Date().toISOString() };
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
      return creds;
    })().catch((error) => { joining.delete(key); throw error; }));
  }
  return joining.get(key);
}

/** POST to a Larp Cloud endpoint as this team; one retry when the network drops the request. */
export async function cloudPost(dir, endpoint, body, { timeout = 60_000, retry = true } = {}) {
  const { url, token } = await cloudCredentials(dir);
  let response;
  try {
    response = await fetch(`${url}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (retry) return cloudPost(dir, endpoint, body, { timeout, retry: false });
    throw new Error(`Larp Cloud unreachable: ${error.message}`);
  }
  const result = await response.json().catch(() => ({ error: `Larp Cloud answered ${response.status}` }));
  if (!response.ok) {
    if (retry && response.status >= 500) return cloudPost(dir, endpoint, body, { timeout, retry: false });
    throw new Error(result.error || `Larp Cloud answered ${response.status}`);
  }
  return result;
}

/**
 * The coordinator's store in Larp Cloud's YugabyteDB. Same methods as the Yugabyte class, but writes
 * are batched: the latest state, new events and Meko calls go up together every couple of seconds.
 */
export class CloudStore {
  constructor(dir) {
    this.dir = dir;
    this.label = 'Larp Cloud';
    this.queue = { state: null, events: [], calls: [] };
    this.timer = null;
    this.sending = Promise.resolve();
  }

  static async connect(dir) {
    const store = new CloudStore(dir);
    const info = await cloudPost(dir, 'db', { op: 'ping' }, { timeout: 30_000 });
    store.label = `Larp Cloud (${info.database || 'YugabyteDB'})`;
    store.version = info.version || null;
    return store;
  }

  async loadState() {
    return (await cloudPost(this.dir, 'db', { op: 'load' })).state || null;
  }

  saveState(state) { this.queue.state = state; this.schedule(); return Promise.resolve(); }
  appendEvent(event) { this.queue.events.push(event); this.schedule(); return Promise.resolve(); }
  logCall(call) { this.queue.calls.push(call); this.schedule(); return Promise.resolve(); }

  schedule() {
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.send(); }, 2_000);
  }

  send() {
    this.sending = this.sending.then(async () => {
      const batch = this.queue;
      if (!batch.state && !batch.events.length && !batch.calls.length) return;
      this.queue = { state: null, events: [], calls: [] };
      try {
        await cloudPost(this.dir, 'db', { op: 'sync', ...batch });
      } catch (error) {
        // Put it back (newer state wins) and try again shortly; keep the backlog bounded.
        this.queue = {
          state: this.queue.state || batch.state,
          events: [...batch.events, ...this.queue.events].slice(-500),
          calls: [...batch.calls, ...this.queue.calls].slice(-1000),
        };
        console.error('[larp] could not sync with Larp Cloud:', error.message);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = null; this.send(); }, 15_000);
      }
    });
    return this.sending;
  }

  async stats(spaceIds) {
    return (await cloudPost(this.dir, 'db', { op: 'stats', spaceIds })).stats;
  }

  async close() {
    clearTimeout(this.timer);
    await this.send();
    clearTimeout(this.timer); // a failed last send doesn't keep the process alive
    this.timer = null;
  }
}
