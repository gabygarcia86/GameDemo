// Enemy behaviours. Every moving enemy is driven by dRem (distance left until
// the player reaches its spot) rather than by time, so wherever it ends up when
// the player arrives is fixed in advance. That's what lets the generator keep
// every encounter fair: a crossing Karen always finishes in the lane the
// generator reserved for her, however fast you're going.

import { THREE, prefabMesh, bubbleTexture } from './gfx.js';
import { CONFIG, laneX } from './config.js';
import { KarenRig } from './models/karen.js';
import { NinjaRig, EVIL_PALETTES } from './models/ninja.js';
import { BeastRig, buildUfo } from './models/beasts.js';
import { ScooterRig } from './models/scooter.js';
import { TownRig } from './models/townsfolk.js';
import { CraftRig } from './models/craft.js';
import { obstaclePrefab } from './models/props.js';
import { smoothstep, lerp, damp } from './utils.js';

export const KAREN_LINES = [
  'MANAGER!', 'EXCUSE ME?!', 'SLOW DOWN!', "I'M CALLING THE HOA!", 'NO SKATING!', 'UNBELIEVABLE!',
  'I KNOW THE OWNER!', '1 STAR REVIEW!', 'HELMET?!', 'NO NINJAS ALLOWED!', 'I HAVE A COUPON!',
  'THIS IS MY LANE!', 'WHO RAISED YOU?!', "I'M FILMING THIS!",
];
export const KAREN_CHASE_LINES = ['GET BACK HERE!', 'I WANT TO SPEAK TO YOUR SENSEI!', 'COME BACK!', "YOU'RE ON CAMERA!"];
export const NINJA_LINES = ['HYAAA!', 'YOU SHALL NOT PASS!', 'PREPARE YOURSELF!', 'TOO SLOW!', 'HAI-YA!', 'EN GARDE!', 'FACE ME!'];
export const KAREN_KO = ['POOF!', 'REFUND!', 'BYE KAREN!', 'DENIED!'];
export const NINJA_KO = ['BAM!', 'KO!', 'WHAM!', 'POW!'];
export const BEAR_LINES = ['ROAR!', 'GRRRRR!', 'MY WOODS!', 'GOT HONEY?!', 'UNBEARABLE!', 'BEAR WITH ME!'];
export const YETI_LINES = ['RAAAWR!', 'HUNGRY!', 'SNOW WAY!', 'YETI OR NOT!', 'ABOMINABLE!', 'COLD FEET?!'];
export const BEAR_KO = ['TIMBER!', 'BEAR-LY!', 'GRR-BONK!', 'HIBERNATE!'];
export const YETI_KO = ['BRRR!', 'CHILLED!', 'SNOW-KO!', 'MELTED!'];
export const ROCK_ALIEN_LINES = ['RUMBLE!', 'MY CRATER!', 'ROCK ON!', 'YOU SHALL NOT PASS!', 'GRAVEL GRRR!', 'BOULDER DASH!'];
export const ALIEN_LINES = ['ACK ACK!', 'TAKE ME TO YOUR LEADER!', 'EARTHLING!', 'ZORP!', 'PROBE TIME!', 'NICE BOARD, HUMAN!'];
export const ROCK_ALIEN_KO = ['CRUMBLE!', 'ROCKED!', 'GRAVEL!', 'SMASH!'];
export const ALIEN_KO = ['ZAPPED!', 'BEAM ME UP!', 'ACK!', 'ZORP-KO!'];
export const SCOOTER_LINES = ['ON YOUR LEFT!', 'BEEP BEEP!', 'MOVE IT!', "I'M LATE!", 'BIKE LANE, BRO!', 'WHEEEE!', 'ONE SEC, TEXTING!'];
export const SCOOTER_KO = ['SCOOTED!', 'BATTERY DEAD!', 'DOCKED!', 'WIPEOUT!'];
export const OFFICER_LINES = ['TICKET!', 'NO PARKING!', "YOU'RE GETTING TOWED!", 'EXPIRED METER!', "THAT'S A FINE!", 'LICENSE PLEASE!'];
export const MIME_LINES = ['...', '(INVISIBLE WALL)', '(SILENT SCREAM)', '(PULLS ROPE)', '. . . !', '(SHRUGS)'];
export const HOTDOG_LINES = ['HOT DOGS!', 'GET YER DOGS!', 'EXTRA MUSTARD?', 'NO REFUNDS!', 'RELISH THIS!', 'TWO FOR FIVE!'];
export const PIGEON_LINES = ['COO!', 'COO COO!', 'BREAD?!', 'FLAP FLAP!', 'MINE! MINE!'];
export const ASTRONAUT_LINES = ['HOUSTON?!', 'ONE SMALL STEP!', 'GROUND CONTROL!', 'NO SKATING ON THE MOON!', 'MOON WALK!'];
export const UFO_LINES = ['BEEP BOOP!', 'PREPARE FOR PROBING!', 'ZORP ZORP!', 'WE COME IN PEACE... NOT!'];
export const SHIP_LINES = ['PEW PEW!', 'TARGET LOCKED!', 'RED FIVE, GOING IN!', 'ENGAGE!'];
export const BIGFOOT_LINES = ['HOOOOO!', 'NO PHOTOS!', 'YOU SAW NOTHING!', '*BLURRY GRUNT*', 'I AM NOT A MYTH!'];
export const BIGFOOT_KO = ['MYTH BUSTED!', 'SPOTTED!', 'CAUGHT ON CAMERA!', 'BLURRY!'];
export const LAVA_LINES = ['ROOAARR!', 'HOT HOT HOT!', 'FEEL THE BURN!', "YOU'RE TOAST!", 'MAGMA TIME!'];
export const ASTRONAUT_KO = ['LIFTOFF!', 'HOUSTON...', 'ZERO G!', 'SPACED!'];
export const UFO_KO = ['CRASH LANDED!', 'ABDUCTED!', 'SAUCER SMASH!', 'ZORP-KO!'];
export const SHIP_KO = ['SHOT DOWN!', 'KABOOM!', 'EJECT!', 'MAYDAY!'];
export const TIE_LINES = ['STAY ON TARGET!', 'TARGET THE NINJA!', "HE'S TOO FAST!", 'CLOSE THE TRENCH!', 'ALL WINGS, ATTACK!', 'NO SKATING IN THE TRENCH!'];
export const TIE_KO = ['SPLASHED!', 'SPUN OUT!', "TIE'D UP!", 'WINGED!'];
export const LAVA_KO = ['COOLED OFF!', 'SIZZLE!', 'ROCK SOLID!', 'EXTINGUISHED!'];
export const OFFICER_KO = ['TICKETED!', 'CITED!', 'TOWED!', 'VOID!'];
export const MIME_KO = ['...POP!', 'BOX BROKEN!', 'MIMED OUT!', '(SILENT BONK)'];
export const HOTDOG_KO = ['RELISHED!', 'MUSTARD!', 'DOG GONE!', 'SPLAT!'];
export const PIGEON_KO = ['FEATHERS!', 'SCATTER!', 'COO-KO!', 'FLAP OFF!'];
const KO_WORDS = {
  karen: KAREN_KO, ninja: NINJA_KO, bear: BEAR_KO, yeti: YETI_KO, rockAlien: ROCK_ALIEN_KO, alien: ALIEN_KO, scooter: SCOOTER_KO,
  parkingOfficer: OFFICER_KO, mime: MIME_KO, hotdog: HOTDOG_KO, pigeons: PIGEON_KO,
  astronaut: ASTRONAUT_KO, ufo: UFO_KO, ship: SHIP_KO, lavaMonster: LAVA_KO, bigfoot: BIGFOOT_KO, tieFighter: TIE_KO,
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Swerving through a list of lanes as p goes 0..1, settling in the last one a
// little early. Returns x and a lean into the swerve.
function weave(path, p) {
  const n = path.length - 1;
  if (n <= 0) return { x: laneX(path[0]), lean: 0 };
  const f = Math.min(n, p * n * 1.15);
  const i = Math.min(n - 1, Math.floor(f));
  const k = smoothstep(0, 1, f - i);
  return { x: lerp(laneX(path[i]), laneX(path[i + 1]), k), lean: (path[i + 1] - path[i]) * Math.sin(k * Math.PI) * -0.35 };
}

class EnemyBase {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
    this.bubble.visible = false;
    this.bubble.renderOrder = 15;
    this.group.add(this.bubble);
  }

  reset(spec) {
    this.spec = spec;
    this.behavior = spec.behavior;
    this.lane = spec.lane;
    this.dist = spec.dist;
    this.baseDist = spec.dist;
    this.x = laneX(spec.lane);
    this.y = 0;
    this.yaw = 0;
    this.alive = true;
    this.dying = 0;
    this.passed = false;
    this.hit = false;
    this.active = false;
    this.collidable = true;
    this.halfW = 0.55;
    this.halfD = 0.4;
    this.top = 1.95;
    this.bottom = 0;
    this.cat = 'block';
    this.t = Math.random() * 5;
    this.group.visible = false;
    this.group.scale.set(1, 1, 1);
    this.body.rotation.set(0, 0, 0);
    this.line = null;
    this.saying = 0;
    this.saidLine = false;
    this.voiced = false;
    this.targeted = false;
    this.bubbleY = 2.75;
  }

  say(text, time = 1.6) {
    const { tex, aspect } = bubbleTexture(text);
    this.bubble.material.map = tex;
    this.bubble.material.needsUpdate = true;
    const h = 0.62;
    this.bubble.scale.set(h * aspect, h, 1);
    this.saying = time;
  }

  updateBubble(dt, dRem) {
    if (this.line && dRem < 52 && dRem > 9 && !this.saidLine) {
      this.say(this.line, 2.2);
      this.saidLine = true;
    }
    this.saying -= dt;
    this.bubble.visible = this.saying > 0 && this.alive && !this.dying;
    this.bubble.position.set(0, this.bubbleY, 0);
  }

  // Cartoon pop: squash, stretch, spin, then the caller spawns the burst.
  updateDying(dt) {
    this.dying += dt;
    const k = this.dying / 0.28;
    const sx = k < 0.4 ? 1 + k * 0.9 : 1.36 - (k - 0.4) * 1.8;
    const sy = k < 0.4 ? 1 - k * 0.9 : 0.64 + (k - 0.4) * 2.4;
    this.group.scale.set(Math.max(0.01, sx), Math.max(0.01, sy), Math.max(0.01, sx));
    this.body.rotation.y += dt * 25;
    return k >= 1;
  }
}

