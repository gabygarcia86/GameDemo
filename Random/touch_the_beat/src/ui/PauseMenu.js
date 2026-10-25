// Pause overlay with quick timing / speed adjustments.

import { $ } from '../util/dom.js';

export class PauseMenu {
  constructor(app) {
    this.app = app;
    this.overlay = $('#pause-overlay');
    this.speed = $('#pause-speed');
    this.offset = $('#pause-offset');

    $('#btn-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      app.game.pause();
    });
    $('#btn-resume').addEventListener('click', () => app.game.resume());
    $('#btn-restart').addEventListener('click', () => app.game.restart());
    $('#btn-quit').addEventListener('click', () => app.quitGame());
    this.speed.addEventListener('input', () => {
      app.settings.set('noteSpeed', Number(this.speed.value));
      this.sync();
    });
    this.offset.addEventListener('input', () => {
      app.settings.set('audioOffsetMs', Number(this.offset.value));
      this.sync();
    });
  }

  sync() {
    const s = this.app.settings;
    $('#pause-speed-out').textContent = s.get('noteSpeed').toFixed(1);
    const o = s.get('audioOffsetMs');
    $('#pause-offset-out').textContent = `${o > 0 ? '+' : ''}${o} ms`;
  }

  setVisible(visible) {
    this.overlay.hidden = !visible;
    $('#btn-pause').hidden = visible;
    if (visible) {
      const s = this.app.settings;
      this.speed.value = String(s.get('noteSpeed'));
      this.offset.value = String(s.get('audioOffsetMs'));
      $('#pause-song').textContent = this.app.game.song ? `${this.app.game.song.title} · ${this.app.currentDifficulty}` : '';
      this.sync();
      $('#btn-resume').focus({ preventScroll: true });
    }
  }
}
