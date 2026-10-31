import { Coins, Copy, FileCheck2, Moon, Sparkles } from 'lucide-react';
import type { Ctx } from '../route';
import type { MemoryView } from '../types';
import { AgentAvatar, Avatar, ErrorText, timeAgo, useAction } from '../ui';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/**
 * The three Meko features beyond recall: who gets credit for the tokens memory saves, what each agent
 * tidied while it slept, and the proof locker of results kept as Meko artifacts.
 */
export function MemoryExtras({ ctx, memory }: { ctx: Ctx; memory: MemoryView }) {
  const { state, space } = ctx;
  const action = useAction();
  const agents = state.agents.filter((a) => a.spaceIds.includes(space.id));
  const who = (key: string) => {
    if (key.startsWith('agent:')) { const a = state.agents.find((x) => x.id === key.slice(6)); return { name: a?.name || 'An agent', avatar: a ? <AgentAvatar agent={a} owner={state.people.find((p) => p.id === a.ownerId)} size={26} /> : null }; }
    const p = state.people.find((x) => x.id === key.slice(7));
    return { name: p?.name || 'Someone', avatar: <Avatar person={p} size={26} /> };
  };
  const ledger = Object.entries(memory.royalties || {}).sort((a, b) => b[1].saved - a[1].saved);
  const top = ledger.flatMap(([key, r]) => Object.entries(r.items).map(([id, it]) => ({ id, key, ...it }))).sort((a, b) => b.saved - a.saved).slice(0, 4);
  const proofs = (memory.proofs || []).filter((p) => state.tasks.some((t) => t.id === p.taskId && t.spaceId === space.id));

  return (
    <div className="memory-columns extras">
      <section className="card royalties">
        <h3><Coins size={14} /> Knowledge royalties</h3>
        <p className="faint small">Meko reports how many tokens each recall saved. Larp credits whoever's memory did the saving, when <em>someone else's</em> agent reuses it.</p>
        {!ledger.length ? <p className="faint small empty-line">No reuse yet. Lessons and hand-off notes earn credit the first time another agent recalls them.</p> : (
          <ol className="royalty-list">
            {ledger.map(([key, r], i) => {
              const w = who(key);
              const max = ledger[0][1].saved || 1;
              return (
                <li key={key}>
                  <span className="rank mono">{i + 1}</span>
                  {w.avatar}
                  <div className="grow">
                    <strong>{w.name}</strong>
                    <span className="royalty-bar"><i style={{ width: `${Math.max(4, (r.saved / max) * 100)}%` }} /></span>
                    <small className="faint">reused {r.reuses}× by {Object.keys(r.beneficiaries).length} other agent{Object.keys(r.beneficiaries).length === 1 ? '' : 's'}</small>
                  </div>
                  <span className="royalty-saved mono">{fmt(r.saved)}<small>tokens</small></span>
                </li>
              );
            })}
          </ol>
        )}
        {top.length > 0 && (
          <>
            <p className="extras-sub">Most valuable memories</p>
            <ul className="valuable">
              {top.map((t) => <li key={t.id}><p>“{t.text}”</p><small className="faint">{who(t.key).name} · saved {fmt(t.saved)} tokens over {t.reuses} reuse{t.reuses === 1 ? '' : 's'}</small></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card sleep">
        <div className="extras-head">
          <h3><Moon size={14} /> While they slept</h3>
          <button className="btn btn-sm" disabled={!memory.on || action.busy} onClick={() => action.run(() => ctx.larp.act('POST', 'memory/sleep', {}))}>Sleep now</button>
        </div>
        <p className="faint small">Every night around 3 a.m. each agent reviews its Meko datapack: it merges duplicates, forgets stale hand-off notes and suggests lessons. Suggestions are only shared if you approve them.</p>
        <ul className="sleep-list">
          {agents.map((a) => {
            const d = memory.sleep?.[a.id];
            return (
              <li key={a.id}>
                <div className="sleep-row">
                  <AgentAvatar agent={a} owner={state.people.find((p) => p.id === a.ownerId)} size={26} />
                  <div className="grow"><strong>{a.name}</strong><small className="faint">{d ? `slept ${timeAgo(d.at)} · reviewed ${d.reviewed}` : 'has not slept yet'}</small></div>
                  {d && <span className="sleep-chips"><span title="merged duplicates">⇄ {d.merged.length}</span><span title="forgotten">✕ {d.forgot.length}</span><span title="suggested lessons">✦ {d.suggest.length}</span></span>}
                </div>
                {d?.suggest.map((s) => (
                  <div key={s.memoryId} className="sleep-suggest">
                    <Sparkles size={12} /><p className="grow">“{s.text}” <small className="faint">recalled {s.uses}×</small></p>
                    <button className="btn btn-sm" disabled={action.busy || !memory.on} onClick={() => action.run(() => ctx.larp.act('POST', 'lessons', { spaceId: space.id, text: s.text }))}>Share as lesson</button>
                  </div>
                ))}
                {d && d.forgot.length > 0 && <details className="sleep-details"><summary>What {a.name} forgot</summary><ul>{d.forgot.map((f) => <li key={f.id}>{f.text} <small className="faint">({f.reason})</small></li>)}</ul></details>}
              </li>
            );
          })}
        </ul>
        <ErrorText error={action.error} />
      </section>

      <section className="card proofs">
        <h3><FileCheck2 size={14} /> Proof locker</h3>
        <p className="faint small">Every result's diff is a Meko artifact, stored by its content. When an agent produces a change someone already made, Meko returns the first proof, so Larp can say so.</p>
        {!proofs.length ? <p className="faint small empty-line">Proofs appear here as agents finish work.</p> : (
          <ul className="proof-list">
            {proofs.map((p) => {
              const a = state.agents.find((x) => x.id === p.agentId);
              const first = p.duplicateOf ? state.tasks.find((t) => t.id === p.duplicateOf) : null;
              return (
                <li key={p.taskId} onClick={() => ctx.go({ page: 'task', id: p.taskId })}>
                  <span className={'proof-dot ' + (p.duplicateOf ? 'dup' : p.check === false ? 'bad' : 'ok')} />
                  <div className="grow">
                    <strong>{p.title}</strong>
                    <small className="faint">{a?.name} · <span className="mono">{p.hash?.slice(0, 10)}</span> · {timeAgo(p.at)}{p.check !== null ? ` · check ${p.check ? 'passed' : 'failed'}` : ''}</small>
                    {p.duplicateOf && <small className="dup-line"><Copy size={11} /> identical to {first ? `“${first.title}”` : 'an earlier result'}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="faint small store-line">Datapack <span className="mono">{memory.packs.proofs || '—'}</span></p>
      </section>
    </div>
  );
}
