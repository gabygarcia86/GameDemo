// Runtime note storage. Notes are allocated once per chart load and reset in
// place on restart (no per-frame or per-restart allocation). Per-lane cursors
// make hit lookup O(1) amortised.

import { LANE_COUNT } from '../charts/BeatMap.js';

export const HOLD_NONE = 0;
export const HOLD_ACTIVE = 1;
export const HOLD_DONE = 2;
export const HOLD_DROPPED = 3;

export class NoteManager {
  constructor() {
    this.notes = [];
    this.lanes = Array.from({ length: LANE_COUNT }, () => []);
    this.cursor = new Int32Array(LANE_COUNT);
    this.renderStart = 0;
    this.count = 0;
    this.lastTime = 0;
  }

  load(chart) {
    const offset = Number(chart.offset) || 0;
    this.notes = chart.notes.map((n, index) => ({
      index,
      time: n.time + offset,
      lane: n.lane,
      type: n.type,
      duration: n.type === 'hold' ? n.duration : 0,
      end: n.time + offset + (n.type === 'hold' ? n.duration : 0),
      confidence: n.confidence ?? 1,
      chord: 1, // chord size
      chordFirst: true, // first note of its chord (renderer draws connector once)
      judged: false,
      rating: null,
      delta: 0,
      hold: HOLD_NONE,
      holdProgress: 0,
    }));
    this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    for (let i = 0; i < this.notes.length; ) {
      let j = i;
      while (j < this.notes.length && this.notes[j].time - this.notes[i].time < 0.0015) j++;
      for (let k = i; k < j; k++) {
        this.notes[k].chord = j - i;
        this.notes[k].chordFirst = k === i;
      }
      i = j;
    }
    this.lanes = Array.from({ length: LANE_COUNT }, () => []);
    for (const n of this.notes) this.lanes[n.lane].push(n);
    this.count = this.notes.length;
    this.lastTime = this.notes.reduce((m, n) => Math.max(m, n.end), 0);
    this.reset();
  }

  reset() {
    for (const n of this.notes) {
      n.judged = false;
      n.rating = null;
      n.delta = 0;
      n.hold = HOLD_NONE;
      n.holdProgress = 0;
    }
    this.cursor.fill(0);
    this.renderStart = 0;
  }

  /** First not-yet-judged note in a lane (or null). */
  nextInLane(lane) {
    const list = this.lanes[lane];
    let c = this.cursor[lane];
    while (c < list.length && list[c].judged) c++;
    this.cursor[lane] = c;
    return c < list.length ? list[c] : null;
  }

  /** Advance the draw cursor past notes that are fully off screen. */
  updateRenderStart(time, pastWindow) {
    const notes = this.notes;
    let i = this.renderStart;
    while (i < notes.length && notes[i].end < time - pastWindow && notes[i].judged) i++;
    this.renderStart = i;
    return i;
  }
}
