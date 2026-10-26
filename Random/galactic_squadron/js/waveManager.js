/**
 * Wave manager: builds each stage from a wave definition, schedules the
 * squadron entries, then orchestrates formation fire and dive attacks until
 * every enemy is gone.
 */
import { CONFIG, WAVES } from './config.js';
import { Formation } from './formation.js';
import { Enemy } from './enemy.js';
import { ENTRY_NAMES, makeEntryPath, buildDive } from './paths.js';
import { Path, mulberry32, pick, rand, weightedPick } from './utils.js';

const SHAPES = {
  lines: [8, 8, 8, 8],
  staggered: [8, 7, 8, 7, 8],
  v: [4, 6, 8, 8, 8],
  diamond: [2, 4, 6, 8, 6, 4],
  arc: [4, 6, 8, 8, 8],
};
const LAYOUT_CYCLE = ['lines', 'v', 'staggered', 'arc', 'diamond'];

export function isBossStage(stage) {
  return stage % CONFIG.boss.every === 0;
}

/** Hand-authored wave if one exists, otherwise a deterministic generated wave. */
export function getWaveDef(stage) {
  if (stage <= WAVES.length) return WAVES[stage - 1];
  const rng = mulberry32(stage * 7919);
  const entries = [];
  for (let i = 0; i < 3; i++) {
    const name = pick(ENTRY_NAMES, rng);
    entries.push(rng() < 0.4 ? 'dual-' + name : name);
  }

  if (isBossStage(stage)) {
    const enc = stage / CONFIG.boss.every;
    return {
      boss: true,
      layout: 'lines',
      rows: enc >= 2 ? [8, 6] : [6, 6],
      types: enc >= 3 ? ['ace', 'heavy'] : ['bomber', 'heavy'],
      entries,
    };
  }

  const layout = LAYOUT_CYCLE[stage % LAYOUT_CYCLE.length];
  const rows = SHAPES[layout].slice();
  if (stage < 12 && rows.length > 4) rows.pop();
  const eliteRows = Math.min(2, 1 + Math.floor((stage - 8) / 6));
  const bomberChance = Math.min(0.4, 0.1 + stage * 0.01);
  const types = rows.map((_, r) => {
    if (r < eliteRows) return rng() < 0.5 ? 'ace' : 'bomber';
    if (r === eliteRows) return 'heavy';
    return rng() < bomberChance ? 'bomber' : 'interceptor';
  });
  return { layout, rows, types, entries };
}

