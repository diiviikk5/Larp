import { useEffect, useMemo, useState } from 'react';
import { Database, Pause, Play, Plus } from 'lucide-react';
import type { Ctx } from '../route';
import type { MekoCall } from '../types';
import { MemoryExtras } from './MemoryExtras';
import '../memory-extras.css';
import { AgentAvatar, EmptyState, ErrorText, PageHeader, Tag, clock, timeAgo, useAction, useTick } from '../ui';

type Stats = { source: 'yugabyte' | 'recent'; total: number; byKind: Record<string, number>; byAgent: { agent: string; recalls: number; writes: number; notes_sent: number }[]; days: { day: string; n: number }[]; database?: string };

const KIND_LABEL: Record<string, string> = { recall: 'recalled', write: 'remembered', promote: 'promoted', forget: 'forgot', correct: 'corrected', setup: 'set up', other: 'called' };

/** Agent memory in this space: every element below is drawn from a logged Meko call. */
export function MemoryPage({ ctx }: { ctx: Ctx }) {
  useTick(5000);
  const { state, space } = ctx;
  const memory = state.memory;
  const action = useAction();
  const [stats, setStats] = useState<Stats | null>(null);
  const [lesson, setLesson] = useState('');
  const calls = useMemo(() => memory.calls.filter((c) => (!c.spaceId || c.spaceId === space.id) && !c.skipped && c.kind !== 'setup'), [memory.calls, space.id]);
  const [cursor, setCursor] = useState<number | null>(null); // null = live
  const [playing, setPlaying] = useState(false);
  const shown = cursor === null ? calls : calls.slice(0, cursor);

  useEffect(() => { ctx.larp.act<Stats>('GET', 'memory/stats').then(setStats).catch(() => {}); }, [memory.calls.length]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCursor((c) => {
      const next = (c ?? 0) + 1;
      if (next >= calls.length) { setPlaying(false); return null; }
      return next;
    }), 450);
    return () => clearInterval(timer);
  }, [playing, calls.length]);

  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const lessons = memory.lessons.filter((l) => l.spaceId === space.id).slice().reverse();
  const count = (kind: string) => shown.filter((c) => c.kind === kind).length;
  const notes = shown.filter((c) => c.kind === 'write' && c.toId).length;

  return (
    <div className="page memory-page">
      <PageHeader
        title="Memory"
        subtitle="What agents in this space remember across days, the notes they pass each other, and the knowledge people approved. Everything here is a logged call to Meko."
        actions={
          <div className="memory-switch">
            <span className="small">{!memory.configured ? 'Meko not connected' : memory.on ? 'Memory on' : 'Memory off'}</span>
            <button className={'switch' + (memory.on ? ' on' : '')} role="switch" aria-checked={memory.on} aria-label="Agent memory" disabled={!memory.configured || action.busy}
              onClick={() => action.run(() => ctx.larp.act('POST', 'memory/toggle', { on: !memory.on }))}><i /></button>
          </div>
        }
      />
      <ErrorText error={action.error} />
      {!memory.configured && (
        <div className="callout">Add <code>MEKO_API_KEY</code> (and optionally <code>LARP_TEAM</code>) to <code>.env</code> and restart Larp to give agents memory. Without it, every agent only sees the task in front of it.</div>
      )}

      <div className="memory-stats">
        <Counter label="Recalls" value={count('recall')} />
        <Counter label="Memories written" value={count('write') - notes} />
        <Counter label="Notes between agents" value={notes} />
        <Counter label="Promoted to space" value={count('promote')} />
        <Counter label="Tokens saved (Meko)" value={memory.totals?.saved || 0} />
        <Counter label={stats?.source === 'yugabyte' ? 'All-time calls · YugabyteDB' : 'Calls logged'} value={stats?.total ?? calls.length} icon={stats?.source === 'yugabyte' ? <Database size={13} /> : undefined} />
      </div>

      <section className="memory-board">
        <div className="memory-graph-wrap">
          <SwarmGraph ctx={ctx} calls={shown} />
          <div className="replay">
            <button className="btn btn-sm" disabled={!calls.length} onClick={() => { if (playing) setPlaying(false); else { setCursor(cursor === null || cursor >= calls.length ? 0 : cursor); setPlaying(true); } }}>
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Replay'}
            </button>
            <input type="range" min={0} max={calls.length} value={cursor ?? calls.length} aria-label="Replay position"
              onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setCursor(v >= calls.length ? null : v); }} />
            <span className="faint small mono">{cursor === null ? 'live' : `${cursor}/${calls.length} · ${shown.at(-1) ? clock(shown.at(-1)!.at) : 'start'}`}</span>
          </div>
        </div>
        <div className="memory-stream">
          <h3>Calls</h3>
          {!shown.length ? <p className="faint small">No calls yet. Run a task and its agent will recall before working and remember after.</p> : (
            <ol>
              {shown.slice().reverse().slice(0, 80).map((c) => <CallRow key={c.id} ctx={ctx} call={c} />)}
            </ol>
          )}
        </div>
      </section>

      <div className="memory-columns">
        <section className="card">
          <h3>Space knowledge</h3>
          <p className="faint small">Lessons a person approved. They are promoted in Meko, so every agent in {space.name} recalls them.</p>
          <form className="lesson-form" onSubmit={(e) => { e.preventDefault(); if (lesson.trim()) action.run(async () => { await ctx.larp.act('POST', 'lessons', { spaceId: space.id, text: lesson }); setLesson(''); }); }}>
            <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Teach every agent here something…" aria-label="New lesson" disabled={!memory.on} />
            <button className="btn btn-sm" disabled={!memory.on || !lesson.trim() || action.busy}><Plus size={13} /> Add</button>
          </form>
          {!lessons.length ? <EmptyState pose="sleeping" title="No lessons yet">Add one here, or when you accept a task.</EmptyState> : (
            <ul className="lessons">
              {lessons.map((l) => (
                <li key={l.id}>
                  <p>{l.text}</p>
                  <span className="faint small">
                    <Tag tone={l.status === 'promoted' ? 'good' : l.status === 'declined' ? 'bad' : 'warn'}>{l.status === 'pending' ? 'waiting for approval' : l.status}</Tag>
                    {' '}by {state.people.find((p) => p.id === l.proposedBy)?.name} · {timeAgo(l.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h3>Each agent's memory</h3>
          <p className="faint small">One Meko datapack per agent: it persists across days and machines, and other agents can leave notes in it.</p>
          <ul className="agent-packs">
            {agents.map((a) => {
              const mine = calls.filter((c) => c.agentId === a.id);
              const received = calls.filter((c) => c.toId === a.id).length;
              return (
                <li key={a.id}>
                  <AgentAvatar agent={a} owner={state.people.find((p) => p.id === a.ownerId)} size={26} />
                  <div className="grow">
                    <strong>{a.name}</strong>
                    <small className="faint mono">{memory.packs.agents[a.id] || 'no datapack'}</small>
                  </div>
                  <span className="small faint">{mine.filter((c) => c.kind === 'recall').length} recalls · {mine.filter((c) => c.kind === 'write').length} writes · {received} notes in</span>
                </li>
              );
            })}
          </ul>
          <p className="faint small store-line"><Database size={12} /> History stored in {memory.store === 'yugabyte' ? `YugabyteDB${stats?.database ? ` (${stats.database})` : ''}` : 'local files on the host computer'}.</p>
        </section>
      </div>
      <MemoryExtras ctx={ctx} memory={memory} />
    </div>
  );
}

function Counter({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return <div className="counter"><strong className="mono">{value}</strong><span>{icon}{label}</span></div>;
}

function CallRow({ ctx, call }: { ctx: Ctx; call: MekoCall }) {
  const task = call.taskId ? ctx.state.tasks.find((t) => t.id === call.taskId) : null;
  return (
    <li className={'call kind-' + call.kind + (call.ok ? '' : ' failed')} onClick={() => task && ctx.go({ page: 'task', id: task.id })}>
      <span className="call-kind">{call.kind}</span>
      <div className="grow">
        <p><strong>{call.agent || 'Larp'}</strong> {KIND_LABEL[call.kind]}{call.to ? <> → <strong>{call.to}</strong></> : ''} <span className="faint mono small">{call.tool}</span></p>
        <p className="faint small call-summary">{call.ok ? call.summary : call.error}</p>
      </div>
      <span className="faint small mono">{clock(call.at)}<br />{call.ms}ms{call.resultCount !== null ? ` · ${call.resultCount}` : ''}</span>
    </li>
  );
}

/** Agents (and the space's shared knowledge) as nodes; one edge per pair that exchanged calls. */
function SwarmGraph({ ctx, calls }: { ctx: Ctx; calls: MekoCall[] }) {
  const { state, space } = ctx;
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const W = 560, H = 340, cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 56;
  const pos = new Map<string, { x: number; y: number }>();
  agents.forEach((a, i) => {
    // Start on the left so two agents sit either side of the space node.
    const angle = (i / Math.max(agents.length, 1)) * Math.PI * 2 + Math.PI;
    pos.set(a.id, { x: cx + Math.cos(angle) * r * 1.25, y: cy + Math.sin(angle) * r });
  });
  pos.set('space', { x: cx, y: cy });
  const spacePack = state.memory.packs.spaces[space.id];
  const edges = new Map<string, { from: string; to: string; n: number; kinds: Set<string>; last: string }>();
  const own = new Map<string, number>();
  for (const c of calls) {
    if (!c.agentId && c.kind !== 'promote') continue;
    const target = c.toId || (spacePack && c.datapack === spacePack ? 'space' : null);
    const from = c.agentId || 'space';
    if (!target || target === from) { own.set(from, (own.get(from) || 0) + 1); continue; }
    const key = `${from}>${target}`;
    const e = edges.get(key) || { from, to: target, n: 0, kinds: new Set(), last: c.at };
    e.n++; e.kinds.add(c.kind); e.last = c.at;
    edges.set(key, e);
  }
  const latest = calls.at(-1)?.at;
  if (!agents.length) return <EmptyState pose="sleeping" title="No agents in this space">Add an agent to see its memory here.</EmptyState>;
  return (
    <svg className="swarm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agents and the Meko calls between them">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="arrow-head" /></marker>
      </defs>
      {[...edges.values()].map((e) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
        const hot = e.last === latest;
        return (
          <g key={e.from + e.to} className={'edge' + (hot ? ' hot' : '') + (e.kinds.has('promote') ? ' promote' : '')}>
            <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} strokeWidth={1 + Math.min(e.n, 6) * 0.6} markerEnd="url(#arrow)" />
            <text x={mx} y={my} className="edge-label">{e.n}</text>
          </g>
        );
      })}
      <g className="node node-space">
        <circle cx={cx} cy={cy} r={30} />
        <text x={cx} y={cy - 2} textAnchor="middle" className="node-name">space</text>
        <text x={cx} y={cy + 11} textAnchor="middle" className="node-sub">knowledge</text>
      </g>
      {agents.map((a) => {
        const p = pos.get(a.id)!;
        const owner = state.people.find((x) => x.id === a.ownerId);
        const active = calls.at(-1)?.agentId === a.id || calls.at(-1)?.toId === a.id;
        return (
          <g key={a.id} className={'node' + (active ? ' active' : '')}>
            <circle cx={p.x} cy={p.y} r={24} style={{ stroke: owner?.color }} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="node-initial">{a.name.slice(0, 2)}</text>
            <text x={p.x} y={p.y + 40} textAnchor="middle" className="node-name">{a.name}</text>
            <text x={p.x} y={p.y + 53} textAnchor="middle" className="node-sub">{owner?.name} · {own.get(a.id) || 0} own</text>
          </g>
        );
      })}
    </svg>
  );
}
