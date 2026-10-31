import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { Agent, Person, Task, TaskStatus } from './types';
import { Mascot, type Pose } from './Mascot';

// ---------- time ----------

export function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function duration(from: string, to?: string) {
  const s = Math.max(0, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Re-render on an interval so relative times stay fresh. */
export function useTick(ms = 15000) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

// ---------- brand & identity ----------

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <path d="M13 4.5h6v13h10v6H13z" fill="var(--text-3)" />
      <path d="M3 7.5h6v14h10v6H3z" fill="currentColor" stroke="var(--bg)" strokeWidth="2" paintOrder="stroke" />
    </svg>
  );
}

export function Avatar({ person, size = 24 }: { person?: Person; size?: number }) {
  if (!person) return <span className="avatar" style={{ width: size, height: size }} />;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: person.color }} title={person.name}>
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Agents get a squared monogram tinted with their owner's color, so you can tell whose agent it is at a glance. */
export function AgentAvatar({ agent, owner, size = 28, status }: { agent: Pick<Agent, 'id' | 'name'>; owner?: Person; size?: number; status?: 'online' | 'busy' | 'offline' }) {
  const color = owner?.color || '#8b7cf6';
  const letters = agent.name.replace(/[^a-z0-9]/gi, '').slice(0, 2) || '?';
  return (
    <span className="agent-avatar" style={{ width: size, height: size, fontSize: size * 0.38, '--tint': color } as React.CSSProperties} title={agent.name}>
      {letters[0].toUpperCase() + (letters[1] || '').toLowerCase()}
      {status && <i className={'presence ' + status} />}
    </span>
  );
}

export function agentStatus(a: Pick<Agent, 'online' | 'busy'>): 'online' | 'busy' | 'offline' {
  return a.busy ? 'busy' : a.online ? 'online' : 'offline';
}

// ---------- status ----------

export const STATUS_LABEL: Record<TaskStatus, string> = {
  awaiting_approval: 'Needs approval', queued: 'Queued', running: 'Running', needs_review: 'In review',
  revision_requested: 'Revising', accepted: 'Accepted', applying: 'Applying', applied: 'Merged',
  apply_failed: 'Apply failed', denied: 'Declined', cancelled: 'Cancelled', failed: 'Failed', interrupted: 'Interrupted',
};

