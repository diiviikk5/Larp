import { useEffect, useState } from 'react';

const PRESETS: { id: string; label: string }[] = [
  { id: 'System', label: 'System' },
  { id: 'Ink', label: 'Dark' },
  { id: 'Paper', label: 'Light' },
  { id: 'Graphite', label: 'Graphite' },
  { id: 'Catppuccin', label: 'Catppuccin' },
  { id: 'Nord', label: 'Nord' },
  { id: 'Rose pine', label: 'Rosé Pine' },
  { id: 'Terminal', label: 'Terminal' },
  { id: 'Piixpal', label: 'Piixpal' },
  { id: 'Ocean', label: 'Ocean' },
];
const ACCENTS = ['default', '#d97757', '#6e9fff', '#5fbf8a', '#c792ea', '#e0b44c'];

export type Look = { preset: string; accent: string; background: string; density: string; size: number; pal: string; hue: number; scale: number };
const defaults: Look = { preset: 'System', accent: 'default', background: 'None', density: 'Comfortable', size: 13.5, pal: 'None', hue: 0, scale: 3 };

function read(): Look {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('larp.look') || '{}') }; } catch { return defaults; }
}

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function useAppearance() {
  const [look, setLookState] = useState<Look>(read);
  // Several components read the look (the shell mounts Ocean mode, Settings edits it), so a change
  // anywhere is broadcast and every copy follows.
  const setLook = (next: Look) => { setLookState(next); window.dispatchEvent(new CustomEvent('larp:look', { detail: next })); };
  useEffect(() => {
    const onLook = (e: Event) => { const next = (e as CustomEvent<Look>).detail; setLookState((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next)); };
    window.addEventListener('larp:look', onLook);
    return () => window.removeEventListener('larp:look', onLook);
  }, []);
  const [systemDark, setSystemDark] = useState(prefersDark);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.preset = look.preset === 'System' ? (systemDark ? 'Ink' : 'Paper') : look.preset;
    root.dataset.texture = look.background;
    root.dataset.density = look.density;
    root.style.setProperty('--ui-size', `${look.size}px`);
    for (const v of ['--accent', '--accent-hover', '--accent-text', '--accent-soft', '--on-accent']) root.style.removeProperty(v);
    if (look.accent !== 'default') {
      root.style.setProperty('--accent', look.accent);
      root.style.setProperty('--accent-hover', look.accent);
      root.style.setProperty('--accent-text', look.accent);
      root.style.setProperty('--accent-soft', `color-mix(in srgb, ${look.accent} 16%, transparent)`);
      root.style.setProperty('--on-accent', '#ffffff');
    }
    localStorage.setItem('larp.look', JSON.stringify(look));
  }, [look, systemDark]);
  return { look, setLook };
}

export function Appearance({ look, setLook }: { look: Look; setLook: (v: Look) => void }) {
  return (
    <div className="appearance">
      <p className="settings-intro">Changes apply instantly and stay on this device.</p>
      <label>Theme</label>
      <div className="theme-grid">
        {PRESETS.map((p) => (
          <button key={p.id} aria-pressed={look.preset === p.id} className={'theme-tile' + (look.preset === p.id ? ' chosen' : '')}
            onClick={() => setLook({ ...look, preset: p.id, ...(p.id === 'Piixpal' ? { background: 'Dots', pal: look.pal === 'None' ? 'moss' : look.pal } : {}) })}>
            <span className={'palette palette-' + p.id.toLowerCase().replace(' ', '-')}><i /><i /><i /></span>{p.label}
          </button>
        ))}
      </div>
      <label>Accent</label>
      <div className="swatches">
        {ACCENTS.map((c) => (
          <button key={c} aria-label={c === 'default' ? 'Monochrome accent' : `Accent ${c}`} aria-pressed={look.accent === c} className={look.accent === c ? 'chosen' : ''}
            style={{ background: c === 'default' ? 'linear-gradient(135deg, var(--text) 50%, var(--bg) 50%)' : c }} onClick={() => setLook({ ...look, accent: c })} />
        ))}
      </div>
      <label>Background</label>
      <div className="segments">{['None', 'Dots', 'Grid', 'Aurora'].map((b) => <button key={b} aria-pressed={look.background === b} onClick={() => setLook({ ...look, background: b })}>{b}</button>)}</div>
      <label>Density</label>
      <div className="segments">{['Comfortable', 'Compact'].map((d) => <button key={d} aria-pressed={look.density === d} onClick={() => setLook({ ...look, density: d })}>{d}</button>)}</div>
      <label htmlFor="text-size">Text size <span>{look.size}px</span></label>
      <input id="text-size" type="range" min="12" max="16" step="0.5" value={look.size} onChange={(e) => setLook({ ...look, size: Number(e.target.value) })} />
      <div className="piix-lab">
        <div className="piix-lab-heading"><span>Piixpal companion</span><small>An optional pixel pal that sits on your screen</small></div>
        <label>Pal</label>
        <div className="segments">{['None', 'moss', 'bitbug', 'pip', 'boing'].map((p) => <button key={p} aria-pressed={look.pal === p} onClick={() => setLook({ ...look, pal: p })}>{p}</button>)}</div>
        {look.pal !== 'None' && (
          <>
            <label htmlFor="pal-hue">Color <span>{look.hue}°</span></label>
            <input id="pal-hue" type="range" min="0" max="360" value={look.hue} onChange={(e) => setLook({ ...look, hue: Number(e.target.value) })} />
            <label htmlFor="pal-scale">Pixel size <span>{look.scale}×</span></label>
            <input id="pal-scale" type="range" min="2" max="5" value={look.scale} onChange={(e) => setLook({ ...look, scale: Number(e.target.value) })} />
          </>
        )}
        <p>Decorative only. It never indicates that an agent is working.</p>
      </div>
      <button className="theme-button" onClick={() => setLook(defaults)}>Reset appearance</button>
    </div>
  );
}
