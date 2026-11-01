// The coordinator holds a space's shared state: people, agents, tasks, approvals,
// plans, expenses and checklists. Hosts and phones connect to it; it never runs
// agents itself and never sees anyone's private data.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { Store, newId, newSecret, hashToken } from './store.mjs';
import { Meko } from './meko.mjs';
import { Memory } from './memory.mjs';
import { Telegram } from './telegram.mjs';
import { Yugabyte } from './db.mjs';
import { CloudStore, cloudUrl } from './cloud.mjs';

// Muted person colors that sit well on both the black and the white theme.
const COLORS = ['#8a8f99', '#c4875a', '#5f9d7d', '#a07aae', '#6a8fbd', '#b39a5f'];
const PALS = ['moss', 'bitbug', 'pip', 'boing'];
const OPEN_TASK = ['awaiting_approval', 'queued', 'running', 'waiting', 'needs_review', 'revision_requested', 'accepted', 'applying'];
const MAX_ASKS = 3; // per task, so two agents can't keep asking each other forever
const MAX_BODY = 2_000_000;
const LOG_IN_VIEW = 120; // log lines per task sent to the window (the full log stays on the coordinator)

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => new Date().toISOString();
const clipText = (s, n = 100) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const code = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toUpperCase();

function text(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim()) fail(400, `${name} is required`);
  if (value.length > max) fail(400, `${name} is too long`);
  return value.trim();
}

export class Coordinator {
  /**
   * meko: a Meko client for agent memory (default: MEKO_API_KEY if set, else Meko through Larp Cloud).
   * db: a YugabyteDB connection (server/db.mjs) for state, events and the Meko call log (default: local
   * files, joined by Larp Cloud's YugabyteDB in the background when it's on).
   */
  constructor({ dataDir, meko, db } = {}) {
    this.db = db || null;
    this.store = new Store(dataDir, this.db);
    if (meko === undefined && (process.env.MEKO_API_KEY || cloudUrl())) {
      meko = new Meko({ apiKey: process.env.MEKO_API_KEY, cloudDir: cloudUrl() ? dataDir : null, team: process.env.LARP_TEAM || 'larp' });
    }
    if (meko) meko.onCall = (entry) => this.logMekoCall(entry);
    this.memory = new Memory(this, meko || null);
    this.telegram = new Telegram(this);
    this.streams = new Set();
    this.broadcastTimer = null;
    this.failedClaims = [];
  }

  get s() { return this.store.state; }

  async init() {
    await this.store.load();
    this.memory.meko?.setEnabled(this.memory.on);
    this.telegram.start();
    if (!this.db && (process.env.YUGABYTE_URL || cloudUrl())) this.keepTryingDb();
  }

  /**
   * YugabyteDB (your own, or Larp Cloud's) isn't attached yet: it wasn't reachable at startup (some
   * networks drop many new connections), or it's Larp Cloud, which never delays startup. Keep trying in the background, and once it answers, switch to it and copy over what was recorded
   * in the meantime (state, events, Meko calls), so the database has the full history.
   */
  keepTryingDb() {
    const attempt = async () => {
      if (this.db || this.attachingDb) return;
      this.attachingDb = true;
      try {
        const db = process.env.YUGABYTE_URL ? await Yugabyte.connect(process.env.YUGABYTE_URL, 2) : await CloudStore.connect(this.store.dir);
        this.db = db;
        this.store.db = db;
        await db.saveState(this.s);
        for (const e of this.s.events) await db.appendEvent(e).catch(() => {});
        for (const c of this.s.mekoCalls) await db.logCall(c).catch(() => {});
        clearInterval(this.dbRetry);
        console.log(`[larp] storing in ${db.label}; state, ${this.s.events.length} events and ${this.s.mekoCalls.length} Meko calls copied over`);
        this.changed();
      } catch (error) {
        if (!this.dbWarned) console.error(`[larp] database not reachable yet (${error.message}); trying again every minute`);
        this.dbWarned = true;
      } finally {
        this.attachingDb = false;
      }
    };
    this.dbRetry = setInterval(attempt, 60_000);
    this.dbFirstTry = setTimeout(attempt, process.env.YUGABYTE_URL ? 5_000 : 500);
  }

  logMekoCall(entry) {
    this.s.mekoCalls.push(entry);
    if (this.s.mekoCalls.length > 500) this.s.mekoCalls.splice(0, this.s.mekoCalls.length - 500);
    this.db?.logCall(entry).catch((error) => console.error('[larp] could not log Meko call:', error.message));
    this.changed();
  }

  // ---------- identity ----------

  issueToken(entry) {
    const token = newSecret();
    this.s.tokens[hashToken(token)] = { ...entry, createdAt: now() };
    return token;
  }

  auth(token) {
    if (!token) fail(401, 'Sign in first');
    const entry = this.s.tokens[hashToken(token)];
    if (!entry) fail(401, 'This device is not paired or was disconnected');
    return entry;
  }

  person(auth) {
    if (!auth.personId) fail(403, 'A person token is required');
    const person = this.s.people[auth.personId];
    if (!person) fail(401, 'Unknown person');
    return person;
  }

  hostOf(auth) {
    if (auth.kind !== 'host') fail(403, 'A host token is required');
    const host = this.s.hosts[auth.hostId];
    if (!host) fail(401, 'Unknown host');
    return host;
  }

  memberSpace(personId, spaceId) {
    const space = this.s.spaces[spaceId];
    if (!space || !space.memberIds.includes(personId)) fail(404, 'Space not found');
    return space;
  }

  createPerson(name) {
    const count = Object.keys(this.s.people).length;
    const person = { id: newId('per'), name: text(name, 'Name', 40), color: COLORS[count % COLORS.length], createdAt: now() };
    this.s.people[person.id] = person;
    return person;
  }

  /** First-run setup, called in-process by whoever starts the coordinator. */
  createSpaceWithOwner({ spaceName, kind, ownerName }) {
    const person = this.createPerson(ownerName);
    const space = this.createSpace(person.id, { name: spaceName, kind });
    const token = this.issueToken({ personId: person.id, kind: 'desktop', label: 'Owner desktop' });
    return { person, space, token };
  }

  createSpace(personId, { name, kind }) {
    const space = {
      id: newId('spc'),
      name: text(name, 'Space name', 60),
      kind: kind === 'home' ? 'home' : 'build',
      memberIds: [personId],
      createdAt: now(),
    };
    this.s.spaces[space.id] = space;
    this.store.record({ type: 'space.created', spaceId: space.id, actor: personId, text: `created ${space.name}` });
    this.changed();
    return space;
  }

  createInvite(personId, spaceId) {
    this.memberSpace(personId, spaceId);
    const invite = code();
    this.s.invites[invite] = { spaceId, createdBy: personId, expiresAt: Date.now() + 24 * 3600_000 };
    this.store.save();
    return { code: invite, expiresAt: this.s.invites[invite].expiresAt };
  }

  throttleClaims() {
    const minuteAgo = Date.now() - 60_000;
    this.failedClaims = this.failedClaims.filter((t) => t > minuteAgo);
    if (this.failedClaims.length >= 10) fail(429, 'Too many attempts. Wait a minute and try again.');
  }

