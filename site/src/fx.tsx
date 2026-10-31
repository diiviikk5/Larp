// Motion for the page's type and controls. Everything degrades to plain text under reduced motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]{}#*+=-_';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animate `el` from its current text to `target`, resolving left to right through random glyphs. */
function scrambleTo(el: HTMLElement, target: string, duration = 900) {
  if (reduced()) { el.textContent = target; return () => {}; }
  const from = el.textContent || '';
  const len = Math.max(from.length, target.length);
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    let out = '';
    for (let i = 0; i < len; i++) {
      const settle = i / len * 0.7 + 0.3;
      const ch = target[i] ?? '';
      if (p >= settle || ch === ' ' || ch === '.') out += ch;
      else if (p > settle - 0.35) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += from[i] ?? '';
    }
    el.textContent = out;
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** A line that decodes in, then cycles through phrases. */
export function DecodeCycle({ phrases, interval = 4200, className }: { phrases: string[]; interval?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.textContent = '';
    let i = 0;
    let stop = scrambleTo(el, phrases[0], 1400);
    const timer = setInterval(() => {
      i = (i + 1) % phrases.length;
      stop();
      stop = scrambleTo(el, phrases[i], 1100);
    }, interval);
    return () => { stop(); clearInterval(timer); };
  }, [phrases.join('|'), interval]);
  return <span ref={ref} className={className} aria-label={phrases[0]} />;
}

/** A link whose label scrambles and re-forms on hover. */
export function ScrambleLink({ href, children, className }: { href: string; children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const stop = useRef<() => void>(() => {});
  return (
    <a href={href} className={className} onMouseEnter={() => { stop.current(); stop.current = scrambleTo(ref.current!, children, 450); }} aria-label={children}>
      <span ref={ref} aria-hidden="true">{children}</span>
    </a>
  );
}

/** Words rise out of a blur one after another. */
export function RevealWords({ text, delay = 0, step = 0.035 }: { text: string; delay?: number; step?: number }) {
  return (
    <span className="reveal" aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} aria-hidden="true" className="reveal-word" style={{ animationDelay: `${delay + i * step}s` }}>{w}{' '}</span>
      ))}
    </span>
  );
}

/** Leans toward the cursor when it comes near, and springs back. */
export function Magnetic({ children, strength = 0.35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced()) return;
    const el = ref.current!;
    let raf = 0;
    let tx = 0, ty = 0, x = 0, y = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const reach = Math.max(r.width, r.height) * 0.9;
      const near = Math.hypot(dx, dy) < reach;
      tx = near ? dx * strength : 0;
      ty = near ? dy * strength : 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [strength]);
  return <span ref={ref} className="magnetic">{children}</span>;
}

/** A ring cursor with a label: it grows over links and says STRIKE over the storm. */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const [fine] = useState(() => window.matchMedia('(pointer: fine)').matches && !reduced());
  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add('custom-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      const target = e.target as HTMLElement;
      const link = target.closest('a, button');
      const stage = !link && target.closest('.hero');
      ring.current!.dataset.mode = link ? 'link' : stage ? 'stage' : 'idle';
      dot.current!.style.transform = `translate(${x}px, ${y}px)`;
    };
    const down = () => { ring.current!.classList.remove('pulse'); void ring.current!.offsetWidth; ring.current!.classList.add('pulse'); };
    const tick = () => {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      ring.current!.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      document.documentElement.classList.remove('custom-cursor');
    };
  }, [fine]);
  if (!fine) return null;
  return (
    <>
      <div className="cursor-ring" ref={ring} data-mode="idle" aria-hidden="true"><span>STRIKE</span></div>
      <div className="cursor-dot" ref={dot} aria-hidden="true" />
    </>
  );
}
