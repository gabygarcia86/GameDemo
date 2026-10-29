// Procedural course generation. The road is built from "chunks" (patterns)
// made of rows. Each row says what is in each of the three lanes:
//   null (free) | 'low' (jump it) | 'high' (slide under) | 'block' (go around)
// Rules that keep it fair:
//   - a row can never block all three lanes (row() enforces this);
//   - rows are spaced by the time the player needs to react and move, using
//     the exact speed they'll have at that distance (speedAt), plus extra
//     room after a row that needs a jump or a slide;
//   - moving enemies are timed by distance (see Enemies.js), so the lane
//     they end up in is the lane reserved for them here.

import { CONFIG, laneX, speedAt, difficultyAt, speedLevelAt } from './config.js';
import { spansFor, RAMP, RAIL } from './models/props.js';
import { makeRng, lerp } from './utils.js';

const G = CONFIG.generator;
const LANES = [0, 1, 2];
// How each local beast makes its entrance (beastMove).
const BEAST_MOVES = {
  bear: ['cross', 'charge'], yeti: ['leap'], rockAlien: ['rise', 'cross'], alien: ['beam', 'leap'], scooter: ['weave', 'cross'],
  parkingOfficer: ['cross'], mime: ['cross'], hotdog: ['cross'], pigeons: ['flock'],
  bigfoot: ['cross', 'charge'],
  astronaut: ['hop', 'cross'], ufo: ['swoop'], ship: ['swoop'], lavaMonster: ['rise', 'cross'],
  tieFighter: ['strafe', 'dive'],
};

// name, minimum distance, weight(difficulty)
const CHUNKS = [
  ['breather', 0, (k) => 1.4 - k],
  ['single', 0, () => 1.2],
  ['double', 0, (k) => 0.8 + k * 0.6],
  ['wall', 120, () => 0.8],
  ['mixed', 300, (k) => 0.4 + k * 0.8],
  ['slalom', 450, (k) => 0.3 + k],
  ['gap', 250, () => 0.6],
  ['ramp', 150, () => 0.7],
  ['rail', 100, () => 0.7],
  ['karenBlock', 0, () => 0.9],
  ['karenCart', 200, () => 0.6],
  ['karenCross', 350, (k) => 0.5 + k * 0.4],
  ['karenChase', 700, (k) => 0.35 + k * 0.4],
  ['karenGroup', 900, (k) => 0.2 + k * 0.6],
  ['ninjaBlock', 250, () => 0.7],
  ['ninjaJump', 600, (k) => 0.3 + k * 0.6],
  ['ninjaDrop', 800, (k) => 0.3 + k * 0.4],
  ['ninjaGuard', 500, () => 0.45],
  ['beastBlock', 150, () => 0.8], // only where env.locals is set
  ['beastMove', 400, (k) => 0.5 + k * 0.5],
  ['special', 200, () => 1.0],
];

export class Generator {
  constructor(world) {
    this.world = world;
  }

  reset(env, seed) {
    this.env = env;
    this.rng = makeRng(seed);
    this.nextDist = G.firstObstacle;
    this.last = null;
    this.lastFree = [0, 1, 2];
    this.extra = 0;
    this.nextPowerup = this.rng.range(...CONFIG.powerups.every) * 0.5;
    this.rows = []; // debug markers
    // A welcome line of coins down the middle.
    for (let d = 18; d < G.firstObstacle - 10; d += 2.4) this.world.spawnCoin(0, 0.7, d);
  }

  update(playerDist) {
    while (this.nextDist < playerDist + G.spawnAhead) {
      const d = this.nextDist;
      const k = difficultyAt(d);
      const options = CHUNKS.filter(([name, min]) => d >= min && name !== this.last && (this.env.locals || !name.startsWith('beast')));
      // Evil ninjas turn up more often with every speed step (every 1000 m).
      const ninjaBoost = 1 + speedLevelAt(d) * 0.3;
      const [name] = this.rng.weighted(options, ([n, , w]) => w(k)
        * (n === 'special' ? this.env.specialWeight || 1 : 1)
        * (n.startsWith('ninja') ? ninjaBoost : 1));
      this.last = name;
      this.extra = 0;
      const end = this[name](d, k);
      this.nextDist = end + this.spacing(end) * (1 + this.extra) + this.rng.range(0, this.spacing(end) * 0.5);
    }
  }

