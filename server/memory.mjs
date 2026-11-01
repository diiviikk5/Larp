// Agent memory for Larp, kept in Meko. Each agent has its own datapack, so what it learns
// persists across days and machines. Each space has one datapack for knowledge a person approved.
// Agents share context by leaving notes in each other's datapacks:
//   - before a delegated task, the requester's agent hands over what it knows about the topic;
//   - after the result is accepted, the working agent hands the outcome back.
// On top of plain recall, three things only a multi-person harness needs:
//   - knowledge royalties: Meko reports how many tokens each recall saved; Larp credits the
//     people and agents whose memories did the saving, when someone else's agent reuses them;
//   - sleep: each night an agent reviews its datapack, merges duplicates, forgets stale notes and
//     suggests lessons worth sharing, for a person to approve in the morning;
//   - a proof locker: every result's diff is a Meko artifact, keyed by its content, so a result
//     identical to an earlier one is recognised as a duplicate of that task.
// Private home data (calendars, budgets) never goes to Meko; only task work does.

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const PENDING_LIMIT_MS = 20_000;
const HANDOFF_TTL_DAYS = 7;
const TEAM_PACK = 'team'; // <LARP_TEAM>-team: the one datapack holding the team's memory
const SUGGEST_AFTER_REUSES = 2;
// Shared libraries every agent can search before a task: documents uploaded to <team>-skills and
// <team>-apps. Larp only reads them and never creates them, so a team without them spends no datapacks.
const LIBRARIES = [{ pack: 'skills', source: 'skill', from: 'Skills catalog' }, { pack: 'apps', source: 'app', from: 'Larp apps' }];
// knowledgebase_search always returns something. On real Meko, useful passages match on words too
// ("hybrid") or sit close in meaning; unrelated ones are meaning-only and further than this.
const LIBRARY_MAX_DISTANCE = 0.75;
const relevant = (h) => h.match === 'hybrid' || (h.distance !== null && h.distance <= LIBRARY_MAX_DISTANCE);
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

export class Memory {
  constructor(coordinator, meko) {
    this.c = coordinator;
    this.meko = meko;
  }

  get s() { return this.c.s; }
  get configured() { return Boolean(this.meko?.configured); }
  get on() { return this.configured && this.s.settings.meko !== false; }

  setOn(on) {
    this.s.settings.meko = Boolean(on);
    this.meko?.setEnabled(this.on);
  }

  /**
   * One Meko datapack holds the whole team's memory (<LARP_TEAM>-team), so Larp fits Meko's free tier,
   * which allows very few datapacks. Inside it Meko keeps a separate memory collection per agent_id:
   * each agent remembers under its own key, and each space's approved lessons under the space's key.
   * Lessons also carry their space in metadata, and recall drops another space's knowledge.
   */
  spacePack() { return TEAM_PACK; }
  packOf() { return TEAM_PACK; }
  memKey(agent) { return `agent-${slug(agent.name)}-${agent.id.slice(-4)}`; }
  spaceKey(space) { return `space-${slug(space.name)}-${space.id.slice(-4)}`; }

  /** Drop recalled shared knowledge that belongs to another space (promoted lessons are team-wide in Meko). */
  ownSpace(items, space) {
    const elsewhere = Object.values(this.s.lessons || {}).filter((l) => l.spaceId !== space.id).map((l) => l.text);
    return items.filter((h) => {
      const tagged = h.metadata?.space;
      if (tagged) return tagged === space.id;
      return !elsewhere.some((t) => t && h.text && (t.includes(h.text.slice(0, 60)) || h.text.includes(t.slice(0, 60))));
    });
  }

  /** Agents of the requester in the task's space: they speak for the requester in hand-offs. */
  requesterAgents(task) {
    return Object.values(this.s.agents).filter((a) => a.ownerId === task.createdBy && a.spaceIds.includes(task.spaceId) && a.id !== task.agentId);
  }

