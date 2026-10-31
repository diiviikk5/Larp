import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Folder, Lock, Plus, Trash2 } from 'lucide-react';
import type { Ctx } from '../route';
import { confirmDialog, toast } from '../feedback';
import type { Agent, LocalAgent, RuntimeStatus } from '../types';
import {
  AgentAvatar, Card, CheckBadge, DAYS, EmptyState, ErrorText, Field, PageHeader, RUNTIMES, StatusBadge, Tag, agentStatus, timeAgo, useAction,
} from '../ui';

function agentStats(ctx: Ctx, agent: Agent) {
  const tasks = ctx.state.tasks.filter((t) => t.agentId === agent.id);
  const checked = tasks.filter((t) => t.result?.check);
  const passed = checked.filter((t) => t.result!.check!.passed).length;
  return { tasks, total: tasks.length, rate: checked.length ? Math.round((passed / checked.length) * 100) : null, last: tasks[0]?.updatedAt };
}

export function Agents({ ctx }: { ctx: Ctx }) {
  const { state, space, go } = ctx;
  const [filter, setFilter] = useState<'all' | 'mine' | 'here'>('all');
  const localIds = new Set(Object.keys(ctx.device?.host?.agents || {}));
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id))
    .filter((a) => filter === 'all' || (filter === 'mine' ? a.ownerId === state.me.id : localIds.has(a.id)));

  return (
    <div className="page">
      <PageHeader
        title="Agents"
        subtitle="Every agent belongs to a person and runs on that person's computer. Work from others waits for the owner's approval."
        actions={ctx.device && <button className="btn btn-primary" onClick={() => go({ page: 'agent-new' })}><Plus size={15} /> Add agent</button>}
      >
        <div className="segmented">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          <button aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>Mine</button>
          {ctx.device && <button aria-pressed={filter === 'here'} onClick={() => setFilter('here')}>On this computer</button>}
        </div>
      </PageHeader>

      {!agents.length ? (
        <EmptyState pose="sleeping" title={filter === 'all' ? 'No agents yet' : 'No agents match'} action={ctx.device && <button className="btn btn-primary" onClick={() => go({ page: 'agent-new' })}><Plus size={15} /> Add agent</button>}>
          Connect Claude Code, Codex, a local model through Ollama, or Hermes. Each one runs on this computer under your own account.
        </EmptyState>
      ) : (
        <div className="agent-grid">
          {agents.map((a) => {
            const owner = state.people.find((p) => p.id === a.ownerId);
            const host = state.hosts.find((h) => h.id === a.hostId);
            const s = agentStats(ctx, a);
            const current = s.tasks.find((t) => t.status === 'running');
            return (
              <article key={a.id} className="agent-card" onClick={() => go({ page: 'agent', id: a.id })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go({ page: 'agent', id: a.id }); }}>
                <header>
                  <AgentAvatar agent={a} owner={owner} size={40} status={agentStatus(a)} />
                  <div className="grow">
                    <h3>{a.name}</h3>
                    <p>{owner?.id === state.me.id ? 'Yours' : owner?.name} · {host?.name}</p>
                  </div>
                  <span className={'status-pill ' + agentStatus(a)}>{a.busy ? 'Working' : a.online ? 'Online' : 'Offline'}</span>
                </header>
                <div className="agent-card-tags">
                  <Tag>{RUNTIMES.find((r) => r.id === a.runtime)?.label || a.runtime}</Tag>
                  {a.model && <Tag>{a.model}</Tag>}
                  {a.repo && <Tag tone="info">{a.repo}</Tag>}
                </div>
                <p className="agent-card-now">{current ? <>Working on <strong>{current.title}</strong></> : s.last ? `Last task ${timeAgo(s.last)}` : 'No tasks yet'}</p>
                <footer>
                  <div><strong>{s.total}</strong><span>tasks</span></div>
                  <div><strong>{s.rate === null ? '—' : `${s.rate}%`}</strong><span>checks passed</span></div>
                  <span className="grow" />
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); ctx.newTask({ agentId: a.id }); }}>Give a task</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AgentDetail({ ctx, id }: { ctx: Ctx; id: string }) {
  const { state, go } = ctx;
  const agent = state.agents.find((a) => a.id === id);
  const local = ctx.device?.host?.agents[id];
  const action = useAction();
  if (!agent) return <div className="page"><EmptyState title="Agent not found">It may have been removed.</EmptyState></div>;
  const owner = state.people.find((p) => p.id === agent.ownerId);
  const host = state.hosts.find((h) => h.id === agent.hostId);
  const s = agentStats(ctx, agent);

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm back" onClick={() => go({ page: 'agents' })}><ArrowLeft size={14} /> Agents</button>
      <div className="profile-head">
        <AgentAvatar agent={agent} owner={owner} size={56} status={agentStatus(agent)} />
        <div className="grow">
          <h1>{agent.name}</h1>
          <p>{owner?.id === state.me.id ? 'Your agent' : `${owner?.name}'s agent`} on {host?.name} · {agent.busy ? 'working now' : agent.online ? 'online' : 'offline'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => ctx.newTask({ agentId: agent.id })}><Plus size={15} /> Give a task</button>
      </div>

      <div className="stats">
        <div className="stat"><span className="stat-label">Tasks</span><span className="stat-value">{s.total}</span></div>
        <div className="stat"><span className="stat-label">Checks passed</span><span className="stat-value">{s.rate === null ? '—' : `${s.rate}%`}</span></div>
        <div className="stat"><span className="stat-label">Runtime</span><span className="stat-value small-value">{RUNTIMES.find((r) => r.id === agent.runtime)?.label}</span><span className="stat-hint">{agent.model || 'default model'}</span></div>
        <div className="stat"><span className="stat-label">Repository</span><span className="stat-value small-value mono">{agent.repo || '—'}</span><span className="stat-hint">{local?.repoPath || (agent.repo ? 'on the owner’s machine' : 'no repository')}</span></div>
      </div>

      <div className="columns">
        <div className="col-main">
          <Card title="Recent tasks">
            {!s.tasks.length ? <p className="card-empty">No tasks yet.</p> : (
              <table className="table compact">
                <tbody>
                  {s.tasks.slice(0, 12).map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => go({ page: 'task', id: t.id })}>
                      <td className="task-cell"><strong>{t.title}</strong></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td><CheckBadge task={t} /></td>
                      <td className="num faint">{timeAgo(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {local && <PrivateData ctx={ctx} agentId={agent.id} local={local} />}
        </div>
        <div className="col-side">
          {local ? <AgentConfig ctx={ctx} agent={agent} local={local} /> : (
            <Card title="Configuration"><p className="card-empty">This agent runs on {host?.name}. Its settings and private data are only visible there.</p></Card>
          )}
          {local && (
            <Card title="Remove agent" className="danger-card">
              <p className="card-text">Removes {agent.name} from every space. Its task history stays.</p>
              <button className="btn btn-danger btn-sm" disabled={action.busy} onClick={async () => { if (await confirmDialog({ title: `Remove ${agent.name}?`, body: 'It stops receiving tasks in every space. Its task history stays.', confirmLabel: 'Remove agent', danger: true })) action.run(async () => { await window.larp!.removeAgent({ agentId: agent.id }); ctx.reloadDevice(); toast(`${agent.name} removed`); go({ page: 'agents' }); }); }}><Trash2 size={14} /> Remove</button>
              <ErrorText error={action.error} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentConfig({ ctx, agent, local }: { ctx: Ctx; agent: Agent; local: LocalAgent }) {
  const [runtime, setRuntime] = useState(local.runtime);
  const [model, setModel] = useState(local.model || '');
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const dirty = runtime !== local.runtime || model !== (local.model || '');
  return (
    <Card title="Configuration">
      <div className="form">
        <Field label="Runtime"><select value={runtime} onChange={(e) => setRuntime(e.target.value)}>{RUNTIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
        <Field label="Model" hint="Leave empty for the runtime's default."><input value={model} placeholder="default" onChange={(e) => setModel(e.target.value)} /></Field>
        <Field label="Repository on this computer"><p className="mono small">{local.repoPath || 'None'}</p></Field>
        <div className="row-end">
          {saved && !dirty && <span className="good small">Saved</span>}
          <button className="btn btn-primary btn-sm" disabled={!dirty || action.busy} onClick={async () => { if (await action.run(() => window.larp!.updateAgent({ agentId: agent.id, patch: { runtime, model: model.trim() || null } }))) { setSaved(true); ctx.reloadDevice(); } }}>Save</button>
        </div>
        <ErrorText error={action.error} />
      </div>
    </Card>
  );
}

const RULES: { id: 'auto' | 'ask' | 'never'; label: string }[] = [
  { id: 'auto', label: 'Share automatically' }, { id: 'ask', label: 'Ask me every time' }, { id: 'never', label: 'Never share' },
];

function PrivateData({ ctx, agentId, local }: { ctx: Ctx; agentId: string; local: LocalAgent }) {
  const [calendar, setCalendar] = useState(local.private.calendar || []);
  const [budget, setBudget] = useState(local.private.budget?.toString() || '');
  const [sharing, setSharing] = useState(local.sharing);
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    if (await action.run(() => window.larp!.updateAgent({ agentId, patch: { private: { calendar, budget: budget ? Number(budget) : null }, sharing } }))) { setSaved(true); ctx.reloadDevice(); }
  };
  const update = (i: number, patch: Partial<LocalAgent['private']['calendar'][number]>) => setCalendar(calendar.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card title={<><Lock size={14} /> Private to this computer</>} action={<span className="faint small">Used to answer questions from your circles</span>}>
      <p className="card-text">Only what these rules allow ever leaves this computer. Free time is worked out from your calendar without sharing event names.</p>
      <table className="table compact rules-table">
        <tbody>
          {(['availability', 'budget', 'calendar'] as const).map((field) => (
            <tr key={field}>
              <td><strong>{field === 'availability' ? 'Free time' : field === 'budget' ? 'Budget limit' : 'Full calendar'}</strong><small>{field === 'availability' ? 'Open time windows on a day' : field === 'budget' ? 'Your per-person limit for outings' : 'Event names and times'}</small></td>
              <td className="num"><select aria-label={`Sharing for ${field}`} value={sharing[field] || 'never'} onChange={(e) => setSharing({ ...sharing, [field]: e.target.value as 'auto' })}>{RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form two-col">
        <Field label="Budget limit per outing (₹)" htmlFor="budget"><input id="budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <div className="calendar-head"><strong>Calendar</strong><button className="btn btn-sm" onClick={() => setCalendar([...calendar, { day: 'Sat', title: '', from: '10:00', to: '11:00' }])}><Plus size={13} /> Add event</button></div>
      {!calendar.length && <p className="card-empty">No events. With an empty calendar you're free 09:00–22:00 every day.</p>}
      <ul className="calendar-edit">
        {calendar.map((event, i) => (
          <li key={i}>
            <select aria-label="Day" value={event.day} onChange={(e) => update(i, { day: e.target.value })}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
            <input aria-label="Event" value={event.title} placeholder="Event" onChange={(e) => update(i, { title: e.target.value })} />
            <input aria-label="From" type="time" value={event.from} onChange={(e) => update(i, { from: e.target.value })} />
            <input aria-label="To" type="time" value={event.to} onChange={(e) => update(i, { to: e.target.value })} />
            <button className="btn-icon" aria-label="Remove event" onClick={() => setCalendar(calendar.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="row-end">{saved && <span className="good small">Saved on this computer</span>}<button className="btn btn-primary btn-sm" disabled={action.busy} onClick={save}>Save</button></div>
      <ErrorText error={action.error} />
    </Card>
  );
}

export function AgentNew({ ctx }: { ctx: Ctx }) {
  const { state, device, go } = ctx;
  const people = device?.people || [];
  const [personId, setPersonId] = useState(device?.activePersonId || people[0]?.id || '');
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('claude');
  const [model, setModel] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434/v1');
  const [apiKeyEnv, setApiKeyEnv] = useState('');
  const mySpaces = state.spaces.filter((s) => s.memberIds.includes(personId));
  const [spaceIds, setSpaceIds] = useState<string[]>([ctx.space.id]);
  const action = useAction();
  const rt = RUNTIMES.find((r) => r.id === runtime)!;
  const [detected, setDetected] = useState<Record<string, RuntimeStatus> | null>(null);
  useEffect(() => {
    window.larp?.detectRuntimes?.().then((found) => {
      setDetected(found);
      // Point the local-model option at whatever server is actually running.
      if (found.openai?.endpoint) setBaseUrl(found.openai.endpoint);
    }).catch(() => setDetected({}));
  }, []);
  const status = detected?.[runtime];

  if (!device) return <div className="page"><EmptyState icon={<Bot size={22} />} title="Add agents from a computer">Agents run on computers. Open Larp on your laptop to add one.</EmptyState></div>;

  const submit = () => action.run(async () => {
    const agent = await window.larp!.addAgent({
      personId, name, runtime, model: model.trim() || null, repoPath: repoPath || null,
      spaceIds: spaceIds.filter((id) => mySpaces.some((s) => s.id === id)),
      baseUrl: runtime === 'openai' ? baseUrl : null, apiKeyEnv: runtime === 'openai' ? apiKeyEnv || null : null,
    });
    ctx.reloadDevice();
    await ctx.larp.refresh();
    go({ page: 'agent', id: agent.id });
  });

  return (
    <div className="page narrow">
      <button className="btn btn-ghost btn-sm back" onClick={() => go({ page: 'agents' })}><ArrowLeft size={14} /> Agents</button>
      <PageHeader title="Add an agent" subtitle={`It runs on ${device.host?.name || 'this computer'} using the owner's own sign-in or key. Nothing is shared with other people's accounts.`} />

      <div className="form-steps">
        {people.length > 1 && (
          <section className="form-step">
            <div className="step-num">1</div>
            <div className="grow"><h2>Owner</h2><p>Who controls this agent and approves work sent to it.</p>
              <div className="segmented">{people.map((p) => <button key={p.id} aria-pressed={personId === p.id} onClick={() => setPersonId(p.id)}>{p.name}</button>)}</div>
            </div>
          </section>
        )}
        <section className="form-step">
          <div className="step-num">{people.length > 1 ? 2 : 1}</div>
          <div className="grow"><h2>Name</h2><p>What your team calls it in task lists and approvals.</p>
            <input aria-label="Agent name" placeholder="e.g. Atlas" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </section>
        <section className="form-step">
          <div className="step-num">{people.length > 1 ? 3 : 2}</div>
          <div className="grow"><h2>Runtime</h2><p>The agent program that does the work.</p>
            <div className="runtime-cards" role="radiogroup" aria-label="Runtime">
              {RUNTIMES.map((r) => (
                <button key={r.id} role="radio" aria-checked={runtime === r.id} className={'runtime-card' + (runtime === r.id ? ' selected' : '')} onClick={() => setRuntime(r.id)}>
                  <strong>{r.label}</strong><small>{r.cost}</small>
                  <span className={'runtime-status ' + (!detected ? 'checking' : detected[r.id]?.installed ? 'ok' : 'missing')}>
                    {!detected ? 'Checking…' : detected[r.id]?.installed ? 'Ready on this computer' : 'Not set up'}
                  </span>
                </button>
              ))}
            </div>
            <p className="field-hint">{rt.hint}</p>
            {status && <p className={'runtime-detail ' + (status.installed ? 'ok' : 'missing')}>{status.detail}</p>}
            {status?.note && <p className="notice warn">{status.note}</p>}
            {runtime === 'openai' && !!status?.models?.length && (
              <div className="model-chips">{status.models.slice(0, 8).map((m) => <button key={m} className={'chip' + (model === m ? ' on' : '')} onClick={() => setModel(m)}>{m}</button>)}</div>
            )}
            {runtime === 'openai' && (
              <div className="form two-col">
                <Field label="Endpoint" htmlFor="base-url"><input id="base-url" className="mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
                <Field label="API key variable" htmlFor="key-env" hint="Name of an environment variable. Leave empty for Ollama."><input id="key-env" className="mono" placeholder="OPENROUTER_API_KEY" value={apiKeyEnv} onChange={(e) => setApiKeyEnv(e.target.value.replace(/[^A-Z0-9_]/gi, ''))} /></Field>
              </div>
            )}
            {runtime !== 'scripted' && (
              <Field label="Model" htmlFor="model" hint="Optional. Leave empty to use the runtime's default."><input id="model" className="mono" placeholder={runtime === 'openai' ? 'qwen2.5-coder:7b' : 'default'} value={model} onChange={(e) => setModel(e.target.value)} /></Field>
            )}
          </div>
        </section>
        <section className="form-step">
          <div className="step-num">{people.length > 1 ? 4 : 3}</div>
          <div className="grow"><h2>Repository</h2><p>For code tasks. Each task gets its own git worktree and branch, so your working copy is never touched.</p>
            <button className="folder-pick" onClick={async () => { const p = await window.larp!.chooseFolder(); if (p) setRepoPath(p); }}>
              <Folder size={15} /><span className="grow mono">{repoPath || 'Choose a git repository…'}</span>{repoPath && <span className="faint small">Change</span>}
            </button>
          </div>
        </section>
        <section className="form-step">
          <div className="step-num">{people.length > 1 ? 5 : 4}</div>
          <div className="grow"><h2>Spaces</h2><p>Where this agent can receive tasks and answer questions.</p>
            <div className="check-list">
              {mySpaces.map((s) => (
                <label key={s.id} className="check-row">
                  <input type="checkbox" checked={spaceIds.includes(s.id)} onChange={() => setSpaceIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))} />
                  <span className="grow"><strong>{s.name}</strong><small>{s.kind === 'build' ? 'Build space' : 'Home space'} · {s.memberIds.length} members</small></span>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
      <ErrorText error={action.error} />
      <div className="form-actions">
        <button className="btn" onClick={() => go({ page: 'agents' })}>Cancel</button>
        <button className="btn btn-primary" disabled={!name.trim() || !spaceIds.length || action.busy} onClick={submit}>{action.busy ? 'Adding…' : 'Add agent'}</button>
      </div>
    </div>
  );
}
