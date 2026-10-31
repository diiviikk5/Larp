import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Clock, LayoutGrid, Plus } from 'lucide-react';
import '@fontsource-variable/manrope';
import './ocean.css';
import type { Ctx } from '../route';
import { AgentAvatar, StatusBadge, agentStatus, timeAgo, useAction } from '../ui';
import { Ocean } from './engine';

/** The living sea behind the whole app in Ocean mode. */
export function OceanBackdrop({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ocean = useRef<Ocean | null>(null);
  useEffect(() => {
    ocean.current = new Ocean(ref.current!);
    return () => ocean.current?.dispose();
  }, []);
  // The sea only swims on the home screen; elsewhere it rests behind frosted glass.
  useEffect(() => { ocean.current?.setPaused(!active); }, [active]);
  return (
    <div className="ocean-sea" aria-hidden="true">
      <div className="ocean-rays" />
      <canvas ref={ref} className="ocean-canvas" />
      <div className="ocean-glow" />
    </div>
  );
}

export function OceanMenuButton({ onClick }: { onClick: () => void }) {
  return <button className="ocean-menu ocean-glass" aria-label="Menu" onClick={onClick}><LayoutGrid size={15} /></button>;
}

/** Ocean home: one question, one box. Enter sends to the chosen agent. */
export function OceanHome({ ctx }: { ctx: Ctx }) {
  const { state, space } = ctx;
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const remembered = localStorage.getItem(`larp.agent.${space.id}`) || '';
  const [agentId, setAgentId] = useState(agents.some((a) => a.id === remembered) ? remembered : agents.find((a) => a.ownerId === state.me.id)?.id || agents[0]?.id || '');
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState(false);
  const action = useAction();
  const box = useRef<HTMLTextAreaElement>(null);
  const agent = agents.find((a) => a.id === agentId) || agents[0];
  const owner = state.people.find((p) => p.id === agent?.ownerId);
  const mine = agent?.ownerId === state.me.id;
  const tasks = state.tasks.filter((t) => t.spaceId === space.id);
  const waiting = state.approvals.filter((a) => a.spaceId === space.id).length + tasks.filter((t) => t.createdBy === state.me.id && t.status === 'needs_review').length;
  useEffect(() => { box.current?.focus(); }, []);

  const send = () => {
    if (!agent || !text.trim() || action.busy) return;
    localStorage.setItem(`larp.agent.${space.id}`, agent.id);
    const [first, ...rest] = text.trim().split('\n');
    action.run(async () => {
      const task = await ctx.larp.act('POST', 'tasks', {
        spaceId: space.id, agentId: agent.id, kind: space.kind === 'build' ? 'code' : 'general',
        title: first.slice(0, 80), instructions: rest.length ? text.trim() : first,
      });
      setText('');
      ctx.go({ page: 'task', id: task.id });
    });
  };

  return (
    <div className="ocean-home">
      <div className="ocean-history">
        <button className="ocean-pill ocean-glass" aria-expanded={history} onClick={() => setHistory((h) => !h)}><Clock size={12} /> History <span className="caret">▾</span></button>
        {history && (
          <div className="ocean-history-list ocean-glass" role="menu">
            {!tasks.length ? <p className="ocean-empty">Nothing asked yet.</p> : tasks.slice(0, 8).map((t) => (
              <button key={t.id} role="menuitem" onClick={() => ctx.go({ page: 'task', id: t.id })}>
                <span className="grow">{t.title}</span><StatusBadge status={t.status} /><small>{timeAgo(t.createdAt)}</small>
              </button>
            ))}
            {tasks.length > 8 && <button role="menuitem" className="ocean-all" onClick={() => ctx.go({ page: 'tasks' })}>All tasks</button>}
          </div>
        )}
      </div>

      <div className="ocean-center">
        <div className="ocean-halo" />
        <h1 className="ocean-title">what's on your mind?</h1>
        <div className="ocean-box ocean-glass">
          <textarea ref={box} rows={2} value={text} aria-label="Ask your agents" disabled={!agent}
            placeholder={agent ? (mine ? `Ask ${agent.name} anything…` : `Ask ${owner?.name}'s ${agent.name} anything…`) : 'Add an agent to start asking…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="ocean-row">
            <button className="ocean-icon" aria-label="More options" onClick={() => (agent ? ctx.newTask({ agentId: agent.id }) : ctx.go({ page: 'agent-new' }))}><Plus size={15} /></button>
            {agent && (
              <div className="ocean-agent">
                <button className="ocean-chip" aria-haspopup="listbox" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
                  <AgentAvatar agent={agent} owner={owner} size={16} status={agentStatus(agent)} />{agent.name}<span className="faint">{mine ? '' : `· ${owner?.name}`}</span>
                </button>
                {picking && (
                  <div className="ocean-picker ocean-glass" role="listbox">
                    {agents.map((a) => {
                      const o = state.people.find((p) => p.id === a.ownerId);
                      return (
                        <button key={a.id} role="option" aria-selected={a.id === agent.id} onClick={() => { setAgentId(a.id); setPicking(false); box.current?.focus(); }}>
                          <AgentAvatar agent={a} owner={o} size={18} status={agentStatus(a)} /><span className="grow">{a.name}</span><small>{o?.id === state.me.id ? 'you' : o?.name}</small>{a.id === agent.id && <Check size={13} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <span className="grow" />
            <span className="ocean-hint"><kbd>↵</kbd> send <span>·</span> <kbd>⇧↵</kbd> newline</span>
            <button className="ocean-send" aria-label="Send" disabled={!text.trim() || action.busy || !agent} onClick={send}><ArrowUp size={14} /></button>
          </div>
        </div>
        {action.error && <p className="ocean-error">{action.error}</p>}
        {!agent && <button className="ocean-pill ocean-glass ocean-cta" onClick={() => ctx.go({ page: 'agent-new' })}><Plus size={12} /> Add an agent</button>}
        {waiting > 0 && <button className="ocean-pill ocean-glass ocean-cta" onClick={() => ctx.go({ page: 'tasks', filter: 'review' })}>{waiting} {waiting === 1 ? 'thing needs' : 'things need'} you</button>}
      </div>
    </div>
  );
}