const DIVE_KINDS = {
  interceptor: () => 'swoop',
  heavy: () => 'loop',
  bomber: () => 'sweep',
  ace: () => (Math.random() < 0.5 ? 'zigzag' : 'boomerang'),
};

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.stage = 0;
    this.def = null;
    this.formation = null;
    this.queue = [];
    this.queueIndex = 0;
    this.time = 0;
    this.running = false;
    this.entriesDone = false;
    this.diveTimer = 0;
    this.fireTimer = 2;
    this.bossStage = false;
  }

  setupStage(stage) {
    this.reset();
    this.stage = stage;
    this.bossStage = isBossStage(stage);
    this.def = getWaveDef(stage);
    this.formation = new Formation(this.def);
    this.buildQueue();
  }

  start() {
    this.running = true;
    this.time = 0;
  }

  buildQueue() {
    const diff = this.game.diff;
    const slots = this.formation.slots;
    const groupSize = this.def.groupSize || 8;
    const interval = CONFIG.entry.groupInterval / diff.enemySpeed;
    const spacing = CONFIG.entry.spacing / diff.enemySpeed;
    const entries = this.def.entries;

    for (let gi = 0; gi * groupSize < slots.length; gi++) {
      const group = slots.slice(gi * groupSize, (gi + 1) * groupSize);
      let name = entries[gi % entries.length];
      const dual = name.startsWith('dual-');
      if (dual) name = name.slice(5);
      const mirrored = gi % 2 === 1;
      const pathA = makeEntryPath(name, mirrored, CONFIG.entry.jitter);
      const pathB = dual ? makeEntryPath(name, !mirrored, CONFIG.entry.jitter) : null;
      group.forEach((slot, k) => {
        const useB = dual && k % 2 === 1;
        const order = dual ? Math.floor(k / 2) : k;
        this.queue.push({ time: gi * interval + order * spacing, slot, path: useB ? pathB : pathA });
      });
    }
    this.queue.sort((a, b) => a.time - b.time);
  }

  spawn(item) {
    const game = this.game;
    const diff = game.diff;
    const e = new Enemy(item.slot.type, diff.hpBonus);
    e.slot = item.slot;
    item.slot.enemy = e;
    e.follow(item.path, CONFIG.entry.speed * diff.enemySpeed, 'home', rand(-3, 3), rand(-3, 3));
    e.state = 'entering';
    e.homeSpeed = CONFIG.dive.returnSpeed * diff.enemySpeed;
    e.x = item.path.xs[0];
    e.y = item.path.ys[0];
    if (diff.entryFire && Math.random() < 0.18) {
      e.fireMarks = [item.path.length * rand(0.25, 0.5)];
    }
    game.enemies.push(e);
  }

  update(dt) {
    if (!this.running) return;
    const game = this.game;
    const diff = game.diff;
    this.time += dt;

    while (this.queueIndex < this.queue.length && this.queue[this.queueIndex].time <= this.time) {
      this.spawn(this.queue[this.queueIndex++]);
    }

    if (!this.entriesDone && this.queueIndex >= this.queue.length && !game.enemies.some((e) => e.state === 'entering')) {
      this.entriesDone = true;
      this.diveTimer = 1.2;
    }
    this.formation.update(dt, this.entriesDone);

    const playerReady = game.player.alive && game.canEnemiesAttack();
    if (!playerReady) return;

    const alive = game.enemies.length;
    const few = this.entriesDone && alive <= CONFIG.dive.fewLeft;

    if (this.entriesDone) {
      this.diveTimer -= dt * (few ? 1.8 : 1);
      if (this.diveTimer <= 0) {
        let divers = 0;
        for (const e of game.enemies) if (e.diving) divers++;
        if (divers < diff.maxDivers + (few ? 2 : 0)) this.launchAttack();
        this.diveTimer = diff.diveInterval * rand(0.7, 1.3);
      }
    }

    if (this.entriesDone || this.time > 4) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = Math.max(0.15, -Math.log(1 - Math.random()) / diff.formationFireRate);
        const shooters = game.enemies.filter((e) => e.state === 'formation');
        if (shooters.length) game.enemyAttack(pick(shooters), 'formation');
      }
    }
  }

  /** Picks an enemy (weighted by type) to break formation, sometimes with wingmen. */
  launchAttack() {
    const game = this.game;
    const cands = game.enemies.filter((e) => e.state === 'formation');
    if (!cands.length) return;
    const weights = {};
    cands.forEach((e, i) => (weights[i] = e.def.diveWeight));
    const leader = cands[Number(weightedPick(weights))];

    const wingmen = [];
    const wantsEscort = leader.type === 'ace' || (leader.type === 'heavy' && this.stage >= 5);
    if (wantsEscort && Math.random() < 0.6) {
      const near = cands
        .filter((e) => e !== leader && e.type === 'interceptor' && Math.abs(e.x - leader.x) < 130 && Math.abs(e.y - leader.y) < 70)
        .sort((a, b) => Math.abs(a.x - leader.x) - Math.abs(b.x - leader.x));
      for (const w of near.slice(0, 2)) {
        const side = w.x < leader.x ? -1 : 1;
        w.prepareWing(leader, side * 34, -22);
        wingmen.push(w);
      }
    }
    leader.prepareDive(DIVE_KINDS[leader.type](), wingmen);
    game.audio.play('dive');
  }

  /** Called by a leader when its telegraph ends: build the attack run for it and its wingmen. */
  launchDive(leader) {
    const game = this.game;
    const diff = game.diff;
    const dive = buildDive(leader.diveKind, leader, game.player);
    const speed = CONFIG.dive.speed * leader.def.speed * diff.enemySpeed;

    leader.follow(new Path(dive.points), speed, dive.endMode);
    leader.state = 'diving';
    leader.fireMarks = this.fireMarks(leader.path.length, diff.diveShots);

    for (const w of leader.wingmen || []) {
      if (!w.alive || w.state !== 'prep' || w.leader !== leader) continue;
      const [ox, oy] = w.wingOffset;
      const pts = dive.points.map((p, i) => (i === 0 ? [w.x, w.y] : [p[0] + ox, p[1] + oy]));
      w.follow(new Path(pts), speed, dive.endMode);
      w.state = 'diving';
      w.fireMarks = this.fireMarks(w.path.length, Math.min(1, diff.diveShots));
      w.leader = null;
    }
    leader.wingmen = null;
  }

  fireMarks(length, shots) {
    if (shots <= 0) return null;
    const marks = [];
    for (let i = 0; i < shots; i++) marks.push(length * (0.22 + (0.36 * (i + 0.5)) / shots));
    return marks;
  }

  isCleared() {
    const game = this.game;
    if (!this.running || this.queueIndex < this.queue.length || game.enemies.length) return false;
    return !this.bossStage || !game.boss || game.boss.state === 'dead';
  }
}
