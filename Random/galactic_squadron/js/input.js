/**
 * Keyboard, mouse and touch input. Movement keys and fire are polled each
 * step; one-shot actions (pause, confirm, shield, mute) are forwarded to the
 * game, which queues them so a single press can never trigger two transitions.
 *
 * Touch / mouse movement is a relative drag: the ship follows the finger's
 * horizontal motion from wherever the drag started, so the finger never
 * covers the ship.
 */
import { CONFIG, WORLD } from './config.js';

const { W } = WORLD;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const FIRE = new Set(['Space', 'ArrowUp', 'KeyW']);
const SHIELD = new Set(['ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown']);
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...FIRE, ...SHIELD, 'KeyP', 'Escape', 'Enter', 'KeyM']);

function isFormControl(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA');
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.fireTouches = new Set();
    this.dragId = null;
    this.dragStartX = 0;
    this.shipStartX = 0;
    this.dragScale = 1;
    this.touchTargetX = null;
    this.game = null;
    this.ui = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPadDown = this.onPadDown.bind(this);
    this.onPadMove = this.onPadMove.bind(this);
    this.onPadUp = this.onPadUp.bind(this);
    this.onFireDown = this.onFireDown.bind(this);
    this.onFireUp = this.onFireUp.bind(this);
    this.onShieldDown = this.onShieldDown.bind(this);
    this.reset = this.reset.bind(this);
  }

  get axis() {
    let a = 0;
    for (const k of this.keys) {
      if (LEFT.has(k)) a = a === 1 ? 0 : -1;
      else if (RIGHT.has(k)) a = a === -1 ? 0 : 1;
    }
    return a;
  }

  get fireHeld() {
    if (this.fireTouches.size) return true;
    for (const k of this.keys) if (FIRE.has(k)) return true;
    return false;
  }

  attach(game, ui) {
    this.game = game;
    this.ui = ui;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);

    for (const el of [ui.canvas, ui.movePad]) {
      el.addEventListener('pointerdown', this.onPadDown);
      el.addEventListener('pointermove', this.onPadMove);
      el.addEventListener('pointerup', this.onPadUp);
      el.addEventListener('pointercancel', this.onPadUp);
      el.addEventListener('lostpointercapture', this.onPadUp);
    }
    const fire = ui.fireButton;
    fire.addEventListener('pointerdown', this.onFireDown);
    fire.addEventListener('pointerup', this.onFireUp);
    fire.addEventListener('pointercancel', this.onFireUp);
    fire.addEventListener('lostpointercapture', this.onFireUp);
    ui.shieldButton.addEventListener('pointerdown', this.onShieldDown);

    // Block long-press menus and double-tap zoom on the play area.
    for (const el of [ui.canvas, ui.touchControls]) {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /** Releases everything held — used on blur, pause and state changes. */
  reset() {
    this.keys.clear();
    this.fireTouches.clear();
    this.dragId = null;
    this.touchTargetX = null;
  }

  onKeyDown(e) {
    const code = e.code;
    const inGame = this.game.isActivePlay();
    const focused = document.activeElement;
    if (GAME_KEYS.has(code) && (inGame || !isFormControl(focused))) e.preventDefault();
    if (!inGame && isFormControl(focused) && code !== 'Escape' && code !== 'KeyM' && code !== 'KeyP') return;

    this.keys.add(code);
    if (e.repeat) return;

    if (code === 'KeyP' || code === 'Escape') this.game.requestAction('escape');
    else if (code === 'Enter') this.game.requestAction('confirm');
    else if (code === 'KeyM') this.game.toggleMute();
    else if (SHIELD.has(code) && inGame) this.game.requestAction('shield');
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onPadDown(e) {
    if (this.dragId !== null || !this.game.isActivePlay()) return;
    e.preventDefault();
    this.dragId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    const sens = e.pointerType === 'mouse' ? 1 : CONFIG.player.touchSensitivity;
    this.dragScale = (W / this.ui.frameWidth) * sens;
    this.dragStartX = e.clientX;
    this.shipStartX = this.game.player.x;
    this.touchTargetX = this.shipStartX;
    if (e.pointerType === 'touch') this.ui.setTouchMode(true);
  }

  onPadMove(e) {
    if (e.pointerId !== this.dragId) return;
    e.preventDefault();
    const lo = CONFIG.player.margin;
    const hi = W - CONFIG.player.margin;
    let t = this.shipStartX + (e.clientX - this.dragStartX) * this.dragScale;
    // Re-anchor at the walls so reversing direction responds immediately.
    if (t < lo || t > hi) {
      t = t < lo ? lo : hi;
      this.shipStartX = t;
      this.dragStartX = e.clientX;
    }
    this.touchTargetX = t;
  }

  onPadUp(e) {
    if (e.pointerId !== this.dragId) return;
    this.dragId = null;
    this.touchTargetX = null;
  }

  onFireDown(e) {
    e.preventDefault();
    this.fireTouches.add(e.pointerId);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    this.ui.fireButton.classList.add('active');
  }

  onFireUp(e) {
    this.fireTouches.delete(e.pointerId);
    if (!this.fireTouches.size) this.ui.fireButton.classList.remove('active');
  }

  onShieldDown(e) {
    e.preventDefault();
    if (this.game.isActivePlay()) this.game.requestAction('shield');
  }
}