export class Karen extends EnemyBase {
  constructor(scene, outline) {
    super(scene);
    this.kind = 'karen';
    this.rig = new KarenRig({ outline });
    this.rig.root.scale.setScalar(0.86);
    this.body = this.rig.root;
    this.group.add(this.rig.root);
    this.cart = null;
    this.env = null;
  }

  setup(spec, env) {
    this.reset(spec);
    this.line = this.behavior === 'chase' ? pick(KAREN_CHASE_LINES) : pick(KAREN_LINES);
    this.saidLine = false;
    if (this.behavior === 'cart') {
      if (!this.cart || this.cartEnv !== env.id) {
        if (this.cart) this.group.remove(this.cart);
        this.cart = prefabMesh(obstaclePrefab('cart', 1, env));
        this.cartEnv = env.id;
        this.group.add(this.cart);
      }
      this.cart.visible = true;
      this.cart.position.set(0, 0, 0.95);
      this.halfD = 1.0;
      this.dist = spec.dist + 0.5;
    } else if (this.cart) {
      this.cart.visible = false;
    }
    if (this.behavior === 'cross') {
      this.side = spec.side || (Math.random() < 0.5 ? -1 : 1);
      this.x = this.side * (CONFIG.road.halfWidth + 2.2);
    }
    if (this.behavior === 'chase') {
      this.side = this.lane === 0 ? -1 : 1;
      this.x = this.side * (CONFIG.road.halfWidth + 1.1);
      this.collidable = false;
    }
  }

