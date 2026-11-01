import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCAL_APPS = ['citylines', 'eduspace', 'studio'];
export class AppRecords {
  constructor(dir, profiles = {}) { this.dir = dir; this.profiles = profiles; this.queue = Promise.resolve(); }
  file(id, profile = this.profiles[id] || '') {
    if (!LOCAL_APPS.includes(id)) throw new Error('Unknown local app');
    if (profile && (id !== 'citylines' || !['demo', 'personal'].includes(profile))) throw new Error('Unknown app profile');
    return path.join(this.dir, id + (profile ? '-' + profile : '') + '.json');
  }
  async read(id, profile = this.profiles[id] || '') {
    try { return JSON.parse(await fs.readFile(this.file(id, profile), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return { revision: 0, data: null }; }
  }
  change(id, fn, profile = this.profiles[id] || '') {
    const op = this.queue.catch(() => {}).then(async () => {
      const current = await this.read(id, profile); const data = await fn(current);
      if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 1_000_000) throw new Error('Invalid app state');
      const next = { revision: current.revision + 1, data, updatedAt: new Date().toISOString() };
      await fs.mkdir(this.dir, { recursive: true });
      const file = this.file(id, profile);
      await fs.writeFile(file + '.tmp', JSON.stringify(next)); await fs.rename(file + '.tmp', file);
      return next;
    }); this.queue = op; return op;
  }
  sync(id, data, revision, profile = this.profiles[id] || '') {
    return this.change(id, (current) => {
      if (current.revision !== revision) throw new Error('App changed; refresh before saving');
      return data;
    }, profile);
  }
  async call({ id, method = 'GET', path: route = 'state', body }) {
    if (method === 'GET' && ['state', 'summary'].includes(route)) return this.read(id);
    if (route !== 'records' || !['POST', 'PATCH'].includes(method)) throw new Error('Use GET state or POST/PATCH records');
    return this.change(id, ({ data }) => {
      if (!data) throw new Error('Open this app once in Larp to initialize its data');
      const collection = String(body?.collection || '');
      if (!Object.hasOwn(data, collection) || !Array.isArray(data[collection])) throw new Error('Unknown collection; read state first');
      const clean = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A record object is required');
        if (Object.keys(value).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Invalid record field');
        return value;
      };
      if (method === 'POST') data[collection].push({ ...clean(body.record), id: crypto.randomUUID() });
      else {
        const record = data[collection].find((r) => r.id === body.id);
        if (!record) throw new Error('Record not found');
        const patch = { ...clean(body.patch) }; delete patch.id; Object.assign(record, patch);
      }
      return data;
    });
  }
}
