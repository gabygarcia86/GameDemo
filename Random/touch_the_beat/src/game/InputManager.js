// Pointer (touch/mouse/pen) and keyboard input for the four lanes.
//
// - Pointer Events with multitouch: each pointer is bound to the lane it
//   pressed until it lifts (no precise dragging ever required).
// - Event timestamps are forwarded so judgement uses the moment of the tap,
//   not the moment the frame got around to processing it.
// - Scrolling, pinch-zoom, double-tap zoom, context menus and text selection
//   are suppressed while enabled.

import { KEY_TO_LANE } from '../config.js';
import { LANE_COUNT } from '../charts/BeatMap.js';

export class InputManager {
  /**
   * @param {HTMLElement} surface element that receives gameplay touches
   * @param {{laneAt:(x:number,y:number)=>number}} layout
   */
  constructor(surface, layout) {
    this.surface = surface;
    this.layout = layout;
    this.enabled = false;
    this.handlers = null;
    this.pointers = new Map();
    this.laneCount = new Uint8Array(LANE_COUNT);
    this.keys = new Set();

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.releaseAll = this.releaseAll.bind(this);
    const block = (e) => this.enabled && e.cancelable && e.preventDefault();

    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('lostpointercapture', this.onPointerUp);
    surface.addEventListener('touchstart', block, { passive: false });
    surface.addEventListener('touchmove', block, { passive: false });
    surface.addEventListener('contextmenu', block);
    document.addEventListener('gesturestart', block, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  /** handlers: { down(lane, ms), up(lane, ms), pause() } */
  enable(handlers) {
    this.handlers = handlers;
    this.enabled = true;
    document.body.classList.add('input-locked');
  }

  disable() {
    this.releaseAll();
    this.enabled = false;
    this.handlers = null;
    document.body.classList.remove('input-locked');
  }

  static stamp(e) {
    // older WebKit used epoch timestamps; fall back to now() when implausible
    const ts = e.timeStamp;
    const now = performance.now();
    return ts > 0 && ts <= now + 5 && now - ts < 1000 ? ts : now;
  }

  press(lane, ms) {
    this.laneCount[lane]++;
    this.handlers?.down(lane, ms);
  }

  release(lane, ms) {
    if (this.laneCount[lane] === 0) return;
    this.laneCount[lane]--;
    if (this.laneCount[lane] === 0) this.handlers?.up(lane, ms);
  }

  onPointerDown(e) {
    if (!this.enabled || e.button > 0) return;
    if (e.target.closest && e.target.closest('[data-ui]')) return; // pause button etc.
    e.preventDefault();
    const lane = this.layout.laneAt(e.clientX, e.clientY);
    if (lane < 0) return;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
    this.pointers.set(e.pointerId, lane);
    this.press(lane, InputManager.stamp(e));
  }

  onPointerUp(e) {
    const lane = this.pointers.get(e.pointerId);
    if (lane === undefined) return;
    this.pointers.delete(e.pointerId);
    this.release(lane, InputManager.stamp(e));
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.handlers?.pause();
      return;
    }
    const lane = KEY_TO_LANE.get(e.code);
    if (lane === undefined) return;
    e.preventDefault();
    if (e.repeat || this.keys.has(e.code)) return;
    this.keys.add(e.code);
    this.press(lane, InputManager.stamp(e));
  }

  onKeyUp(e) {
    if (!this.keys.has(e.code)) return;
    this.keys.delete(e.code);
    const lane = KEY_TO_LANE.get(e.code);
    if (lane !== undefined) this.release(lane, InputManager.stamp(e));
  }

  releaseAll() {
    const now = performance.now();
    this.pointers.clear();
    this.keys.clear();
    for (let l = 0; l < LANE_COUNT; l++) {
      if (this.laneCount[l] > 0) {
        this.laneCount[l] = 1;
        this.release(l, now);
      }
    }
  }
}
