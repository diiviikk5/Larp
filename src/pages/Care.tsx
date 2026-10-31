import { useState } from 'react';
import { Check, ClipboardList, Plus } from 'lucide-react';
import type { Ctx } from '../route';
import type { Checklist } from '../types';
import { Avatar, EmptyState, ErrorText, Field, PageHeader, Sheet, useAction } from '../ui';

export function Care({ ctx, id }: { ctx: Ctx; id?: string }) {
  const { state, space, go } = ctx;
  const [creating, setCreating] = useState(false);
  const lists = state.checklists.filter((c) => c.spaceId === space.id);
  const selected = lists.find((c) => c.id === id) || lists[0];

  return (
    <div className="page wide">
      <PageHeader title="Care" subtitle="Checklists for appointments and errands: who brings what, who drives. Keep medical details out; this is for coordinating people."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New checklist</button>} />
      {!lists.length ? (
        <EmptyState pose="idle" title="No checklists yet" action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New checklist</button>}>
          Make a list for a clinic visit or a family errand, and let everyone claim the parts they'll handle.
        </EmptyState>
      ) : (
        <div className="split">
          <aside className="split-list">
            {lists.map((c) => {
              const done = c.items.filter((i) => i.done).length;
              const unowned = c.items.filter((i) => !i.ownerId).length;
              return (
                <button key={c.id} className={'list-item' + (selected?.id === c.id ? ' active' : '')} onClick={() => go({ page: 'care', id: c.id })}>
                  <span className="list-item-icon"><ClipboardList size={15} /></span>
                  <span className="grow"><strong>{c.title}</strong><small>{done}/{c.items.length} done{unowned ? ` · ${unowned} unclaimed` : ''}</small>
                    <span className="mini-progress"><i style={{ width: `${(done / Math.max(1, c.items.length)) * 100}%` }} /></span></span>
                </button>
              );
            })}
          </aside>
          <section className="split-main">{selected && <ChecklistView ctx={ctx} list={selected} />}</section>
        </div>
      )}
      {creating && <NewChecklist ctx={ctx} onClose={() => setCreating(false)} onCreated={(cid) => { setCreating(false); go({ page: 'care', id: cid }); }} />}
    </div>
  );
}

function ChecklistView({ ctx, list }: { ctx: Ctx; list: Checklist }) {
  const { state, space } = ctx;
  const action = useAction();
  const members = state.people.filter((p) => space.memberIds.includes(p.id));
  const done = list.items.filter((i) => i.done).length;
  const unowned = list.items.filter((i) => !i.ownerId).length;
  const update = (itemId: string, body: object) => action.run(() => ctx.larp.act('POST', `checklists/${list.id}/items/${itemId}`, body));
  return (
    <div className="panel">
      <div className="panel-head">
        <div><h2>{list.title}</h2><p className="faint">{done} of {list.items.length} done{unowned ? ` · ${unowned} still need someone` : ' · everything has an owner'}</p></div>
        <span className={'badge ' + (unowned ? 'tone-warn' : 'tone-good')}><i />{unowned ? `${unowned} unclaimed` : 'All claimed'}</span>
      </div>
      <div className="progress big"><i style={{ width: `${(done / Math.max(1, list.items.length)) * 100}%` }} /></div>
      <ul className="checklist">
        {list.items.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <button className={'checkbox' + (item.done ? ' on' : '')} role="checkbox" aria-checked={item.done} aria-label={item.text} onClick={() => update(item.id, { done: !item.done })}>{item.done && <Check size={12} strokeWidth={3} />}</button>
            <span className="grow item-text">{item.text}</span>
            {item.ownerId ? (
              <select aria-label={`Owner of ${item.text}`} className="select-sm owner-select" value={item.ownerId} onChange={(e) => update(item.id, { ownerId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.id === state.me.id ? 'You' : m.name}</option>)}
              </select>
            ) : <button className="btn btn-sm" onClick={() => update(item.id, { take: true })}>I'll take it</button>}
            {item.ownerId && <Avatar person={members.find((m) => m.id === item.ownerId)} size={22} />}
          </li>
        ))}
      </ul>
      <ErrorText error={action.error} />
    </div>
  );
}

function NewChecklist({ ctx, onClose, onCreated }: { ctx: Ctx; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const action = useAction();
  const count = items.split('\n').filter((l) => l.trim()).length;
  return (
    <Sheet title="New checklist" subtitle={ctx.space.name} onClose={onClose} width={480}
      footer={<><span className="grow" /><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!title.trim() || !count || action.busy} onClick={() => action.run(async () => onCreated((await ctx.larp.act('POST', 'checklists', { spaceId: ctx.space.id, title, items: items.split('\n') })).id))}>Create checklist</button></>}>
      <div className="form">
        <Field label="Title" htmlFor="chk-title"><input id="chk-title" autoFocus placeholder="Clinic visit on Friday" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Items" htmlFor="chk-items" hint={`One per line · ${count} item${count === 1 ? '' : 's'}`}>
          <textarea id="chk-items" rows={8} placeholder={'Insurance card\nPrevious reports\nDrive to the clinic\nPick up prescription'} value={items} onChange={(e) => setItems(e.target.value)} />
        </Field>
        <ErrorText error={action.error} />
      </div>
    </Sheet>
  );
}
