// Builds the street ahead of the skater out of data-driven segments.
//
// Every segment is placed after a clear approach (reaction time at the current
// speed) and returns the x where its landing zone ends, so two hazards are
// always at least "airtime + reaction time" apart. Segments that need a jump
// check it against the real jump physics (Physics.js) before committing, so
// the generator never asks for a jump the skater can't make.

import { CONFIG } from './config.js';
import { Physics, clamp } from './Physics.js';
import { OBSTACLE_TYPES } from './World.js';

const P = CONFIG.physics;
const L = CONFIG.level;
const G = P.gravity;
const OLLIE_AIR = (2 * P.jumpImpulse) / G;
const PLAYER_W = CONFIG.player.halfWidth * 2;

// weights: relative pick chance in tiers [warm-up, build, rush]; 0 = not allowed.
export const SEGMENTS = [
  { id: 'flat', difficulty: 0, weights: [2.0, 0.9, 0.45], build: buildFlat },
  { id: 'obstacle', difficulty: 1, weights: [3.0, 2.2, 1.6], hazard: true, build: buildObstacle },
  { id: 'coneRow', difficulty: 1, weights: [0.8, 1.2, 1.2], hazard: true, build: buildConeRow },
  { id: 'gap', difficulty: 2, weights: [0.9, 1.5, 1.7], hazard: true, build: buildGap },
  { id: 'kicker', difficulty: 1, weights: [1.4, 1.0, 0.8], build: buildKicker },
  { id: 'kickerGap', difficulty: 2, weights: [0.8, 1.3, 1.5], hazard: true, build: buildKickerGap },
  { id: 'kickerHop', difficulty: 2, weights: [0, 1.0, 1.4], hazard: true, build: buildKickerHop },
  { id: 'rail', difficulty: 1, weights: [2.0, 1.5, 1.2], build: buildRail },
  { id: 'bench', difficulty: 1, weights: [1.2, 1.0, 0.8], build: buildBench },
  { id: 'ledge', difficulty: 1, weights: [1.0, 1.0, 0.8], build: buildLedge },
  { id: 'highRail', difficulty: 2, weights: [0.3, 1.2, 1.4], build: buildHighRail },
  { id: 'railTransfer', difficulty: 2, weights: [0, 0.9, 1.3], build: buildRailTransfer },
  { id: 'gapRail', difficulty: 3, weights: [0, 0.8, 1.4], hazard: true, build: buildGapRail },
  { id: 'launchCombo', difficulty: 2, weights: [0.7, 1.2, 1.6], build: buildLaunchCombo },
  { id: 'karenBlocker', difficulty: 1, weights: [1.3, 1.0, 0.8], hazard: true, karen: true, build: buildKarenBlocker },
  { id: 'karenStepper', difficulty: 2, weights: [0.4, 1.2, 1.2], hazard: true, karen: true, build: buildKarenStepper },
  { id: 'karenCharger', difficulty: 3, weights: [0, 1.0, 1.4], hazard: true, karen: true, build: buildKarenCharger },
  { id: 'karenCart', difficulty: 2, weights: [0.5, 1.0, 1.2], hazard: true, karen: true, build: buildKarenCart },
];

const ATTRACT_IDS = new Set(['flat', 'kicker', 'rail', 'bench', 'ledge', 'highRail', 'railTransfer', 'launchCombo']);
// Minimum segments between two Karen encounters, by tier.
const KAREN_COOLDOWN = [3, 2, 1];

export class LevelGenerator {
  constructor(world) {
    this.world = world;
    this.rng = null;
    this.hazards = []; // [x0, x1] spans, kept for debug overlay + validation
  }

  reset(rng, startX, { attract = false } = {}) {
    this.rng = rng;
    this.attract = attract;
    this.cursor = startX + L.startClear;
    this.lastId = null;
    this.sinceKaren = 99;
    this.count = 0;
    this.hazards.length = 0;
  }

