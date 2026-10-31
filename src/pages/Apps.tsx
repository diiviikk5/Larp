import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, CalendarClock, CarFront, Check, ExternalLink, HeartPulse, Palette, Pill, ShieldPlus, Wallet, X } from 'lucide-react';
import type { Ctx } from '../route';
import type { ConnectedApp } from '../types';
import { Card, EmptyState, ErrorText, PageHeader, Stat, Tag, timeAgo, useAction } from '../ui';
import { toast } from '../feedback';

const ABOUT: Record<string, { script: string; line: string; icon: React.ReactElement; accent: string }> = {
  swasthya: { script: 'स्वास्थ्य', line: 'Doses, vitals, appointments and emergency cards for the family.', icon: <HeartPulse size={18} />, accent: '#f2a65a' },
  kosh: { script: 'कोष', line: 'Budgets, bills, goals and money requests for the family.', icon: <Wallet size={18} />, accent: '#7a3cff' },
};
const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

/** Talks to one connected app through the desktop's main process; refreshes every few seconds. */
function useAppData<T>(id: string, path: string, every = 8000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => window.larp!.appsCall!<T>({ id, path }).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [id, path]);
  useEffect(() => { load(); const t = setInterval(load, every); return () => clearInterval(t); }, [load, every]);
  return { data, error, reload: load };
}
const call = (id: string, method: string, path: string, body?: unknown) => window.larp!.appsCall!({ id, method, path, body });

// ---------- the list of apps ----------

/** Apps built into Larp as web pages (they keep their data in this desktop app's storage). */
export const WEB_APPS: { id: 'citylines' | 'eduspace' | 'studio'; name: string; kind: string; line: string; subtitle: string; icon: React.ReactElement; accent: string; src: string }[] = [
  { id: 'citylines', name: 'Citylines', kind: 'Family transport', line: 'Plan family trips, keep cab details handy and track vehicle care.', subtitle: 'Family journeys and vehicle care, together in one place.', icon: <CarFront size={18} />, accent: '#7886eb', src: './citylines/index.html' },
  { id: 'eduspace', name: 'EduSpace', kind: 'Learning workspace', line: 'Courses, assignments, study sessions and a notebook for your next idea.', subtitle: 'A little progress, every day. Your local learning workspace.', icon: <BookOpen size={18} />, accent: '#5fbf9a', src: './eduspace/index.html' },
  { id: 'studio', name: 'Studio', kind: 'Creative review room', line: 'Put concepts on the wall, compare directions and record feedback and decisions.', subtitle: 'Good work. Better together. A creative review workspace.', icon: <Palette size={18} />, accent: '#b8bfa4', src: './studio/index.html' },
];
export const APP_NAMES: Record<string, string> = { swasthya: 'Swasthya', kosh: 'Kosh', ...Object.fromEntries(WEB_APPS.map((a) => [a.id, a.name])) };