  update(dt, pDist, speed) {
    const dRem = this.baseDist - pDist;
    this.t += dt;
    let mode = 'angry';
    let speedMul = 1;
    this.yaw = 0;
    const tx = laneX(this.lane);
    if (this.behavior === 'cross') {
      const p = smoothstep(58, 12, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 2.2), tx, p);
      if (p > 0 && p < 1) {
        mode = 'walk';
        this.yaw = -this.side * Math.PI / 2;
      }
    } else if (this.behavior === 'chase') {
      // Sprint up from behind along the shoulder, then cut into the lane.
      const R0 = 95;
      const catchUp = smoothstep(R0, 34, dRem);
      const off = lerp(-9, dRem, catchUp);
      this.dist = pDist + off;
      if (dRem <= 34) this.dist = this.baseDist;
      const step = smoothstep(32, 18, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 1.1), tx, step);
      this.collidable = Math.abs(this.x) < CONFIG.road.halfWidth - 0.6;
      if (catchUp < 1) {
        mode = 'run';
        this.yaw = Math.PI; // facing away from us, running downhill
        speedMul = 1.2;
      } else if (step < 1) {
        mode = 'walk';
        this.yaw = -this.side * Math.PI / 2;
      }
      this.active = dRem < R0;
    } else if (this.behavior === 'cart') {
      mode = 'push';
      speedMul = 0.6;
    }
    if (this.behavior !== 'chase') this.active = dRem < CONFIG.road.ahead;
    this.rig.animate(dt, mode, speedMul);
    this.updateBubble(dt, dRem);
  }
}

