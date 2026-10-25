// Web Audio playback and the master rhythm clock.
//
// Timing model
//   - AudioContext.currentTime is the only clock. The song's position 0 is
//     scheduled at `songStartCtx`; song time = ctxNow - songStartCtx.
//   - ctx.currentTime advances in audio-callback-sized steps; between steps
//     we extrapolate with performance.now() (clamped, monotonic) so visuals
//     move smoothly without drifting from the audio clock.
//   - Output latency reported by the browser is subtracted; the player's
//     calibration offset (Settings) is applied by Game on top of this.
//   - Pausing suspends the context, which freezes the clock exactly.

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.source = null;
    this.songStartCtx = 0;
    this.playing = false;
    this.unlocked = false;
    this._lastCt = -1;
    this._lastPt = 0;
    this._mono = 0;
    this.freqData = new Uint8Array(64);
    this.onEnded = null;
    settings.onChange((key) => {
      if (key.endsWith('Volume')) this.applyVolumes();
    });
  }

  static get supported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This browser does not support the Web Audio API, which the game needs for accurate timing.');
    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch {
      this.ctx = new Ctx();
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.72;
    this.music.connect(this.analyser);
    this.analyser.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(ctx.destination);
    this.applyVolumes();
    return ctx;
  }

  /** Must be called from a user gesture at least once (mobile autoplay rules). */
  async unlock() {
    const ctx = this.ensure();
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* will retry on the next gesture */
      }
    }
    if (!this.unlocked) {
      // a silent one-sample buffer fully unlocks iOS Safari
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      this.unlocked = true;
    }
    return ctx.state === 'running';
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.get('masterVolume'), t, 0.02);
    this.music.gain.setTargetAtTime(s.get('musicVolume'), t, 0.02);
    this.sfx.gain.setTargetAtTime(s.get('sfxVolume'), t, 0.02);
  }

  decode(arrayBuffer) {
    const ctx = this.ensure();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (b) => !settled && ((settled = true), resolve(b));
      const fail = (e) => !settled && ((settled = true), reject(e || new Error('Audio decoding failed')));
      try {
        const p = ctx.decodeAudioData(arrayBuffer, ok, fail);
        if (p && typeof p.then === 'function') p.then(ok, fail);
      } catch (err) {
        fail(err);
      }
    });
  }

  /** Total output latency estimate in seconds (browser-reported, clamped). */
  get latency() {
    const c = this.ctx;
    if (!c) return 0;
    const v = (Number(c.outputLatency) || 0) + (Number(c.baseLatency) || 0);
    return Math.min(0.5, Math.max(0, v));
  }

  /** Smoothed AudioContext time. */
  now() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const ct = ctx.currentTime;
    const pt = performance.now();
    if (ctx.state !== 'running') {
      this._lastCt = ct;
      this._lastPt = pt;
      this._mono = ct;
      return ct;
    }
    if (ct !== this._lastCt) {
      this._lastCt = ct;
      this._lastPt = pt;
    }
    const est = ct + Math.min(0.06, (pt - this._lastPt) / 1000);
    // never go backwards; small forward bias is corrected as ct catches up
    this._mono = est > this._mono || this._mono - est > 0.1 ? est : this._mono;
    return this._mono;
  }

  /** Song position (seconds) of the sound currently reaching the speakers. */
  songTime() {
    return this.now() - this.songStartCtx - this.latency;
  }

  /** Convert an event timestamp (performance.now() domain, ms) to song time. */
  perfToSongTime(perfMs) {
    const age = Math.max(0, (performance.now() - perfMs) / 1000);
    return this.songTime() - Math.min(age, 0.25);
  }

  /** Start `buffer` so that song position `from` plays `leadIn` seconds from now. */
  play(buffer, leadIn = 0, from = 0) {
    const ctx = this.ensure();
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.music);
    const when = ctx.currentTime + Math.max(0, leadIn);
    src.start(when, Math.max(0, from));
    src.onended = () => {
      if (this.source === src) {
        this.playing = false;
        this.onEnded?.();
      }
    };
    this.source = src;
    this.songStartCtx = when - from;
    this.playing = true;
    this._mono = 0;
  }

  stop() {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.playing = false;
  }

  async suspend() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  get running() {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  /** Byte spectrum of the music bus (64 bins), reused buffer. */
  spectrum() {
    if (this.ctx && this.analyser) this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }
}
