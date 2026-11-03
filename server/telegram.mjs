// Telegram control for Larp. The space's coordinator runs one bot (a token from @BotFather) and
// long-polls Telegram, so it only makes outgoing connections: people can use it from anywhere, with
// no Tailscale, port forwarding or app install.
//
// Each person links their own chat once, through a one-time link from Larp (t.me/<bot>?start=<code>).
// Then the bot sends them what needs them and they answer with buttons:
//   - approvals for their agents (run a delegated task, use a tool, share private data, keep a lesson);
//   - results of tasks they asked for: accept, or ask for changes and type the feedback;
//   - new checklists in their spaces: take an item;
// and any message they type becomes a task for their agent ("@Name ..." picks another agent).
// The bot token stays in the coordinator's own state; it is never sent to clients or to Meko.

const POLL_SECONDS = 25;
const LINK_TTL_MS = 30 * 60_000;
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const linkCode = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export class Telegram {
  constructor(coordinator, { api = process.env.LARP_TELEGRAM_API || 'https://api.telegram.org' } = {}) {
    this.c = coordinator;
    this.api = api.replace(/\/$/, '');
    this.offset = 0;
    this.running = false;
    this.controller = null;
    this.waiting = new Map(); // chat id -> { revise: taskId } while the bot waits for typed feedback
  }

  get s() { return this.c.s; }
  get config() { return (this.s.settings.telegram ||= { token: null, botName: null, links: {}, codes: {} }); }
  get connected() { return Boolean(this.config.token && this.config.botName); }

  async call(method, body = {}, token = this.config.token, signal) {
    const response = await fetch(`${this.api}/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.description || `Telegram ${method} failed (${response.status})`);
    return data.result;
  }

  // ---------- setup ----------

  /** Check a token with Telegram and start the bot. */
  async connect(token) {
    token = String(token || '').trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw Object.assign(new Error('That doesn’t look like a bot token from @BotFather'), { status: 400 });
    let me;
    try { me = await this.call('getMe', {}, token); } catch (error) { throw Object.assign(new Error(`Telegram didn’t accept the token: ${error.message}`), { status: 400 }); }
    await this.stop();
    Object.assign(this.config, { token, botName: me.username });
    this.c.changed();
    this.start();
    return this.view();
  }

  async disconnect() {
    await this.stop();
    Object.assign(this.config, { token: null, botName: null, links: {}, codes: {} });
    this.c.changed();
    return this.view();
  }

  /** A one-time link that ties the person's Telegram chat to their Larp account. */
  linkFor(personId) {
    if (!this.connected) throw Object.assign(new Error('Connect a Telegram bot first'), { status: 409 });
    const now = Date.now();
    for (const [c, v] of Object.entries(this.config.codes)) if (v.expiresAt < now || v.personId === personId) delete this.config.codes[c];
    const code = linkCode();
    this.config.codes[code] = { personId, expiresAt: now + LINK_TTL_MS };
    this.c.changed();
    return { url: `https://t.me/${this.config.botName}?start=${code}`, expiresAt: now + LINK_TTL_MS };
  }

  /**
   * An invite that joins a space straight from Telegram: the person taps it, presses Start, and is a
   * member under their Telegram name, with this chat linked. No Larp install needed.
   */
  inviteLink(personId, spaceId) {
    if (!this.connected) throw Object.assign(new Error('Connect a Telegram bot first'), { status: 409 });
    const invite = this.c.createInvite(personId, spaceId);
    return { url: `https://t.me/${this.config.botName}?start=j_${invite.code}`, expiresAt: invite.expiresAt };
  }

  unlink(personId) {
    delete this.config.links[personId];
    this.c.changed();
    return this.view(personId);
  }

  /** What a person's app may know: never the token. */
  view(personId) {
    return { connected: this.connected, botName: this.config.botName, linked: Boolean(personId && this.config.links[personId]), linkedIds: Object.keys(this.config.links) };
  }

  // ---------- polling ----------

  start() {
    if (this.running || !this.connected) return;
    this.running = true;
    this.controller = new AbortController();
    this.loop = this.poll(this.controller.signal);
  }

  async stop() {
    this.running = false;
    this.controller?.abort();
    await this.loop?.catch(() => {});
    this.loop = null;
  }

  async poll(signal) {
    let backoff = 1000;
    while (this.running && !signal.aborted) {
      try {
        const updates = await this.call('getUpdates', { offset: this.offset, timeout: POLL_SECONDS, allowed_updates: ['message', 'callback_query'] }, undefined, signal);
        backoff = 1000;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handle(update).catch((error) => console.error('[larp telegram]', error.message));
        }
      } catch (error) {
        if (signal.aborted) return;
        console.error('[larp telegram] polling:', error.message);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  }

  // ---------- incoming ----------

  personFor(chatId) {
    return Object.entries(this.config.links).find(([, l]) => l.chatId === chatId)?.[0] || null;
  }

  async handle(update) {
    if (update.callback_query) return this.handleButton(update.callback_query);
    const msg = update.message;
    if (!msg?.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    const start = text.match(/^\/start(?:\s+(\S+))?/);
    if (start?.[1]?.startsWith('j_')) {
      if (this.personFor(chatId)) return this.send(chatId, 'This chat is already linked to someone in Larp.');
      const name = String(msg.from?.first_name || msg.from?.username || 'Friend').slice(0, 40);
      let joined;
      try { joined = this.c.join({ code: start[1].slice(2), name }); } catch (error) { return this.send(chatId, `${error.message}. Ask for a new invite.`); }
      this.config.links[joined.person.id] = { chatId, username: msg.from?.username || null, linkedAt: new Date().toISOString() };
      this.c.changed();
      return this.send(chatId, `Welcome to ${joined.space.name}, ${joined.person.name}! I’ll message you when something needs you.\n\nSend me a message to ask an agent for something (start with @Name to pick one). /help for more.`);
    }
    if (start) {
      const entry = start[1] && this.config.codes[start[1]];
      if (!entry || entry.expiresAt < Date.now()) {
        if (this.personFor(chatId)) return this.send(chatId, 'You’re already linked. Send me a task, or /help.');
        return this.send(chatId, 'Hi! To link this chat, open Larp → Settings → Telegram and press “Link my Telegram”.');
      }
      delete this.config.codes[start[1]];
      for (const [pid, l] of Object.entries(this.config.links)) if (l.chatId === chatId) delete this.config.links[pid];
      this.config.links[entry.personId] = { chatId, username: msg.from?.username || null, linkedAt: new Date().toISOString() };
      this.c.changed();
      const name = this.s.people[entry.personId]?.name || 'there';
      return this.send(chatId, `Linked, ${name}! I’ll message you when your agents need you or a result is ready.\n\nSend me any message to give your agent a task. /help for more.`);
    }

    const personId = this.personFor(chatId);
    if (!personId) return this.send(chatId, 'This chat isn’t linked yet. Open Larp → Settings → Telegram and press “Link my Telegram”.');

    const command = text.match(/^\/(chat|stop|trace)\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (command) {
      const [, kind, id, message] = command;
      const task = this.c.task(personId, id);
      if (![task.ownerId, task.createdBy].includes(personId)) return this.send(chatId, 'Only the owner or requester can control this task.');
      if (kind === 'stop') { this.c.cancelTask(personId, id); return this.send(chatId, 'Task stopped.'); }
      if (kind === 'trace') return this.send(chatId, clip([`${task.id} · ${task.status}`, ...task.log.slice(-12).map((l) => `${l.kind}: ${l.text}`)].join('\n'), 3800));
      this.c.messageTask(personId, id, { text: message });
      return this.send(chatId, 'Follow-up added to the same conversation. A running agent picks it up at its next turn boundary.');
    }
    const replyId = this.config.messageTasks?.[`${chatId}:${msg.reply_to_message?.message_id}`];
    if (replyId && !text.startsWith('/')) {
      this.c.messageTask(personId, replyId, { text });
      return this.send(chatId, 'Reply delivered to the same agent conversation.');
    }
    if (/^\/help/.test(text)) return this.send(chatId, [
      'What you can do here:',
      '• Type a task, and your agent starts on it. Start with @Name to ask someone else’s agent (they approve it).',
      '• /tasks: your recent tasks',
      '• /chat TASK_ID message: steer or continue a task',
      '• /trace TASK_ID: latest skill, tool and agent activity',
      '• /stop TASK_ID: stop a task',
      '• Reply to a task acknowledgement to continue that conversation.',
      '• /todo: open checklist items you can take',
      '• /agents: agents in your space',
      'I also message you approvals and results, with buttons.',
    ].join('\n'));
    if (/^\/tasks/.test(text)) return this.sendTasks(chatId, personId);
    if (/^\/todo/.test(text)) return this.sendTodo(chatId, personId);
    if (/^\/agents/.test(text)) return this.sendAgents(chatId, personId);
    if (/^\/cancel/.test(text)) { this.waiting.delete(chatId); return this.send(chatId, 'OK.'); }

    const waiting = this.waiting.get(chatId);
    if (waiting?.revise) {
      this.waiting.delete(chatId);
      const task = this.c.reviseTask(personId, waiting.revise, { feedback: text });
      return this.send(chatId, `Sent your feedback. ${this.s.agents[task.agentId]?.name || 'The agent'} is working on it again.`);
    }
    if (text.startsWith('/')) return this.send(chatId, 'I don’t know that command. /help');
    return this.newTask(chatId, personId, text);
  }

  async newTask(chatId, personId, text) {
    const spaces = Object.values(this.s.spaces).filter((sp) => sp.memberIds.includes(personId));
    if (!spaces.length) return this.send(chatId, 'You aren’t in a space yet.');
    const recent = Object.values(this.s.tasks).filter((t) => t.createdBy === personId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const space = spaces.find((sp) => sp.id === recent?.spaceId) || spaces[0];
    const inSpace = Object.values(this.s.agents).filter((a) => a.spaceIds.includes(space.id));
    const named = text.match(/^@(\S+)\s+([\s\S]+)/);
    let agent = named ? inSpace.find((a) => a.name.toLowerCase() === named[1].toLowerCase()) : null;
    if (named && !agent) return this.send(chatId, `There’s no agent called ${named[1]} in ${space.name}. /agents`);
    const body = named ? named[2] : text;
    agent ||= inSpace.find((a) => a.ownerId === personId) || (inSpace.length === 1 ? inSpace[0] : null);
    if (!agent) return this.send(chatId, `You don’t have an agent in ${space.name} yet. Start with @Name to ask someone else’s. /agents`);
    const task = this.c.createTask(personId, {
      spaceId: space.id, agentId: agent.id, title: clip(body.split('\n')[0], 120), instructions: body,
      kind: space.kind === 'home' || !agent.repo ? 'general' : 'code',
    });
    const owner = this.s.people[agent.ownerId]?.name;
    const sent = await this.send(chatId, task.status === 'awaiting_approval'
      ? `Asked ${owner}’s agent ${agent.name}. ${owner} needs to approve it first; I’ll tell you when it’s done.`
      : `${agent.name} is on it. Task: ${task.id}. Reply to this message to steer it, or /trace ${task.id}.`);
    if (sent?.message_id) { (this.config.messageTasks ||= {})[`${chatId}:${sent.message_id}`] = task.id; this.c.changed(); }
    return sent;
  }

  async handleButton(q) {
    const chatId = q.message?.chat?.id;
    const personId = this.personFor(chatId);
    const answer = (text) => this.call('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (!personId) return answer('This chat isn’t linked');
    const [kind, id, extra] = String(q.data || '').split(':');
    const done = async (note) => {
      await answer(note);
      await this.call('editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      await this.send(chatId, note);
    };
    try {
      if (kind === 'apr') {
        const approval = this.c.resolveApproval(personId, id, { decision: extra === 'yes' ? 'approve' : 'deny' });
        return done(approval.status === 'approved' ? `Approved: ${approval.title}` : `Denied: ${approval.title}`);
      }
      if (kind === 'acc') {
        const task = this.c.task(personId, id);
        const host = task.result?.diff && Object.values(this.s.hosts).find((h) => h.ownerId === personId && h.online);
        this.c.acceptTask(personId, id, host ? { applyHostId: host.id } : {});
        return done(host ? `Accepted. Applying it on ${host.name}.` : 'Accepted.');
      }
      if (kind === 'rev') {
        this.waiting.set(chatId, { revise: id });
        await answer('Type your feedback');
        return this.send(chatId, 'What should change? Type it as your next message (or /cancel).');
      }
      if (kind === 'chk') {
        const list = this.c.updateChecklistItem(personId, id, extra, { take: true });
        const item = list.items.find((i) => i.id === extra);
        return done(`You’ve got it: ${item?.text}`);
      }
      return answer('That button is out of date');
    } catch (error) {
      return done(error.message || 'That didn’t work');
    }
  }

  // ---------- outgoing ----------

  async send(chatId, text, buttons) {
    if (!this.connected) return;
    const body = { chat_id: chatId, text: clip(text, 4000), disable_web_page_preview: true };
    if (buttons) body.reply_markup = { inline_keyboard: buttons };
    return this.call('sendMessage', body).catch((error) => console.error('[larp telegram] send:', error.message));
  }

  /** Message a person if they linked Telegram. Fire and forget: Larp never waits on Telegram. */
  notify(personId, text, buttons) {
    const link = personId && this.config.links[personId];
    if (!link || !this.connected) return;
    this.send(link.chatId, text, buttons);
  }

  // Called by the coordinator when something needs a person.

  approvalRequested(approval) {
    const from = approval.requestedBy ? this.s.people[approval.requestedBy]?.name : null;
    const lines = [`🔔 ${approval.title}`, approval.detail ? clip(approval.detail, 600) : null, from ? `Asked by ${from}.` : null].filter(Boolean);
    this.notify(approval.ownerId, lines.join('\n\n'), [[{ text: '✅ Approve', callback_data: `apr:${approval.id}:yes` }, { text: '✖️ Deny', callback_data: `apr:${approval.id}:no` }]]);
  }

  taskChanged(task, status) {
    // A request from one agent to another goes back to the asking agent, not to a person.
    if (task.parentId && ['needs_review', 'accepted'].includes(status)) return;
    const agent = this.s.agents[task.agentId]?.name || 'Your agent';
    if (status === 'needs_review') {
      const check = task.result?.check ? (task.result.check.passed ? '✓ check passed' : '✗ check failed') : null;
      const files = task.result?.files?.length ? `${task.result.files.length} file(s) changed` : null;
      const summary = clip(task.result?.summary || 'Finished.', 1500);
      this.notify(task.createdBy, [`✅ ${agent} finished “${task.title}”`, summary, [check, files].filter(Boolean).join(' · ')].filter(Boolean).join('\n\n'),
        [[{ text: 'Accept', callback_data: `acc:${task.id}` }, { text: 'Ask for changes', callback_data: `rev:${task.id}` }]]);
    } else if (status === 'failed') {
      this.notify(task.createdBy, `⚠️ ${agent} couldn’t finish “${task.title}”:\n\n${clip(task.result?.error || 'Unknown error', 800)}`,
        [[{ text: 'Try again with feedback', callback_data: `rev:${task.id}` }]]);
    } else if (status === 'denied') {
      this.notify(task.createdBy, `✖️ “${task.title}” was declined by ${this.s.people[task.ownerId]?.name || 'the agent’s owner'}.`);
    } else if (status === 'applied') {
      this.notify(task.createdBy, `Applied “${task.title}” on branch ${task.applied?.branch}.`);
    } else if (status === 'apply_failed') {
      this.notify(task.createdBy, `Couldn’t apply “${task.title}”: ${clip(task.applied?.message || '', 400)}`);
    }
  }

  checklistCreated(list) {
    const space = this.s.spaces[list.spaceId];
    const by = this.s.people[list.createdBy]?.name || 'Someone';
    const open = list.items.filter((i) => !i.ownerId && !i.done).slice(0, 10);
    for (const personId of space?.memberIds || []) {
      if (personId === list.createdBy) continue;
      this.notify(personId, `📝 ${by} started “${list.title}” in ${space.name}. Take something?`,
        open.map((i) => [{ text: clip(i.text, 60), callback_data: `chk:${list.id}:${i.id}` }]));
    }
  }

  async sendTasks(chatId, personId) {
    const mine = Object.values(this.s.tasks).filter((t) => t.createdBy === personId || t.ownerId === personId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
    if (!mine.length) return this.send(chatId, 'No tasks yet. Type one!');
    const status = { awaiting_approval: 'waiting for approval', queued: 'queued', running: 'working', waiting: 'waiting on another agent', needs_review: 'ready for review', accepted: 'accepted', applied: 'applied', failed: 'failed', denied: 'declined', cancelled: 'cancelled' };
    await this.send(chatId, mine.map((t) => `• ${t.title} (${this.s.agents[t.agentId]?.name}): ${status[t.status] || t.status}`).join('\n'));
    for (const t of mine.filter((t) => t.status === 'needs_review' && t.createdBy === personId).slice(0, 3)) this.taskChanged(t, 'needs_review');
  }

  async sendTodo(chatId, personId) {
    const spaceIds = new Set(Object.values(this.s.spaces).filter((sp) => sp.memberIds.includes(personId)).map((sp) => sp.id));
    const lists = Object.values(this.s.checklists).filter((l) => spaceIds.has(l.spaceId));
    const rows = lists.flatMap((l) => l.items.filter((i) => !i.ownerId && !i.done).map((i) => [{ text: clip(`${i.text} · ${l.title}`, 60), callback_data: `chk:${l.id}:${i.id}` }])).slice(0, 15);
    const mine = lists.flatMap((l) => l.items.filter((i) => i.ownerId === personId && !i.done).map((i) => `• ${i.text}`));
    if (!rows.length && !mine.length) return this.send(chatId, 'Nothing on any checklist right now.');
    if (mine.length) await this.send(chatId, `Yours:\n${mine.join('\n')}`);
    if (rows.length) await this.send(chatId, 'Nobody has these yet:', rows);
  }

  async sendAgents(chatId, personId) {
    const spaceIds = new Set(Object.values(this.s.spaces).filter((sp) => sp.memberIds.includes(personId)).map((sp) => sp.id));
    const agents = Object.values(this.s.agents).filter((a) => a.spaceIds.some((id) => spaceIds.has(id)));
    if (!agents.length) return this.send(chatId, 'No agents yet. Add one in Larp on a computer.');
    return this.send(chatId, agents.map((a) => `• ${a.name} (${this.s.people[a.ownerId]?.name}’s, ${this.s.hosts[a.hostId]?.online ? 'online' : 'offline'})`).join('\n') + '\n\nStart a message with @Name to ask a specific agent.');
  }
}
