import { useEffect, useState } from 'react';
import { ArrowUp, BookOpen, GitBranch, Plus, Radio, Square, WandSparkles } from 'lucide-react';
import type { Ctx } from '../route';
import { AgentAvatar, ErrorText, Markdown, PageHeader, StatusBadge, useAction } from '../ui';
import './workspace.css';

export const workspaceCall = (ctx: Ctx, args: Record<string, unknown>) => window.larp ? window.larp.workspace(args) : ctx.larp.act('POST', 'workspace/action', args);

export function Workspace({ ctx }: { ctx: Ctx }) {
  const agents = ctx.state.agents.filter((a) => a.spaceIds.includes(ctx.space.id));
  const tasks = ctx.state.tasks.filter((t) => t.spaceId === ctx.space.id);
  const [agentId, setAgentId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'chat' | 'live'>('chat');
  const [setup, setSetup] = useState(!agents.length);
  const action = useAction();
  const task = tasks.find((t) => t.id === taskId);
  const agent = agents.find((a) => a.id === agentId) || agents.find((a) => a.ownerId === ctx.state.me.id) || agents[0];
  const send = () => { if (action.busy) return; return action.run(async () => {
    if (!message.trim() || !agent) return;
    const sent = message;
    if (task) await ctx.larp.act('POST', `tasks/${task.id}/message`, { text: message });
    else {
      const created = await ctx.larp.act('POST', 'tasks', { spaceId: ctx.space.id, agentId: agent.id, title: message.slice(0, 110), instructions: message, kind: agent.repo ? 'code' : 'general' });
      setTaskId(created.id);
    }
    setMessage((current) => current === sent ? '' : current);
  }); };
  const live = tasks.filter((t) => ['running', 'queued', 'waiting', 'awaiting_approval'].includes(t.status));
  const calls = ctx.state.memory.calls.filter((c) => c.spaceId === ctx.space.id);
  return <div className="page workbench">
    <PageHeader title="Workspace" subtitle="One device. Your agents, skills and apps working together." />
    <div className="bench-toolbar">
      <div className="segmented"><button aria-pressed={view === 'chat'} onClick={() => setView('chat')}>Conversation</button><button aria-pressed={view === 'live'} onClick={() => setView('live')}><Radio size={13} /> Live work {live.length > 0 && `· ${live.length}`}</button></div>
      <span className="grow" /><button className="btn btn-sm" onClick={() => ctx.go({ page: 'skills' })}><BookOpen size={14} /> Skills</button><button className="btn btn-sm" onClick={() => setSetup(!setup)}><Plus size={14} /> Set up team</button>
    </div>
    {setup && <TeamSetup ctx={ctx} onDone={() => { ctx.reloadDevice(); }} />}
    <div className="bench-grid">
      <section className="bench-chat">
        <header><select aria-label="Conversation" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">New conversation</option>{tasks.filter((t) => !t.parentId).slice().reverse().map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>{task && <button className="btn btn-ghost btn-sm" onClick={() => ctx.go({ page: 'task', id: task.id })}>Full trace ↗</button>}</header>
        <div className="bench-messages" aria-live="polite">
          {!task && <div className="bench-welcome"><WandSparkles size={28} /><h2>What should your team do?</h2><p>Ask one agent to lead. It can create specialists, share work and use the skills you assign.</p><button onClick={() => setMessage('Inspect this project. Spawn a Tester agent, ask it to review edge cases, then propose a focused improvement. Use your assigned skills and explain what each agent contributed.')} className="bench-suggestion">Build with a tester and reviewer ↗</button><button onClick={() => setMessage('Read my connected apps. Ask another agent to independently check your findings, then give me a concise plan. Ask before making any app changes.')} className="bench-suggestion">Coordinate across my apps ↗</button></div>}
          {task && <><article className="bench-message human"><small>You</small><Markdown text={task.instructions} /></article>
            {(view === 'live' ? task.log : task.log.filter((l) => ['say', 'note', 'skill', 'app', 'agent', 'usage'].includes(l.kind))).slice(-60).map((l, i) => <article key={i} className={'bench-message ' + l.kind}><small>{ctx.state.agents.find((a) => a.id === task.agentId)?.name} · {l.kind}</small><Markdown text={l.text} /></article>)}
            {task.feedback.map((m, i) => <article className="bench-message human" key={'m' + i}><small>Follow-up</small><Markdown text={m.text} /></article>)}
            {task.asks?.map((ask) => <article className="bench-handoff" key={ask.id}><strong>→ {ask.to}</strong><p>{ask.text}</p>{ask.answer ? <Markdown text={ask.answer.text} /> : <small>Waiting for answer…</small>}<button className="link-btn" onClick={() => ctx.go({ page: 'task', id: ask.childId })}>Inspect specialist task</button></article>)}
            {task.result && <article className="bench-message result"><small>Result</small><Markdown text={task.result.error || task.result.summary} /></article>}
            <StatusBadge status={task.status} />
            {task.context?.status === 'pending' && <p role="status">Recalling Meko context before starting�</p>}
            {task.status === 'queued' && task.context?.status !== 'pending' && <p role="status">{agent?.online ? 'Waiting for an available agent slot�' : 'This agent is offline. Start its host to continue.'}</p>}
            {ctx.state.approvals.filter((a) => a.taskId === task.id || tasks.find((t) => t.id === a.taskId)?.parentId === task.id).map((a) => <article className="bench-handoff" key={a.id}><strong>{a.title}</strong><p>{a.detail}</p><button className="btn btn-primary btn-sm" onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${a.id}`, { decision: 'approve' }))}>Approve</button> <button className="btn btn-sm" onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${a.id}`, { decision: 'deny' }))}>Decline</button></article>)}
          </>}
        </div>
        <div className="bench-compose"><p className="faint small">Enter to send � Shift+Enter for a new line{agent && !agent.usesApps ? ' � App access is off for this agent. Enable it in agent settings to read Swasthya and other apps.' : ''}</p><textarea aria-label="Message your agents" placeholder={task ? 'Follow up here. Active agents receive it at their next turn boundary.' : 'Give your agents a goal…'} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} /><div className="row"><select aria-label="Lead agent" value={agent?.id || ''} disabled={!!task} onChange={(e) => setAgentId(e.target.value)}>{!agents.length && <option>Add an agent first</option>}{agents.map((a) => <option value={a.id} key={a.id}>{a.name} · {a.runtime}</option>)}</select><span className="grow" />{task && live.some((t) => t.id === task.id) && <button className="btn btn-sm" onClick={() => action.run(() => ctx.larp.act('POST', `tasks/${task.id}/cancel`))}><Square size={13} /> Stop</button>}<button className="btn btn-primary" disabled={!message.trim() || !agent || action.busy} onClick={send}><ArrowUp size={15} /> {action.busy ? 'Sending�' : 'Send'}</button></div><ErrorText error={action.error} /></div>
      </section>
      <aside className="bench-inspector"><h3>Agent team <span>{agents.length} / 8</span></h3>{agents.map((a) => { const current = live.find((t) => t.agentId === a.id); return <button className="bench-agent" key={a.id} onClick={() => current ? setTaskId(current.id) : ctx.go({ page: 'agent', id: a.id })}><AgentAvatar agent={a} owner={ctx.state.me} size={30} /><div><strong>{a.name}</strong><small>{current?.status || (a.online ? 'Ready' : 'Offline')} · {a.model || a.runtime}</small><p>{current?.title || a.repo || 'General assistant'}</p><div className="bench-tags">{(a.skills || []).map((s) => <span key={s}>{s}</span>)}</div></div></button>; })}
        <div className="bench-memory"><h3>Memory & persistence</h3><p><span className={'conn-dot ' + (ctx.state.memory.on ? 'on' : 'off')} /> Meko {ctx.state.memory.on ? 'enabled' : 'off / unavailable'}</p><p>History: {ctx.state.memory.store === 'yugabyte' ? 'YugabyteDB' : 'Local fallback'}</p><div className="bench-metrics"><div><strong>{calls.filter((c) => c.ok && c.kind === 'recall').length}</strong><small>successful recalls*</small></div><div><strong>{calls.filter((c) => c.ok && c.kind === 'write').length}</strong><small>successful writes*</small></div></div><small>*Recent retained call log</small><button className="link-btn" onClick={() => ctx.go({ page: 'memory' })}>Open memory graph & full statistics ↗</button></div>
        <button className="btn" onClick={() => ctx.go({ page: 'settings', tab: 'telegram' })}>Pair Telegram / phone control</button>
      </aside>
    </div>
  </div>;
}