export function AppsPage({ ctx }: { ctx: Ctx }) {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const action = useAction();
  const refresh = useCallback(() => window.larp?.appsList?.().then(setApps), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 6000); return () => clearInterval(t); }, [refresh]);

  return (
    <div className="page">
      <PageHeader title="Apps" subtitle="Five apps built into Larp, each opening its full interface here. Their data stays on this computer; agents that may read Swasthya and Kosh say so when you approve them." />
      <div className="apps-grid">
        {(apps || []).map((a) => {
          const about = ABOUT[a.id];
          return (
            <section key={a.id} className={'app-tile' + (a.connected ? ' connected' : '')} style={{ ['--app' as string]: about.accent }}>
              <div className="app-tile-head">
                <span className="app-tile-icon">{about.icon}</span>
                <div className="grow"><h2>{a.name} <span className="app-script">{about.script}</span></h2><p>{a.kind}</p></div>
                <span className={'presence-text ' + (a.running ? 'good' : 'faint')}>{a.running ? '● running' : '○ starting'}</span>
              </div>
              <p className="app-tile-line">{about.line}</p>
              <div className="app-tile-foot">
                <button className="btn btn-primary" disabled={action.busy || (!a.connected && !a.running)} title={!a.connected && !a.running ? `${a.name} is starting` : undefined}
                  onClick={() => action.run(async () => {
                    if (!a.connected) { setApps(await window.larp!.appsConnect!({ id: a.id })); toast(`${a.name} connected`); }
                    ctx.go({ page: 'app', id: a.id });
                  })}>Open in Larp</button>
                <span className="faint small">
                  {a.connected ? <>Built in · agents can read it{a.url ? ` · ${a.url.replace('http://', '')}` : ''}</>
                    : a.running ? 'Running · connects when you open it'
                    : 'Starting inside Larp…'}
                </span>
              </div>
            </section>
          );
        })}
        {WEB_APPS.map((w) => (
          <section key={w.id} className="app-tile connected" style={{ ['--app' as string]: w.accent }}>
            <div className="app-tile-head"><span className="app-tile-icon">{w.icon}</span><div className="grow"><h2>{w.name}</h2><p>{w.kind}</p></div><span className="presence-text good">● ready</span></div>
            <p className="app-tile-line">{w.line}</p>
            <div className="app-tile-foot"><button className="btn btn-primary" onClick={() => ctx.go({ page: 'app', id: w.id })}>Open in Larp</button><span className="faint small">Built in · stored on this device</span></div>
          </section>
        ))}
      </div>
      {!window.larp?.appsList && <p className="faint small">Swasthya and Kosh run inside the Larp desktop app.</p>}
      <ErrorText error={action.error} />
    </div>
  );
}

// ---------- one app, inside Larp ----------

/** Every app opens its full interface. Swasthya and Kosh also have a quick panel wired to Larp (doses, bills, care checklists). */
export function AppView({ ctx, id, tab = 'full' }: { ctx: Ctx; id: 'swasthya' | 'kosh' | 'citylines' | 'eduspace' | 'studio'; tab?: 'overview' | 'full' }) {
  const [app, setApp] = useState<ConnectedApp | null>(null);
  useEffect(() => { window.larp?.appsList?.().then((l) => setApp(l.find((x) => x.id === id) || null)); }, [id]);
  const web = WEB_APPS.find((w) => w.id === id);
  const back = <button className="btn btn-ghost btn-sm back" onClick={() => ctx.go({ page: 'apps' })}><ArrowLeft size={14} /> Apps</button>;
  if (web) return <div className="page app-view" style={{ ['--app' as string]: web.accent }}>{back}<PageHeader title={web.name} subtitle={web.subtitle} /><iframe className="app-frame" src={web.src} title={web.name} /></div>;
  const about = ABOUT[id];
  if (!window.larp?.appsCall) return <AppsPage ctx={ctx} />;
  if (app && !app.connected) return <div className="page"><EmptyState title={`${app.name} is starting`} action={<button className="btn btn-primary" onClick={() => ctx.go({ page: 'apps' })}>Go to Apps</button>} /></div>;
  return (
    <div className="page app-view" style={{ ['--app' as string]: about.accent }}>
      {back}
      <PageHeader title={<>{app?.name || APP_NAMES[id]} <span className="app-script">{about.script}</span></>} subtitle={about.line}
        actions={app && <button className="btn btn-ghost btn-sm" onClick={() => window.larp!.openExternal({ url: app.url! })}><ExternalLink size={14} /> Browser</button>}>
        <div className="segmented">
          <button aria-pressed={tab === 'full'} onClick={() => ctx.go({ page: 'app', id, tab: 'full' })}>Full app</button>
          <button aria-pressed={tab === 'overview'} onClick={() => ctx.go({ page: 'app', id, tab: 'overview' })}>Quick panel</button>
        </div>
      </PageHeader>
      {tab === 'full' ? (app?.url ? <iframe className="app-frame" src={`${app.url}/app`} title={app.name} /> : null) : id === 'swasthya' ? <SwasthyaPanel ctx={ctx} /> : <KoshPanel />}
    </div>
  );
}

