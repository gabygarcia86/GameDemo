// Main menu: animated CSS logo over the canvas background.

import { $, openModal } from '../util/dom.js';

export class MainMenu {
  constructor(app) {
    this.app = app;
    $('#btn-play').addEventListener('click', () => app.quickPlay());
    $('#btn-library').addEventListener('click', () => app.ui.show('songs'));
    $('#btn-settings').addEventListener('click', () => app.ui.show('settings'));
    $('#btn-howto').addEventListener('click', () => openModal('modal-howto'));

    const fs = $('#btn-fullscreen');
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) fs.hidden = true;
    fs.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
          await request.call(root);
          // portrait by default where the browser allows locking
          await screen.orientation?.lock?.('portrait').catch(() => {});
        }
      } catch {
        /* user agent refused */
      }
    });
  }

  onShow() {
    const { song, difficulty } = this.app.quickPlayTarget();
    $('#quick-song').textContent = song ? `${song.title} · ${difficulty[0].toUpperCase()}${difficulty.slice(1)}` : '';
  }
}
