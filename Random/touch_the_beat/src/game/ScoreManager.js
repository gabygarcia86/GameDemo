// Score, combo, multiplier and accuracy bookkeeping.

import { SCORING } from '../config.js';

export class ScoreManager {
  constructor(rules = SCORING) {
    this.rules = rules;
    this.reset(0);
  }

  reset(totalNotes) {
    this.totalNotes = totalNotes;
    this.score = 0;
    this.displayScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.judged = 0;
    this.weightSum = 0;
    this.holdsTotal = 0;
    this.holdsCompleted = 0;
    this.holdsDropped = 0;
    this.deltaSum = 0; // signed timing error of hits (for calibration hints)
    this.deltaCount = 0;
    this.comboBump = 0; // animation helper 0..1
  }

  get multiplier() {
    let mult = 1;
    for (const step of this.rules.multipliers) if (this.combo >= step.combo) mult = step.mult;
    return mult;
  }

  get accuracy() {
    return this.judged ? (this.weightSum / this.judged) * 100 : 100;
  }

  get meanDelta() {
    return this.deltaCount ? this.deltaSum / this.deltaCount : 0;
  }

  /** Register a judgement; returns { multiplierUp, milestone } for effects. */
  judge(rating, delta = 0) {
    const before = this.multiplier;
    this.counts[rating]++;
    this.judged++;
    this.weightSum += this.rules.accuracyWeight[rating];
    let milestone = 0;
    if (rating === 'miss') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += this.rules.points[rating] * this.multiplier;
      this.deltaSum += delta;
      this.deltaCount++;
      this.comboBump = 1;
      if (this.rules.comboMilestones.includes(this.combo)) milestone = this.combo;
    }
    return { multiplierUp: this.multiplier > before, milestone };
  }

  addHoldTime(seconds) {
    this.score += this.rules.holdPointsPerSecond * seconds * this.multiplier;
  }

  breakCombo() {
    this.combo = 0;
  }

  update(dt) {
    const diff = this.score - this.displayScore;
    this.displayScore = Math.abs(diff) < 1 ? this.score : this.displayScore + diff * Math.min(1, dt * 12);
    this.comboBump = Math.max(0, this.comboBump - dt * 5);
  }

  get fullCombo() {
    return this.counts.miss === 0 && this.holdsDropped === 0 && this.judged > 0;
  }

  get grade() {
    const acc = this.accuracy;
    for (const g of this.rules.grades) {
      if (acc >= g.minAccuracy && (!g.fullCombo || this.fullCombo)) return g.grade;
    }
    return 'D';
  }

  summary() {
    return {
      score: Math.round(this.score),
      maxCombo: this.maxCombo,
      accuracy: Math.round(this.accuracy * 100) / 100,
      counts: { ...this.counts },
      holds: { total: this.holdsTotal, completed: this.holdsCompleted, dropped: this.holdsDropped },
      grade: this.grade,
      fullCombo: this.fullCombo,
      meanDeltaMs: Math.round(this.meanDelta * 1000),
      totalNotes: this.totalNotes,
    };
  }
}
