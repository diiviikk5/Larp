import { useState } from 'react';
import { ArrowRight, Plus, Trash2, Wallet } from 'lucide-react';
import type { Ctx } from '../route';
import { confirmDialog } from '../feedback';
import { Avatar, Card, EmptyState, ErrorText, Field, PageHeader, Sheet, Stat, timeAgo, useAction } from '../ui';

const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function Money({ ctx }: { ctx: Ctx }) {
  const { state, space } = ctx;
  const [adding, setAdding] = useState(false);
  const action = useAction();
  const members = state.people.filter((p) => space.memberIds.includes(p.id));
  const expenses = state.expenses.filter((e) => e.spaceId === space.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const settle = state.settlements[space.id] || { balance: {}, transfers: [] };
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paid = expenses.filter((e) => e.paidBy === state.me.id).reduce((s, e) => s + e.amount, 0);
  const mine = settle.balance[state.me.id] || 0;
  const maxAbs = Math.max(1, ...members.map((m) => Math.abs(settle.balance[m.id] || 0)));
  const name = (id: string) => (id === state.me.id ? 'You' : state.people.find((p) => p.id === id)?.name || '?');

  return (
    <div className="page">
      <PageHeader title="Money" subtitle="Shared expenses and who owes whom. Larp keeps the record and works out the fewest payments; it never moves money."
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add expense</button>} />

      {!expenses.length ? (
        <EmptyState pose="idle" title="No expenses yet" action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add expense</button>}>
          Record who paid for what and how it's split. Everyone in {space.name} sees the same ledger.
        </EmptyState>
      ) : (
        <>
          <div className="stats">
            <Stat label="Total spent" value={inr(total)} hint={`${expenses.length} expenses`} />
            <Stat label="You paid" value={inr(paid)} />
            <Stat label="Your balance" value={Math.abs(mine) < 0.01 ? inr(0) : `${mine > 0 ? '+' : '−'}${inr(mine)}`} hint={Math.abs(mine) < 0.01 ? 'You’re even' : mine > 0 ? 'Others owe you' : 'You owe others'} tone={Math.abs(mine) < 0.01 ? undefined : mine > 0 ? 'good' : 'bad'} />
            <Stat label="Payments to settle" value={settle.transfers.length} />
          </div>
          <div className="columns">
            <div className="col-main">
              <Card title="Expenses">
                <table className="table compact">
                  <thead><tr><th>Description</th><th>Paid by</th><th>Split</th><th className="num">Amount</th><th className="num">When</th><th /></tr></thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td><strong>{e.description}</strong></td>
                        <td><span className="cell-person"><Avatar person={state.people.find((p) => p.id === e.paidBy)} size={20} />{name(e.paidBy)}</span></td>
                        <td><span className="avatar-stack small">{e.splitAmong.map((id) => <Avatar key={id} person={state.people.find((p) => p.id === id)} size={20} />)}</span><span className="faint small"> {inr(e.amount / e.splitAmong.length)} each</span></td>
                        <td className="num mono">{inr(e.amount)}</td>
                        <td className="num faint">{timeAgo(e.createdAt)}</td>
                        <td className="num"><button className="btn-icon" aria-label={`Remove ${e.description}`} disabled={action.busy} onClick={async () => { if (await confirmDialog({ title: `Remove "${e.description}"?`, body: 'Balances and settle-up will be recalculated for everyone.', confirmLabel: 'Remove', danger: true })) action.run(() => ctx.larp.act('DELETE', `expenses/${e.id}`)); }}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ErrorText error={action.error} />
              </Card>
            </div>
            <div className="col-side">
              <Card title="Settle up">
                {!settle.transfers.length ? <p className="card-empty">Everyone is even.</p> : (
                  <ul className="list">
                    {settle.transfers.map((t, i) => (
                      <li key={i}>
                        <Avatar person={state.people.find((p) => p.id === t.from)} size={24} />
                        <ArrowRight size={14} className="faint" />
                        <Avatar person={state.people.find((p) => p.id === t.to)} size={24} />
                        <span className="grow small">{name(t.from)} pays {name(t.to)}</span>
                        <strong className="mono">{inr(t.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Balances">
                <ul className="balances">
                  {members.map((m) => {
                    const b = settle.balance[m.id] || 0;
                    return (
                      <li key={m.id}>
                        <span className="balance-name"><Avatar person={m} size={20} />{name(m.id)}</span>
                        <div className="balance-bar">
                          <i className={b >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(b) / maxAbs) * 50}%` }} />
                        </div>
                        <span className={'mono small ' + (b > 0.01 ? 'good' : b < -0.01 ? 'bad' : 'faint')}>{b > 0.01 ? '+' : b < -0.01 ? '−' : ''}{inr(b)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
      {adding && <AddExpense ctx={ctx} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddExpense({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const { state, space } = ctx;
  const members = state.people.filter((p) => space.memberIds.includes(p.id));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(state.me.id);
  const [split, setSplit] = useState<string[]>(space.memberIds);
  const action = useAction();
  const value = Number(amount);
  return (
    <Sheet title="Add expense" subtitle={space.name} onClose={onClose} width={480}
      footer={<><span className="grow" /><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!description.trim() || !value || !split.length || action.busy}
          onClick={async () => { if (await action.run(() => ctx.larp.act('POST', 'expenses', { spaceId: space.id, description, amount: value, paidBy, splitAmong: split }))) onClose(); }}>Add expense</button></>}>
      <div className="form">
        <Field label="What was it for?" htmlFor="exp-desc"><input id="exp-desc" autoFocus placeholder="Groceries" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Amount (₹)" htmlFor="exp-amount"><input id="exp-amount" className="mono amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <Field label="Paid by"><div className="segmented">{members.map((m) => <button key={m.id} aria-pressed={paidBy === m.id} onClick={() => setPaidBy(m.id)}>{m.id === state.me.id ? 'You' : m.name}</button>)}</div></Field>
        <Field label="Split between" hint={split.length && value ? `₹${(value / split.length).toLocaleString('en-IN', { maximumFractionDigits: 2 })} each` : undefined}>
          <div className="check-list">
            {members.map((m) => (
              <label key={m.id} className="check-row">
                <input type="checkbox" checked={split.includes(m.id)} onChange={() => setSplit((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} />
                <Avatar person={m} size={22} /><span className="grow">{m.id === state.me.id ? 'You' : m.name}</span>
              </label>
            ))}
          </div>
        </Field>
        <ErrorText error={action.error} />
      </div>
    </Sheet>
  );
}
