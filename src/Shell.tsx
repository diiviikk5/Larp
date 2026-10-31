import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity as ActivityIcon, Bell, Blocks, Brain, Bot, CalendarDays, Check, ChevronDown, HeartHandshake, LayoutGrid, ListChecks,
  Plus, Search, Settings as SettingsIcon, Users, Wallet,
} from 'lucide-react';
import type { Larp } from './api';
import type { DeviceConfig, Space, State } from './types';
import type { Ctx, Route } from './route';
import { Avatar, Kbd, LogoMark, STATUS_LABEL, timeAgo, useAction, useTick } from './ui';
import type { Task } from './types';
import { notify, toast } from './feedback';
import { Overview } from './pages/Overview';
import { Tasks } from './pages/Tasks';
import { TaskDetail } from './pages/TaskDetail';
import { NewTaskSheet } from './pages/NewTask';
import { Agents, AgentDetail, AgentNew } from './pages/Agents';
import { People } from './pages/People';
import { ActivityPage } from './pages/Activity';
import { MemoryPage } from './pages/Memory';
import { APP_NAMES, AppsPage, AppView } from './pages/Apps';
import { OceanBackdrop, OceanHome, OceanMenuButton } from './ocean/Ocean';
import { Settings } from './pages/Settings';
import { Plans } from './pages/Plans';
import { Money } from './pages/Money';
import { Care } from './pages/Care';
import { useAppearance } from './Appearance';
import { Companion } from './Companion';

const defaultRoute = (_space?: Space): Route => ({ page: 'overview' });

