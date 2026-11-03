import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Code2, Home, Smartphone } from 'lucide-react';
import { useLarp, type Session } from './api';
import type { DeviceConfig } from './types';
import { ErrorText, Field, LogoMark, useAction } from './ui';
import { Mascot } from './Mascot';
import { parseInvite } from './invite';
import { UpdateBar } from './UpdateBar';
import { Shell } from './Shell';
import { ConfirmHost, Toaster } from './feedback';
import { useAppearance } from './Appearance';

/**
 * If a page ever throws while drawing, show what happened and a way back instead of a blank window
 * (React unmounts everything on an uncaught render error). Your space and agents keep running.
 */
class Recover extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[larp] the window crashed while drawing:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading">
        <Mascot pose="sleeping" size={64} />
        <strong>Something went wrong on this screen</strong>
        <p>Your space and your agents keep running. Reload to continue.</p>
        <p className="faint small">{this.state.error.message}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

export function App() {
  useAppearance();
  useEffect(() => {
    const bridge = async (event: MessageEvent) => {
      if (!window.larp || (location.protocol !== 'file:' && event.origin !== location.origin) || event.data?.type !== 'larp-app-bridge') return;
      const { id } = event.data;
      if (!['citylines', 'eduspace', 'studio'].includes(id)) return;
      const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === event.source && new URL(f.src, location.href).pathname.includes('/' + id + '/'));
      if (!frame) return;
      try { const snapshot = await window.larp.appSnapshot(event.data); (event.source as Window).postMessage({ type: 'larp-app-state', id, profile: event.data.profile || '', snapshot }, location.protocol === 'file:' ? '*' : event.origin); } catch { /* host is starting */ }
    };
    window.addEventListener('message', bridge); return () => window.removeEventListener('message', bridge);
  }, []);
  return <><Recover>{window.larp ? <Desktop /> : <Phone />}</Recover><Toaster /><ConfirmHost />{window.larp && <UpdateBar />}</>;
}

