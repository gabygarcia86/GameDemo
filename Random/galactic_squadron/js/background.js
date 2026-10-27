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

// streak length per unit of star speed at full warp (stage clear)
const WARP_STREAK = 5;

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

/**
 * Armored battle-station moon: panelled latitude bands dotted with lit
 * windows, an equatorial trench and a superlaser dish in the upper right.
 * Rendered at 2x so the window lights stay crisp.
 */
function makeBattleStation() {
  const r = rand(70, 110);
  const res = 2;
  const size = Math.ceil(r * 2 + 6);
  const c = document.createElement('canvas');
  c.width = size * res;
  c.height = size * res;
  const g = c.getContext('2d');
  g.setTransform(res, 0, 0, res, (size * res) / 2, (size * res) / 2);

  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.clip();

  const body = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#b9b8c8');
  body.addColorStop(0.55, '#8a899c');
  body.addColorStop(1, '#4a4958');
  g.fillStyle = body;
  g.fillRect(-r, -r, r * 2, r * 2);

  // surface panels: rows between latitudes, columns between longitudes,
  // projected onto the disc so they compress toward the limb and poles
  const trenchLat = -0.09;
  const lights = [];
  for (let lat = -Math.PI / 2 + 0.05; lat < Math.PI / 2 - 0.05;) {
    const step = rand(0.1, 0.16);
    const y0 = r * Math.sin(lat);
    const y1 = r * Math.sin(Math.min(Math.PI / 2, lat + step));
    lat += step;
    if (Math.abs(y0 / r - trenchLat) < 0.03) continue;
    const rowR = r * Math.cos(Math.asin(Math.max(-1, Math.min(1, (y0 + y1) / 2 / r))));
    for (let lon = -Math.PI / 2; lon < Math.PI / 2;) {
      const w = rand(0.08, 0.32);
      const x0 = rowR * Math.sin(lon);
      const x1 = rowR * Math.sin(Math.min(Math.PI / 2, lon + w));
      lon += w;
      const gap = Math.max(0.6, (x1 - x0) * 0.08);
      if (Math.random() < 0.15) continue; // leave some bare plating
      g.fillStyle = `rgba(40,38,58,${rand(0.18, 0.42).toFixed(2)})`;
      g.fillRect(x0 + gap, y0 + 0.7, x1 - x0 - gap * 2, y1 - y0 - 1.4);
      const n = Math.floor(((x1 - x0) * (y1 - y0)) / 22);
      for (let i = 0; i < n; i++) lights.push(rand(x0 + gap, x1 - gap), rand(y0 + 1, y1 - 1));
    }
  }
  g.fillStyle = 'rgba(240,232,190,0.75)';
  for (let i = 0; i < lights.length; i += 2) g.fillRect(lights[i], lights[i + 1], 0.7, 0.7);

  // equatorial trench, bowed slightly by the viewing angle
  const ty = r * trenchLat;
  g.lineWidth = r * 0.028;
  g.strokeStyle = '#17161e';
  g.beginPath();
  g.moveTo(-r, ty + r * 0.08);
  g.quadraticCurveTo(0, ty - r * 0.06, r, ty + r * 0.08);
  g.stroke();
  g.lineWidth = r * 0.012;
  g.strokeStyle = 'rgba(220,218,235,0.55)';
  g.beginPath();
  g.moveTo(-r, ty + r * 0.11);
  g.quadraticCurveTo(0, ty - r * 0.03, r, ty + r * 0.11);
  g.stroke();

  // superlaser dish: a concave bowl, so it is lit from the opposite side
  const dx = r * 0.46;
  const dy = -r * 0.55;
  const dr = r * 0.25;
  g.fillStyle = '#8f8ea0';
  g.beginPath();
  g.ellipse(dx, dy, dr * 1.08, dr * 1.03, -0.3, 0, TAU);
  g.fill();
  const bowl = g.createRadialGradient(dx + dr * 0.35, dy + dr * 0.3, dr * 0.1, dx, dy, dr);
  bowl.addColorStop(0, '#c9c8d4');
  bowl.addColorStop(0.6, '#7d7c8c');
  bowl.addColorStop(1, '#45444f');
  g.fillStyle = bowl;
  g.beginPath();
  g.ellipse(dx, dy, dr, dr * 0.95, -0.3, 0, TAU);
  g.fill();
  g.strokeStyle = '#2b2a33';
  g.lineWidth = r * 0.012;
  g.stroke();
  g.strokeStyle = 'rgba(40,39,50,0.45)';
  g.lineWidth = r * 0.006;
  for (const k of [0.75, 0.5]) {
    g.beginPath();
    g.ellipse(dx - dr * 0.05 * (1 - k), dy + dr * 0.03 * (1 - k), dr * k, dr * k * 0.95, -0.3, 0, TAU);
    g.stroke();
  }
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.moveTo(dx - dr * 0.08 + Math.cos(a) * dr * 0.2, dy + dr * 0.06 + Math.sin(a) * dr * 0.2);
    g.lineTo(dx + Math.cos(a) * dr * 0.95, dy + Math.sin(a) * dr * 0.9);
  }
  g.stroke();
  g.fillStyle = '#26252d';
  g.beginPath();
  g.arc(dx - dr * 0.08, dy + dr * 0.06, dr * 0.17, 0, TAU);
  g.fill();

  // smooth southern cap and terminator shading
  g.fillStyle = 'rgba(30,29,40,0.35)';
  g.fillRect(-r, r * 0.78, r * 2, r);
  const shade = g.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.5, 0, 0, r * 1.25);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,8,0.82)');
  g.fillStyle = shade;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();

  g.strokeStyle = 'rgba(210,210,230,0.3)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, r, Math.PI * 0.95, Math.PI * 1.65);
  g.stroke();

  return { canvas: c, size, x: rand(80, W - 80), y: -size / 2, speed: rand(6, 10), alpha: rand(0.75, 0.9) };
}

/** Next drifting backdrop body: usually a planet, sometimes the battle station. */
function makeBackdropBody() {
  return Math.random() < 0.3 ? makeBattleStation() : makePlanet();
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
    this.planet = makeBackdropBody();
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
      // wrap only once the whole streak tail has left the screen
      const tail = this.streakLength(l);
      for (let i = 0; i < l.count; i++) {
        l.y[i] += v;
        if (l.y[i] > H + 6 + tail) {
          l.y[i] -= H + 12 + tail;
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
      if (this.planetTimer <= 0) this.planet = makeBackdropBody();
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

  /** Length of a star's warp streak (stage-clear jump); 0 when not warping. */
  streakLength(l) {
    return this.warp > 0.05 ? this.warp * l.speed * WARP_STREAK : 0;
  }

  drawStars(ctx, l) {
    ctx.fillStyle = l.color;
    const streak = this.streakLength(l);
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
      ctx.drawImage(p.canvas, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