// ---------- Swasthya ----------

type Dose = { medicationId: string; memberId: string; name: string; dose: string | null; time: string; date: string; status: 'due' | 'taken' | 'skipped'; instructions?: string | null };
type HealthMember = { id: string; name: string; relation: string | null; color: string; adherence: number | null };
type Appt = { id: string; memberId: string; title: string; date: string; time: string; doctor?: string | null; place?: string | null };
type HealthSummary = { members: HealthMember[]; doses: { total: number; taken: number; due: number; items: Dose[] }; upcoming: Appt[]; flags: { text: string }[]; adherence: number | null };
type Emergency = { name: string; age: number | null; bloodGroup: string | null; allergies: string[]; conditions: string[]; medications: string[]; emergencyContact: string | null; doctor: string | null };

function SwasthyaPanel({ ctx }: { ctx: Ctx }) {
  const { data, error, reload } = useAppData<HealthSummary>('swasthya', 'summary');
  const [cardFor, setCardFor] = useState<string | null>(null);
  const action = useAction();
  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  const byId = Object.fromEntries(data.members.map((m) => [m.id, m]));
  const mark = (d: Dose, status: string) => action.run(async () => { await call('swasthya', 'POST', 'doses', { medicationId: d.medicationId, time: d.time, date: d.date, status }); await reload(); });
  const homes = ctx.state.spaces.filter((s) => s.kind === 'home');
  const share = (spaceId: string) => action.run(async () => {
    await ctx.larp.act('POST', 'checklists', { spaceId, title: `Doses · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`, items: data.doses.items.filter((d) => d.status === 'due').map((d) => `${d.time} · ${byId[d.memberId]?.name}: ${d.name}${d.dose ? ` ${d.dose}` : ''}`) });
    toast('Shared as a Care checklist');
    ctx.go({ page: 'care' });
  });
  return (
    <div className="app-panels">
      <div className="stat-row">
        <Stat label="Doses today" value={`${data.doses.taken}/${data.doses.total}`} hint={data.doses.due ? `${data.doses.due} still due` : 'all done'} tone={data.doses.due ? 'warn' : 'good'} />
        <Stat label="7-day adherence" value={data.adherence === null ? '—' : `${data.adherence}%`} />
        <Stat label="Next appointment" value={data.upcoming[0] ? new Date(`${data.upcoming[0].date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'} hint={data.upcoming[0] ? `${byId[data.upcoming[0].memberId]?.name}: ${data.upcoming[0].title}` : undefined} />
        <Stat label="Worth a look" value={data.flags.length} tone={data.flags.length ? 'warn' : undefined} />
      </div>
      <div className="app-cols">
        <Card title={<><Pill size={14} /> Today's doses</>} action={homes.length > 0 && data.doses.due > 0 ? <button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => share(homes.find((h) => h.id === ctx.space.id)?.id || homes[0].id)}>Share with circle as checklist</button> : undefined}>
          <ul className="dose-list">
            {data.doses.items.map((d) => {
              const m = byId[d.memberId];
              return (
                <li key={d.medicationId + d.time} className={'dose ' + d.status}>
                  <span className="mono dose-time">{d.time}</span>
                  <span className="dose-dot" style={{ background: m?.color }} />
                  <span className="grow"><strong>{d.name}</strong> <span className="faint">{d.dose}</span><small>{m?.name}{d.instructions ? ` · ${d.instructions}` : ''}</small></span>
                  {d.status === 'due' ? (
                    <><button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => mark(d, 'skipped')}>Skip</button><button className="btn btn-success btn-sm" disabled={action.busy} onClick={() => mark(d, 'taken')}><Check size={13} /> Taken</button></>
                  ) : <><Tag tone={d.status === 'taken' ? 'good' : 'neutral'}>{d.status}</Tag><button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => mark(d, 'due')}>Undo</button></>}
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="app-side">
          {data.flags.length > 0 && <Card title={<><AlertTriangle size={14} /> Worth a look</>}><ul className="flag-list">{data.flags.map((f, i) => <li key={i}>{f.text}</li>)}</ul></Card>}
          <Card title={<><CalendarClock size={14} /> Coming up</>}>
            {data.upcoming.length ? <ul className="flag-list">{data.upcoming.map((a) => <li key={a.id}><strong>{a.title}</strong><span className="faint"> · {byId[a.memberId]?.name} · {new Date(`${a.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {a.time}</span></li>)}</ul> : <p className="faint small">Nothing booked.</p>}
          </Card>
          <Card title={<><ShieldPlus size={14} /> Emergency cards</>}>
            <div className="chip-row">{data.members.map((m) => <button key={m.id} className={'chip' + (cardFor === m.id ? ' on' : '')} onClick={() => setCardFor(cardFor === m.id ? null : m.id)}><span className="dose-dot" style={{ background: m.color }} />{m.name}</button>)}</div>
            {cardFor && <EmergencyCard memberId={cardFor} onClose={() => setCardFor(null)} />}
          </Card>
        </div>
      </div>
      <ErrorText error={action.error} />
    </div>
  );
}