  static tierAt(t) {
    return t < L.tierTimes[0] ? 0 : t < L.tierTimes[1] ? 1 : 2;
  }

  // Keep the street generated past the right edge and recycle what's behind.
  update(camX, viewW, playerX, speed, elapsed) {
    const horizon = camX + viewW + L.lookahead;
    const s = Math.max(speed, P.baseSpeed);
    let guard = 0;
    while (this.cursor < horizon && guard++ < 24) {
      const tEst = elapsed + (this.cursor - playerX) / s;
      this.spawnNext(LevelGenerator.tierAt(tEst), s);
    }
    this.world.cull(camX - 400);
    while (this.hazards.length && this.hazards[0][1] < camX - 400) this.hazards.shift();
  }

  spawnNext(tier, speed) {
    const seg = this.pickSegment(tier);
    const ctx = {
      tier,
      speed,
      rng: this.rng,
      x: this.cursor + (seg.id === 'flat' ? 0 : speed * L.reaction[tier] + 40),
    };
    const end = seg.build(this, ctx);
    this.cursor = Math.max(end, ctx.x + 40);
    this.lastId = seg.id;
    this.sinceKaren = seg.karen ? 0 : this.sinceKaren + 1;
    this.count++;
    if (CONFIG.debug) this.validate();
  }

  pickSegment(tier) {
    // Open each run with something to play on rather than something to dodge.
    if (this.count === 0 && !this.attract) {
      const id = this.rng.chance(0.5) ? 'rail' : 'kicker';
      return SEGMENTS.find((s) => s.id === id);
    }
    let total = 0;
    const options = [];
    for (const seg of SEGMENTS) {
      if (!this.allowed(seg, tier)) continue;
      total += seg.weights[tier];
      options.push(seg);
    }
    let roll = this.rng.next() * total;
    for (const seg of options) {
      roll -= seg.weights[tier];
      if (roll <= 0) return seg;
    }
    return options[options.length - 1];
  }

  allowed(seg, tier) {
    if (seg.weights[tier] <= 0) return false;
    if (this.attract) return ATTRACT_IDS.has(seg.id);
    if (seg.id === this.lastId && seg.id !== 'obstacle' && seg.id !== 'flat') return false;
    if (seg.karen && this.sinceKaren < KAREN_COOLDOWN[tier]) return false;
    return true;
  }

  logHazard(x0, x1) {
    this.hazards.push([x0, x1]);
  }

  // Debug check: consecutive hazards must leave room to land and react.
  validate() {
    const h = this.hazards;
    for (let i = 1; i < h.length; i++) {
      const gap = h[i][0] - h[i - 1][1];
      if (gap < P.baseSpeed * (OLLIE_AIR * 0.6) && gap > 0) {
        console.warn('[LevelGenerator] tight hazard spacing', Math.round(gap), h[i - 1], h[i]);
      }
    }
  }

  // Distance past a take-off point that a landing can reach (with margin).
  landingAfter(vy, h0, speed) {
    const t = Physics.descendTime(h0, vy, 0, G) || OLLIE_AIR;
    return t * speed * 1.12 + 40;
  }

  ollieLanding(speed) {
    return OLLIE_AIR * speed * 1.12 + 30;
  }

  railExitLanding(h, speed) {
    return this.landingAfter(P.railPopImpulse, h - P.railContact, speed);
  }
}

// ---------------------------------------------------------------- builders
// Each receives (generator, ctx) and returns the x where its landing zone ends.

function buildFlat(g, c) {
  return c.x + c.rng.range(160, 380);
}

function buildObstacle(g, c) {
  const kinds = c.tier === 0 ? ['cone', 'hydrant', 'trash'] : ['cone', 'hydrant', 'trash', 'barrier', 'barrier'];
  const o = g.world.addObstacle(c.rng.pick(kinds), c.x);
  g.logHazard(o.x - o.w / 2, o.x + o.w / 2);
  return o.x + o.w / 2 + g.ollieLanding(c.speed);
}