export class EvilNinja extends EnemyBase {
  constructor(scene, outline, paletteIndex) {
    super(scene);
    this.kind = 'ninja';
    this.palette = EVIL_PALETTES[paletteIndex % EVIL_PALETTES.length];
    this.rig = new NinjaRig({ evil: true, palette: this.palette, outline });
    this.rig.root.scale.setScalar(0.92);
    this.body = this.rig.root;
    this.group.add(this.rig.root);
  }

  setup(spec) {
    this.reset(spec);
    this.top = 1.85;
    this.halfW = 0.5;
    this.line = Math.random() < 0.7 ? pick(NINJA_LINES) : null;
    this.saidLine = false;
    this.throws = 0;
    this.throwCd = 0.6 + Math.random() * 0.6;
    this.throwAnim = 0;
    this.hops = spec.hops || null; // [laneA, laneB, ..., finalLane]
    if (this.hops) this.x = laneX(this.hops[0]);
    this.lane = this.hops ? this.hops[this.hops.length - 1] : spec.lane;
  }

  update(dt, pDist, speed, world) {
    const dRem = this.dist - pDist;
    this.t += dt;
    this.active = dRem < CONFIG.road.ahead;
    const rig = this.rig;
    let airborne = 0;
    this.yaw = 0;
    if (this.behavior === 'jump' && this.hops) {
      // Hop between lanes at fixed dRem marks; settled in the final lane by
      // dRem 28 at the latest.
      const marks = [52, 38];
      let x = laneX(this.hops[0]);
      let y = 0;
      for (let i = 1; i < this.hops.length; i++) {
        const start = marks[i - 1] ?? 38;
        const end = start - 10;
        const p = smoothstep(start, end, dRem);
        if (p > 0) {
          x = lerp(laneX(this.hops[i - 1]), laneX(this.hops[i]), p);
          y = Math.sin(p * Math.PI) * 1.9;
          if (p > 0 && p < 1) airborne = p;
        }
      }
      this.x = x;
      this.y = y;
    } else if (this.behavior === 'drop') {
      // Falls out of the sky (or the trees) into the lane.
      const p = smoothstep(48, 30, dRem);
      this.y = (1 - p) * (1 - p) * 9;
      airborne = p < 1 ? 0.5 : 0;
      this.group.visible = this.active;
    }

    // Fighting stance / mid-air tuck.
    if (airborne) {
      rig.hips.position.y = 0.55;
      rig.setLeg(0, 0.3, -0.1, 0.2);
      rig.setLeg(1, 0.3, 0.1, 0.2);
      rig.setArm(0, 2.4, 0, 0.6);
      rig.setArm(1, 2.4, 0, 0.6);
      rig.body.rotation.x = this.behavior === 'jump' ? -airborne * Math.PI * 2 : 0;
      rig.torso.rotation.set(0.3, 0, 0);
    } else {
      rig.body.rotation.x = 0;
      const b = Math.sin(this.t * 6) * 0.025;
      rig.hips.position.y = 0.52 + b;
      rig.setLeg(0, 0.52 + b, -0.2, 0.12);
      rig.setLeg(1, 0.52 + b, 0.2, -0.12);
      rig.torso.rotation.set(0.15, Math.sin(this.t * 2) * 0.2, 0);
      rig.head.rotation.set(0, 0, Math.sin(this.t * 3) * 0.05);
      if (this.throwAnim > 0) {
        const p = 1 - this.throwAnim / 0.3;
        rig.setArm(1, 1.2, lerp(-1.2, 1.6, p), 0.1);
        rig.setArm(0, 0.8, -0.5, 1.2);
      } else {
        rig.setArm(0, 0.9, 0.9, 1.6 + Math.sin(this.t * 5) * 0.1);
        rig.setArm(1, 0.7, 1.1, 1.4 - Math.sin(this.t * 5) * 0.1);
      }
    }
    rig.updateTails(dt, 6);

    // Throw harmless paint balls while we approach.
    this.throwAnim = Math.max(0, this.throwAnim - dt);
    if (!airborne && dRem < 46 && dRem > 17 && this.throws < 2 && this.alive && !this.dying) {
      this.throwCd -= dt;
      if (this.throwCd <= 0) {
        this.throwCd = 1.1;
        this.throws++;
        this.throwAnim = 0.3;
        world.enemyThrow(this);
      }
    }
    this.collidable = this.y < 1.2;
    this.updateBubble(dt, dRem);
  }
}

