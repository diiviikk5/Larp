import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, Home, Smartphone } from 'lucide-react';
import { useLarp, type Session } from './api';
import type { DeviceConfig } from './types';
import { ErrorText, Field, LogoMark, useAction } from './ui';
import { Mascot } from './Mascot';
import { Shell } from './Shell';
import { ConfirmHost, Toaster } from './feedback';
import { useAppearance } from './Appearance';

export function App() {
  useAppearance();
  return <>{window.larp ? <Desktop /> : <Phone />}<Toaster /><ConfirmHost /></>;
}

function Desktop() {
  const [device, setDevice] = useState<DeviceConfig | null>(null);
  const reload = useCallback(() => { window.larp!.config().then(setDevice); }, []);
  useEffect(() => { reload(); return window.larp!.onChange(reload); }, [reload]);
  const active = device?.people.find((p) => p.id === device.activePersonId);
  const session = useMemo<Session | null>(() => (device?.url && active ? { url: device.url, token: active.token } : null), [device?.url, active?.token]);
  const larp = useLarp(session);
  if (!device) return <Loading />;
  if (!device.mode) return <Onboarding onDone={setDevice} />;
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

function Onboarding({ onDone }: { onDone: (d: DeviceConfig) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [kind, setKind] = useState<'build' | 'home'>('build');
  const [lan, setLan] = useState(true);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
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
          <h1>Your people's agents,<br />working together.</h1>
          <p>Every agent runs on its owner's computer, under its owner's account, and asks before it acts. Larp is where the work meets.</p>
          <ul>
            <li><strong>Delegate across machines.</strong> Send a task to a teammate's agent; it runs in their repo and comes back with a diff and a check result.</li>
            <li><strong>Share without oversharing.</strong> Plan with family using answers from private calendars and budgets that never leave anyone's device.</li>
            <li><strong>Stay in charge from your phone.</strong> Approvals reach the owner, wherever they are on your network.</li>
          </ul>
        </div>
      </aside>
      <main className="onboarding-form">
        <div className="onboarding-card">
          <div className="segmented wide">
            <button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Start a space</button>
            <button aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join a space</button>
          </div>
          <h2>{mode === 'create' ? 'Start a new space' : 'Join with an invite'}</h2>
          <p className="faint">{mode === 'create' ? 'This computer will host it. Others join with a code.' : 'Ask someone in the space for the address and a code.'}</p>
          <div className="form">
            <Field label="Your name" htmlFor="your-name"><input id="your-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Divik" /></Field>
            {mode === 'create' ? (
              <>
                <Field label="Kind of space">
                  <div className="kind-cards">
                    <button className={kind === 'build' ? 'selected' : ''} aria-pressed={kind === 'build'} onClick={() => setKind('build')}><Code2 size={18} /><strong>Build</strong><small>Code with teammates' agents</small></button>
                    <button className={kind === 'home' ? 'selected' : ''} aria-pressed={kind === 'home'} onClick={() => setKind('home')}><Home size={18} /><strong>Home</strong><small>Plans, money and care</small></button>
                  </div>
                </Field>
                <Field label="Space name" htmlFor="space-name"><input id="space-name" value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder={kind === 'build' ? 'Build studio' : 'Home'} /></Field>
                <label className="check-row bare"><input type="checkbox" checked={lan} onChange={(e) => setLan(e.target.checked)} /><span className="grow"><strong>Let other devices on this network join</strong><small>Teammates' computers and phones. This computer must stay awake for them to reach it.</small></span></label>
              </>
            ) : (
              <>
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
