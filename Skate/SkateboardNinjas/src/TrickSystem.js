// Air tricks. One flip stick and one grab stick, eight directions each, plus
// a backflip button. Tricks can be chained in the same jump (they run one
// after the other; a request made while another is animating is queued
// briefly). Landing mid-flip or mid-backflip is a bail; landing mid-grab is
// sketchy.

import { CONFIG } from './config.js';

const T = CONFIG.tricks;

// flip: full turns around the board's long axis (sign = direction)
// shove: turns around the vertical axis
export const FLIP_TRICKS = {
  up: { id: 'kickflip', name: 'Kickflip', score: 100, duration: 0.42, flip: 1, shove: 0 },
  down: { id: 'heelflip', name: 'Heelflip', score: 100, duration: 0.42, flip: -1, shove: 0 },
  left: { id: 'popshove', name: 'Pop Shove-it', score: 125, duration: 0.36, flip: 0, shove: 0.5 },
  right: { id: 'shove360', name: '360 Shove-it', score: 150, duration: 0.48, flip: 0, shove: 1 },
  upright: { id: 'treflip', name: '360 Flip', score: 200, duration: 0.55, flip: 1, shove: 1 },
  upleft: { id: 'varialkick', name: 'Varial Kickflip', score: 175, duration: 0.48, flip: 1, shove: 0.5 },
  downleft: { id: 'varialheel', name: 'Varial Heelflip', score: 175, duration: 0.48, flip: -1, shove: -0.5 },
  downright: { id: 'hardflip', name: 'Hardflip', score: 175, duration: 0.5, flip: 1, shove: -0.5 },
};

// The whole skater rotates one full turn backward.
export const BACKFLIP = { id: 'backflip', name: 'Backflip', score: 250, duration: 0.55 };

// hand: which hand grabs (F = front, B = back); point: x along the deck;
// tilt: board pitch while grabbed (negative = nose up); shift: board x offset;
// lean: torso lean while grabbing.
export const GRAB_TRICKS = {
  up: { id: 'indy', name: 'Indy Grab', short: 'Indy', score: 100, hand: 'B', point: 4, tilt: -0.1, shift: 0, lean: 0.75 },
  down: { id: 'tailgrab', name: 'Tail Grab', short: 'Tail Grab', score: 100, hand: 'B', point: -29, tilt: 0.45, shift: 14, lean: 0.45 },
  left: { id: 'melon', name: 'Melon Grab', short: 'Melon', score: 100, hand: 'F', point: -4, tilt: 0.1, shift: 2, lean: 0.75 },
  right: { id: 'nosegrab', name: 'Nose Grab', short: 'Nose Grab', score: 100, hand: 'F', point: 29, tilt: -0.45, shift: -14, lean: 0.7 },
  upright: { id: 'stalefish', name: 'Stalefish', short: 'Stalefish', score: 150, hand: 'B', point: -8, tilt: -0.3, shift: 6, lean: 0.6 },
  upleft: { id: 'method', name: 'Method', short: 'Method', score: 150, hand: 'F', point: 0, tilt: 0.35, shift: 4, lean: 0.55 },
  downleft: { id: 'japan', name: 'Japan Air', short: 'Japan', score: 150, hand: 'F', point: 14, tilt: -0.25, shift: -6, lean: 0.8 },
  downright: { id: 'shadow', name: 'Shadow Air', short: 'Shadow Air', score: 150, hand: 'B', point: 16, tilt: 0.3, shift: -4, lean: 0.85 },
};

export class TrickSystem {
  constructor() {
    this.flip = { def: null, t: 0 };
    this.grab = { def: null, phase: 'none', t: 0, hold: 0 };
    this.spin = { def: null, t: 0 }; // backflip
    this.queued = { kind: null, dir: null, ttl: 0 };
    this.resetAir();
  }

  resetAir() {
    this.flip.def = null;
    this.flip.t = 0;
    this.grab.def = null;
    this.grab.phase = 'none';
    this.grab.t = 0;
    this.grab.hold = 0;
    this.spin.def = null;
    this.spin.t = 0;
    this.queued.kind = null;
    this.airFlip = null;
    this.airGrab = null;
    this.comboAwarded = false;
  }