  meta(task, extra = {}) {
    const agent = this.s.agents[task.agentId];
    return { agentId: agent?.id, spaceId: task.spaceId, taskId: task.id, ...extra };
  }

  /** Is the task still waiting for its recalled context? Hosts hold it back briefly while it is. */
  pending(task) {
    return task.context?.status === 'pending' && Date.now() - Date.parse(task.context.at) < PENDING_LIMIT_MS;
  }

  run(label, fn, onError) {
    fn().catch((error) => { console.error(`[larp memory] ${label}:`, error.message); onError?.(error); }).finally(() => this.c.changed());
  }

  // ---------- before work: recall (and pay royalties) ----------

  prepare(task) {
    if (!this.on) { task.context = { status: 'off', items: [], at: new Date().toISOString() }; return; }
    task.context = { status: 'pending', items: [], at: new Date().toISOString() };
    this.run('recall', async () => {
      const agent = this.s.agents[task.agentId];
      const space = this.s.spaces[task.spaceId];
      const query = `${task.title}\n${task.instructions}`.slice(0, 1000);
      const items = [];
      let saved = 0;
      const qualities = [];
      // Meko stores memories as extracted facts, so one fact can come back in several wordings:
      // keep the first of near-duplicates, leaving room for the memories that differ.
      const add = (source, from, hits) => {
        for (const h of hits) if (h.text && !items.some((i) => i.text === h.text || similar(i.text, h.text) >= 0.6)) items.push({ ...h, source, from });
      };
      // A recalled lesson of this space is shown as the person approved it; Meko decided it's relevant.
      const asApproved = (hits) => hits.map((h) => {
        const mine = Object.values(this.s.lessons || {}).filter((l) => l.spaceId === space.id && l.status === 'promoted');
        const lesson = mine.find((l) => l.memoryId === h.id) || mine.find((l) => similar(l.text, h.text) >= 0.15);
        return lesson ? { ...h, text: lesson.text, lessonId: lesson.id } : h;
      });
      const [own, shared] = await Promise.all([
        this.meko.search({ agent: agent.name, key: this.memKey(agent), datapack: this.spacePack(space), query, limit: 8, meta: this.meta(task) }),
        this.meko.search({ agent: agent.name, key: this.spaceKey(space), datapack: this.spacePack(space), query, source: 'auto', meta: this.meta(task, { space: true, summary: `space knowledge: ${task.title}` }) }),
      ]);
      for (const r of [own, shared]) { saved += r.saved; if (r.quality) qualities.push(r.quality); this.payRoyalties(r, `agent:${agent.id}`, task); }
      add('memory', agent.name, own.items);
      add('space', space.name, asApproved(this.ownSpace(shared.items, space)));
      // Delegated: the requester's agents hand over what they know about this topic.
      if (task.createdBy !== agent.ownerId) {
        const requester = this.s.people[task.createdBy]?.name || 'Someone';
        for (const theirs of this.requesterAgents(task)) {
          const found = await this.meko.search({ agent: theirs.name, key: this.memKey(theirs), datapack: this.spacePack(space), query, limit: 3, meta: this.meta(task, { agentId: theirs.id }) });
          const known = found.items.filter((h) => h.score === null || h.score >= 0.3);
          if (!known.length) continue;
          saved += found.saved;
          this.payRoyalties(found, `agent:${agent.id}`, task);
          const note = `Hand-off from ${requester}'s agent ${theirs.name} for "${task.title}": ${known.map((h) => h.text).join(' | ')}`;
          const written = await this.meko.remember({
            agent: theirs.name, key: this.memKey(agent), datapack: this.spacePack(space), text: clip(note, 1500),
            metadata: { kind: 'handoff', author: `agent:${theirs.id}`, task: task.id },
            meta: this.meta(task, { agentId: theirs.id, to: agent.name, toId: agent.id }),
          });
          items.push({ id: written.id, text: note, score: null, source: 'handoff', from: theirs.name, datapack: this.spacePack(space) });
        }
      }
      for (const item of items) item.datapack ||= this.spacePack(space);
      const library = [];
      for (const lib of LIBRARIES) {
        // Libraries are extras: if one can't be reached, the agent still gets its memory and lessons.
        let found;
        try {
          if (!(await this.meko.find(lib.pack, agent.name))) continue;
          // knowledgebase_search, not context_search: context_search's fixed cutoff drops most catalog matches.
          found = await this.meko.knowledge({ agent: agent.name, datapack: lib.pack, query, limit: 3, meta: this.meta(task, { summary: `${lib.pack} library: ${task.title}` }) });
        } catch (error) {
          console.error(`[larp memory] ${lib.pack} library skipped:`, error.message);
          continue;
        }
        // The same section can exist twice while an old copy of a document is still uploaded: keep the fuller one.
        const best = new Map();
        for (const h of found) {
          const key = h.text.split('\n')[0];
          if (h.text && relevant(h) && (!best.has(key) || h.text.length > best.get(key).text.length)) best.set(key, h);
        }
        const fresh = [...best.values()];
        for (const h of fresh.slice(0, 2)) library.push({ id: h.id, text: h.text, score: h.distance === null ? null : 1 - h.distance, source: lib.source, from: lib.from, datapack: this.meko.name(lib.pack) });
      }
      task.context = { status: 'ready', items: [...items.slice(0, 10), ...library], at: new Date().toISOString(), saved, quality: qualities.includes('high') ? 'high' : qualities[0] || null };
    }, (error) => {
      // Memory couldn't be reached: let the agent start now rather than hold the task.
      task.context = { status: 'unavailable', items: [], at: new Date().toISOString(), error: clip(error.message, 200) };
    });
  }

