// Seeded pseudorandom numbers so a run can be reproduced (?seed=1234) and the
// daily challenge gives everyone the same street.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }

  next() { return this._next(); }
  range(min, max) { return min + (max - min) * this._next(); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  chance(p) { return this._next() < p; }
  pick(list) { return list[Math.floor(this._next() * list.length)]; }
}

// Stateless hash in [0, 1) used for background decoration, so scenery is
// deterministic without storing anything.
export function hash(n, salt = 0) {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

export function todayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function dailySeed(date = new Date()) {
  const key = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  return Math.floor(hash(key, 77) * 4294967296) >>> 0;
}
