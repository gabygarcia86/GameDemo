// Thrown ninja stars: a small pool of projectiles that fly straight ahead of
// the skater and take out the first Karen or evil ninja they touch.

import { CONFIG } from './config.js';

const T = CONFIG.shuriken;

export class Shurikens {
  constructor(max = 6) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ active: false, x: 0, prevX: 0, startX: 0, y: 0, vx: 0, spin: 0 });
    }
    this.cooldown = 0;
  }

  clear() {
    for (const s of this.items) s.active = false;
    this.cooldown = 0;
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Returns false while cooling down.
  throw(x, y, skaterSpeed) {
    if (this.cooldown > 0) return false;
    const s = this.items.find((it) => !it.active);
    if (!s) return false;
    s.active = true;
    s.x = s.prevX = s.startX = x;
    s.y = y;
    s.vx = skaterSpeed + T.speed;
    s.spin = 0;
    this.cooldown = T.cooldown;
    return true;
  }

  // Calls onHit(karen) for each foe struck; a star stops at the first one.
  update(dt, karens, onHit) {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (const s of this.items) {
      if (!s.active) continue;
      s.prevX = s.x;
      s.x += s.vx * dt;
      s.spin += dt * 28;
      if (s.x - s.startX > T.range) {
        s.active = false;
        continue;
      }
      for (const k of karens) {
        if (k.dead) continue;
        // Swept test: the star moves ~20 units a step, more than half a Karen.
        const half = k.w / 2 + T.radius;
        if (s.x < k.x - half || s.prevX > k.x + half) continue;
        const feet = k.laneT * 22 + k.hop;
        if (s.y < feet - T.radius || s.y > feet + k.h + T.radius) continue;
        s.active = false;
        onHit(k);
        break;
      }
    }
  }
}