  get flipProgress() {
    return this.flip.def ? Math.min(1, this.flip.t / this.flip.def.duration) : 0;
  }

  get spinProgress() {
    return this.spin.def ? Math.min(1, this.spin.t / this.spin.def.duration) : 0;
  }

  get grabbing() {
    return this.grab.phase === 'reach' || this.grab.phase === 'hold';
  }

  // One trick animates at a time (a grab's release still blocks the next one).
  canStart() {
    return !this.flip.def && this.grab.phase === 'none' && !this.spin.def;
  }

  // Returns the trick definition if it starts now, otherwise null (it may be queued).
  request(kind, dir = null) {
    const def = trickDef(kind, dir);
    if (!def) return null;
    if (!this.canStart()) {
      this.queued.kind = kind;
      this.queued.dir = dir;
      this.queued.ttl = T.queueTime;
      return null;
    }
    return this.start(kind, def);
  }

  start(kind, def) {
    if (kind === 'flip') {
      this.flip.def = def;
      this.flip.t = 0;
      this.airFlip = def;
    } else if (kind === 'backflip') {
      this.spin.def = def;
      this.spin.t = 0;
    } else {
      this.grab.def = def;
      this.grab.phase = 'reach';
      this.grab.t = 0;
      this.grab.hold = 0;
      this.airGrab = def;
    }
    return def;
  }

  // True once per jump, the moment both a flip and a grab have been done.
  takeComboBonus() {
    if (this.comboAwarded || !this.airFlip || !this.airGrab) return false;
    this.comboAwarded = true;
    return true;
  }

  // Advances animations. Returns { kind, def } if a queued trick started, else null.
  // `holdPoints` receives grab-hold points earned this step.
  update(dt, grabHeld) {
    this.holdPoints = 0;
    if (this.flip.def) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.def.duration) this.flip.def = null;
    }
    if (this.spin.def) {
      this.spin.t += dt;
      if (this.spin.t >= this.spin.def.duration) this.spin.def = null;
    }

    const g = this.grab;
    if (g.phase === 'reach') {
      g.t += dt;
      if (g.t >= T.grabReach) { g.phase = 'hold'; g.t = 0; }
    } else if (g.phase === 'hold') {
      g.hold += dt;
      if (g.hold > T.grabMinHold) this.holdPoints = T.grabHoldRate * dt;
      if ((!grabHeld && g.hold >= T.grabMinHold) || g.hold >= T.grabMaxHold) { g.phase = 'release'; g.t = 0; }
    } else if (g.phase === 'release') {
      g.t += dt;
      if (g.t >= T.grabRelease) { g.phase = 'none'; g.def = null; }
    }

    const q = this.queued;
    if (q.kind) {
      q.ttl -= dt;
      if (q.ttl <= 0) q.kind = null;
      else if (this.canStart()) {
        const kind = q.kind;
        q.kind = null;
        return STARTED.set(kind, this.start(kind, trickDef(kind, q.dir)));
      }
    }
    return null;
  }

  // 'clean' | 'sketchy' | 'bail'
  landingQuality() {
    if (this.spin.def) return this.spinProgress < T.backflipBailBelow ? 'bail' : 'sketchy';
    if (this.flip.def) return this.flipProgress < T.bailBelow ? 'bail' : 'sketchy';
    if (this.grabbing) return 'sketchy';
    return 'clean';
  }
}

function trickDef(kind, dir) {
  if (kind === 'backflip') return BACKFLIP;
  return kind === 'flip' ? FLIP_TRICKS[dir] : GRAB_TRICKS[dir];
}

// Reused result object for queued starts (avoids per-frame allocations).
const STARTED = { kind: null, def: null, set(k, d) { this.kind = k; this.def = d; return this; } };

export function comboTrickName(flip, grab) {
  return `${flip.name} ${grab.short}`;
}
