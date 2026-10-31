import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowUp, Brain, Check, ChevronRight, FileCode2, GitBranch, Square, Terminal, X } from 'lucide-react';
import type { Ctx } from '../route';
import { confirmDialog } from '../feedback';
import type { Task } from '../types';
import {
  AgentAvatar, Avatar, CheckBadge, DiffView, Markdown, EmptyState, ErrorText, Kbd, StatusBadge, agentStatus, clock, diffFiles, diffStats,
  duration, timeAgo, useAction, useTick,
} from '../ui';

type Tab = 'conversation' | 'changes' | 'check';

export function TaskDetail({ ctx, id, tab: initialTab, onBack }: { ctx: Ctx; id: string; tab?: Tab; onBack: () => void }) {
  useTick(1000);
  const { state } = ctx;
  const task = state.tasks.find((t) => t.id === id);
  const [tab, setTab] = useState<Tab>(initialTab || 'conversation');
  const action = useAction();
  const reply = useRef<HTMLTextAreaElement>(null);
  if (!task) return <div className="page"><EmptyState title="Task not found">It may belong to a space you're no longer in.</EmptyState></div>;

  const agent = state.agents.find((a) => a.id === task.agentId);
  const owner = state.people.find((p) => p.id === task.ownerId);
  const host = state.hosts.find((h) => h.id === agent?.hostId);
  const result = task.result;
  const check = result?.check;
  const stats = result?.diff ? diffStats(result.diff) : null;
  const myApproval = state.approvals.find((a) => a.taskId === task.id);
  const canReview = task.createdBy === state.me.id || task.ownerId === state.me.id;
  const reviewable = canReview && ['needs_review', 'failed', 'interrupted'].includes(task.status);
  const active = ['awaiting_approval', 'queued', 'running', 'revision_requested'].includes(task.status);
  const canAccept = task.status === 'needs_review' && task.createdBy === state.me.id;
  const myHosts = state.hosts.filter((h) => h.ownerId === state.me.id);
  const applyHost = myHosts.find((h) => h.id === ctx.device?.host?.hostId) || myHosts[0];
  const apply = result?.diff && applyHost;
  const memoryOn = state.memory?.on;
  const [lesson, setLesson] = useState('');
  useEffect(() => { if (canAccept && !lesson && task.feedback.length) setLesson(task.feedback.at(-1)!.text); }, [canAccept, task.feedback.length]);

  const accept = async () => {
    if (check && !check.passed && !(await confirmDialog({ title: 'Accept a result that failed its check?', body: `${task.check} exited with code ${check.exitCode} on the agent owner's machine.`, confirmLabel: 'Accept anyway', danger: true }))) return;
    action.run(() => ctx.larp.act('POST', `tasks/${task.id}/accept`, { applyHostId: apply ? applyHost.id : undefined, lesson: memoryOn && lesson.trim() ? lesson.trim() : undefined }));
  };

  return (
    <div className="detail">
      <header className="detail-head">
        <button className="btn btn-ghost btn-sm back" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <div className="detail-title">
          <h1>{task.title}</h1>
          <div className="detail-meta">
            <StatusBadge status={task.status} />
            {check && <CheckBadge task={task} />}
            <span className="meta-item">{agent && <AgentAvatar agent={agent} owner={owner} size={18} />}{agent?.name} on {host?.name || 'unknown host'}</span>
            {task.repo && <span className="meta-item mono"><GitBranch size={13} />{result?.branch || task.repo}</span>}
            <span className="meta-item faint">opened {timeAgo(task.createdAt)} by {task.createdBy === state.me.id ? 'you' : state.people.find((p) => p.id === task.createdBy)?.name}</span>
          </div>
        </div>
        <div className="detail-actions">
          {myApproval && (
            <>
              <button className="btn" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${myApproval.id}`, { decision: 'deny' }))}>Decline</button>
              <button className="btn btn-primary" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `approvals/${myApproval.id}`, { decision: 'approve' }))}><Check size={14} /> Approve & run</button>
            </>
          )}
          {active && canReview && !myApproval && <button className="btn" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `tasks/${task.id}/cancel`))}><Square size={13} /> Stop</button>}
          {reviewable && <button className="btn" onClick={() => { setTab('conversation'); setTimeout(() => reply.current?.focus(), 30); }}>Request changes</button>}
          {canAccept && (
            <button className={'btn ' + (check && !check.passed ? '' : 'btn-success')} disabled={action.busy} onClick={accept}>
              <Check size={14} /> {check && !check.passed ? 'Accept anyway' : apply ? 'Accept & apply' : 'Accept'}
            </button>
          )}
        </div>
      </header>
      <ErrorText error={action.error} />

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')}>Conversation</button>
        <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>
          Changes {stats && <span className="tab-count mono"><span className="add">+{stats.add}</span> <span className="del">−{stats.del}</span></span>}
        </button>
        <button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>Check {check && (check.passed ? <span className="tab-dot good" /> : <span className="tab-dot bad" />)}</button>
      </nav>

      <div className="detail-body">
        <div className="detail-main">
          {tab === 'conversation' && <Conversation ctx={ctx} task={task} replyRef={reply} reviewable={reviewable} onOpenChanges={() => setTab('changes')} />}
          {tab === 'changes' && <Changes task={task} />}
          {tab === 'check' && <CheckTab task={task} ownerName={owner?.name} />}
        </div>
        <aside className="detail-side">
          <SideSection label="Agent">
            <div className="side-agent">
              {agent && <AgentAvatar agent={agent} owner={owner} size={32} status={agentStatus(agent)} />}
              <div><strong>{agent?.name}</strong><small>{owner?.id === state.me.id ? 'Your agent' : `${owner?.name}'s agent`}</small></div>
            </div>
            <dl className="props">
              <dt>Runs on</dt><dd>{host?.name}{host && <span className={'presence-text ' + (host.online ? 'good' : 'faint')}> · {host.online ? 'online' : 'offline'}</span>}</dd>
              <dt>Runtime</dt><dd>{agent?.runtime}{agent?.model ? ` · ${agent.model}` : ''}</dd>
              <dt>Repository</dt><dd className="mono">{task.repo || '—'}</dd>
            </dl>
          </SideSection>
          <MemorySection ctx={ctx} task={task} />
          <ProofSection ctx={ctx} task={task} />
          {canAccept && memoryOn && (
            <SideSection label="Lesson for the space">
              <textarea className="lesson-input" rows={3} value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="What should every agent here remember from this? (optional)" aria-label="Lesson for the space" />
              <p className="faint small">Kept when you accept. {state.spaces.find((s) => s.id === task.spaceId)?.memberIds[0] === state.me.id ? 'You keep this space\'s knowledge, so it is added right away.' : 'The space keeper approves it first.'}</p>
            </SideSection>
          )}
          <SideSection label="Verification">
            <dl className="props">
              <dt>Check</dt><dd className="mono">{task.check || 'none'}</dd>
              <dt>Result</dt><dd><CheckBadge task={task} /></dd>
              {check && <><dt>Exit code</dt><dd className="mono">{check.exitCode}</dd></>}
            </dl>
          </SideSection>
          {task.attempts.length > 0 && (
            <SideSection label={`Attempts · ${task.attempts.length}`}>
              <ol className="attempts">
                {task.attempts.map((a, i) => (
                  <li key={i}>
                    <span className={'attempt-dot ' + (a.passed === true ? 'good' : a.passed === false || a.error ? 'bad' : a.finishedAt ? 'neutral' : 'run')} />
                    <span className="grow">Attempt {i + 1}</span>
                    <span className="faint mono small">{a.finishedAt ? duration(a.startedAt, a.finishedAt) : 'running'}</span>
                  </li>
                ))}
              </ol>
            </SideSection>
          )}
          {result && result.files.length > 0 && (
            <SideSection label={`Files changed · ${result.files.length}`}>
              <ul className="side-files">{result.files.map((f) => <li key={f} className="mono"><FileCode2 size={13} />{f}</li>)}</ul>
            </SideSection>
          )}
          {task.conflicts.length > 0 && (
            <SideSection label="Overlaps">
              {task.conflicts.map((c) => {
                const other = state.tasks.find((t) => t.id === c.taskId);
                return <button key={c.taskId} className="side-conflict" onClick={() => ctx.go({ page: 'task', id: c.taskId })}><AlertTriangle size={14} /><span><strong>{other?.title}</strong><small>Both change {c.files.join(', ')}</small></span></button>;
              })}
            </SideSection>
          )}
          {task.applied && (
            <SideSection label="Applied">
              <p className={'side-applied ' + (task.applied.ok ? 'good' : 'bad')}>{task.applied.ok ? <><GitBranch size={13} /> <span className="mono">{task.applied.branch}</span></> : task.applied.message}</p>
              {task.applied.ok && <p className="faint small">Committed on a new branch in your repository. Merge it when you're ready.</p>}
            </SideSection>
          )}
        </aside>
      </div>
    </div>
  );
}

/** What the agent recalled from Meko before this task, with the source of each item. */
function MemorySection({ ctx, task }: { ctx: Ctx; task: Task }) {
  const action = useAction();
  const c = task.context;
  if (!c) return null;
  const label = { memory: 'its memory', handoff: 'hand-off', space: 'space knowledge', skill: 'skill', app: 'app' } as const;
  return (
    <SideSection label="Recalled from Meko">
      {c.status === 'off' && <p className="faint small">Memory was off: the agent saw only this task.</p>}
      {c.status === 'pending' && <p className="faint small">Recalling…</p>}
      {c.status === 'ready' && !c.items.length && <p className="faint small">Nothing relevant remembered yet.</p>}
      {c.status === 'ready' && (c.saved || 0) > 0 && <p className="recall-saved">Meko saved <strong>{(c.saved || 0).toLocaleString()}</strong> tokens on this recall{c.quality ? <span> · {c.quality} match</span> : null}</p>}
      <ul className="recalled">
        {c.items.map((item, i) => (
          <li key={item.id || i}>
            <span className={'recalled-source src-' + item.source}><Brain size={11} />{label[item.source]}{item.source !== 'space' && ` · ${item.from}`}</span>
            <p>{item.text}</p>
            <span className="recalled-meta faint mono">
              {item.score !== null && `score ${item.score.toFixed(2)} · `}{item.id ? item.id.slice(0, 14) : 'pending id'}
              {item.id && (item.source !== 'skill' && item.source !== 'app') && <button className="link-btn" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', 'memory/forget', { datapack: item.datapack, memoryId: item.id, taskId: task.id }))}>forget</button>}
            </span>
          </li>
        ))}
      </ul>
      <ErrorText error={action.error} />
    </SideSection>
  );
}

/** The result's proof in Meko, and whether an earlier task produced exactly the same change. */
function ProofSection({ ctx, task }: { ctx: Ctx; task: Task }) {
  const p = task.proof;
  if (!p) return null;
  const first = p.duplicateOf ? ctx.state.tasks.find((t) => t.id === p.duplicateOf) : null;
  return (
    <SideSection label="Proof in Meko">
      <p className="proof-hash mono" title={p.hash || ''}>sha256 {p.hash ? `${p.hash.slice(0, 16)}…` : '—'}</p>
      <p className="faint small">The diff{p.check !== null ? ` (check ${p.check ? 'passed' : 'failed'})` : ''} is stored as an artifact, keyed by its content.</p>
      {p.duplicateOf && (
        <button className="proof-dup" onClick={() => first && ctx.go({ page: 'task', id: first.id })}>
          Identical to {first ? <strong>“{first.title}”</strong> : 'an earlier result'}{first ? ` by ${ctx.state.agents.find((a) => a.id === first.agentId)?.name}` : ''}: Meko already held this exact change.
        </button>
      )}
    </SideSection>
  );
}

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="side-section"><h3>{label}</h3>{children}</section>;
}

type Entry =
  | { at: string; kind: 'log'; line: Task['log'][number] }
  | { at: string; kind: 'feedback'; by: string; text: string }
  | { at: string; kind: 'attempt'; index: number };

function Conversation({ ctx, task, replyRef, reviewable, onOpenChanges }: { ctx: Ctx; task: Task; replyRef: React.RefObject<HTMLTextAreaElement | null>; reviewable: boolean; onOpenChanges: () => void }) {
  const { state } = ctx;
  const agent = state.agents.find((a) => a.id === task.agentId);
  const owner = state.people.find((p) => p.id === task.ownerId);
  const by = state.people.find((p) => p.id === task.createdBy);
  const waiting = state.waitingOn.find((a) => a.taskId === task.id);
  const myApproval = state.approvals.find((a) => a.taskId === task.id);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [task.log.length, task.status]);

  const entries: Entry[] = [
    ...task.log.map((line) => ({ at: line.at, kind: 'log' as const, line })),
    ...task.feedback.map((f) => ({ at: f.at, kind: 'feedback' as const, by: f.by, text: f.text })),
    ...task.attempts.slice(1).map((a, i) => ({ at: a.startedAt, kind: 'attempt' as const, index: i + 2 })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'feedback' ? -1 : 1));

  // Consecutive tool and note lines collapse into one "steps" group, like an agent IDE.
  const blocks: ({ type: 'steps'; lines: Task['log'] } | { type: 'entry'; entry: Entry })[] = [];
  for (const entry of entries) {
    if (entry.kind === 'log' && entry.line.kind !== 'say') {
      const last = blocks.at(-1);
      if (last?.type === 'steps') last.lines.push(entry.line);
      else blocks.push({ type: 'steps', lines: [entry.line] });
    } else blocks.push({ type: 'entry', entry });
  }

  const result = task.result;
  const stats = result?.diff ? diffStats(result.diff) : null;
  const lastSay = [...task.log].reverse().find((l) => l.kind === 'say')?.text.trim();

  return (
    <div className="conversation">
      <div className="conv-scroll">
        <Message avatar={<Avatar person={by} size={28} />} name={by?.id === state.me.id ? 'You' : by?.name || ''} time={task.createdAt} note={task.createdBy !== task.ownerId ? `to ${owner?.name}'s ${agent?.name}` : undefined}>
          <div className="msg-text"><Markdown text={task.instructions} /></div>
          {task.check && <div className="msg-chip"><Terminal size={12} /> check: <code>{task.check}</code></div>}
        </Message>

        {myApproval && (
          <div className="event-card warn">
            <strong>{myApproval.title}</strong>
            <p>{myApproval.detail}</p>
            <p className="faint small">Use Approve & run at the top to start it on your machine.</p>
          </div>
        )}
        {!myApproval && waiting && <div className="event-line"><span className="event-dot warn" />Waiting for {state.people.find((p) => p.id === waiting.ownerId)?.name} to approve running this on their machine</div>}
        {task.status === 'queued' && <div className="event-line"><span className="event-dot" />Queued on {state.hosts.find((h) => h.id === agent?.hostId)?.name}</div>}

        {blocks.map((b, i) => {
          if (b.type === 'steps') return <Steps key={i} lines={b.lines} />;
          const e = b.entry;
          if (e.kind === 'attempt') return <div key={i} className="attempt-divider"><span>Attempt {e.index}</span></div>;
          if (e.kind === 'feedback') {
            const p = state.people.find((x) => x.id === e.by);
            return <Message key={i} avatar={<Avatar person={p} size={28} />} name={e.by === state.me.id ? 'You' : p?.name || ''} time={e.at} note="requested changes"><div className="msg-text"><Markdown text={e.text} /></div></Message>;
          }
          return <Message key={i} avatar={agent ? <AgentAvatar agent={agent} owner={owner} size={28} /> : null} name={agent?.name || 'Agent'} time={e.line.at} agent><div className="msg-text"><Markdown text={e.line.text} /></div></Message>;
        })}

        {task.status === 'running' && (
          <div className="working"><span className="pulse-dot" />{agent?.name} is working · {duration(task.attempts.at(-1)?.startedAt || task.updatedAt)}</div>
        )}

        {result && !['running', 'queued'].includes(task.status) && (
          <div className="result-card">
            {result.error ? (
              <div className="result-row bad"><X size={15} /><div><strong>The agent stopped</strong><p className="mono">{result.error}</p></div></div>
            ) : (
              <>
                {result.summary && result.summary.trim() !== lastSay && <div className="result-summary"><Markdown text={result.summary} /></div>}
                {stats && (
                  <button className="result-row clickable" onClick={onOpenChanges}>
                    <FileCode2 size={15} />
                    <div className="grow"><strong>{result.files.length} file{result.files.length === 1 ? '' : 's'} changed</strong><p className="mono">{result.files.slice(0, 4).join(', ')}{result.files.length > 4 ? '…' : ''}</p></div>
                    <span className="mono"><span className="add">+{stats.add}</span> <span className="del">−{stats.del}</span></span>
                    <ChevronRight size={15} className="faint" />
                  </button>
                )}
                {result.check && (
                  <div className={'result-row ' + (result.check.passed ? 'good' : 'bad')}>
                    {result.check.passed ? <Check size={15} /> : <X size={15} />}
                    <div className="grow"><strong>{result.check.passed ? 'Check passed' : 'Check failed'} on {owner?.name}'s machine</strong><p className="mono">$ {result.check.command} · exit {result.check.exitCode}</p></div>
                  </div>
                )}
              </>
            )}
            {task.applied?.ok && <div className="result-row good"><GitBranch size={15} /><div><strong>Applied on your machine</strong><p className="mono">{task.applied.branch}</p></div></div>}
          </div>
        )}
        <div ref={end} className="conv-end" />
      </div>

      <ThreadComposer ctx={ctx} task={task} replyRef={replyRef} reviewable={reviewable} />
    </div>
  );
}

/** Docked at the bottom like an agent chat: what it does depends on where the task is. */
function ThreadComposer({ ctx, task, replyRef, reviewable }: { ctx: Ctx; task: Task; replyRef: React.RefObject<HTMLTextAreaElement | null>; reviewable: boolean }) {
  const { state } = ctx;
  const [text, setText] = useState('');
  const action = useAction();
  const agent = state.agents.find((a) => a.id === task.agentId);
  const owner = state.people.find((p) => p.id === task.ownerId);
  const canAct = task.createdBy === state.me.id || task.ownerId === state.me.id;
  const active = ['awaiting_approval', 'queued', 'running', 'revision_requested', 'applying', 'accepted'].includes(task.status);
  const theirs = owner?.id === state.me.id ? 'your agent' : `${owner?.name}'s agent`;

  const mode: 'revise' | 'busy' | 'followup' = reviewable ? 'revise' : active ? 'busy' : 'followup';
  const submit = async () => {
    if (!text.trim() || !agent) return;
    if (mode === 'revise') {
      if (await action.run(() => ctx.larp.act('POST', `tasks/${task.id}/revise`, { feedback: text }))) setText('');
    } else if (mode === 'followup') {
      const [first, ...rest] = text.trim().split('\n');
      await action.run(async () => {
        const next = await ctx.larp.act('POST', 'tasks', {
          spaceId: task.spaceId, agentId: agent.id, kind: task.kind, check: task.check || undefined,
          title: first.slice(0, 80),
          instructions: `${rest.length ? text.trim() : first}\n\nFollow-up to "${task.title}"${task.applied?.branch ? ` (applied as ${task.applied.branch})` : ''}.`,
        });
        setText('');
        ctx.go({ page: 'task', id: next.id });
      });
    }
  };

  const placeholder = mode === 'revise' ? `Ask ${agent?.name} for changes. It continues on the same branch.`
    : mode === 'busy' ? (task.status === 'awaiting_approval' ? `Waiting for ${owner?.name} to approve…` : `${agent?.name} is working. You can reply when it finishes.`)
      : `Start a follow-up task for ${agent?.name}…`;
  const hint = mode === 'revise' ? `Sends a revision to ${theirs}` : mode === 'busy' ? `${agent?.name} · ${task.status.replace('_', ' ')}` : `Creates a new task for ${theirs}${task.check ? ' with the same check' : ''}`;

  return (
    <div className={'composer mode-' + mode}>
      <textarea ref={replyRef} rows={2} aria-label={mode === 'revise' ? 'Request changes' : mode === 'followup' ? 'Follow-up task' : 'Reply'} placeholder={placeholder}
        disabled={mode === 'busy' || !canAct && mode === 'revise'} value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }} />
      <div className="composer-row">
        {agent && <AgentAvatar agent={agent} owner={owner} size={18} status={agentStatus(agent)} />}
        <span className="faint small">{hint}</span>
        <span className="grow" />
        {mode === 'busy' && canAct && task.status !== 'accepted' && task.status !== 'applying' && (
          <button className="btn btn-sm" disabled={action.busy} onClick={() => action.run(() => ctx.larp.act('POST', `tasks/${task.id}/cancel`))}><Square size={12} /> Stop</button>
        )}
        {mode !== 'busy' && <span className="faint small"><Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd></span>}
        {mode !== 'busy' && (
          <button className="btn btn-primary btn-sm" aria-label={mode === 'revise' ? 'Send revision' : 'Start follow-up'} disabled={!text.trim() || action.busy} onClick={submit}>
            <ArrowUp size={14} /> {mode === 'revise' ? 'Send' : 'Start'}
          </button>
        )}
      </div>
      <ErrorText error={action.error} />
    </div>
  );
}