function EmergencyCard({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { data: e } = useAppData<Emergency>('swasthya', `members/${memberId}/emergency`, 60000);
  if (!e) return null;
  return (
    <div className="em-card">
      <button className="em-x" aria-label="Close card" onClick={onClose}><X size={14} /></button>
      <p className="em-kicker">Emergency card</p>
      <p className="em-name">{e.name}{e.age ? <span> · {e.age} years</span> : null}</p>
      <dl>
        <dt>Blood</dt><dd className="em-blood">{e.bloodGroup || '—'}</dd>
        <dt>Allergies</dt><dd>{e.allergies.length ? e.allergies.join(', ') : 'None recorded'}</dd>
        {e.conditions.length > 0 && <><dt>Conditions</dt><dd>{e.conditions.join(', ')}</dd></>}
        {e.medications.length > 0 && <><dt>Medicines</dt><dd>{e.medications.join(' · ')}</dd></>}
        {e.emergencyContact && <><dt>Call</dt><dd>{e.emergencyContact}</dd></>}
      </dl>
      <p className="em-112">In an emergency in India, call 112</p>
    </div>
  );
}

// ---------- Kosh ----------

type KMember = { id: string; name: string; role: string; color: string; canApprove: boolean };
type Bill = { id: string; name: string; amount: number; due: string; days: number; status: string; assigneeId: string | null; paid: unknown };
type Goal = { id: string; name: string; emoji: string; target: number; saved: number; pct: number };
type MoneyRequest = { id: string; fromId: string; amount: number; reason: string; at: string };
type KoshSummary = { month: string; netWorth: number; income: number; spent: number; saved: number; overBudget: string[]; bills: { due: number; overdue: number; next: Bill[] }; goals: Goal[]; requests: MoneyRequest[]; members: KMember[] };
type Activity = { id: string; at: string; actorId: string | null; text: string };

function KoshPanel() {
  const { data, error, reload } = useAppData<KoshSummary>('kosh', 'summary');
  const feed = useAppData<{ activity: Activity[] }>('kosh', 'activity?limit=12');
  const [asId, setAsId] = useState(() => localStorage.getItem('larp.kosh.as') || '');
  const action = useAction();
  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  const byId = Object.fromEntries(data.members.map((m) => [m.id, m]));
  const as = byId[asId] || data.members.find((m) => m.canApprove) || data.members[0];
  const after = async () => { await reload(); await feed.reload(); };
  return (
    <div className="app-panels">
      <div className="kosh-as">
        <span className="faint small">Acting in Kosh as</span>
        {data.members.filter((m) => m.role !== 'child').map((m) => <button key={m.id} className={'chip' + (as?.id === m.id ? ' on' : '')} onClick={() => { setAsId(m.id); localStorage.setItem('larp.kosh.as', m.id); }}><span className="dose-dot" style={{ background: m.color }} />{m.name}</button>)}
      </div>
      <div className="stat-row">
        <Stat label="Family net worth" value={inr(data.netWorth)} />
        <Stat label="Spent this month" value={inr(data.spent)} hint={`earned ${inr(data.income)}`} />
        <Stat label="Kept" value={inr(data.saved)} tone={data.saved < 0 ? 'bad' : 'good'} />
        <Stat label="Bills to pay" value={data.bills.due} hint={data.bills.overdue ? `${data.bills.overdue} overdue` : undefined} tone={data.bills.overdue ? 'bad' : undefined} />
      </div>
      <div className="app-cols">
        <div className="app-main">
          {data.requests.length > 0 && (
            <Card title="Asking the family">
              <ul className="req-list">
                {data.requests.map((r) => {
                  const from = byId[r.fromId];
                  return (
                    <li key={r.id}>
                      <span className="dose-dot big" style={{ background: from?.color }}>{from?.name[0]}</span>
                      <span className="grow"><strong>{from?.name}</strong> asks for <strong>{inr(r.amount)}</strong><small>“{r.reason}” · {timeAgo(r.at)}</small></span>
                      {as?.canApprove && as.id !== r.fromId ? (
                        <><button className="btn btn-ghost btn-sm" disabled={action.busy} onClick={() => action.run(async () => { await call('kosh', 'POST', `requests/${r.id}/decide`, { by: as.id, decision: 'decline' }); await after(); })}>Not now</button>
                          <button className="btn btn-success btn-sm" disabled={action.busy} onClick={() => action.run(async () => { await call('kosh', 'POST', `requests/${r.id}/decide`, { by: as.id, decision: 'approve' }); toast(`${inr(r.amount)} sent to ${from?.name}`); await after(); })}><Check size={13} /> Approve</button></>
                      ) : <span className="faint small">needs a parent</span>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title="Bills this month">
            {!data.bills.next.length ? <p className="faint small">Every bill is paid.</p> : (
              <ul className="req-list">
                {data.bills.next.map((b) => (
                  <li key={b.id}>
                    <span className="grow"><strong>{b.name}</strong><small>{b.assigneeId ? `${byId[b.assigneeId]?.name} pays` : 'unclaimed'} · {b.days < 0 ? `${-b.days} days late` : b.days === 0 ? 'due today' : `due in ${b.days} days`}</small></span>
                    <span className={'mono ' + (b.status === 'overdue' ? 'bad' : '')}>{inr(b.amount)}</span>
                    <button className="btn btn-primary btn-sm" disabled={action.busy || !as} onClick={() => action.run(async () => { await call('kosh', 'POST', `bills/${b.id}/pay`, { by: as.id }); toast(`${b.name} paid`); await after(); })}>Pay</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Saving together">
            <ul className="goal-list">
              {data.goals.map((g) => (
                <li key={g.id}>
                  <span className="goal-emoji">{g.emoji}</span>
                  <span className="grow"><strong>{g.name}</strong><span className="goal-bar"><i style={{ width: `${Math.min(100, g.pct)}%` }} /></span><small>{inr(g.saved)} of {inr(g.target)} · {g.pct}%</small></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title="Family feed" className="app-side">
          <ul className="feed-list">
            {(feed.data?.activity || []).map((a) => <li key={a.id}><span className="dose-dot" style={{ background: a.actorId ? byId[a.actorId]?.color : 'var(--bad)' }} /><span className="grow">{a.actorId && <strong>{byId[a.actorId]?.name} </strong>}{a.text}<small>{timeAgo(a.at)}</small></span></li>)}
          </ul>
        </Card>
      </div>
      <ErrorText error={action.error} />
    </div>
  );
}
