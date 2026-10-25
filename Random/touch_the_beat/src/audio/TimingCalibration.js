// Tap-along latency calibration.
//
// A metronome is scheduled on the AudioContext clock. The player taps along;
// each tap is converted to context time and compared with the nearest click.
// The median difference = output latency + reaction bias. The browser's
// reported latency (already compensated by AudioEngine) is removed, and the
// remainder becomes the recommended "audio offset" setting.

export class TimingCalibration {
  constructor(audio, sfx) {
    this.audio = audio;
    this.sfx = sfx;
    this.clicks = [];
    this.taps = [];
    this.running = false;
    this.interval = 0.6;
    this.timer = 0;
  }

  async start({ bpm = 100, beats = 16, onDone } = {}) {
    await this.audio.unlock();
    const ctx = this.audio.ctx;
    this.interval = 60 / bpm;
    this.clicks = [];
    this.taps = [];
    const first = ctx.currentTime + 1.2;
    for (let i = 0; i < beats; i++) {
      const t = first + i * this.interval;
      this.clicks.push(t);
      this.sfx.metronome(t, i % 4 === 0);
    }
    this.running = true;
    clearTimeout(this.timer);
    const end = first + beats * this.interval + 0.4 - ctx.currentTime;
    this.timer = setTimeout(() => {
      this.running = false;
      onDone?.(this.result());
    }, end * 1000);
  }

  stop() {
    clearTimeout(this.timer);
    this.running = false;
  }

  /** Visual beat phase in [0,1) based on what is being heard now (-1 before start). */
  phase() {
    if (!this.clicks.length) return { index: -1, phase: 0 };
    const heard = this.audio.now() - this.audio.latency;
    const rel = (heard - this.clicks[0]) / this.interval;
    if (rel < 0) return { index: -1, phase: 0 };
    return { index: Math.floor(rel), phase: rel - Math.floor(rel) };
  }

  tap(perfMs) {
    if (!this.running) return null;
    const age = Math.max(0, (performance.now() - perfMs) / 1000);
    const t = this.audio.now() - age;
    this.taps.push(t);
    let best = Infinity;
    for (const c of this.clicks) if (Math.abs(t - c) < Math.abs(best)) best = t - c;
    return best;
  }

  result() {
    const diffs = [];
    for (const t of this.taps) {
      let best = Infinity;
      for (const c of this.clicks) if (Math.abs(t - c) < Math.abs(best)) best = t - c;
      if (Math.abs(best) < this.interval * 0.45) diffs.push(best);
    }
    // ignore the first two taps (players lock in after a couple of beats)
    const used = diffs.length > 6 ? diffs.slice(2) : diffs;
    if (used.length < 4) return { ok: false, samples: used.length, message: 'Not enough taps — tap along with every click.' };
    const sorted = used.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mad = sorted.map((d) => Math.abs(d - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
    const offsetMs = Math.round((median - this.audio.latency) * 1000);
    return {
      ok: true,
      samples: used.length,
      offsetMs,
      rawMs: Math.round(median * 1000),
      spreadMs: Math.round(mad * 1000),
      steady: mad < 0.03,
    };
  }
}
