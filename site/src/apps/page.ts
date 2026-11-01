// Larp · Apps: each app in a browser-window box. If it is running on this computer the box embeds it live;
// otherwise it shows a screenshot that turns into the app's inside view on hover. Click to open.
import '@fontsource/anton';
import '@fontsource/jetbrains-mono';
import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '../skills/skills.css';
import './apps.css';
import { APPS, BUILT_IN, type App } from './apps';

// Apps hosted on this site (a demo copy of the ones built into Larp) open at their index page.
const open = (a: App) => (a.url.startsWith('/') ? `${a.url}/index.html` : a.url);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const featured = document.getElementById('featured')!;
const sheet = document.getElementById('sheet') as HTMLDialogElement;

featured.innerHTML = APPS.map((a, i) => `
  <article class="app" data-id="${a.id}" style="--accent:${a.accent}">
    <a class="app-window" href="${open(a)}" target="_blank" rel="noopener" aria-label="Open ${esc(a.name)}">
      <div class="app-bar">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="app-url">${esc(a.url.replace(/^https?:\/\//, ''))}</span>
        <span class="app-state" data-state="checking"><b></b><em>checking</em></span>
      </div>
      <div class="app-screen">
        <img class="shot shot-hero" src="${a.shot}" alt="${esc(a.name)}: landing page" loading="lazy" />
        <img class="shot shot-inside" src="${a.inside}" alt="" loading="lazy" />
        <div class="live" hidden></div>
        <span class="app-open">Open ${esc(a.name)} ↗</span>
      </div>
    </a>
    <div class="app-info">
      <div class="app-title">
        <span class="app-n">${String(i + 1).padStart(2, '0')}</span>
        <h2>${esc(a.name)}${a.script ? ` <span class="script">${a.script}</span>` : ''}</h2>
        <span class="app-kind">${esc(a.kind)}</span>
      </div>
      <p class="app-tagline">${esc(a.tagline)}</p>
      <p class="app-desc">${esc(a.description)}</p>
      <ul class="app-tags">${a.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="app-actions">
        <a class="btn-ink" href="${open(a)}" target="_blank" rel="noopener">Open app ↗</a>
        <button class="btn-line" data-run="${a.id}">How to run</button>
        ${a.source ? `<a class="btn-line" href="${a.source}" target="_blank" rel="noopener">Source ↗</a>` : ''}
        <span class="app-ep">${a.endpoints} Larp endpoints</span>
      </div>
    </div>
  </article>`).join('');

const ICON: Record<string, string> = {
  plans: '<rect x="8" y="12" width="48" height="42" rx="6"/><path d="M8 24h48M20 6v12M44 6v12"/><circle cx="24" cy="36" r="3" fill="currentColor"/><circle cx="40" cy="44" r="3" fill="currentColor"/>',
  money: '<circle cx="24" cy="32" r="14"/><circle cx="40" cy="32" r="14"/><path d="M32 22v20"/>',
  care: '<path d="M32 52S10 39 10 24a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 15-22 28-22 28z"/><path d="M24 30h16M32 22v16"/>',
  memory: '<circle cx="32" cy="32" r="20"/><path d="M32 12v40M12 32h40"/><circle cx="32" cy="32" r="8"/>',
};
document.getElementById('builtin')!.innerHTML = BUILT_IN.map((b) => `
  <li class="bi">
    <span class="card-ink" aria-hidden="true"></span>
    <svg viewBox="0 0 64 64" class="bi-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[b.id]}</svg>
    <h3>${esc(b.name)}</h3>
    <p>${esc(b.text)}</p>
    <span class="bi-foot">${esc(b.kind)} · inside Larp</span>
  </li>`).join('');
document.querySelectorAll<HTMLElement>('.bi').forEach((c) => c.addEventListener('pointermove', (e) => {
  const r = c.getBoundingClientRect(); c.style.setProperty('--x', `${e.clientX - r.left}px`); c.style.setProperty('--y', `${e.clientY - r.top}px`);
}));

// Is the app running on this computer? A no-cors request resolves only if something answers.
async function running(a: App) {
  if (!a.url.includes('localhost')) return true;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
  try { await fetch(`${a.url}/api/health`, { mode: 'no-cors', signal: ctl.signal }); return true; } catch { return false; } finally { clearTimeout(t); }
}

for (const a of APPS) {
  const card = featured.querySelector<HTMLElement>(`[data-id="${a.id}"]`)!;
  const state = card.querySelector<HTMLElement>('.app-state')!;
  running(a).then((up) => {
    state.dataset.state = up ? 'live' : 'off';
    // From a public https page the browser won't reach localhost, so "not reachable" isn't "not running".
    state.querySelector('em')!.textContent = up ? (a.url.includes('localhost') ? 'running here' : 'browser demo') : 'runs on your computer';
    if (!up) {
      // Not running: clicking explains how to start it instead of opening a dead tab.
      card.querySelectorAll<HTMLAnchorElement>(`a[href="${open(a)}"]`).forEach((l) => l.addEventListener('click', (e) => { e.preventDefault(); showRun(a); }));
      return;
    }
    const live = card.querySelector<HTMLElement>('.live')!;
    live.innerHTML = `<iframe src="${open(a)}" title="${esc(a.name)}, live" loading="lazy" tabindex="-1"></iframe>`;
    live.hidden = false;
    const iframe = live.querySelector('iframe')!;
    iframe.addEventListener('load', () => card.classList.add('is-live'));
    // Render the app at desktop size and scale it down to fit the box.
    const fit = () => { const w = live.clientWidth; iframe.style.transform = `scale(${w / 1440})`; };
    new ResizeObserver(fit).observe(live); fit();
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) => b.addEventListener('click', () => showRun(APPS.find((a) => a.id === b.dataset.run)!)));

function showRun(a: App) {
  sheet.innerHTML = `
    <button class="sheet-x" aria-label="Close">×</button>
    <p class="sheet-n">${esc(a.kind)} · runs on your computer</p>
    <h3 id="sheet-title">${esc(a.name)}</h3>
    <p class="sheet-desc">${esc(a.name)} has a browser demo with fictional sample data and browser-local edits. Use the desktop version for agent integration. Browser demo: <b>${esc(a.url.replace('http://', ''))}</b>.</p>
    <div class="cmd"><code>${esc(a.run)}</code><button class="copy">Copy</button></div>
    <div class="sheet-fit"><span>With Larp</span>Use ${esc(a.name)} inside the desktop app for agent integration. Browser demo data stays separate. Larp's agents can then use its ${a.endpoints} endpoints, and still ask before sharing anything.</div>
    <div class="sheet-links"><a href="${open(a)}" target="_blank" rel="noopener">Open ${esc(a.name)} ↗</a>${a.source ? `<a href="${a.source}" target="_blank" rel="noopener">Source ↗</a>` : ''}</div>`;
  sheet.showModal();
  sheet.querySelector('.sheet-x')!.addEventListener('click', () => sheet.close());
  const copy = sheet.querySelector('.copy') as HTMLButtonElement;
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(a.run); copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy'), 1600); });
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
