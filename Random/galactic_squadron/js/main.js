/** Entry point: loads settings, wires the modules together and starts the loop. */
import { CONFIG, DEFAULT_SETTINGS } from './config.js';
import { storage } from './storage.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';

function loadSettings() {
  const saved = storage.get('settings', {}) || {};
  const s = { ...DEFAULT_SETTINGS };
  for (const k in DEFAULT_SETTINGS) {
    if (typeof saved[k] === typeof DEFAULT_SETTINGS[k]) s[k] = saved[k];
  }
  for (const k of ['master', 'music', 'sfx']) s[k] = Math.min(1, Math.max(0, s[k]));
  if (!CONFIG.difficultyPresets[s.difficulty]) s.difficulty = DEFAULT_SETTINGS.difficulty;
  if (s.movement !== 'direct' && s.movement !== 'inertia') s.movement = DEFAULT_SETTINGS.movement;
  s.startLives = Math.min(CONFIG.player.maxLives, Math.max(1, Math.round(s.startLives)));
  return s;
}

const params = new URLSearchParams(location.search);
const settings = loadSettings();
const audio = new AudioEngine(settings);
const ui = new UI(settings, audio);
const input = new Input();
const game = new Game({
  canvas: ui.canvas,
  settings,
  audio,
  ui,
  input,
  startStage: Math.max(1, parseInt(params.get('stage'), 10) || 1), // testing aid: ?stage=7 starts at the first boss
});

ui.bind(game);
input.attach(game, ui);

// Browsers only allow audio after a user gesture.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.pause();
    input.reset();
    audio.suspend();
  } else {
    audio.resume();
    game.lastTs = 0;
  }
});
window.addEventListener('pagehide', () => game.saveHighScore());

game.start();

if (params.has('debug')) window.galacticSquadron = game;