function TeamSetup({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const [runtime, setRuntime] = useState('codex'); const [name, setName] = useState('Lead');
  const [model, setModel] = useState(''); const [key, setKey] = useState(''); const [repo, setRepo] = useState('');
  const [repoPath, setRepoPath] = useState(''); const [useApps, setUseApps] = useState(false);
  const [connected, setConnected] = useState<any>({}); const [note, setNote] = useState('');
  const action = useAction();
  const call = (args: Record<string, unknown>) => workspaceCall(ctx, args);
  useEffect(() => { call({ action: 'connection' }).then(setConnected).catch(() => {}); }, []);
  return <section className="bench-setup"><h3>Connect once. Create your team.</h3><div className="bench-setup-grid">
    <div><label>Runtime<select value={runtime} onChange={(e) => { setRuntime(e.target.value); setModel(e.target.value === 'openai' ? 'gpt-6-luna' : ''); }}><option value="codex">Codex · ChatGPT subscription</option><option value="openai">OpenAI · your API key</option></select></label>
      {runtime === 'codex' ? <><p className="faint small">Uses this computer's official Codex sign-in and plan limits.</p><button className="btn btn-sm" disabled={!window.larp || action.busy} onClick={() => action.run(async () => { const r = await window.larp!.codexProfile!({ action: 'login', own: false }); setNote(r.detail); })}>Sign in with ChatGPT</button></> : <><label>OpenAI key {connected.apiKey ? '· saved securely' : ''}<input type="password" autoComplete="off" value={key} placeholder="sk-…" onChange={(e) => setKey(e.target.value)} /></label><button className="btn btn-sm" disabled={!key || action.busy} onClick={() => action.run(async () => { await call({ action: 'saveKey', key }); setKey(''); setConnected({ ...connected, apiKey: true }); setNote('Key verified and encrypted on this computer.'); })}>Connect API key</button></>}
    </div>
    <div><label>GitHub repository<input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" /></label><div className="row"><button className="btn btn-sm" disabled={action.busy} onClick={() => action.run(async () => { const r = await call({ action: 'githubLogin' }); setNote(r.code ? `GitHub device code: ${r.code}. Complete sign-in in your browser.` : 'GitHub connected'); })}>{connected.github ? 'GitHub connected' : 'Connect GitHub'}</button><button className="btn btn-sm" disabled={!repo || action.busy} onClick={() => action.run(async () => { const r = await call({ action: 'cloneRepo', repo }); setRepoPath(r.path); setNote('Repository ready. Create your agents below.'); })}><GitBranch size={13} /> Clone</button></div><button className="link-btn" disabled={!window.larp} onClick={() => action.run(async () => { const p = await window.larp!.chooseFolder(); if (p) setRepoPath(p); })}>Or choose a local Git repository</button>{repoPath && <p className="mono small">{repoPath}</p>}</div>
    <div><label>Agent name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Model<input value={model} onChange={(e) => setModel(e.target.value)} placeholder={runtime === 'codex' ? 'Runtime default' : 'gpt-6-luna'} /></label><label className="check-row"><input type="checkbox" checked={useApps} onChange={(e) => setUseApps(e.target.checked)} /> Allow connected app access (writes ask first)</label><button className="btn btn-primary" disabled={!name.trim() || action.busy || (runtime === 'openai' && !connected.apiKey)} onClick={() => action.run(async () => { await call({ action: 'createAgent', name, runtime, model, repoPath, useApps, spaceId: ctx.space.id }); setName('Specialist'); setNote('Agent created. Assign skills in the Skills library, or ask it to spawn specialists.'); onDone(); })}><Plus size={14} /> Create agent</button></div>
  </div>{note && <p className="small">{note}</p>}<ErrorText error={action.error} /></section>;
}

export function SkillsPage({ ctx }: { ctx: Ctx }) {
  const [skills, setSkills] = useState<any[]>([]); const [query, setQuery] = useState(''); const [agentId, setAgentId] = useState('');
  const [selected, setSelected] = useState<any>(null); const action = useAction();
  const agents = ctx.state.agents.filter((a) => a.ownerId === ctx.state.me.id && a.spaceIds.includes(ctx.space.id));
  const agent = agents.find((a) => a.id === agentId) || agents[0];
  const refresh = () => workspaceCall(ctx, { action: 'skills' }).then(setSkills);
  useEffect(() => { action.run(refresh); }, []);
  const filtered = skills.filter((s) => `${s.slug} ${s.name} ${s.title} ${s.description} ${s.repo}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page"><PageHeader title="Skills" subtitle={`${skills.length} skills from the Larp website. Install once, assign to several agents, inspect each task's skill trace.`} /><div className="bench-toolbar"><input aria-label="Search skills" placeholder="Search skills, publishers, capabilities…" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Assign skills to agent" value={agent?.id || ''} onChange={(e) => setAgentId(e.target.value)}>{!agents.length && <option>Create an agent first</option>}{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div><ErrorText error={action.error} />
    {selected && <section className="bench-setup"><button className="btn btn-sm" onClick={() => setSelected(null)}>Close details</button><h3>{selected.title}</h3><p>{selected.description}</p><a href={selected.url} target="_blank" rel="noreferrer">Original skill source ↗</a><p className="mono small">{selected.installed ? `Pinned commit ${selected.installed.revision}` : selected.install}</p><details><summary>Installed instructions</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>{selected.instructions || 'Install this skill to inspect its local instructions.'}</pre></details><p className="faint small">Supporting files are installed with the skill. External tools and accounts still require setup. Loaded skills appear in the task trace; a load is not a claim that every instruction was executed.</p></section>}
    <div className="skill-library">{filtered.slice(0, 90).map((s) => { const assigned = agent?.skills?.includes(s.slug); const users = ctx.state.agents.filter((a) => a.skills?.includes(s.slug)); return <article className="skill-library-card" key={s.slug}><button className="skill-title" onClick={() => action.run(async () => setSelected(s.installed ? { ...s, ...await workspaceCall(ctx, { action: 'skillDetail', slug: s.slug }) } : s))}>{s.title || s.name} <span>↗</span></button><small>{s.repo}</small><p>{s.description}</p><footer><span className="faint small">{s.installed ? `${s.installed.revision.slice(0, 8)} · ${users.length} agents` : 'Available'}</span><span className="grow" />{!s.installed ? <button className="btn btn-sm" disabled={action.busy} onClick={() => action.run(async () => { await workspaceCall(ctx, { action: 'installSkill', slug: s.slug }); await refresh(); })}>Install</button> : <button className={'btn btn-sm ' + (assigned ? 'btn-primary' : '')} disabled={!agent || action.busy} onClick={() => action.run(async () => { const next = assigned ? (agent.skills || []).filter((x) => x !== s.slug) : [...(agent.skills || []), s.slug]; if (next.length > 8) throw new Error('Assign up to 8 skills per agent'); await workspaceCall(ctx, { action: 'assignSkills', agentId: agent.id, skills: next }); ctx.reloadDevice(); })}>{assigned ? 'Assigned ✓' : 'Assign'}</button>}</footer></article>; })}</div>{filtered.length > 90 && <p className="faint small">Showing 90 of {filtered.length}. Search to narrow the library.</p>}</div>;
}
