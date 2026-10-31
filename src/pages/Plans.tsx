import { useState } from 'react';
import { CalendarDays, Lock, Plus } from 'lucide-react';
import type { Ctx } from '../route';
import type { Plan } from '../types';
import { AgentAvatar, Avatar, DAYS, EmptyState, ErrorText, Field, PageHeader, timeAgo, useAction } from '../ui';

const FIELDS: { id: string; label: string; detail: string }[] = [
  { id: 'availability', label: 'Free time', detail: 'Open windows on that day. Event names are never shared.' },
  { id: 'budget', label: 'Budget', detail: 'Each person’s per-person limit. Only the lowest is shown to the group.' },
  { id: 'calendar', label: 'Full calendar', detail: 'Event names and times. Most people never share this.' },
];

export function Plans({ ctx, id }: { ctx: Ctx; id?: string }) {
  const { state, space, go } = ctx;
  const plans = state.plans.filter((p) => p.spaceId === space.id);
  const [creating, setCreating] = useState(!id && !plans.length);
  const selected = plans.find((p) => p.id === id) || (!creating ? plans[0] : undefined);

  return (
    <div className="page wide">
      <PageHeader
        title="Plans"
        subtitle="Ask everyone's agents a question. Each answers from its owner's private data, on their own device, only as far as they allow."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New plan</button>}
      />
      <div className="split">
        <aside className="split-list">
          {!plans.length && <p className="card-empty">No plans yet.</p>}
          {plans.map((p) => (
            <button key={p.id} className={'list-item' + (selected?.id === p.id && !creating ? ' active' : '')} onClick={() => { setCreating(false); go({ page: 'plans', id: p.id }); }}>
              <span className="list-item-icon"><CalendarDays size={15} /></span>
              <span className="grow"><strong>{p.title}</strong><small>{p.day} · {p.result.complete ? 'complete' : `${p.result.pending} waiting`}</small></span>
              <span className={'dot ' + (p.result.complete ? 'good' : 'warn')} />
            </button>
          ))}
        </aside>
        <section className="split-main">
          {creating ? <NewPlan ctx={ctx} onCreated={(pid) => { setCreating(false); go({ page: 'plans', id: pid }); }} onCancel={plans.length ? () => setCreating(false) : undefined} />
            : selected ? <PlanView ctx={ctx} plan={selected} /> : <EmptyState icon={<CalendarDays size={22} />} title="Pick a plan" />}
        </section>
      </div>
    </div>
  );
}