export function Shell({ larp, state, device, setDevice, reloadDevice, phone }: {
  larp: Larp; state: State; device: DeviceConfig | null; setDevice: (d: DeviceConfig) => void; reloadDevice: () => void; phone: boolean;
}) {
  useTick();
  const { look } = useAppearance();
  const [spaceId, setSpaceId] = useState(() => localStorage.getItem('larp.space') || '');
  const space = state.spaces.find((s) => s.id === spaceId) || state.spaces[0];
  const [route, setRoute] = useState<Route>(() => defaultRoute(space));
  const [history, setHistory] = useState<Route[]>([]);
  const [newTask, setNewTask] = useState<null | { agentId?: string }>(null);
  const [palette, setPalette] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const ocean = look.preset === 'Ocean' && !phone;
  useEffect(() => { if (space) localStorage.setItem('larp.space', space.id); }, [space?.id]);

  const go = (next: Route) => { setHistory((h) => [...h.slice(-20), route]); setRoute(next); setMoreOpen(false); setDrawer(false); };
  const switchSpace = (s: Space) => { setSpaceId(s.id); setRoute(defaultRoute(s)); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if (key === 'n') { e.preventDefault(); setNewTask({}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const api = useMemo<Larp>(() => ({
    ...larp,
    act: async (method: string, route: string, body?: any) => {
      try {
        const result = await larp.act(method, route, body);
        const message = actionMessage(method, route, body, result);
        if (message) toast(message);
        return result;
      } catch (error) {
        toast((error as Error).message, 'bad');
        throw error;
      }
    },
  }) as Larp, [larp]);

  useLiveEvents(state, (r) => go(r));
  useTitleBar({ look, home: route.page === 'overview' });

  if (!space) return <div className="loading">You're not in any space yet.</div>;

  const ctx: Ctx = { larp: api, state, space, device, phone, go, newTask: (o) => setNewTask(o || {}), reloadDevice, setDevice };
  const tasks = state.tasks.filter((t) => t.spaceId === space.id);
  const active = tasks.filter((t) => ['awaiting_approval', 'queued', 'running', 'revision_requested', 'applying'].includes(t.status));
  const home = space.kind === 'home';

  const nav: { route: Route; label: string; icon: React.ReactElement; badge?: number; tone?: string }[] = [
    { route: { page: 'overview' }, label: 'Overview', icon: <LayoutGrid size={16} />, badge: state.approvals.filter((a) => a.spaceId === space.id).length, tone: 'warn' },
    ...(home ? [
      { route: { page: 'plans' } as Route, label: 'Plans', icon: <CalendarDays size={16} /> },
      { route: { page: 'money' } as Route, label: 'Money', icon: <Wallet size={16} /> },
      { route: { page: 'care' } as Route, label: 'Care', icon: <HeartHandshake size={16} /> },
    ] : []),
    { route: { page: 'tasks' }, label: 'Tasks', icon: <ListChecks size={16} />, badge: active.length },
    { route: { page: 'agents' }, label: 'Agents', icon: <Bot size={16} /> },
    { route: { page: 'people' }, label: 'People', icon: <Users size={16} /> },
    { route: { page: 'apps' }, label: 'Apps', icon: <Blocks size={16} /> },
    { route: { page: 'memory' }, label: 'Memory', icon: <Brain size={16} /> },
    { route: { page: 'activity' }, label: 'Activity', icon: <ActivityIcon size={16} /> },
  ];
  const isOn = (r: Route) => r.page === route.page
    || (r.page === 'tasks' && route.page === 'task')
    || (r.page === 'apps' && route.page === 'app')
    || (r.page === 'agents' && (route.page === 'agent' || route.page === 'agent-new'));

  const page = (() => {
    switch (route.page) {
      case 'overview': return ocean ? <OceanHome ctx={ctx} /> : <Overview ctx={ctx} />;
      case 'tasks': return <Tasks ctx={ctx} initial={route.filter} />;
      case 'task': return <TaskDetail ctx={ctx} id={route.id} tab={route.tab} onBack={() => go(history.at(-1)?.page === 'task' ? { page: 'tasks' } : history.at(-1) || { page: 'tasks' })} />;
      case 'agents': return <Agents ctx={ctx} />;
      case 'agent': return <AgentDetail ctx={ctx} id={route.id} />;
      case 'agent-new': return <AgentNew ctx={ctx} />;
      case 'people': return <People ctx={ctx} />;
      case 'activity': return <ActivityPage ctx={ctx} />;
      case 'memory': return <MemoryPage ctx={ctx} />;
      case 'apps': return <AppsPage ctx={ctx} />;
      case 'app': return <AppView ctx={ctx} id={route.id} tab={route.tab} />;
      case 'settings': return <Settings ctx={ctx} tab={route.tab} />;
      case 'plans': return <Plans ctx={ctx} id={route.id} />;
      case 'money': return <Money ctx={ctx} />;
      case 'care': return <Care ctx={ctx} id={route.id} />;
    }
  })();

  const crumbs = crumbsFor(route, state, space);

  return (
    <div className={'app' + (phone ? ' is-phone' : '') + (window.larp ? ' has-titlebar' : '') + (ocean ? ' ocean' : '') + (ocean && drawer ? ' drawer-open' : '') + (ocean && route.page === 'overview' ? ' ocean-on-home' : '')}>
      {ocean && <OceanBackdrop active={route.page === 'overview'} />}
      {ocean && route.page === 'overview' && <OceanMenuButton onClick={() => setDrawer((d) => !d)} />}
      {ocean && drawer && <div className="ocean-scrim" onClick={() => setDrawer(false)} />}
      {!phone && (
        <aside className="sidebar">
          <div className="drag-strip" />
          <SpaceSwitcher larp={api} state={state} space={space} onSwitch={switchSpace} onSettings={() => go({ page: 'settings' })} />
          <button className="btn btn-primary new-task-btn" onClick={() => setNewTask({})}><Plus size={15} /> New task <span className="grow" /><Kbd>Ctrl N</Kbd></button>
          <nav className="nav">
            {nav.map((item) => (
              <button key={item.label} className={'nav-item' + (isOn(item.route) ? ' active' : '')} onClick={() => go(item.route)}>
                {item.icon}<span>{item.label}</span>
                {!!item.badge && <span className={'nav-badge' + (item.tone ? ` tone-${item.tone}` : '')}>{item.badge}</span>}
              </button>
            ))}
          </nav>
          <Threads state={state} tasks={tasks} current={route.page === 'task' ? route.id : undefined} onOpen={(id) => go({ page: 'task', id })} onAll={() => go({ page: 'tasks' })} />
          <div className="sidebar-foot">
            <button className={'nav-item' + (route.page === 'settings' ? ' active' : '')} onClick={() => go({ page: 'settings' })}><SettingsIcon size={16} /><span>Settings</span></button>
            <button className="me-row" onClick={() => go({ page: 'settings', tab: 'device' })}>
              <Avatar person={state.me} size={26} />
              <span className="me-text"><strong>{state.me.name}</strong><small>{device?.mode === 'host' ? 'Hosting this space' : device ? 'Member' : 'Phone'}</small></span>
              <span className={'conn-dot ' + (larp.online ? 'on' : 'off')} title={larp.online ? 'Connected' : 'Reconnecting'} />
            </button>
          </div>
        </aside>
      )}

      <div className="workspace">
        <header className="topbar drag">
          {phone && <SpaceSwitcher larp={api} state={state} space={space} onSwitch={switchSpace} compact onSettings={() => go({ page: 'settings' })} />}
          {!phone && (
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={i} className="crumb">
                  {i > 0 && <span className="crumb-sep">/</span>}
                  {c.route && i < crumbs.length - 1 ? <button className="crumb-link" onClick={() => go(c.route!)}>{c.label}</button> : <span className={i === crumbs.length - 1 ? 'crumb-current' : ''}>{c.label}</span>}
                </span>
              ))}
            </nav>
          )}
          <span className="grow" />
          {!phone && <button className="search-btn" onClick={() => setPalette(true)}><Search size={14} /><span>Search</span><Kbd>Ctrl K</Kbd></button>}
          <InboxButton larp={api} state={state} onOpenTask={(id) => go({ page: 'task', id })} />
          {!phone && <div className="avatar-stack">{state.people.filter((p) => space.memberIds.includes(p.id)).slice(0, 5).map((p) => <Avatar key={p.id} person={p} size={24} />)}</div>}
        </header>
        <main className="content" key={route.page + ('id' in route ? route.id : '')}>{page}</main>
        {phone && (
          <nav className="tabbar">
            <TabButton active={route.page === 'overview'} onClick={() => go({ page: 'overview' })} icon={<LayoutGrid size={19} />} label="Overview" />
            {home && <TabButton active={route.page === 'plans'} onClick={() => go({ page: 'plans' })} icon={<CalendarDays size={19} />} label="Plans" />}
            {home && <TabButton active={route.page === 'money'} onClick={() => go({ page: 'money' })} icon={<Wallet size={19} />} label="Money" />}
            <TabButton active={route.page === 'tasks' || route.page === 'task'} onClick={() => go({ page: 'tasks' })} icon={<ListChecks size={19} />} label="Tasks" />
            <TabButton active={moreOpen} onClick={() => setMoreOpen((m) => !m)} icon={<Users size={19} />} label="More" />
          </nav>
        )}
        {phone && moreOpen && (
          <div className="more-menu">
            {nav.filter((n) => !['Overview', 'Plans', 'Money', 'Tasks'].includes(n.label)).map((n) => <button key={n.label} onClick={() => go(n.route)}>{n.icon}{n.label}</button>)}
            <button onClick={() => go({ page: 'settings' })}><SettingsIcon size={16} />Settings</button>
          </div>
        )}
      </div>

      {newTask && <NewTaskSheet ctx={ctx} agentId={newTask.agentId} onClose={() => setNewTask(null)} onCreated={(id) => { setNewTask(null); go({ page: 'task', id }); }} />}
      {palette && <Palette state={state} space={space} onClose={() => setPalette(false)} go={(r) => { setPalette(false); go(r); }} newTask={() => { setPalette(false); setNewTask({}); }} switchSpace={(s) => { setPalette(false); switchSpace(s); }} />}
      {!phone && <Companion pal={look.pal} hue={look.hue} scale={look.scale} />}
    </div>
  );
}