  join({ code: inviteCode, name }, existingAuth) {
    this.throttleClaims();
    const key = String(inviteCode || '').trim().toUpperCase();
    // A fresh server (e.g. hosted in the cloud) has no one to invite you yet: whoever joins
    // first with its one-time setup code owns the first space.
    if (this.setupCode && !Object.keys(this.s.spaces).length && !existingAuth && key === this.setupCode) {
      const kind = process.env.LARP_SPACE_KIND === 'home' ? 'home' : 'build';
      const { person, token, space } = this.createSpaceWithOwner({ spaceName: process.env.LARP_SPACE_NAME || (kind === 'home' ? 'Home' : 'Build studio'), kind, ownerName: name });
      this.setupCode = null;
      this.changed();
      return { token, person, space };
    }
    const invite = this.s.invites[key];
    if (!invite || invite.expiresAt < Date.now()) {
      this.failedClaims.push(Date.now());
      fail(400, 'That invite code is invalid or expired');
    }
    delete this.s.invites[key];
    const space = this.s.spaces[invite.spaceId];
    if (!space) fail(404, 'Space no longer exists');
    let person;
    let token = null;
    if (existingAuth?.personId) {
      person = this.s.people[existingAuth.personId];
    } else {
      person = this.createPerson(name);
      token = this.issueToken({ personId: person.id, kind: 'desktop', label: 'Desktop' });
    }
    if (!space.memberIds.includes(person.id)) space.memberIds.push(person.id);
    this.store.record({ type: 'member.joined', spaceId: space.id, actor: person.id, text: `${person.name} joined` });
    this.changed();
    return { token, person, space };
  }

  createPairCode(personId) {
    const pair = code();
    this.s.pairCodes[pair] = { personId, expiresAt: Date.now() + 10 * 60_000 };
    this.store.save();
    return { code: pair, expiresAt: this.s.pairCodes[pair].expiresAt };
  }

  claimPairCode({ code: pairCode, label }) {
    this.throttleClaims();
    const key = String(pairCode || '').trim().toUpperCase();
    const pair = this.s.pairCodes[key];
    if (!pair || pair.expiresAt < Date.now()) {
      this.failedClaims.push(Date.now());
      fail(400, 'That pairing code is invalid or expired');
    }
    delete this.s.pairCodes[key];
    const token = this.issueToken({ personId: pair.personId, kind: 'phone', label: String(label || 'Phone').slice(0, 40) });
    this.store.save();
    return { token, person: this.s.people[pair.personId] };
  }

  revokeDevices(personId, kind) {
    for (const [hash, entry] of Object.entries(this.s.tokens)) {
      if (entry.personId === personId && entry.kind === kind) delete this.s.tokens[hash];
    }
    this.store.save();
    return { ok: true };
  }

  // ---------- hosts and agents ----------

  registerHost(personId, { name }) {
    const host = { id: newId('hst'), name: text(name, 'Host name', 60), ownerId: personId, lastSeen: null, online: false };
    this.s.hosts[host.id] = host;
    const token = this.issueToken({ hostId: host.id, kind: 'host', label: host.name });
    this.changed();
    return { host, token };
  }

  /** A host registers an agent for a person. The person's own token proves consent. */
  registerAgent(host, { ownerToken, name, runtime, model, spaceIds, repo, repoId, usesApps, skills = [] }, trustedOwnerId = null) {
    const owner = trustedOwnerId ? { personId: trustedOwnerId } : this.auth(ownerToken);
    if (!owner.personId) fail(403, 'The agent owner must sign in');
    const ids = Array.isArray(spaceIds) ? spaceIds : [];
    for (const spaceId of ids) this.memberSpace(owner.personId, spaceId);
    for (const spaceId of ids) {
      const peers = Object.values(this.s.agents).filter((a) => a.spaceIds.includes(spaceId));
      if (peers.some((a) => a.name.toLowerCase() === String(name || '').trim().toLowerCase())) fail(409, 'An agent with this name already exists in the space');
      if (peers.filter((a) => a.ownerId === owner.personId).length >= 8) fail(409, 'Maximum 8 agents per owner per space');
    }
    const count = Object.keys(this.s.agents).length;
    const agent = {
      id: newId('agt'),
      name: text(name, 'Agent name', 40),
      ownerId: owner.personId,
      hostId: host.id,
      runtime: String(runtime || 'scripted').slice(0, 20),
      model: model ? String(model).slice(0, 80) : null,
      spaceIds: ids,
      repo: repo ? String(repo).slice(0, 80) : null,
      repoId: repoId ? String(repoId).slice(0, 64) : null,
      usesApps: Boolean(usesApps), skills: Array.isArray(skills) ? [...new Set(skills.map(String))].slice(0, 8) : [],
      pal: PALS[count % PALS.length],
      createdAt: now(),
    };
    this.s.agents[agent.id] = agent;
    for (const spaceId of ids) {
      this.store.record({ type: 'agent.added', spaceId, actor: owner.personId, agentId: agent.id, text: `added agent ${agent.name} on ${host.name}` });
    }
    this.changed();
    return agent;
  }

  updateAgent(host, agentId, patch) {
    const agent = this.s.agents[agentId];
    if (!agent || agent.hostId !== host.id) fail(404, 'Agent not found on this host');
    if (patch.spaceIds) {
      for (const spaceId of patch.spaceIds) this.memberSpace(agent.ownerId, spaceId);
      agent.spaceIds = patch.spaceIds;
    }
    for (const key of ['runtime', 'model', 'repo', 'repoId']) if (key in patch) agent[key] = patch[key] ? String(patch[key]).slice(0, 80) : null;
    if ('skills' in patch) agent.skills = Array.isArray(patch.skills) ? [...new Set(patch.skills.map(String))].slice(0, 8) : [];
    if ('usesApps' in patch) agent.usesApps = Boolean(patch.usesApps);
    this.changed();
    return agent;
  }

  removeAgent(host, agentId) {
    const agent = this.s.agents[agentId];
    if (!agent || agent.hostId !== host.id) fail(404, 'Agent not found on this host');
    delete this.s.agents[agentId];
    this.changed();
    return { ok: true };
  }

  setHostOnline(hostId, online) {
    const host = this.s.hosts[hostId];
    if (!host) return;
    host.online = online;
    host.lastSeen = now();
    this.changed();
  }

  // ---------- tasks ----------

