// Larp · Skills marketplace: the skills directory, with search, filters, sorting and a detail sheet.
import '@fontsource/anton';
import '@fontsource/jetbrains-mono';
import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import './skills.css';
import { CRAFTS, SKILLS, fmtInstalls, type Craft, type Skill } from './catalog';

const grid = document.getElementById('grid')!, chips = document.getElementById('chips')!, q = document.getElementById('q') as HTMLInputElement;
const empty = document.getElementById('empty')!, sheet = document.getElementById('sheet') as HTMLDialogElement;
document.getElementById('count')!.textContent = String(SKILLS.length);
document.getElementById('heading-count')!.textContent = String(SKILLS.length);
q.placeholder = `Search ${SKILLS.length} skills`;
let craft: Craft | 'All' | 'Larp picks' = 'All';
let sort: 'pick' | 'installs' | 'name' = 'pick';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const filters: (Craft | 'All' | 'Larp picks')[] = ['All', 'Larp picks', ...CRAFTS];
const countFor = (c: (typeof filters)[number]) => (c === 'All' ? SKILLS.length : c === 'Larp picks' ? SKILLS.filter((s) => s.pick).length : SKILLS.filter((s) => s.craft === c).length);
chips.innerHTML = filters.map((c) => `<button data-craft="${c}" aria-pressed="${c === 'All'}">${c}<sup>${countFor(c)}</sup></button>`).join('');
chips.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  craft = b.dataset.craft as typeof craft;
  chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
});
document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) => b.addEventListener('click', () => {
  sort = b.dataset.sort as typeof sort;
  document.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
q.addEventListener('input', () => render());
addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); } });

function card(s: Skill) {
  const [owner, name] = s.repo.split('/');
  return `<li class="card${s.pick ? ' is-pick' : ''}" data-slug="${esc(s.slug)}" tabindex="0" role="button" aria-label="${esc(s.title)}: details">
    <div class="card-top"><span class="card-n">${String(s.n).padStart(2, '0')}</span>${s.pick ? '<span class="seal" title="Larp pick">選</span>' : ''}</div>
    <h3 class="card-name">${esc(s.title)}</h3>
    <p class="card-repo">${esc(owner)} / ${esc(name)}</p>
    <p class="card-desc">${esc(s.description || `A skill from ${s.repo}.`)}</p>
    <div class="card-foot"><span>${s.craft}</span><span>${fmtInstalls(s.installs)} installs</span></div>
  </li>`;
}

function render() {
  const term = q.value.trim().toLowerCase();
  let list = SKILLS.filter((s) => (craft === 'All' || (craft === 'Larp picks' ? s.pick : s.craft === craft))
    && (!term || `${s.title} ${s.name} ${s.description} ${s.repo} ${s.craft}`.toLowerCase().includes(term)));
  if (sort === 'installs') list = [...list].sort((a, b) => (b.installs || 0) - (a.installs || 0));
  if (sort === 'name') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  grid.innerHTML = list.map(card).join('');
  empty.hidden = list.length > 0;
  grid.querySelectorAll<HTMLElement>('.card').forEach((c) => {
    c.addEventListener('click', () => open(c.dataset.slug!));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.dataset.slug!); } });
  });
}
render();

function open(slug: string) {
  const s = SKILLS.find((x) => x.slug === slug)!;
  sheet.innerHTML = `
    <button class="sheet-x" aria-label="Close">×</button>
    <p class="sheet-n">N° ${String(s.n).padStart(2, '0')} · ${s.craft}${s.pick ? ' · <b>Larp pick</b>' : ''}</p>
    <h3 id="sheet-title">${esc(s.title)}</h3>
    <p class="sheet-repo">${esc(s.repo)} · ${fmtInstalls(s.installs)} installs</p>
    <p class="sheet-desc">${esc(s.description)}</p>
    <div class="sheet-fit"><span>In Larp</span>${esc(s.fit)}. Install it on the computer that runs the agent; the skill stays on that machine like everything else.</div>
    <div class="cmd"><code>${esc(s.install)}</code><button class="copy">Copy</button></div>
    <div class="sheet-links"><a href="${esc(s.url)}" target="_blank" rel="noopener">Skill source ↗</a><a href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener">GitHub ↗</a></div>`;
  sheet.showModal();
  sheet.querySelector('.sheet-x')!.addEventListener('click', () => sheet.close());
  const copy = sheet.querySelector('.copy') as HTMLButtonElement;
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(s.install); copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy'), 1600); });
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

