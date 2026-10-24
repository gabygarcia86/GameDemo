// Skater vs. obstacles and Karens (axis-aligned boxes), plus near-miss and
// dodge detection. Each prop can only crash you once and only award its
// bonus once.

import { CONFIG } from './config.js';

const HALF = CONFIG.player.halfWidth;
const FOOT = CONFIG.player.footOffset;
const NEAR = 28;      // clearance (units) that counts as a near miss
const FORGIVE = 4;    // tops of props are a little soft

export class CollisionSystem {
  constructor(world) {
    this.world = world;
    this.events = [];   // { type: 'nearMiss' | 'karenDodge', target }
    this.hit = { kind: null, target: null, karen: null };
  }

  // Returns this.hit (with kind set) when the skater crashes, else null.
  update(player) {
    this.events.length = 0;
    const pl = player.x - HALF;
    const pr = player.x + HALF;
    const pb = player.y + FOOT;
    const pt = player.hitTop();
    const canHit = !player.invulnerable;

    for (const o of this.world.obstacles) {
      if (o.knocked) continue;
      const ol = o.x - o.w / 2;
      const or = o.x + o.w / 2;
      if (or < pl) {
        if (!o.passed) this.pass(o, 'nearMiss');
        continue;
      }
      if (ol > pr) break; // sorted by x
      const clear = pb - o.h;
      if (clear < o.minClear) o.minClear = clear;
      if (canHit && pb < o.h - FORGIVE && pt > 0) return this.report('obstacle', o, null);
    }

    for (const k of this.world.karens) {
      const r = this.testBox(k, k.x, pl, pr, pb, pt, canHit, 'karenDodge');
      if (r) return this.report('karen', k, k);
      if (k.cart) {
        const c = k.cart;
        const rc = this.testBox(c, c.x, pl, pr, pb, pt, canHit, 'karenDodge');
        if (rc) return this.report('cart', c, k);
      }
    }
    return null;
  }

  testBox(b, x, pl, pr, pb, pt, canHit, passEvent) {
    const l = x - b.w / 2;
    const r = x + b.w / 2;
    if (r < pl) {
      if (!b.passed) this.pass(b, passEvent);
      return false;
    }
    if (l > pr || !b.collidable) return false;
    const clear = pb - b.h;
    if (clear < b.minClear) b.minClear = clear;
    return canHit && pb < b.h - FORGIVE && pt > 0;
  }

  pass(b, type) {
    b.passed = true;
    if (b.hit || b.knocked || b.minClear === Infinity || b.minClear < -FORGIVE) return;
    if (type === 'karenDodge' || b.minClear < NEAR) this.events.push({ type, target: b });
  }

  report(kind, target, karen) {
    this.hit.kind = kind;
    this.hit.target = target;
    this.hit.karen = karen;
    return this.hit;
  }
}
