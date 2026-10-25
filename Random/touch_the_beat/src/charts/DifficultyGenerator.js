// Difficulty rules for automatic chart generation. Each profile describes
// *which* detected musical events are eligible and how dense, chorded and
// sustained the resulting chart may be. ChartGenerator applies the rules.

import { generateChart } from './ChartGenerator.js';

export const DIFFICULTIES = ['easy', 'normal', 'hard'];

// Grid levels produced by the analyser:
// 0 downbeat, 1 beat, 2 eighth, 3 sixteenth, 4 triplet, 5 off-grid
export const DIFFICULTY_PROFILES = Object.freeze({
  easy: {
    label: 'Easy',
    nps: 1.2, // target notes per active second (before density scaling)
    minGapAbs: 0.34, // never two events closer than this (s)
    minGapBeats: 0.9, // ...or than this fraction of a beat
    maxGap: 2.6, // fill gaps longer than this while music is playing
    maxFillLevel: 1,
    levelWeights: [1.7, 1.3, 0.3, 0, 0, 0],
    chord: { maxSize: 2, minStrength: 0.88, maxLevel: 0, ratio: 0.04, minGap: 0.9 },
    holds: { minGap: 1.2, minDur: 0.6, maxDur: 3.0, release: 0.4, ratio: 0.12 },
    jackMinGap: 0.55, // same-lane repeats faster than this are avoided
    noise: 0.3,
    balance: 0.3,
    prefWeight: 0.55,
  },
  normal: {
    label: 'Normal',
    nps: 2.2,
    minGapAbs: 0.17,
    minGapBeats: 0.45,
    maxGap: 1.7,
    maxFillLevel: 2,
    levelWeights: [1.5, 1.3, 1.0, 0.25, 0.3, 0.12],
    chord: { maxSize: 2, minStrength: 0.75, maxLevel: 1, ratio: 0.09, minGap: 0.45 },
    holds: { minGap: 0.95, minDur: 0.5, maxDur: 3.0, release: 0.3, ratio: 0.1 },
    jackMinGap: 0.3,
    noise: 0.35,
    balance: 0.3,
    prefWeight: 0.7,
  },
  hard: {
    label: 'Hard',
    nps: 3.7,
    minGapAbs: 0.1,
    minGapBeats: 0.22,
    maxGap: 1.25,
    maxFillLevel: 3,
    levelWeights: [1.4, 1.25, 1.1, 0.9, 0.75, 0.5],
    chord: { maxSize: 3, minStrength: 0.65, maxLevel: 2, ratio: 0.16, minGap: 0.24, tripleStrength: 0.95 },
    holds: { minGap: 0.8, minDur: 0.45, maxDur: 3.0, release: 0.24, ratio: 0.08 },
    jackMinGap: 0.2,
    noise: 0.4,
    balance: 0.3,
    prefWeight: 0.8,
  },
});

export const DEFAULT_COMPILE_SETTINGS = Object.freeze({
  density: 1, // 0.5 - 1.6 multiplies target note density
  sensitivity: 1, // onset detection sensitivity (analysis stage)
  bpmHint: 0, // 0 = auto
  beatsPerBar: 0, // 0 = auto
  offsetMs: 0, // chart offset written to the beat map
  seed: 0, // variation seed for lane patterns
  holds: true,
  chords: true,
});

export function normalizeCompileSettings(settings = {}) {
  const s = { ...DEFAULT_COMPILE_SETTINGS, ...settings };
  s.density = Math.min(1.6, Math.max(0.5, Number(s.density) || 1));
  s.sensitivity = Math.min(2, Math.max(0.5, Number(s.sensitivity) || 1));
  s.bpmHint = Math.max(0, Number(s.bpmHint) || 0);
  s.beatsPerBar = [3, 4].includes(Number(s.beatsPerBar)) ? Number(s.beatsPerBar) : 0;
  s.offsetMs = Math.max(-500, Math.min(500, Number(s.offsetMs) || 0));
  s.seed = Math.floor(Number(s.seed) || 0);
  s.holds = s.holds !== false;
  s.chords = s.chords !== false;
  return s;
}

/** Analysis-stage options derived from compile settings. */
export function analysisOptionsFrom(settings) {
  const s = normalizeCompileSettings(settings);
  return { sensitivity: s.sensitivity, bpmHint: s.bpmHint, beatsPerBar: s.beatsPerBar };
}

export function getProfile(difficulty) {
  const profile = DIFFICULTY_PROFILES[difficulty];
  if (!profile) throw new Error(`Unknown difficulty "${difficulty}"`);
  return profile;
}

/** Build every difficulty for one analysed song. Returns { easy, normal, hard }. */
export function generateAllDifficulties(analysis, song, settings) {
  const s = normalizeCompileSettings(settings);
  const out = {};
  for (const d of DIFFICULTIES) out[d] = generateChart(analysis, song, d, getProfile(d), s);
  return out;
}
