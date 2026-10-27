/**
 * The Falcon: an allied freighter that flies in on every 50-kill streak,
 * hovers above the player for 10 seconds blasting the nearest enemies (or the
 * boss's core), then jumps away. It can't be hit; its kills score as yours.
 */
import { CONFIG, WORLD } from './config.js';
import { getSprites, getGlow } from './sprites.js';
import { clamp, lerp, easeOutCubic } from './utils.js';

const { W, H } = WORLD;
const ENGINE_Y = 11.4;   // center of the hull disc, in sprite units
const ENGINE_R = 28.9;   // radius of the rear exhaust strip

export class Falcon {
  constructor(game) {
    const sprites = getSprites();
    this.game = game;
    this.sprite = sprites.falcon;
    this.flame = sprites.flames.cyan;
    const p = game.player;
    this.x = clamp(p.x < W / 2 ? p.x + 120 : p.x - 120, 60, W - 60);
    this.y = H + 90;
    this.state = 'arrive';
    this.t = 0;
    this.time = CONFIG.falcon.duration;
    this.fireTimer = 0.3;
    this.gun = 0;
    this.vy = 0;
    this.bank = 0;
    this.target = null;
    this.done = false;
  }

  /** Seconds of help left (only while assisting). */
  get remaining() {
    return this.state === 'assist' ? this.time : 0;
  }

  /** Another 50-streak while it's still around: stay for a fresh 10 seconds. */
  extend() {
    if (this.state === 'leave') this.state = 'assist';
    this.vy = 0;
    this.time = CONFIG.falcon.duration;
  }

  leave() {
    if (this.state === 'leave') return;
    this.state = 'leave';
    this.vy = -60;
  }

  update(dt) {
    const C = CONFIG.falcon;
    this.t += dt;
    switch (this.state) {
      case 'arrive': {
        const k = Math.min(1, this.t / C.arriveTime);
        this.y = lerp(H + 90, C.hoverY, easeOutCubic(k));
        if (k >= 1) this.state = 'assist';
        break;
      }
      case 'assist':
        this.time -= dt;
        this.y += (C.hoverY - this.y) * Math.min(1, dt * 3);
        this.track(dt);
        this.shoot(dt);
        if (this.time <= 0) this.leave();
        break;
      case 'leave':
        this.vy -= 900 * dt;
        this.y += this.vy * dt;
        this.bank *= Math.exp(-dt * 4);
        if (this.y < -120) this.done = true;
        break;
    }
  }

  /** Nearest enemy above the Falcon, else the boss's core, else nothing. */
  pickTarget() {
    let best = null;
    let bestD = Infinity;
    for (const e of this.game.enemies) {
      if (!e.alive || !e.hittable || e.y > this.y - 60) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d = dx * dx + dy * dy * 0.5; // favour enemies roughly overhead
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) return best;
    const boss = this.game.boss;
    return boss && boss.solid ? { x: boss.x, y: boss.y + 20 } : null;
  }

  track(dt) {
    const C = CONFIG.falcon;
    const p = this.game.player;
    this.target = this.pickTarget();
    const goal = this.target ? this.target.x : p.x < W / 2 ? p.x + 110 : p.x - 110;
    const step = clamp(clamp(goal, 50, W - 50) - this.x, -C.speed * dt, C.speed * dt);
    this.x += step;
    this.bank += (clamp(step / dt / C.speed, -1, 1) - this.bank) * Math.min(1, dt * 6);
  }

  shoot(dt) {
    this.fireTimer -= dt;
    const tg = this.target;
    if (!tg || this.fireTimer > 0) return;
    this.fireTimer = CONFIG.falcon.fireInterval;
    const mx = this.x + (this.gun ? 4 : -4);
    const my = this.y - 4;
    this.gun ^= 1;
    this.game.projectiles.firePlayer(mx, my, clamp(Math.atan2(tg.x - mx, my - tg.y), -1.1, 1.1), 'ally');
    this.game.audio.play('allyShoot');
  }

  draw(ctx) {
    const s = this.sprite;
    const boost = this.state === 'assist' ? 0 : 1;
    const flicker = 0.75 + 0.25 * Math.sin(this.t * 37) + 0.1 * Math.sin(this.t * 71);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.bank * 0.12);

    ctx.globalCompositeOperation = 'lighter';
    for (const fx of [-11, 0, 11]) ctx.drawImage(this.flame, fx - 5, ENGINE_Y + ENGINE_R - 3, 10, (10 + boost * 18) * flicker);
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);

    // blue glow along the rear exhaust strip
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(150,215,255,${0.65 + 0.25 * flicker})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, ENGINE_Y, ENGINE_R, Math.PI * 0.3, Math.PI * 0.7);
    ctx.stroke();
    const glow = getGlow('#6fc4ff');
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.32 + 0.09 * i);
      const gs = 9 + boost * 5;
      ctx.drawImage(glow, Math.cos(a) * ENGINE_R - gs, ENGINE_Y + Math.sin(a) * ENGINE_R - gs, gs * 2, gs * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    if (this.state === 'arrive' && this.t < 0.9) {
      // brief hyperspace streak as it drops out of lightspeed
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - this.t / 0.9;
      ctx.fillStyle = '#bfe6ff';
      ctx.fillRect(this.x - 1.5, this.y, 3, H - this.y + 40);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
