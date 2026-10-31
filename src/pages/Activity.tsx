import { useMemo, useState } from 'react';
import { Activity as ActivityIcon, Check, CircleDot, GitBranch, Lock, Search, Share2, ShieldCheck, UserPlus, Wallet, X } from 'lucide-react';
import type { Ctx } from '../route';
import type { LarpEvent } from '../types';
import { Avatar, EmptyState, PageHeader, clock, dayLabel } from '../ui';

const GROUPS: { id: string; label: string; match: (e: LarpEvent) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'tasks', label: 'Tasks', match: (e) => e.type.startsWith('task.') },
  { id: 'approvals', label: 'Approvals', match: (e) => e.type.startsWith('approval.') },
  { id: 'home', label: 'Home', match: (e) => /^(plan|expense|checklist)\./.test(e.type) },
  { id: 'people', label: 'People & agents', match: (e) => /^(member|agent|space)\./.test(e.type) },
];

function icon(type: string) {
  if (type === 'task.needs_review' || type === 'task.applied' || type === 'approval.approved') return <Check size={13} />;
  if (type === 'task.failed' || type === 'approval.denied' || type === 'task.apply_failed') return <X size={13} />;
  if (type === 'task.conflict') return <GitBranch size={13} />;
  if (type.startsWith('approval.')) return <ShieldCheck size={13} />;
  if (type === 'plan.denied') return <Lock size={13} />;
  if (type.startsWith('plan.')) return <Share2 size={13} />;
  if (type.startsWith('expense.')) return <Wallet size={13} />;
  if (type.startsWith('member.')) return <UserPlus size={13} />;
  return <CircleDot size={13} />;
}

function tone(type: string) {
  if (/needs_review|applied|approved|shared/.test(type)) return 'good';
  if (/failed|denied|conflict/.test(type)) return 'bad';
  if (/requested/.test(type)) return 'warn';
  if (/running|created/.test(type)) return 'accent';
  return 'neutral';
}

export function ActivityPage({ ctx }: { ctx: Ctx }) {
  const { state, space } = ctx;
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const events = useMemo(() => {
    const g = GROUPS.find((x) => x.id === group)!;
    const q = query.toLowerCase();
    return state.events.filter((e) => e.spaceId === space.id && g.match(e) && (!q || e.text.toLowerCase().includes(q))).slice().reverse();
  }, [state.events, space.id, group, query]);
  const days: { label: string; items: LarpEvent[] }[] = [];
  for (const e of events) {
    const label = dayLabel(e.at);
    if (days.at(-1)?.label !== label) days.push({ label, items: [] });
    days.at(-1)!.items.push(e);
  }

  return (
    <div className="page">
      <PageHeader title="Activity" subtitle="Everything that happened in this space: delegations, approvals, shares and denials. Nothing is hidden from members.">
        <div className="segmented">{GROUPS.map((g) => <button key={g.id} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}</div>
        <span className="grow" />
        <label className="search-field"><Search size={14} /><input aria-label="Search activity" placeholder="Search activity" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </PageHeader>
      {!events.length ? <EmptyState pose="sleeping" title="No activity">Nothing matches these filters yet.</EmptyState> : (
        <div className="timeline">
          {days.map((d) => (
            <section key={d.label}>
              <h3 className="timeline-day">{d.label}</h3>
              <ol>
                {d.items.map((e) => {
                  const actor = state.people.find((p) => p.id === e.actor);
                  const clickable = Boolean(e.taskId && state.tasks.some((t) => t.id === e.taskId));
                  return (
                    <li key={e.id} className={clickable ? 'clickable' : ''} onClick={() => clickable && ctx.go({ page: 'task', id: e.taskId! })}>
                      <span className={'timeline-icon tone-' + tone(e.type)}>{icon(e.type)}</span>
                      <Avatar person={actor} size={22} />
                      <p className="grow">{actor && !e.text.startsWith(actor.name) && <strong>{actor.id === state.me.id ? 'You' : actor.name} </strong>}{e.text}</p>
                      <time className="faint small mono">{clock(e.at)}</time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
