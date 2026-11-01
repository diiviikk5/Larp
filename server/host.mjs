// A host runs agents on one machine. It connects outward to the coordinator,
// picks up tasks for its agents, runs them in isolated git worktrees, runs the
// requested check, and reports results. Private data never leaves this machine
// except as scoped answers the owner allowed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Skills } from './skills.mjs';
import { runAgent } from './adapters/index.mjs';
import { run, git } from './adapters/process.mjs';

const MAX_PARALLEL = 3;
const DEFAULT_SHARING = { availability: 'ask', budget: 'ask', calendar: 'never' };

export class Host {
  /** appContext: optional async () => [{ name, kind, text }], the owner's apps as text for agents allowed to read them. */
  constructor({ url, token, dataDir, onChange, appContext, appCall, skillsDir }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.dataDir = dataDir;
    this.onChange = onChange || (() => {});
    this.appContext = appContext || null;
    this.appCall = appCall;
    this.skills = new Skills(skillsDir || path.join(dataDir, 'skills'));
    this.saving = Promise.resolve();
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
    this.saving = this.saving.catch(() => {}).then(async () => {
      const file = path.join(this.dataDir, 'host.json');
      await fs.writeFile(file + '.tmp', JSON.stringify(this.config, null, 2));
      await fs.rename(file + '.tmp', file);
    });
    return this.saving;
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
    // Agents added before repos had an identity get one now.
    for (const agent of this.me.agents) {
      const local = this.config.agents[agent.id];
      if (local?.repoPath && !agent.repoId) {
        const repoId = await repoIdentity(local.repoPath);
        if (repoId) await this.api('POST', `agents/${agent.id}/update`, { repoId }).catch(() => {});
      }
    }
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

  async addAgent({ ownerToken, name, runtime, model, spaceIds, repoPath, baseUrl, apiKeyEnv, codexHome, useApps, skills = [] }) {
    if (repoPath) {
      const inside = (await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoPath })).output.trim();
      if (inside !== 'true') throw new Error('That folder is not a git repository');
    }
    const agent = await this.api('POST', 'agents', {
      ownerToken, name, runtime, model, spaceIds,
      repo: repoPath ? path.basename(repoPath) : null,
      repoId: repoPath ? await repoIdentity(repoPath) : null,
      usesApps: Boolean(useApps), skills,
    });
    this.config.agents[agent.id] = {
      runtime, model: model || null, repoPath: repoPath || null,
      baseUrl: baseUrl || null, apiKeyEnv: apiKeyEnv || null, codexHome: codexHome || null, useApps: Boolean(useApps), skills,
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
    if ('useApps' in patch) { local.useApps = Boolean(patch.useApps); shared.usesApps = local.useApps; }
    if ('skills' in patch) { local.skills = [...new Set(patch.skills)].slice(0, 8); shared.skills = local.skills; }
    if ('spaceIds' in patch) shared.spaceIds = patch.spaceIds;
    for (const key of ['baseUrl', 'apiKeyEnv', 'codexHome']) if (key in patch) local[key] = patch[key];
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
      const started = await this.api('POST', `tasks/${task.id}/event`, { type: 'started' });
      if (started.task) Object.assign(task, started.task);
      if (!local) throw new Error('This agent has no local configuration on this host');
      const workdir = await this.prepareWorkdir(task, local);
      await log('note', local.repoPath ? `Working on branch larp/${task.id} in an isolated worktree` : 'Working in an isolated folder');
      await this.applyAnswers(task, local, workdir, log);
      // The owner's own apps (Swasthya, Kosh), read on this computer for agents the owner allowed.
      let apps = [];
      if (local.useApps && this.appContext) {
        apps = await this.appContext().catch((error) => { log('note', `Couldn't read your apps: ${error.message}`); return []; });
        if (apps.length) await log('note', `Read ${apps.map((a) => a.name).join(' and ')} for this task`);
      }
      const skills = await this.skills.load(local.skills, workdir, log);
      const { summary } = await runAgent(local.runtime, {
        prompt: this.buildPrompt(task, apps, skills),
        cwd: workdir,
        config: local,
        appCall: local.useApps ? this.appCall : null,
        signal: controller.signal,
        onLog: (kind, text) => log(kind, text),
        requestApproval: (title, detail) => this.requestApproval({ taskId: task.id, title, detail, kind: 'tool' }),
      });
      if (controller.signal.aborted) return;
      // File requests work with Codex, Claude and the API adapter alike.
      const readRequest = async (name) => {
        const file = path.join(workdir, '.larp', name + '.json');
        try { const value = JSON.parse(await fs.readFile(file, 'utf8')); await fs.unlink(file); return value; }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      };
      const spawn = await readRequest('spawn');
      if (spawn) {
        const child = await this.api('POST', `tasks/${task.id}/spawn`, { name: spawn.name, skills: spawn.skills || local.skills || [] });
        this.config.agents[child.id] = structuredClone(local);
        this.config.agents[child.id].skills = child.skills;
        await this.saveConfig(); this.onChange();
        await log('agent', `Spawned ${child.name}; shares runtime and installed skills, with an isolated task workspace`);
        await this.api('POST', `tasks/${task.id}/result`, { summary, continuation: `Created agent ${child.name}. You may now ask ${child.name} for help using .larp/ask-${child.name}.md.` });
        return;
      }
      const appRequest = await readRequest('app-request');
      if (appRequest) {
        if (!local.useApps || !this.appCall) throw new Error('App access is not enabled for this agent');
        if (JSON.stringify(appRequest).length > 3500) throw new Error('App request is too large to review; split it into smaller changes');
        const method = String(appRequest.method || 'GET').toUpperCase();
        if (method !== 'GET' && !await this.requestApproval({ taskId: task.id, kind: 'tool', title: `Allow ${method} in ${appRequest.id}?`, detail: JSON.stringify(appRequest).slice(0, 4000) })) throw new Error('App change declined');
        const response = await this.appCall(appRequest);
        await fs.mkdir(path.join(workdir, '.larp'), { recursive: true });
        await fs.writeFile(path.join(workdir, '.larp', 'app-result.json'), JSON.stringify(response, null, 2));
        await log('app', `${method} ${appRequest.id}/${appRequest.path} succeeded; response in .larp/app-result.json`);
        await this.api('POST', `tasks/${task.id}/result`, { summary, continuation: 'Your app request succeeded. Read .larp/app-result.json and continue. Do not repeat the same write.' });
        return;
      }
      const ask = await readAsk(workdir, task);
      if (ask) {
        await log('say', `Asking ${ask.to}: ${ask.text.slice(0, 300)}`);
        await this.api('POST', `tasks/${task.id}/result`, { summary, ask });
        return;
      }
      const result = { summary };
      if (local.repoPath) {
        // .larp/ holds Larp's own notes (questions to other agents); it is never part of the change.
        await git(workdir, ['add', '-A', '--', '.', ':(exclude).larp']);
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

  /** Before (re)running, apply the changes other agents made when they answered, once each. */
  async applyAnswers(task, local, workdir, log) {
    for (const ask of task.asks || []) {
      if (!ask.answered || !ask.answer?.diff || !local.repoPath) continue;
      const marker = path.join(workdir, '.larp', `applied-${ask.childId}`);
      if (await fs.access(marker).then(() => true, () => false)) continue;
      const mine = await repoIdentity(local.repoPath);
      if (ask.answer.repoId && mine && ask.answer.repoId !== mine) { await log('note', `${ask.to} worked in a different repository; its changes are described, not applied`); continue; }
      const patch = path.join(workdir, '.larp', `answer-${ask.childId}.patch`);
      await fs.mkdir(path.dirname(patch), { recursive: true });
      await fs.writeFile(patch, ask.answer.diff.endsWith('\n') ? ask.answer.diff : ask.answer.diff + '\n');
      try {
        await git(workdir, ['apply', '--3way', patch]);
        await log('tool', `applied ${ask.to}'s changes: ${(ask.answer.files || []).join(', ')}`);
      } catch (error) {
        await log('note', `Couldn't apply ${ask.to}'s changes automatically: ${String(error.message).slice(0, 200)}`);
      }
      await fs.writeFile(marker, new Date().toISOString());
    }
  }

  buildPrompt(task, apps = [], skills = []) {
    const parts = [`Task: ${task.title}`, '', task.instructions];
    parts.push('', 'You are part of a local agent team. Coordinate concrete work, return evidence, and avoid duplicate effort.');
    if (!task.parentId) parts.push('To create a specialist when needed, write .larp/spawn.json with {"name":"Tester","skills":[]} and finish your turn. It inherits your runtime, repository and app permission, and may only inherit your assigned skills. Maximum 8 agents per owner per space. You resume after creation.');
    for (const skill of skills) parts.push('', `Installed skill: ${skill.title} @ ${skill.revision}. Source: ${skill.source}. Local file: ${skill.path}.`, 'Follow these instructions when relevant. Supporting files are beside SKILL.md. State which skill you actually use; do not claim tools you do not have.', skill.instructions);
    if (apps.length) parts.push('', 'To read more or propose a write, create .larp/app-request.json with {"id":"kosh","method":"GET","path":"summary"} (optional body for writes), then finish. Larp asks approval before writes and resumes you with .larp/app-result.json. Only use documented app routes. Citylines, EduSpace and Studio support GET state, POST records {collection,record}, PATCH records {collection,id,patch}.');
    if (!apps.length) parts.push('', 'No connected app data was supplied. Do not search this isolated folder for Swasthya or other app data. If asked to read connected apps, explain that the owner should enable app access in agent settings and check that the app is connected.');
    if (task.kind === 'general') parts.push('', 'This task wants an answer, not code changes: do not edit project files. Internal .larp/ requests for agents or apps are allowed. Reply with a clear, complete answer.');
    for (const app of apps) {
      parts.push('', `From your owner's ${app.name} app (${app.kind}; private to them, use it only for this task):`, app.text);
    }
    const items = task.context?.items || [];
    const section = (title, list) => { if (list.length) parts.push('', title, ...list.map((i) => `- ${i.text}`)); };
    section('What you remember from earlier work (from your memory in Meko):', items.filter((i) => i.source === 'memory'));
    section('Notes handed over by other agents:', items.filter((i) => i.source === 'handoff'));
    section('Knowledge this space has agreed on:', items.filter((i) => i.source === 'space'));
    section("Skills and apps that may help (from your team's libraries in Meko):", items.filter((i) => i.source === 'skill' || i.source === 'app'));
    if (items.length) parts.push('Use these only where they apply to this task.');
    const answered = (task.asks || []).filter((a) => a.answered);
    if (answered.length) {
      parts.push('', 'Answers from other agents you asked (their file changes, if any, are already in your workspace):');
      for (const a of answered) parts.push(`- You asked ${a.to}: ${a.text.slice(0, 400)}`, `  ${a.to} replied: ${a.answer.text.slice(0, 3000)}`);
      parts.push('Continue the task using these answers. Do not ask the same thing again.');
    }
    if (task.peers?.length) {
      parts.push('', 'Other agents in this space you can ask for help (including specialists on your own computer):',
        ...task.peers.map((p) => `- ${p.name}, ${p.owner}'s agent; skills: ${(p.skills || []).join(', ') || 'general'}${p.apps ? `; it can read ${p.owner}'s health and money apps (Swasthya, Kosh)` : ''}${p.online ? '' : ' (offline right now)'}`),
        'To ask one, create the file .larp/ask-<Name>.md (for example .larp/ask-' + task.peers[0].name + '.md) containing exactly what you need,',
        'then stop and finish your turn. Larp delivers it, the owner approves if it belongs to someone else, and you are resumed in this same workspace with their answer.',
        'Only ask when the task calls for it or the other agent knows something you do not (their owner\'s apps, data or part of the work).');
    }
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
      const local = await this.localRepoFor(task);
      if (!local) throw new Error(`None of the agents on this computer has a copy of ${task.repo || 'this repository'}. Add an agent with that repository, then accept again.`);
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

  /** This computer's copy of a task's repository: the same first commit, or failing that the same folder name. */
  async localRepoFor(task) {
    const withRepo = Object.values(this.config.agents).filter((a) => a.repoPath);
    if (task.repoId) for (const a of withRepo) if (await repoIdentity(a.repoPath) === task.repoId) return a;
    return withRepo.find((a) => path.basename(a.repoPath) === task.repo) || null;
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

/** A repository's identity: its first commit. The same for every clone, whatever the folder is called. */
const identities = new Map();
async function repoIdentity(repoPath) {
  if (!identities.has(repoPath)) {
    const out = await git(repoPath, ['rev-list', '--max-parents=0', 'HEAD']).catch(() => '');
    identities.set(repoPath, out.split('\n').map((l) => l.trim()).filter(Boolean).sort()[0] || null);
  }
  return identities.get(repoPath);
}

/** A question the agent left for another agent: .larp/ask-<Name>.md. Read once, then removed. */
async function readAsk(workdir, task) {
  const dir = path.join(workdir, '.larp');
  const files = await fs.readdir(dir).catch(() => []);
  const file = files.find((f) => /^ask-[\w .-]+\.md$/i.test(f));
  if (!file) return null;
  const text = (await fs.readFile(path.join(dir, file), 'utf8')).trim();
  await fs.rm(path.join(dir, file), { force: true });
  const to = file.slice(4, -3).trim();
  if (!text || !(task.peers || []).some((p) => p.name.toLowerCase() === to.toLowerCase())) return null;
  if ((task.asks || []).some((a) => a.text === text.slice(0, 8000))) return null; // already answered
  return { to, text: text.slice(0, 8000) };
}
