import { useState } from 'react';
import { Laptop, UserPlus } from 'lucide-react';
import type { Ctx } from '../route';
import { AgentAvatar, Avatar, Card, CopyValue, ErrorText, Field, PageHeader, agentStatus, useAction } from '../ui';

export function People({ ctx }: { ctx: Ctx }) {
  const { state, space, device } = ctx;
  const members = state.people.filter((p) => space.memberIds.includes(p.id));
  return (
    <div className="page">
      <PageHeader title="People" subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${space.name}. Each person controls their own agents and private data.`} />
      <div className="columns">
        <div className="col-main">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>Agents</th><th>Computers</th><th className="num">Tasks</th></tr></thead>
              <tbody>
                {members.map((p) => {
                  const agents = state.agents.filter((a) => a.ownerId === p.id && a.spaceIds.includes(space.id));
                  const hosts = state.hosts.filter((h) => h.ownerId === p.id || agents.some((a) => a.hostId === h.id));
                  const tasks = state.tasks.filter((t) => t.spaceId === space.id && (t.createdBy === p.id || t.ownerId === p.id)).length;
                  return (
                    <tr key={p.id}>
                      <td><span className="cell-person"><Avatar person={p} size={30} /><span><strong>{p.name}{p.id === state.me.id && <span className="faint"> (you)</span>}</strong></span></span></td>
                      <td>
                        {agents.length ? <span className="agent-chips">{agents.map((a) => <button key={a.id} className="agent-chip" onClick={() => ctx.go({ page: 'agent', id: a.id })}><AgentAvatar agent={a} owner={p} size={20} status={agentStatus(a)} />{a.name}</button>)}</span> : <span className="faint">No agents</span>}
                      </td>
                      <td>{hosts.length ? hosts.map((h) => <span key={h.id} className="host-chip"><Laptop size={13} />{h.name}<i className={'conn-dot ' + (h.online ? 'on' : 'off')} /></span>) : <span className="faint">—</span>}</td>
                      <td className="num">{tasks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {device && device.people.length > 0 && <SharedComputer ctx={ctx} />}
        </div>
        <div className="col-side">
          <Invite ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

function Invite({ ctx }: { ctx: Ctx }) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const action = useAction();
  const addresses = (ctx.device?.urls || []).filter((u) => !u.includes('127.0.0.1'));
  const address = addresses[0] || ctx.device?.url || location.origin;
  return (
    <Card title={<><UserPlus size={15} /> Invite to {ctx.space.name}</>}>
      <p className="card-text">They open Larp on their computer, choose <strong>Join a space</strong>, and enter the address and code.</p>
      {invite ? (
        <div className="form">
          <Field label="Address"><CopyValue value={address} /></Field>
          <Field label="Invite code" hint={`Single use. Expires ${new Date(invite.expiresAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`}><CopyValue value={invite.code} large /></Field>
          <button className="btn btn-sm" onClick={() => setInvite(null)}>Done</button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={action.busy} onClick={() => action.run(async () => setInvite(await ctx.larp.act('POST', 'invites', { spaceId: ctx.space.id })))}>Create invite code</button>
      )}
      {ctx.device?.mode === 'host' && !ctx.device.lan && <p className="notice warn">Other computers can't reach this space until you allow network access in Settings → Network.</p>}
      <ErrorText error={action.error} />
    </Card>
  );
}

function SharedComputer({ ctx }: { ctx: Ctx }) {
  const device = ctx.device!;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <Card title="People on this computer" action={<span className="faint small">For a shared family laptop</span>}>
      <ul className="list">
        {device.people.map((p) => {
          const person = ctx.state.people.find((x) => x.id === p.id);
          return (
            <li key={p.id}>
              <Avatar person={person} size={26} />
              <span className="grow"><strong>{p.name}</strong></span>
              {p.id === device.activePersonId ? <span className="badge tone-good"><i />Signed in</span>
                : <button className="btn btn-sm" onClick={() => action.run(async () => ctx.setDevice(await window.larp!.switchPerson({ id: p.id })))}>Switch to {p.name}</button>}
            </li>
          );
        })}
      </ul>
      <p className="card-text">Add someone who shares this computer. They get their own agents, and approvals for their agents go to their own phone. Anyone using this computer can open their workspace.</p>
      <div className="inline-form">
        <input aria-label="Their name" placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Invite code" className="mono" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={!name || !code || action.busy} onClick={() => action.run(async () => { ctx.setDevice(await window.larp!.addPerson({ code, name })); setName(''); setCode(''); })}>Add person</button>
      </div>
      <ErrorText error={action.error} />
    </Card>
  );
}
