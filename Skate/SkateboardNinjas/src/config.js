// Central tuning values for Skateboard Ninjas.
// Distances are world units (the view is ~540 units tall), times are seconds,
// speeds are units per second. Heights are measured upward from the street.

export const CONFIG = {
  // Overridden by ?debug=1 in the URL (draws hitboxes and generator spans).
  debug: false,

  run: {
    duration: 60,          // seconds of active play
    countdown: 3,          // pre-run countdown (not counted against the run)
    endGraceMax: 3,        // max seconds to wait for an airborne landing after time is up
    resultsDelay: 1.2,     // pause on "TIME!" before the results screen
  },

  physics: {
    step: 1 / 60,          // fixed simulation timestep
    maxStepsPerFrame: 8,
    gravity: 2000,
    jumpImpulse: 760,      // ollie: ~0.76 s airtime, ~144 units high
    railPopImpulse: 720,   // ollie off a rail
    railExitPop: 220,      // little hop when rolling off the end of a rail
    rampOllieBonus: 280,   // extra pop when you ollie on a ramp or at its lip
    lateOllieWindow: 0.12, // grace period after the lip to still get the bonus
    jumpBuffer: 0.12,      // an ollie pressed this long before landing still fires
    coyoteTime: 0.08,      // ollie still allowed briefly after rolling off an edge
    baseSpeed: 330,        // speed at 0 s
    maxSpeed: 430,         // speed at 60 s
    accel: 420,            // how fast speed recovers toward the target
    wipeoutSpeed: 110,
    wipeoutDuration: 1.0,
    invulnTime: 1.2,       // blink time after recovering from a wipeout
    railContact: 7,        // board trucks sit this far above the wheel bottoms
  },

  player: {
    screenAnchor: 0.28,    // horizontal screen position of the skater (fraction of view)
    narrowAnchor: 0.2,     // same, on narrow (portrait) views, for more look-ahead
    halfWidth: 13,
    footOffset: 5,         // hitbox bottom above the wheels (wheels can graze a cone)
    height: 64,
    airHeight: 56,
  },

  tricks: {
    bailBelow: 0.65,       // landing before a flip is this complete = bail
    grabReach: 0.1,
    grabMinHold: 0.2,
    grabMaxHold: 1.6,
    grabRelease: 0.12,
    queueTime: 0.3,        // a trick pressed during another one waits this long
    flipGrabBonus: 250,    // flip + grab in the same jump
    grabHoldRate: 120,     // points per second for holding a grab
  },

  scoring: {
    ollie: 50,
    launch: 50,
    cleanLanding: 100,
    grindPerSecond: 50,
    grindExit: 150,
    nearMiss: 100,
    karenDodge: 150,
    bigAir: 100,
    bigAirTime: 1.1,
    repeatFactor: 0.5,     // each repeat of the same action in one combo is worth half
    // Multiplier by number of distinct actions in the combo (index = count).
    multipliers: [1, 1, 1.5, 2, 3],
    extendedStep: 0.25,    // after the table: +0.25 for every 2 more distinct actions
    extendedEvery: 2,
    multiplierCap: 4,
    linkWindow: 1.0,       // seconds after a clean landing to ollie again and keep the combo
  },

  input: {
    deadZone: 0.22,        // joystick fraction ignored entirely
    activate: 0.55,        // joystick fraction that fires a trick
    release: 0.32,         // stick must return inside this before it can fire again
    lockout: 0.12,         // minimum seconds between two fires of the same stick
    keyChordWindow: 55,    // ms to wait for a second arrow key (diagonal tricks)
  },

  level: {
    lookahead: 700,        // generate this far past the right edge of the screen
    startClear: 650,       // empty street at the start of a run
    tierTimes: [20, 40],   // 0-20 s warm-up, 20-40 s build, 40-60 s rush
    reaction: [0.8, 0.6, 0.45], // seconds of clear approach before each hazard, by tier
    kicker: { len: 130, h: 42, launch: 820 },
    launchRamp: { len: 200, h: 88, launch: 960 },
  },

  karen: {
    shoutDistance: 650,
    stepTrigger: 560,
    warnTime: 0.3,
    stepTime: 0.35,
    chargeTrigger: 900,
    minRunSpeed: 60,
    maxRunSpeed: 320,
    cartMergeTime: 0.5,
    width: 30,
    height: 84,
  },
};