// The local beasts: forest bear, snowy yeti, moon rock alien, Mars alien. Big,
// so they take a whole lane, and a single ninja star still drops them.
const CHARGE_RUN = 26; // how far up the road a charging bear starts
const UFO_HEIGHT = 7.5; // saucer height while a Mars alien beams down

const BEASTS = {
  bear: { top: 2.35, lines: BEAR_LINES, ko: ['#ffb347', '#5a2f12'] },
  yeti: { top: 2.5, lines: YETI_LINES, ko: ['#e8f6ff', '#2f6fd8'] },
  rockAlien: { top: 2.5, lines: ROCK_ALIEN_LINES, ko: ['#5ff0ff', '#33364a'] },
  alien: { top: 2.3, lines: ALIEN_LINES, ko: ['#7dffb0', '#3a0a5a'] },
  lavaMonster: { top: 2.8, lines: LAVA_LINES, ko: ['#ffd23f', '#5a1a0a'] },
  bigfoot: { top: 2.75, lines: BIGFOOT_LINES, ko: ['#d8c49a', '#3e2614'] },
};

export class Beast extends EnemyBase {
  constructor(scene, outline, kind) {
    super(scene);
    this.kind = kind;
    this.outline = outline;
    this.rig = new BeastRig({ kind, outline });
    this.body = this.rig.root;
    this.group.add(this.rig.root);
    this.poofColors = this.rig.poofColors;
    this.koColors = BEASTS[kind].ko;
    this.ufo = null;
  }

  setup(spec) {
    this.reset(spec);
    const info = BEASTS[this.kind];
    this.halfW = 0.68;
    this.halfD = 0.55;
    this.top = info.top;
    this.bubbleY = this.top + 0.8;
    this.line = pick(info.lines);
    this.saidLine = false;
    this.burst = false;
    this.side = spec.side || (this.lane === 0 ? -1 : this.lane === 2 ? 1 : Math.random() < 0.5 ? -1 : 1);
    if (this.behavior === 'cross') this.x = this.side * (CONFIG.road.halfWidth + 2.4);
    if (this.behavior === 'leap') this.x = this.side * (CONFIG.road.halfWidth + 2.6);
    if (this.behavior === 'charge') this.dist = spec.dist + CHARGE_RUN;
    if (this.behavior === 'beam' && !this.ufo) {
      this.ufo = buildUfo(this.outline);
      this.group.add(this.ufo.group);
    }
    if (this.ufo) this.ufo.group.visible = this.behavior === 'beam';
  }

