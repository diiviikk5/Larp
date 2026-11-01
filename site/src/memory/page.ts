// Larp · Memory, live: counts from Larp Cloud's /api/live (Meko calls logged in YugabyteDB).
import '@fontsource/anton';
import '@fontsource/jetbrains-mono';
import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '../skills/skills.css';
import './memory.css';

type Live = {
  database: string; teams: number; events: number; calls: number; ok: number; saved: number; avg_ms: number; last_at: string | null;
  kinds: { kind: string; n: number }[]; days: { day: string; n: number }[];
  recent: { at: string; tool: string; kind: string; ok: boolean; ms: number | null; result_count: number | null }[];
};

const KIND: Record<string, string> = { recall: 'Recalls', write: 'Memories written', promote: 'Lessons promoted', proof: 'Proofs stored', review: 'Nightly reviews', correct: 'Corrections', forget: 'Forgotten', setup: 'Setup' };
const root = document.getElementById('live')!;
const n = (v: number) => v.toLocaleString('en-IN');
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

function render(d: Live) {
  const max = Math.max(1, ...d.days.map((x) => x.n));
  root.innerHTML = `
    <div class="mem-big">
      <div><b>${n(d.calls)}</b><span>Meko calls</span></div>
      <div><b>${n(d.teams)}</b><span>Larp teams</span></div>
      <div><b>${n(d.saved)}</b><span>Tokens saved by recall</span></div>
      <div><b>${d.calls ? Math.round((d.ok / d.calls) * 100) : 100}%</b><span>Succeeded · ${n(d.avg_ms)} ms avg</span></div>
    </div>
    <div class="mem-grid">
      <div class="mem-card">
        <p class="dir-kicker">What agents did</p>
        <ul class="mem-kinds">${d.kinds.map((k) => `<li><span>${KIND[k.kind] || k.kind}</span><b>${n(k.n)}</b></li>`).join('') || '<li><span>Nothing yet</span></li>'}</ul>
      </div>
      <div class="mem-card">
        <p class="dir-kicker">Last 14 days</p>
        <div class="mem-days">${d.days.map((x) => `<i style="--h:${(x.n / max) * 100}%" title="${x.day}: ${x.n} calls"></i>`).join('') || '<em>No calls yet</em>'}</div>
      </div>
      <div class="mem-card mem-feed">
        <p class="dir-kicker">Latest calls</p>
        <ol>${d.recent.map((c) => `<li class="${c.ok ? '' : 'bad'}"><code>${c.tool}</code><span>${KIND[c.kind] || c.kind}${c.result_count != null ? ` · ${c.result_count} found` : ''}</span><time>${c.ms ?? '–'} ms · ${ago(c.at)}</time></li>`).join('') || '<li><span>Waiting for the first call</span></li>'}</ol>
      </div>
    </div>
    <p class="mem-src">Stored in ${d.database} · ${n(d.events)} events${d.last_at ? ` · last call ${ago(d.last_at)}` : ''}</p>`;
}

async function refresh() {
  try {
    const r = await fetch('/api/live', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    render(await r.json());
  } catch {
    if (!root.querySelector('.mem-big')) root.innerHTML = '<p class="mem-wait">Larp Cloud is not answering right now. Try again in a minute.</p>';
  }
}
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 10_000);
