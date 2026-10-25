// Procedurally synthesised sound effects (no audio files).

const LANE_FREQ = [523.25, 659.25, 783.99, 987.77]; // C5 E5 G5 B5

export class Sfx {
  constructor(audio, settings) {
    this.audio = audio;
    this.settings = settings;
    this.noise = null;
    this.recent = 0;
    this.recentAt = 0;
  }

  get ctx() {
    const c = this.audio.ctx;
    return c && c.state === 'running' ? c : null;
  }

  noiseBuffer(ctx) {
    if (!this.noise || this.noise.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647) * 2 - 1;
      }
      this.noise = b;
    }
    return this.noise;
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, when = 0, to = null, attack = 0.004 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.audio.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseHit(dur, { gain = 0.2, filter = 'lowpass', freq = 800, when = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.audio.sfx);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** Limit simultaneous hit sounds so chords don't clip. */
  throttle() {
    const now = performance.now();
    if (now - this.recentAt > 25) {
      this.recent = 0;
      this.recentAt = now;
    }
    return ++this.recent <= 2;
  }

  hit(lane, rating) {
    if (!this.settings.get('hitSounds') || !this.throttle()) return;
    const f = LANE_FREQ[lane] || 600;
    this.tone(f, 0.08, { type: 'triangle', gain: 0.16 });
    if (rating === 'perfect') this.tone(f * 2, 0.12, { type: 'sine', gain: 0.06 });
  }

  miss() {
    if (!this.settings.get('hitSounds')) return;
    this.noiseHit(0.12, { gain: 0.16, freq: 380 });
  }

  holdBreak() {
    this.tone(320, 0.18, { type: 'sawtooth', gain: 0.05, to: 140 });
  }

  click() {
    this.tone(1250, 0.035, { type: 'square', gain: 0.035 });
  }

  confirm() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(660, 0.08, { type: 'triangle', gain: 0.1 });
    this.tone(990, 0.12, { type: 'triangle', gain: 0.1, when: ctx.currentTime + 0.06 });
  }

  countdown(n) {
    if (n > 0) this.tone(660, 0.12, { type: 'square', gain: 0.07 });
    else this.tone(1320, 0.3, { type: 'square', gain: 0.07 });
  }

  milestone() {
    this.tone(420, 0.35, { type: 'sawtooth', gain: 0.05, to: 1680 });
    this.noiseHit(0.4, { gain: 0.05, filter: 'highpass', freq: 5000 });
  }

  /** Scheduled metronome click on the audio clock (calibration). */
  metronome(when, accent) {
    this.tone(accent ? 1760 : 1175, 0.05, { type: 'sine', gain: 0.35, when, attack: 0.001 });
  }
}
