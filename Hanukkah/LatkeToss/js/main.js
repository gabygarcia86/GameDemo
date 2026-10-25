import { createRenderer, GameScene } from './scene.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';

const ui = new UI();

function boot() {
  const container = document.getElementById('canvas-host');
  let renderer;
  try {
    renderer = createRenderer(container);
  } catch (error) {
    console.error(error);
    ui.showError('Your browser or device could not start WebGL, which Latke Toss needs to draw the 3D scene.');
    return;
  }

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    ui.showError('The 3D graphics context was lost. Reload the page to keep playing.');
  });

  const gameScene = new GameScene(renderer, container);
  const audio = new AudioManager();
  const game = new Game({ gameScene, ui, audio });

  // Keep particle sizes in world units whenever the viewport or field of view changes.
  gameScene.onResize = (width, height, pixelRatio) => {
    game.effects.setViewport(height * pixelRatio, gameScene.camera.fov);
  };
  gameScene.resize();

  // Exposed for debugging from the browser console.
  window.latkeToss = game;

  let lastTime = performance.now();
  let elapsed = 0;
  renderer.setAnimationLoop((now) => {
    // Real frame delta, clamped so a long stall (tab switch, breakpoint) can't explode physics.
    const dt = Math.min(Math.max(0, (now - lastTime) / 1000), 0.1);
    lastTime = now;
    elapsed += dt;
    gameScene.update(dt, elapsed);
    game.update(dt);
    gameScene.render();
  });
}

try {
  boot();
} catch (error) {
  console.error(error);
  ui.showError(`Latke Toss hit an error while starting: ${error.message}`);
}
