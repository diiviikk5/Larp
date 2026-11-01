// Electron main process. Each desktop runs a host (its agents), and the person who
// creates a space also runs the coordinator. The renderer talks to the coordinator
// over HTTP like the phone does; this file only exposes device-local actions.
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const PORT = 47821;
let win;
let config = { mode: null, url: null, lan: false, people: [], activePersonId: null, host: null };
let coordinator = null;
let host = null;
let builtinApps = [];   // servers for the apps shipped inside Larp (Swasthya, Kosh)
const dataDir = () => path.join(app.getPath('userData'), 'larp');
const configFile = () => path.join(dataDir(), 'config.json');
const codexProfileDir = () => path.join(dataDir(), 'codex-profile');
/** The models Codex lists (from its own cache in ~/.codex), with Codex's description of each, for the model picker. */
async function codexModels() {
  try {
    const home = process.env.CODEX_HOME || path.join(require('node:os').homedir(), '.codex');
    const cache = JSON.parse(await fs.readFile(path.join(home, 'models_cache.json'), 'utf8'));
    const list = (cache.models || cache.data || cache).filter((m) => m.slug && m.visibility !== 'hide');
    return { models: list.map((m) => m.slug), modelNotes: Object.fromEntries(list.map((m) => [m.slug, m.description || ''])) };
  } catch { return {}; }
}
// The Codex CLI to run: LARP_CODEX (a full path, for a copy installed elsewhere) or `codex` on the PATH.
const codexBin = () => process.env.LARP_CODEX || 'codex';
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'server', file)).href);

// Everything Larp prints also goes to <data>/larp.log (kept under 1 MB), so a start that went wrong can be read afterwards.
function startLog() {
  const fsSync = require('node:fs');
  const file = path.join(dataDir(), 'larp.log');
  try {
    fsSync.mkdirSync(dataDir(), { recursive: true });
    if (fsSync.existsSync(file) && fsSync.statSync(file).size > 1_000_000) fsSync.renameSync(file, file + '.old');
  } catch { /* logging is best effort */ }
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const line = args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      try { fsSync.appendFileSync(file, `${new Date().toISOString()} ${level} ${line}\n`); } catch { /* ignore */ }
    };
  }
  console.log(`[larp] ${app.getVersion()} starting (${process.argv.slice(1).join(' ') || 'no arguments'})`);
}

/**
 * Bring this device's part of the space up: its coordinator, if it hosts the space, then its agents.
 * Runs at start and again every few seconds until both are up, so one failed start (a port still held
 * by the copy that was just updated, a slow network) never leaves the app stuck.
 */
let bringingUp = null;
let upTimer = null;
function bringUp() {
  bringingUp ||= (async () => {
    try {
      if (config.mode === 'host' && !coordinator) { await startCoordinator(); await saveConfig(); notify(); }
    } catch (error) {
      await coordinator?.close().catch(() => {});
      coordinator = null;
      console.error('[larp] could not start this space:', error.stack || error.message);
    }
    try {
      if (config.host?.token && !host && (config.mode !== 'host' || coordinator)) { await startHost(); notify(); }
    } catch (error) {
      host = null;
      console.error('[larp] could not connect this computer\'s agents:', error.stack || error.message);
    }
    const up = (config.mode !== 'host' || coordinator) && (!config.host?.token || host);
    if (up) { clearInterval(upTimer); upTimer = null; } else if (!upTimer && config.mode) upTimer = setInterval(bringUp, 5000);
    return up;
  })().finally(() => { bringingUp = null; });
  return bringingUp;
}

// Saves run one after another: two at once (the apps connecting while a space is created) would share the .tmp file.
let saving = Promise.resolve();
function saveConfig() {
  saving = saving.catch(() => {}).then(async () => {
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(configFile() + '.tmp', JSON.stringify(config, null, 2));
    await fs.rename(configFile() + '.tmp', configFile());
  });
  return saving;
}

function notify() {
  if (win && !win.isDestroyed()) win.webContents.send('larp:changed');
}