function Desktop() {
  const [device, setDevice] = useState<DeviceConfig | null>(null);
  const reload = useCallback(() => { window.larp!.config().then(setDevice); }, []);
  useEffect(() => { reload(); return window.larp!.onChange(reload); }, [reload]);
  const active = device?.people.find((p) => p.id === device.activePersonId);
  const session = useMemo<Session | null>(() => (device?.url && active ? { url: device.url, token: active.token } : null), [device?.url, active?.token]);
  const larp = useLarp(session);
  // While the space can't be reached, re-read this computer's settings too: the address shown may be
  // one it has since moved away from (a space it switched out of, a host that came up on another port).
  const stuck = !larp.state && Boolean(larp.error);
  useEffect(() => {
    if (!stuck) return;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [stuck, reload]);
  if (!device) return <Loading />;
  if (!device.mode) return <Onboarding onDone={setDevice} others={device.others || []} />;
  if (!larp.state && larp.error) return <Unreachable device={device} error={larp.error} setDevice={setDevice} refresh={larp.refresh} />;
  if (!larp.state) return <Loading error={larp.error} detail={device.url || undefined} />;
  return <Shell larp={larp} state={larp.state} device={device} setDevice={setDevice} reloadDevice={reload} phone={false} />;
}

function Loading({ error, detail }: { error?: string; detail?: string }) {
  return (
    <div className="loading">
      <Mascot pose={error ? 'sleeping' : 'working'} size={64} />
      {error ? <><strong>Can't reach the space</strong><p>{error}</p>{detail && <code>{detail}</code>}</> : <p>Connecting…</p>}
    </div>
  );
}

/**
 * The space can't be reached. Never a dead end: try again (Larp also keeps retrying by itself), go back
 * to a space this computer was in before, or step out to the start screen to create or join one.
 */
function Unreachable({ device, error, setDevice, refresh }: { device: DeviceConfig; error: string; setDevice: (d: DeviceConfig) => void; refresh: () => void }) {
  const action = useAction();
  const where = device.url || '';
  const label = device.mode === 'host' ? 'My space (this computer)' : where;
  return (
    <div className="loading">
      <Mascot pose="sleeping" size={64} />
      <strong>Can't reach the space</strong>
      <p>{device.mode === 'host' ? 'This computer hosts it, and it is starting again. This usually takes a few seconds.' : `The computer or server hosting it isn't answering. If it's a teammate's computer, Larp has to be open there, on the same network.`}</p>
      {where && <code>{where}</code>}
      <p className="faint small">{error}</p>
      <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={action.busy} onClick={() => action.run(async () => { setDevice(await window.larp!.retry()); refresh(); })}>Try again</button>
        {(device.others || []).map((o, index) => (
          <button key={`${o.url}-${index}`} className="btn" disabled={action.busy} onClick={() => action.run(async () => setDevice(await window.larp!.switchDevice({ index, label })))}>Switch to {o.label}</button>
        ))}
        <button className="btn btn-ghost" disabled={action.busy} onClick={() => action.run(async () => setDevice(await window.larp!.leaveSpace({ label })))}>Join or start another space</button>
      </div>
      <ErrorText error={action.error} />
    </div>
  );
}

function Onboarding({ onDone, others = [] }: { onDone: (d: DeviceConfig) => void; others?: NonNullable<DeviceConfig['others']> }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [kind, setKind] = useState<'build' | 'home'>('build');
  const [lan, setLan] = useState(true);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [invited, setInvited] = useState('');
  const action = useAction();
  const submit = () => action.run(async () => onDone(mode === 'create'
    ? await window.larp!.createSpace({ spaceName: spaceName.trim() || (kind === 'build' ? 'Build studio' : 'Home'), kind, name, lan })
    : await window.larp!.joinSpace({ url, code, name })));

  return (
    <div className="onboarding">
      <aside className="onboarding-art">
        <div className="onboarding-brand"><LogoMark size={28} /><span>larp</span></div>
        <div className="onboarding-pitch">
          <div className="onboarding-mascot"><Mascot pose="idle" size={96} /></div>
          <h1>Your agents.<br />One shared workspace.</h1>
          <p>Create a team on this computer. Give agents skills, let them work together, and follow every task, handoff and memory from one place.</p>
          <ul>
            <li><strong>Delegate across machines.</strong> Send a task to a teammate's agent; it runs in their repo and comes back with a diff and a check result.</li>
            <li><strong>Share without oversharing.</strong> Plan with family using answers from private calendars and budgets that never leave anyone's device.</li>
            <li><strong>Stay in charge from your phone.</strong> Approvals reach the owner, wherever they are on your network.</li>
          </ul>
        </div>
      </aside>
      <main className="onboarding-form">
        <div className="onboarding-card">
          {others.length > 0 && (
            <div className="onboarding-back">
              <p className="faint small">Spaces this computer was in</p>
              {others.map((o, index) => (
                <button key={`${o.url}-${index}`} className="btn btn-sm" disabled={action.busy} onClick={() => action.run(async () => onDone(await window.larp!.switchDevice({ index, label: '' })))}>Back to {o.label}</button>
              ))}
            </div>
          )}
          <div className="segmented wide">
            <button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Start a space</button>
            <button aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join a space</button>
          </div>
          <h2>{mode === 'create' ? 'Start a new space' : 'Join with an invite'}</h2>
          <p className="faint">{mode === 'create' ? 'Your agents run on this computer. Phone and Telegram control are optional.' : 'Paste the invite someone in the space sent you.'}</p>
          <div className="form">
            <Field label="Your name" htmlFor="your-name"><input id="your-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Divik" /></Field>
            {mode === 'create' ? (
              <>
                <Field label="Kind of space">
                  <div className="kind-cards">
                    <button className={kind === 'build' ? 'selected' : ''} aria-pressed={kind === 'build'} onClick={() => setKind('build')}><Code2 size={18} /><strong>Build</strong><small>Build with your agent team</small></button>
                    <button className={kind === 'home' ? 'selected' : ''} aria-pressed={kind === 'home'} onClick={() => setKind('home')}><Home size={18} /><strong>Home</strong><small>Plans, money and care</small></button>
                  </div>
                </Field>
                <Field label="Space name" htmlFor="space-name"><input id="space-name" value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder={kind === 'build' ? 'Build studio' : 'Home'} /></Field>
                <label className="check-row bare"><input type="checkbox" checked={lan} onChange={(e) => setLan(e.target.checked)} /><span className="grow"><strong>Let other devices on this network join</strong><small>Teammates' computers and phones. This computer must stay awake for them to reach it.</small></span></label>
              </>
            ) : (
              <>
                <Field label="Invite" htmlFor="invite-link" hint={invited ? 'Address and code filled in from the invite.' : 'Paste the invite (or the whole message) you were sent.'}>
                  <textarea id="invite-link" className="mono invite-paste" rows={2} placeholder="larp://join?at=…&code=…" value={invited} onChange={(e) => {
                    const found = parseInvite(e.target.value);
                    setInvited(found ? e.target.value.match(/larp:\/\/join\?\S+/)![0] : e.target.value);
                    if (found) { setUrl(found.url); setCode(found.code); }
                  }} />
                </Field>
                <Field label="Space address" htmlFor="host-url" hint="A teammate's laptop on your network, or a Larp server on the internet."><input id="host-url" className="mono" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://larp.example.com or http://192.168.1.20:47821" /></Field>
                <Field label="Invite or setup code" htmlFor="invite"><input id="invite" className="mono code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" /></Field>
              </>
            )}
            <ErrorText error={action.error} />
            <button className="btn btn-primary btn-lg" disabled={!name.trim() || action.busy || (mode === 'join' && (!url || !code))} onClick={submit}>
              {action.busy ? 'Setting up…' : mode === 'create' ? 'Create space' : 'Join space'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------- phone ----------------

function Phone() {
  const [session, setSession] = useState<Session | null>(() => {
    const token = localStorage.getItem('larp.phone');
    return token ? { url: location.origin, token } : null;
  });
  const larp = useLarp(session);
  useEffect(() => {
    if (larp.error.includes('not paired') || larp.error.includes('disconnected')) { localStorage.removeItem('larp.phone'); setSession(null); }
  }, [larp.error]);
  if (!session) return <PhonePair onPaired={(token) => { localStorage.setItem('larp.phone', token); setSession({ url: location.origin, token }); }} />;
  if (!larp.state) return <Loading error={larp.error} />;
  return <Shell larp={larp} state={larp.state} device={null} setDevice={() => {}} reloadDevice={() => {}} phone />;
}

function PhonePair({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <div className="phone-pair">
      <Mascot pose="idle" size={80} />
      <h1>Pair with Larp</h1>
      <p className="faint">On your computer, go to <strong>Settings → Phones</strong> and choose <strong>Pair a new phone</strong>. Enter the code shown there.</p>
      <input className="mono code-input" autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" aria-label="Pairing code" autoComplete="one-time-code" />
      <button className="btn btn-primary btn-lg" disabled={code.length < 6 || action.busy} onClick={() => action.run(async () => {
        const response = await fetch('/api/pair/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label: /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Phone' }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        onPaired(data.token);
      })}><Smartphone size={16} /> Pair this phone</button>
      <ErrorText error={action.error} />
    </div>
  );
}
