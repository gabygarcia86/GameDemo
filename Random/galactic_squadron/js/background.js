/**
 * Deep-space backdrop: a scrolling nebula, three parallax star layers,
 * occasional drifting planets and far-off ship convoys. All generated at runtime.
 */
import { WORLD } from './config.js';
import { TAU, rand, pick, hexToRgba } from './utils.js';

const { W, H } = WORLD;

const STAR_LAYERS = [
  { count: 70, speed: 14, size: 1.1, alpha: 0.55, color: '#9fb8ff' },
  { count: 44, speed: 34, size: 1.6, alpha: 0.75, color: '#dbe6ff' },
  { count: 22, speed: 72, size: 2.2, alpha: 0.95, color: '#ffffff' },
];

const PLANET_PALETTES = [
  ['#4f86ff', '#0b1740', '#9cc4ff'],
  ['#d0673f', '#2a0c12', '#ffb08a'],
  ['#7a5bff', '#140b33', '#c7b5ff'],
  ['#2fb3a6', '#062626', '#9cf2e6'],
  ['#c9a05a', '#251a08', '#ffe2a8'],
];

function makeNebula() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#03050d';
  g.fillRect(0, 0, W, H);

  const blobs = [
    [120, 180, 280, '#6e28aa', 0.2],
    [440, 520, 320, '#1e50be', 0.18],
    [190, 820, 250, '#148caa', 0.12],
    [480, 110, 190, '#be2858', 0.1],
    [60, 520, 200, '#3a1e8c', 0.14],
    [330, 330, 160, '#2a6cff', 0.08],
  ];
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, color, a] of blobs) {
    // draw each blob three times, offset by the canvas height, so the texture tiles vertically
    for (const dy of [-H, 0, H]) {
      const gr = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
      gr.addColorStop(0, hexToRgba(color, a));
      gr.addColorStop(0.55, hexToRgba(color, a * 0.4));
      gr.addColorStop(1, hexToRgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y + dy - r, r * 2, r * 2);
    }
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(200,215,255,${rand(0.04, 0.22).toFixed(3)})`;
    const s = rand(0.5, 1.2);
    g.fillRect(rand(0, W), rand(0, H), s, s);
  }
  return c;
}

function makePlanet() {
  const r = rand(55, 125);
  const [base, dark, light] = pick(PLANET_PALETTES);
  const ringed = Math.random() < 0.4;
  const pad = ringed ? r * 0.9 : r * 0.25;
  const size = Math.ceil((r + pad) * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const tilt = rand(-0.35, 0.35);

  const ring = (start, end) => {
    g.save();
    g.translate(cx, cx);
    g.rotate(tilt);
    g.strokeStyle = hexToRgba(light, 0.35);
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.ellipse(0, 0, r * 1.7, r * 0.38, 0, start, end);
    g.stroke();
    g.strokeStyle = hexToRgba(light, 0.18);
    g.lineWidth = r * 0.05;
    g.beginPath();
    g.ellipse(0, 0, r * 1.45, r * 0.3, 0, start, end);
    g.stroke();
    g.restore();
  };
  if (ringed) ring(Math.PI, TAU);

  g.save();
  g.beginPath();
  g.arc(cx, cx, r, 0, TAU);
  g.clip();
  const body = g.createRadialGradient(cx - r * 0.4, cx - r * 0.4, r * 0.1, cx, cx, r);
  body.addColorStop(0, light);
  body.addColorStop(0.45, base);
  body.addColorStop(1, dark);
  g.fillStyle = body;
  g.fillRect(0, 0, size, size);
  g.translate(cx, cx);
  g.rotate(tilt);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = hexToRgba(i % 2 ? dark : light, rand(0.05, 0.16));
    g.fillRect(-r, rand(-r, r), r * 2, rand(r * 0.04, r * 0.18));
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const shade = g.createRadialGradient(cx - r * 0.5, cx - r * 0.5, r * 0.6, cx, cx, r * 1.25);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,8,0.85)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  g.restore();

  g.strokeStyle = hexToRgba(light, 0.35);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cx, r, Math.PI * 0.9, Math.PI * 1.7);
  g.stroke();
  if (ringed) ring(0, Math.PI);

  return { canvas: c, size, x: rand(60, W - 60), y: -size / 2, speed: rand(7, 13), alpha: rand(0.55, 0.8) };
}

export class Background {
  constructor() {
    this.layers = STAR_LAYERS.map((l) => {
      const layer = { ...l, x: new Float32Array(l.count), y: new Float32Array(l.count), p: new Float32Array(l.count) };
      for (let i = 0; i < l.count; i++) {
        layer.x[i] = rand(0, W);
        layer.y[i] = rand(0, H);
        layer.p[i] = rand(0, TAU);
      }
      return layer;
    });
    this.nebula = makeNebula();
    this.nebulaY = 0;
    this.planet = makePlanet();
    this.planet.y = H * 0.35;
    this.planetTimer = 0;
    this.ships = [];
    this.shipTimer = rand(5, 10);
    this.warp = 0;
    this.warpTarget = 0;
    this.time = 0;
    this.low = false;
  }

  update(dt) {
    this.time += dt;
    this.warp += (this.warpTarget - this.warp) * Math.min(1, dt * 2.5);
    const mul = 1 + this.warp * 9;

    for (const l of this.layers) {
      const v = l.speed * mul * dt;
      for (let i = 0; i < l.count; i++) {
        l.y[i] += v;
        if (l.y[i] > H + 6) {
          l.y[i] -= H + 12;
          l.x[i] = rand(0, W);
        }
      }
    }

    this.nebulaY = (this.nebulaY + 6 * (1 + this.warp * 2) * dt) % H;

    if (this.planet) {
      this.planet.y += this.planet.speed * (1 + this.warp * 1.5) * dt;
      if (this.planet.y - this.planet.size / 2 > H) {
        this.planet = null;
        this.planetTimer = rand(20, 40);
      }
    } else {
      this.planetTimer -= dt;
      if (this.planetTimer <= 0) this.planet = makePlanet();
    }

    this.shipTimer -= dt;
    if (this.shipTimer <= 0) {
      this.shipTimer = rand(12, 26);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const count = Math.random() < 0.4 ? 3 : 1;
      const y = rand(140, H * 0.6);
      const speed = rand(18, 34);
      for (let i = 0; i < count; i++) {
        this.ships.push({
          x: dir > 0 ? -20 - i * 22 : W + 20 + i * 22,
          y: y + i * 9,
          vx: dir * speed,
          s: rand(0.7, 1.1),
        });
      }
    }
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      s.x += s.vx * dt;
      s.y += 4 * dt;
      if (s.x < -80 || s.x > W + 80) this.ships.splice(i, 1);
    }
  }

  drawStars(ctx, l) {
    ctx.fillStyle = l.color;
    const streak = this.warp > 0.05 ? this.warp * l.speed * 0.5 : 0;
    for (let i = 0; i < l.count; i++) {
      const tw = l.speed < 20 ? 0.6 + 0.4 * Math.sin(this.time * 2 + l.p[i]) : 1;
      ctx.globalAlpha = l.alpha * tw;
      if (streak) ctx.fillRect(l.x[i], l.y[i] - streak, l.size * 0.8, streak + l.size);
      else ctx.fillRect(l.x[i], l.y[i], l.size, l.size);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    const ny = this.nebulaY;
    ctx.drawImage(this.nebula, 0, ny - H, W, H);
    ctx.drawImage(this.nebula, 0, ny, W, H);

    this.drawStars(ctx, this.layers[0]);

    if (this.planet) {
      const p = this.planet;
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(p.canvas, p.x - p.size / 2, p.y - p.size / 2);
      ctx.globalAlpha = 1;
    }

    if (!this.low) {
      for (const s of this.ships) {
        const dir = Math.sign(s.vx);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#5a6788';
        ctx.beginPath();
        ctx.moveTo(s.x + dir * 9 * s.s, s.y);
        ctx.lineTo(s.x - dir * 6 * s.s, s.y - 3.5 * s.s);
        ctx.lineTo(s.x - dir * 6 * s.s, s.y + 3.5 * s.s);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 9 + s.y);
        ctx.fillStyle = '#7fd8ff';
        ctx.fillRect(s.x - dir * 7.5 * s.s - 1, s.y - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    this.drawStars(ctx, this.layers[1]);
    this.drawStars(ctx, this.layers[2]);
  }
}
