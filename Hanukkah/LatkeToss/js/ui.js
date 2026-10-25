import { DIFFICULTIES } from './config.js';

const $ = (id) => document.getElementById(id);

/**
 * Thin wrapper around the DOM overlay: screens, HUD values, popups and button wiring.
 * Holds no game rules; the Game decides what to show and when.
 */
export class UI {
  constructor() {
    this.screens = {
      menu: $('screen-menu'),
      pause: $('screen-pause'),
      over: $('screen-over'),
      error: $('screen-error'),
    };
    this.hud = $('hud');
    this.hudControls = $('hud-controls');
    this.scoreBox = $('hud-score-box');
    this.scoreValue = $('hud-score');
    this.timeBox = $('hud-time-box');
    this.timeValue = $('hud-time');
    this.bestValue = $('hud-best');
    this.hudDifficulty = $('hud-difficulty');
    this.hint = $('hint');
    this.banner = $('banner');
    this.popupLayer = $('popup-layer');
    this.pauseButton = $('btn-pause');
    this.difficultyButtons = Array.from(document.querySelectorAll('.diff-btn'));
    this.muteButtons = Array.from(document.querySelectorAll('.mute-toggle'));
    this._lastTime = null;
    this._bannerTimer = 0;
  }

  /** Wires buttons to handler callbacks. Every handler receives no arguments except onDifficulty. */
  bind(handlers) {
    const on = (id, handler) => $(id).addEventListener('click', () => handler());
    on('btn-start', handlers.onStart);
    on('btn-pause', handlers.onPauseToggle);
    on('btn-restart', handlers.onRestart);
    on('btn-resume', handlers.onPauseToggle);
    on('btn-pause-restart', handlers.onRestart);
    on('btn-pause-menu', handlers.onMenu);
    on('btn-play-again', handlers.onRestart);
    on('btn-over-menu', handlers.onMenu);
    for (const button of this.muteButtons) button.addEventListener('click', () => handlers.onMuteToggle());
    for (const button of this.difficultyButtons) {
      button.addEventListener('click', () => handlers.onDifficulty(button.dataset.difficulty));
    }
    // Any button press counts as the user gesture that unlocks audio.
    document.addEventListener('pointerdown', handlers.onAnyInteraction, { capture: true });
    document.addEventListener('keydown', handlers.onAnyInteraction, { capture: true });
  }

  showScreen(name) {
    for (const [key, element] of Object.entries(this.screens)) {
      element.classList.toggle('hidden', key !== name);
    }
  }

  setHudVisible(visible) {
    this.hud.classList.toggle('hidden', !visible);
    this.hudControls.classList.toggle('hidden', !visible);
  }

  setDifficulty(key) {
    for (const button of this.difficultyButtons) {
      button.setAttribute('aria-checked', String(button.dataset.difficulty === key));
    }
    const label = DIFFICULTIES[key].label;
    $('selected-difficulty').textContent = label;
    this.hudDifficulty.textContent = label;
  }

  setBestScores(bestByDifficulty) {
    for (const [key, value] of Object.entries(bestByDifficulty)) {
      const element = document.querySelector(`[data-best="${key}"]`);
      if (element) element.textContent = String(value);
    }
  }

  setScore(score, animate = false) {
    this.scoreValue.textContent = String(score);
    if (animate) {
      this.scoreBox.classList.remove('bump');
      // Force a reflow so the animation restarts on rapid hits.
      void this.scoreBox.offsetWidth;
      this.scoreBox.classList.add('bump');
    }
  }

  setBest(best) {
    this.bestValue.textContent = String(best);
  }

  setTime(secondsLeft) {
    const shown = Math.max(0, Math.ceil(secondsLeft));
    if (shown === this._lastTime) return;
    this._lastTime = shown;
    this.timeValue.textContent = String(shown);
    this.timeBox.classList.toggle('low', shown <= 10 && shown > 0);
  }

  resetTime() {
    this._lastTime = null;
  }

  setPaused(paused) {
    this.pauseButton.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  }

  setMuted(muted) {
    for (const button of this.muteButtons) {
      if (button.classList.contains('icon-btn')) {
        button.innerHTML = muted ? '&#128263;' : '&#128266;';
        button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
      } else {
        button.textContent = muted ? 'Sound: Off' : 'Sound: On';
      }
    }
  }

  showHint(visible) {
    this.hint.classList.toggle('hidden', !visible);
    this.hint.classList.remove('faded');
  }

  fadeHint() {
    this.hint.classList.add('faded');
  }

  showBanner(text, { gold = false, duration = 900 } = {}) {
    clearTimeout(this._bannerTimer);
    this.banner.textContent = text;
    this.banner.classList.toggle('gold', gold);
    this.banner.classList.remove('hidden');
    // Restart the entry animation.
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    if (duration > 0) {
      this._bannerTimer = setTimeout(() => this.hideBanner(), duration);
    }
  }

  hideBanner() {
    clearTimeout(this._bannerTimer);
    this.banner.classList.add('hidden');
  }

  /** Floating text at a canvas pixel position (e.g. "+1" above the pot). */
  popup(x, y, html, className = '') {
    const element = document.createElement('div');
    element.className = `popup ${className}`.trim();
    element.innerHTML = html;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.addEventListener('animationend', () => element.remove(), { once: true });
    this.popupLayer.appendChild(element);
    // Safety net in case animationend never fires (e.g. reduced motion settings).
    setTimeout(() => element.remove(), 1500);
  }

  clearPopups() {
    this.popupLayer.replaceChildren();
  }

  showGameOver({ score, difficultyLabel, best, isNewBest }) {
    $('final-score').textContent = String(score);
    $('final-difficulty').textContent = difficultyLabel;
    $('final-best').textContent = String(best);
    $('final-new-best').classList.toggle('hidden', !isNewBest);
    this.showScreen('over');
    $('btn-play-again').focus({ preventScroll: true });
  }

  showError(message) {
    if (message) $('error-message').textContent = message;
    this.setHudVisible(false);
    this.showScreen('error');
  }

  setGrabCursor(canGrab) {
    document.body.classList.toggle('can-grab', canGrab);
  }

  setAimingCursor(aiming) {
    document.body.classList.toggle('is-aiming', aiming);
  }
}
