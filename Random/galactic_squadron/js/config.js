/**
 * Galactic Squadron — gameplay configuration.
 * Every balancing value lives here so the game can be tuned without touching logic.
 */

/** Logical playfield size. Everything is simulated in these units and scaled to the screen. */
export const WORLD = Object.freeze({ W: 540, H: 960 });

export const CONFIG = {
  sim: {
    step: 1 / 120,          // fixed simulation timestep (seconds)
    maxSteps: 8,            // max catch-up steps per rendered frame
  },

  player: {
    startLives: 3,          // default; overridable in Settings
    maxLives: 7,
    y: 872,
    margin: 28,             // closest the ship may get to the side walls
    hitRadius: 10,          // bullet hitbox (smaller than the sprite on purpose)
    bodyRadius: 17,         // ship-vs-ship collisions and pickups
    shieldRadius: 30,
    maxSpeed: 440,          // keyboard speed, px/s
    accel: 2800,            // inertia mode acceleration
    drag: 10,               // inertia mode deceleration factor
    touchFollowSpeed: 1700, // how fast the ship chases the drag target
    touchSensitivity: 1.3,  // drag distance multiplier for touch
    fireInterval: 0.2,
    rapidFireInterval: 0.1,
    bulletSpeed: 940,
    spreadAngle: 0.16,      // radians between spread-shot bolts
    invulnTime: 2.4,
    respawnDelay: 1.4,
    gameOverDelay: 1.8,
    shieldAbility: { duration: 2.6, cooldown: 16 },
  },

  enemies: {
    interceptor: { hp: 1, score: 100, radius: 15, speed: 1.0, diveWeight: 1.0, name: 'T-Fighter' },
    heavy:       { hp: 3, score: 200, radius: 19, speed: 0.8, diveWeight: 0.55, name: 'T-Interceptor' },
    bomber:      { hp: 1, score: 300, radius: 16, speed: 1.1, diveWeight: 2.0, name: 'T-Bomber' },
    ace:         { hp: 2, score: 500, radius: 16, speed: 1.3, diveWeight: 1.8, name: 'Probe-Fighter' },
  },

  formation: {
    top: 122,               // y of the first formation row
    bossTop: 362,           // escorts sit below the boss
    spacingX: 50,
    spacingY: 50,
    sway: 34,
    swaySpeed: 0.5,
    breathe: 0.07,          // spread/contract amplitude once the formation is complete
    breatheSpeed: 1.3,
  },

  entry: {
    speed: 340,             // px/s along entry paths
    spacing: 0.13,          // seconds between ships in the same group
    groupInterval: 1.55,    // seconds between groups
    jitter: 14,             // random variation applied to entry curves
  },

  dive: {
    speed: 300,
    telegraph: 0.38,        // wobble time before a dive starts (fairness cue)
    returnSpeed: 260,
    safeFireGap: 200,       // enemies never fire when closer than this vertically
    fewLeft: 5,             // when this many remain, attacks intensify
  },

  projectiles: {
    maxPlayer: 72,
    maxEnemy: 200,
    enemySpeed: 250,
    kinds: {
      basic:  { radius: 4.5, speed: 1.0 },
      aimed:  { radius: 5,   speed: 1.05 },
      heavy:  { radius: 8,   speed: 0.72 },
      spread: { radius: 4.5, speed: 0.92 },
      boss:   { radius: 6.5, speed: 0.85 },
    },
  },

  boss: {
    every: 7,               // boss on stage 7, 14, 21, ...
    baseHp: 150,
    hpPerEncounter: 90,
    score: 2500,
    defeatBonus: 5000,
    introTime: 3.6,
    maxMinions: 4,
  },

  scoring: {
    diveMultiplier: 2,      // enemies destroyed mid-dive are worth double
    streakWindow: 3.5,      // seconds to land the next kill before the streak resets
    multiplierThresholds: [0, 10, 22, 38], // streak needed for x1, x2, x3, x4
    perfectWaveBase: 1000,  // no-damage stage bonus = base + perStage * stage
    perfectWavePerStage: 250,
    extraLifeEvery: 30000,
    scoreBonus: 1500,
  },

  falcon: {
    streakEvery: 50,        // the Falcon arrives on every 50th kill of a streak
    duration: 10,           // seconds of assistance once it's in position
    arriveTime: 1.4,
    hoverY: 690,            // stays above the player's lane
    speed: 340,
    fireInterval: 0.15,
  },

  powerups: {
    dropChance: 0.07,
    typeBonus: { heavy: 0.03, ace: 0.08 },
    pityKills: 26,          // guaranteed drop after this many kills without one
    maxOnScreen: 2,
    fallSpeed: 95,
    radius: 17,
    duration: { rapid: 10, spread: 12, shield: 8 },
    weights: { rapid: 30, spread: 26, shield: 18, score: 20, life: 6 },
  },

  effects: {
    maxParticles: 700,
    maxParticlesLow: 240,
    maxTexts: 32,
  },

  difficultyPresets: {
    easy:   { speed: 0.88, fire: 0.6,  dive: 0.75, bullet: 0.85, bossHp: 0.8 },
    normal: { speed: 1,    fire: 1,    dive: 1,    bullet: 1,    bossHp: 1 },
    hard:   { speed: 1.12, fire: 1.35, dive: 1.25, bullet: 1.12, bossHp: 1.2 },
  },
};

