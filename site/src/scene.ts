// Animates a still image of a storm: the smoke billows and follows the cursor, the lightning
// flickers and crawls, and a word is composited behind the smoke and the figure.
// Every pixel comes from the original image; the shader only moves and relights it.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uText;
uniform vec2 uRes;        // drawing buffer size
uniform vec4 uRect;       // image rect in buffer pixels: x, y (from top), w, h
uniform float uTime;
uniform vec2 uMouse;      // eased cursor, buffer pixels from top-left
uniform vec2 uVel;        // eased cursor velocity, image units per second
uniform float uStrike;
uniform vec2 uParallax;
uniform float uIntro;
uniform float uTextOn;
uniform float uWordTop;
uniform float uWordBottom;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = R * p; a *= 0.5; } return v; }
float ridged(vec2 p) { float v = 0.0, a = 0.6; for (int i = 0; i < 3; i++) { float n = 1.0 - abs(noise(p) * 2.0 - 1.0); v += a * n * n; p = R * p; a *= 0.5; } return v; }

float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

// The original has a caption baked in. Rebuild that strip from the sky just above and below it,
// so the gradient carries straight through, and feather the edges.
const vec4 CAPTION = vec4(0.185, 0.168, 0.565, 0.222);
vec4 img(vec2 uv, float bias) {
  uv = clamp(uv, 0.0, 1.0);
  vec4 c = texture(uImg, uv, bias);
  float inX = smoothstep(CAPTION.x - 0.012, CAPTION.x, uv.x) * smoothstep(CAPTION.z + 0.012, CAPTION.z, uv.x);
  float inY = smoothstep(CAPTION.y - 0.01, CAPTION.y, uv.y) * smoothstep(CAPTION.w + 0.01, CAPTION.w, uv.y);
  float k = inX * inY;
  if (k > 0.0) {
    vec4 above = texture(uImg, vec2(uv.x, CAPTION.y - 0.014), max(bias, 2.0));
    vec4 below = texture(uImg, vec2(uv.x, CAPTION.w + 0.014), max(bias, 2.0));
    vec4 fill = mix(above, below, clamp((uv.y - CAPTION.y) / (CAPTION.w - CAPTION.y), 0.0, 1.0));
    c = mix(c, fill, k);
  }
  return c;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 par = uParallax * vec2(-0.012, -0.008);
  vec2 uv = (px - uRect.xy) / uRect.zw + par;
  float t = uTime;

  // Where is smoke? Bright or warm pixels above the floor, softened so the dark core counts too.
  vec3 soft = img(uv, 4.0).rgb;
  float above = smoothstep(0.83, 0.77, uv.y);
  float smoke = smoothstep(0.075, 0.22, lum(soft)) * above;
  float smokeTight = smoothstep(0.09, 0.3, lum(img(uv, 1.5).rgb)) * above;

  // Billowing: a slow, rising flow field that only moves the smoke.
  vec2 flow = vec2(fbm(uv * 3.0 + vec2(t * 0.09, -t * 0.13)), fbm(uv * 3.0 + vec2(7.1, 2.3) + vec2(-t * 0.1, -t * 0.12))) - 0.5;
  vec2 fine = vec2(noise(uv * 14.0 + t * 0.5), noise(uv * 14.0 + 11.0 - t * 0.45)) - 0.5;
  vec2 warp = (flow * 0.034 + fine * 0.005) * smoke;
  // Stronger at the wispy top edge, like wind pulling the strands.
  warp += vec2(0.006, -0.004) * sin(t * 0.6 + uv.x * 5.0) * smoke * smoothstep(0.55, 0.15, uv.y);

  // The cursor drags the smoke with it and swirls what it passes through.
  vec2 m = (uMouse - uRect.xy) / uRect.zw + par;
  vec2 d = uv - m;
  float near = exp(-dot(d, d) * 18.0) * smoke;
  warp += d * 0.06 * near;
  warp += -uVel * 0.045 * near + vec2(-d.y, d.x) * length(uVel) * 0.08 * near;

  vec2 dir = normalize(vec2(0.62, -0.78));
  vec2 curl = (vec2(fbm(uv * 4.0 + vec2(1.3, t * 0.08)), fbm(uv * 4.0 + vec2(5.7, -t * 0.07))) - 0.5) * 1.8;
  vec2 stream = (dir + curl) * smoke * uIntro;
  float cycle = t * 0.3;
  float p1 = fract(cycle), p2 = fract(cycle + 0.5);
  float wA = 1.0 - abs(p1 - 0.5) * 2.0;
  const float LEN = 0.05;
  vec2 at = uv + warp * uIntro;
  vec3 c = img(at - stream * (p1 - 0.5) * LEN, 0.0).rgb * wA + img(at - stream * (p2 - 0.5) * LEN, 0.0).rgb * (1.0 - wA);

  // Lightning: the warm veins flicker, crawl and flare on a strike.
  float warm = clamp((c.r - c.b) * 3.0 - 0.12, 0.0, 1.0) * smoothstep(0.12, 0.5, lum(c));
  float flicker = 0.78 + 0.32 * noise(vec2(t * 9.0, 1.7)) + 0.18 * noise(vec2(t * 23.0, 4.1));
  float crawl = pow(ridged((uv + warp) * vec2(7.0, 9.0) + vec2(t * 0.55, -t * 0.4)), 5.0);
  float local = 0.7 + 0.6 * noise(uv * 9.0 + t * 1.4);
  c *= 1.0 + warm * ((flicker - 1.0) * 0.9 * local + uStrike * 1.15);
  c += vec3(1.0, 0.62, 0.32) * warm * crawl * (0.35 + uStrike * 0.8);
  // Pulses of light run up through the existing veins.
  float wave = pow(0.5 + 0.5 * sin(dot(uv, vec2(16.0, -13.0)) - t * 5.5 + noise(uv * 6.0) * 4.0), 3.0);
  c *= 1.0 + warm * wave * 0.7;
  c += vec3(1.0, 0.55, 0.25) * smokeTight * warm * uStrike * 0.25;
  // A soft bloom around the hottest region.
  vec3 glow = img(uv + warp, 5.0).rgb;
  float glowWarm = clamp((glow.r - glow.b) * 3.0, 0.0, 1.0);
  c += vec3(1.0, 0.5, 0.2) * glowWarm * (0.06 * flicker + uStrike * 0.16);
  // Fresh bolts crackle in the hot core in short random bursts.
  float burst = smoothstep(0.55, 0.85, noise(vec2(t * 3.5, floor(uv.x * 6.0)))) + uStrike;
  float bolt = pow(ridged(uv * vec2(5.5, 6.5) + vec2(t * 1.3, -t * 0.9) + curl * 0.6), 10.0);
  float core = smoothstep(0.08, 0.35, glowWarm) * above;
  c += vec3(1.0, 0.72, 0.45) * bolt * core * burst * 1.6;
  // Embers drift up out of the fire.
  vec2 eg = uv * vec2(46.0, 34.0) + vec2(-t * 0.5, t * 1.6);
  vec2 cell = floor(eg);
  vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
  float ember = smoothstep(0.09, 0.0, length(fract(eg) - 0.5 - off * 0.6)) * step(0.88, hash(cell)) * smoothstep(0.05, 0.3, glowWarm);
  c += vec3(1.0, 0.55, 0.2) * ember * (0.6 + 0.4 * sin(t * 9.0 + hash(cell) * 50.0)) * 1.4;
  // The pool of light on the floor breathes with the storm.
  float floorGlow = warm * smoothstep(0.78, 0.84, uv.y);
  c += vec3(1.0, 0.5, 0.22) * floorGlow * (flicker - 0.8 + uStrike) * 0.6;

  // Outside the square image, extend its edges as a blurred, matching backdrop.
  vec3 ext = img(uv, 7.0).rgb * 0.9;
  float inside = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.86, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
  c = mix(ext, c, inside);

  // The word sits behind the smoke and the figure.
  vec2 suv = px / uRes;
  float aspect = uRes.x / uRes.y;

  // Liquid ripple under the cursor.
  vec2 cm = uMouse / uRes;
  vec2 dd = (suv - cm) * vec2(aspect, 1.0);
  float rr = length(dd);
  float ripple = exp(-rr * rr * 36.0);
  vec2 tuv = suv + (dd / max(rr, 1e-4)) * ripple * 0.011 * sin(rr * 70.0 - t * 7.0) / vec2(aspect, 1.0);
  // Heat from the storm and the strike drives how much the letters move.
  float heat = clamp(glowWarm * 1.6 + uStrike * 0.5, 0.0, 1.0);
  tuv += (vec2(fbm(suv * 6.0 + t * 0.3), fbm(suv * 6.0 + 3.1 - t * 0.25)) - 0.5) * 0.007 * (0.35 + heat + ripple * 2.0);
  // On a strong strike, horizontal slices jump for a moment.
  float slice = floor(suv.y * 38.0);
  float jump = step(0.55, uStrike) * step(0.72, hash(vec2(slice, floor(t * 18.0))));
  tuv.x += (hash(vec2(slice, floor(t * 24.0))) - 0.5) * 0.04 * jump;

  // Edges dissolve and re-form with the smoke's turbulence; the word condenses out of noise on load.
  float sharp = texture(uText, tuv).a;
  float tsoft = texture(uText, tuv, 3.0).a;
  float n = fbm(suv * vec2(16.0, 11.0) + vec2(t * 0.18, -t * 0.24));
  float erode = 0.22 + heat * 0.55 + ripple * 0.6;
  float threshold = mix(1.25, 0.5, uTextOn);
  float field = mix(sharp, tsoft, 0.55) + (n - 0.5) * erode;
  float ta = smoothstep(threshold - 0.06, threshold + 0.06, field);
  float edge = smoothstep(threshold - 0.22, threshold, field) * (1.0 - ta);
  float split = 0.0004 + uStrike * 0.006 + ripple * 0.003;
  float taR = smoothstep(threshold - 0.06, threshold + 0.06, mix(texture(uText, tuv + vec2(split, 0.0)).a, tsoft, 0.55) + (n - 0.5) * erode);
  float taB = smoothstep(threshold - 0.06, threshold + 0.06, mix(texture(uText, tuv - vec2(split, 0.0)).a, tsoft, 0.55) + (n - 0.5) * erode);
  float figure = smoothstep(0.05, 0.025, lum(img(uv, 0.0).rgb)) * step(0.6, uv.y) * step(uv.y, 0.83) * step(0.24, uv.x) * step(uv.x, 0.37);
  vec2 sa = vec2(0.34, 0.71), sb = vec2(0.9, 0.22);
  vec2 pa = uv - sa, ba = sb - sa;
  float hseg = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float body = smoothstep(0.21, 0.07, length(pa - ba * hseg) - hseg * 0.04) * above;
  // Smoke stands out from its blurred surroundings; smooth haze does not. The body mask covers the dark core.
  float detail = lum(img(uv + warp, 2.0).rgb) - lum(img(uv + warp, 6.0).rgb) * 0.92;
  float strands = smoothstep(0.012, 0.06, detail) * smoothstep(0.08, 0.16, lum(img(uv + warp, 2.0).rgb)) * above;
  float occlude = clamp(max(strands, body * 0.92) + figure, 0.0, 1.0);
  float vy = smoothstep(uWordTop, uWordBottom, suv.y);
  // Bright white, with just enough shading toward the floor to feel lit from above.
  vec3 ink = mix(vec3(0.98, 0.99, 0.98), vec3(0.8, 0.84, 0.83), vy);
  ink += vec3(1.0, 0.5, 0.22) * glowWarm * (0.45 + uStrike * 0.4);
  float show = (1.0 - occlude) * 0.97;
  c = mix(c, ink, ta * show);
  // Chromatic fringes and glowing edges, strongest near the storm and under the cursor.
  // Warm and cool fringes rather than pure red and blue, to stay in the storm palette.
  c += vec3(1.0, 0.55, 0.3) * max(taR - ta, 0.0) * 0.28 * show;
  c += vec3(0.35, 0.75, 0.8) * max(taB - ta, 0.0) * 0.28 * show;
  float sparkle = 0.6 + 0.4 * noise(suv * 50.0 + t * 5.0);
  c += vec3(1.0, 0.46, 0.16) * edge * (0.15 + heat * 1.3 + uStrike * 1.2 + ripple * 0.6) * sparkle * (1.0 - occlude);

  // Film grain and a gentle vignette.
  c += (hash(px + fract(t * 13.0)) - 0.5) * 0.035;
  vec2 v = suv - vec2(0.55, 0.45);
  c *= 1.0 - dot(v, v) * 0.55;
  outColor = vec4(c, 1.0);
}
`;

export type SceneInput = { pointer: [number, number] };

export class StormScene {
  private gl: WebGL2RenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private imgTex: WebGLTexture;
  private textTex: WebGLTexture;
  private textCanvas = document.createElement('canvas');
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private mouse: [number, number] = [0, 0];
  private vel: [number, number] = [0, 0];
  private parallax: [number, number] = [0, 0];
  private strike = 0;
  private nextAmbient = 2;
  private intro = 0;
  private textOn = 0;
  private ready = false;
  private visible = true;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  strikes = 0;
  private word_ = { top: 0.3, bottom: 0.8, baselineCss: 0 };
  get wordBaseline() { return this.word_.baselineCss; }
  get wordTop() { return this.word_.top * this.canvas.clientHeight; }
  /** Image rect in CSS pixels, for placing overlay elements on top of the picture. */
  rect = { x: 0, y: 0, w: 0, h: 0 };
  onFrame?: (seconds: number) => void;
  onLayout?: () => void;

  constructor(private canvas: HTMLCanvasElement, private image: HTMLImageElement, private input: () => SceneInput, private reduced: boolean, private word = 'LARP') {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.link();
    this.imgTex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.textTex = this.texture();
    this.resize();
    this.mouse = [...this.input().pointer].map((v) => v * this.dpr) as [number, number];
  }

  private texture() {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private link() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link error');
    gl.useProgram(program);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uImg', 'uText', 'uRes', 'uRect', 'uTime', 'uMouse', 'uVel', 'uStrike', 'uParallax', 'uIntro', 'uTextOn', 'uWordTop', 'uWordBottom']) this.u[n] = gl.getUniformLocation(program, n);
    gl.uniform1i(this.u.uImg, 0);
    gl.uniform1i(this.u.uText, 1);
  }

  /** Fit the square picture: full height on wide screens, anchored so the storm sits right of center. */
  resize() {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cw * this.dpr), h = Math.round(ch * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    const size = cw / ch > 1 ? ch * 1.04 : Math.max(ch * 0.9, cw * 1.25);
    const x = cw / ch > 1 ? Math.min(cw - size * 0.86, cw * 0.62 - size * 0.52) : (cw - size) / 2 - size * 0.18;
    const y = cw / ch > 1 ? ch - size : ch * 0.8 - size * 0.62;
    this.rect = { x, y, w: size, h: size };
    this.drawWord();
    this.onLayout?.();
  }

  /** Rasterise the word into a texture the shader can put behind the smoke. */
  drawWord() {
    const { width, height } = this.canvas;
    const ctx = this.textCanvas.getContext('2d')!;
    this.textCanvas.width = width;
    this.textCanvas.height = height;
    ctx.clearRect(0, 0, width, height);
    const portrait = height > width;
    // Left-aligned on the page margin, sized to stay in the open sky clear of the storm and the copy.
    const margin = Math.min(56, Math.max(20, (width / this.dpr) * 0.04)) * this.dpr;
    const baseline = portrait ? (this.rect.y + this.rect.h * 0.17) * this.dpr : height * 0.66;
    let size = width * 0.36;
    ctx.font = `400 ${size}px Anton`;
    const measured = ctx.measureText(this.word).width;
    size *= (width * (portrait ? 0.68 : 0.36)) / measured;
    ctx.font = `400 ${size}px Anton`;
    const capHeight = ctx.measureText(this.word).actualBoundingBoxAscent || size * 0.86;
    this.word_ = { top: (baseline - capHeight) / height, bottom: baseline / height, baselineCss: baseline / this.dpr };
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(this.word, margin - size * 0.02, baseline);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    this.ready = true;
  }

  strikeNow(power = 1) { this.strike = Math.max(this.strike, power); this.strikes++; }

  setVisible(v: boolean) {
    this.visible = v;
    if (v && !this.raf) { this.last = performance.now(); this.loop(); }
  }

  play() { this.loop(); }

  private loop = () => {
    this.raf = 0;
    if (!this.visible) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const seconds = (now - this.start) / 1000;
    const goal = this.input().pointer.map((v) => v * this.dpr) as [number, number];

    // Heavy, smooth follow so the smoke feels like it has mass.
    const k = 1 - Math.exp(-dt * 3.2);
    const nx = this.mouse[0] + (goal[0] - this.mouse[0]) * k;
    const ny = this.mouse[1] + (goal[1] - this.mouse[1]) * k;
    const scale = this.rect.h * this.dpr || 1;
    const vx = (nx - this.mouse[0]) / scale / Math.max(dt, 1e-3);
    const vy = (ny - this.mouse[1]) / scale / Math.max(dt, 1e-3);
    const kv = 1 - Math.exp(-dt * 4);
    this.vel = [this.vel[0] + (vx - this.vel[0]) * kv, this.vel[1] + (vy - this.vel[1]) * kv];
    this.mouse = [nx, ny];
    const cw = this.canvas.width, ch = this.canvas.height;
    const kp = 1 - Math.exp(-dt * 2);
    this.parallax = [this.parallax[0] + ((nx / cw - 0.5) - this.parallax[0]) * kp, this.parallax[1] + ((ny / ch - 0.5) - this.parallax[1]) * kp];

    if (!this.reduced) {
      this.nextAmbient -= dt;
      if (this.nextAmbient <= 0) { this.strike = Math.max(this.strike, 0.25 + Math.random() * 0.45); this.nextAmbient = 1.2 + Math.random() * 2.6; }
      if (Math.hypot(this.vel[0], this.vel[1]) > 0.9 && Math.random() < dt * 2.5) this.strike = Math.max(this.strike, 0.45);
    }
    this.strike *= Math.exp(-dt * 3.5);
    this.intro = Math.min(1, this.intro + dt / 1.6);
    if (this.ready && seconds > 0.5) this.textOn = Math.min(1, this.textOn + dt / 2.2);

    const gl = this.gl, u = this.u;
    const r = this.rect;
    gl.uniform2f(u.uRes, cw, ch);
    gl.uniform4f(u.uRect, r.x * this.dpr, r.y * this.dpr, r.w * this.dpr, r.h * this.dpr);
    gl.uniform1f(u.uTime, this.reduced ? seconds * 0.2 : seconds);
    gl.uniform2f(u.uMouse, nx, ny);
    gl.uniform2f(u.uVel, Math.max(-1.5, Math.min(1.5, this.vel[0])), Math.max(-1.5, Math.min(1.5, this.vel[1])));
    gl.uniform1f(u.uStrike, this.strike);
    gl.uniform2f(u.uParallax, this.reduced ? 0 : this.parallax[0], this.reduced ? 0 : this.parallax[1]);
    gl.uniform1f(u.uIntro, this.reduced ? 0.4 : 1 - Math.pow(1 - this.intro, 3));
    gl.uniform1f(u.uTextOn, 1 - Math.pow(1 - this.textOn, 3));
    gl.uniform1f(u.uWordTop, this.word_.top);
    gl.uniform1f(u.uWordBottom, this.word_.bottom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.onFrame?.(seconds);
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.visible = false; }
}
