// A host runs agents on one machine. It connects outward to the coordinator,
// picks up tasks for its agents, runs them in isolated git worktrees, runs the
// requested check, and reports results. Private data never leaves this machine
// except as scoped answers the owner allowed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAgent } from './adapters/index.mjs';
import { run, git } from './adapters/process.mjs';

const MAX_PARALLEL = 2;
const DEFAULT_SHARING = { availability: 'ask', budget: 'ask', calendar: 'never' };

export class Host {
  constructor({ url, token, dataDir, onChange }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.dataDir = dataDir;
    this.onChange = onChange || (() => {});
    this.config = { agents: {} };
    this.running = new Map();   // taskId -> AbortController
    this.applying = new Set();
    this.answering = new Set();
    this.answered = new Set();
    this.waiters = new Map();   // approvalId -> resolve(boolean)
    this.stopped = false;
    this.online = false;
  }

  // ---------- setup ----------

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      this.config = JSON.parse(await fs.readFile(path.join(this.dataDir, 'host.json'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.config.agents ||= {};
  }

  async saveConfig() {
    const file = path.join(this.dataDir, 'host.json');
    await fs.writeFile(file + '.tmp', JSON.stringify(this.config, null, 2));
    await fs.rename(file + '.tmp', file);
  }

  async api(method, route, body) {
    const response = await fetch(`${this.url}/api/host/${route}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Coordinator returned ${response.status}`);
    return data;
  }

  async start() {
    await this.init();
    this.me = await this.api('GET', 'me');
    if (!this.me?.host || !Array.isArray(this.me.agents)) throw new Error(`${this.url} didn't answer like a Larp space`);
    // Forget local config for agents the coordinator no longer knows.
    const known = new Set(this.me.agents.map((a) => a.id));
    for (const id of Object.keys(this.config.agents)) if (!known.has(id)) delete this.config.agents[id];
    await this.saveConfig();
    this.connect();
    this.fallback = setInterval(() => this.schedulePoll(), 5000);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.fallback);
    clearTimeout(this.pollTimer);
    this.streamAbort?.abort();
    for (const controller of this.running.values()) controller.abort();
  }

  async connect() {
    let delay = 1000;
    while (!this.stopped) {
      this.streamAbort = new AbortController();
      try {
        const response = await fetch(`${this.url}/api/stream`, { headers: { Authorization: `Bearer ${this.token}` }, signal: this.streamAbort.signal });
        if (!response.ok) throw new Error(`stream ${response.status}`);
        this.setOnline(true);
        delay = 1000;
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            if (block.startsWith('event: changed')) this.schedulePoll();
          }
        }
      } catch {
        // Fall through to reconnect.
      }
      this.setOnline(false);
      if (this.stopped) return;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15000);
    }
  }

  setOnline(online) {
    if (this.online === online) return;
    this.online = online;
    this.onChange();
  }

  schedulePoll() {
    if (this.stopped) return;
    // Polls never overlap: a stale snapshot could otherwise restart finished work.
    if (this.polling) { this.pollAgain = true; return; }
    if (this.pollTimer) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      this.polling = true;
      try {
        await this.poll();
      } catch (error) {
        if (!this.stopped) console.error('[larp host] poll failed:', error.message);
      } finally {
        this.polling = false;
        if (this.pollAgain) { this.pollAgain = false; this.schedulePoll(); }
      }
    }, 80);
  }

  async poll() {
    const work = await this.api('GET', 'work');
    const live = new Set(work.tasks.map((t) => t.id));
    for (const [taskId, controller] of this.running) if (!live.has(taskId)) controller.abort();

    for (const approval of work.approvals) {
      const resolve = this.waiters.get(approval.id);
      if (!resolve) continue;
      this.waiters.delete(approval.id);
      resolve(approval.status === 'approved');
      await this.api('POST', `approvals/${approval.id}/ack`).catch(() => {});
    }

    for (const task of work.tasks) {
      if (task.status === 'accepted' && task.applyHostId === this.me.host.id) {
        if (!this.applying.has(task.id)) this.applyTask(task);
        continue;
      }
      if (task.status !== 'queued' || this.running.has(task.id) || this.running.size >= MAX_PARALLEL) continue;
      const agentBusy = [...this.running.keys()].some((id) => work.tasks.find((t) => t.id === id)?.agentId === task.agentId);
      if (!agentBusy) this.runTask(task);
    }

    for (const query of work.queries) {
      if (!this.answering.has(query.id) && !this.answered.has(query.id)) this.answerQuery(query);
    }
  }

  // ---------- agents ----------

  async addAgent({ ownerToken, name, runtime, model, spaceIds, repoPath, baseUrl, apiKeyEnv }) {
    if (repoPath) {
      const inside = (await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoPath })).output.trim();
      if (inside !== 'true') throw new Error('That folder is not a git repository');
    }
    const agent = await this.api('POST', 'agents', {
      ownerToken, name, runtime, model, spaceIds,
      repo: repoPath ? path.basename(repoPath) : null,
    });
    this.config.agents[agent.id] = {
      runtime, model: model || null, repoPath: repoPath || null,
      baseUrl: baseUrl || null, apiKeyEnv: apiKeyEnv || null,
      private: { calendar: [], availability: {}, budget: null },
      sharing: { ...DEFAULT_SHARING },
    };
    await this.saveConfig();
    this.onChange();
    return agent;
  }

  async updateAgent(agentId, patch) {
    const local = this.config.agents[agentId];
    if (!local) throw new Error('Agent is not on this host');
    const shared = {};
    for (const key of ['runtime', 'model']) if (key in patch) { local[key] = patch[key]; shared[key] = patch[key]; }
    if ('spaceIds' in patch) shared.spaceIds = patch.spaceIds;
    for (const key of ['baseUrl', 'apiKeyEnv']) if (key in patch) local[key] = patch[key];
    if (patch.private) local.private = { ...local.private, ...patch.private };
    if (patch.sharing) local.sharing = { ...local.sharing, ...patch.sharing };
    if (Object.keys(shared).length) await this.api('POST', `agents/${agentId}/update`, shared);
    await this.saveConfig();
    this.onChange();
    return local;
  }

  async removeAgent(agentId) {
    await this.api('POST', `agents/${agentId}/remove`);
    delete this.config.agents[agentId];
    await this.saveConfig();
    this.onChange();
  }

  requestApproval(fields) {
    return this.api('POST', 'approvals', fields).then((approval) => new Promise((resolve) => {
      this.waiters.set(approval.id, resolve);
      this.schedulePoll();
    }));
  }

  // ---------- tasks ----------

  async runTask(task) {
    const controller = new AbortController();
    this.running.set(task.id, controller);
    const local = this.config.agents[task.agentId];
    const log = (kind, text) => this.api('POST', `tasks/${task.id}/event`, { type: 'log', kind, text }).catch(() => {});
    try {
      await this.api('POST', `tasks/${task.id}/event`, { type: 'started' });
      if (!local) throw new Error('This agent has no local configuration on this host');
      const workdir = await this.prepareWorkdir(task, local);
      await log('note', local.repoPath ? `Working on branch larp/${task.id} in an isolated worktree` : 'Working in an isolated folder');
      const { summary } = await runAgent(local.runtime, {
        prompt: this.buildPrompt(task),
        cwd: workdir,
        config: local,
        signal: controller.signal,
        onLog: (kind, text) => log(kind, text),
        requestApproval: (title, detail) => this.requestApproval({ taskId: task.id, title, detail, kind: 'tool' }),
      });
      if (controller.signal.aborted) return;
      const result = { summary };
      if (local.repoPath) {
        await git(workdir, ['add', '-A']);
        result.files = (await git(workdir, ['diff', '--cached', '--name-only', 'HEAD'])).split('\n').map((f) => f.trim()).filter(Boolean);
        result.stat = await git(workdir, ['diff', '--cached', '--stat', 'HEAD']);
        result.diff = await git(workdir, ['diff', '--cached', '--binary', 'HEAD']);
        result.branch = `larp/${task.id}`;
        await this.api('POST', `tasks/${task.id}/event`, { type: 'files', files: result.files });
      }
      if (task.check) {
        await log('note', `Running check: ${task.check}`);
        const check = await run(task.check, [], { cwd: workdir, shell: true, timeout: 600_000, signal: controller.signal });
        result.check = { passed: check.exitCode === 0, exitCode: check.exitCode, output: check.output };
        await log(check.exitCode === 0 ? 'pass' : 'fail', `Check ${check.exitCode === 0 ? 'passed' : `failed (exit ${check.exitCode})`}`);
      }
      if (controller.signal.aborted) return;
      await this.api('POST', `tasks/${task.id}/result`, result);
    } catch (error) {
      if (!controller.signal.aborted) {
        await this.api('POST', `tasks/${task.id}/result`, { error: error.message }).catch(() => {});
      }
    } finally {
      this.running.delete(task.id);
      this.schedulePoll();
    }
  }

  buildPrompt(task) {
    const parts = [`Task: ${task.title}`, '', task.instructions];
    const items = task.context?.items || [];
    const section = (title, list) => { if (list.length) parts.push('', title, ...list.map((i) => `- ${i.text}`)); };
    section('What you remember from earlier work (from your memory in Meko):', items.filter((i) => i.source === 'memory'));
    section('Notes handed over by other agents:', items.filter((i) => i.source === 'handoff'));
    section('Knowledge this space has agreed on:', items.filter((i) => i.source === 'space'));
    section("Skills and apps that may help (from your team's libraries in Meko):", items.filter((i) => i.source === 'skill' || i.source === 'app'));
    if (items.length) parts.push('Use these only where they apply to this task.');
    if (task.check) parts.push('', `When you finish, Larp will run this check in the workspace: ${task.check}`, 'Make it pass. Do not modify the check itself unless asked.');
    const last = task.attempts.length ? task.result : null;
    if (last?.check && !last.check.passed) parts.push('', 'The previous attempt failed the check. Output:', last.check.output.slice(-3000));
    if (task.feedback.length) parts.push('', 'Feedback from reviewers (newest last):', ...task.feedback.map((f) => `- ${f.text}`));
    return parts.join('\n');
  }

  async prepareWorkdir(task, local) {
    const dir = path.join(this.dataDir, 'worktrees', task.id);
    if (!local.repoPath) {
      await fs.mkdir(dir, { recursive: true });
      return dir;
    }
    try {
      await fs.access(path.join(dir, '.git'));
      return dir; // A revision continues in the same worktree.
    } catch {
      await fs.mkdir(path.dirname(dir), { recursive: true });
      await git(local.repoPath, ['worktree', 'add', '-b', `larp/${task.id}`, dir, 'HEAD']);
      return dir;
    }
  }

  /** Apply an accepted result from another machine onto a new branch in this host's copy of the repo. */
  async applyTask(task) {
    this.applying.add(task.id);
    try {
      const local = Object.values(this.config.agents).find((a) => a.repoPath && path.basename(a.repoPath) === task.repo);
      if (!local) throw new Error(`No agent on this host has a repository named ${task.repo}`);
      if (!task.result?.diff) throw new Error('The result has no changes to apply');
      const branch = `larp/accepted-${task.id.slice(-6)}`;
      const dir = path.join(this.dataDir, 'applied', task.id);
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(dir), { recursive: true });
      await git(local.repoPath, ['worktree', 'add', '-b', branch, dir, 'HEAD']);
      const patch = path.join(this.dataDir, 'applied', `${task.id}.patch`);
      await fs.writeFile(patch, task.result.diff.endsWith('\n') ? task.result.diff : task.result.diff + '\n');
      await git(dir, ['apply', '--index', '--3way', patch]);
      await git(dir, ['-c', 'user.name=Larp', '-c', 'user.email=larp@localhost', 'commit', '-m', `Larp: ${task.title}`]);
      await this.api('POST', `tasks/${task.id}/result`, { type: 'applied', branch, message: `Committed on ${branch}` });
    } catch (error) {
      await this.api('POST', `tasks/${task.id}/result`, { type: 'apply_failed', message: error.message }).catch(() => {});
    } finally {
      this.applying.delete(task.id);
    }
  }

  // ---------- scoped questions from the home circle ----------

  async answerQuery(query) {
    this.answering.add(query.id);
    try {
      const local = this.config.agents[query.agentId];
      const privateData = local?.private || { calendar: [], availability: {}, budget: null };
      const sharing = { ...DEFAULT_SHARING, ...(local?.sharing || {}) };
      const answer = {};
      const ask = {};
      for (const field of query.fields) {
        const rule = sharing[field] || 'never';
        if (rule === 'never') { answer[field] = { denied: true, reason: 'Owner never shares this' }; continue; }
        const value = this.privateValue(field, privateData, query.day);
        if (value === null) { answer[field] = { denied: true, reason: 'Not set' }; continue; }
        if (rule === 'auto') answer[field] = value;
        else ask[field] = value;
      }
      if (Object.keys(ask).length) {
        const describe = (field, value) => field === 'availability'
          ? `availability on ${query.day}: ${value.map((w) => `${w.from}–${w.to}`).join(', ') || 'none'} (no event names)`
          : field === 'budget' ? `budget: up to ₹${value} per person` : `your full calendar for ${query.day} (${value.length} events)`;
        const approved = await this.requestApproval({
          planId: query.planId, queryId: query.id, kind: 'share',
          title: `Share with your circle for "${query.title}"?`,
          detail: Object.entries(ask).map(([f, v]) => describe(f, v)).join(' · '),
        });
        for (const [field, value] of Object.entries(ask)) answer[field] = approved ? value : { denied: true, reason: 'Owner declined' };
      }
      await this.api('POST', `queries/${query.id}/answer`, { answer });
      this.answered.add(query.id);
    } catch (error) {
      console.error('[larp host] could not answer query:', error.message);
    } finally {
      this.answering.delete(query.id);
    }
  }

  privateValue(field, data, day) {
    if (field === 'budget') return Number.isFinite(data.budget) ? data.budget : null;
    const events = (data.calendar || []).filter((e) => e.day === day);
    if (field === 'calendar') return events;
    if (data.availability?.[day]) return data.availability[day];
    // Derive free time between 09:00 and 22:00 from calendar events, without revealing them.
    const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
    const toTime = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    let free = [[toMin('09:00'), toMin('22:00')]];
    for (const event of events) {
      const [a, b] = [toMin(event.from), toMin(event.to)];
      free = free.flatMap(([x, y]) => [[x, Math.min(y, a)], [Math.max(x, b), y]]).filter(([x, y]) => y - x >= 30);
    }
    return free.map(([a, b]) => ({ from: toTime(a), to: toTime(b) }));
  }

  status() {
    return { online: this.online, hostId: this.me?.host.id, running: [...this.running.keys()], agents: this.config.agents };
  }
}
