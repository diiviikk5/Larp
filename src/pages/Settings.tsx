import { useState } from 'react';
import { Info, Laptop, Palette, Smartphone, Wifi } from 'lucide-react';
import type { Ctx, SettingsTab } from '../route';
import { confirmDialog } from '../feedback';
import { AgentAvatar, Card, CopyValue, ErrorText, Field, PageHeader, agentStatus, useAction } from '../ui';
import { Appearance, useAppearance } from '../Appearance';

export function Settings({ ctx, tab: initial }: { ctx: Ctx; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initial || (ctx.device ? 'device' : 'appearance'));
  const tabs: { id: SettingsTab; label: string; icon: React.ReactElement; desktop?: boolean }[] = [
    { id: 'device', label: 'This computer', icon: <Laptop size={15} />, desktop: true },
    { id: 'network', label: 'Network', icon: <Wifi size={15} />, desktop: true },
    { id: 'phones', label: 'Phones', icon: <Smartphone size={15} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
    { id: 'about', label: 'About', icon: <Info size={15} /> },
  ];
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <div className="settings">
        <nav className="settings-nav">
          {tabs.filter((t) => !t.desktop || ctx.device).map((t) => (
            <button key={t.id} className={'nav-item' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.icon}<span>{t.label}</span></button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'device' && <DeviceTab ctx={ctx} />}
          {tab === 'network' && <NetworkTab ctx={ctx} />}
          {tab === 'phones' && <PhonesTab ctx={ctx} />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'about' && <AboutTab ctx={ctx} />}
        </div>
      </div>
    </div>
  );
}

function DeviceTab({ ctx }: { ctx: Ctx }) {
  const device = ctx.device!;
  const action = useAction();
  const local = Object.keys(device.host?.agents || {});
  const agents = ctx.state.agents.filter((a) => local.includes(a.id));
  return (
    <>
      <Card title="This computer">
        <dl className="props wide">
          <dt>Name</dt><dd>{device.host?.name}</dd>
          <dt>Role</dt><dd>{device.mode === 'host' ? 'Hosts the space. Other devices connect to it.' : 'Member. Connects to the host computer.'}</dd>
          <dt>Connection</dt><dd className={device.host?.online ? 'good' : 'warn'}>{device.host?.online ? 'Connected' : 'Reconnecting'}</dd>
          <dt>Agents here</dt><dd>{agents.length}</dd>
        </dl>
      </Card>
      <Card title="Agents running on this computer">
        {!agents.length ? <p className="card-empty">None yet.</p> : (
          <ul className="list">
            {agents.map((a) => (
              <li key={a.id} className="clickable" onClick={() => ctx.go({ page: 'agent', id: a.id })}>
                <AgentAvatar agent={a} owner={ctx.state.people.find((p) => p.id === a.ownerId)} size={26} status={agentStatus(a)} />
                <span className="grow"><strong>{a.name}</strong><small>{device.host!.agents[a.id]?.repoPath || 'no repository'}</small></span>
                <span className="faint small">{a.runtime}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Startup">
        <div className="setting-row">
          <div className="grow"><strong>Startup animation</strong><p>The short Larp splash while the app starts. Follows your system's reduced-motion setting.</p></div>
          <button className={'switch' + (device.splash !== false ? ' on' : '')} role="switch" aria-checked={device.splash !== false} aria-label="Startup animation" disabled={action.busy}
            onClick={() => action.run(async () => ctx.setDevice(await window.larp!.setSplash({ enabled: device.splash === false })))}><i /></button>
        </div>
        <ErrorText error={action.error} />
      </Card>
    </>
  );
}

function NetworkTab({ ctx }: { ctx: Ctx }) {
  const device = ctx.device!;
  const action = useAction();
  return (
    <>
      <Card title="Network access">
        {device.mode === 'host' ? (
          <div className="setting-row">
            <div className="grow"><strong>Allow other devices on this network</strong><p>Teammates' computers and paired phones connect to this computer. Joining needs an invite or pairing code.</p></div>
            <button className={'switch' + (device.lan ? ' on' : '')} role="switch" aria-checked={device.lan} aria-label="Allow other devices" disabled={action.busy}
              onClick={() => action.run(async () => ctx.setDevice(await window.larp!.setLan({ lan: !device.lan })))}><i /></button>
          </div>
        ) : <p className="card-text">This computer connects to the space hosted at {device.url}.</p>}
        <ErrorText error={action.error} />
      </Card>
      <Card title="Addresses">
        <div className="form">{(device.urls.length ? device.urls : [device.url || '']).map((u) => <CopyValue key={u} value={u} />)}</div>
        <p className="notice">Connections are plain HTTP on your local network. Don't expose this port to the internet; use a private VPN for remote access.</p>
      </Card>
    </>
  );
}

function PhonesTab({ ctx }: { ctx: Ctx }) {
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null);
  const action = useAction();
  const address = (ctx.device?.urls || []).find((u) => !u.includes('127.0.0.1')) || ctx.device?.url || location.origin;
  return (
    <>
      <Card title="Pair a phone" action={<span className="faint small">{ctx.state.phones} paired</span>}>
        <p className="card-text">Your phone can approve requests for your agents, follow tasks, and use Plans, Money and Care. It can't act for anyone else.</p>
        {pair ? (
          <div className="pair-steps">
            <ol>
              <li>Connect your phone to the same network.</li>
              <li>Open this address in its browser:<CopyValue value={address} /></li>
              <li>Enter the code within 10 minutes:<CopyValue value={pair.code} large /></li>
            </ol>
            <button className="btn btn-sm" onClick={() => setPair(null)}>Done</button>
          </div>
        ) : <button className="btn btn-primary" disabled={action.busy} onClick={() => action.run(async () => setPair(await ctx.larp.act('POST', 'pair', {})))}><Smartphone size={15} /> Pair a new phone</button>}
        <ErrorText error={action.error} />
      </Card>
      <Card title="Paired phones">
        <div className="setting-row">
          <div className="grow"><strong>{ctx.state.phones} {ctx.state.phones === 1 ? 'phone' : 'phones'}</strong><p>Disconnecting signs every phone out immediately.</p></div>
          <button className="btn btn-danger btn-sm" disabled={!ctx.state.phones || action.busy} onClick={async () => { if (await confirmDialog({ title: 'Disconnect all your phones?', body: 'Every paired phone is signed out immediately. You can pair them again with a new code.', confirmLabel: 'Disconnect', danger: true })) action.run(() => ctx.larp.act('POST', 'devices/revoke', { kind: 'phone' })); }}>Disconnect all</button>
        </div>
      </Card>
    </>
  );
}

function AppearanceTab() {
  const { look, setLook } = useAppearance();
  return <Card title="Appearance"><Appearance look={look} setLook={setLook} /></Card>;
}

function AboutTab({ ctx }: { ctx: Ctx }) {
  return (
    <Card title="About Larp">
      <dl className="props wide">
        <dt>Version</dt><dd>0.4.0</dd>
        <dt>Signed in as</dt><dd>{ctx.state.me.name}</dd>
        <dt>Spaces</dt><dd>{ctx.state.spaces.length}</dd>
      </dl>
      <p className="card-text">Agents run on their owners' computers. The coordinator stores shared state only; private data and credentials never leave the computer they're on.</p>
    </Card>
  );
}

export { Field };
