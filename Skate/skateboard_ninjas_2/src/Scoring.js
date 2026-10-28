// Score, combo multiplier and per-run statistics.
//
// Every "action" (enemy KO, near miss, jump over, slide under, trick, ramp,
// grind, power-up) adds to the combo and refreshes its timer. The multiplier
// grows by 0.5 every few combo steps, up to x5, and applies to action and
// coin points. Distance points are not multiplied.

import { CONFIG } from './config.js';

const S = CONFIG.scoring;

export class Scoring {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.distance = 0;
    this.coins = 0;
    this.bonusCoins = 0; // chests and the like
    this.combo = 0;
    this.comboTimer = 0;
    this.mult = 1;
    this.coinStreak = 0;
    this.stats = {
      karens: 0, ninjas: 0, beasts: 0, kos: 0, avoided: 0, jumps: 0, slides: 0, jumpOvers: 0, slideUnders: 0,
      tricks: 0, ramps: 0, grind: 0, nearMisses: 0, starsThrown: 0, splats: 0, chests: 0, powerups: 0,
      balls: 0, hay: 0, tumbleweeds: 0, ice: 0, branches: 0, satellites: 0, rovers: 0, fireballs: 0, bestCombo: 0, maxMult: 1,
    };
  }

  get comboFraction() {
    return this.combo > 0 ? Math.max(0, this.comboTimer / S.comboWindow) : 0;
  }

  addDistance(m) {
    this.distance += m;
    this.score += m * S.perMetre;
  }

  // Returns the points actually awarded (after the multiplier).
  action(points) {
    this.combo++;
    this.comboTimer = S.comboWindow;
    this.mult = Math.min(S.multiplierCap, 1 + Math.floor(this.combo / S.comboPerStep) * 0.5);
    const pts = Math.round(points * this.mult);
    this.score += pts;
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    if (this.mult > this.stats.maxMult) this.stats.maxMult = this.mult;
    return pts;
  }

  // Returns true when this coin completed a streak step (combo +1).
  coin() {
    this.coins++;
    this.coinStreak++;
    this.score += Math.round(S.coin * this.mult);
    if (this.combo > 0) this.comboTimer = Math.max(this.comboTimer, S.comboWindow * 0.6);
    if (this.coinStreak % S.coinStreakStep === 0) {
      this.action(0);
      return true;
    }
    return false;
  }

  breakCombo() {
    this.combo = 0;
    this.comboTimer = 0;
    this.mult = 1;
    this.coinStreak = 0;
  }

  update(dt) {
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }
  }

  // Value of a stat for missions/challenges ("score" and "distance" included).
  value(stat) {
    if (stat === 'score') return this.score;
    if (stat === 'distance') return this.distance;
    if (stat === 'coins') return this.coins;
    return this.stats[stat] || 0;
  }
}
