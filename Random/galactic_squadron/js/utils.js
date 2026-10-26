/** Small math helpers, an object pool and a spline path used across the game. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Rotate `a` toward `target` by at most `maxStep` radians along the shortest arc. */
export function turnToward(a, target, maxStep) {
  const d = wrapAngle(target - a);
  return Math.abs(d) <= maxStep ? target : a + Math.sign(d) * maxStep;
}

/** Pick a key from { key: weight } proportionally to its weight. */
export function weightedPick(weights, rng = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  let last = null;
  for (const k in weights) {
    if (weights[k] <= 0) continue;
    last = k;
    r -= weights[k];
    if (r <= 0) return k;
  }
  return last;
}

/** Deterministic PRNG so generated waves are the same every run. */
export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Fixed-size object pool. `active` holds live objects; iterate it backwards and
 * call releaseAt(i) to recycle (swap-remove keeps it O(1) with no allocation).
 */
export class Pool {
  constructor(create, size) {
    this.free = [];
    this.active = [];
    for (let i = 0; i < size; i++) this.free.push(create());
  }
  get count() {
    return this.active.length;
  }
  obtain() {
    const o = this.free.pop();
    if (o === undefined) return null;
    this.active.push(o);
    return o;
  }
  releaseAt(i) {
    const a = this.active;
    const o = a[i];
    a[i] = a[a.length - 1];
    a.pop();
    this.free.push(o);
  }
  clear() {
    while (this.active.length) this.free.push(this.active.pop());
  }
}

/**
 * Catmull-Rom spline through [x, y] points, pre-sampled into a polyline with
 * cumulative lengths so ships can travel it at constant speed.
 */
export class Path {
  constructor(points, samplesPerSegment = 14) {
    const xs = [];
    const ys = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const t2 = t * t;
        const t3 = t2 * t;
        xs.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3));
        ys.push(0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    xs.push(points[n - 1][0]);
    ys.push(points[n - 1][1]);
    this.xs = Float32Array.from(xs);
    this.ys = Float32Array.from(ys);
    this.cum = new Float32Array(xs.length);
    for (let i = 1; i < xs.length; i++) {
      this.cum[i] = this.cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    this.length = this.cum[xs.length - 1];
  }

  /** Writes position (x, y) and travel direction (dx, dy) at distance `d` into `out`. */
  sample(d, out) {
    const { xs, ys, cum } = this;
    const last = xs.length - 1;
    if (d <= 0) {
      out.x = xs[0]; out.y = ys[0];
      out.dx = xs[1] - xs[0]; out.dy = ys[1] - ys[0];
      return out;
    }
    if (d >= this.length) {
      out.x = xs[last]; out.y = ys[last];
      out.dx = xs[last] - xs[last - 1]; out.dy = ys[last] - ys[last - 1];
      return out;
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    out.x = xs[lo] + (xs[hi] - xs[lo]) * t;
    out.y = ys[lo] + (ys[hi] - ys[lo]) * t;
    out.dx = xs[hi] - xs[lo];
    out.dy = ys[hi] - ys[lo];
    return out;
  }
}