function Message({ avatar, name, time, note, agent, children }: { avatar: React.ReactNode; name: string; time: string; note?: string; agent?: boolean; children: React.ReactNode }) {
  return (
    <div className={'msg' + (agent ? ' agent' : '')}>
      <div className="msg-avatar">{avatar}</div>
      <div className="msg-body">
        <div className="msg-head"><strong>{name}</strong>{note && <span className="faint">{note}</span>}<span className="faint small">{clock(time)}</span></div>
        {children}
      </div>
    </div>
  );
}

function Steps({ lines }: { lines: Task['log'] }) {
  const tools = lines.filter((l) => l.kind === 'tool').length;
  const fail = lines.some((l) => l.kind === 'fail');
  const pass = lines.some((l) => l.kind === 'pass');
  const [open, setOpen] = useState(fail);
  return (
    <div className={'steps' + (open ? ' open' : '')}>
      <button className="steps-head" onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} className="chev" />
        <span>{tools ? `${tools} tool call${tools === 1 ? '' : 's'}` : `${lines.length} step${lines.length === 1 ? '' : 's'}`}</span>
        {pass && <span className="good small">· check passed</span>}
        {fail && <span className="bad small">· check failed</span>}
        <span className="grow" />
        <span className="faint small mono">{lines.at(-1) && clock(lines.at(-1)!.at)}</span>
      </button>
      {open && (
        <ol className="steps-list">
          {lines.map((l, i) => <li key={i} className={l.kind}><span className="step-mark">{l.kind === 'tool' ? '›' : l.kind === 'pass' ? '✓' : l.kind === 'fail' ? '✗' : '·'}</span><code>{l.text}</code></li>)}
        </ol>
      )}
    </div>
  );
}