  createTask(personId, { spaceId, agentId, title, instructions, check, kind, parentId, askedBy }) {
    const space = this.memberSpace(personId, spaceId);
    const agent = this.s.agents[agentId];
    if (!agent || !agent.spaceIds.includes(space.id)) fail(400, 'Choose an agent in this space');
    const task = {
      id: newId('tsk'),
      spaceId: space.id,
      agentId: agent.id,
      ownerId: agent.ownerId,
      createdBy: personId,
      kind: kind === 'general' ? 'general' : 'code',
      title: text(title, 'Title', 120),
      instructions: text(instructions, 'Instructions', 16000),
      check: check ? text(check, 'Check command', 400) : null,
      repo: agent.repo,
      repoId: agent.repoId || null,
      status: 'awaiting_approval',
      attempts: [],
      feedback: [],
      parentId, askedBy, messages: [],
      files: [],
      conflicts: [],
      log: [],
      result: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.s.tasks[task.id] = task;
    const delegated = agent.ownerId !== personId;
    this.store.record({
      type: 'task.created', spaceId: space.id, actor: personId, taskId: task.id, agentId: agent.id,
      text: delegated ? `asked ${this.s.people[agent.ownerId]?.name}'s agent ${agent.name}: ${task.title}` : `started ${task.title} with ${agent.name}`,
    });
    if (delegated) {
      this.requestApproval({
        spaceId: space.id, ownerId: agent.ownerId, kind: 'run_task', taskId: task.id, requestedBy: personId,
        title: `Run "${task.title}" on ${agent.name}?`,
        detail: [
          `From ${this.s.people[personId]?.name}.`,
          agent.repo ? `Works in an isolated git worktree of ${agent.repo}.` : 'Works in an isolated folder.',
          task.check ? `Then runs this check on your machine: ${task.check}` : 'No check command.',
          agent.usesApps ? `${agent.name} can read your connected apps (Swasthya, Kosh) to do this; what it finds goes into its answer.` : '',
        ].filter(Boolean).join(' '),
      });
    } else {
      task.status = 'queued';
    }
    this.memory.prepare(task);
    this.changed();
    return task;
  }

  task(personId, taskId) {
    const task = this.s.tasks[taskId];
    if (!task) fail(404, 'Task not found');
    this.memberSpace(personId, task.spaceId);
    return task;
  }

  setTaskStatus(task, status, actor, eventText) {
    task.status = status;
    task.updatedAt = now();
    if (eventText) this.store.record({ type: `task.${status}`, spaceId: task.spaceId, actor, taskId: task.id, text: eventText });
    this.telegram.taskChanged(task, status);
    this.changed();
  }

  messageTask(personId, taskId, { text: message }) {
    const task = this.task(personId, taskId);
    if (![task.ownerId, task.createdBy].includes(personId)) fail(403, 'Only the owner or requester can steer this task');
    if (['accepted', 'applied', 'applying', 'cancelled', 'denied'].includes(task.status)) fail(409, 'Start a new task after acceptance or cancellation');
    const value = text(message, 'Message', 4000);
    (task.messages ||= []).push({ by: personId, text: value, at: now() });
    task.feedback.push({ by: personId, text: value, at: now() });
    if (['needs_review', 'failed', 'interrupted'].includes(task.status)) this.setTaskStatus(task, 'queued', personId, 'continued the conversation');
    this.store.record({ type: 'task.message', spaceId: task.spaceId, actor: personId, taskId, text: value });
    this.changed(); return task;
  }

  spawnForTask(host, taskId, { name, skills }) {
    const task = this.hostTask(host, taskId);
    if (task.status !== 'running' || task.parentId) fail(409, 'Only a running lead task can spawn agents');
    const parent = this.s.agents[task.agentId];
    const agents = Object.values(this.s.agents).filter((a) => a.ownerId === parent.ownerId && a.spaceIds.includes(task.spaceId));
    if (agents.length >= 8) fail(409, 'Agent limit reached (8 per owner per space)');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(name || '')) fail(400, 'Use a simple agent name');
    if (Object.values(this.s.agents).some((a) => a.spaceIds.includes(task.spaceId) && a.name.toLowerCase() === name.toLowerCase())) fail(409, 'Agent name already exists');
    return this.registerAgent(host, { ...parent, name, spaceIds: [task.spaceId], skills: (skills || parent.skills || []).filter((s) => (parent.skills || []).includes(s)) }, parent.ownerId);
  }

  reviseTask(personId, taskId, { feedback }) {
    const task = this.task(personId, taskId);
    if (task.createdBy !== personId && task.ownerId !== personId) fail(403, 'Only the requester or agent owner can ask for a revision');
    if (!['needs_review', 'failed', 'interrupted'].includes(task.status)) fail(409, 'This task is not waiting for review');
    task.feedback.push({ by: personId, text: text(feedback, 'Feedback', 4000), at: now() });
    this.memory.feedback(task, feedback, personId);
    this.setTaskStatus(task, 'queued', personId, `asked for a revision: ${feedback.slice(0, 80)}`);
    return task;
  }

  acceptTask(personId, taskId, { applyHostId, lesson } = {}) {
    const task = this.task(personId, taskId);
    if (task.createdBy !== personId) fail(403, 'Only the person who asked can accept the result');
    if (task.status !== 'needs_review') fail(409, 'There is no result to accept');
    if (applyHostId) {
      const host = this.s.hosts[applyHostId];
      if (!host || host.ownerId !== personId) fail(400, 'Choose one of your own hosts to apply the change');
      task.applyHostId = applyHostId;
      this.setTaskStatus(task, 'accepted', personId, `accepted the result and is applying it on ${host.name}`);
    } else {
      this.setTaskStatus(task, 'accepted', personId, 'accepted the result');
    }
    this.memory.handBack(task);
    if (lesson && String(lesson).trim() && this.memory.on) this.proposeLesson(personId, { spaceId: task.spaceId, taskId: task.id, text: lesson });
    return task;
  }

  // ---------- lessons: what one task taught, kept as space knowledge once a person approves ----------

  proposeLesson(personId, { spaceId, taskId, text: lessonText }) {
    const space = this.memberSpace(personId, spaceId);
    if (!this.memory.on) fail(409, 'Turn on agent memory (Meko) to keep lessons');
    const lesson = { id: newId('lsn'), spaceId: space.id, taskId: taskId || null, text: text(lessonText, 'Lesson', 1500), proposedBy: personId, status: 'pending', createdAt: now() };
    this.s.lessons[lesson.id] = lesson;
    // The space's first member keeps its knowledge and approves what becomes shared.
    const keeper = space.memberIds[0];
    this.store.record({ type: 'lesson.proposed', spaceId: space.id, actor: personId, taskId: lesson.taskId, text: `proposed a lesson: ${clipText(lesson.text)}` });
    if (keeper === personId) this.approveLesson(lesson, personId);
    else this.requestApproval({ spaceId: space.id, ownerId: keeper, kind: 'lesson', lessonId: lesson.id, taskId: lesson.taskId, requestedBy: personId, title: 'Keep this as space knowledge?', detail: lesson.text });
    this.changed();
    return lesson;
  }

  approveLesson(lesson, personId) {
    lesson.status = 'approved';
    lesson.approvedBy = personId;
    this.store.record({ type: 'lesson.approved', spaceId: lesson.spaceId, actor: personId, taskId: lesson.taskId, text: `kept as space knowledge: ${clipText(lesson.text)}` });
    this.memory.promoteLesson(lesson);
  }

