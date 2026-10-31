import { ArrowRight, Bot, Check, Circle, Plus, Smartphone, UserPlus, Zap } from 'lucide-react';
import type { Ctx } from '../route';
import type { Task } from '../types';
import { AgentAvatar, StatusBadge, agentStatus, diffStats, duration, timeAgo, useAction } from '../ui';
import { Mascot, moodOf } from '../Mascot';
import { QuickCompose } from './NewTask';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Overview({ ctx }: { ctx: Ctx }) {
  const { state, space, go } = ctx;
  const tasks = state.tasks.filter((t) => t.spaceId === space.id);
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const approvals = state.approvals.filter((a) => a.spaceId === space.id);
  const reviews = tasks.filter((t) => t.createdBy === state.me.id && t.status === 'needs_review');
  const running = tasks.filter((t) => ['running', 'queued', 'awaiting_approval', 'revision_requested', 'applying'].includes(t.status));
  const online = agents.filter((a) => a.online).length;
  const myAgentsHere = agents.filter((a) => a.ownerId === state.me.id).length;
  const home = space.kind === 'home';
  const working = tasks.filter((t) => t.status === 'running');
  const mood = moodOf({ waiting: approvals.length + reviews.length, running: working.length, agentsOnline: online, agents: agents.length, done: tasks.filter((t) => ['applied', 'accepted'].includes(t.status) || t.result?.check?.passed).length });
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'An agent';
  const moodLine = mood === 'alert' ? `${approvals.length + reviews.length} ${approvals.length + reviews.length === 1 ? 'thing needs' : 'things need'} you.`
    : mood === 'working' ? `${agentName(working[0].agentId)} is working on “${working[0].title}”${working.length > 1 ? ` and ${working.length - 1} more` : ''}.`
      : mood === 'sleeping' ? 'No agents are online right now. Work you send will start when they reconnect.'
        : mood === 'happy' ? 'All quiet. Everything sent has come back.'
          : home ? `Here's what's happening in ${space.name}.` : `What should your team's agents work on in ${space.name}?`;

  const steps = [
    { done: myAgentsHere > 0, label: 'Add an agent on this computer', hint: 'Claude Code, Codex, a local model, or Hermes.', icon: <Bot size={15} />, action: () => go({ page: 'agent-new' }) },
    { done: space.memberIds.length > 1, label: home ? 'Invite your family or friends' : 'Invite a teammate', hint: 'They join with a one-time code.', icon: <UserPlus size={15} />, action: () => go({ page: 'people' }) },
    { done: state.phones > 0, label: 'Pair your phone', hint: 'Approve requests from anywhere on your network.', icon: <Smartphone size={15} />, action: () => go({ page: 'settings', tab: 'phones' }) },
    { done: tasks.length > 0, label: home ? 'Ask your circle something' : 'Run your first task', hint: home ? 'Plans, money and care live in the sidebar.' : 'Delegate to your agent or a teammate’s.', icon: <Zap size={15} />, action: () => (home ? go({ page: 'plans' }) : ctx.newTask()) },
  ];
  const setupLeft = steps.filter((s) => !s.done).length;

  const finished = tasks.filter((t) => ['applied', 'accepted', 'failed', 'needs_review'].includes(t.status) && !reviews.includes(t)).slice(0, 4);
  const done = steps.length - setupLeft;

  return (
    <div className="chat">
      <div className="chat-scroll">
        <div className="chat-col">
          <header className="hello">
            <Mascot pose={mood} size={76} />
            <h1>{greeting()}, {state.me.name}</h1>
            <p>{moodLine}</p>
          </header>

          {setupLeft > 0 && (
            <section className="feed">
              <h2>Get set up <span>{done} of {steps.length}</span></h2>
              <ul className="setup-list">
                {steps.map((s) => (
                  <li key={s.label} className={s.done ? 'done' : ''}>
                    <span className="setup-check">{s.done ? <Check size={13} strokeWidth={3} /> : <Circle size={13} />}</span>
                    <div className="grow"><strong>{s.label}</strong><p>{s.hint}</p></div>
                    {!s.done && <button className="btn btn-sm" onClick={s.action}>{s.icon} Start</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {approvals.length + reviews.length > 0 && (
            <section className="feed">
              <h2>Needs you <span>{approvals.length + reviews.length}</span></h2>
              <ul className="attention-list">
                {approvals.map((a) => <ApprovalRow key={a.id} ctx={ctx} id={a.id} />)}
                {reviews.map((t) => <ReviewRow key={t.id} ctx={ctx} task={t} />)}
              </ul>
            </section>
          )}

          {running.length > 0 && (
            <section className="feed">
              <h2>In progress <span>{running.length}</span></h2>
              <ul className="task-rows">{running.map((t) => <RunningRow key={t.id} ctx={ctx} task={t} />)}</ul>
            </section>
          )}

          {finished.length > 0 && (
            <section className="feed">
              <h2>Recently finished <button className="feed-link" onClick={() => go({ page: 'tasks', filter: 'done' })}>All tasks <ArrowRight size={12} /></button></h2>
              <ul className="task-rows">{finished.map((t) => <RunningRow key={t.id} ctx={ctx} task={t} />)}</ul>
            </section>
          )}

          {agents.length > 0 && (
            <section className="feed">
              <h2>Agents in {space.name} <button className="feed-link" onClick={() => go({ page: 'agent-new' })}><Plus size={12} /> Add</button></h2>
              <div className="agent-strip">
                {agents.map((a) => {
                  const owner = state.people.find((p) => p.id === a.ownerId);
                  return (
                    <button key={a.id} className="agent-pill" onClick={() => go({ page: 'agent', id: a.id })}>
                      <AgentAvatar agent={a} owner={owner} size={24} status={agentStatus(a)} />
                      <span><strong>{a.name}</strong><small>{owner?.id === state.me.id ? 'you' : owner?.name} · {a.busy ? 'working' : a.online ? 'online' : 'offline'}</small></span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      <div className="chat-dock">
        <div className="chat-col"><QuickCompose ctx={ctx} /></div>
      </div>
    </div>
  );
}

function ApprovalRow({ ctx, id }: { ctx: Ctx; id: string }) {
  const action = useAction();
  const a = ctx.state.approvals.find((x) => x.id === id);
  if (!a) return null;
  return (
    <li className="attention-item">
      <span className="attention-kind warn">{a.kind === 'run_task' ? 'Approve' : a.kind === 'share' ? 'Share' : 'Permission'}</span>
      <div className="grow">
        <strong>{a.title}</strong>
        <p>{a.detail}</p>
        {action.error && <p className="error-text">{action.error}</p>}
      </div>
      <div className="attention-actions">
        {a.taskId && <button className="btn btn-ghost btn-sm" onClick={() => ctx.go({ page: 'task', id: a.taskId! })}>Details</button>}
        <button className="btn btn-sm" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${a.id}`, { decision: 'deny' }))}>Decline</button>
        <button className="btn btn-primary btn-sm" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${a.id}`, { decision: 'approve' }))}>Approve</button>
      </div>
    </li>
  );
}

function ReviewRow({ ctx, task }: { ctx: Ctx; task: Task }) {
  const agent = ctx.state.agents.find((a) => a.id === task.agentId);
  const owner = ctx.state.people.find((p) => p.id === task.ownerId);
  const check = task.result?.check;
  const stats = task.result?.diff ? diffStats(task.result.diff) : null;
  return (
    <li className="attention-item">
      <span className={'attention-kind ' + (check ? (check.passed ? 'good' : 'bad') : 'info')}>{check ? (check.passed ? 'Verified' : 'Failed') : 'Review'}</span>
      <div className="grow">
        <strong>{task.title}</strong>
        <p>{agent?.name} on {owner?.name}'s machine{stats ? ` · ${task.result!.files.length} file${task.result!.files.length === 1 ? '' : 's'}, +${stats.add} −${stats.del}` : ''}</p>
      </div>
      <div className="attention-actions"><button className="btn btn-primary btn-sm" onClick={() => ctx.go({ page: 'task', id: task.id, tab: 'changes' })}>Review</button></div>
    </li>
  );
}

function RunningRow({ ctx, task }: { ctx: Ctx; task: Task }) {
  const agent = ctx.state.agents.find((a) => a.id === task.agentId);
  const owner = ctx.state.people.find((p) => p.id === task.ownerId);
  const last = [...task.log].reverse().find((l) => l.kind === 'tool' || l.kind === 'say');
  const attempt = task.attempts.at(-1);
  return (
    <li>
      <button className="row-button task-row" onClick={() => ctx.go({ page: 'task', id: task.id })}>
        {agent && <AgentAvatar agent={agent} owner={owner} size={28} status={agentStatus(agent)} />}
        <span className="grow">
          <strong>{task.title}</strong>
          <small className="mono">{task.status === 'running' && last ? last.text.slice(0, 90) : `${agent?.name} · ${owner?.name}'s machine`}</small>
        </span>
        <StatusBadge status={task.status} />
        <span className="faint small mono">{task.status === 'running' && attempt ? duration(attempt.startedAt) : timeAgo(task.updatedAt)}</span>
      </button>
    </li>
  );
}
