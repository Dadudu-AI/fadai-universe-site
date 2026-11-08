/* Fadai Universe — particle engine
   A single canvas renderer that morphs between the three living forms
   (orb / jelly / whale) and reacts to a synthetic beat or real microphone. */

(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // palette sampled from the real app: warm bloom core → pink → cyan → pale green
  const PALETTE = [
    [255, 232, 130],
    [255, 168, 96],
    [255, 104, 168],
    [206, 118, 255],
    [108, 196, 255],
    [132, 255, 202]
  ];

  function paletteAt(t) {
    t = clamp(t, 0, 0.9999) * (PALETTE.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    const a = PALETTE[i];
    const b = PALETTE[i + 1] || PALETTE[i];
    return [lerp(a[0], b[0], f) | 0, lerp(a[1], b[1], f) | 0, lerp(a[2], b[2], f) | 0];
  }

  // ── deterministic noise ────────────────────────────────────────────────
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const BANDS = 26;

  class OrbEngine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.count = opts.count || 1500;
      this.mode = opts.mode || 'orb';
      this.w = { orb: 1, jelly: 0, whale: 0 };
      this.wTarget = { orb: 1, jelly: 0, whale: 0 };
      this.spectrum = new Float32Array(BANDS);
      this.prevEnergy = 0;
      this.rings = [];
      this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      this.spin = 0;
      this.t = 0;
      this.pitch = opts.pitch === undefined ? -0.22 : opts.pitch;
      this.zoom = opts.zoom || 1;
      this.cxf = opts.cxf === undefined ? 0.5 : opts.cxf;
      this.cyf = opts.cyf === undefined ? 0.5 : opts.cyf;
      this.analyser = null;
      this.freq = null;
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this._build();
      this._bindResize();
      if (opts.interactive !== false) this._bindPointer(opts.pointerEl);
      this._last = performance.now();
      this._frame = this._frame.bind(this);
      requestAnimationFrame(this._frame);
    }

    // ── geometry ─────────────────────────────────────────────────────────
    _build() {
      const n = this.count;
      this.px = new Float32Array(n * 3);
      this.py = new Float32Array(n * 3);
      this.pz = new Float32Array(n * 3);
      this.bo = new Uint8Array(n);
      this.bj = new Uint8Array(n);
      this.bh = new Uint8Array(n);
      this.size = new Float32Array(n);
      this.jit = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        // orb — fibonacci sphere with a soft shell
        const k = i + 0.5;
        const phi = Math.acos(1 - (2 * k) / n);
        const theta = Math.PI * (1 + Math.sqrt(5)) * k;
        const shell = 0.94 + rnd() * 0.14;
        this.px[i * 3] = Math.sin(phi) * Math.cos(theta) * shell;
        this.py[i * 3] = Math.cos(phi) * shell;
        this.pz[i * 3] = Math.sin(phi) * Math.sin(theta) * shell;

        // jelly — dome + tentacles
        const dome = rnd() < 0.66;
        let jx, jy, jz;
        if (dome) {
          const a = rnd() * TAU;
          const up = Math.pow(rnd(), 0.55); // dense near the rim
          const rr = Math.sqrt(1 - up * up * 0.92);
          jx = Math.cos(a) * rr * 1.02;
          jy = up * 0.62 + 0.02;
          jz = Math.sin(a) * rr * 1.02;
        } else {
          const strand = Math.floor(rnd() * 9);
          const u = Math.pow(rnd(), 0.75);
          const a = (strand / 9) * TAU + u * 1.1;
          const rr = 0.82 * (1 - 0.42 * u);
          jx = Math.cos(a) * rr;
          jy = 0.02 - u * 1.75;
          jz = Math.sin(a) * rr;
        }
        this.px[i * 3 + 1] = jx;
        this.py[i * 3 + 1] = jy;
        this.pz[i * 3 + 1] = jz;

        // whale — tapered spindle with a fluke
        // head-heavy spindle: dense rounded head at u>0, tapering to a fluke
        const u = Math.pow(rnd(), 0.72) * 2 - 1;
        const taper = Math.pow(Math.max(0, 1 - Math.abs(u)), 0.5);
        const fluke = u < -0.86;
        const a2 = rnd() * TAU;
        const fill = rnd() < 0.5 ? 0.3 + Math.pow(rnd(), 0.7) * 0.7 : 1;
        const rad = (fluke ? 0.06 + rnd() * 0.3 : Math.max(0.16, taper) * 0.58) * fill;
        this.px[i * 3 + 2] = u * 1.28;
        this.py[i * 3 + 2] = Math.cos(a2) * rad * (fluke ? 1.3 : 1);
        this.pz[i * 3 + 2] = Math.sin(a2) * rad * 0.78;

        // angular bands: petals are attached to the body, so energy is
        // sampled by longitude (orb/jelly) or by length (whale)
        const lonO = Math.atan2(this.pz[i * 3], this.px[i * 3]);
        const lonJ = Math.atan2(this.pz[i * 3 + 1], this.px[i * 3 + 1]);
        this.bo[i] = Math.min(BANDS - 1, Math.floor(((lonO + Math.PI) / TAU) * BANDS));
        this.bj[i] = Math.min(BANDS - 1, Math.floor(((lonJ + Math.PI) / TAU) * BANDS));
        this.bh[i] = Math.min(BANDS - 1, Math.floor(clamp((this.px[i * 3 + 2] + 1.75) / 3.5, 0, 0.999) * BANDS));
        this.size[i] = 0.55 + Math.pow(rnd(), 2) * 1.7;
        this.jit[i] = rnd() * TAU;
        // 30% of the orb lives inside the shell so the core glows instead of hollowing out
        if (rnd() < 0.3) {
          const k2 = 0.35 + Math.pow(rnd(), 1.5) * 0.6;
          this.px[i * 3] *= k2;
          this.py[i * 3] *= k2;
          this.pz[i * 3] *= k2;
        }
      }
    }

    _bindResize() {
      const fit = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = this.canvas.getBoundingClientRect();
        this.W = this.canvas.width = Math.max(1, Math.round(r.width * dpr));
        this.H = this.canvas.height = Math.max(1, Math.round(r.height * dpr));
        this.dpr = dpr;
      };
      fit();
      this._observer = new ResizeObserver(fit);
      this._observer.observe(this.canvas);
    }

    _bindPointer(el) {
      const c = this.canvas;
      const target = el || c;
      const move = (e) => {
        const r = c.getBoundingClientRect();
        this.mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        this.mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerleave', () => {
        this.mouse.tx = 0;
        this.mouse.ty = 0;
      });
    }

    setMode(mode) {
      this.mode = mode;
      this.wTarget = { orb: 0, jelly: 0, whale: 0 };
      this.wTarget[mode] = 1;
    }

    async useMic() {
      if (this.analyser) return true;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.72;
      src.connect(this.analyser);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      return true;
    }

    // ── audio → spectrum ─────────────────────────────────────────────────
    _readSpectrum(dt) {
      if (this.analyser) {
        this.analyser.getByteFrequencyData(this.freq);
        const bins = this.freq.length;
        for (let i = 0; i < BANDS; i++) {
          const lo = Math.floor(Math.pow(i / BANDS, 1.7) * bins * 0.52);
          const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / BANDS, 1.7) * bins * 0.52));
          let s = 0;
          for (let b = lo; b < hi; b++) s += this.freq[b];
          const v = s / (hi - lo) / 255;
          this.spectrum[i] = lerp(this.spectrum[i], Math.pow(v, 1.15), 0.35);
        }
        return;
      }
      // synthetic "now playing" spectrum
      const t = this.t;
      const beat = (t * 1.34) % 1;
      const kick = Math.exp(-beat * 7);
      for (let i = 0; i < BANDS; i++) {
        const floor = 0.16 + 0.06 * Math.sin(t * 0.7 + i * 0.9);
        const bass = Math.exp(-Math.pow((i - 3) / 3.6, 2)) * (0.46 + beat * 0.85);
        const mid = Math.exp(-Math.pow((i - 11) / 6.0, 2)) * (0.42 + 0.30 * Math.sin(t * 1.7 + i * 0.4));
        const air = Math.exp(-Math.pow((i - 20) / 4.4, 2)) * (0.34 + 0.22 * Math.sin(t * 0.9 + i));
        const wobble = 0.10 * Math.sin(t * 2.3 + i * 1.7) + 0.06 * Math.sin(t * 4.1 - i);
        this.spectrum[i] = clamp(floor + bass + mid + air + wobble + kick * 0.35 * Math.exp(-Math.pow((i - 1) / 2.5, 2)), 0, 1.7);
      }
      if (kick > 0.86 && this.rings.length < 5) this._spawnRing(0.35 + kick * 0.5);
    }

    _spawnRing(power) {
      this.rings.push({ r: 0.22, a: 0.55 * power, sp: 0.9 + power });
    }

    // ── render ───────────────────────────────────────────────────────────
    _frame(now) {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.t += this.reduced ? dt * 0.25 : dt;
      this._readSpectrum(dt);

      // ease weights
      for (const k of ['orb', 'jelly', 'whale']) this.w[k] = lerp(this.w[k], this.wTarget[k], 1 - Math.pow(0.001, dt));

      this.mouse.x = lerp(this.mouse.x, this.mouse.tx, 0.06);
      this.mouse.y = lerp(this.mouse.y, this.mouse.ty, 0.06);
      this.spin += dt * (this.mode === 'whale' ? 0.16 : 0.3);

      const ctx = this.ctx;
      const W = this.W, H = this.H;
      ctx.clearRect(0, 0, W, H);

      const cx = W * this.cxf, cy = H * this.cyf;
      const R = Math.min(W, H) * 0.34 * this.zoom;
      let energy = 0;
      for (let i = 0; i < BANDS; i++) energy += this.spectrum[i];
      energy = energy / BANDS;
      this.prevEnergy = lerp(this.prevEnergy, energy, 0.15);

      const rotY = this.spin + this.mouse.x * 0.5;
      const rotX = this.pitch + this.mouse.y * 0.28;

      this._drawGlow(ctx, cx, cy, R, energy);
      this._drawParticles(ctx, cx, cy, R, rotX, rotY, energy);
      this._drawRings(ctx, cx, cy, R, dt);

      requestAnimationFrame(this._frame);
    }

    _drawGlow(ctx, cx, cy, R, energy) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.05);
      const a = 0.06 + energy * 0.16;
      g.addColorStop(0, `rgba(255,236,180,${a * 1.2})`);
      g.addColorStop(0.22, `rgba(255,140,190,${a * 0.6})`);
      g.addColorStop(0.48, `rgba(140,120,255,${a * 0.28})`);
      g.addColorStop(1, 'rgba(6,8,20,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // tight hot core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42);
      core.addColorStop(0, `rgba(255,244,214,${0.20 + energy * 0.30})`);
      core.addColorStop(0.45, `rgba(255,190,140,${0.07 + energy * 0.12})`);
      core.addColorStop(1, 'rgba(255,150,190,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.42, 0, TAU);
      ctx.fill();

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 2.05, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    _drawParticles(ctx, cx, cy, R, rotX, rotY, energy) {
      const n = this.count;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const wO = this.w.orb, wJ = this.w.jelly, wH = this.w.whale;
      const spec = this.spectrum;
      const t = this.t;

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        let x = this.px[i3] * wO + this.px[i3 + 1] * wJ + this.px[i3 + 2] * wH;
        let y = this.py[i3] * wO + this.py[i3 + 1] * wJ + this.py[i3 + 2] * wH;
        let z = this.pz[i3] * wO + this.pz[i3 + 1] * wJ + this.pz[i3 + 2] * wH;

        // energy of the angular band this particle belongs to (per form)
        const e = spec[this.bo[i]] * wO + spec[this.bj[i]] * wJ + spec[this.bh[i]] * wH;
        const b = Math.round(this.bo[i] * wO + this.bj[i] * wJ + this.bh[i] * wH) % BANDS;
        const rl = Math.sqrt(x * x + y * y + z * z) || 1;
        const breathe = 1 + Math.sin(t * 1.1 + this.jit[i]) * 0.012;
        // squared energy → sharp petals, plus barely-there idle breathing
        const spike = 1 + (e * e * 0.46 + e * 0.06 + Math.sin(t * 2.4 + this.jit[i]) * 0.012) * breathe;
        const bx = x, by = y, bz = z;
        x = (x / rl) * rl * spike;
        y = (y / rl) * rl * spike;
        z = (z / rl) * rl * spike;

        // whale tail sway
        if (wH > 0.01) y += Math.sin(t * 1.6 + x * 2.4) * 0.08 * wH * (1 - Math.abs(x) * 0.4);
        // jelly tentacles drift
        if (wJ > 0.01 && y < 0) y += Math.sin(t * 0.9 + this.jit[i]) * 0.05 * wJ;

        // rotate Y then X
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        const persp = 3.2 / (3.2 + z2);
        const sx = cx + x1 * R * persp;
        const sy = cy - y1 * R * persp;
        const depth = clamp((persp - 0.72) / 0.7, 0, 1);
        const alpha = (0.1 + depth * 0.85) * (0.42 + e * 0.75);
        const col = paletteAt((b / BANDS) * 0.92 + 0.08 * Math.sin(t * 0.4 + this.jit[i]));
        const size = this.size[i] * this.dpr * (0.5 + depth * 1.6) * (1 + e * 0.6);
        const rgba = `rgba(${col[0]},${col[1]},${col[2]},`;

        // radial petal streak: base → tip, only where the music pushes
        if (e > 0.28 && depth > 0.3 && rl > 0.72 && wO > 0.55) {
          const obx1 = bx * cosY - bz * sinY;
          const obz1 = bx * sinY + bz * cosY;
          const oby1 = by * cosX - obz1 * sinX;
          const obz2 = by * sinX + obz1 * cosX;
          const p2 = 3.2 / (3.2 + obz2);
          ctx.strokeStyle = rgba + clamp(alpha * 0.45, 0, 0.62) + ')';
          ctx.lineWidth = Math.max(0.7, this.dpr * 0.9);
          ctx.beginPath();
          ctx.moveTo(cx + obx1 * R * p2, cy - oby1 * R * p2);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }

        ctx.fillStyle = rgba + clamp(alpha, 0, 0.95) + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    _drawRings(ctx, cx, cy, R, dt) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.r += r.sp * dt;
        r.a *= 0.985;
        if (r.r > 2.1 || r.a < 0.01) {
          this.rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(255,214,140,${r.a * 0.35})`;
        ctx.lineWidth = 1.2 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, R * r.r, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── ambient starfield (separate, cheap layer) ──────────────────────────
  class Starfield {
    constructor(canvas, count = 220) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        r: Math.random() * 1.3 + 0.25,
        p: Math.random() * TAU
      }));
      this._fit();
      new ResizeObserver(() => this._fit()).observe(canvas);
      this._t = 0;
      this._loop();
    }
    _fit() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, r.width * dpr);
      this.canvas.height = Math.max(1, r.height * dpr);
      this.dpr = dpr;
      this.w = r.width;
      this.h = r.height;
    }
    _loop() {
      this._t += 0.016;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const s of this.stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this._t * (0.6 + s.z) + s.p));
        const a = (0.18 + s.z * 0.6) * tw;
        ctx.fillStyle = `rgba(220,228,255,${a})`;
        ctx.beginPath();
        ctx.arc(s.x * this.canvas.width, s.y * this.canvas.height, s.r * this.dpr * (0.6 + s.z), 0, TAU);
        ctx.fill();
      }
      requestAnimationFrame(() => this._loop());
    }
  }

  window.FadaiOrb = { OrbEngine, Starfield };
})();
