// Holds every level object currently alive (ramps, gaps, rails, obstacles,
// Karens) and answers ground-height queries. Objects are recycled through
// per-type free lists so long runs don't churn the garbage collector.

import { initKaren } from './Karen.js';

export const OBSTACLE_TYPES = {
  cone: { w: 24, h: 34 },
  hydrant: { w: 22, h: 38 },
  trash: { w: 32, h: 50 },
  barrier: { w: 58, h: 50 },
};

export class World {
  constructor() {
    this.ramps = [];
    this.gaps = [];
    this.rails = [];
    this.obstacles = [];
    this.karens = [];
    this.pool = { ramps: [], gaps: [], rails: [], obstacles: [], karens: [] };
    this.nextId = 1;
  }

  reset() {
    for (const key of Object.keys(this.pool)) {
      const list = this[key];
      for (const item of list) this.pool[key].push(item);
      list.length = 0;
    }
  }

  obtain(key) {
    const item = this.pool[key].pop() || {};
    item.id = this.nextId++;
    this[key].push(item);
    return item;
  }

  addRamp(kind, x, len, h, launch) {
    const r = this.obtain('ramps');
    r.kind = kind; r.x = x; r.len = len; r.h = h; r.launch = launch;
    return r;
  }

  addGap(x, w) {
    const g = this.obtain('gaps');
    g.x = x; g.w = w;
    return g;
  }

  // kind: rail | high | combo | bench | ledge. `name` is the grind's display name.
  addRail(kind, x, len, h, name) {
    const r = this.obtain('rails');
    r.kind = kind; r.x = x; r.len = len; r.h = h; r.name = name;
    r.lockUntil = 0;
    return r;
  }

  addObstacle(kind, x) {
    const o = this.obtain('obstacles');
    const t = OBSTACLE_TYPES[kind];
    o.kind = kind; o.x = x; o.w = t.w; o.h = t.h;
    o.knocked = false; o.passed = false; o.minClear = Infinity;
    o.kx = 0; o.ky = 0; o.kvx = 0; o.kvy = 0; o.krot = 0; o.kvr = 0;
    return o;
  }

  addKaren(kind, x, rng, meetX = x) {
    const k = this.obtain('karens');
    initKaren(k, kind, x, rng, meetX);
    return k;
  }

  isGap(x) {
    for (const g of this.gaps) if (x >= g.x && x < g.x + g.w) return true;
    return false;
  }

  // Fills `out` with the street surface at x: height, slope, and the ramp or
  // gap under that point. In a gap the height is -Infinity.
  groundAt(x, out) {
    out.h = 0; out.slope = 0; out.ramp = null; out.gap = null;
    for (const g of this.gaps) {
      if (x >= g.x && x < g.x + g.w) {
        out.gap = g;
        out.h = -Infinity;
        return out;
      }
    }
    for (const r of this.ramps) {
      if (x >= r.x && x < r.x + r.len) {
        const t = (x - r.x) / r.len;
        out.h = rampHeight(r, t);
        out.slope = (r.h / r.len) * (0.55 + 0.9 * t);
        out.ramp = r;
        return out;
      }
    }
    return out;
  }

  // Knocked-over props tumble away.
  update(dt) {
    for (const o of this.obstacles) {
      if (!o.knocked) continue;
      o.kvy -= 1800 * dt;
      o.kx += o.kvx * dt;
      o.ky += o.kvy * dt;
      o.krot += o.kvr * dt;
      if (o.ky < -40 && o.kvy < 0) { o.ky = -40; o.kvy = 0; o.kvx *= 0.9; o.kvr *= 0.9; }
    }
  }

  knock(o, speed) {
    o.knocked = true;
    o.kvx = speed * 0.9 + 80;
    o.kvy = 520;
    o.kvr = 9 + Math.random() * 6;
  }

  // Recycle everything that ended left of minX.
  cull(minX) {
    this.compact('ramps', (r) => r.x + r.len < minX);
    this.compact('gaps', (g) => g.x + g.w < minX);
    this.compact('rails', (r) => r.x + r.len < minX);
    this.compact('obstacles', (o) => o.x + o.w + (o.knocked ? o.kx : 0) < minX - 200);
    this.compact('karens', (k) => k.x + 80 < minX && (!k.cart || k.cart.x + 80 < minX));
  }

  compact(key, isDead) {
    const list = this[key];
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (isDead(item)) this.pool[key].push(item);
      else list[w++] = item;
    }
    list.length = w;
  }
}

// Kicker profile: steepens toward the lip so launches feel punchy.
export function rampHeight(r, t) {
  return r.h * (0.55 * t + 0.45 * t * t);
}
