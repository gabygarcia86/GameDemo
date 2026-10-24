// Entry point: wire the modules together and start the loop.

import { Game } from './Game.js';
import { HUD } from './HUD.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { storage } from './storage.js';

const canvas = document.getElementById('game-canvas');
const game = new Game({
  canvas,
  hud: new HUD(),
  input: new InputManager(),
  audio: new AudioManager(storage),
  storage,
});
game.init();

// iOS Safari ignores user-scalable=no; block pinch and double-tap zoom on the play field.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Handy for tuning from the browser console.
window.skateboardNinjas = game;
