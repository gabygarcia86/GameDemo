// Entry point: check for WebGL, then start the game.

import { Game } from './Game.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function fail(message) {
  const loading = document.getElementById('loading');
  if (loading) loading.querySelector('p').textContent = message;
  const star = loading?.querySelector('.loading-star');
  if (star) star.style.animation = 'none';
}

if (!webglAvailable()) {
  fail('Sorry! Skateboard Ninjas 2 needs WebGL, which this browser or device has turned off.');
} else {
  try {
    window.game = new Game();
  } catch (err) {
    console.error(err);
    fail(`Couldn't start the game: ${err.message}`);
  }
}