export const DEFAULT_SETTINGS = Object.freeze({
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  muted: false,
  difficulty: 'normal',
  startLives: CONFIG.player.startLives,
  movement: 'direct',      // 'direct' | 'inertia'
  autoFire: false,
  reducedShake: false,
  reducedEffects: false,
  ship: 'x-ship',          // id from SHIPS in ships.js
});

/**
 * Difficulty curve. Ramps gently per stage and caps everything so the game
 * never outpaces human reaction time.
 */
export function getDifficulty(stage, presetName = 'normal') {
  const p = CONFIG.difficultyPresets[presetName] || CONFIG.difficultyPresets.normal;
  const s = Math.max(0, stage - 1);
  const ramp = (per, cap) => Math.min(cap, s * per);
  return {
    enemySpeed: (1 + ramp(0.04, 0.45)) * p.speed,
    bulletSpeed: (1 + ramp(0.035, 0.5)) * p.bullet,
    formationFireRate: (0.35 + ramp(0.12, 1.4)) * p.fire, // shots/sec across the formation
    diveInterval: Math.max(1.1, 4.2 - ramp(0.28, 3.1)) / p.dive,
    maxDivers: Math.min(6, 1 + Math.floor(s / 2)),
    diveShots: stage < 3 ? 0 : Math.min(3, 1 + Math.floor((stage - 3) / 3)),
    aimed: stage >= 3,
    spread: stage >= 5,
    entryFire: stage >= 4,
    hpBonus: Math.floor(s / 8),
    maxEnemyBullets: Math.min(70, 14 + s * 4),
    bossHpMul: p.bossHp,
  };
}

/**
 * Hand-authored opening waves. Stages beyond this list are generated by
 * WaveManager using the same building blocks.
 *
 *  layout  — lines | staggered | v | diamond | arc
 *  rows    — enemy count per row, top to bottom
 *  types   — enemy type per row (last entry repeats)
 *  entries — entry path per group; "dual-" sends mirrored streams at once
 */
export const WAVES = [
  { layout: 'lines', rows: [8, 8], types: ['interceptor'], entries: ['swoop'] },
  { layout: 'staggered', rows: [6, 8, 7], types: ['heavy', 'interceptor'], entries: ['side', 'top-loop'] },
  { layout: 'v', rows: [4, 6, 8, 8], types: ['bomber', 'heavy', 'interceptor'], entries: ['dual-top', 'swoop', 'side'] },
  { layout: 'diamond', rows: [2, 4, 6, 8, 6, 4], types: ['bomber', 'bomber', 'heavy', 'interceptor'], entries: ['spiral', 'dual-side', 'swoop'] },
  { layout: 'arc', rows: [4, 6, 8, 8], types: ['ace', 'bomber', 'heavy', 'interceptor'], entries: ['dual-top', 'cross', 'side'] },
  { layout: 'staggered', rows: [6, 7, 8, 7, 8], types: ['ace', 'bomber', 'heavy', 'interceptor'], entries: ['cross', 'spiral', 'dual-side'] },
  { boss: true, layout: 'lines', rows: [6, 6], types: ['heavy', 'interceptor'], entries: ['dual-side', 'dual-top'] },
];
