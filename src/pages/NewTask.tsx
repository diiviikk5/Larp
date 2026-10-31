import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Ctx } from '../route';
import { AgentAvatar, ErrorText, Field, Kbd, Sheet, agentStatus, useAction } from '../ui';

export function NewTaskSheet({ ctx, agentId: preset, onClose, onCreated }: { ctx: Ctx; agentId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { state, space } = ctx;
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const remembered = localStorage.getItem(`larp.agent.${space.id}`) || '';
  const [agentId, setAgentId] = useState(preset || (agents.some((a) => a.id === remembered) ? remembered : agents.find((a) => a.ownerId === state.me.id)?.id || agents[0]?.id || ''));
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [check, setCheck] = useState(() => localStorage.getItem(`larp.check.${space.id}`) || '');
  const action = useAction();
  const agent = agents.find((a) => a.id === agentId);
  const owner = state.people.find((p) => p.id === agent?.ownerId);
  const host = state.hosts.find((h) => h.id === agent?.hostId);
  const mine = agent?.ownerId === state.me.id;
  const people = state.people.filter((p) => agents.some((a) => a.ownerId === p.id));

  const create = () => {
    if (!agent || !instructions.trim()) return;
    localStorage.setItem(`larp.agent.${space.id}`, agent.id);
    localStorage.setItem(`larp.check.${space.id}`, check);
    action.run(async () => {
      const task = await ctx.larp.act('POST', 'tasks', {
        spaceId: space.id, agentId: agent.id, kind: space.kind === 'build' ? 'code' : 'general',
        title: title.trim() || instructions.trim().split('\n')[0].slice(0, 80), instructions, check: check.trim() || undefined,
      });
      onCreated(task.id);
    });
  };

  return (
    <Sheet title="New task" subtitle={`in ${space.name}`} onClose={onClose} width={620}
      footer={<>
        <span className="faint small"><Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> to create</span>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!agent || !instructions.trim() || action.busy} onClick={create}>
          {mine ? 'Create task' : `Send to ${owner?.name}`}
        </button>
      </>}>
      <div className="form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); create(); } }}>
        <Field label="Assign to">
          {!agents.length ? (
            <div className="notice">No agents in this space yet. <button className="link" onClick={() => { onClose(); ctx.go({ page: 'agent-new' }); }}>Add one</button></div>
          ) : (
            <div className="agent-picker" role="radiogroup" aria-label="Agent">
              {people.map((p) => (
                <div key={p.id} className="agent-group">
                  <div className="agent-group-label">{p.id === state.me.id ? 'Your agents' : `${p.name}'s agents`}</div>
                  {agents.filter((a) => a.ownerId === p.id).map((a) => {
                    const h = state.hosts.find((x) => x.id === a.hostId);
                    return (
                      <button key={a.id} role="radio" aria-checked={a.id === agentId} className={'agent-option' + (a.id === agentId ? ' selected' : '')} onClick={() => setAgentId(a.id)}>
                        <AgentAvatar agent={a} owner={p} size={30} status={agentStatus(a)} />
                        <span className="grow">
                          <strong>{a.name}</strong>
                          <small>{a.runtime}{a.model ? ` · ${a.model}` : ''} · {h?.name}{a.repo ? ` · ${a.repo}` : ''}</small>
                        </span>
                        <span className={'presence-text small ' + (a.busy ? 'accent' : a.online ? 'good' : 'faint')}>{a.busy ? 'Busy' : a.online ? 'Online' : 'Offline'}</span>
                        {a.id === agentId && <Check size={15} className="accent" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Field>
        <Field label="Title" htmlFor="task-title" hint="Optional. Defaults to the first line of the instructions.">
          <input id="task-title" placeholder="Fix the login redirect loop" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Instructions" htmlFor="task-instructions">
          <textarea id="task-instructions" rows={8} placeholder={'Describe the outcome you want, constraints, and anything the agent should know.\n\nThe agent sees the repository but nothing else on the machine.'} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
        {space.kind === 'build' && (
          <Field label="Check command" htmlFor="task-check" hint="Runs on the agent owner's machine after the agent finishes. A task is verified only if this exits with 0.">
            <input id="task-check" className="mono" placeholder="npm test" value={check} onChange={(e) => setCheck(e.target.value)} />
          </Field>
        )}
        {agent && (
          <div className="flow">
            <div className="flow-label">What happens next</div>
            <ol>
              {!mine && <li><strong>{owner?.name} approves</strong> running this on their machine. They see the instructions{check ? ' and the check command' : ''} first.</li>}
              <li><strong>{agent.name} works on {host?.name}</strong>{agent.repo ? <> in a new git worktree of <code>{agent.repo}</code>, on its own branch.</> : ' in an isolated folder.'}</li>
              {check && space.kind === 'build' && <li><strong>Larp runs</strong> <code>{check}</code> there and records the result.</li>}
              <li><strong>You review</strong> the changes, ask for revisions, or accept and apply them to your own copy.</li>
            </ol>
          </div>
        )}
        <ErrorText error={action.error} />
      </div>
    </Sheet>
  );
}

export function NewTaskButton({ ctx }: { ctx: Ctx }) {
  return <button className="btn btn-primary" onClick={() => ctx.newTask()}><Plus size={15} /> New task</button>;
}

/** The always-there prompt box: type, pick an agent, send. Detailed options open the full sheet. */
export function QuickCompose({ ctx }: { ctx: Ctx }) {
  const { state, space } = ctx;
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const remembered = localStorage.getItem(`larp.agent.${space.id}`) || '';
  const [agentId, setAgentId] = useState(agents.some((a) => a.id === remembered) ? remembered : agents.find((a) => a.ownerId === state.me.id)?.id || agents[0]?.id || '');
  const [text, setText] = useState('');
  const [check, setCheck] = useState(() => localStorage.getItem(`larp.check.${space.id}`) || '');
  const [picking, setPicking] = useState(false);
  const action = useAction();
  const agent = agents.find((a) => a.id === agentId) || agents[0];
  const owner = state.people.find((p) => p.id === agent?.ownerId);
  const mine = agent?.ownerId === state.me.id;

  const send = () => {
    if (!agent || !text.trim()) return;
    localStorage.setItem(`larp.agent.${space.id}`, agent.id);
    localStorage.setItem(`larp.check.${space.id}`, check);
    const [first, ...rest] = text.trim().split('\n');
    action.run(async () => {
      const task = await ctx.larp.act('POST', 'tasks', {
        spaceId: space.id, agentId: agent.id, kind: space.kind === 'build' ? 'code' : 'general',
        title: first.slice(0, 80), instructions: rest.length ? text.trim() : first, check: check.trim() || undefined,
      });
      setText('');
      ctx.go({ page: 'task', id: task.id });
    });
  };

  if (!agents.length) {
    return (
      <div className="quick quick-empty">
        <span>Add an agent to start delegating work.</span>
        <button className="btn btn-primary btn-sm" onClick={() => ctx.go({ page: 'agent-new' })}><Plus size={14} /> Add agent</button>
      </div>
    );
  }

  return (
    <div className="quick">
      <textarea aria-label="Describe a task" rows={2} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={mine ? `What should ${agent?.name} do?` : `What should ${owner?.name}'s ${agent?.name} do? ${owner?.name} approves before it runs.`}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
      <div className="quick-row">
        <div className="quick-picker">
          <button className="chip" aria-haspopup="listbox" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            {agent && <AgentAvatar agent={agent} owner={owner} size={18} status={agentStatus(agent)} />}
            <span>{agent?.name}</span><span className="faint">{mine ? 'you' : owner?.name}</span>
          </button>
          {picking && (
            <div className="dropdown up" role="listbox" aria-label="Agent">
              {agents.map((a) => {
                const o = state.people.find((p) => p.id === a.ownerId);
                return (
                  <button key={a.id} role="option" aria-selected={a.id === agent?.id} className="dropdown-item" onClick={() => { setAgentId(a.id); setPicking(false); }}>
                    <AgentAvatar agent={a} owner={o} size={22} status={agentStatus(a)} />
                    <span className="grow">{a.name} <span className="faint">· {o?.id === state.me.id ? 'you' : o?.name}</span></span>
                    {a.id === agent?.id && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {space.kind === 'build' && (
          <label className="chip check-chip"><span className="faint mono">check $</span><input aria-label="Check command" className="mono" placeholder="npm test" value={check} onChange={(e) => setCheck(e.target.value)} /></label>
        )}
        <span className="grow" />
        <button className="btn btn-ghost btn-sm" onClick={() => ctx.newTask({ agentId: agent?.id })}>More options</button>
        <button className="btn btn-primary btn-sm" disabled={!text.trim() || action.busy} onClick={send}>{mine ? 'Start' : `Send to ${owner?.name}`} <Kbd>Ctrl ⏎</Kbd></button>
      </div>
      {action.error && <p className="error-text">{action.error}</p>}
    </div>
  );
}
