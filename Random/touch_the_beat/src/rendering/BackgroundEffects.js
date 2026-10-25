// Procedural neon backdrop: gradient sky, pulsing horizon sun, audio-reactive
// spectrum skyline, warp starfield and a perspective grid floor that scrolls
// one line per musical beat.

export class BackgroundEffects {
  constructor() {
    this.w = 0;
    this.h = 0;
    this.horizonY = 0;
    this.starCount = 0;
    this.sx = new Float32Array(0);
    this.sy = new Float32Array(0);
    this.sz = new Float32Array(0);
    this.seed = 7;
    this.smoothSpectrum = new Float32Array(32);
    this.hue = 0;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  resize(ctx, w, h, horizonY, cx, quality) {
    this.w = w;
    this.h = h;
    this.cx = cx;
    this.horizonY = horizonY;
    this.quality = quality;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04030c');
    sky.addColorStop(Math.max(0.05, Math.min(0.95, horizonY / h)), '#0d0a2e');
    sky.addColorStop(1, '#03020a');
    this.sky = sky;
    const floor = ctx.createLinearGradient(0, horizonY, 0, h);
    floor.addColorStop(0, 'rgba(120,40,255,0.22)');
    floor.addColorStop(1, 'rgba(0,0,0,0)');
    this.floorGlow = floor;
    const bar = ctx.createLinearGradient(0, horizonY - h * 0.16, 0, horizonY);
    bar.addColorStop(0, 'rgba(255,43,214,0)');
    bar.addColorStop(1, 'rgba(255,43,214,0.55)');
    this.barFill = bar;

    // horizon sun sprite (rendered once)
    const r = Math.round(Math.min(w, h) * 0.22);
    const c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const g = c.getContext('2d');
    const rad = g.createRadialGradient(r, r, 0, r, r, r);
    rad.addColorStop(0, 'rgba(255,120,220,0.9)');
    rad.addColorStop(0.35, 'rgba(255,43,214,0.45)');
    rad.addColorStop(0.7, 'rgba(120,40,255,0.15)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, r * 2, r * 2);
    // horizontal stripes cut into the core
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = r + r * 0.1 + i * i * r * 0.018 + i * r * 0.04;
      g.fillRect(0, y, r * 2, 2 + i * 0.9);
    }
    this.sun = c;
    this.sunR = r;

    this.starCount = quality === 'high' ? 110 : quality === 'medium' ? 50 : 0;
    this.sx = new Float32Array(this.starCount);
    this.sy = new Float32Array(this.starCount);
    this.sz = new Float32Array(this.starCount);
    for (let i = 0; i < this.starCount; i++) this.resetStar(i, true);
  }

  resetStar(i, anywhere) {
    this.sx[i] = (this.rand() - 0.5) * 2;
    this.sy[i] = (this.rand() - 0.5) * 2;
    this.sz[i] = anywhere ? this.rand() * 0.9 + 0.1 : 1;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} o { dt, beatPos, energy (0..1), spectrum (Uint8Array|null), pulse (0..1), mode }
   */
  render(ctx, o) {
    const { w, h, horizonY, cx } = this;
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, w, h);

    const pulse = o.pulse || 0;
    const energy = o.energy || 0;

    // sun
    const sr = this.sunR * (1 + pulse * 0.08 + energy * 0.06);
    ctx.globalAlpha = 0.55 + energy * 0.35 + pulse * 0.1;
    ctx.drawImage(this.sun, cx - sr, horizonY - sr * 1.05, sr * 2, sr * 2);
    ctx.globalAlpha = 1;

    // stars (warp toward the viewer, faster with energy)
    if (this.starCount) {
      const speed = 0.06 + energy * 0.35 + pulse * 0.15;
      ctx.fillStyle = '#cfd8ff';
      for (let i = 0; i < this.starCount; i++) {
        this.sz[i] -= o.dt * speed;
        if (this.sz[i] <= 0.05) this.resetStar(i, false);
        const z = this.sz[i];
        const x = cx + (this.sx[i] / z) * w * 0.5;
        const y = horizonY * 0.55 + (this.sy[i] / z) * h * 0.35;
        if (x < 0 || x > w || y < 0 || y > horizonY) {
          this.resetStar(i, false);
          continue;
        }
        const s = (1 - z) * 2.2 + 0.4;
        ctx.globalAlpha = Math.min(1, (1 - z) * 1.4);
        ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // spectrum skyline mirrored around the centre
    const spec = o.spectrum;
    const bins = this.smoothSpectrum;
    const n = bins.length;
    for (let i = 0; i < n; i++) {
      const target = spec ? spec[Math.min(spec.length - 1, 1 + Math.floor(i * 1.4))] / 255 : 0.25 + 0.2 * Math.sin(o.beatPos * 1.3 + i * 0.6) * energy;
      bins[i] += (target - bins[i]) * Math.min(1, o.dt * 14);
    }
    const barW = w / (n * 2);
    const maxH = h * 0.16;
    ctx.fillStyle = this.barFill;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(1, bins[i] * maxH * (0.6 + pulse * 0.4));
      ctx.fillRect(cx + i * barW, horizonY - bh, barW - 1, bh);
      ctx.fillRect(cx - (i + 1) * barW, horizonY - bh, barW - 1, bh);
    }

    // floor
    ctx.fillStyle = '#050314';
    ctx.fillRect(0, horizonY, w, h - horizonY);
    ctx.fillStyle = this.floorGlow;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // grid: vertical lines converge to the vanishing point
    ctx.beginPath();
    const cols = 14;
    for (let i = -cols; i <= cols; i++) {
      const xb = cx + (i / cols) * w * 2.2;
      ctx.moveTo(cx + (i / cols) * w * 0.05, horizonY);
      ctx.lineTo(xb, h);
    }
    // horizontal lines scroll toward the viewer once per beat
    const phase = o.beatPos - Math.floor(o.beatPos);
    const rows = 12;
    const span = h - horizonY;
    for (let k = 0; k < rows; k++) {
      const z = rows - k - phase; // rows..0
      if (z <= 0.15) continue;
      const y = horizonY + span * (0.9 / z);
      if (y > h) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    const glowA = 0.25 + pulse * 0.35 + energy * 0.2;
    if (this.quality !== 'low') {
      ctx.strokeStyle = `rgba(190,60,255,${(glowA * 0.35).toFixed(3)})`;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(220,110,255,${Math.min(0.9, glowA).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // horizon line
    ctx.fillStyle = `rgba(255,120,230,${(0.5 + pulse * 0.5).toFixed(3)})`;
    ctx.fillRect(0, horizonY - 1, w, 2);
  }
}