function buildConeRow(g, c) {
  const spacing = 34;
  const clearable = Physics.spanAbove(0, P.jumpImpulse, OBSTACLE_TYPES.cone.h + 6, G, c.speed) * 0.7;
  let n = c.tier === 0 ? 2 : c.rng.int(2, 3);
  while (n > 1 && (n - 1) * spacing + OBSTACLE_TYPES.cone.w + PLAYER_W > clearable) n--;
  for (let i = 0; i < n; i++) g.world.addObstacle('cone', c.x + i * spacing);
  const end = c.x + (n - 1) * spacing + OBSTACLE_TYPES.cone.w / 2;
  g.logHazard(c.x - OBSTACLE_TYPES.cone.w / 2, end);
  return end + g.ollieLanding(c.speed);
}

function buildGap(g, c) {
  const ranges = [[90, 125], [105, 150], [120, 175]];
  const [lo, hi] = ranges[c.tier];
  const maxW = OLLIE_AIR * c.speed * 0.78 - PLAYER_W - 24;
  const w = Math.min(c.rng.range(lo, hi), maxW);
  g.world.addGap(c.x, w);
  g.logHazard(c.x, c.x + w);
  return c.x + w + g.ollieLanding(c.speed) * 0.8;
}

function addKicker(g, x, kind = 'kicker') {
  const spec = kind === 'launch' ? L.launchRamp : L.kicker;
  return g.world.addRamp(kind, x, spec.len, spec.h, spec.launch);
}

function rampLanding(g, r, speed) {
  return g.landingAfter(r.launch + P.rampOllieBonus, r.h, speed);
}

function buildKicker(g, c) {
  const r = addKicker(g, c.x);
  return r.x + r.len + rampLanding(g, r, c.speed);
}

// Kicker that auto-launches the skater clean over a wide gap.
function buildKickerGap(g, c) {
  const r = addKicker(g, c.x);
  const lip = r.x + r.len;
  const t = Physics.descendTime(r.h, r.launch, 0, G);
  const reach = t * c.speed * 0.92;
  const w = clamp(c.rng.range(150, 220), 100, reach - 70);
  const gx = lip + 12;
  g.world.addGap(gx, w);
  g.logHazard(gx, gx + w);
  return Math.max(lip + rampLanding(g, r, c.speed), gx + w + 80);
}

// Kicker with an obstacle placed under the guaranteed flight path.
function buildKickerHop(g, c) {
  const r = addKicker(g, c.x);
  const lip = r.x + r.len;
  const kind = c.rng.pick(['trash', 'barrier', 'hydrant']);
  const t = OBSTACLE_TYPES[kind];
  const speeds = [c.speed * 0.85, c.speed, c.speed * 1.15];
  let placed = null;
  for (let dx = 70; dx <= 240 && !placed; dx += 10) {
    let ok = true;
    for (const s of speeds) {
      // check both edges of the obstacle (plus the skater's width)
      for (const edge of [dx - t.w / 2 - PLAYER_W / 2, dx + t.w / 2 + PLAYER_W / 2]) {
        const y = Physics.heightAt(r.h, r.launch, Math.max(0, edge) / s, G);
        if (y - t.h < 30) ok = false;
      }
    }
    if (ok) placed = dx;
  }
  if (placed !== null) {
    g.world.addObstacle(kind, lip + placed);
    g.logHazard(lip + placed - t.w / 2, lip + placed + t.w / 2);
  }
  return lip + rampLanding(g, r, c.speed);
}

function buildRail(g, c) {
  const len = c.rng.range(240, 420);
  const h = c.rng.range(42, 52);
  g.world.addRail('rail', c.x, len, h, '50-50 Grind');
  return c.x + len + g.railExitLanding(h, c.speed);
}