  // Distance between two rows at distance d.
  spacing(d) {
    return speedAt(d) * lerp(G.gapTimeEasy, G.gapTimeHard, difficultyAt(d));
  }

  // ---------------------------------------------------------- helpers

  typeFor(cat) {
    return this.rng.pick(this.env.obstacles[cat]);
  }

  // Place one row. specs[lane] = null | 'low' | 'high' | 'block' | {cat, type}
  // | {enemy: 'karen'|'ninja', behavior, ...}. Returns the free lanes.
  row(d, specs) {
    const cats = specs.map((s) => (s == null ? null : typeof s === 'string' ? s : s.enemy ? 'block' : s.cat));
    if (cats.every((c) => c === 'block')) {
      const i = this.rng.int(0, 2);
      specs[i] = null;
      cats[i] = null;
    }
    // A whole row of the same jump/slide obstacle becomes one wide piece if it can.
    if (cats.every((c) => c === 'low') || cats.every((c) => c === 'high')) {
      const cat = cats[0];
      const wide = this.env.obstacles[cat].filter((t) => spansFor(t).includes(3));
      const preset = specs.find((s) => s && typeof s === 'object' && s.type);
      const type = preset && spansFor(preset.type).includes(3) ? preset.type : wide.length ? this.rng.pick(wide) : null;
      if (type && this.rng.chance(0.75)) {
        this.world.spawnObstacle(type, 0, 3, d);
        this.after(cat);
        this.rows.push({ d, cats });
        this.lastFree = [];
        return [];
      }
    }
    // Two neighbouring blocks can become one wide barrier.
    for (let lane = 0; lane < 3; lane++) {
      const s = specs[lane];
      if (s == null) continue;
      if (typeof s === 'object' && s.enemy) {
        this.world.spawnEnemy(s.enemy, s.behavior, lane, d, s.extra || {});
        continue;
      }
      const cat = typeof s === 'string' ? s : s.cat;
      const type = typeof s === 'object' && s.type ? s.type : this.typeFor(cat);
      if (cat === 'block' && lane < 2 && specs[lane + 1] === 'block' && spansFor(type).includes(2) && this.rng.chance(0.5)) {
        this.world.spawnObstacle(type, lane, 2, d);
        specs[lane + 1] = null;
        continue;
      }
      this.world.spawnObstacle(type, lane, 1, d, s.extra || {});
    }
    for (const c of cats) if (c === 'low' || c === 'high') this.after(c);
    this.rows.push({ d, cats });
    const free = LANES.filter((l) => cats[l] === null);
    this.lastFree = free;
    return free;
  }

  after(cat) {
    const extra = cat === 'low' ? G.afterJumpRow : G.afterSlideRow;
    this.extra = Math.max(this.extra, extra / lerp(G.gapTimeEasy, G.gapTimeHard, 0.5));
  }

  coinLine(lane, d0, d1, y = 0.7) {
    for (let d = d0; d <= d1; d += 2.3) this.world.spawnCoin(laneX(lane), y, d);
  }