  /**
   * Split what a recall saved among the authors of the memories it returned, by score. Only reuse by
   * someone else's agent earns credit: the point is to show whose knowledge helps the rest of the space.
   */
  payRoyalties(result, recipient, task) {
    const ledger = (this.s.royalties ||= {});
    const totals = (this.s.memoryTotals ||= { saved: 0, recalls: 0 });
    totals.saved += result.saved; totals.recalls += 1;
    const credited = result.items.filter((i) => i.metadata?.author && i.metadata.author !== recipient);
    for (const i of result.items) if (i.id) (this.s.memoryUse ||= {})[i.id] = ((this.s.memoryUse || {})[i.id] || 0) + 1;
    if (!credited.length || !result.saved) return;
    const weight = (i) => Math.max(0.05, i.score ?? 0.5);
    const total = credited.reduce((s, i) => s + weight(i), 0);
    for (const i of credited) {
      const share = Math.round((result.saved * weight(i)) / total);
      const entry = (ledger[i.metadata.author] ||= { saved: 0, reuses: 0, beneficiaries: {}, items: {} });
      entry.saved += share; entry.reuses += 1;
      entry.beneficiaries[recipient] = (entry.beneficiaries[recipient] || 0) + 1;
      const item = (entry.items[i.id] ||= { text: clip(i.text, 220), reuses: 0, saved: 0 });
      item.reuses += 1; item.saved += share; item.lastAt = new Date().toISOString(); item.lastTask = task?.id || null;
    }
  }

  // ---------- after work: remember ----------

  /** The working agent remembers what it did, so a later task (days later) starts from it. */
  outcome(task) {
    if (!this.on || !task.result) return;
    this.run('outcome', async () => {
      const agent = this.s.agents[task.agentId];
      const r = task.result;
      const verdict = r.error ? `failed: ${r.error.slice(0, 300)}` : !r.check ? 'finished' : r.check.passed ? 'finished, check passed' : 'finished, check failed';
      await this.meko.converse({
        agent: agent.name, key: this.memKey(agent), datapack: this.packOf(task),
        input: clip(`Task "${task.title}" in ${task.repo || 'a folder'}: ${task.instructions}`, 3000),
        output: clip(`${verdict}. ${r.summary || ''}${r.files?.length ? ` Files: ${r.files.join(', ')}.` : ''}`, 3000),
        metadata: { kind: 'outcome', author: `agent:${agent.id}`, task: task.id },
        meta: this.meta(task),
      });
      await this.proof(task);
    });
  }

