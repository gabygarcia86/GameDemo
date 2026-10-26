/**
 * Pooled projectiles for the player and enemies. Bullets fly in straight lines;
 * all aiming and pattern logic lives with whoever fires them.
 */
import { CONFIG, WORLD } from './config.js';
import { Pool } from './utils.js';
import { getSprites } from './sprites.js';

const { W, H } = WORLD;
const makeBullet = () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 4, angle: 0, kind: 'basic', damage: 1, t: 0 });

export class Projectiles {
  constructor() {
    this.player = new Pool(makeBullet, CONFIG.projectiles.maxPlayer);
    this.enemy = new Pool(makeBullet, CONFIG.projectiles.maxEnemy);
    this.sprites = getSprites().bullets;
  }

  firePlayer(x, y, angle) {
    const b = this.player.obtain();
    if (!b) return null;
    const sp = CONFIG.player.bulletSpeed;
    b.x = x; b.y = y;
    b.vx = Math.sin(angle) * sp;
    b.vy = -Math.cos(angle) * sp;
    b.angle = angle;
    b.r = 5;
    b.kind = 'player';
    b.damage = 1;
    b.t = 0;
    return b;
  }

  fireEnemy(kind, x, y, vx, vy) {
    const b = this.enemy.obtain();
    if (!b) return null;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.kind = kind;
    b.r = CONFIG.projectiles.kinds[kind].radius;
    b.angle = Math.atan2(vx, -vy); // sprites point up; rotate to face travel
    b.t = 0;
    return b;
  }

  update(dt) {
    for (const pool of [this.player, this.enemy]) {
      const a = pool.active;
      for (let i = a.length - 1; i >= 0; i--) {
        const b = a[i];
        b.t += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -50 || b.y > H + 50 || b.x < -50 || b.x > W + 50) pool.releaseAt(i);
      }
    }
  }

  clear() {
    this.player.clear();
    this.enemy.clear();
  }

  drawPool(ctx, pool) {
    const a = pool.active;
    if (!a.length) return;
    const base = ctx.getTransform();
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      const s = this.sprites[b.kind];
      ctx.translate(b.x, b.y);
      if (b.angle) ctx.rotate(b.angle);
      if (b.kind === 'heavy') {
        const k = 1 + Math.sin(b.t * 18) * 0.12;
        ctx.scale(k, k);
      }
      ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
      ctx.setTransform(base);
    }
  }

  drawPlayer(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    this.drawPool(ctx, this.player);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawEnemy(ctx) {
    this.drawPool(ctx, this.enemy);
  }
}
