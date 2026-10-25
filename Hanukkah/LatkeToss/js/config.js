// Central tuning values for Latke Toss.
// Everything gameplay-related that you might want to tweak lives here so the
// rest of the code can stay focused on behaviour. Units are "world units"
// (roughly meters) and seconds.

export const ROUND = {
  // Length of a round in seconds.
  durationSeconds: 60,
  // Short "Ready... Go!" lead-in before the clock starts.
  readySeconds: 1.4,
  // Time between the buzzer and the game-over panel, so in-flight effects can finish.
  gameOverDelaySeconds: 1.3,
  // Delay before a fresh latke appears after the previous throw resolves.
  respawnDelaySeconds: 0.45,
};

export const PHYSICS = {
  // Downward acceleration applied to airborne latkes (world units / s^2).
  gravity: 14,
  // Fixed physics timestep. 120 Hz keeps fast throws from tunnelling through the rim.
  fixedTimestep: 1 / 120,
  // Upper bound on simulated time per rendered frame (prevents a "spiral of death"
  // after the tab was in the background).
  maxFrameTime: 0.25,
  // Bounce response when a latke hits the table.
  tableRestitution: 0.28,
  tableFriction: 0.55,
  // Bounce response off the pot wall / rim.
  potRestitution: 0.35,
  // Latkes that wander outside this box are counted as misses.
  bounds: { minX: -14, maxX: 14, minY: -4, minZ: -16, maxZ: 10 },
  // Safety net: any throw still unresolved after this many seconds is a miss.
  maxFlightSeconds: 4,
};

export const LAUNCH = {
  // Launch speed range (world units / s). Drag length maps linearly between these.
  minSpeed: 6,
  maxSpeed: 13.5,
  // Fixed launch elevation above the horizontal, in degrees. Drag length controls distance.
  elevationDegrees: 55,
  // Maximum sideways aim, in degrees either side of straight ahead.
  maxYawDegrees: 32,
  // Drag distance (as a fraction of the viewport height) that gives full power.
  fullPowerDragFraction: 0.4,
  // Drag distance (fraction of viewport height) below which a release cancels the throw.
  cancelDragFraction: 0.05,
  // Grab radius around the latke, in CSS pixels (in addition to the 3D raycast hit box).
  grabRadiusPx: 70,
  // Tumbling rate range (radians / s) around the latke's horizontal axis.
  minFlipSpeed: 7,
  maxFlipSpeed: 12,
};

// Pot movement per difficulty. All positions are world space and describe the
// pot's base (the point where it would rest on the table).
//   x(t) = center.x + amplitude.x * sin(speed.x * t + phase.x), and likewise for y / z.
// Vertical motion is offset so y never dips below the table.
export const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    tagline: 'Stationary pot',
    center: { x: 0, y: 0, z: -2.8 },
    amplitude: { x: 0, y: 0, z: 0 },
    speed: { x: 0, y: 0, z: 0 },
    phase: { x: 0, y: 0, z: 0 },
    // Fraction of the predicted arc that is drawn while aiming.
    previewFraction: 1,
  },
  medium: {
    label: 'Medium',
    tagline: 'Slides side to side',
    center: { x: 0, y: 0, z: -2.8 },
    amplitude: { x: 2.3, y: 0, z: 0 },
    speed: { x: 0.9, y: 0, z: 0 },
    phase: { x: 0, y: 0, z: 0 },
    previewFraction: 0.85,
  },
  hard: {
    label: 'Hard',
    tagline: 'Floats in full 3D',
    center: { x: 0, y: 0.6, z: -3.0 },
    amplitude: { x: 1.9, y: 0.55, z: 1.5 },
    speed: { x: 0.75, y: 1.1, z: 0.5 },
    phase: { x: 0, y: 1.3, z: 2.1 },
    previewFraction: 0.7,
  },
};

export const POT = {
  outerRadius: 1.0,
  // Radius of the clear opening inside the rim.
  openingRadius: 0.86,
  // Height of the opening plane above the pot base.
  rimHeight: 1.12,
  // Height of the oil surface above the pot base.
  oilHeight: 0.8,
  // How much of the latke's radius may overhang the opening and still count.
  // 0 = the whole latke must fit inside, 1 = only the center has to be inside.
  latkeOverhangAllowance: 0.45,
};

export const LATKE = {
  radius: 0.31,
  thickness: 0.1,
  // Number of distinct procedural shapes generated at start-up (and pooled).
  variantCount: 8,
};

export const PARTICLES = {
  // Oil droplets emitted per successful hit.
  splashDroplets: 32,
  // Sparkles emitted per successful hit.
  splashSparkles: 14,
  // Lifetime range for droplets, seconds.
  dropletLifeMin: 0.35,
  dropletLifeMax: 0.8,
  // Pool sizes. Effects beyond these limits recycle the oldest particles.
  dropletPoolSize: 160,
  sparklePoolSize: 80,
  // Expanding ripple ring duration, seconds.
  rippleSeconds: 0.7,
};

// Chocolate-coin shower triggered by hitting a dreidel with a latke.
export const GELT = {
  coinsPerHit: 10,
  // Coins on screen at once; older coins are recycled when a new shower needs room.
  poolSize: 40,
  radius: 0.15,
  thickness: 0.035,
  // Height coins start falling from (above the top of the view).
  spawnHeight: 8,
  // Coins in one shower are released over this many seconds.
  spreadSeconds: 0.7,
  // How long a landed coin stays on the table before shrinking away.
  lingerSeconds: 8,
  restitution: 0.38,
};

// Dreidel hit volume, as an upright cylinder from the table to the top of the handle,
// before each dreidel's own scale is applied.
export const DREIDEL = {
  radius: 0.36,
  height: 1.05,
  restitution: 0.4,
};