  update(dt, pDist, speed, world) {
    const dRem = this.baseDist - pDist;
    this.t += dt;
    this.active = dRem < CONFIG.road.ahead;
    let mode = 'roar';
    let speedMul = 1;
    this.yaw = 0;
    const tx = laneX(this.lane);
    if (this.behavior === 'cross') {
      // Lumbers in from the roadside into its lane.
      const p = smoothstep(60, 16, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 2.4), tx, p);
      if (p > 0 && p < 1) {
        mode = 'walk';
        this.yaw = -this.side * Math.PI / 2;
        // Bigfoot strides across and turns to look right at you.
        if (this.kind === 'bigfoot') this.rig.glance = this.side * 1.2 * Math.sin(p * Math.PI);
      } else {
        this.rig.glance = 0;
      }
    } else if (this.behavior === 'charge') {
      // Stands roaring up the road, then charges down the lane at you and
      // plants itself in the reserved spot.
      const p = smoothstep(72, 24, dRem);
      this.dist = this.baseDist + (1 - p) * CHARGE_RUN;
      if (p > 0 && p < 1) {
        mode = 'run';
        speedMul = 1.3;
      }
    } else if (this.behavior === 'leap') {
      // Leaps off the roadside in a big arc and lands in its lane.
      const p = smoothstep(46, 30, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 2.6), tx, p);
      this.y = Math.sin(p * Math.PI) * 3.2;
      if (p > 0 && p < 1) {
        mode = 'leap';
        this.yaw = -this.side * Math.PI / 2 * Math.sin(p * Math.PI);
      }
      this.collidable = this.y < 1.2;
    } else if (this.behavior === 'rise') {
      // Bursts up out of the ground in a cloud of moon dust (or fire).
      const p = smoothstep(54, 38, dRem);
      this.y = -(1 - p) * 2.9;
      if (p > 0 && !this.burst) {
        this.burst = true;
        const burst = this.kind === 'lavaMonster' ? ['#ff4a1a', '#ffb020', '#ffd23f', '#2a2024'] : ['#d8dce8', '#9a9ca6', '#ffffff', this.poofColors[2]];
        world.fx.poof(this.x, 0, this.dist, speed * 0.3, burst);
      }
      if (p > 0 && p < 1) mode = 'leap';
      this.collidable = this.y > -1;
    } else if (this.behavior === 'beam') {
      // Floats down a tractor beam, then the saucer zooms off.
      const p = smoothstep(62, 36, dRem);
      const q = smoothstep(34, 16, dRem);
      this.y = (1 - p) * (UFO_HEIGHT - 2.6);
      const ufo = this.ufo;
      ufo.group.visible = q < 1 && !this.dying;
      ufo.group.position.set(q * this.side * 8, UFO_HEIGHT + q * 16 - this.y, -q * 6);
      ufo.group.rotation.y = this.t * 2;
      ufo.beam.visible = p < 1;
      ufo.beam.scale.y = UFO_HEIGHT - 0.3;
      ufo.beam.material.opacity = 0.22 + Math.sin(this.t * 14) * 0.06;
      if (p < 1) mode = 'leap';
      this.collidable = this.y < 1.2;
    }
    this.rig.animate(dt, mode, speedMul);
    this.updateBubble(dt, dRem);
  }

  updateDying(dt) {
    if (this.ufo) this.ufo.group.visible = false;
    return super.updateDying(dt);
  }
}

// Downtown scooter rider. Weaves head-on through the lanes toward you, or zips
// across the street, and always ends up in the lane reserved for it.
const WEAVE_RUN = 30; // how far up the road a weaving rider starts

export class ScooterRider extends EnemyBase {
  constructor(scene, outline) {
    super(scene);
    this.kind = 'scooter';
    this.rig = new ScooterRig({ outline });
    this.body = this.rig.root;
    this.group.add(this.rig.root);
    this.poofColors = this.rig.poofColors;
    this.koColors = ['#3de1ff', '#14162b'];
  }

  setup(spec) {
    this.reset(spec);
    this.halfW = 0.55;
    this.halfD = 0.6;
    this.top = 2.0;
    this.line = pick(SCOOTER_LINES);
    this.saidLine = false;
    this.side = spec.side || (this.lane === 0 ? 1 : this.lane === 2 ? -1 : Math.random() < 0.5 ? -1 : 1);
    this.path = spec.path || [this.lane];
    if (this.behavior === 'weave') {
      this.dist = spec.dist + WEAVE_RUN;
      this.x = laneX(this.path[0]);
    }
    if (this.behavior === 'cross') this.x = this.side * (CONFIG.road.halfWidth + 3);
    this.rig.lean = 0;
  }

  update(dt, pDist) {
    const dRem = this.baseDist - pDist;
    this.t += dt;
    this.active = dRem < CONFIG.road.ahead;
    let mode = 'idle';
    let lean = 0;
    this.yaw = 0;
    if (this.behavior === 'weave') {
      // Rides up the lane at you, swerving lane to lane, and stops dead in
      // the final lane by dRem 24.
      const p = smoothstep(84, 24, dRem);
      this.dist = this.baseDist + (1 - p) * WEAVE_RUN;
      ({ x: this.x, lean } = weave(this.path, p));
      if (p < 1) mode = 'ride';
    } else if (this.behavior === 'cross') {
      // Zips across the street and brakes in its lane.
      const p = smoothstep(56, 22, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 3), laneX(this.lane), p);
      if (p > 0 && p < 1) {
        mode = 'ride';
        this.yaw = -this.side * Math.PI / 2;
        lean = this.side * 0.12;
      }
    }
    this.rig.lean = damp(this.rig.lean, lean, 10, dt);
    this.rig.animate(dt, mode, 1);
    this.updateBubble(dt, dRem);
  }
}