  /** Reviewer feedback is the most durable lesson: remember it for this agent's future work. */
  feedback(task, text, personId) {
    if (!this.on) return;
    this.run('feedback', async () => {
      const agent = this.s.agents[task.agentId];
      const who = this.s.people[personId]?.name || 'A reviewer';
      await this.meko.remember({
        agent: agent.name, key: this.memKey(agent), datapack: this.packOf(task),
        text: clip(`${who} asked for a change on "${task.title}"${task.repo ? ` in ${task.repo}` : ''}: ${text}`, 1500),
        metadata: { kind: 'feedback', author: `person:${personId}`, task: task.id }, meta: this.meta(task),
      });
    });
  }

  /** Accepted delegated work: the working agent hands the outcome back to the requester's agents. */
  handBack(task) {
    if (!this.on || task.createdBy === task.ownerId) return;
    this.run('hand back', async () => {
      const agent = this.s.agents[task.agentId];
      const owner = this.s.people[task.ownerId]?.name || 'A teammate';
      const r = task.result || {};
      const note = clip(`${owner}'s agent ${agent.name} did "${task.title}" for you${task.repo ? ` in ${task.repo}` : ''}; accepted. ${r.summary || ''}${r.files?.length ? ` Changed: ${r.files.join(', ')}.` : ''}`, 1500);
      for (const theirs of this.requesterAgents(task)) {
        await this.meko.remember({
          agent: agent.name, key: this.memKey(theirs), datapack: this.packOf(task), text: note,
          metadata: { kind: 'handback', author: `agent:${agent.id}`, task: task.id },
          meta: this.meta(task, { to: theirs.name, toId: theirs.id }),
        });
      }
    });
  }

  // ---------- proof locker ----------

  /**
   * Keep the result's diff as a Meko artifact named after its task. Meko stores artifacts by content,
   * so if the same change was produced before, it answers with that first task's filename.
   */
  async proof(task) {
    const r = task.result;
    if (!r || r.error) return;
    // Index lines carry blob hashes that differ between clones; drop them so equal changes match.
    const body = (r.diff || '').split('\n').filter((l) => !l.startsWith('index ')).join('\n').trim();
    if (!body) return;
    const agent = this.s.agents[task.agentId];
    const filename = `proof-${task.id}.patch`;
    const stored = await this.meko.artifact({ agent: agent.name, key: this.memKey(agent), datapack: this.packOf(task), filename, text: `${body}\n`, contentType: 'text/x-diff', meta: this.meta(task, { summary: `proof of "${task.title}"` }) });
    const original = stored.duplicate ? stored.filename.match(/^proof-(.+)\.patch$/)?.[1] || null : null;
    task.proof = { artifactId: stored.artifactId, hash: stored.hash, size: stored.size, duplicateOf: original && original !== task.id ? original : null, at: new Date().toISOString(), check: r.check ? r.check.passed : null };
    (this.s.proofs ||= {})[stored.hash || task.id] = { taskId: task.proof.duplicateOf || task.id, firstAt: this.s.proofs?.[stored.hash]?.firstAt || task.proof.at, seenBy: [...new Set([...(this.s.proofs?.[stored.hash]?.seenBy || []), task.id])] };
    if (task.proof.duplicateOf) {
      const first = this.s.tasks[task.proof.duplicateOf];
      this.c.store.record({ type: 'proof.duplicate', spaceId: task.spaceId, taskId: task.id, text: `${agent.name}'s result is identical to ${first ? `"${first.title}"` : 'an earlier result'}; Meko already held that proof` });
    }
  }

  // ---------- sleep: the nightly review ----------

