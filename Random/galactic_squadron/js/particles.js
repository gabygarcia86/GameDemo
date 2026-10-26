/**
 * Pooled particle system (explosions, sparks, smoke, shockwaves, debris) plus
 * floating score text. Counts are capped and scaled down in reduced-effects mode.
 */
import { CONFIG } from './config.js';
import { Pool, TAU, rand } from './utils.js';
import { getGlow, getSprites } from './sprites.js';

const GLOW = 0;
const SPARK = 1;
const SMOKE = 2;
const RING = 3;
const DEBRIS = 4;

const TEXT_FONT_CACHE = new Map();
function textFont(size) {
  let f = TEXT_FONT_CACHE.get(size);
  if (!f) {
    f = `800 ${size}px ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace`;
    TEXT_FONT_CACHE.set(size, f);
  }
  return f;
}

export class Particles {
  constructor() {
    this.pool = new Pool(
      () => ({ type: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, color: '#fff', drag: 0, rot: 0, vr: 0 }),
      CONFIG.effects.maxParticles,
    );
    this.texts = new Pool(() => ({ x: 0, y: 0, text: '', life: 0, max: 1, color: '#fff', size: 16 }), CONFIG.effects.maxTexts);
    this.limit = CONFIG.effects.maxParticles;
    this.intensity = 1;
    this.smoke = getSprites().smoke;
  }

  setReduced(reduced) {
    this.limit = reduced ? CONFIG.effects.maxParticlesLow : CONFIG.effects.maxParticles;
    this.intensity = reduced ? 0.45 : 1;
  }

  clear() {
    this.pool.clear();
    this.texts.clear();
  }

  add(type, x, y, vx, vy, life, size, color, drag = 0, grow = 0) {
    if (this.pool.count >= this.limit) return null;
    const p = this.pool.obtain();
    if (!p) return null;
    p.type = type;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life;
    p.size = size; p.grow = grow;
    p.color = color; p.drag = drag;
    p.rot = rand(0, TAU); p.vr = rand(-8, 8);
    return p;
  }

  burst(type, x, y, n, speedMin, speedMax, lifeMin, lifeMax, sizeMin, sizeMax, color, drag = 2) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(speedMin, speedMax);
      this.add(type, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(lifeMin, lifeMax), rand(sizeMin, sizeMax), color, drag);
    }
  }

  explosion(x, y, { color = '#ff9a3c', size = 1, debris = '#5a6378' } = {}) {
    const k = this.intensity;
    const n = Math.max(4, Math.round(14 * size * k));
    this.add(GLOW, x, y, 0, 0, 0.22, 36 * size, '#ffffff');
    this.add(RING, x, y, 0, 0, 0.42, 6 * size, color, 0, 170 * size);
    this.burst(GLOW, x, y, n, 30 * size, 200 * size, 0.3, 0.7, 4 * size, 9 * size, color, 3);
    this.burst(SPARK, x, y, n, 150 * size, 420 * size, 0.2, 0.45, 1.2, 2.2, '#ffe9b0', 3);
    this.burst(SMOKE, x, y, Math.ceil(n / 3), 10, 50 * size, 0.6, 1.1, 7 * size, 13 * size, '', 1.5);
    this.burst(DEBRIS, x, y, Math.ceil(n / 3), 60, 200 * size, 0.6, 1.0, 1.5, 3.5, debris, 1.2);
  }

  hitSpark(x, y, color = '#bff6ff') {
    const n = Math.max(2, Math.round(5 * this.intensity));
    this.add(GLOW, x, y, 0, 0, 0.12, 12, color);
    this.burst(SPARK, x, y, n, 120, 300, 0.12, 0.28, 1, 1.8, color, 4);
  }

  shieldRipple(x, y, color = '#4fc3ff') {
    this.add(RING, x, y, 0, 0, 0.3, 4, color, 0, 120);
    this.burst(SPARK, x, y, Math.max(2, Math.round(6 * this.intensity)), 80, 240, 0.12, 0.3, 1, 1.6, color, 4);
  }

  ring(x, y, color, radius, grow, life = 0.5) {
    this.add(RING, x, y, 0, 0, life, radius, color, 0, grow);
  }

  glow(x, y, size, color, life = 0.2, vx = 0, vy = 0) {
    this.add(GLOW, x, y, vx, vy, life, size, color, 1);
  }

  smokePuff(x, y, size = 8) {
    this.add(SMOKE, x, y, rand(-12, 12), rand(-30, -10), rand(0.7, 1.2), size, '', 0.5, 14);
  }

  text(x, y, str, color = '#ffffff', size = 16, life = 0.9) {
    const t = this.texts.obtain();
    if (!t) return;
    t.x = x; t.y = y; t.text = str; t.color = color; t.size = size; t.life = life; t.max = life;
  }

  update(dt) {
    const a = this.pool.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.releaseAt(i);
        continue;
      }
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    const t = this.texts.active;
    for (let i = t.length - 1; i >= 0; i--) {
      const p = t[i];
      p.life -= dt;
      p.y -= 38 * dt;
      if (p.life <= 0) this.texts.releaseAt(i);
    }
  }

  draw(ctx) {
    const a = this.pool.active;
    const base = ctx.getTransform();

    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const k = p.life / p.max;
      if (p.type === SMOKE) {
        ctx.globalAlpha = 0.45 * k;
        ctx.drawImage(this.smoke, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.type === DEBRIS) {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.setTransform(base);
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const k = p.life / p.max;
      if (p.type === GLOW) {
        ctx.globalAlpha = k;
        ctx.drawImage(getGlow(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.type === SPARK) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.type === RING) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.5 + 3.5 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    const t = this.texts.active;
    if (!t.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2,4,12,0.85)';
    for (let i = 0; i < t.length; i++) {
      const p = t[i];
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      ctx.font = textFont(p.size);
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
