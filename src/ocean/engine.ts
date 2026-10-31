/**
 * Ocean: Larp's ASCII sea, drawn on a canvas as a grid of glyph tiles.
 *
 * Every creature is a shape in its own frame (cells, heading along +u). Each frame we sample it at the
 * centre of every grid cell it covers, and paint a hit as a coloured tile holding a monospace glyph:
 * sparse glyphs where the skin is lit, dense ones in shadow (the idea from stackedlol/ascii-sharks, MIT).
 * Glyphs are hashed from the creature's own coordinates, so the texture travels with the body.
 * Deep creatures are fainter and bluer on a softly blurred layer; everything casts an offset shadow.
 */

type RGB = [number, number, number];
type Mat = { rgb: RGB; ramp: string; ink: 'dark' | 'light'; accent?: number };
type Hit = { m: Mat; shade: number; key: number } | null;

const C = 12;                    // cell size in CSS px
const WATER: RGB = [38, 168, 196];
const ACCENTS = ['#e8487a', '#3fc28e', '#f08a3c', '#7a5cff'];

const M = {
  shell: { rgb: [173, 160, 86], ramp: ':;t%SSX', ink: 'dark', accent: 0.035 } as Mat,
  rim: { rgb: [138, 124, 62], ramp: 't%SX8', ink: 'dark' } as Mat,
  skin: { rgb: [168, 136, 82], ramp: ':;t%S', ink: 'dark' } as Mat,
  fish: { rgb: [242, 206, 48], ramp: '%St:', ink: 'dark' } as Mat,
  fishFin: { rgb: [226, 178, 38], ramp: ';t', ink: 'dark' } as Mat,
  manta: { rgb: [34, 46, 78], ramp: ':;t%S', ink: 'light' } as Mat,
  mantaTip: { rgb: [24, 32, 58], ramp: '%SX', ink: 'light' } as Mat,
  white: { rgb: [228, 236, 240], ramp: ':;t%', ink: 'dark' } as Mat,
  orca: { rgb: [26, 31, 44], ramp: ';t%SX', ink: 'light' } as Mat,
  saddle: { rgb: [104, 116, 134], ramp: ':;t', ink: 'light' } as Mat,
  petal: { rgb: [222, 44, 86], ramp: ':;t%S', ink: 'dark', accent: 0.04 } as Mat,
  petalDeep: { rgb: [184, 28, 66], ramp: '%SX', ink: 'light' } as Mat,
  stamen: { rgb: [246, 198, 60], ramp: '%S', ink: 'dark' } as Mat,
  plumeria: { rgb: [246, 243, 234], ramp: ':;t', ink: 'dark' } as Mat,
  plumeriaHeart: { rgb: [245, 206, 86], ramp: 't%', ink: 'dark' } as Mat,
  coral: { rgb: [118, 196, 176], ramp: ':;t%', ink: 'dark' } as Mat,
  coralPink: { rgb: [196, 150, 176], ramp: ':;t', ink: 'dark' } as Mat,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const ell = (u: number, v: number, a: number, b: number) => (u * u) / (a * a) + (v * v) / (b * b);
/** Point in an ellipse whose centre is (cx, cy) and which is turned by angle r. */
function inEll(u: number, v: number, cx: number, cy: number, r: number, a: number, b: number) {
  const du = u - cx, dv = v - cy, c = Math.cos(r), s = Math.sin(r);
  return ell(du * c + dv * s, -du * s + dv * c, a, b) < 1;
}

let nextId = 1;

abstract class Creature {
  id = nextId++;
  x = 0; y = 0; a = 0; v = 1; turn = 0;
  depth = 0;          // 0 near the surface, 1 deep
  scale = 1;
  phase = Math.random() * 10;
  radius = 8;         // bounding radius in cells (before scale)
  shadow = 1;         // shadow offset in cells
  dead = false;
  abstract sample(u: number, v: number, t: number): Hit;
  update(dt: number, w: World) {
    this.a += this.turn * dt;
    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;
    const m = this.radius * this.scale + 6;
    if (this.x < -m - 20 || this.x > w.cols + m + 20 || this.y < -m - 20 || this.y > w.rows + m + 20) this.dead = true;
  }
  /** Enter from a random edge, heading roughly across the screen. */
  enter(w: World, speed: number) {
    const side = Math.floor(Math.random() * 4);
    const m = this.radius * this.scale + 2;
    if (side === 0) { this.x = -m; this.y = rand(0, w.rows); }
    if (side === 1) { this.x = w.cols + m; this.y = rand(0, w.rows); }
    if (side === 2) { this.x = rand(0, w.cols); this.y = -m; }
    if (side === 3) { this.x = rand(0, w.cols); this.y = w.rows + m; }
    const tx = rand(w.cols * 0.2, w.cols * 0.8), ty = rand(w.rows * 0.2, w.rows * 0.8);
    this.a = Math.atan2(ty - this.y, tx - this.x) + rand(-0.3, 0.3);
    this.v = speed;
    this.turn = rand(-0.05, 0.05);
    return this;
  }
}

class Turtle extends Creature {
  radius = 9; shadow = 1.2;
  sample(u: number, v: number, t: number): Hit {
    const p = this.phase + t * 1.6;
    const stroke = Math.sin(p);
    // Shell: an ellipse with a darker rim and a scute pattern in the shading.
    const e = ell(u, v, 5.6, 4.4);
    if (e < 1) {
      const scute = 0.5 + 0.28 * Math.cos(u * 1.25 + 0.4) * Math.cos(v * 1.45) + 0.14 * Math.cos((u + v) * 0.9);
      return e > 0.72 ? { m: M.rim, shade: 0.6, key: 1 } : { m: M.shell, shade: clamp(scute + (v / 4.4) * 0.15, 0, 1), key: 2 };
    }
    // Head bobs a little as it swims.
    if (inEll(u, v, 6.7 + 0.25 * Math.sin(p * 0.5), 0, 0, 1.9, 1.5)) return { m: M.skin, shade: 0.45 + 0.1 * Math.sign(v), key: 3 };
    // Front flippers sweep; back flippers paddle.
    for (const side of [-1, 1]) {
      const fa = side * (0.75 + 0.5 * stroke);
      if (inEll(u, v, 2.4 + Math.cos(fa) * 2.4, side * 3.6 + Math.sin(fa) * 2.4, fa, 3.1, 1.05)) return { m: M.skin, shade: 0.55, key: 4 };
      const ba = side * (2.35 + 0.25 * Math.sin(p + 1.2));
      if (inEll(u, v, -4.4 + Math.cos(ba) * 1.3, side * 2.4 + Math.sin(ba) * 1.3, ba, 1.7, 0.85)) return { m: M.skin, shade: 0.6, key: 5 };
    }
    if (inEll(u, v, -6, 0, 0, 0.9, 0.5)) return { m: M.skin, shade: 0.7, key: 6 };
    return null;
  }
}

class Fish extends Creature {
  radius = 3.6; shadow = 0.9;
  sample(u: number, v: number, t: number): Hit {
    const w = 0.12 * Math.sin(this.phase + t * 9 - u);
    const vv = v - w * (2 - u);
    if (u > -2.2 && u < 2.9 && Math.abs(vv) < 0.58 * (1 - Math.abs(u - 0.35) / 2.7)) return { m: M.fish, shade: 0.35 + 0.3 * (vv > 0 ? 1 : 0), key: 1 };
    if (u <= -2.2 && u > -3.2 && Math.abs(vv) < 0.15 + (-2.2 - u) * 0.6) return { m: M.fishFin, shade: 0.6, key: 2 };
    return null;
  }
}

/** A school: one leader path; each fish keeps a slot in the formation and wiggles around it. */
class School {
  fish: Fish[] = [];
  x = 0; y = 0; a = 0; v = 6; turn = 0; depth = 0; t0 = Math.random() * 100; dead = false;
  slots: [number, number][] = [];
  constructor(w: World, n: number, depth: number) {
    const lead = new Fish().enter(w, rand(5, 7.5));
    Object.assign(this, { x: lead.x, y: lead.y, a: lead.a, v: lead.v, depth });
    for (let i = 0; i < n; i++) {
      const f = new Fish();
      f.depth = depth; f.scale = rand(0.95, 1.2);
      this.slots.push([rand(-14, 6), rand(-6, 6)]);
      this.fish.push(f);
    }
  }
  update(dt: number, w: World) {
    this.t0 += dt;
    this.a += Math.sin(this.t0 * 0.7) * 0.25 * dt;
    // Scatter away from the pointer, then regroup.
    if (w.pointer) {
      const dx = this.x - w.pointer[0], dy = this.y - w.pointer[1], d = Math.hypot(dx, dy);
      if (d < 14) this.a += Math.sign(Math.sin(Math.atan2(dy, dx) - this.a)) * 1.6 * dt;
    }
    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    this.fish.forEach((f, i) => {
      const [su, sv] = this.slots[i];
      const wob = Math.sin(this.t0 * 1.7 + i) * 0.7;
      const tx = this.x + su * c - (sv + wob) * s, ty = this.y + su * s + (sv + wob) * c;
      f.x += (tx - f.x) * Math.min(1, dt * 4); f.y += (ty - f.y) * Math.min(1, dt * 4);
      f.a = this.a + Math.sin(this.t0 * 2 + i * 1.3) * 0.12;
    });
    const m = 30;
    if (this.x < -m || this.x > w.cols + m || this.y < -m || this.y > w.rows + m) this.dead = true;
  }
}

class Manta extends Creature {
  radius = 12; shadow = 1.6;
  sample(u: number, v: number, t: number): Hit {
    const flap = Math.sin(this.phase + t * 1.7);
    const av = Math.abs(v);
    if (u > -11 && u < -3.6 && av < 0.4) return { m: M.manta, shade: 0.7, key: 1 };                    // tail
    if (u > 3.8 && u < 5.6 && av > 0.8 && av < 2.1) return { m: M.manta, shade: 0.5, key: 2 };        // cephalic fins
    if (u < -4 || u > 4.6) return null;
    const k = (u + 4) / 8.6;
    const span = 8.4 * (1 + 0.12 * flap) * Math.pow(Math.sin(Math.PI * clamp(k, 0, 1)), 0.75) * (1 - 0.35 * k);
    if (av > span) return null;
    const tip = av / Math.max(span, 0.01);
    if (u > -0.5 && u < 2.6 && av > 1.4 && av < 3.6) return { m: M.white, shade: 0.4, key: 3 };      // shoulder patches
    if (tip > 0.72) return { m: M.mantaTip, shade: 0.5 + 0.4 * flap * tip, key: 4 };
    return { m: M.manta, shade: 0.4 + 0.3 * tip + 0.15 * flap, key: 5 };
  }
}

class Orca extends Creature {
  radius = 12; shadow = 1.5;
  sample(u: number, v: number, t: number): Hit {
    const p = this.phase + t * 2.2;
    const vv = v - Math.sin(p - u * 0.28) * 0.35 * clamp((5 - u) / 14, 0, 1);
    const av = Math.abs(vv);
    const s = (9 - u) / 18;                                // 0 at the snout, 1 at the tail
    if (s >= 0 && s <= 0.86) {
      const hw = s < 0.18 ? 2.7 * Math.pow(Math.sin((s / 0.18) * Math.PI / 2), 0.7) : 0.6 + 2.1 * Math.pow(1 - (s - 0.18) / 0.68, 1.2);
      if (av < hw) {
        if (inEll(u, av, 5.6, 1.5, 0.15, 1.5, 0.6)) return { m: M.white, shade: 0.35, key: 1 };   // eye patches
        if (ell(u + 1.2, vv, 2.2, 1.4) < 1) return { m: M.saddle, shade: 0.5, key: 2 };
        return { m: M.orca, shade: 0.45 + 0.35 * (av / hw), key: 3 };
      }
    }
    if (u > -10.5 && u < -6.4 && av < 0.4 + (-6.4 - u) * 1.05 && av > (-6.4 - u) * 0.35) return { m: M.orca, shade: 0.7, key: 4 }; // flukes
    if (inEll(u, av, 3.2, 3.2, 0.55, 2.2, 0.8)) return { m: M.orca, shade: 0.6, key: 5 };           // pectorals
    return null;
  }
}

class Hibiscus extends Creature {
  radius = 4; shadow = 1.8;
  sample(u: number, v: number, t: number): Hit {
    const r = Math.hypot(u, v), th = Math.atan2(v, u) + t * 0.15;
    const R = 3.4 * (0.6 + 0.4 * Math.abs(Math.cos(2.5 * th)));
    if (r > R) return null;
    if (r < 0.9) return { m: M.stamen, shade: 0.4, key: 1 };
    const vein = Math.abs(Math.sin(2.5 * th));
    return r < 1.7 && vein < 0.5 ? { m: M.petalDeep, shade: 0.6, key: 2 } : { m: M.petal, shade: 0.3 + 0.4 * vein + 0.2 * (r / R), key: 3 };
  }
  update(dt: number, w: World) { super.update(dt, w); this.a += dt * 0.12; }
}

class Plumeria extends Creature {
  radius = 3; shadow = 1.8;
  sample(u: number, v: number, t: number): Hit {
    const r = Math.hypot(u, v), th = Math.atan2(v, u) - t * 0.1;
    const R = 2.6 * Math.pow(0.5 + 0.5 * Math.abs(Math.cos(2.5 * th + 0.6)), 0.6);
    if (r > R) return null;
    return r < 0.85 ? { m: M.plumeriaHeart, shade: 0.4, key: 1 } : { m: M.plumeria, shade: 0.25 + 0.3 * (r / R), key: 2 };
  }
}

/** Faint coral heads near the floor of the screen; they never move. */
class Coral extends Creature {
  radius = 5; shadow = 0.6;
  seed = Math.random() * 100;
  pink = Math.random() < 0.35;
  sample(u: number, v: number): Hit {
    const r = Math.hypot(u, v), th = Math.atan2(v, u);
    const R = 3.6 + 1.2 * Math.sin(th * 3 + this.seed) + 0.8 * Math.sin(th * 7 + this.seed * 2);
    if (r > R) return null;
    return { m: this.pink ? M.coralPink : M.coral, shade: 0.3 + 0.4 * hash(Math.round(u), Math.round(v), this.id), key: 1 };
  }
  update() { /* still */ }
}

type World = { cols: number; rows: number; pointer: [number, number] | null };

export class Ocean {
  private ctx: CanvasRenderingContext2D;
  private deep: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private grid: HTMLCanvasElement;
  private dpr = 1;
  private w: World = { cols: 0, rows: 0, pointer: null };
  private creatures: Creature[] = [];
  private schools: School[] = [];
  private corals: Coral[] = [];
  private ripples: { x: number; y: number; t: number }[] = [];
  private waves: { x: number; y: number; s: number }[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private styleCache = new Map<number, string>();
  private ro: ResizeObserver;
  private still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private orcaWait = rand(8, 20);
  /** Paused: the last frame stays on screen and nothing is computed (used behind pages other than home). */
  paused = false;
  setPaused(p: boolean) { this.paused = p; if (!p) this.last = performance.now(); }

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.deep = document.createElement('canvas');
    this.dctx = this.deep.getContext('2d')!;
    this.grid = document.createElement('canvas');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.populate();
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onDown, { passive: true });
    document.addEventListener('visibilitychange', this.onVisible);
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private onMove = (e: PointerEvent) => { const r = this.canvas.getBoundingClientRect(); this.w.pointer = [(e.clientX - r.left) / C, (e.clientY - r.top) / C]; };
  private onDown = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    if ((e.target as HTMLElement).closest('button, a, input, textarea, [role="dialog"], .ocean-glass')) return;
    this.ripples.push({ x: (e.clientX - r.left) / C, y: (e.clientY - r.top) / C, t: 0 });
  };
  private onVisible = () => { if (!document.hidden) { this.last = performance.now(); } };

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.deep, this.grid]) { c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr); }
    this.w.cols = Math.ceil(r.width / C); this.w.rows = Math.ceil(r.height / C);
    // The faint cell grid over the whole sea, drawn once per size.
    const g = this.grid.getContext('2d')!;
    g.clearRect(0, 0, this.grid.width, this.grid.height);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath();
    for (let c = 0; c <= this.w.cols; c++) { const x = Math.round(c * C * this.dpr) + 0.5; g.moveTo(x, 0); g.lineTo(x, this.grid.height); }
    for (let rr = 0; rr <= this.w.rows; rr++) { const y = Math.round(rr * C * this.dpr) + 0.5; g.moveTo(0, y); g.lineTo(this.grid.width, y); }
    g.stroke();
    this.layoutCorals();
  }

  private layoutCorals() {
    this.corals = [];
    const { cols, rows } = this.w;
    const spots: [number, number][] = [[0.04, 0.9], [0.13, 0.97], [0.86, 0.94], [0.95, 0.82], [0.02, 0.5], [0.97, 0.12], [0.46, 1.02]];
    for (const [fx, fy] of spots) {
      const c = new Coral();
      c.x = fx * cols; c.y = fy * rows; c.depth = 0.82; c.scale = rand(0.8, 1.3);
      this.corals.push(c);
    }
    this.waves = Array.from({ length: 7 }, () => ({ x: rand(0, cols), y: rand(0, rows), s: rand(0.3, 0.8) }));
  }

  private populate() {
    const w = this.w;
    const place = (c: Creature) => { c.x = rand(w.cols * 0.05, w.cols * 0.95); c.y = rand(w.rows * 0.05, w.rows * 0.95); return c; };
    for (let i = 0; i < 3; i++) { const t = place(new Turtle().enter(w, rand(2.2, 3.2))); t.depth = i === 2 ? 0.55 : rand(0, 0.15); t.scale = i === 2 ? rand(1.2, 1.4) : rand(1.45, 1.75); this.creatures.push(t); }
    for (let i = 0; i < 3; i++) { const h = place(new Hibiscus().enter(w, rand(0.25, 0.6))); h.scale = rand(1.05, 1.3); this.creatures.push(h); }
    for (let i = 0; i < 5; i++) { const p = place(new Plumeria().enter(w, rand(0.25, 0.6))); p.scale = rand(1, 1.2); this.creatures.push(p); }
    const m = new Manta().enter(w, rand(2.6, 3.4)); m.depth = 0.35; m.scale = 1.3; this.creatures.push(m);
    this.schools.push(new School(w, 12, 0.05), new School(w, 9, 0.6));
  }

  /** Keep the sea stocked: anything that swims off is replaced by something entering. */
  private restock(dt: number) {
    const w = this.w;
    const count = (k: Function) => this.creatures.filter((c) => c instanceof k).length;
    if (count(Turtle) < 3) { const t = new Turtle().enter(w, rand(2.2, 3.2)); t.depth = Math.random() < 0.3 ? 0.55 : rand(0, 0.15); t.scale = t.depth > 0.4 ? rand(1.2, 1.4) : rand(1.45, 1.75); this.creatures.push(t); }
    if (count(Hibiscus) < 3) { const h = new Hibiscus().enter(w, rand(0.3, 0.7)); h.scale = rand(1.05, 1.3); this.creatures.push(h); }
    if (count(Plumeria) < 5) { const p = new Plumeria().enter(w, rand(0.3, 0.7)); p.scale = rand(1, 1.2); this.creatures.push(p); }
    if (count(Manta) < 1) { const m = new Manta().enter(w, rand(2.6, 3.4)); m.depth = rand(0.2, 0.5); m.scale = rand(1.15, 1.4); this.creatures.push(m); }
    this.orcaWait -= dt;
    if (this.orcaWait < 0 && count(Orca) < 1) { const o = new Orca().enter(w, rand(4.5, 6)); o.depth = rand(0.3, 0.6); o.scale = rand(1.3, 1.55); o.turn = 0; this.creatures.push(o); this.orcaWait = rand(25, 45); }
    if (this.schools.length < 2) this.schools.push(new School(w, Math.round(rand(8, 13)), Math.random() < 0.5 ? 0.05 : 0.6));
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || this.paused) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    if (!this.still) {
      this.t += dt;
      for (const c of this.creatures) c.update(dt, this.w);
      for (const s of this.schools) s.update(dt, this.w);
      this.creatures = this.creatures.filter((c) => !c.dead);
      this.schools = this.schools.filter((s) => !s.dead);
      this.restock(dt);
      for (const r of this.ripples) r.t += dt;
      this.ripples = this.ripples.filter((r) => r.t < 2.2);
      for (const wv of this.waves) { wv.x += wv.s * dt; if (wv.x > this.w.cols + 6) { wv.x = -6; wv.y = rand(0, this.w.rows); } }
    }
    this.draw();
  };

  private style(rgb: RGB, a: number) {
    const key = ((rgb[0] >> 2) << 18) | ((rgb[1] >> 2) << 12) | ((rgb[2] >> 2) << 6) | Math.round(a * 63);
    let s = this.styleCache.get(key);
    if (!s) { s = `rgba(${rgb[0] & ~3},${rgb[1] & ~3},${rgb[2] & ~3},${(Math.round(a * 63) / 63).toFixed(3)})`; this.styleCache.set(key, s); if (this.styleCache.size > 6000) this.styleCache.clear(); }
    return s;
  }

  private draw() {
    const { ctx, dctx, dpr } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.grid, 0, 0);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = `600 ${Math.round(C * 0.72)}px "Cascadia Mono", "JetBrains Mono", ui-monospace, Consolas, monospace`;
    ctx.font = font; dctx.font = font;
    ctx.textAlign = dctx.textAlign = 'center';
    ctx.textBaseline = dctx.textBaseline = 'middle';

    // Little wave marks drifting on the surface.
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    for (const wv of this.waves) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      if (hash(i, j, Math.round(wv.y)) < 0.45) continue;
      ctx.fillText(j % 2 ? '~' : '-', (Math.round(wv.x) + i) * C + C / 2, (Math.round(wv.y) + j * 2) * C + C / 2);
    }

    const all: Creature[] = [...this.corals, ...this.creatures, ...this.schools.flatMap((s) => s.fish)];
    all.sort((a, b) => b.depth - a.depth);
    for (const c of all) this.paint(c, c.depth > 0.45 ? dctx : ctx);

    // The deep layer: soft, as if seen through water.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.filter = `blur(${1.2 * dpr}px)`; ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(this.deep, 0, 0); ctx.restore();

    // Ripples where you tapped the water.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const r of this.ripples) {
      const rad = 2 + r.t * 9, a = 0.55 * (1 - r.t / 2.2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      for (let k = 0; k < 28; k++) {
        const th = (k / 28) * Math.PI * 2;
        const cx = Math.round(r.x + Math.cos(th) * rad), cy = Math.round(r.y + Math.sin(th) * rad * 0.8);
        ctx.fillText(k % 2 ? '~' : '·', cx * C + C / 2, cy * C + C / 2);
      }
    }
  }

  private paint(c: Creature, g: CanvasRenderingContext2D) {
    const R = c.radius * c.scale + 1.5;
    const c0 = Math.max(0, Math.floor(c.x - R)), c1 = Math.min(this.w.cols - 1, Math.ceil(c.x + R));
    const r0 = Math.max(0, Math.floor(c.y - R)), r1 = Math.min(this.w.rows - 1, Math.ceil(c.y + R));
    if (c0 > c1 || r0 > r1) return;
    const cos = Math.cos(c.a), sin = Math.sin(c.a), inv = 1 / c.scale;
    const hits: { col: number; row: number; h: NonNullable<Hit>; u: number; v: number }[] = [];
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const dx = col + 0.5 - c.x, dy = row + 0.5 - c.y;
      const u = (dx * cos + dy * sin) * inv, v = (-dx * sin + dy * cos) * inv;
      const h = c.sample(u, v, this.t);
      if (h) hits.push({ col, row, h, u, v });
    }
    if (!hits.length) return;
    const fade = 1 - c.depth * 0.62;
    // Shadow first: the same cells, offset down-right, darker water.
    const so = Math.round(c.shadow * (1 - c.depth * 0.5));
    g.fillStyle = `rgba(6,58,96,${(0.2 * fade).toFixed(3)})`;
    for (const { col, row } of hits) g.fillRect((col + so) * C, (row + so) * C, C - 1, C - 1);
    for (const { col, row, h, u, v } of hits) {
      const m = h.m;
      const n = hash(Math.round(u * 1.6), Math.round(v * 1.6), c.id * 31 + h.key);
      const lit = clamp(h.shade + (n - 0.5) * 0.22, 0, 1);
      const k = 0.84 + 0.3 * (1 - lit);
      let rgb: RGB = [m.rgb[0] * k, m.rgb[1] * k, m.rgb[2] * k];
      const dz = c.depth * 0.55;
      rgb = [rgb[0] + (WATER[0] - rgb[0]) * dz, rgb[1] + (WATER[1] - rgb[1]) * dz, rgb[2] + (WATER[2] - rgb[2]) * dz].map((x) => clamp(Math.round(x), 0, 255)) as RGB;
      g.fillStyle = this.style(rgb, fade);
      g.fillRect(col * C, row * C, C - 1, C - 1);
      const glyph = m.ramp[Math.min(m.ramp.length - 1, Math.floor(lit * m.ramp.length))];
      if (m.accent && n > 1 - m.accent) g.fillStyle = ACCENTS[Math.floor(n * 1000) % ACCENTS.length];
      else {
        const ink: RGB = m.ink === 'dark' ? [rgb[0] * 0.5, rgb[1] * 0.5, rgb[2] * 0.48] : [Math.min(255, rgb[0] + 110), Math.min(255, rgb[1] + 112), Math.min(255, rgb[2] + 118)];
        g.fillStyle = this.style(ink.map((x) => Math.round(x)) as RGB, fade * 0.95);
      }
      g.fillText(glyph, col * C + (C - 1) / 2, row * C + (C - 1) / 2 + 0.5);
    }
  }
}
