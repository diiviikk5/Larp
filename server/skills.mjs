import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { git } from './adapters/process.mjs';

// The website and desktop use the exact same catalog. Installation never runs a catalog shell command.
const catalogFile = fileURLToPath(new URL('../site/src/skills/skills.json', import.meta.url));
export class Skills {
  constructor(dir) { this.dir = dir; this.pending = new Map(); }
  async catalog() { return JSON.parse(await fs.readFile(catalogFile, 'utf8')); }
  async installed(slug) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('Invalid skill');
    return JSON.parse(await fs.readFile(path.join(this.dir, slug, 'larp-install.json'), 'utf8'));
  }
  async list() {
    return Promise.all((await this.catalog()).map(async (s) => {
      let installed = null;
      try { installed = JSON.parse(await fs.readFile(path.join(this.dir, s.slug, 'larp-install.json'), 'utf8')); } catch {}
      return { ...s, installed };
    }));
  }
  async install(slug) {
    if (this.pending.has(slug)) return this.pending.get(slug);
    const job = this.doInstall(slug).finally(() => this.pending.delete(slug));
    this.pending.set(slug, job); return job;
  }
  async doInstall(slug) {
    const skill = (await this.catalog()).find((s) => s.slug === slug);
    if (!skill || !/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('Unknown catalog skill');
    const existing = (await this.list()).find((s) => s.slug === slug)?.installed;
    if (existing) return existing;
    const source = new URL(skill.url);
    if (source.hostname !== 'github.com') throw new Error('This skill needs manual setup; its source is not a GitHub package');
    const [, owner, repo, blob, ref, ...parts] = source.pathname.split('/');
    if (blob !== 'blob' || !parts.length || parts.at(-1) !== 'SKILL.md' || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('Unsupported source layout');
    await fs.mkdir(this.dir, { recursive: true });
    const checkout = path.join(this.dir, `.source-${crypto.randomUUID()}`);
    await git(this.dir, ['clone', '--depth', '1', ...(ref === 'HEAD' ? [] : ['--branch', ref]), '--', `https://github.com/${owner}/${repo}.git`, checkout]);
    const revision = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
    const folder = path.resolve(checkout, ...parts.slice(0, -1));
    if (folder !== checkout && !folder.startsWith(checkout + path.sep)) throw new Error('Source escapes package');
    await fs.access(path.join(folder, 'SKILL.md'));
    const stage = path.join(this.dir, `.install-${crypto.randomUUID()}`);
    await fs.cp(folder, stage, { recursive: true, filter: async (p) => {
      const stat = await fs.lstat(p);
      return !stat.isSymbolicLink() && !['.git', 'node_modules'].includes(path.basename(p));
    } });
    const metadata = { slug, title: skill.title || skill.name, source: skill.url, revision, installedAt: new Date().toISOString() };
    await fs.writeFile(path.join(stage, 'larp-install.json'), JSON.stringify(metadata, null, 2));
    await fs.rename(stage, path.join(this.dir, slug));
    return metadata;
  }
  async load(slugs, workdir, log) {
    const loaded = [];
    for (const slug of [...new Set(slugs || [])].slice(0, 8)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('Invalid skill');
      const source = path.join(this.dir, slug);
      const meta = JSON.parse(await fs.readFile(path.join(source, 'larp-install.json'), 'utf8'));
      const target = path.join(workdir, '.larp', 'skills', slug);
      await fs.cp(source, target, { recursive: true, force: true });
      const instructions = await fs.readFile(path.join(target, 'SKILL.md'), 'utf8');
      loaded.push({ ...meta, instructions: instructions.slice(0, 40000), path: `.larp/skills/${slug}/SKILL.md` });
      await log('skill', `Loaded ${meta.title} @ ${meta.revision.slice(0, 8)} · .larp/skills/${slug}/SKILL.md`);
    }
    return loaded;
  }
}
