import { useMemo, useState } from 'react';
import { ListChecks, Plus, Search } from 'lucide-react';
import type { Ctx, TaskFilter } from '../route';
import type { Task } from '../types';
import { AgentAvatar, Avatar, CheckBadge, EmptyState, PageHeader, StatusBadge, agentStatus, diffStats, timeAgo } from '../ui';

const FILTERS: { id: TaskFilter; label: string; match: (t: Task, me: string) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'mine', label: 'Mine', match: (t, me) => t.createdBy === me || t.ownerId === me },
  { id: 'active', label: 'Active', match: (t) => ['awaiting_approval', 'queued', 'running', 'revision_requested', 'applying'].includes(t.status) },
  { id: 'review', label: 'In review', match: (t) => ['needs_review', 'failed', 'interrupted'].includes(t.status) },
  { id: 'done', label: 'Done', match: (t) => ['accepted', 'applied', 'apply_failed', 'denied', 'cancelled'].includes(t.status) },
];

export function Tasks({ ctx, initial }: { ctx: Ctx; initial?: TaskFilter }) {
  const { state, space, go } = ctx;
  const [filter, setFilter] = useState<TaskFilter>(initial || 'all');
  const [query, setQuery] = useState('');
  const [agentId, setAgentId] = useState('');
  const all = state.tasks.filter((t) => t.spaceId === space.id);
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const q = query.toLowerCase().trim();
    return all.filter((t) => f.match(t, state.me.id) && (!agentId || t.agentId === agentId) && (!q || t.title.toLowerCase().includes(q) || t.instructions.toLowerCase().includes(q)));
  }, [all, filter, query, agentId, state.me.id]);

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle="Work delegated to agents in this space. Each task runs on its agent owner's machine and is checked there."
        actions={<button className="btn btn-primary" onClick={() => ctx.newTask()}><Plus size={15} /> New task</button>}
      >
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<span className="seg-count">{all.filter((t) => f.match(t, state.me.id)).length}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <select aria-label="Filter by agent" className="select-sm" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="search-field"><Search size={14} /><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </PageHeader>

      {!all.length ? (
        <EmptyState pose="idle" title="No tasks yet" action={<button className="btn btn-primary" onClick={() => ctx.newTask()}><Plus size={15} /> New task</button>}>
          Give a task to your own agent, or to a teammate's. They approve it, their agent works in an isolated git worktree, and you get back a diff and a check result.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Task</th><th>Status</th><th>Agent</th><th>Requested by</th><th>Check</th><th className="num">Changes</th><th className="num">Updated</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const agent = state.agents.find((a) => a.id === t.agentId);
                const owner = state.people.find((p) => p.id === t.ownerId);
                const by = state.people.find((p) => p.id === t.createdBy);
                const stats = t.result?.diff ? diffStats(t.result.diff) : null;
                const needsMe = state.approvals.some((a) => a.taskId === t.id);
                return (
                  <tr key={t.id} className="clickable" onClick={() => go({ page: 'task', id: t.id })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go({ page: 'task', id: t.id }); }}>
                    <td className="task-cell">
                      <strong>{t.title}</strong>
                      <small>{t.repo ? `${t.repo}${t.result?.branch ? ` · ${t.result.branch}` : ''}` : 'no repository'}{t.conflicts.length ? ' · overlaps another task' : ''}</small>
                    </td>
                    <td>{needsMe ? <span className="badge tone-warn"><i />Your approval</span> : <StatusBadge status={t.status} />}</td>
                    <td><span className="cell-agent">{agent && <AgentAvatar agent={agent} owner={owner} size={22} status={agentStatus(agent)} />}<span>{agent?.name || 'Removed'}<small>{owner?.id === state.me.id ? 'you' : owner?.name}</small></span></span></td>
                    <td><span className="cell-person"><Avatar person={by} size={20} />{by?.id === state.me.id ? 'You' : by?.name}</span></td>
                    <td><CheckBadge task={t} /></td>
                    <td className="num mono">{stats ? <><span className="add">+{stats.add}</span> <span className="del">−{stats.del}</span></> : <span className="faint">—</span>}</td>
                    <td className="num faint">{timeAgo(t.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="table-empty">No tasks match these filters.</p>}
        </div>
      )}
    </div>
  );
}
