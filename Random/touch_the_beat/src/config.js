// Central, tweakable game rules. Values here are starting points meant to be
// tuned on real devices.

export const LANES = Object.freeze([
  { name: 'Cyan', color: '#00f0ff', glow: 'rgba(0,240,255,', rgb: [0, 240, 255] },
  { name: 'Magenta', color: '#ff2bd6', glow: 'rgba(255,43,214,', rgb: [255, 43, 214] },
  { name: 'Purple', color: '#a64dff', glow: 'rgba(166,77,255,', rgb: [166, 77, 255] },
  { name: 'Lime', color: '#b6ff1a', glow: 'rgba(182,255,26,', rgb: [182, 255, 26] },
]);

// keyboard controls for desktop testing, one list per lane
export const KEY_BINDINGS = Object.freeze([
  ['KeyD', 'Digit1', 'ArrowLeft'],
  ['KeyF', 'Digit2', 'ArrowDown'],
  ['KeyJ', 'Digit3', 'ArrowUp'],
  ['KeyK', 'Digit4', 'ArrowRight'],
]);

export const KEY_TO_LANE = new Map(KEY_BINDINGS.flatMap((keys, lane) => keys.map((k) => [k, lane])));

export const JUDGEMENT = Object.freeze({
  // seconds, ± around the note time
  windows: { perfect: 0.045, great: 0.09, good: 0.15 },
  // multipliers applied to every window by the "Timing windows" setting
  presets: { strict: 0.8, standard: 1, lenient: 1.3 },
  // releasing a hold this close to its end still counts as completed
  holdReleaseTolerance: 0.12,
});

export const SCORING = Object.freeze({
  points: { perfect: 300, great: 200, good: 100, miss: 0 },
  accuracyWeight: { perfect: 1, great: 0.7, good: 0.4, miss: 0 },
  holdPointsPerSecond: 150,
  // multiplier steps by current combo
  multipliers: [
    { combo: 0, mult: 1 },
    { combo: 10, mult: 2 },
    { combo: 25, mult: 3 },
    { combo: 50, mult: 4 },
  ],
  comboMilestones: [25, 50, 100, 150, 200, 300, 400, 500, 750, 1000],
  // grade thresholds on accuracy (%), checked top to bottom
  grades: [
    { grade: 'S+', minAccuracy: 98, fullCombo: true },
    { grade: 'S', minAccuracy: 95 },
    { grade: 'A', minAccuracy: 90 },
    { grade: 'B', minAccuracy: 80 },
    { grade: 'C', minAccuracy: 70 },
    { grade: 'D', minAccuracy: 0 },
  ],
});

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.9,
  musicVolume: 0.85,
  sfxVolume: 0.5,
  hitSounds: true,
  quality: 'auto', // auto | low | medium | high
  noteSpeed: 5, // 1 - 10
  highway: '3d', // 3d | flat
  audioOffsetMs: 0, // + if you hear audio late (Bluetooth etc.)
  visualOffsetMs: 0, // + moves notes later on screen
  timingWindows: 'standard', // strict | standard | lenient
  reducedMotion: false,
  showFps: false,
  lastSongId: 'neon-drive',
  lastDifficulty: 'normal',
});

export const COUNTDOWN_SECONDS = 3;

/** Seconds a note takes to travel from the top of the highway to the target. */
export function approachTimeFor(noteSpeed) {
  return 2.6 / (0.5 + Math.max(1, Math.min(10, noteSpeed)) * 0.15);
}