  /**
   * An agent reviews everything in its datapack: merges near-duplicates (keeping the newest, with the
   * fuller text), forgets hand-off notes older than a week, and suggests memories other agents keep
   * reusing as lessons. Nothing is shared until a person approves the suggestion.
   */
  async sleep(agentId) {
    const agent = this.s.agents[agentId];
    if (!agent || !this.on) return null;
    const key = this.memKey(agent);
    const meta = { agentId: agent.id, summary: `${agent.name} reviews its memory` };
    const pack = this.packOf();
    const all = (await this.meko.listAll({ agent: agent.name, key, datapack: pack, meta })).map((m) => ({ ...m, pack }));
    all.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const digest = { at: new Date().toISOString(), reviewed: all.length, merged: [], forgot: [], suggest: [] };
    const gone = new Set();
    for (const keep of all) {
      if (gone.has(keep.id)) continue;
      const twins = all.filter((m) => m.id !== keep.id && m.pack === keep.pack && !gone.has(m.id) && similar(m.text, keep.text) >= 0.8);
      if (!twins.length) continue;
      const fullest = [keep, ...twins].reduce((a, b) => (b.text.length > a.text.length ? b : a));
      if (fullest.text !== keep.text) await this.meko.correct({ agent: agent.name, key, datapack: keep.pack, memoryId: keep.id, text: fullest.text, meta });
      for (const t of twins) { await this.meko.forget({ agent: agent.name, key, datapack: t.pack, memoryId: t.id, meta }); gone.add(t.id); }
      digest.merged.push({ kept: keep.id, removed: twins.map((t) => t.id), text: clip(fullest.text, 200) });
    }
    const stale = Date.now() - HANDOFF_TTL_DAYS * 86400000;
    for (const m of all) {
      if (gone.has(m.id) || !/^Hand-off from /.test(m.text) || !m.at || Date.parse(m.at) > stale) continue;
      await this.meko.forget({ agent: agent.name, key, datapack: m.pack, memoryId: m.id, meta });
      gone.add(m.id);
      digest.forgot.push({ id: m.id, text: clip(m.text, 160), reason: `hand-off note older than ${HANDOFF_TTL_DAYS} days` });
    }
    const lessons = Object.values(this.s.lessons || {}).map((l) => l.text);
    for (const m of all) {
      const uses = this.s.memoryUse?.[m.id] || 0;
      if (gone.has(m.id) || uses < SUGGEST_AFTER_REUSES || /^Hand-off from /.test(m.text) || lessons.some((t) => similar(t, m.text) > 0.6)) continue;
      digest.suggest.push({ memoryId: m.id, text: clip(m.text, 300), uses });
    }
    (this.s.sleep ||= {})[agent.id] = digest;
    const parts = [digest.merged.length && `merged ${digest.merged.length}`, digest.forgot.length && `forgot ${digest.forgot.length}`, digest.suggest.length && `suggests ${digest.suggest.length} lesson${digest.suggest.length > 1 ? 's' : ''}`].filter(Boolean);
    this.c.store.record({ type: 'memory.slept', spaceId: agent.spaceIds[0], text: `${agent.name} slept: reviewed ${digest.reviewed} memories${parts.length ? `, ${parts.join(', ')}` : ', nothing to tidy'}` });
    this.c.changed();
    return digest;
  }

  async sleepAll() {
    for (const a of Object.values(this.s.agents)) await this.sleep(a.id).catch((e) => console.error('[larp memory] sleep', a.name, e.message));
  }

  // ---------- space knowledge: proposed, approved by a person, then promoted ----------