  cancelTask(personId, taskId) {
    const task = this.task(personId, taskId);
    if (task.createdBy !== personId && task.ownerId !== personId) fail(403, 'Only the requester or agent owner can cancel');
    if (!OPEN_TASK.includes(task.status)) fail(409, 'This task is already finished');
    for (const approval of Object.values(this.s.approvals)) {
      if (approval.taskId === task.id && approval.status === 'pending') approval.status = 'cancelled';
    }
    this.setTaskStatus(task, 'cancelled', personId, 'cancelled the task');
    for (const child of Object.values(this.s.tasks)) if (child.parentId === task.id && ['queued', 'running', 'waiting', 'awaiting_approval'].includes(child.status)) this.cancelTask(child.createdBy, child.id);
    return task;
  }

  // ---------- approvals ----------

  requestApproval(fields) {
    const approval = { id: newId('apr'), status: 'pending', createdAt: now(), resolvedAt: null, ...fields };
    this.s.approvals[approval.id] = approval;
    this.telegram.approvalRequested(approval);
    this.store.record({ type: 'approval.requested', spaceId: approval.spaceId, actor: approval.requestedBy, taskId: approval.taskId, text: approval.title });
    this.changed();
    return approval;
  }

  resolveApproval(personId, approvalId, { decision }) {
    const approval = this.s.approvals[approvalId];
    if (!approval || approval.ownerId !== personId) fail(404, 'Approval not found');
    if (approval.status !== 'pending') fail(409, 'This request was already answered');
    approval.status = decision === 'approve' ? 'approved' : 'denied';
    approval.resolvedAt = now();
    this.store.record({ type: `approval.${approval.status}`, spaceId: approval.spaceId, actor: personId, taskId: approval.taskId, text: `${approval.status} · ${approval.title}` });
    if (approval.kind === 'lesson') {
      const lesson = this.s.lessons[approval.lessonId];
      if (lesson && lesson.status === 'pending') {
        if (approval.status === 'approved') this.approveLesson(lesson, personId);
        else lesson.status = 'declined';
      }
    }
    if (approval.kind === 'run_task') {
      const task = this.s.tasks[approval.taskId];
      if (task && task.status === 'awaiting_approval') {
        this.setTaskStatus(task, approval.status === 'approved' ? 'queued' : 'denied', personId);
        if (task.parentId && approval.status !== 'approved') this.answerParent(task, 'denied');
      }
    }
    this.changed();
    return approval;
  }

  // ---------- host work ----------

  workFor(host) {
    const agentIds = new Set(Object.values(this.s.agents).filter((a) => a.hostId === host.id).map((a) => a.id));
    const tasks = Object.values(this.s.tasks).filter((t) =>
      (agentIds.has(t.agentId) && ['queued', 'running'].includes(t.status) && !this.memory.pending(t)) ||
      (t.applyHostId === host.id && t.status === 'accepted'));
    const queries = [];
    for (const plan of Object.values(this.s.plans)) {
      for (const query of plan.queries) {
        if (agentIds.has(query.agentId) && query.status === 'pending') queries.push({ ...query, planId: plan.id, day: plan.day, title: plan.title });
      }
    }
    const approvals = Object.values(this.s.approvals).filter((a) => a.hostId === host.id && a.status !== 'pending' && !a.delivered);
    return { tasks: tasks.map((t) => ({ ...t, peers: this.peersOf(t) })), queries, approvals };
  }

  /** Other agents in the task's space that its agent may ask for help (none once it has asked enough). */
  peersOf(task) {
    if ((task.asks || []).length >= MAX_ASKS || task.parentId) return [];
    return Object.values(this.s.agents).filter((a) => a.id !== task.agentId && a.spaceIds.includes(task.spaceId))
      .map((a) => ({ name: a.name, owner: this.s.people[a.ownerId]?.name || 'someone', online: Boolean(this.s.hosts[a.hostId]?.online), apps: Boolean(a.usesApps), skills: a.skills || [] }));
  }

  // ---------- agents asking agents ----------

  /**
   * An agent stopped to ask another agent in the space (it wrote .larp/ask-<Name>.md). Larp turns the
   * request into a task for that agent, sent on behalf of the asker's owner, so the other owner approves
   * it as usual. The asking task waits, and resumes with the answer.
   */
  routeAsk(task, ask) {
    const asker = this.s.agents[task.agentId];
    const target = Object.values(this.s.agents).find((a) => a.id !== task.agentId && a.spaceIds.includes(task.spaceId) && a.name.toLowerCase() === String(ask.to || '').toLowerCase());
    const request = String(ask.text || '').trim().slice(0, 8000);
    if (!target || !request) return false;
    task.asks ||= [];
    if (task.asks.length >= MAX_ASKS || task.asks.some((a) => a.text === request)) return false;
    const child = this.createTask(task.ownerId, {
      spaceId: task.spaceId, agentId: target.id, kind: task.kind, parentId: task.id, askedBy: asker.id,
      title: clipText(`${asker.name} asks: ${request.split('\n')[0]}`, 120),
      instructions: [`${asker.name} (${this.s.people[asker.ownerId]?.name}'s agent) is working on "${task.title}" and asks you:`, '', request, '',
        'Do what is asked, then reply with a short, clear answer. Your answer and any changes you make go back to them.'].join('\n'),
    });
    child.parentId = task.id;
    child.askedBy = asker.id;
    task.asks.push({ id: newId('ask'), to: target.name, toId: target.id, text: request, childId: child.id, at: now(), answered: false });
    this.setTaskStatus(task, 'waiting', task.ownerId, `${asker.name} asked ${target.name}: ${clipText(request, 100)}`);
    return true;
  }

  /** The other agent finished (or couldn't): give its answer to the asking task and resume it. */
  answerParent(child, outcome) {
    const parent = this.s.tasks[child.parentId];
    const ask = parent?.asks?.find((a) => a.childId === child.id);
    if (!parent || !ask || ask.answered) return;
    const from = this.s.agents[child.agentId]?.name || 'The other agent';
    ask.answered = true;
    ask.answer = {
      ok: outcome === 'done',
      text: outcome === 'done' ? (child.result?.summary || 'Done.') : outcome === 'denied' ? `${this.s.people[child.ownerId]?.name} declined the request.` : `${from} couldn't finish: ${child.result?.error || 'unknown error'}`,
      diff: outcome === 'done' ? child.result?.diff || '' : '',
      files: outcome === 'done' ? child.result?.files || [] : [],
      repoId: child.repoId || null,
      at: now(),
    };
    if (outcome === 'done') {
      this.setTaskStatus(child, 'accepted', parent.ownerId, `sent the answer back to ${this.s.agents[parent.agentId]?.name}`);
      this.memory.handBack(child);
    }
    if (parent.status === 'waiting') {
      this.setTaskStatus(parent, 'queued', parent.ownerId, `${from} answered; ${this.s.agents[parent.agentId]?.name} continues`);
    }
  }

  hostTask(host, taskId) {
    const task = this.s.tasks[taskId];
    const agent = task && this.s.agents[task.agentId];
    const applying = task && task.applyHostId === host.id;
    if (!task || (!applying && (!agent || agent.hostId !== host.id))) fail(404, 'Task not assigned to this host');
    return task;
  }

