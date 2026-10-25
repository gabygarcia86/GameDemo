// Persistent player settings (localStorage) with change notifications.

import { DEFAULT_SETTINGS } from '../config.js';

const KEY = 'ttb.settings.v1';

function safeRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked (private mode) — settings just won't persist */
  }
}

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.values.reducedMotion = prefersReduced;
    try {
      const stored = JSON.parse(safeRead(KEY) || '{}');
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (k in stored && typeof stored[k] === typeof DEFAULT_SETTINGS[k]) this.values[k] = stored[k];
      }
    } catch {
      /* corrupted settings — fall back to defaults */
    }
    this.listeners = new Set();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    safeWrite(KEY, JSON.stringify(this.values));
    for (const fn of this.listeners) fn(key, value);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset() {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) this.set(k, v);
  }
}

// ---- best scores (also localStorage; small and per-device)
const SCORES_KEY = 'ttb.scores.v1';

export function loadScores() {
  try {
    return JSON.parse(safeRead(SCORES_KEY) || '{}');
  } catch {
    return {};
  }
}

export function bestScore(songId, difficulty) {
  return loadScores()[`${songId}/${difficulty}`] || null;
}

/** Saves if better; returns true when it is a new best. */
export function recordScore(songId, difficulty, summary) {
  const scores = loadScores();
  const key = `${songId}/${difficulty}`;
  const prev = scores[key];
  if (prev && prev.score >= summary.score) return false;
  scores[key] = {
    score: summary.score,
    grade: summary.grade,
    accuracy: summary.accuracy,
    maxCombo: summary.maxCombo,
    fullCombo: summary.fullCombo,
    date: Date.now(),
  };
  safeWrite(SCORES_KEY, JSON.stringify(scores));
  return true;
}

export function clearScores() {
  safeWrite(SCORES_KEY, '{}');
}