function crumbsFor(route: Route, state: State, space: Space): { label: string; route?: Route }[] {
  const base = { label: space.name, route: { page: 'overview' } as Route };
  switch (route.page) {
    case 'overview': return [base, { label: 'Overview' }];
    case 'task': return [base, { label: 'Tasks', route: { page: 'tasks' } }, { label: state.tasks.find((t) => t.id === route.id)?.title || 'Task' }];
    case 'agent': return [base, { label: 'Agents', route: { page: 'agents' } }, { label: state.agents.find((a) => a.id === route.id)?.name || 'Agent' }];
    case 'agent-new': return [base, { label: 'Agents', route: { page: 'agents' } }, { label: 'Add agent' }];
    case 'plans': return [base, { label: 'Plans', route: { page: 'plans' } }, ...(route.id ? [{ label: state.plans.find((p) => p.id === route.id)?.title || 'Plan' }] : [])];
    case 'app': return [base, { label: 'Apps', route: { page: 'apps' } }, { label: APP_NAMES[route.id] || 'App' }];
    case 'care': return [base, { label: 'Care', route: { page: 'care' } }, ...(route.id ? [{ label: state.checklists.find((c) => c.id === route.id)?.title || 'Checklist' }] : [])];
    default: return [base, { label: route.page[0].toUpperCase() + route.page.slice(1) }];
  }
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactElement; label: string }) {
  return <button className={'tab' + (active ? ' active' : '')} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SpaceSwitcher({ larp, state, space, onSwitch, compact, onSettings }: { larp: Larp; state: State; space: Space; onSwitch: (s: Space) => void; compact?: boolean; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className={'space-switcher' + (compact ? ' compact' : '')} ref={ref}>
      <button className="space-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="space-logo"><LogoMark size={18} /></span>
        <span className="space-text"><strong>{space.name}</strong>{!compact && <small>{space.kind === 'build' ? 'Build space' : 'Home space'} · {space.memberIds.length} {space.memberIds.length === 1 ? 'member' : 'members'}</small>}</span>
        <ChevronDown size={14} className="faint" />
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown-label">Spaces</div>
          {state.spaces.map((s) => (
            <button key={s.id} role="menuitem" className="dropdown-item" onClick={() => { onSwitch(s); setOpen(false); }}>
              <span className={'space-kind ' + s.kind}>{s.kind === 'build' ? 'B' : 'H'}</span>
              <span className="grow">{s.name}</span>
              {state.approvals.some((a) => a.spaceId === s.id) && <span className="nav-badge tone-warn">{state.approvals.filter((a) => a.spaceId === s.id).length}</span>}
              {s.id === space.id && <Check size={14} />}
            </button>
          ))}
          <div className="dropdown-sep" />
          <NewSpaceItem larp={larp} onCreated={(s) => { onSwitch(s); setOpen(false); }} />
          <button role="menuitem" className="dropdown-item" onClick={() => { setOpen(false); onSettings(); }}><SettingsIcon size={14} /> Settings</button>
        </div>
      )}
    </div>
  );
}

