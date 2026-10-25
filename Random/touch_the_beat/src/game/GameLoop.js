// requestAnimationFrame driver. Rendering only — the rhythm clock is the
// AudioContext (see AudioEngine), never frame counts or timers.

export class GameLoop {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.running = false;
    this.last = 0;
    this.fps = 60;
    this.frameMs = 16.7;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    if (!this.running) return;
    const raw = now - this.last;
    this.last = now;
    // ignore huge gaps (tab was hidden) when averaging
    if (raw < 250) {
      this.frameMs += (raw - this.frameMs) * 0.05;
      this.fps = 1000 / this.frameMs;
    }
    this.onFrame(Math.min(0.1, raw / 1000), now);
    requestAnimationFrame(this.tick);
  }
}