function NewPlan({ ctx, onCreated, onCancel }: { ctx: Ctx; onCreated: (id: string) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('Sat');
  const [fields, setFields] = useState(['availability', 'budget']);
  const action = useAction();
  const members = ctx.state.people.filter((p) => ctx.space.memberIds.includes(p.id));
  const withAgents = members.filter((m) => ctx.state.agents.some((a) => a.ownerId === m.id && a.spaceIds.includes(ctx.space.id)));
  return (
    <div className="panel">
      <h2>Ask the circle</h2>
      <div className="form">
        <Field label="What are you planning?" htmlFor="plan-title"><input id="plan-title" autoFocus placeholder="Saturday lunch" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Day"><div className="segmented">{DAYS.map((d) => <button key={d} aria-pressed={day === d} onClick={() => setDay(d)}>{d}</button>)}</div></Field>
        <Field label="Ask each agent for">
          <div className="check-list">
            {FIELDS.map((f) => (
              <label key={f.id} className="check-row">
                <input type="checkbox" checked={fields.includes(f.id)} onChange={() => setFields((x) => (x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id]))} />
                <span className="grow"><strong>{f.label}</strong><small>{f.detail}</small></span>
              </label>
            ))}
          </div>
        </Field>
        <p className="notice">{withAgents.length} of {members.length} members have an agent here. Their agents check their own sharing rules; anyone set to "ask" gets a request on their phone.</p>
        <ErrorText error={action.error} />
        <div className="form-actions">
          {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
          <button className="btn btn-primary" disabled={!title.trim() || !fields.length || action.busy} onClick={() => action.run(async () => onCreated((await ctx.larp.act('POST', 'plans', { spaceId: ctx.space.id, title, day, fields })).id))}>Ask everyone</button>
        </div>
      </div>
    </div>
  );
}

const START = 8 * 60;
const END = 23 * 60;
const pct = (t: string) => { const [h, m] = t.split(':').map(Number); return ((Math.min(END, Math.max(START, h * 60 + m)) - START) / (END - START)) * 100; };

function PlanView({ ctx, plan }: { ctx: Ctx; plan: Plan }) {
  const { state } = ctx;
  const by = state.people.find((p) => p.id === plan.createdBy);
  const r = plan.result;
  const showTime = plan.fields.includes('availability');
  return (
    <div className="panel">
      <div className="panel-head">
        <div><h2>{plan.title}</h2><p className="faint">{plan.day} · asked by {by?.id === state.me.id ? 'you' : by?.name} · {timeAgo(plan.createdAt)}</p></div>
        <span className={'badge ' + (r.complete ? 'tone-good' : 'tone-warn')}><i />{r.complete ? 'Everyone answered' : `Waiting on ${r.pending}`}</span>
      </div>

      {r.complete && (
        <div className="result-tiles">
          {showTime && <div className="result-tile"><span>Everyone is free</span><strong>{r.windows.length ? r.windows.map((w) => `${w.from}–${w.to}`).join(', ') : 'No common time'}</strong></div>}
          {plan.fields.includes('budget') && <div className="result-tile"><span>Budget per person</span><strong>{r.budgetPerPerson !== null ? `Up to ₹${r.budgetPerPerson.toLocaleString('en-IN')}` : 'Unknown'}</strong></div>}
          {r.missing.length > 0 && <div className="result-tile muted"><span>Not included</span><strong className="small-value">{r.missing.length} answer{r.missing.length === 1 ? '' : 's'} withheld</strong></div>}
        </div>
      )}

      {showTime && (
        <div className="day-chart">
          <div className="day-axis">{[8, 10, 12, 14, 16, 18, 20, 22].map((h) => <span key={h} style={{ left: `${((h * 60 - START) / (END - START)) * 100}%` }}>{String(h).padStart(2, '0')}:00</span>)}</div>
          {plan.queries.map((q) => {
            const person = state.people.find((p) => p.id === q.personId);
            const value = q.answer?.availability as any;
            const denied = value && !Array.isArray(value);
            return (
              <div key={q.id} className="day-row">
                <span className="day-who"><Avatar person={person} size={20} />{person?.name}</span>
                <div className="day-track">
                  {q.status === 'pending' && <span className="day-note">checking…</span>}
                  {q.status === 'no_agent' && <span className="day-note">no agent</span>}
                  {denied && <span className="day-note"><Lock size={11} /> {value.reason}</span>}
                  {Array.isArray(value) && value.map((w: any, i: number) => <i key={i} className="day-free" style={{ left: `${pct(w.from)}%`, width: `${pct(w.to) - pct(w.from)}%` }} title={`${w.from}–${w.to}`} />)}
                </div>
              </div>
            );
          })}
          {r.complete && (
            <div className="day-row overlap">
              <span className="day-who"><strong>Everyone</strong></span>
              <div className="day-track">
                {r.windows.map((w, i) => <i key={i} className="day-free" style={{ left: `${pct(w.from)}%`, width: `${pct(w.to) - pct(w.from)}%` }} title={`${w.from}–${w.to}`}>{pct(w.to) - pct(w.from) > 14 && <span>{w.from}–{w.to}</span>}</i>)}
                {!r.windows.length && <span className="day-note">no overlap</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <table className="table compact">
        <thead><tr><th>Person</th>{plan.fields.map((f) => <th key={f}>{FIELDS.find((x) => x.id === f)?.label}</th>)}</tr></thead>
        <tbody>
          {plan.queries.map((q) => {
            const person = state.people.find((p) => p.id === q.personId);
            const agent = state.agents.find((a) => a.id === q.agentId);
            return (
              <tr key={q.id}>
                <td><span className="cell-person">{agent ? <AgentAvatar agent={agent} owner={person} size={22} /> : <Avatar person={person} size={22} />}<span>{person?.name}<small>{agent ? `via ${agent.name}` : 'no agent'}</small></span></span></td>
                {plan.fields.map((f) => {
                  const v = q.answer?.[f] as any;
                  if (q.status === 'pending') return <td key={f} className="faint">Checking…</td>;
                  if (q.status === 'no_agent') return <td key={f} className="faint">—</td>;
                  if (v && !Array.isArray(v) && typeof v === 'object') return <td key={f} className="faint"><Lock size={12} /> {v.reason}</td>;
                  return <td key={f} className="mono">{f === 'availability' ? v.map((w: any) => `${w.from}–${w.to}`).join(', ') || 'busy' : f === 'budget' ? `≤ ₹${v}` : `${v.length} events`}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
