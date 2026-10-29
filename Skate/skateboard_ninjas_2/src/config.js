// Central tuning values for Skateboard Ninjas 2.
// Units: 1 world unit = 1 metre, times are seconds, speeds are metres/second.
// Gameplay runs in straight "lane space" (lane x, height y, distance along the
// road). Track.js bends that space into a winding downhill road for display
// only, so curves and hills never change what is fair.

export const CONFIG = {
  // ?debug=1 in the URL draws collision boxes (yellow = jump, cyan = slide,
  // magenta = go around, red = enemies).
  debug: false,

  lanes: {
    width: 2.3,           // distance between lane centres
    count: 3,
  },

  road: {
    halfWidth: 3.9,       // asphalt half width (lanes + a little shoulder)
    rowLen: 2,            // terrain / road mesh row spacing
    ahead: 240,           // how far ahead the road is built
    behind: 24,
  },

  speed: {
    start: 17,            // speed at the start line
    max: 40,              // top speed
    stepEvery: 1000,      // every this many metres the speed steps up...
    stepGain: 3,          // ...by this much (start 17 -> 40 at about 7.7 km)
    stepBlend: 120,       // metres to ease into each new speed
    countdownRoll: 4,     // gentle roll during the countdown
  },

  player: {
    halfW: 0.42,
    halfD: 0.45,
    height: 1.8,
    slideHeight: 0.8,
    laneSwitchTime: 0.15,
    iceSwitchTime: 0.32,  // lane changes are slippery on ice
    jumpVel: 9.2,         // ~1.6 m high, ~0.7 s airtime
    gravity: 26,
    flipVel: 12.6,        // backflip launch: ~0.97 s airtime
    flipTime: 0.82,       // seconds to rotate all the way round
    fastFall: 70,         // pressing slide in the air slams you down
    slideTime: 0.72,
    rampVel: 13.2,        // launch speed off the lip of a ramp
    rampJumpBonus: 2.6,   // extra launch if you press jump while on the ramp
    jumpBuffer: 0.16,     // jump pressed this long before landing still fires
    coyoteTime: 0.08,
    bumpCooldown: 0.5,    // after a side bump you can't be bumped again for a bit
    crashSlowMo: 0.35,
    crashToResults: 1.7,
  },

  shuriken: {
    max: 5,
    recharge: 2.4,        // seconds to regain one star
    cooldown: 0.28,
    frenzyCooldown: 0.12,
    speed: 52,            // relative to the player
    range: 62,            // how far ahead stars can lock on
    adjacentRange: 42,    // adjacent-lane targets must be closer than this
  },

  scoring: {
    perMetre: 1,
    coin: 10,
    karen: 150,
    ninja: 200,
    bear: 250,
    yeti: 250,
    rockAlien: 250,
    alien: 250,
    ball: 80,
    nearMiss: 60,
    jumpOver: 25,
    slideUnder: 30,
    ramp: 100,
    trick: 250,
    backflip: 600,
    grindPerSecond: 80,
    powerup: 50,
    comboWindow: 3.5,     // seconds to land another action before the combo drops
    comboPerStep: 5,      // combo count needed for each +0.5 multiplier
    multiplierCap: 5,
    coinStreakStep: 10,   // every 10 coins in a row adds one to the combo
    scorePerBonusCoin: 2500, // bonus coins at game over: 1 per this many points
  },

  powerups: {
    magnet: 9,
    shield: 0,            // the shield lasts until it absorbs a hit
    frenzy: 7,
    magnetRadius: 6,
    every: [420, 720],    // distance between power-up spawns
  },

  generator: {
    firstObstacle: 70,    // free road at the start of a run
    spawnAhead: 210,
    gapTimeEasy: 1.3,     // seconds between obstacle rows at the start...
    gapTimeHard: 0.8,     // ...and on a long run
    hardAt: 6000,         // distance where the generator reaches full difficulty
    afterJumpRow: 0.25,   // extra seconds after a row that needs a jump
    afterSlideRow: 0.2,
  },

  camera: {
    back: 6.8,
    height: 3.1,
    lookAhead: 10,
    fovMin: 62,
    fovMax: 76,
  },

  curve: {
    maxBend: 0.0011,      // sideways bend per metre^2 at the horizon
    maxHill: 0.0005,
    slope: 0.07,          // constant downhill grade
    changeEvery: [5, 11], // seconds between new bend targets
  },
};

// Lane index (0, 1, 2) -> lane x.
export const laneX = (lane) => (lane - 1) * CONFIG.lanes.width;

// Speed is a function of distance, so the generator knows exactly how fast the
// player will be going when they reach any point of the road.
export function speedAt(dist) {
  const s = CONFIG.speed;
  const d = Math.max(0, dist);
  const level = Math.floor(d / s.stepEvery);
  const t = Math.min(1, (d - level * s.stepEvery) / s.stepBlend);
  const ease = level > 0 ? t * t * (3 - 2 * t) : 1;
  return Math.min(s.max, s.start + s.stepGain * (level - 1 + ease));
}

// Which speed step the player is on (0 for the first stepEvery metres).
export function speedLevelAt(dist) {
  return Math.floor(Math.max(0, dist) / CONFIG.speed.stepEvery);
}

export function difficultyAt(dist) {
  return Math.min(1, Math.max(0, dist / CONFIG.generator.hardAt));
}
