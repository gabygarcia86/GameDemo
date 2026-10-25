// Fixed-size pools for particles (world space) and floating score text
// (screen space). Nothing is allocated while playing.

const TAU = Math.PI * 2;
const CONFETTI = ['#ff3d7f', '#ffd23f', '#3de1ff', '#4dff9a', '#b57bff'];

export class Particles {
  constructor(max = 280, maxTexts = 16) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ active: false, type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '', rot: 0, vr: 0, g: 0 });
    }
    this.texts = [];
    for (let i = 0; i < maxTexts; i++) {
      this.texts.push({ active: false, text: '', x: 0, y: 0, vy: 0, life: 0, max: 1, color: '', size: 20 });
    }
    this.cursor = 0;
    this.textCursor = 0;
  }

  clear() {
    for (const p of this.items) p.active = false;
    for (const t of this.texts) t.active = false;
  }

  spawn(type, x, y, vx, vy, life, size, color, g = 0) {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    p.active = true; p.type = type;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color; p.g = g;
    p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 12;
    return p;
  }

  dust(x, y, n = 8, spread = 1) {
    for (let i = 0; i < n; i++) {
      this.spawn('dust', x + (Math.random() - 0.5) * 30 * spread, y + 2, (Math.random() - 0.6) * 140 * spread, Math.random() * 90, 0.45 + Math.random() * 0.3, 4 + Math.random() * 5, 'rgba(235,225,255,', -150);
    }
  }

  sparks(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.spawn('spark', x + (Math.random() - 0.5) * 10, y, -160 - Math.random() * 220, 80 + Math.random() * 260, 0.25 + Math.random() * 0.2, 2, Math.random() < 0.5 ? '#ffe066' : '#ff9f1c', 1400);
    }
  }

  smoke(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.spawn('smoke', x + Math.cos(a) * 10, y + 40 + Math.sin(a) * 20, Math.cos(a) * 120, Math.sin(a) * 90 + 40, 0.6 + Math.random() * 0.3, 10 + Math.random() * 8, 'rgba(200,190,230,', -60);
    }
  }

  confetti(x, y, n = 18) {
    for (let i = 0; i < n; i++) {
      this.spawn('confetti', x, y + 50, (Math.random() - 0.5) * 420, 260 + Math.random() * 320, 1 + Math.random() * 0.5, 4 + Math.random() * 3, CONFETTI[i % CONFETTI.length], 900);
    }
  }

  // Cartoon explosion: a flash, fireball puffs, radial sparks, and debris in
  // the victim's colours.
  explode(x, y, colors) {
    this.spawn('flash', x, y, 0, 0, 0.22, 46, '#fff6c2');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + Math.random() * 0.4;
      const v = 80 + Math.random() * 140;
      const color = i % 3 === 0 ? 'rgba(90,80,100,' : 'rgba(255,140,40,';
      this.spawn('smoke', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45 + Math.random() * 0.3, 10 + Math.random() * 8, color, -40);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const v = 300 + Math.random() * 300;
      this.spawn('spark', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.2, 2.5, Math.random() < 0.5 ? '#ffe066' : '#ff9f1c', 600);
    }
    for (let i = 0; i < 14; i++) {
      this.spawn('confetti', x, y, (Math.random() - 0.5) * 480, 200 + Math.random() * 360, 0.9 + Math.random() * 0.5, 5 + Math.random() * 4, colors[i % colors.length], 1100);
    }
  }

  trail(x, y) {
    this.spawn('trail', x, y, -60, (Math.random() - 0.5) * 30, 0.35, 3 + Math.random() * 2, '#ff2e55', 0);
  }

  // Screen-space floating text (sx, sy in view units).
  text(text, sx, sy, color = '#ffd23f', size = 20) {
    const t = this.texts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % this.texts.length;
    t.active = true; t.text = text; t.x = sx; t.y = sy; t.vy = -46;
    t.life = 1.1; t.max = 1.1; t.color = color; t.size = size;
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'dust' || p.type === 'smoke') { p.vx *= 0.96; p.vy *= 0.96; }
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      t.y += t.vy * dt;
      t.vy *= 0.97;
    }
  }

  // World-space draw; the caller has translated so y=0 is the street (y down = positive).
  draw(ctx) {
    for (const p of this.items) {
      if (!p.active) continue;
      const k = p.life / p.max;
      switch (p.type) {
        case 'dust':
        case 'smoke': {
          ctx.fillStyle = p.color + (k * (p.type === 'smoke' ? 0.75 : 0.6)).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, -p.y, p.size * (1.6 - k * 0.6), 0, TAU);
          ctx.fill();
          break;
        }
        case 'spark':
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = Math.min(1, k * 1.5);
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, -p.y);
          ctx.lineTo(p.x - p.vx * 0.025, -p.y + p.vy * 0.025);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, -p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'flash':
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, -p.y, p.size * (1.4 - k * 0.6), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        case 'trail':
          ctx.globalAlpha = k * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, -p.y, p.size * k, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
      }
    }
  }

  drawTexts(ctx, font) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      if (!t.active) continue;
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `900 ${Math.round(t.size * pop)}px ${font}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#140c2b';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
