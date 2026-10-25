// Loading / analysis progress screen.

import { $ } from '../util/dom.js';

export class LoadingScreen {
  constructor() {
    this.title = $('#loading-title');
    this.stage = $('#loading-stage');
    this.bar = $('#loading-bar');
    this.hint = $('#loading-hint');
    this.cancelBtn = $('#loading-cancel');
    this.onCancel = null;
    this.cancelBtn.addEventListener('click', () => {
      this.cancelBtn.disabled = true;
      this.stage.textContent = 'Cancelling…';
      this.onCancel?.();
    });
  }

  set(title, stage = 'Preparing…', { hint = '', onCancel = null } = {}) {
    this.title.textContent = title;
    this.stage.textContent = stage;
    this.hint.textContent = hint;
    this.bar.style.width = '0%';
    this.onCancel = onCancel;
    this.cancelBtn.hidden = !onCancel;
    this.cancelBtn.disabled = false;
  }

  progress(fraction, stage) {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    if (stage) this.stage.textContent = stage;
  }

  setHint(text) {
    this.hint.textContent = text;
  }
}