// Street characters: parking officer, mime, hot-dog vendor, pigeon swarm.
// The people stroll (or push their cart) in from the sidewalk; the pigeons
// flutter in from the roadside. All end up in the lane reserved for them.
const TOWNS = {
  parkingOfficer: { top: 1.95, halfW: 0.5, halfD: 0.45, lines: OFFICER_LINES, ko: ['#d8ff3a', '#1e2a4a'] },
  mime: { top: 1.95, halfW: 0.5, halfD: 0.45, lines: MIME_LINES, ko: ['#ffffff', '#140c2b'] },
  hotdog: { top: 2.0, halfW: 0.75, halfD: 0.9, lines: HOTDOG_LINES, ko: ['#ffcc1a', '#ff2e55'] },
  pigeons: { top: 1.6, halfW: 0.8, halfD: 0.7, lines: PIGEON_LINES, ko: ['#e9ecf2', '#5a6070'] },
  astronaut: { top: 2.0, halfW: 0.55, halfD: 0.5, lines: ASTRONAUT_LINES, ko: ['#ffcc33', '#14162b'] },
};
export const TOWN_KINDS = Object.keys(TOWNS);

export class Townsperson extends EnemyBase {
  constructor(scene, outline, kind) {
    super(scene);
    this.kind = kind;
    this.rig = new TownRig({ kind, outline });
    this.body = this.rig.root;
    this.group.add(this.rig.root);
    this.poofColors = this.rig.poofColors;
    this.koColors = TOWNS[kind].ko;
  }

  setup(spec) {
    this.reset(spec);
    const info = TOWNS[this.kind];
    this.top = info.top;
    this.halfW = info.halfW;
    this.halfD = info.halfD;
    this.bubbleY = this.kind === 'pigeons' ? 2.0 : 2.75;
    this.line = pick(info.lines);
    this.saidLine = false;
    this.side = spec.side || (this.lane === 0 ? 1 : this.lane === 2 ? -1 : Math.random() < 0.5 ? -1 : 1);
    if (this.behavior === 'cross') this.x = this.side * (CONFIG.road.halfWidth + 2.2);
    if (this.behavior === 'flock') this.x = this.side * (CONFIG.road.halfWidth + 3.5);
    if (this.behavior === 'hop') this.x = this.side * (CONFIG.road.halfWidth + 2.6);
  }

  update(dt, pDist) {
    const dRem = this.baseDist - pDist;
    this.t += dt;
    this.active = dRem < CONFIG.road.ahead;
    const pigeons = this.kind === 'pigeons';
    let mode = pigeons ? (dRem < 14 ? 'flutter' : 'peck') : 'act';
    this.yaw = 0;
    this.y = 0;
    if (this.behavior === 'cross') {
      const p = smoothstep(58, 14, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 2.2), laneX(this.lane), p);
      if (p > 0 && p < 1) {
        mode = this.kind === 'hotdog' ? 'push' : 'walk';
        this.yaw = -this.side * Math.PI / 2;
      }
    } else if (this.behavior === 'flock') {
      // The swarm swoops off the sidewalk in an arc and lands in the lane.
      const p = smoothstep(52, 30, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 3.5), laneX(this.lane), p);
      this.y = Math.sin(p * Math.PI) * 2.6;
      if (p > 0 && p < 1) {
        mode = 'fly';
        this.yaw = -this.side * Math.PI / 2;
      }
      this.collidable = this.y < 1.2;
    } else if (this.behavior === 'hop') {
      // Moon-bounces in from the roadside in three big low-gravity hops.
      const p = smoothstep(60, 22, dRem);
      this.x = lerp(this.side * (CONFIG.road.halfWidth + 2.6), laneX(this.lane), p);
      this.y = Math.abs(Math.sin(p * Math.PI * 3)) * 1.5;
      if (p > 0 && p < 1) {
        mode = 'walk';
        this.yaw = -this.side * Math.PI / 2;
      }
      this.collidable = this.y < 1.2;
    }
    this.rig.animate(dt, mode, 1);
    this.updateBubble(dt, dRem);
  }
}

