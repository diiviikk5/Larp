// App-wide feedback: toasts for anything that happened, and in-app confirmation dialogs.
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

type Tone = 'good' | 'bad' | 'info';
type Toast = { id: number; text: string; tone: Tone; action?: { label: string; run: () => void } };
type Confirm = { title: string; body?: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };

let nextId = 1;
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
const confirmListeners = new Set<(c: Confirm | null) => void>();

function emit() { for (const l of toastListeners) l(toasts); }

export function toast(text: string, tone: Tone = 'good', action?: Toast['action']) {
  const t = { id: nextId++, text, tone, action };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); emit(); }, action ? 7000 : 3600);
}

/** Ask the user to confirm an action; resolves true if they confirm. */
export function confirmDialog(options: Omit<Confirm, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => { for (const l of confirmListeners) l({ ...options, resolve }); });
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => { toastListeners.add(setList); return () => { toastListeners.delete(setList); }; }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={'toast tone-' + t.tone}>
          <span className="toast-icon">{t.tone === 'good' ? <Check size={14} strokeWidth={3} /> : t.tone === 'bad' ? <AlertTriangle size={14} /> : <Info size={14} />}</span>
          <span className="toast-text">{t.text}</span>
          {t.action && <button className="toast-action" onClick={() => { t.action!.run(); toasts = toasts.filter((x) => x.id !== t.id); emit(); }}>{t.action.label}</button>}
          <button className="toast-close" aria-label="Dismiss" onClick={() => { toasts = toasts.filter((x) => x.id !== t.id); emit(); }}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const [current, setCurrent] = useState<Confirm | null>(null);
  useEffect(() => { confirmListeners.add(setCurrent); return () => { confirmListeners.delete(setCurrent); }; }, []);
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!current) return null;
  const close = (ok: boolean) => { current.resolve(ok); setCurrent(null); };
  return (
    <div className="overlay" onMouseDown={() => close(false)}>
      <section className="modal confirm" role="alertdialog" aria-modal="true" aria-label={current.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-body confirm-body">
          <h2>{current.title}</h2>
          {current.body && <p>{current.body}</p>}
        </div>
        <footer className="modal-foot">
          <span className="grow" />
          <button className="btn" onClick={() => close(false)}>Cancel</button>
          <button className={'btn ' + (current.danger ? 'btn-danger-solid' : 'btn-primary')} autoFocus onClick={() => close(true)}>{current.confirmLabel || 'Confirm'}</button>
        </footer>
      </section>
    </div>
  );
}

/** Show an OS notification when the window isn't in front. Clicking it brings Larp forward. */
export function notify(title: string, body: string, onClick?: () => void) {
  if (document.hasFocus() || typeof Notification === 'undefined') return;
  const send = () => {
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => { window.focus(); onClick?.(); };
  };
  if (Notification.permission === 'granted') send();
  else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => { if (p === 'granted') send(); });
}