  /** Write a proposed lesson into the space datapack. Resolves to the memory id to promote. */
  async writeLesson(lesson) {
    const task = lesson.taskId && this.s.tasks[lesson.taskId];
    const author = task ? this.s.agents[task.agentId]?.name : this.s.people[lesson.proposedBy]?.name;
    const space = this.s.spaces[lesson.spaceId];
    const meta = { agentId: task?.agentId, spaceId: space.id, taskId: lesson.taskId, to: space.name, space: true };
    const saved = await this.meko.remember({
      agent: author || 'person', key: this.spaceKey(space), datapack: this.spacePack(space), text: lesson.text,
      metadata: { kind: 'lesson', author: `person:${lesson.proposedBy}`, task: lesson.taskId, space: space.id }, meta,
    });
    if (saved.id) return saved.id;
    // Meko may extract memories asynchronously; find the one just written.
    await new Promise((r) => setTimeout(r, 1500));
    const hits = await this.meko.recall({ agent: author || 'person', key: this.spaceKey(space), datapack: this.spacePack(space), query: lesson.text, limit: 3, meta });
    return hits.find((h) => h.text && lesson.text.includes(h.text.slice(0, 40)))?.id || hits[0]?.id || null;
  }

  /** One-way promotion into the space's shared knowledge, after a person approved it. */
  promoteLesson(lesson) {
    if (!this.on) return;
    this.run('promote', async () => {
      const space = this.s.spaces[lesson.spaceId];
      const id = lesson.memoryId || await this.writeLesson(lesson);
      if (!id) throw new Error('Meko did not return the lesson to promote');
      lesson.memoryId = id;
      await this.meko.promote({ agent: this.s.people[lesson.approvedBy]?.name || 'person', key: this.spaceKey(space), datapack: this.spacePack(space), memoryIds: [id], meta: { spaceId: space.id, taskId: lesson.taskId, space: true, summary: lesson.text } });
      lesson.status = 'promoted';
    });
  }

  // ---------- people correcting what agents remember ----------

  async forget(personId, { datapack, memoryId, taskId }) {
    const task = taskId && this.s.tasks[taskId];
    await this.meko.forget({ agent: this.s.people[personId]?.name || 'person', datapack, memoryId, meta: { spaceId: task?.spaceId, taskId } });
    if (task?.context) task.context.items = task.context.items.filter((i) => i.id !== memoryId);
  }

  /** What the app shows: switch state, datapacks, recent calls, royalties, sleep digests and proofs. */
  view(spaceIds, agents) {
    const agentIds = new Set(agents.map((a) => a.id));
    const people = new Set(Object.values(this.s.spaces).filter((sp) => spaceIds.has(sp.id)).flatMap((sp) => sp.memberIds));
    const visible = (key) => (key.startsWith('agent:') ? agentIds.has(key.slice(6)) : people.has(key.slice(7)));
    return {
      configured: this.configured,
      on: this.on,
      team: this.meko?.team || null,
      via: this.meko?.via || null, // 'cloud': Meko through Larp Cloud, 'meko': this computer's own key
      store: this.c.db ? 'yugabyte' : 'local',
      packs: {
        // Each agent's memory: the agent_id it uses inside its spaces' datapacks.
        agents: Object.fromEntries(agents.map((a) => [a.id, this.meko ? this.memKey(a) : null])),
        spaces: Object.fromEntries([...spaceIds].map((id) => [id, this.meko ? this.meko.name(this.spacePack(this.s.spaces[id])) : null])),
      },
      calls: this.s.mekoCalls.filter((c) => !c.spaceId || spaceIds.has(c.spaceId)).slice(-300),
      lessons: Object.values(this.s.lessons).filter((l) => spaceIds.has(l.spaceId)),
      totals: this.s.memoryTotals || { saved: 0, recalls: 0 },
      royalties: Object.fromEntries(Object.entries(this.s.royalties || {}).filter(([k]) => visible(k))),
      sleep: Object.fromEntries(Object.entries(this.s.sleep || {}).filter(([k]) => agentIds.has(k))),
      proofs: Object.values(this.s.tasks).filter((t) => t.proof && spaceIds.has(t.spaceId)).map((t) => ({ taskId: t.id, title: t.title, agentId: t.agentId, ...t.proof })).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
    };
  }
}