// Flying craft: the UFO, the space fighter and the trench's twin-wing fighter.
// They swoop down out of the sky (or scream up the trench) and hover low in
// the lane reserved for them. shoots: fires harmless laser shots on the way in.
const CRAFTS = {
  ufo: { top: 1.35, halfW: 0.95, halfD: 0.95, hover: 0.35, lines: UFO_LINES, ko: ['#7be35a', '#3a0a5a'] },
  ship: { top: 1.25, halfW: 1.0, halfD: 1.2, hover: 0.4, lines: SHIP_LINES, ko: ['#ffb020', '#14162b'] },
  tieFighter: { top: 2.4, halfW: 1.05, halfD: 0.6, hover: 0.25, lines: TIE_LINES, ko: ['#3dff5a', '#14162b'], shoots: true },
};
export const CRAFT_KINDS = Object.keys(CRAFTS);
const SWOOP_RUN = 30; // how far up the road a swooping craft starts
const STRAFE_RUN = 40; // how far up the trench a strafing fighter starts

export class Craft extends EnemyBase {
  constructor(scene, outline, kind) {
    super(scene);
    this.kind = kind;
    this.rig = new CraftRig({ kind, outline });
    this.body = this.rig.root;
    this.group.add(this.rig.root);
    this.poofColors = this.rig.poofColors;
    this.koColors = CRAFTS[kind].ko;
  }

  setup(spec) {
    this.reset(spec);
    const info = CRAFTS[this.kind];
    this.top = info.top;
    this.halfW = info.halfW;
    this.halfD = info.halfD;
    this.bubbleY = 2.4;
    this.line = pick(info.lines);
    this.saidLine = false;
    this.side = spec.side || (Math.random() < 0.5 ? -1 : 1);
    this.path = spec.path || [this.lane];
    this.y = info.hover;
    this.shots = 0;
    this.shotCd = 0.3 + Math.random() * 0.4;
    if (this.behavior === 'swoop') {
      this.x = this.side * 10;
      this.y = 16;
      this.dist = spec.dist + SWOOP_RUN;
    } else if (this.behavior === 'strafe') {
      this.x = laneX(this.path[0]);
      this.y = info.hover + 2.5;
      this.dist = spec.dist + STRAFE_RUN;
    } else if (this.behavior === 'dive') {
      this.y = info.hover + 18;
      this.dist = spec.dist + SWOOP_RUN;
    }
  }

  update(dt, pDist, speed, world) {
    const dRem = this.baseDist - pDist;
    this.t += dt;
    this.active = dRem < CONFIG.road.ahead;
    const info = CRAFTS[this.kind];
    const hover = info.hover;
    let bank = Math.sin(this.t * 1.7) * 0.06;
    let dive = 0;
    this.yaw = 0;
    if (this.behavior === 'swoop') {
      // Dives in from high up and off to the side, levels out in the lane.
      const p = smoothstep(84, 32, dRem);
      const k = 1 - p;
      this.x = lerp(this.side * 10, laneX(this.lane), p);
      this.y = hover + k * k * 16;
      this.dist = this.baseDist + k * SWOOP_RUN;
      if (p < 1) {
        bank += -this.side * Math.sin(p * Math.PI) * 0.7;
        dive = Math.sin(p * Math.PI) * 0.8;
      }
    } else if (this.behavior === 'strafe') {
      // Screams up the trench straight at you, jinking from lane to lane, and
      // drops into a hover in its lane by dRem 30.
      const p = smoothstep(96, 30, dRem);
      const w = weave(this.path, p);
      this.x = w.x;
      this.y = hover + (1 - p) * 2.5;
      this.dist = this.baseDist + (1 - p) * STRAFE_RUN;
      bank += w.lean * 2;
    } else if (this.behavior === 'dive') {
      // Drops nose-first out of the sky straight into its lane.
      const p = smoothstep(80, 34, dRem);
      const k = 1 - p;
      this.y = hover + k * k * 18;
      this.dist = this.baseDist + k * SWOOP_RUN;
      dive = Math.sin(p * Math.PI) * 0.9;
    } else {
      this.y = hover;
    }
    if (info.shoots && world && this.alive && !this.dying && dRem < 50 && dRem > 18 && this.shots < 2) {
      this.shotCd -= dt;
      if (this.shotCd <= 0) {
        this.shotCd = 0.7;
        this.shots++;
        world.enemyThrow(this, true);
      }
    }
    this.collidable = this.y < 1.2;
    this.rig.animate(dt, { bank, dive, beamTo: this.y + 0.5 });
    this.updateBubble(dt, dRem);
  }
}

export function enemyKoWord(kind) {
  return pick(KO_WORDS[kind] || NINJA_KO);
}