function NewSpaceItem({ larp, onCreated }: { larp: Larp; onCreated: (s: Space) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'build' | 'home'>('home');
  const action = useAction();
  if (!editing) return <button role="menuitem" className="dropdown-item" onClick={() => setEditing(true)}><Plus size={14} /> New space</button>;
  return (
    <div className="dropdown-form">
      <input autoFocus placeholder="Space name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="segmented">
        <button aria-pressed={kind === 'build'} onClick={() => setKind('build')}>Build</button>
        <button aria-pressed={kind === 'home'} onClick={() => setKind('home')}>Home</button>
      </div>
      <button className="btn btn-primary btn-sm" disabled={!name.trim() || action.busy} onClick={() => action.run(async () => onCreated(await larp.act('POST', 'spaces', { name, kind })))}>Create space</button>
      {action.error && <p className="error-text">{action.error}</p>}
    </div>
  );
}

function InboxButton({ larp, state, onOpenTask }: { larp: Larp; state: State; onOpenTask: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const action = useAction();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const count = state.approvals.length;
  return (
    <div className="inbox" ref={ref}>
      <button className={'btn-icon inbox-btn' + (count ? ' has' : '')} aria-label={count ? `${count} approvals waiting` : 'Inbox'} onClick={() => setOpen((o) => !o)}>
        <Bell size={16} />{count > 0 && <span className="inbox-count">{count}</span>}
      </button>
      {open && (
        <div className="dropdown inbox-panel" role="dialog" aria-label="Approvals">
          <div className="inbox-head"><strong>Waiting for you</strong><span className="faint">{count}</span></div>
          {!count && <p className="inbox-empty">You're all caught up.</p>}
          {state.approvals.map((a) => {
            const space = state.spaces.find((s) => s.id === a.spaceId);
            return (
              <div key={a.id} className="inbox-item">
                <div className="inbox-meta">{a.kind === 'run_task' ? 'Run a task' : a.kind === 'share' ? 'Share private data' : 'Tool permission'} · {space?.name}</div>
                <strong>{a.title}</strong>
                <p>{a.detail}</p>
                <div className="inbox-actions">
                  <button className="btn btn-primary btn-sm" disabled={action.busy} onClick={() => action.run(() => larp.act('POST', `approvals/${a.id}`, { decision: 'approve' }))}>Approve</button>
                  <button className="btn btn-sm" disabled={action.busy} onClick={() => action.run(() => larp.act('POST', `approvals/${a.id}`, { decision: 'deny' }))}>Decline</button>
                  {a.taskId && <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); onOpenTask(a.taskId!); }}>Open task</button>}
                </div>
              </div>
            );
          })}
          {action.error && <p className="error-text">{action.error}</p>}
        </div>
      )}
    </div>
  );
}

