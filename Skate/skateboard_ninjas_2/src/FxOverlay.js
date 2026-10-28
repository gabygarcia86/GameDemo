// Screen-space effects on a 2D canvas over the 3D view: speed lines, paint
// splats from evil ninjas (harmless, they just make a mess of the screen
// edges), and colour flashes.

export class FxOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    this.splats = [];
    this.flashColor = '#ffffff';
    this.flashA = 0;
    for (let i = 0; i < 46; i++) this.lines.push(this.newLine(true));
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(dpr, 1.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  newLine(randomR = false) {
    return { a: Math.random() * Math.PI * 2, r: randomR ? Math.random() : 0.35 + Math.random() * 0.1, v: 0.9 + Math.random() * 0.8, w: 1 + Math.random() * 2 };
  }

  splat(color = '#c04dff') {
    // Right in the middle of the screen, a little off-centre each time.
    const x = 0.5 + (Math.random() - 0.5) * 0.12;
    const y = 0.45 + (Math.random() - 0.5) * 0.12;
    const blobs = [];
    for (let i = 0; i < 9; i++) blobs.push({ a: Math.random() * Math.PI * 2, d: Math.random() * 0.8, r: 0.25 + Math.random() * 0.35 });
    const drips = [];
    for (let i = 0; i < 3; i++) drips.push({ x: (Math.random() - 0.5) * 1.2, len: 0.6 + Math.random() * 1.2, w: 0.12 + Math.random() * 0.1 });
    this.splats.push({ x, y, size: 0.25 + Math.random() * 0.2, color, t: 0, life: 2.5, blobs, drips });
  }

  flash(color, strength = 0.5) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, strength);
  }

  clear() {
    this.splats = [];
    this.flashA = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(dt, { speedFrac = 0, lines = true, boost = 0 } = {}) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const s = Math.min(W, H);

    // Speed lines from a vanishing point a little above centre.
    const strength = lines ? Math.max(0, (speedFrac - 0.35) / 0.65) + boost : 0;
    if (strength > 0.01) {
      const cx = W / 2;
      const cy = H * 0.42;
      const maxR = Math.hypot(W, H) * 0.6;
      ctx.lineCap = 'round';
      for (const l of this.lines) {
        l.r += dt * l.v * (1.2 + strength * 2.2);
        if (l.r > 1.1) Object.assign(l, this.newLine());
        const r0 = l.r * maxR;
        const r1 = r0 + maxR * (0.06 + strength * 0.14);
        const ca = Math.cos(l.a), sa = Math.sin(l.a);
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, strength * 0.42) * Math.min(1, l.r * 2)})`;
        ctx.lineWidth = l.w * this.dpr;
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0, cy + sa * r0);
        ctx.lineTo(cx + ca * r1, cy + sa * r1);
        ctx.stroke();
      }
    }

    for (let i = this.splats.length - 1; i >= 0; i--) {
      const p = this.splats[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.splats.splice(i, 1);
        continue;
      }
      const a = p.t < 0.1 ? p.t / 0.1 : Math.min(1, (p.life - p.t) / 0.6);
      const pop = p.t < 0.12 ? 0.6 + (p.t / 0.12) * 0.4 : 1;
      const R = p.size * s * pop;
      const x = p.x * W;
      const y = p.y * H;
      ctx.globalAlpha = a * 0.92;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      for (const b of p.blobs) {
        ctx.moveTo(x + Math.cos(b.a) * b.d * R + b.r * R, y + Math.sin(b.a) * b.d * R);
        ctx.arc(x + Math.cos(b.a) * b.d * R, y + Math.sin(b.a) * b.d * R, b.r * R, 0, Math.PI * 2);
      }
      ctx.fill();
      for (const d of p.drips) {
        const len = d.len * R * Math.min(1, p.t * 1.5);
        ctx.fillRect(x + d.x * R - d.w * R / 2, y, d.w * R, len + R * 0.6);
        ctx.beginPath();
        ctx.arc(x + d.x * R, y + len + R * 0.6, d.w * R * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.flashA > 0.01) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this.flashA *= Math.exp(-dt * 7);
    }
  }
}