  hostEvent(host, taskId, event) {
    const task = this.hostTask(host, taskId);
    if (event.type === 'started') {
      if (task.status !== 'queued') fail(409, 'Task is not queued');
      task.attempts.push({ startedAt: now(), messageCount: (task.messages || []).length });
      this.setTaskStatus(task, 'running', task.ownerId, `${this.s.agents[task.agentId]?.name} started work`);
      return { ok: true, task };
    }
    if (task.status !== 'running' && task.status !== 'applying' && task.status !== 'accepted') fail(409, 'Task is not running');
    if (event.type === 'log') {
      task.log.push({ at: now(), kind: String(event.kind || 'note').slice(0, 20), text: String(event.text || '').slice(0, 2000) });
      if (task.log.length > 300) task.log.splice(0, task.log.length - 300);
      task.updatedAt = now();
      if (['skill', 'app', 'agent', 'usage'].includes(event.kind)) this.store.record({ type: `agent.${event.kind}`, spaceId: task.spaceId, taskId: task.id, actor: task.agentId, text: String(event.text || '').slice(0, 2000) });
      this.changed();
    } else if (event.type === 'files') {
      task.files = (event.files || []).map(String).slice(0, 500);
      this.detectConflicts(task);
    } else {
      fail(400, 'Unknown event');
    }
    return { ok: true };
  }

  hostResult(host, taskId, result) {
    const task = this.hostTask(host, taskId);
    if (result.type === 'applied' || result.type === 'apply_failed') {
      if (task.status !== 'accepted') fail(409, 'Task is not being applied');
      task.applied = { ok: result.type === 'applied', branch: result.branch || null, message: String(result.message || '').slice(0, 2000), at: now() };
      this.setTaskStatus(task, result.type, task.createdBy,
        result.type === 'applied' ? `applied the change on branch ${result.branch}` : `could not apply the change: ${task.applied.message.slice(0, 120)}`);
      return { ok: true };
    }
    if (task.status !== 'running') fail(409, 'Task is not running');
    if (!result.error && ((task.messages || []).length > (task.attempts.at(-1)?.messageCount ?? (task.messages || []).length) || result.continuation)) {
      if (task.attempts.length >= 20) return this.hostResult(host, taskId, { error: 'Task reached the 20-turn limit. Review the trace before continuing.' });
      if (result.continuation) task.feedback.push({ by: task.ownerId, text: String(result.continuation).slice(0, 4000), at: now() });
      task.log.push({ at: now(), kind: 'note', text: result.summary || 'Continuing with new instructions' });
      const attempt = task.attempts.at(-1); if (attempt) attempt.finishedAt = now();
      this.setTaskStatus(task, 'queued', task.ownerId, 'continuing with updated context');
      return { ok: true };
    }
    if (result.ask && !result.error && this.routeAsk(task, result.ask)) {
      task.log.push({ at: now(), kind: 'note', text: `Asked ${result.ask.to}; waiting for the answer` });
      const attempt = task.attempts.at(-1);
      if (attempt) Object.assign(attempt, { finishedAt: now(), asked: result.ask.to });
      this.changed();
      return { ok: true, asked: true };
    }
    const check = result.check ? {
      command: task.check,
      passed: Boolean(result.check.passed),
      exitCode: result.check.exitCode ?? null,
      output: String(result.check.output || '').slice(-6000),
    } : null;
    task.result = {
      summary: String(result.summary || '').slice(0, 8000),
      diff: String(result.diff || '').slice(0, 400_000),
      files: (result.files || []).map(String).slice(0, 500),
      stat: String(result.stat || '').slice(0, 4000),
      branch: result.branch || null,
      check,
      error: result.error ? String(result.error).slice(0, 4000) : null,
      at: now(),
    };
    const attempt = task.attempts.at(-1);
    if (attempt) Object.assign(attempt, { finishedAt: now(), passed: check?.passed ?? null, error: task.result.error });
    task.files = task.result.files;
    this.detectConflicts(task);
    const agentName = this.s.agents[task.agentId]?.name;
    if (result.error) {
      this.setTaskStatus(task, 'failed', task.ownerId, `${agentName} could not finish: ${task.result.error.slice(0, 120)}`);
    } else {
      const verdict = !check ? 'finished (no check)' : check.passed ? 'finished · check passed' : 'finished · check FAILED';
      this.setTaskStatus(task, 'needs_review', task.ownerId, `${agentName} ${verdict}`);
    }
    this.memory.outcome(task);
    if (task.parentId) this.answerParent(task, result.error ? 'failed' : 'done');
    return { ok: true };
  }

  hostApproval(host, { taskId, planId, queryId, title, detail, kind }) {
    let spaceId;
    let ownerId;
    if (taskId) {
      const task = this.hostTask(host, taskId);
      spaceId = task.spaceId;
      ownerId = task.ownerId;
    } else {
      const plan = this.s.plans[planId];
      const query = plan?.queries.find((q) => q.id === queryId && this.s.agents[q.agentId]?.hostId === host.id && q.status === 'pending');
      if (!plan || !query) fail(404, 'Plan query not found');
      spaceId = plan.spaceId;
      ownerId = query.personId;
    }
    return this.requestApproval({
      spaceId, ownerId, hostId: host.id, taskId: taskId || null, planId: planId || null,
      kind: kind === 'share' ? 'share' : 'tool',
      title: text(title, 'Title', 200), detail: String(detail || '').slice(0, 4000), requestedBy: null,
    });
  }

  ackApproval(host, approvalId) {
    const approval = this.s.approvals[approvalId];
    if (!approval || approval.hostId !== host.id) fail(404, 'Approval not found');
    approval.delivered = true;
    this.store.save();
    return { ok: true };
  }

  detectConflicts(changed) {
    // Same repository: the same first commit when known, else the same name.
    const sameRepo = (a, b) => (a.repoId && b.repoId ? a.repoId === b.repoId : Boolean(a.repo) && a.repo === b.repo);
    // A task and the help it asked another agent for are one piece of work, not a conflict.
    const related = (a, b) => a.parentId === b.id || b.parentId === a.id;
    const open = Object.values(this.s.tasks).filter((t) =>
      t.spaceId === changed.spaceId && sameRepo(t, changed) && ['running', 'needs_review', 'accepted'].includes(t.status) && t.files.length);
    for (const task of open) {
      const before = JSON.stringify(task.conflicts);
      task.conflicts = open
        .filter((other) => other.id !== task.id && !related(task, other))
        .map((other) => ({ taskId: other.id, files: other.files.filter((f) => task.files.includes(f)) }))
        .filter((c) => c.files.length);
      if (task.conflicts.length && JSON.stringify(task.conflicts) !== before) {
        this.store.record({
          type: 'task.conflict', spaceId: task.spaceId, taskId: task.id,
          text: `${task.title} overlaps with ${task.conflicts.map((c) => this.s.tasks[c.taskId].title).join(', ')} on ${task.conflicts[0].files.slice(0, 3).join(', ')}`,
        });
      }
    }
    this.changed();
  }

  // ---------- home circle: plans ----------