function Palette({ state, space, onClose, go, newTask, switchSpace }: {
  state: State; space: Space; onClose: () => void; go: (r: Route) => void; newTask: () => void; switchSpace: (s: Space) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const items = useMemo(() => {
    const all: { label: string; group: string; hint?: string; run: () => void }[] = [
      { label: 'New task', group: 'Actions', hint: 'Ctrl N', run: newTask },
      { label: 'Add an agent', group: 'Actions', run: () => go({ page: 'agent-new' }) },
      { label: 'Invite someone', group: 'Actions', run: () => go({ page: 'people' }) },
      { label: 'Pair a phone', group: 'Actions', run: () => go({ page: 'settings', tab: 'phones' }) },
      { label: 'Appearance', group: 'Actions', run: () => go({ page: 'settings', tab: 'appearance' }) },
      ...state.tasks.filter((t) => t.spaceId === space.id).map((t) => ({ label: t.title, group: 'Tasks', hint: STATUS_LABEL[t.status], run: () => go({ page: 'task', id: t.id }) })),
      ...state.agents.filter((a) => a.spaceIds.includes(space.id)).map((a) => ({ label: a.name, group: 'Agents', hint: state.people.find((p) => p.id === a.ownerId)?.name, run: () => go({ page: 'agent', id: a.id }) })),
      ...state.spaces.filter((s) => s.id !== space.id).map((s) => ({ label: `Switch to ${s.name}`, group: 'Spaces', run: () => switchSpace(s) })),
    ];
    const q = query.toLowerCase().trim();
    return (q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all).slice(0, 14);
  }, [query, state, space.id]);
  return (
    <div className="overlay cmdk-overlay" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input"><Search size={16} className="faint" />
          <input autoFocus aria-label="Search" placeholder="Search tasks, agents, actions…" value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter') items[index]?.run();
            }} />
        </div>
        <div className="cmdk-list" role="listbox">
          {items.map((item, i) => (
            <div key={i}>
              {(i === 0 || items[i - 1].group !== item.group) && <div className="cmdk-group">{item.group}</div>}
              <button role="option" aria-selected={i === index} className="cmdk-item" onMouseEnter={() => setIndex(i)} onClick={item.run}>
                <span className="grow">{item.label}</span>{item.hint && <span className="faint small">{item.hint}</span>}
              </button>
            </div>
          ))}
          {!items.length && <p className="cmdk-empty">No results for "{query}"</p>}
        </div>
      </div>
    </div>
  );
}

function actionMessage(method: string, route: string, body: any, result: any): string | null {
  const [a, , c] = route.split('/');
  if (method === 'POST' && route === 'tasks') return result?.status === 'awaiting_approval' ? 'Task sent. Waiting for the owner’s approval.' : 'Task started';
  if (a === 'approvals') return body?.decision === 'approve' ? 'Approved' : 'Declined';
  if (a === 'tasks' && c === 'revise') return 'Revision requested';
  if (a === 'tasks' && c === 'accept') return result?.applyHostId ? 'Accepted. Applying the change on your machine…' : 'Accepted';
  if (a === 'tasks' && c === 'cancel') return 'Task stopped';
  if (method === 'POST' && a === 'expenses') return 'Expense added';
  if (method === 'DELETE' && a === 'expenses') return 'Expense removed';
  if (method === 'POST' && route === 'checklists') return 'Checklist created';
  if (a === 'checklists' && body?.take) return 'It’s yours';
  if (method === 'POST' && route === 'plans') return 'Asked everyone’s agents';
  if (method === 'POST' && route === 'spaces') return 'Space created';
  if (route === 'devices/revoke') return 'Phones disconnected';
  return null;
}

