// Keyboard, mouse and touch input, turned into game actions:
//   left, right, jump, slide, throw, flip, pause, confirm, mute
// Swipes fire as soon as the finger has moved far enough (not on release),
// and one finger can chain swipes in different directions without lifting
// (e.g. right then up), which keeps high-speed play responsive.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'slide', KeyS: 'slide',
  KeyJ: 'throw', KeyE: 'throw', KeyK: 'throw',
  KeyF: 'flip', KeyQ: 'flip',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  KeyM: 'mute',
};
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
// Chaining a second swipe without lifting the finger: it must travel this many
// times the normal swipe distance, be this many times straighter along its
// axis than across it, and come at least this long after the first one.
const CHAIN_DISTANCE = 1.6;
const CHAIN_STRAIGHTNESS = 2;
const CHAIN_GAP_MS = 90;

export class Input {
  constructor(surface, onAction) {
    this.surface = surface;
    this.onAction = onAction;
    this.playing = false; // true while a run is live (enables swipes and click-to-throw)
    this.touch = null;

    window.addEventListener('keydown', (e) => this.keydown(e));
    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    // Stop iOS double-tap zoom and pull-to-refresh while playing.
    surface.addEventListener('touchmove', (e) => { if (this.playing) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', (e) => { if (this.playing) e.preventDefault(); });
  }

  keydown(e) {
    const action = KEYS[e.code];
    if (!action) return;
    const typing = e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if (typing) return;
    if (this.playing && GAME_KEYS.has(e.code)) e.preventDefault();
    // Don't let Space/Enter also "click" a focused button mid-run.
    if (this.playing && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault();
    if (e.repeat && action !== 'throw') return;
    this.onAction(action, e);
  }

  down(e) {
    if (!this.playing) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.onAction('throw', e);
      return;
    }
    this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, last: null, time: 0 };
  }

  move(e) {
    const t = this.touch;
    if (!t || e.pointerId !== t.id || !this.playing) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    const threshold = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.045);
    // A follow-up stroke in the same touch has to be deliberate: the tail of a
    // quick sideways flick usually curls up or down, and that must not turn
    // into an accidental jump (straight onto a rail) or slide.
    const chained = t.last !== null;
    if (Math.hypot(dx, dy) < threshold * (chained ? CHAIN_DISTANCE : 1)) return;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const action = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'jump' : 'slide';
    const along = horizontal ? Math.abs(dx) : Math.abs(dy);
    const across = horizontal ? Math.abs(dy) : Math.abs(dx);
    // Re-centre so the next stroke is measured from here, but a long swipe in
    // the same direction only counts once (one swipe = one lane).
    t.x = e.clientX;
    t.y = e.clientY;
    e.preventDefault();
    if (action === t.last) return;
    if (chained && (along < across * CHAIN_STRAIGHTNESS || e.timeStamp - t.time < CHAIN_GAP_MS)) return;
    t.last = action;
    t.time = e.timeStamp;
    this.onAction(action, e);
  }

  up(e) {
    if (this.touch && e.pointerId === this.touch.id) this.touch = null;
  }
}