  createPlan(personId, { spaceId, title, day, fields }) {
    const space = this.memberSpace(personId, spaceId);
    const allowed = ['availability', 'budget', 'calendar'];
    const wanted = (Array.isArray(fields) && fields.length ? fields : ['availability', 'budget']).filter((f) => allowed.includes(f));
    const plan = {
      id: newId('pln'), spaceId: space.id, createdBy: personId,
      title: text(title, 'Title', 120), day: text(day, 'Day', 20), fields: wanted,
      queries: space.memberIds.map((memberId) => {
        const agent = Object.values(this.s.agents).find((a) => a.ownerId === memberId && a.spaceIds.includes(space.id));
        return { id: newId('qry'), personId: memberId, agentId: agent?.id || null, fields: wanted, status: agent ? 'pending' : 'no_agent', answer: null };
      }),
      result: null,
      createdAt: now(),
    };
    this.s.plans[plan.id] = plan;
    this.store.record({ type: 'plan.created', spaceId: space.id, actor: personId, text: `asked everyone's agents about "${plan.title}" (${wanted.join(', ')})` });
    this.computePlan(plan);
    this.changed();
    return plan;
  }

  answerQuery(host, queryId, { answer }) {
    for (const plan of Object.values(this.s.plans)) {
      const query = plan.queries.find((q) => q.id === queryId);
      if (!query) continue;
      if (this.s.agents[query.agentId]?.hostId !== host.id) fail(403, 'Not your query');
      if (query.status !== 'pending') fail(409, 'Already answered');
      // Only the requested fields can come back, and each one must be either a value or a denial.
      const clean = {};
      for (const field of query.fields) {
        const value = answer?.[field];
        if (value && value.denied) clean[field] = { denied: true, reason: String(value.reason || 'Not shared').slice(0, 120) };
        else if (field === 'availability' && Array.isArray(value)) clean[field] = value.slice(0, 12).map((w) => ({ from: String(w.from).slice(0, 5), to: String(w.to).slice(0, 5) }));
        else if (field === 'budget' && Number.isFinite(Number(value))) clean[field] = Math.max(0, Math.round(Number(value)));
        else clean[field] = { denied: true, reason: 'No answer' };
      }
      query.answer = clean;
      query.status = 'answered';
      const person = this.s.people[query.personId]?.name;
      for (const [field, value] of Object.entries(clean)) {
        this.store.record({
          type: value?.denied ? 'plan.denied' : 'plan.shared', spaceId: plan.spaceId, actor: query.personId,
          text: value?.denied ? `${person}'s agent declined to share ${field} (${value.reason})` : `${person}'s agent shared ${field} only`,
        });
      }
      this.computePlan(plan);
      this.changed();
      return { ok: true };
    }
    fail(404, 'Query not found');
  }

  computePlan(plan) {
    const pending = plan.queries.filter((q) => q.status === 'pending').length;
    const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
    const toTime = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    let windows = null;
    const budgets = [];
    const missing = [];
    for (const query of plan.queries) {
      const name = this.s.people[query.personId]?.name;
      const availability = query.answer?.availability;
      if (plan.fields.includes('availability')) {
        if (!Array.isArray(availability)) { missing.push(`${name}: availability`); }
        else {
          const mine = availability.map((w) => [toMinutes(w.from), toMinutes(w.to)]).filter(([a, b]) => b > a);
          windows = windows === null ? mine : windows.flatMap(([a, b]) => mine.map(([c, d]) => [Math.max(a, c), Math.min(b, d)])).filter(([a, b]) => b - a >= 30);
        }
      }
      if (plan.fields.includes('budget')) {
        if (typeof query.answer?.budget === 'number') budgets.push(query.answer.budget);
        else missing.push(`${name}: budget`);
      }
    }
    plan.result = {
      pending,
      complete: pending === 0,
      windows: (windows || []).map(([a, b]) => ({ from: toTime(a), to: toTime(b) })),
      budgetPerPerson: budgets.length ? Math.min(...budgets) : null,
      missing,
    };
  }

  // ---------- home circle: expenses and checklists ----------

