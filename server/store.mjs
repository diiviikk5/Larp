// Persistent coordinator state: a JSON snapshot plus an append-only event log, in local files
// and, when connected, in YugabyteDB (server/db.mjs), which then is the source of truth.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
export const newSecret = () => crypto.randomBytes(24).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function emptyState() {
  return {
    version: 0,
    people: {},      // id -> { id, name, color, createdAt }
    spaces: {},      // id -> { id, name, kind: 'build'|'home', memberIds: [], createdAt }
    tokens: {},      // sha256(token) -> { personId?, hostId?, kind: 'desktop'|'phone'|'host', label, createdAt }
    invites: {},     // code -> { spaceId, createdBy, expiresAt }
    pairCodes: {},   // code -> { personId, expiresAt }
    hosts: {},       // id -> { id, name, ownerId, lastSeen }
    agents: {},      // id -> { id, name, ownerId, hostId, runtime, model, spaceIds, repo, status, pal }
    tasks: {},       // id -> task
    approvals: {},   // id -> approval
    plans: {},       // id -> group plan with scoped queries
    expenses: {},    // id -> expense
    checklists: {},  // id -> care checklist
    lessons: {},     // id -> lesson proposed for space knowledge
    settings: {},    // { meko: boolean }
    mekoCalls: [],   // recent Meko calls, newest last (full history in YugabyteDB when connected)
    events: [],      // recent events, newest last (full history is in events.jsonl)
  };
}

export class Store {
  constructor(dir, db = null) {
    this.dir = dir;
    this.db = db;
    this.state = emptyState();
    this.writing = Promise.resolve();
    this.pendingSave = null;
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    let saved = this.db ? await this.db.loadState() : null;
    // The database copy can be behind this computer's (saves that never reached it): keep the newer one.
    try {
      const local = JSON.parse(await fs.readFile(path.join(this.dir, 'state.json'), 'utf8'));
      if (!saved || (local.version || 0) > (saved.version || 0)) saved = local;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved) this.state = { ...emptyState(), ...saved };
    // Work that was running when the coordinator stopped cannot still be running.
    for (const task of Object.values(this.state.tasks)) {
      if (task.status === 'running') task.status = 'interrupted';
    }
  }

  save() {
    this.state.version += 1;
    if (this.pendingSave) return;
    this.pendingSave = setTimeout(() => {
      this.pendingSave = null;
      const data = JSON.stringify(this.state);
      const file = path.join(this.dir, 'state.json');
      this.writing = this.writing
        .then(async () => {
          await fs.writeFile(file + '.tmp', data);
          await fs.rename(file + '.tmp', file);
          if (this.db) await this.db.saveState(this.state);
        })
        .catch((error) => console.error('[larp] could not save state:', error.message));
    }, 50);
  }

  record(event) {
    const entry = { id: newId('evt'), at: new Date().toISOString(), ...event };
    this.state.events.push(entry);
    if (this.state.events.length > 500) this.state.events.splice(0, this.state.events.length - 500);
    this.writing = this.writing
      .then(async () => {
        await fs.appendFile(path.join(this.dir, 'events.jsonl'), JSON.stringify(entry) + '\n');
        if (this.db) await this.db.appendEvent(entry);
      })
      .catch((error) => console.error('[larp] could not append event:', error.message));
    this.save();
    return entry;
  }

  async flush() {
    // Wait for a save already writing, so two writers never share the .tmp file.
    await this.writing;
    if (this.pendingSave) {
      clearTimeout(this.pendingSave);
      this.pendingSave = null;
      const file = path.join(this.dir, 'state.json');
      await fs.writeFile(file + '.tmp', JSON.stringify(this.state));
      await fs.rename(file + '.tmp', file);
      if (this.db) await this.db.saveState(this.state).catch((error) => console.error('[larp] could not save state to YugabyteDB:', error.message));
    }
    await this.writing;
  }
}
