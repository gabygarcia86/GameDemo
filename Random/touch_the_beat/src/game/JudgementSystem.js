// Hit detection and timing judgement. All times are song seconds on the
// audio clock (already corrected for latency by the caller).

import { JUDGEMENT } from '../config.js';
import { LANE_COUNT } from '../charts/BeatMap.js';
import { HOLD_ACTIVE, HOLD_DONE, HOLD_DROPPED } from './NoteManager.js';

export class JudgementSystem {
  /**
   * @param {import('./NoteManager.js').NoteManager} notes
   * @param {import('./ScoreManager.js').ScoreManager} score
   * @param {{onJudge?: (event:object)=>void}} hooks
   */
  constructor(notes, score, hooks = {}) {
    this.notes = notes;
    this.score = score;
    this.onJudge = hooks.onJudge || (() => {});
    this.active = new Array(LANE_COUNT).fill(null); // hold note being held per lane
    this.lastUpdate = 0;
    this.setWindowScale(1);
  }

  setWindowScale(scale) {
    const w = JUDGEMENT.windows;
    this.windows = { perfect: w.perfect * scale, great: w.great * scale, good: w.good * scale };
  }

  reset() {
    this.active.fill(null);
    this.lastUpdate = -Infinity;
    this.score.holdsTotal = this.notes.notes.filter((n) => n.type === 'hold').length;
  }

  rate(absDelta) {
    const w = this.windows;
    if (absDelta <= w.perfect) return 'perfect';
    if (absDelta <= w.great) return 'great';
    if (absDelta <= w.good) return 'good';
    return null;
  }

  /** A lane was pressed at song time t. Returns the judgement event or null. */
  laneDown(lane, t) {
    this.flushMisses(lane, t);
    const note = this.notes.nextInLane(lane);
    if (!note) return null;
    const delta = t - note.time;
    // too early: ignore the tap (no penalty) — the note stays hittable
    if (delta < -this.windows.good) return null;
    const rating = this.rate(Math.abs(delta));
    if (!rating) return null; // late misses are handled in update()
    note.judged = true;
    note.rating = rating;
    note.delta = delta;
    const effects = this.score.judge(rating, delta);
    if (note.type === 'hold') {
      note.hold = HOLD_ACTIVE;
      this.active[lane] = note;
    }
    const event = { kind: 'judge', rating, delta, note, lane, ...effects };
    this.onJudge(event);
    return event;
  }

  laneUp(lane, t) {
    const note = this.active[lane];
    if (!note) return;
    this.active[lane] = null;
    if (t >= note.end - JUDGEMENT.holdReleaseTolerance) this.completeHold(note, t);
    else this.dropHold(note, t);
  }

  completeHold(note, t) {
    this.accrueHold(note, Math.min(t, note.end));
    note.hold = HOLD_DONE;
    note.holdProgress = 1;
    this.score.holdsCompleted++;
    this.onJudge({ kind: 'holdComplete', note, lane: note.lane });
  }

  dropHold(note, t) {
    this.accrueHold(note, t);
    note.hold = HOLD_DROPPED;
    this.score.holdsDropped++;
    this.score.breakCombo();
    this.onJudge({ kind: 'holdDrop', note, lane: note.lane });
  }

  accrueHold(note, t) {
    const progressed = Math.max(0, Math.min(note.end, t) - note.time);
    const already = note.holdProgress * note.duration;
    if (progressed > already) {
      this.score.addHoldTime(progressed - already);
      note.holdProgress = note.duration > 0 ? progressed / note.duration : 1;
    }
  }

  /** Per-frame: misses for notes that passed, hold scoring and completion. */
  /** Mark every note in the lane that is past the late window as missed. */
  flushMisses(lane, t) {
    const late = this.windows.good;
    let note = this.notes.nextInLane(lane);
    while (note && t - note.time > late) {
      note.judged = true;
      note.rating = 'miss';
      note.delta = t - note.time;
      if (note.type === 'hold') note.hold = HOLD_DROPPED;
      const effects = this.score.judge('miss');
      this.onJudge({ kind: 'judge', rating: 'miss', delta: note.delta, note, lane, ...effects });
      note = this.notes.nextInLane(lane);
    }
  }

  update(t) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      this.flushMisses(lane, t);
      const held = this.active[lane];
      if (held) {
        if (t >= held.end) {
          this.active[lane] = null;
          this.completeHold(held, held.end);
        } else {
          this.accrueHold(held, t);
        }
      }
    }
    this.lastUpdate = t;
  }

  /** Release every active hold (blur safety). */
  releaseAll(t) {
    for (let lane = 0; lane < LANE_COUNT; lane++) if (this.active[lane]) this.laneUp(lane, t);
  }

  /** Pausing mid-hold is not punished: holds count as completed up to now. */
  settleHolds(t) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const held = this.active[lane];
      if (!held) continue;
      this.active[lane] = null;
      this.completeHold(held, t);
    }
  }
}