function Changes({ task }: { task: Task }) {
  const files = task.result?.diff ? diffFiles(task.result.diff) : [];
  const [selected, setSelected] = useState(0);
  if (!task.result) return <EmptyState icon={<FileCode2 size={22} />} title="No changes yet">Changes appear here when the agent finishes.</EmptyState>;
  if (!files.length) return <EmptyState icon={<FileCode2 size={22} />} title="No file changes">The agent finished without changing any files.</EmptyState>;
  const file = files[Math.min(selected, files.length - 1)];
  return (
    <div className="changes">
      <ul className="file-tree">
        {files.map((f, i) => (
          <li key={f.path}><button className={i === selected ? 'active' : ''} onClick={() => setSelected(i)}>
            <FileCode2 size={14} /><span className="grow mono">{f.path}</span><span className="mono small"><span className="add">+{f.add}</span> <span className="del">−{f.del}</span></span>
          </button></li>
        ))}
      </ul>
      <div className="diff-pane">
        <div className="diff-file-head mono">{file.path}<span className="grow" /><span className="add">+{file.add}</span> <span className="del">−{file.del}</span></div>
        <DiffView lines={file.lines} />
      </div>
    </div>
  );
}

function CheckTab({ task, ownerName }: { task: Task; ownerName?: string }) {
  const check = task.result?.check;
  if (!task.check) return <EmptyState icon={<Terminal size={22} />} title="No check command">This task wasn't given a check, so the result can't be verified automatically.</EmptyState>;
  if (!check) return <EmptyState icon={<Terminal size={22} />} title="Check hasn't run yet">Larp runs <code>{task.check}</code> on {ownerName}'s machine after the agent finishes.</EmptyState>;
  return (
    <div className="check-panel">
      <div className={'check-head ' + (check.passed ? 'good' : 'bad')}>
        {check.passed ? <Check size={16} /> : <X size={16} />}
        <strong>{check.passed ? 'Passed' : 'Failed'}</strong>
        <code>$ {check.command}</code>
        <span className="grow" />
        <span className="faint small">exit {check.exitCode} · ran on {ownerName}'s machine</span>
      </div>
      <pre className="terminal">{check.output || '(no output)'}</pre>
    </div>
  );
}