async function startCoordinator() {
  const { Coordinator } = await load('coordinator.mjs');
  // Agent memory (Meko) and YugabyteDB come from Larp Cloud, so an install needs no keys. A .env with
  // your own MEKO_API_KEY / YUGABYTE_URL still wins (a backup, and for running everything yourself).
  const { loadEnv } = await load('meko.mjs');
  const { connectFromEnv } = await load('db.mjs');
  const { DEFAULT_CLOUD } = await load('cloud.mjs');
  await loadEnv(path.join(__dirname, '..', '.env'));
  await loadEnv(path.join(dataDir(), '.env'));
  if (process.env.LARP_CLOUD === undefined && app.isPackaged) process.env.LARP_CLOUD = DEFAULT_CLOUD;
  coordinator = new Coordinator({ dataDir: path.join(dataDir(), 'coordinator'), db: await connectFromEnv() });
  await coordinator.init();
  // Prefer the port this space has always used, then the default, then the next free one,
  // so a second Larp (or anything else) holding a port doesn't stop this one from starting.
  const saved = Number(new URL(config.url || `http://127.0.0.1:${PORT}`).port) || PORT;
  const candidates = [...new Set([saved, PORT, ...Array.from({ length: 10 }, (_, i) => PORT + 1 + i)])];
  // Windows can let two sockets bind the same port, with traffic going to the first one, so
  // check whether anything already answers before claiming a port.
  const answers = (port) => new Promise((resolve) => {
    const socket = require('node:net').connect({ port, host: '127.0.0.1' });
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(400, () => done(false));
  });
  for (const port of candidates) {
    if (await answers(port)) continue;
    try {
      await coordinator.listen({ port, host: config.lan ? '0.0.0.0' : '127.0.0.1', staticDir: path.join(__dirname, '..', 'dist') });
      if (port !== saved) {
        // Phones and teammates use the LAN address, which they'll need to re-enter if the port changed.
        console.warn(`[larp] port ${saved} is busy; hosting on ${port}`);
      }
      config.url = `http://127.0.0.1:${port}`;
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`No free port between ${PORT} and ${PORT + 10}. Close other Larp windows and try again.`);
}

async function startHost() {
  if (!config.host?.token) return;
  const { Host } = await load('host.mjs');
  // Each space this device has joined keeps its own agents (hostDir); the first one uses 'host'.
  host = new Host({ url: config.url, token: config.host.token, dataDir: path.join(dataDir(), config.hostDir || 'host'), onChange: notify, appContext: readApps });
  await host.start();
}

async function postJson(url, route, body, token) {
  const response = await fetch(`${url}/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

/** A space address as typed or pasted: http(s)://host[:port], no path. */
function spaceAddress(url) {
  const base = String(url || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^\s/]+$/.test(base)) throw new Error('Enter the space address, like https://larp.example.com or http://192.168.1.20:47821');
  return base;
}

/** The space this device is in now, as it's saved in "other spaces" when the device moves to another. */
function currentProfile(label) {
  const { mode, url, lan, people, activePersonId, host: h, hostDir } = config;
  return { label: label || (mode === 'host' ? 'My space (this computer)' : url), mode, url, lan, people, activePersonId, host: h, hostDir: hostDir || 'host' };
}

/** Stop this device's agents and, if it hosts a space, that space's coordinator. */
async function leaveCurrent() {
  await host?.stop();
  host = null;
  if (coordinator) { await coordinator.close(); coordinator = null; }
}

// The Codex sign-in running in the background, if any (one at a time: it serves localhost:1455).
let codexLogin = null;
function stopCodexLogin() {
  const entry = codexLogin;
  codexLogin = null;
  if (!entry) return;
  clearTimeout(entry.timer);
  if (entry.done) return;
  if (process.platform === 'win32') require('node:child_process').execFile('taskkill', ['/PID', String(entry.proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else entry.proc.kill();
}

function person(id) {
  const found = config.people.find((p) => p.id === id);
  if (!found) throw new Error('That person is not signed in on this device');
  return found;
}

function view() {
  return {
    mode: config.mode,
    url: config.url,
    lan: config.lan,
    splash: config.splash !== false,
    urls: coordinator ? coordinator.urls() : config.url ? [config.url] : [],
    people: config.people,
    activePersonId: config.activePersonId,
    host: host ? { ...host.status(), name: config.host?.name } : null,
    // Spaces on other computers (or this one's own) this device has been in, to switch back to.
    others: (config.others || []).map((o) => ({ label: o.label, mode: o.mode, url: o.url })),
  };
}

const handlers = {
  config: () => view(),

  async createSpace({ spaceName, kind, name, lan }) {
    if (config.mode) throw new Error('This device is already set up');
    config.lan = Boolean(lan);
    config.url = null;
    await startCoordinator();
    const { person: owner, token } = coordinator.createSpaceWithOwner({ spaceName, kind, ownerName: name });
    const hostName = `${owner.name}'s ${process.platform === 'darwin' ? 'Mac' : 'laptop'}`;
    const { host: h, token: hostToken } = coordinator.registerHost(owner.id, { name: hostName });
    Object.assign(config, { mode: 'host', people: [{ id: owner.id, name: owner.name, token }], activePersonId: owner.id, host: { id: h.id, token: hostToken, name: hostName } });
    await saveConfig();
    await startHost();
    return view();
  },

  async joinSpace({ url, code, name }) {
    if (config.mode) throw new Error('This device is already set up');
    const base = spaceAddress(url);
    const joined = await postJson(base, 'join', { code, name });
    const hostName = `${joined.person.name}'s laptop`;
    const registered = await postJson(base, 'hosts', { name: hostName }, joined.token);
    Object.assign(config, { mode: 'join', url: base, people: [{ id: joined.person.id, name: joined.person.name, token: joined.token }], activePersonId: joined.person.id, host: { id: registered.host.id, token: registered.token, name: hostName } });
    await saveConfig();
    await startHost();
    return view();
  },

  /**
   * Join a space on another computer while this device is already in one. The current space is
   * saved under "other spaces" to switch back to; if this device hosts it, it pauses meanwhile.
   */
  async joinAnother({ url, code, name, label }) {
    const base = spaceAddress(url);
    if (config.mode === 'join' && config.url === base) throw new Error("You're already in that space");
    // Join first, so a wrong code leaves everything as it was.
    const joined = await postJson(base, 'join', { code, name });
    const hostName = `${joined.person.name}'s ${process.platform === 'darwin' ? 'Mac' : 'laptop'}`;
    const registered = await postJson(base, 'hosts', { name: hostName }, joined.token);
    const others = (config.others || []).filter((o) => o.url !== base);
    if (config.mode) others.unshift(currentProfile(label));
    await leaveCurrent();
    Object.assign(config, {
      mode: 'join', url: base, lan: false, others,
      people: [{ id: joined.person.id, name: joined.person.name, token: joined.token }], activePersonId: joined.person.id,
      host: { id: registered.host.id, token: registered.token, name: hostName }, hostDir: `host-${registered.host.id}`,
    });
    await saveConfig();
    await startHost();
    return view();
  },

  /** Go back to a space this device was in before (saving the current one in its place). */
  /** Try again now to bring this device's space and agents up (the "Can't reach the space" screen). */
  async retry() {
    await bringUp();
    return view();
  },

  /** Step out of the current space on this device (it stays saved under other spaces), back to the start screen. */
  async leaveSpace({ label } = {}) {
    const others = [...(config.others || [])];
    if (config.mode) others.unshift(currentProfile(label));
    await leaveCurrent();
    clearInterval(upTimer); upTimer = null;
    Object.assign(config, { mode: null, url: null, lan: false, people: [], activePersonId: null, host: null, hostDir: null, others });
    await saveConfig();
    return view();
  },

  async switchDevice({ index, label }) {
    const others = [...(config.others || [])];
    const [target] = others.splice(Number(index), 1);
    if (!target) throw new Error('That space is no longer saved on this device');
    if (config.mode) others.unshift(currentProfile(label));
    await leaveCurrent();
    Object.assign(config, { ...target, others });
    delete config.label;
    await saveConfig();
    await bringUp();
    return view();
  },

  /** Another person signs in on this same device (a shared family laptop). */
  async addPerson({ code, name }) {
    const joined = await postJson(config.url, 'join', { code, name });
    config.people.push({ id: joined.person.id, name: joined.person.name, token: joined.token });
    config.activePersonId = joined.person.id;
    await saveConfig();
    return view();
  },

  async switchPerson({ id }) {
    person(id);
    config.activePersonId = id;
    await saveConfig();
    return view();
  },

  async addAgent({ personId, codexProfile, ...fields }) {
    if (!host) throw new Error('This device has no host running');
    const owner = person(personId);
    return host.addAgent({ ownerToken: owner.token, ...fields, codexHome: codexProfile ? codexProfileDir() : null });
  },

  async updateAgent({ agentId, patch }) {
    if (!host) throw new Error('This device has no host running');
    const { codexProfile, ...rest } = patch;
    if (codexProfile !== undefined) rest.codexHome = codexProfile ? codexProfileDir() : null;
    return host.updateAgent(agentId, rest);
  },

  /**
   * Larp's own Codex profile: a separate Codex sign-in (for example another ChatGPT plan) kept in Larp's
   * data folder, so the computer's usual Codex login and ~/.codex stay untouched.
   * With own: false it is the computer's usual Codex login instead.
   * action 'status' reports whether it is signed in; 'login' opens a window running `codex login` for it.
   */
  async codexProfile({ action = 'status', own = true } = {}) {
    const { execFile, spawn } = require('node:child_process');
    const dir = own ? codexProfileDir() : null;
    if (dir) await fs.mkdir(dir, { recursive: true });
    const env = dir ? { ...process.env, CODEX_HOME: dir } : process.env;
    const win = process.platform === 'win32';
    const bin = codexBin();
    const command = !dir ? `${bin} login` : win ? `set CODEX_HOME=${dir} && ${bin} login` : `CODEX_HOME='${dir}' ${bin} login`;
    const login = codexLogin && codexLogin.dir === dir ? codexLogin : null;
    if (action === 'login') {
      // Codex's own ChatGPT sign-in runs in the background (no terminal window): it serves the OAuth
      // callback on localhost and opens the ChatGPT sign-in page (Google, Apple, Microsoft or email) in
      // the browser. Larp keeps the link, in case the browser didn't open, and notices when it's done.
      stopCodexLogin();
      const proc = spawn(win ? `"${bin}"` : bin, ['login'], { env, windowsHide: true, shell: win });
      const entry = { proc, dir, url: null, done: false, output: '' };
      codexLogin = entry;
      const read = (data) => {
        entry.output = (entry.output + data).slice(-4000);
        const found = entry.output.match(/https:\/\/auth\.openai\.com\/\S+/);
        if (found && !entry.url) { entry.url = found[0]; notify(); }
      };
      proc.stdout.on('data', read);
      proc.stderr.on('data', read);
      proc.on('error', (error) => { entry.done = true; entry.error = error.message; });
      proc.on('exit', (code) => { entry.done = true; entry.code = code; notify(); });
      entry.timer = setTimeout(() => { if (codexLogin === entry) stopCodexLogin(); }, 10 * 60_000);
      for (let i = 0; i < 50 && !entry.url && !entry.done; i++) await new Promise((r) => setTimeout(r, 200));
      if (!entry.url) {
        const missing = /not recognized|ENOENT|not found/i.test(`${entry.output} ${entry.error || ''}`);
        const why = missing ? 'Codex isn’t installed on this computer' : entry.output.trim().split('\n').pop() || 'Codex didn’t start its sign-in';
        stopCodexLogin();
        return { dir, command, installed: !missing, signedIn: false, pending: false, detail: why };
      }
      return { dir, command, installed: true, signedIn: false, pending: true, url: entry.url, detail: 'Waiting for you to sign in in your browser' };
    }
    if (action === 'open') {
      if (!login?.url || login.done) throw new Error('Start signing in again');
      await shell.openExternal(login.url);
      return { dir, command, installed: true, signedIn: false, pending: true, url: login.url, detail: 'Waiting for you to sign in in your browser' };
    }
    if (action === 'cancel') {
      if (login) stopCodexLogin();
      return { dir, command, installed: true, signedIn: false, pending: false, detail: 'Not signed in' };
    }
    const result = await new Promise((resolve) => {
      execFile(win ? `"${bin}"` : bin, ['login', 'status'], { env, timeout: 8000, windowsHide: true, shell: win }, (error, stdout, stderr) => resolve({ error, out: `${stdout}${stderr}`.trim() }));
    });
    const installed = !/not recognized|ENOENT|not found/i.test(`${result.out} ${result.error?.message || ''}`);
    const signedIn = /logged in/i.test(result.out) && !/not logged in/i.test(result.out);
    if (signedIn && login) stopCodexLogin();
    const pending = Boolean(!signedIn && login && !login.done);
    return { dir, command, installed, signedIn, pending, url: pending ? login.url : null, detail: installed ? result.out.split('\n').find((l) => l.trim()) || 'Not signed in' : 'Codex isn’t installed on this computer' };
  },

  async removeAgent({ agentId }) {
    if (!host) throw new Error('This device has no host running');
    await host.removeAgent(agentId);
    return { ok: true };
  },

  /** Whether a downloaded update is waiting for a restart. */
  async updateStatus() {
    return { version: app.getVersion(), ready: updateReady };
  },

  /** Restart into the downloaded version. Spaces, agents and settings are kept. */
  async installUpdate() {
    if (!updater || !updateReady) throw new Error('No update is ready');
    setImmediate(() => updater.quitAndInstall(true, true));
    return { ok: true };
  },

  /** The shared demo project, in Documents/Larp. Identical on every computer, so agents can share it. */
  async createDemoProject() {
    const { createDemoProject } = await load('demo-project.mjs');
    return createDemoProject(path.join(app.getPath('documents'), 'Larp'));
  },

  async chooseFolder() {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  },

  async setLan({ lan }) {
    if (config.mode !== 'host') throw new Error('Only the device hosting the space can change this');
    config.lan = Boolean(lan);
    await saveConfig();
    await host?.stop();
    await coordinator.close();
    await startCoordinator();
    await startHost();
    return view();
  },

  /** What agent runtimes this computer can run right now, for the Add agent page. */
  async detectRuntimes() {
    const { execFile } = require('node:child_process');
    const os = require('node:os');
    const exec = (cmd, args, shell = false) => new Promise((resolve) => {
      execFile(cmd, args, { timeout: 8000, windowsHide: true, shell }, (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout}${stderr}`.trim() }));
    });
    const reach = async (url) => {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; } catch { return null; }
    };
    const win = process.platform === 'win32';

    const hermesPath = process.env.LARP_HERMES || (win && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'hermes', 'hermes-agent', 'bin', 'hermes.exe') : 'hermes');
    // Every check runs at once so the page fills in quickly.
    const [claude, codexVersion, firstLogin, hermes, ollama, lmstudio] = await Promise.all([
      exec('claude', ['--version']),
      exec(codexBin(), ['--version'], win),
      exec(codexBin(), ['login', 'status'], win),
      exec(hermesPath, ['acp', '--check']),
      reach('http://127.0.0.1:11434/api/tags'),
      reach('http://127.0.0.1:1234/v1/models'),
    ]);
    let claudeNote = null;
    try {
      const settings = JSON.parse(await fs.readFile(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
      if (settings.env?.ANTHROPIC_BASE_URL) claudeNote = 'Uses a custom endpoint from ~/.claude/settings.json; that provider’s account is billed.';
    } catch { /* no settings file */ }

    let codexLogin = firstLogin;
    let codexNote = null;
    if (/service_tier|unknown variant `default`/.test(codexLogin.out)) {
      codexNote = 'Your ~/.codex/config.toml has service_tier = "default", which this Codex rejects. Larp works around it per task; removing that line fixes it for good.';
      codexLogin = await exec(codexBin(), ['-c', 'service_tier="fast"', 'login', 'status'], win);
    }

    return {
      claude: { installed: claude.ok, detail: claude.ok ? claude.out.split('\n')[0] : 'Not found', note: claudeNote },
      codex: {
        installed: codexVersion.ok,
        detail: codexVersion.ok ? `${codexVersion.out.split('\n').pop()} · ${/logged in/i.test(codexLogin.out) ? codexLogin.out.split('\n').pop() : 'not signed in'}` : 'Not found',
        note: codexNote,
        ...(await codexModels()),
      },
      hermes: { installed: hermes.ok, detail: hermes.ok ? 'ACP ready' : 'Not found' },
      openai: {
        installed: Boolean(ollama || lmstudio),
        detail: ollama ? `Ollama running · ${(ollama.models || []).length} models` : lmstudio ? 'LM Studio running' : 'No local server found (Ollama or LM Studio); an API key works too',
        endpoint: ollama ? 'http://127.0.0.1:11434/v1' : lmstudio ? 'http://127.0.0.1:1234/v1' : null,
        models: ollama ? (ollama.models || []).map((m) => m.name) : lmstudio ? (lmstudio.data || []).map((m) => m.id) : [],
      },
      scripted: { installed: true, detail: 'Built in' },
    };
  },

  async setSplash({ enabled }) {
    config.splash = Boolean(enabled);
    await saveConfig();
    return view();
  },

  async setTitleBar({ color, symbol }) {
    const valid = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
    if (win && process.platform !== 'darwin' && valid(color) && valid(symbol)) win.setTitleBarOverlay({ color, symbolColor: symbol, height: 52 });
    return { ok: true };
  },

  async openExternal({ url }) {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url);
    return { ok: true };
  },

  // ---------- connected apps (Swasthya, Kosh): their data stays on this computer ----------

  /** Known apps, whether they answer on this computer, and whether this device is connected. */
  async appsList() {
    config.apps ||= {};
    return Promise.all(KNOWN_APPS.map(async (a) => {
      const saved = config.apps[a.id];
      const url = saved?.url || (await findApp(a)) || null;
      const running = url ? await answers(`${url}/api/health`) : false;
      return { id: a.id, name: a.name, kind: a.kind, url, running, connected: Boolean(saved?.token), connectedAt: saved?.connectedAt || null };
    }));
  },

  /** Connect to an app running on this computer: it hands its token to local callers. */
  async appsConnect({ id, url }) {
    const known = KNOWN_APPS.find((a) => a.id === id);
    if (!known) throw new Error('Unknown app');
    const base = String(url || (await findApp(known)) || '').replace(/\/$/, '');
    if (!base) throw new Error(`${known.name} isn't running on this computer. Start it, then connect.`);
    if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error('Only apps on this computer can be connected');
    const { token } = await getJson(`${base}/api/session`);
    await getJson(`${base}/api/summary`, token);   // proves the token works
    config.apps ||= {};
    config.apps[id] = { url: base, token, connectedAt: new Date().toISOString() };
    await saveConfig();
    return handlers.appsList();
  },

  async appsDisconnect({ id }) {
    if (config.apps) delete config.apps[id];
    await saveConfig();
    return handlers.appsList();
  },

  /** Call a connected app's API from the main process (no CORS, token never reaches the page). */
  async appsCall({ id, method = 'GET', path: route, body }) {
    const app = config.apps?.[id];
    if (!app) throw new Error('That app is not connected');
    if (!/^[\w\-/?=&.%]+$/.test(route) || route.includes('..')) throw new Error('Bad path');
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Bad method');
    const response = await fetch(`${app.url}/api/${route}`, {
      method, headers: { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `${id} returned ${response.status}`);
    return data;
  },
};

/**
 * What an agent may read from its owner's connected apps: a compact summary of each, fetched on this
 * computer just before the agent runs. Apps that aren't connected or running are skipped.
 */
async function readApps() {
  const reads = { swasthya: ['summary', 'appointments'], kosh: ['summary', 'goals'] };
  const out = [];
  for (const app of KNOWN_APPS) {
    if (!config.apps?.[app.id]) continue;
    const parts = [];
    for (const route of reads[app.id] || ['summary']) {
      try { parts.push(`${route}: ${JSON.stringify(await handlers.appsCall({ id: app.id, path: route }))}`); } catch { /* not running right now */ }
    }
    if (parts.length) out.push({ name: app.name, kind: app.kind, text: parts.join('\n').slice(0, 6000) });
  }
  return out;
}

// ---------- updates ----------
// Installed copies check the website for a newer Larp at start and every 4 hours, download it in the
// background, and offer a restart. LARP_UPDATE_URL points the check somewhere else (for testing).
let updateReady = null;
let updater = null;
function startUpdates() {
  if (!app.isPackaged && !process.env.LARP_UPDATE_URL) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (error) {
    console.error('[larp] updates unavailable:', error.message);
    return;
  }
  if (process.env.LARP_UPDATE_URL) {
    updater.setFeedURL({ provider: 'generic', url: process.env.LARP_UPDATE_URL });
    updater.forceDevUpdateConfig = !app.isPackaged;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', (info) => console.log(`[larp] update ${info.version} found; downloading`));
  updater.on('update-downloaded', (info) => {
    updateReady = info.version;
    if (win && !win.isDestroyed()) win.webContents.send('larp:update', { version: info.version });
  });
  updater.on('error', (error) => console.error('[larp] update check:', error.message));
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 3600_000);
}

/** Start Swasthya and Kosh from inside Larp (unless already running), then connect any not yet connected. */
async function startApps() {
  const { startBuiltinApps } = await load('builtin-apps.mjs');
  builtinApps = await startBuiltinApps({ appsDir: path.join(__dirname, '..', 'apps'), dataDir: path.join(dataDir(), 'apps') });
  for (const app of await handlers.appsList()) {
    if (app.running && !app.connected) await handlers.appsConnect({ id: app.id }).catch((error) => console.error(`[larp] connect ${app.id}:`, error.message));
  }
  notify();
}

// Apps Larp knows how to connect to, and where they usually run (dev server first, then `npm start`).
const APP_PORT_OFFSET = Number(process.env.LARP_APPS_PORT_OFFSET) || 0;
const KNOWN_APPS = [
  { id: 'swasthya', name: 'Swasthya', kind: 'Family health', ports: [5190, 5191].map((p) => p + APP_PORT_OFFSET) },
  { id: 'kosh', name: 'Kosh', kind: 'Family finance', ports: [5200, 5201].map((p) => p + APP_PORT_OFFSET) },
];
async function answers(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(900) }); return r.ok; } catch { return false; }
}
async function findApp(app) {
  for (const port of app.ports) {
    for (const hostName of ['127.0.0.1', 'localhost']) {
      const base = `http://${hostName}:${port}`;
      try {
        const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(900) });
        const d = await r.json();
        if (d.app === app.id) return base;
      } catch { /* not here */ }
    }
  }
  return null;
}
async function getJson(url, token) {
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(5000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

for (const [name, handler] of Object.entries(handlers)) {
  ipcMain.handle(`larp:${name}`, async (_event, args) => {
    try {
      return await handler(args || {});
    } catch (error) {
      console.error(`[larp] ${name} failed:`, error.stack || error);
      throw error;
    }
  });
}

app.setName('Larp');
// A separate data folder lets several Larp instances run on one machine (testing, demos).
if (process.env.LARP_DATA_DIR) app.setPath('userData', path.resolve(process.env.LARP_DATA_DIR));
Menu.setApplicationMenu(null);

/**
 * The startup splash: a small centered card where the Larp mark assembles while services start.
 * It closes once the app window is ready.
 */
function openSplash() {
  if (config.splash === false || process.env.LARP_NO_SPLASH) return null;
  const { workArea } = screen.getPrimaryDisplay();
  const width = 380;
  const height = 320;
  const splash = new BrowserWindow({
    width, height, x: Math.round(workArea.x + (workArea.width - width) / 2), y: Math.round(workArea.y + (workArea.height - height) / 2), frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.showInactive());
  return splash;
}

function waitForTitle(window, title, timeout) {
  return new Promise((resolve) => {
    if (!window || window.isDestroyed()) return resolve();
    const timer = setTimeout(resolve, timeout);
    window.on('page-title-updated', (_e, t) => { if (t === title) { clearTimeout(timer); resolve(); } });
  });
}

app.whenReady().then(async () => {
  startLog();
  try {
    config = { ...config, ...JSON.parse(await fs.readFile(configFile(), 'utf8')) };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[larp] could not read config:', error.message);
  }
  const splash = openSplash();
  const animationDone = waitForTitle(splash, 'ready', 7000);
  const setStatus = (text) => splash && !splash.isDestroyed() && splash.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)})`).catch(() => {});

  try {
    // Settings in .env (the Codex to run, Meko, YugabyteDB) apply to every computer, hosting or joined.
    const { loadEnv } = await load('meko.mjs');
    await loadEnv(path.join(__dirname, '..', '.env'));
    await loadEnv(path.join(dataDir(), '.env'));
    setStatus(config.mode === 'host' ? 'starting your space' : config.host ? 'connecting your agents' : 'getting ready');
    await bringUp();
  } catch (error) {
    console.error('[larp] startup failed:', error.stack || error.message);
  }
  // The family apps that ship with Larp start in the background and connect themselves.
  startApps().catch((error) => console.error('[larp] apps:', error.message));

  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 960, minHeight: 620, show: false,
    backgroundColor: '#0f0f0f', title: 'Larp',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0f0f0f', symbolColor: '#a3a3a3', height: 52 },
    icon: path.join(__dirname, '..', 'public', 'larp-icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  const windowReady = new Promise((resolve) => win.once('ready-to-show', resolve));
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  startUpdates();
  globalShortcut.register('CommandOrControl+Shift+Space', () => { win.show(); win.focus(); });

  await Promise.all([windowReady, animationDone]);
  win.show();
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript('closeSplash()').catch(() => {});
    await waitForTitle(splash, 'closed', 1500);
    if (!splash.isDestroyed()) splash.destroy();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  stopCodexLogin();
  globalShortcut.unregisterAll();
  for (const server of builtinApps) server.close();
  host?.stop();
  coordinator?.close();
});