const STATUS_TONE: Record<TaskStatus, string> = {
  awaiting_approval: 'warn', queued: 'neutral', running: 'accent', needs_review: 'info', revision_requested: 'neutral',
  accepted: 'good', applying: 'accent', applied: 'good', apply_failed: 'bad', denied: 'neutral', cancelled: 'neutral',
  failed: 'bad', interrupted: 'bad',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge tone-${STATUS_TONE[status]}`}><i className={status === 'running' || status === 'applying' ? 'pulse' : ''} />{STATUS_LABEL[status]}</span>;
}

export function CheckBadge({ task }: { task: Task }) {
  const check = task.result?.check;
  if (!task.check) return <span className="faint">—</span>;
  if (!check) return <span className="faint mono">pending</span>;
  return check.passed
    ? <span className="check-badge good"><Check size={12} strokeWidth={3} /> Passed</span>
    : <span className="check-badge bad"><X size={12} strokeWidth={3} /> Failed</span>;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`tag tone-${tone}`}>{children}</span>;
}

// ---------- layout ----------

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-title">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children && <div className="toolbar">{children}</div>}
    </header>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'card ' + className}>
      {(title || action) && <header className="card-head"><h2>{title}</h2>{action}</header>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className={'stat' + (tone ? ` tone-${tone}` : '')}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon, pose, title, children, action }: { icon?: ReactNode; pose?: Pose; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {pose ? <Mascot pose={pose} size={72} /> : icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <section className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head"><h2>{title}</h2><button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}

/** A panel that slides in from the right for create/edit flows. */
export function Sheet({ title, subtitle, onClose, children, footer, width = 560 }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose);
  return (
    <div className="overlay sheet-overlay" onMouseDown={onClose}>
      <section className="sheet" style={{ width }} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="btn-icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function CopyValue({ value, large }: { value: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={'copy-value' + (large ? ' large' : '')}>
      <code>{value}</code>
      <button className="btn-icon" aria-label="Copy" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="error-text" role="alert">{error}</p> : null;
}

// ---------- diff ----------

export function diffStats(diff: string) {
  let add = 0; let del = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) add++;
    else if (l.startsWith('-') && !l.startsWith('---')) del++;
  }
  return { add, del };
}

/** Split a unified diff into per-file chunks. */
export function diffFiles(diff: string) {
  const files: { path: string; lines: string[]; add: number; del: number }[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      files.push({ path: line.replace(/^diff --git a\/(.*) b\/.*$/, '$1'), lines: [], add: 0, del: 0 });
      continue;
    }
    const file = files.at(-1);
    if (!file || /^(index|---|\+\+\+|new file|deleted file|similarity|rename)/.test(line)) continue;
    file.lines.push(line);
    if (line.startsWith('+')) file.add++;
    else if (line.startsWith('-')) file.del++;
  }
  return files;
}

export function DiffView({ lines }: { lines: string[] }) {
  let oldNo = 0; let newNo = 0;
  return (
    <table className="diff-table">
      <tbody>
        {lines.map((line, i) => {
          if (line.startsWith('@@')) {
            const m = line.match(/-(\d+)(?:,\d+)? \+(\d+)/);
            if (m) { oldNo = Number(m[1]); newNo = Number(m[2]); }
            return <tr key={i} className="hunk"><td /><td /><td>{line}</td></tr>;
          }
          if (line.startsWith('+')) return <tr key={i} className="add"><td /><td>{newNo++}</td><td>{line}</td></tr>;
          if (line.startsWith('-')) return <tr key={i} className="del"><td>{oldNo++}</td><td /><td>{line}</td></tr>;
          if (!line && i === lines.length - 1) return null;
          return <tr key={i}><td>{oldNo++}</td><td>{newNo++}</td><td>{line}</td></tr>;
        })}
      </tbody>
    </table>
  );
}

// ---------- actions ----------

/** Run an async action with a busy flag and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const RUNTIMES: { id: string; label: string; hint: string; cost: string }[] = [
  { id: 'claude', label: 'Claude Code', hint: 'Runs the Claude Code CLI you are signed in to on this computer. File edits only; Larp runs the check.', cost: 'Your Claude plan' },
  { id: 'codex', label: 'Codex', hint: 'Runs the Codex CLI you are signed in to, sandboxed to the task worktree.', cost: 'Your ChatGPT plan' },
  { id: 'openai', label: 'Local or API model', hint: 'Any OpenAI-compatible endpoint: Ollama and LM Studio (free, local) or a provider with your own key.', cost: 'Free locally, or your key' },
  { id: 'hermes', label: 'Hermes Agent', hint: 'Hermes over ACP with its own configured provider. Its permission requests come to you.', cost: 'Your Hermes provider' },
  { id: 'scripted', label: 'Scripted (testing)', hint: 'No model. Follows literal "replace … with … in …" steps. Useful for trying Larp without spending anything.', cost: 'Free' },
];

// ---------- markdown (the small subset agents actually use; builds elements, never injects HTML) ----------

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('`')) out.push(<code key={`${key}-${i++}`} className="md-code">{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{token.slice(2, -2)}</strong>);
    else {
      const [, label, href] = token.match(/\[([^\]]+)\]\(([^)\s]+)\)/)!;
      out.push(/^https?:\/\//.test(href)
        ? <a key={`${key}-${i++}`} href={href} onClick={(e) => { e.preventDefault(); window.larp?.openExternal({ url: href }); }}>{label}</a>
        : label);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={i} className="md-pre" data-lang={lang || undefined}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={i} className="md-list">{items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={i} className="md-list">{items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ol>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { blocks.push(<p key={i} className="md-heading">{inline(heading[2], `${i}`)}</p>); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|\s*[-*]\s+|\s*\d+[.)]\s+|#{1,4}\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={i} className="md-p">{inline(para.join('\n'), `${i}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