/** Toasts and OS notifications for things that happen without you: approvals, finished work. */
function useLiveEvents(state: State, open: (r: Route) => void) {
  const seen = useRef<{ approvals: Set<string>; status: Map<string, string> } | null>(null);
  useEffect(() => {
    const status = new Map(state.tasks.map((t) => [t.id, t.status]));
    if (!seen.current) { seen.current = { approvals: new Set(state.approvals.map((a) => a.id)), status }; return; }
    for (const a of state.approvals) {
      if (seen.current.approvals.has(a.id)) continue;
      const go = () => (a.taskId ? open({ page: 'task', id: a.taskId }) : open({ page: 'overview' }));
      toast(a.title, 'info', { label: 'Review', run: go });
      notify('Larp needs your approval', a.title, go);
    }
    for (const task of state.tasks) {
      const before = seen.current.status.get(task.id);
      if (!before || before === task.status || task.createdBy !== state.me.id) continue;
      const go = () => open({ page: 'task', id: task.id });
      if (task.status === 'needs_review') {
        const check = task.result?.check;
        const text = check ? `${task.title}: ${check.passed ? 'check passed' : 'check failed'}` : `${task.title} is ready for review`;
        toast(text, check && !check.passed ? 'bad' : 'good', { label: 'Open', run: go });
        notify('Task finished', text, go);
      } else if (task.status === 'failed') {
        toast(`${task.title}: the agent stopped`, 'bad', { label: 'Open', run: go });
      } else if (task.status === 'applied') {
        toast(`Applied as ${task.applied?.branch}`, 'good', { label: 'Open', run: go });
      } else if (task.status === 'denied') {
        toast(`${task.title} was declined`, 'bad', { label: 'Open', run: go });
      }
    }
    seen.current = { approvals: new Set(state.approvals.map((a) => a.id)), status };
  }, [state.version]);
}

/** Keep the native window buttons in the title bar the same colors as the current theme. */
function useTitleBar(look: unknown) {
  useEffect(() => {
    if (!window.larp?.setTitleBar) return;
    const timer = setTimeout(() => {
      // A theme can give the window buttons their own colour (--titlebar); otherwise they sit on --bg.
      const css = getComputedStyle(document.querySelector('.app') || document.documentElement);
      const color = css.getPropertyValue('--titlebar').trim() || css.getPropertyValue('--bg').trim();
      const symbol = css.getPropertyValue('--titlebar-symbol').trim() || css.getPropertyValue('--text-2').trim();
      window.larp!.setTitleBar!({ color: /^#/.test(color) ? color : '#0f0f0f', symbol: /^#/.test(symbol) ? symbol : '#a3a3a3' });
    }, 30);
    return () => clearTimeout(timer);
  }, [JSON.stringify(look)]);
}

const TONE: Record<string, string> = {
  awaiting_approval: 'warn', running: 'run', applying: 'run', waiting: 'run', queued: 'idle', revision_requested: 'idle',
  needs_review: 'review', failed: 'bad', interrupted: 'bad', apply_failed: 'bad', applied: 'done', accepted: 'done', denied: 'idle', cancelled: 'idle',
};

function Threads({ state, tasks, current, onOpen, onAll }: { state: State; tasks: Task[]; current?: string; onOpen: (id: string) => void; onAll: () => void }) {
  const needsMe = (t: Task) => state.approvals.some((a) => a.taskId === t.id) || (t.createdBy === state.me.id && t.status === 'needs_review');
  const rank = (t: Task) => (needsMe(t) ? 0 : ['running', 'applying', 'queued', 'awaiting_approval', 'revision_requested'].includes(t.status) ? 1 : 2);
  const list = [...tasks].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 14);
  return (
    <div className="threads">
      <div className="nav-label threads-label">Tasks<button className="threads-all" onClick={onAll}>View all</button></div>
      {!list.length && <p className="threads-empty">Tasks you start or receive show up here.</p>}
      <div className="threads-list">
        {list.map((t) => {
          const agent = state.agents.find((a) => a.id === t.agentId);
          const check = t.result?.check;
          const tone = t.status === 'needs_review' && check ? (check.passed ? 'done' : 'bad') : TONE[t.status];
          return (
            <button key={t.id} className={'thread' + (t.id === current ? ' active' : '') + (needsMe(t) ? ' attention' : '')} onClick={() => onOpen(t.id)} title={`${t.title} · ${STATUS_LABEL[t.status]}`}>
              <i className={'thread-dot ' + tone} />
              <span className="thread-text">
                <span className="thread-title">{t.title}</span>
                <span className="thread-meta">{needsMe(t) ? (state.approvals.some((a) => a.taskId === t.id) ? 'Needs your approval' : 'Ready for your review') : `${agent?.name || 'Agent'} · ${STATUS_LABEL[t.status].toLowerCase()}`}</span>
              </span>
              <span className="thread-time">{timeAgo(t.updatedAt).replace(' ago', '')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