function buildBench(g, c) {
  const len = c.rng.range(150, 200);
  g.world.addRail('bench', c.x, len, 36, '5-0 Grind');
  return c.x + len + g.railExitLanding(36, c.speed);
}

function buildLedge(g, c) {
  const len = c.rng.range(240, 360);
  g.world.addRail('ledge', c.x, len, 48, 'Crooked Grind');
  return c.x + len + g.railExitLanding(48, c.speed);
}

function buildHighRail(g, c) {
  const len = c.rng.range(260, 400);
  const h = c.rng.range(98, 112);
  g.world.addRail('high', c.x, len, h, 'Boardslide');
  return c.x + len + g.railExitLanding(h, c.speed);
}

function buildRailTransfer(g, c) {
  const lenA = c.rng.range(220, 280);
  const hA = 46;
  g.world.addRail('rail', c.x, lenA, hA, '50-50 Grind');
  const bx = c.x + lenA + c.rng.range(120, 170);
  const lenB = c.rng.range(240, 320);
  const hB = c.rng.range(64, 80);
  // Rail B is reachable from a pop off rail A: peak height check.
  const peak = hA - P.railContact + (P.railPopImpulse * P.railPopImpulse) / (2 * G);
  const h = Math.min(hB, peak - 40);
  g.world.addRail('high', bx, lenB, h, 'Boardslide');
  return bx + lenB + g.railExitLanding(h, c.speed);
}

// A rail bridging a gap. Missing the rail is fine: the gap itself is ollie-able.
function buildGapRail(g, c) {
  const w = Math.min(c.rng.range(110, 160), OLLIE_AIR * c.speed * 0.78 - PLAYER_W - 24);
  const gx = c.x + 140;
  g.world.addGap(gx, w);
  g.logHazard(gx, gx + w);
  const h = 46;
  const railX = c.x;
  const len = 140 + w + c.rng.range(60, 120);
  g.world.addRail('rail', railX, len, h, '50-50 Grind');
  return Math.max(railX + len + g.railExitLanding(h, c.speed), gx + w + g.ollieLanding(c.speed) * 0.8);
}

// Big launch ramp feeding a tall rail: the run's main combo opportunity.
function buildLaunchCombo(g, c) {
  const r = addKicker(g, c.x, 'launch');
  const lip = r.x + r.len;
  const railH = 150;
  const contact = railH - P.railContact;
  const tLow = Physics.descendTime(r.h, r.launch, contact, G);
  const tHigh = Physics.descendTime(r.h, r.launch + P.rampOllieBonus, contact, G);
  const start = lip + Math.max(80, tLow * c.speed * 0.9 - 140);
  const end = lip + tHigh * c.speed * 1.15 + 200;
  g.world.addRail('combo', start, end - start, railH, 'Feeble Grind');
  return Math.max(end + g.railExitLanding(railH, c.speed), lip + rampLanding(g, r, c.speed));
}

function buildKarenBlocker(g, c) {
  const k = g.world.addKaren('blocker', c.x, c.rng);
  g.logHazard(c.x - k.w / 2, c.x + k.w / 2);
  return c.x + k.w / 2 + g.ollieLanding(c.speed);
}

function buildKarenStepper(g, c) {
  const k = g.world.addKaren('stepper', c.x, c.rng);
  g.logHazard(c.x - k.w / 2, c.x + k.w / 2);
  return c.x + k.w / 2 + g.ollieLanding(c.speed);
}

function buildKarenCharger(g, c) {
  const meetX = c.x;
  g.world.addKaren('charger', meetX + c.rng.range(260, 340), c.rng, meetX);
  g.logHazard(meetX - 20, meetX + 20);
  return meetX + g.ollieLanding(c.speed) + 40;
}

function buildKarenCart(g, c) {
  const meetX = c.x;
  g.world.addKaren('cart', meetX + 280, c.rng, meetX);
  g.logHazard(meetX - 30, meetX + 30);
  return meetX + 30 + g.ollieLanding(c.speed);
}