  addExpense(personId, { spaceId, description, amount, paidBy, splitAmong }) {
    const space = this.memberSpace(personId, spaceId);
    const value = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) fail(400, 'Enter a positive amount');
    const payer = paidBy || personId;
    if (!space.memberIds.includes(payer)) fail(400, 'Payer must be in the space');
    const split = (Array.isArray(splitAmong) && splitAmong.length ? splitAmong : space.memberIds).filter((id) => space.memberIds.includes(id));
    if (!split.length) fail(400, 'Split among at least one member');
    const expense = { id: newId('exp'), spaceId: space.id, description: text(description, 'Description', 120), amount: value, paidBy: payer, splitAmong: split, createdBy: personId, createdAt: now() };
    this.s.expenses[expense.id] = expense;
    this.store.record({ type: 'expense.added', spaceId: space.id, actor: personId, text: `${this.s.people[payer]?.name} paid ₹${value} for ${expense.description}` });
    this.changed();
    return expense;
  }

  removeExpense(personId, expenseId) {
    const expense = this.s.expenses[expenseId];
    if (!expense) fail(404, 'Expense not found');
    this.memberSpace(personId, expense.spaceId);
    delete this.s.expenses[expenseId];
    this.changed();
    return { ok: true };
  }

  settlement(spaceId) {
    const balance = {};
    for (const e of Object.values(this.s.expenses).filter((x) => x.spaceId === spaceId)) {
      const share = e.amount / e.splitAmong.length;
      balance[e.paidBy] = (balance[e.paidBy] || 0) + e.amount;
      for (const id of e.splitAmong) balance[id] = (balance[id] || 0) - share;
    }
    const debtors = Object.entries(balance).filter(([, v]) => v < -0.005).map(([id, v]) => ({ id, v: -v }));
    const creditors = Object.entries(balance).filter(([, v]) => v > 0.005).map(([id, v]) => ({ id, v }));
    const transfers = [];
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);
    let i = 0; let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].v, creditors[j].v);
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amount * 100) / 100 });
      debtors[i].v -= amount; creditors[j].v -= amount;
      if (debtors[i].v < 0.005) i++;
      if (creditors[j].v < 0.005) j++;
    }
    return { balance, transfers };
  }

  createChecklist(personId, { spaceId, title, items }) {
    const space = this.memberSpace(personId, spaceId);
    const list = {
      id: newId('chk'), spaceId: space.id, title: text(title, 'Title', 120), createdBy: personId, createdAt: now(),
      items: (Array.isArray(items) ? items : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 50)
        .map((t) => ({ id: newId('itm'), text: t.slice(0, 200), ownerId: null, done: false })),
    };
    this.s.checklists[list.id] = list;
    this.telegram.checklistCreated(list);
    this.store.record({ type: 'checklist.created', spaceId: space.id, actor: personId, text: `started checklist "${list.title}"` });
    this.changed();
    return list;
  }

  updateChecklistItem(personId, listId, itemId, { ownerId, done, take }) {
    const list = this.s.checklists[listId];
    if (!list) fail(404, 'Checklist not found');
    const space = this.memberSpace(personId, list.spaceId);
    const item = list.items.find((i) => i.id === itemId);
    if (!item) fail(404, 'Item not found');
    if (take) item.ownerId = personId;
    else if (ownerId !== undefined) {
      if (ownerId && !space.memberIds.includes(ownerId)) fail(400, 'Owner must be in the space');
      item.ownerId = ownerId || null;
    }
    if (done !== undefined) item.done = Boolean(done);
    this.store.record({ type: 'checklist.updated', spaceId: list.spaceId, actor: personId, text: `${item.done ? 'completed' : 'updated'} "${item.text}"${item.ownerId ? ` · ${this.s.people[item.ownerId]?.name}` : ''}` });
    this.changed();
    return list;
  }

  /** The keeper is the first member of a space; they run space-wide settings such as the Telegram bot. */
  isKeeper(personId) {
    return Object.values(this.s.spaces).some((sp) => sp.memberIds[0] === personId);
  }

  keeperOnly(personId) {
    if (!this.isKeeper(personId)) fail(403, 'Only the person who started the space can change this');
  }

  // ---------- agent memory ----------

  toggleMemory(personId, { on }) {
    if (!this.memory.configured) fail(409, 'Agent memory is off on this computer (LARP_CLOUD=off and no Meko key)');
    this.memory.setOn(on);
    this.store.record({ type: 'memory.toggled', actor: personId, text: `turned agent memory ${this.memory.on ? 'on' : 'off'}` });
    this.changed();
    return { on: this.memory.on };
  }

  async forgetMemory(personId, { datapack, memoryId, taskId }) {
    if (taskId) this.task(personId, taskId);
    if (!datapack || !memoryId) fail(400, 'Which memory?');
    await this.memory.forget(personId, { datapack: String(datapack), memoryId: String(memoryId), taskId });
    this.store.record({ type: 'memory.forgot', actor: personId, taskId, spaceId: taskId ? this.s.tasks[taskId]?.spaceId : undefined, text: 'removed a memory an agent recalled' });
    this.changed();
    return { ok: true };
  }

  /** Run an agent's nightly review now (or every agent's, without an agentId). */
  async sleepNow(personId, { agentId } = {}) {
    if (!this.memory.on) fail(409, 'Turn on agent memory (Meko) first');
    if (agentId) {
      const agent = this.s.agents[agentId];
      if (!agent || !agent.spaceIds.some((id) => this.s.spaces[id]?.memberIds.includes(personId))) fail(404, 'Agent not found');
      return this.memory.sleep(agentId);
    }
    await this.memory.sleepAll();
    return { ok: true };
  }

  /** Counts for the memory view: from YugabyteDB over the full history when connected, else the recent log. */
  async memoryStats(personId) {
    const spaceIds = Object.values(this.s.spaces).filter((sp) => sp.memberIds.includes(personId)).map((sp) => sp.id);
    if (this.db) return { source: 'yugabyte', ...(await this.db.stats(spaceIds)) };
    const calls = this.s.mekoCalls.filter((c) => !c.skipped && (!c.spaceId || spaceIds.includes(c.spaceId)));
    const byKind = {};
    for (const c of calls) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    return { source: 'recent', total: calls.length, saved: calls.reduce((n, c) => n + (c.saved || 0), 0), byKind, byAgent: [], days: [] };
  }

  // ---------- views ----------

  viewFor(personId) {
    const spaces = Object.values(this.s.spaces).filter((sp) => sp.memberIds.includes(personId));
    const spaceIds = new Set(spaces.map((sp) => sp.id));
    const peopleIds = new Set(spaces.flatMap((sp) => sp.memberIds));
    const inSpaces = (x) => spaceIds.has(x.spaceId);
    const agents = Object.values(this.s.agents).filter((a) => a.spaceIds.some((id) => spaceIds.has(id)));
    const busy = new Set(Object.values(this.s.tasks).filter((t) => t.status === 'running').map((t) => t.agentId));
    return {
      version: this.s.version,
      me: this.s.people[personId],
      phones: Object.values(this.s.tokens).filter((x) => x.personId === personId && x.kind === 'phone').length,
      spaces,
      people: [...peopleIds].map((id) => this.s.people[id]).filter(Boolean),
      hosts: Object.values(this.s.hosts).filter((h) => h.ownerId === personId || agents.some((a) => a.hostId === h.id))
        .map(({ id, name, ownerId, online, lastSeen }) => ({ id, name, ownerId, online, lastSeen })),
      agents: agents.map((a) => ({ ...a, online: Boolean(this.s.hosts[a.hostId]?.online), busy: busy.has(a.id) })),
      // Each task's latest log lines only: the window redraws on every change.
      tasks: Object.values(this.s.tasks).filter(inSpaces).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((t) => (t.log?.length > LOG_IN_VIEW ? { ...t, log: t.log.slice(-LOG_IN_VIEW), logTrimmed: t.log.length - LOG_IN_VIEW } : t)),
      approvals: Object.values(this.s.approvals).filter((a) => a.ownerId === personId && a.status === 'pending'),
      waitingOn: Object.values(this.s.approvals).filter((a) => inSpaces(a) && a.status === 'pending' && a.ownerId !== personId)
        .map(({ id, spaceId, ownerId, taskId, title, kind }) => ({ id, spaceId, ownerId, taskId, title, kind })),
      plans: Object.values(this.s.plans).filter(inSpaces).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      expenses: Object.values(this.s.expenses).filter(inSpaces),
      settlements: Object.fromEntries(spaces.map((sp) => [sp.id, this.settlement(sp.id)])),
      checklists: Object.values(this.s.checklists).filter(inSpaces),
      events: this.s.events.filter(inSpaces).slice(-200),
      memory: this.memory.view(spaceIds, agents),
      telegram: { ...this.telegram.view(personId), keeper: this.isKeeper(personId) },
    };
  }

  // ---------- live updates ----------

  changed() {
    this.store.save();
    if (this.broadcastTimer) return;
    // Every change makes every window fetch the whole state again. A running agent logs many lines a
    // second, so tell windows at most every 300 ms while busy (the first change after a quiet moment
    // still goes out in 60 ms); otherwise the window spends all its time re-downloading and redrawing.
    const wait = Math.max(60, 300 - (Date.now() - (this.lastBroadcast || 0)));
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.lastBroadcast = Date.now();
      for (const stream of this.streams) stream.write(`event: changed\ndata: ${JSON.stringify({ version: this.s.version })}\n\n`);
    }, wait);
  }

  // ---------- HTTP ----------

  async listen({ port = 47821, host = '127.0.0.1', staticDir } = {}) {
    this.staticDir = staticDir;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, resolve);
    });
    this.heartbeat = setInterval(() => { for (const s of this.streams) s.write(': ping\n\n'); }, 25_000);
    this.address = { port: this.server.address().port, host };
    // Agents sleep once a night: around 3 a.m. each reviews and tidies its own memory.
    this.nightly = setInterval(() => {
      const now = new Date(); const day = now.toISOString().slice(0, 10);
      if (now.getHours() === 3 && this.s.settings.sleptOn !== day && this.memory.on) { this.s.settings.sleptOn = day; this.memory.sleepAll(); }
    }, 10 * 60_000);
    return this.urls();
  }

  urls() {
    if (!this.address) return [];
    const { port, host } = this.address;
    if (host !== '0.0.0.0') return [`http://${host}:${port}`];
    const lan = Object.values(os.networkInterfaces()).flat().filter((x) => x && x.family === 'IPv4' && !x.internal).map((x) => `http://${x.address}:${port}`);
    return [`http://127.0.0.1:${port}`, ...lan];
  }

  async close() {
    clearInterval(this.heartbeat);
    clearInterval(this.nightly);
    clearInterval(this.dbRetry);
    clearTimeout(this.dbFirstTry);
    await this.telegram.stop();
    for (const stream of this.streams) stream.end();
    this.streams.clear();
    if (this.server) {
      this.server.closeAllConnections();
      await new Promise((resolve) => this.server.close(resolve));
    }
    await this.store.flush();
    await this.db?.close().catch(() => {});
    await this.memory.meko?.close();
  }

  async readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) fail(413, 'Request too large');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON'); }
  }

  async handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) return await this.serveStatic(url, res);
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
      if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, larp: true, setup: Boolean(this.setupCode) })); }
      if (url.pathname === '/api/stream' && req.method === 'GET') return this.openStream(token, res);
      const body = req.method === 'POST' ? await this.readBody(req) : {};
      const result = await this.route(req.method, url.pathname.slice(5).split('/'), token, body, url);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('[larp] coordinator error:', error);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the coordinator' : error.message }));
    }
  }

  openStream(token, res) {
    const auth = this.auth(token);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: changed\ndata: ${JSON.stringify({ version: this.s.version })}\n\n`);
    res.hostId = auth.hostId;
    this.streams.add(res);
    if (auth.kind === 'host') this.setHostOnline(auth.hostId, true);
    res.on('close', () => {
      this.streams.delete(res);
      if (auth.kind === 'host' && ![...this.streams].some((s) => s.hostId === auth.hostId)) this.setHostOnline(auth.hostId, false);
    });
  }

  route(method, parts, token, body) {
    const [a, b, c, d] = parts;
    // Route keys replace ids with placeholders: "POST tasks/:id/revise", "POST checklists/:id/items/:item".
    const collections = ['tasks', 'approvals', 'expenses', 'checklists'];
    const key = [method + ' ' + a, b && (collections.includes(a) ? ':id' : b), c, d && ':item'].filter(Boolean).join('/');
    // Unauthenticated routes: redeeming one-time codes.
    if (key === 'POST join' && !token) return this.join(body);
    if (key === 'POST pair/claim') return this.claimPairCode(body);
    const auth = this.auth(token);

    if (a === 'host') {
      const host = this.hostOf(auth);
      const sub = parts.slice(1);
      const route = `${method} ${sub[0]}${sub[2] ? '/' + sub[2] : ''}`;
      switch (route) {
        case 'GET me': return { host, agents: Object.values(this.s.agents).filter((x) => x.hostId === host.id), spaces: Object.values(this.s.spaces) };
        case 'GET work': return this.workFor(host);
        case 'POST agents': return this.registerAgent(host, body);
        case 'POST agents/update': return this.updateAgent(host, sub[1], body);
        case 'POST agents/remove': return this.removeAgent(host, sub[1]);
        case 'POST tasks/spawn': return this.spawnForTask(host, sub[1], body);
        case 'POST tasks/event': return this.hostEvent(host, sub[1], body);
        case 'POST tasks/result': return this.hostResult(host, sub[1], body);
        case 'POST approvals': return this.hostApproval(host, body);
        case 'GET approvals': {
          const approval = this.s.approvals[sub[1]];
          if (!approval || approval.hostId !== host.id) fail(404, 'Approval not found');
          return { approval };
        }
        case 'POST approvals/ack': return this.ackApproval(host, sub[1]);
        case 'POST queries/answer': return this.answerQuery(host, sub[1], body);
        default: fail(404, 'Unknown host route');
      }
    }

    const me = this.person(auth);
    switch (key) {
      case 'GET state': return this.viewFor(me.id);
      case 'POST join': return this.join(body, auth);
      case 'POST spaces': return this.createSpace(me.id, body);
      case 'POST invites': return this.createInvite(me.id, body.spaceId);
      case 'POST pair': return this.createPairCode(me.id);
      case 'POST devices/revoke': return this.revokeDevices(me.id, body.kind === 'desktop' ? 'desktop' : 'phone');
      case 'POST hosts': return this.registerHost(me.id, body);
      case 'POST tasks': return this.createTask(me.id, body);
      case 'POST tasks/:id/message': return this.messageTask(me.id, b, body);
      case 'POST workspace/action': {
        if (!this.localAction) fail(503, 'The desktop host is not ready');
        if (['saveKey', 'githubLogin'].includes(body.action)) fail(403, 'Connect credentials on the desktop');
        return this.localAction(me.id, body);
      }
      case 'POST tasks/:id/revise': return this.reviseTask(me.id, b, body);
      case 'POST tasks/:id/accept': return this.acceptTask(me.id, b, body);
      case 'POST tasks/:id/cancel': return this.cancelTask(me.id, b);
      case 'POST approvals/:id': return this.resolveApproval(me.id, b, body);
      case 'POST plans': return this.createPlan(me.id, body);
      case 'POST expenses': return this.addExpense(me.id, body);
      case 'DELETE expenses/:id': return this.removeExpense(me.id, b);
      case 'POST checklists': return this.createChecklist(me.id, body);
      case 'POST lessons': return this.proposeLesson(me.id, body);
      case 'POST memory/toggle': return this.toggleMemory(me.id, body);
      case 'POST memory/forget': return this.forgetMemory(me.id, body);
      case 'POST memory/sleep': return this.sleepNow(me.id, body);
      case 'GET memory/stats': return this.memoryStats(me.id);
      case 'POST telegram/connect': this.keeperOnly(me.id); return this.telegram.connect(body.token);
      case 'POST telegram/disconnect': this.keeperOnly(me.id); return this.telegram.disconnect();
      case 'POST telegram/link': {
        // A keeper may make a link for someone in their space (for example a family member without a computer).
        const personId = body.personId || me.id;
        if (personId !== me.id) {
          this.keeperOnly(me.id);
          if (!Object.values(this.s.spaces).some((sp) => sp.memberIds[0] === me.id && sp.memberIds.includes(personId))) fail(403, 'That person is not in your space');
        }
        return this.telegram.linkFor(personId);
      }
      case 'POST telegram/invite': return this.telegram.inviteLink(me.id, body.spaceId);
      case 'POST telegram/unlink': return this.telegram.unlink(me.id);
      case 'POST checklists/:id/items/:item': return this.updateChecklistItem(me.id, b, d, body);
      default: fail(404, 'Unknown route');
    }
  }

  async serveStatic(url, res) {
    if (!this.staticDir) fail(404, 'Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    const root = path.resolve(this.staticDir);
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root + path.sep)) fail(400, 'Invalid path');
    let data;
    try { data = await fs.readFile(target); } catch { fail(404, 'Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  }
}
