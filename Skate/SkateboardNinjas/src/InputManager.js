// Keyboard, mouse and multitouch input, turned into a small queue of game
// events: { type: 'ollie' | 'flip' | 'grab' | 'pause' | 'confirm' | 'mute', dir }.
//
// Each virtual stick fires once when pushed past the activation radius, then
// must return near the centre before it can fire again (no re-triggering every
// frame while held). The two sticks track separate pointers, so both can be
// used at the same time.

import { CONFIG } from './config.js';

const I = CONFIG.input;
const BITS = { up: 1, down: 2, left: 4, right: 8 };

const FLIP_KEYS = { ArrowUp: BITS.up, ArrowDown: BITS.down, ArrowLeft: BITS.left, ArrowRight: BITS.right };
const GRAB_KEYS = { KeyW: BITS.up, KeyS: BITS.down, KeyA: BITS.left, KeyD: BITS.right };

// 8-way direction from a vector (y up). Cardinals get wider sectors (60°)
// than diagonals (30°) so the four basic tricks are easy to hit.
export function directionFromVector(x, y) {
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const near = (target) => Math.abs(((deg - target + 540) % 360) - 180) <= 30;
  if (near(0)) return 'right';
  if (near(90)) return 'up';
  if (near(180)) return 'left';
  if (near(270)) return 'down';
  if (deg < 90) return 'upright';
  if (deg < 180) return 'upleft';
  if (deg < 270) return 'downleft';
  return 'downright';
}

function directionFromBits(bits) {
  let v = bits & BITS.up ? 'up' : bits & BITS.down ? 'down' : '';
  let h = bits & BITS.left ? 'left' : bits & BITS.right ? 'right' : '';
  if (bits & BITS.up && bits & BITS.down) v = '';
  if (bits & BITS.left && bits & BITS.right) h = '';
  return v + h || null;
}

class VirtualStick {
  constructor(el, kind, input) {
    this.el = el;
    this.kind = kind;
    this.input = input;
    this.base = el.querySelector('.stick-base');
    this.knob = el.querySelector('.stick-knob');
    this.labels = el.querySelectorAll('.stick-dir');
    this.pointerId = null;
    this.armed = true;
    this.dir = null;
    this.lastFire = 0;
    this.cx = 0; this.cy = 0; this.radius = 1;

    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener('lostpointercapture', (e) => this.onUp(e));
  }

  get held() {
    return this.pointerId !== null && !this.armed;
  }

  onDown(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const r = this.base.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.radius = r.width * 0.42;
    this.el.classList.add('active');
    this.onMove(e);
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    let dx = (e.clientX - this.cx) / this.radius;
    let dy = (e.clientY - this.cy) / this.radius;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    this.knob.style.transform = `translate(${dx * this.radius * 0.75}px, ${dy * this.radius * 0.75}px)`;
    const m = Math.min(1, mag);

    if (this.armed && m >= I.activate && m > I.deadZone) {
      const now = performance.now() / 1000;
      if (now - this.lastFire >= I.lockout) {
        this.armed = false;
        this.lastFire = now;
        this.dir = directionFromVector(dx, -dy);
        this.highlight(this.dir);
        this.input.emit(this.kind, this.dir);
      }
    } else if (!this.armed && m < I.release) {
      this.armed = true;
      this.dir = null;
      this.highlight(null);
    }
  }

  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.reset();
  }

  reset() {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null) {
      try { this.el.releasePointerCapture(id); } catch { /* already released */ }
    }
    this.armed = true;
    this.dir = null;
    this.knob.style.transform = '';
    this.el.classList.remove('active');
    this.highlight(null);
  }

  highlight(dir) {
    for (const label of this.labels) {
      label.classList.toggle('lit', !!dir && dir.includes(label.dataset.dir));
    }
  }
}

export class InputManager {
  constructor() {
    this.events = [];
    this.gameplay = false;      // when false, gameplay inputs are ignored
    this.grabKeys = new Set();
    this.pending = { flip: { bits: 0, timer: 0 }, grab: { bits: 0, timer: 0 } };
    this.sticks = [];
    this.flipStick = null;
    this.grabStick = null;
  }

  attach({ canvas, ollieButton, flipStick, grabStick }) {
    this.flipStick = new VirtualStick(flipStick, 'flip', this);
    this.grabStick = new VirtualStick(grabStick, 'grab', this);
    this.sticks = [this.flipStick, this.grabStick];

    ollieButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ollieButton.classList.add('pressed');
      this.emit('ollie');
    });
    const release = () => ollieButton.classList.remove('pressed');
    ollieButton.addEventListener('pointerup', release);
    ollieButton.addEventListener('pointercancel', release);
    ollieButton.addEventListener('pointerleave', release);

    // Tapping the left half of the play field also ollies (big easy target).
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.gameplay) return;
      const r = canvas.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.5) {
        e.preventDefault();
        this.emit('ollie');
      }
    });

    for (const el of [ollieButton, flipStick, grabStick, canvas]) {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.clear());
  }

  emit(type, dir = null) {
    if ((type === 'ollie' || type === 'flip' || type === 'grab') && !this.gameplay) return;
    this.events.push({ type, dir });
  }

  drain(handler) {
    for (let i = 0; i < this.events.length; i++) handler(this.events[i]);
    this.events.length = 0;
  }

  get grabHeld() {
    return this.grabKeys.size > 0 || (this.grabStick !== null && this.grabStick.held);
  }

  clear() {
    this.events.length = 0;
    this.grabKeys.clear();
    for (const kind of ['flip', 'grab']) {
      const p = this.pending[kind];
      clearTimeout(p.timer);
      p.timer = 0;
      p.bits = 0;
    }
    for (const s of this.sticks) s.reset();
  }

  onKeyDown(e) {
    const code = e.code;
    const isGameKey = code === 'Space' || code in FLIP_KEYS || code in GRAB_KEYS;
    if (isGameKey && this.gameplay) e.preventDefault();
    if (e.repeat) return;

    if (code === 'Space') {
      if (this.gameplay) this.emit('ollie');
    } else if (code in FLIP_KEYS) {
      this.queueChord('flip', FLIP_KEYS[code]);
    } else if (code in GRAB_KEYS) {
      this.grabKeys.add(code);
      this.queueChord('grab', GRAB_KEYS[code]);
    } else if (code === 'Escape' || code === 'KeyP') {
      this.emit('pause');
    } else if (code === 'Enter' || code === 'NumpadEnter') {
      // A focused button already handles Enter itself.
      if (!(e.target instanceof HTMLElement && e.target.closest('button, summary, a'))) this.emit('confirm');
    } else if (code === 'KeyM') {
      this.emit('mute');
    }
  }

  onKeyUp(e) {
    if (e.code in GRAB_KEYS) this.grabKeys.delete(e.code);
  }

  // Arrow/WASD presses within a short window combine into a diagonal trick.
  queueChord(kind, bit) {
    if (!this.gameplay) return;
    const p = this.pending[kind];
    p.bits |= bit;
    if (p.timer) return;
    p.timer = setTimeout(() => {
      const dir = directionFromBits(p.bits);
      p.bits = 0;
      p.timer = 0;
      if (dir) this.emit(kind, dir);
    }, I.keyChordWindow);
  }
}