  // Coins along the arc of a normal jump centred on d.
  coinJumpArc(lane, d) {
    const P = CONFIG.player;
    const air = (2 * P.jumpVel) / P.gravity;
    const len = speedAt(d) * air;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const time = t * air;
      const y = 0.7 + P.jumpVel * time - 0.5 * P.gravity * time * time;
      this.world.spawnCoin(laneX(lane), y, d - len / 2 + t * len);
    }
  }

  maybePowerup(lane, d) {
    if (d < this.nextPowerup) return false;
    const kinds = ['magnet', 'shield', 'frenzy'];
    this.world.spawnPowerup(this.rng.pick(kinds), lane, d);
    this.nextPowerup = d + this.rng.range(...CONFIG.powerups.every);
    return true;
  }

  // Reward a free lane in a row with coins (or a power-up).
  rewardFree(free, d) {
    if (!free.length) return;
    const lane = this.rng.pick(free);
    if (!this.maybePowerup(lane, d)) this.coinLine(lane, d - 6, d + 2);
  }

  randomCat(k, allowBlock = true) {
    const r = this.rng();
    if (allowBlock && r < 0.4 + k * 0.1) return 'block';
    return r < 0.75 ? 'low' : 'high';
  }

  // ----------------------------------------------------------- chunks

  breather(d) {
    const lane = this.rng.int(0, 2);
    const len = this.rng.range(30, 50);
    if (this.rng.chance(0.5)) {
      this.coinLine(lane, d, d + len);
    } else {
      // Zig-zag
      let l = lane;
      for (let x = d; x < d + len; x += 12) {
        this.coinLine(l, x, x + 8);
        l = Math.max(0, Math.min(2, l + (this.rng.chance(0.5) ? 1 : -1)));
      }
    }
    this.maybePowerup(this.rng.int(0, 2), d + len * 0.6);
    return d + len;
  }

  single(d, k) {
    const lane = this.rng.int(0, 2);
    const cat = this.randomCat(k);
    const specs = [null, null, null];
    specs[lane] = cat;
    const free = this.row(d, specs);
    if (cat === 'low' && this.rng.chance(0.6)) this.coinJumpArc(lane, d);
    else this.rewardFree(free, d);
    return d;
  }

  double(d, k) {
    const freeLane = this.rng.int(0, 2);
    const specs = LANES.map((l) => (l === freeLane ? null : this.randomCat(k, k > 0.1)));
    const free = this.row(d, specs);
    this.rewardFree(free.length ? free : [freeLane], d);
    return d;
  }

  wall(d) {
    const cat = this.rng.chance(0.6) ? 'low' : 'high';
    this.row(d, [cat, cat, cat]);
    const lane = this.rng.int(0, 2);
    if (cat === 'low') this.coinJumpArc(lane, d);
    else this.coinLine(lane, d - 4, d + 4, 0.45);
    return d;
  }

  mixed(d) {
    const cats = this.rng.chance(0.5) ? ['block', 'low', 'high'] : ['high', 'block', 'low'];
    if (this.rng.chance(0.5)) cats.reverse();
    this.row(d, cats);
    return d;
  }

  slalom(d, k) {
    const rows = this.rng.int(3, 4 + Math.round(k * 2));
    let free = this.rng.int(0, 2);
    let at = d;
    for (let i = 0; i < rows; i++) {
      const specs = LANES.map((l) => (l === free ? null : 'block'));
      this.row(at, specs);
      this.coinLine(free, at - 3, at + 1);
      const options = LANES.filter((l) => l !== free && Math.abs(l - free) <= (k > 0.5 ? 2 : 1));
      free = this.rng.pick(options);
      if (i < rows - 1) at += this.spacing(at) * 1.05;
    }
    return at;
  }

  gap(d) {
    this.world.spawnGap(d, 3);
    this.rows.push({ d, cats: ['low', 'low', 'low'] });
    this.after('low');
    const lane = this.rng.int(0, 2);
    if (this.rng.chance(0.5)) {
      // A ramp in front of the gap for a big launch over it.
      const rd = d - RAMP.length / 2 - this.rng.range(5, 9);
      this.world.spawnRamp(lane, rd);
      this.rampCoins(lane, rd);
    } else {
      this.coinJumpArc(lane, d);
    }
    return d + 3;
  }

  rampCoins(lane, rampDist) {
    const P = CONFIG.player;
    const v = P.rampVel;
    const air = (v + Math.sqrt(v * v + 2 * P.gravity * RAMP.height)) / P.gravity;
    const speed = speedAt(rampDist);
    const start = rampDist + RAMP.length / 2;
    for (let i = 1; i <= 9; i++) {
      const t = (i / 10) * air;
      const y = RAMP.height + v * t - 0.5 * P.gravity * t * t + 0.8;
      this.world.spawnCoin(laneX(lane), y, start + speed * t);
    }
    return start + speed * air;
  }

  ramp(d, k) {
    const lane = this.rng.int(0, 2);
    this.world.spawnRamp(lane, d);
    const land = this.rampCoins(lane, d);
    // Something tall under the flight path that the ramp jumps clean over,
    // with a way around it for anyone who skipped the ramp.
    const mid = (d + RAMP.length / 2 + land) / 2;
    const specs = [null, null, null];
    specs[lane] = 'block';
    if (k > 0.3) {
      const other = this.rng.pick(LANES.filter((l) => l !== lane));
      specs[other] = this.randomCat(k, false);
    }
    this.row(mid, specs);
    return land;
  }

  rail(d, k) {
    const lane = this.rng.int(0, 2);
    const len = Math.round(this.rng.range(18, 30 + k * 12) / RAIL.segment) * RAIL.segment;
    const rail = this.world.spawnRail(lane, d, len);
    this.coinLine(lane, d + 1, rail.d1 - 1, RAIL.top + 0.75);
    // The other lanes get obstacles; the rail lane is safe if you jump onto it.
    const others = LANES.filter((l) => l !== lane);
    for (let at = d + 8; at < rail.d1 - 4; at += this.spacing(at) * 0.9) {
      const specs = [null, null, null];
      for (const l of others) if (this.rng.chance(0.75)) specs[l] = this.randomCat(k);
      this.row(at, specs);
    }
    return rail.d1;
  }

  karenBlock(d, k) {
    const n = k > 0.25 && this.rng.chance(0.5) ? 2 : 1;
    const lanes = this.pickLanes(n);
    const specs = [null, null, null];
    for (const l of lanes) specs[l] = { enemy: 'karen', behavior: 'block' };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  karenCart(d, k) {
    const lane = this.rng.int(0, 2);
    const specs = [null, null, null];
    specs[lane] = { enemy: 'karen', behavior: 'cart' };
    // Abandoned carts in another lane (jumpable).
    if (this.rng.chance(0.5 + k * 0.3)) {
      const other = this.rng.pick(LANES.filter((l) => l !== lane));
      specs[other] = { cat: 'low', type: 'cart' };
    }
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d + 1;
  }

  karenCross(d, k) {
    const lane = this.rng.int(0, 2);
    // Walk in from the far side so she crosses the road in view.
    const side = lane === 0 ? 1 : lane === 2 ? -1 : this.rng.chance(0.5) ? -1 : 1;
    const specs = [null, null, null];
    specs[lane] = { enemy: 'karen', behavior: 'cross', extra: { side } };
    if (k > 0.4 && this.rng.chance(0.5)) {
      const other = this.rng.pick(LANES.filter((l) => l !== lane));
      specs[other] = 'low';
    }
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  karenChase(d) {
    const lane = this.rng.chance(0.5) ? 0 : 2;
    const specs = [null, null, null];
    specs[lane] = { enemy: 'karen', behavior: 'chase' };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  karenGroup(d, k) {
    // "The Karen convention": two rows, two Karens each, the gap moves.
    let at = d;
    let freeLane = this.rng.int(0, 2);
    for (let i = 0; i < 2; i++) {
      const specs = LANES.map((l) => (l === freeLane ? null : { enemy: 'karen', behavior: i === 0 ? 'block' : this.rng.pick(['block', 'cart']) }));
      this.row(at, specs);
      this.coinLine(freeLane, at - 3, at + 1);
      freeLane = this.rng.pick(LANES.filter((l) => l !== freeLane && Math.abs(l - freeLane) === 1));
      at += this.spacing(at) * 1.15;
    }
    void k;
    return at;
  }

  // Chance of a second ninja in a ninja row: grows every 1000 m.
  ninjaPairChance(d, k) {
    return Math.min(0.9, (k > 0.3 ? 0.5 : 0) + speedLevelAt(d) * 0.12);
  }

  ninjaBlock(d, k) {
    const n = this.rng.chance(this.ninjaPairChance(d, k)) ? 2 : 1;
    const lanes = this.pickLanes(n);
    const specs = [null, null, null];
    for (const l of lanes) specs[l] = { enemy: 'ninja', behavior: 'block' };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  ninjaJump(d) {
    const final = this.rng.int(0, 2);
    const start = this.rng.pick(LANES.filter((l) => l !== final));
    const hops = this.rng.chance(0.5) ? [start, final] : [this.rng.pick(LANES.filter((l) => l !== start)), start, final];
    const specs = [null, null, null];
    specs[final] = { enemy: 'ninja', behavior: 'jump', extra: { hops } };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  ninjaDrop(d, k) {
    const n = this.rng.chance(this.ninjaPairChance(d, k) * 0.8) ? 2 : 1;
    const specs = [null, null, null];
    for (const l of this.pickLanes(n)) specs[l] = { enemy: 'ninja', behavior: 'drop' };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  ninjaGuard(d, k) {
    // A ninja guarding a treasure chest. Star him to grab it.
    const lane = this.rng.int(0, 2);
    const specs = [null, null, null];
    specs[lane] = { enemy: 'ninja', behavior: 'block' };
    if (k > 0.4 || this.rng.chance(this.ninjaPairChance(d, k))) {
      const other = this.rng.pick(LANES.filter((l) => l !== lane));
      specs[other] = { enemy: 'ninja', behavior: 'block' };
    }
    const free = this.row(d, specs);
    this.world.spawnChest(lane, d + 3.5);
    for (const l of free) this.coinLine(l, d - 4, d);
    return d + 4;
  }

  beastBlock(d, k) {
    // A local enemy standing in a lane (a pair, later on).
    const n = k > 0.5 && this.rng.chance(0.35) ? 2 : 1;
    const specs = [null, null, null];
    for (const l of this.pickLanes(n)) specs[l] = { enemy: this.rng.pick(this.env.locals), behavior: 'block' };
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  beastMove(d, k) {
    // Bears wander out of the trees or charge, yetis leap off the snowbank,
    // rock aliens burst out of the ground, Mars aliens beam down from a UFO.
    // However they arrive, they finish in the lane reserved here.
    const lane = this.rng.int(0, 2);
    const near = lane === 0 ? -1 : lane === 2 ? 1 : this.rng.chance(0.5) ? -1 : 1;
    const kind = this.rng.pick(this.env.locals);
    const behavior = this.rng.pick(BEAST_MOVES[kind]);
    const side = behavior === 'cross' ? -near : near; // cross from the far side so it's in view
    // Weaving scooters swerve through one or two other lanes on the way in.
    const start = this.rng.pick(LANES.filter((l) => l !== lane));
    const path = this.rng.chance(0.5) ? [start, lane] : [this.rng.pick(LANES.filter((l) => l !== start)), start, lane];
    const specs = [null, null, null];
    specs[lane] = { enemy: kind, behavior, extra: { side, path } };
    if (k > 0.4 && this.rng.chance(0.5)) {
      const other = this.rng.pick(LANES.filter((l) => l !== lane));
      specs[other] = 'low';
    }
    const free = this.row(d, specs);
    this.rewardFree(free, d);
    return d;
  }

  special(d, k) {
    const sp = this.env.special;
    let at = d;
    if (sp === 'ice') {
      // Slippery patch with something to steer around on it.
      this.world.spawnIce(d);
      const specs = [null, null, null];
      specs[this.rng.int(0, 2)] = 'block';
      this.row(d + 1, specs);
      this.coinLine(this.rng.int(0, 2), d - 3, d + 4);
      return d + 4;
    }
    const rows = this.rng.int(2, 3);
    for (let i = 0; i < rows; i++) {
      const specs = [null, null, null];
      if (sp === 'fireball' || sp === 'asteroid' || sp === 'laser') {
        // Fireballs and asteroids crash into one or two lanes (the ring shows
        // where); laser bolts streak up one or two lanes.
        const lanes = this.pickLanes(this.rng.chance(0.35 + k * 0.4) ? 2 : 1);
        for (const l of lanes) specs[l] = { cat: 'block', type: sp, extra: { side: this.rng.chance(0.5) ? 1 : -1 } };
        const free = this.row(at, specs);
        if (free.length) this.coinLine(this.rng.pick(free), at - 4, at + 2);
      } else if (sp === 'branch' || sp === 'neonSign' || sp === 'satellite' || sp === 'scaffold') {
        if (this.rng.chance(0.6)) {
          this.row(at, [{ cat: 'high', type: sp }, { cat: 'high', type: sp }, { cat: 'high', type: sp }]);
        } else {
          const lane = this.rng.int(0, 2);
          specs[lane] = { cat: 'high', type: sp };
          const other = this.rng.pick(LANES.filter((l) => l !== lane));
          specs[other] = k > 0.3 ? 'block' : null;
          this.row(at, specs);
        }
      } else {
        // Tumbleweeds, hay bales, beach balls, rovers, drifting asteroids:
        // jumpable, one or two lanes.
        const lanes = this.pickLanes(this.rng.chance(0.4 + k * 0.3) ? 2 : 1);
        for (const l of lanes) {
          const side = l === 0 ? 1 : l === 2 ? -1 : this.rng.chance(0.5) ? 1 : -1;
          specs[l] = { cat: 'low', type: sp, extra: { side } };
        }
        const free = this.row(at, specs);
        if (free.length) this.coinLine(this.rng.pick(free), at - 3, at + 1);
        else this.coinJumpArc(lanes[0], at);
      }
      if (i < rows - 1) at += this.spacing(at) * (1 + this.extra);
    }
    return at;
  }

  pickLanes(n) {
    const lanes = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = this.rng.int(0, i);
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    return lanes.slice(0, n);
  }
}
