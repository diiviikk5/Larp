import { useEffect, useRef, useState } from 'react';
import { StormScene } from './scene';
import { Cursor, DecodeCycle, Magnetic, RevealWords, ScrambleLink } from './fx';
const stormUrl = `${import.meta.env.BASE_URL}storm.png`;

function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M13 4.5h6v13h10v6H13z" fill="currentColor" opacity="0.45" />
      <path d="M3 7.5h6v14h10v6H3z" fill="currentColor" />
    </svg>
  );
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const pointer = useRef<[number, number]>([window.innerWidth * 0.68, window.innerHeight * 0.4]);
  const [mode, setMode] = useState<'loading' | 'live' | 'static'>('loading');

  useEffect(() => {
    const el = root.current!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: StormScene | null = null;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [image] = await Promise.all([loadImage(stormUrl), document.fonts.load('400 100px Anton')]);
      if (cancelled) return;
      try {
        scene = new StormScene(canvas.current!, image, () => ({ pointer: pointer.current }), reduced);
      } catch (error) {
        console.error('[larp] storm scene unavailable, showing the still image:', error);
        setMode('static');
        return;
      }
      const s = scene;
      // Our caption takes the place of the one painted out of the picture.
      s.onLayout = () => {
        const portrait = el.clientHeight > el.clientWidth;
        // The caption shares the page margin with the word and the copy.
        el.style.setProperty('--cap-x', `${Math.min(56, Math.max(20, el.clientWidth * 0.04))}px`);
        el.style.setProperty('--cap-y', portrait ? `${s.wordBaseline + 18}px` : `${s.wordTop - 44}px`);
        el.style.setProperty('--cap-size', `${Math.max(10, Math.min(14, s.rect.h * 0.0185))}px`);
      };
      s.onLayout();
      let lastReadout = 0;
      s.onFrame = (seconds) => {
        if (seconds - lastReadout < 0.1 || !readout.current) return;
        lastReadout = seconds;
        readout.current.textContent = `T+${pad(seconds / 60)}:${pad(seconds % 60)}:${pad((seconds * 24) % 24)}  ·  STRIKES ${pad(s.strikes, 3)}`;
      };
      s.play();
      setMode('live');

      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        pointer.current = [e.clientX - r.left, e.clientY - r.top];
      };
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('a, button')) return;
        move(e);
        if (!reduced) s.strikeNow(1);
      };
      const resize = () => s.resize();
      const io = new IntersectionObserver(([entry]) => s.setVisible(entry.isIntersecting && !document.hidden));
      const vis = () => s.setVisible(!document.hidden);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerdown', down);
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', vis);
      io.observe(el);
      cleanups.push(() => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerdown', down);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', vis);
        io.disconnect();
      });
    })().catch(() => setMode('static'));

    return () => {
      cancelled = true;
      scene?.destroy();
      cleanups.forEach((c) => c());
    };
  }, []);

  return (
    <section className={'hero mode-' + mode} ref={root} aria-label="Larp">
      <canvas className="hero-canvas" ref={canvas} aria-hidden="true" />
      {mode === 'static' && <div className="hero-static" style={{ backgroundImage: `url(${stormUrl})` }} aria-hidden="true"><span>LARP</span></div>}
      <h1 className="sr-only">Larp</h1>

      <header className="nav">
        <a className="nav-brand" href="#top"><Mark /> <span>LARP</span></a>
        <nav className="nav-links" aria-label="Primary">
          <ScrambleLink href="#download">Download</ScrambleLink>
          <ScrambleLink href="./skills.html">Skills</ScrambleLink>
          <ScrambleLink href="./apps.html">Apps</ScrambleLink>
          <ScrambleLink href="#docs">Get started</ScrambleLink>
          <ScrambleLink href="#host">Host a space</ScrambleLink>
        </nav>
        <Magnetic strength={0.25}><ScrambleLink className="nav-cta" href="#download">Download</ScrambleLink></Magnetic>
      </header>

      <p className="hero-caption"><DecodeCycle phrases={['PEOPLE. AGENTS. PROOF.', 'DELEGATE. APPROVE. VERIFY.', 'LOCAL. PRIVATE. YOURS.']} /></p>
      <div className="hero-side" aria-hidden="true">
        <div className="ticker">{[0, 1].map((k) => <span key={k}>LOCAL-FIRST AGENT HARNESS — MMXXVI — RUNS ON YOUR MACHINE — ASKS BEFORE IT ACTS — </span>)}</div>
      </div>

      <div className="hero-bottom">
        <div className="hero-intro">
          <span className="hero-index">N°01</span>
          <p><RevealWords text="A harness where your agents and your people’s agents work together. Each one runs on its owner’s machine, asks before it acts, and comes back with proof." delay={1.3} /></p>
          <div className="hero-actions">
            <Magnetic><a className="btn-solid" href="#download"><span>Download for Windows</span></a></Magnetic>
            <Magnetic><a className="btn-line" href="#docs">Get started <span aria-hidden="true">→</span></a></Magnetic>
          </div>
          <small>v0.4 · Free · macOS and Linux soon</small>
        </div>
        <div className="hero-meta">
          <span className="hero-hint">Move to steer the storm — click to strike</span>
          <span className="hero-readout"><i className="live" />LIVE · <span ref={readout}>T+00:00:00  ·  STRIKES 000</span></span>
        </div>
      </div>
      <Cursor />
    </section>
  );
}
