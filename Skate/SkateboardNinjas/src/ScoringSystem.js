// Score, combos and multipliers.
//
// Every action adds its value to the current (unbanked) combo. The multiplier
// grows with the number of *distinct* actions, and repeating an action in the
// same combo halves its value each time, so spamming one move doesn't pay.
//
// After a clean landing the combo stays open for a short "link" window: ollie
// again in time and the combo keeps growing; otherwise it banks. A sketchy
// landing banks immediately. A wipeout loses the unbanked combo; banked score
// is never lost.

import { CONFIG } from './config.js';

export class ScoringSystem {
  constructor() {
    this.cfg = CONFIG.scoring;
    this.enabled = true;
    this.onBank = null;   // (total, multiplier) => void
    this.onDrop = null;   // (lost) => void
    this.combo = {
      active: false, base: 0, distinct: 0, counts: new Map(), chain: [],
      length: 0, linking: false, linkTimer: 0, tricksSinceLand: 0, version: 0,
    };
    this.reset();
  }

  reset() {
    this.score = 0;
    this.stats = {
      bestCombo: 0, highestMultiplier: 1, tricks: 0, grindTime: 0,
      wipeouts: 0, nearMisses: 0, karensDodged: 0, combosBanked: 0,
    };
    this.clearCombo();
  }

  clearCombo() {
    const c = this.combo;
    c.active = false;
    c.base = 0;
    c.distinct = 0;
    c.counts.clear();
    c.chain.length = 0;
    c.length = 0;
    c.linking = false;
    c.linkTimer = 0;
    c.tricksSinceLand = 0;
    c.version++;
  }

  get multiplier() {
    const n = this.combo.distinct;
    const m = this.cfg.multipliers;
    if (n < m.length) return m[n];
    const extra = Math.floor((n - m.length + 1) / this.cfg.extendedEvery) * this.cfg.extendedStep;
    return Math.min(this.cfg.multiplierCap, m[m.length - 1] + extra);
  }

  get pending() {
    return Math.round(this.combo.base * this.multiplier);
  }

  // distinct: counts toward the multiplier; trick: counts as a trick in stats
  // and qualifies the next landing for the clean-landing bonus.
  addAction(key, label, base, distinct = true, trick = true) {
    if (!this.enabled) return 0;
    const c = this.combo;
    c.active = true;
    c.linking = false;
    const n = c.counts.get(key) || 0;
    c.counts.set(key, n + 1);
    const value = Math.max(5, Math.round(base * Math.pow(this.cfg.repeatFactor, n)));
    c.base += value;
    if (distinct && n === 0) c.distinct++;
    if (trick) {
      c.tricksSinceLand++;
      this.stats.tricks++;
    }
    c.chain.push(label);
    if (c.chain.length > 6) c.chain.shift();
    c.length++;
    c.version++;
    if (this.multiplier > this.stats.highestMultiplier) this.stats.highestMultiplier = this.multiplier;
    return value;
  }

  // Raw points into the open combo (grind time, grab holds).
  addRaw(points) {
    if (!this.enabled || !this.combo.active) return;
    this.combo.base += points;
    this.combo.version++;
  }

  addGrind(dt) {
    if (!this.enabled) return;
    this.stats.grindTime += dt;
    this.addRaw(this.cfg.grindPerSecond * dt);
  }

  // Called when the skater touches down on the street.
  land(clean) {
    const c = this.combo;
    if (!c.active) return 0;
    if (!clean) return this.bank();
    let bonus = 0;
    if (c.tricksSinceLand > 0) bonus = this.addAction('clean', 'Clean Landing', this.cfg.cleanLanding, false, false);
    c.tricksSinceLand = 0;
    c.linking = true;
    c.linkTimer = this.cfg.linkWindow;
    c.version++;
    return bonus;
  }

  update(dt, grounded) {
    const c = this.combo;
    if (c.active && c.linking && grounded) {
      c.linkTimer -= dt;
      if (c.linkTimer <= 0) this.bank();
    }
  }

  bank() {
    const c = this.combo;
    if (!c.active) return 0;
    const total = this.pending;
    const mult = this.multiplier;
    this.score += total;
    this.stats.combosBanked++;
    if (total > this.stats.bestCombo) this.stats.bestCombo = total;
    this.clearCombo();
    if (this.onBank && this.enabled) this.onBank(total, mult);
    return total;
  }

  drop() {
    const lost = this.combo.active ? this.pending : 0;
    this.clearCombo();
    if (lost && this.onDrop && this.enabled) this.onDrop(lost);
    return lost;
  }
}
