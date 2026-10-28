// Save data in localStorage: progress, coins, unlocks, look, settings, stats
// and missions. Everything loaded is validated so a corrupted or old save
// can never break the game; anything invalid falls back to its default.

import { COLOR_KEYS, DEFAULT_LOOK, BOARD_TYPES, isValidSwatch, PREMIUM_SWATCHES } from './cosmetics.js';

const KEY = 'skateboardNinjas2.save';
const VERSION = 1;

export const ENV_IDS = ['sunset', 'daytime', 'night', 'snow', 'beach', 'forest'];

export const DEFAULT_SETTINGS = {
  music: 60,          // 0..100
  sfx: 80,            // 0..100
  ambience: true,
  quality: 'auto',    // auto | low | medium | high
  shake: true,
  speedLines: true,
  touch: 'auto',      // auto | on | off
  showFps: false,
};

function defaultStats() {
  const perEnv = {};
  for (const id of ENV_IDS) perEnv[id] = { runs: 0, best: 0 };
  return {
    runs: 0,
    bestScore: 0,
    bestDistance: 0,
    bestCoins: 0,
    bestCombo: 0,
    totalDistance: 0,
    totalCoins: 0,
    karens: 0,
    ninjas: 0,
    avoided: 0,
    jumps: 0,
    slides: 0,
    tricks: 0,
    stars: 0,
    timePlayed: 0,
    challenges: 0,
    missions: 0,
    perEnv,
  };
}

function defaults() {
  return {
    version: VERSION,
    coins: 0,
    unlocked: [],
    look: { ...DEFAULT_LOOK },
    settings: { ...DEFAULT_SETTINGS },
    stats: defaultStats(),
    missions: [],
    lastEnv: null,
  };
}

const num = (v, fallback = 0) => (Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;

  d.coins = Math.floor(num(raw.coins));
  if (Array.isArray(raw.unlocked)) {
    const ids = new Set(PREMIUM_SWATCHES.map((p) => p.id));
    d.unlocked = raw.unlocked.filter((id) => ids.has(id));
  }

  const look = raw.look || {};
  for (const k of COLOR_KEYS) {
    if (typeof look[k] === 'string' && isValidSwatch(look[k].toLowerCase?.() ?? look[k])) d.look[k] = look[k].toLowerCase();
  }
  if (BOARD_TYPES.includes(look.board)) d.look.board = look.board;
  if (typeof look.neon === 'boolean') d.look.neon = look.neon;
  // A premium colour that isn't unlocked (edited save) goes back to default.
  for (const k of COLOR_KEYS) {
    const p = PREMIUM_SWATCHES.find((s) => s.color === d.look[k]);
    if (p && !d.unlocked.includes(p.id)) d.look[k] = DEFAULT_LOOK[k];
  }

  const s = raw.settings || {};
  if (Number.isFinite(s.music)) d.settings.music = Math.round(Math.min(100, Math.max(0, s.music)));
  if (Number.isFinite(s.sfx)) d.settings.sfx = Math.round(Math.min(100, Math.max(0, s.sfx)));
  for (const k of ['ambience', 'shake', 'speedLines', 'showFps']) if (typeof s[k] === 'boolean') d.settings[k] = s[k];
  if (['auto', 'low', 'medium', 'high'].includes(s.quality)) d.settings.quality = s.quality;
  if (['auto', 'on', 'off'].includes(s.touch)) d.settings.touch = s.touch;

  const st = raw.stats || {};
  for (const k of Object.keys(d.stats)) {
    if (k === 'perEnv') continue;
    d.stats[k] = num(st[k]);
  }
  if (st.perEnv && typeof st.perEnv === 'object') {
    for (const id of ENV_IDS) {
      const e = st.perEnv[id];
      if (e) d.stats.perEnv[id] = { runs: num(e.runs), best: num(e.best) };
    }
  }

  if (Array.isArray(raw.missions)) {
    d.missions = raw.missions
      .filter((m) => m && typeof m.id === 'string' && Number.isFinite(m.target))
      .slice(0, 3)
      .map((m) => ({ id: m.id, target: m.target, progress: num(m.progress), reward: num(m.reward, 50) }));
  }
  if (ENV_IDS.includes(raw.lastEnv)) d.lastEnv = raw.lastEnv;
  return d;
}

export class SaveData {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const text = localStorage.getItem(KEY);
      return sanitize(text ? JSON.parse(text) : null);
    } catch {
      return defaults();
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or full storage: the game keeps working without saving.
    }
  }

  reset() {
    this.data = defaults();
    this.save();
  }

  get settings() { return this.data.settings; }
  get stats() { return this.data.stats; }
  get look() { return this.data.look; }
}
