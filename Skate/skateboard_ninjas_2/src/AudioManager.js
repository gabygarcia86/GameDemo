// All game audio.
//
// - Music: the songs in assets/music, shuffled, one after another, menus and
//   runs alike. Routed through Web Audio so the volume slider works on iOS.
// - Sound effects: synthesized with Web Audio. To use your own file instead,
//   drop it in assets/audio/ and put its path in SOUND_FILES below. Nothing
//   else needs to change: play('coin') uses the file if one is set.
// - Loops: longboard rolling, hoverboard hum, rail grind and wind, driven by
//   the player's speed every frame.
// - Ambience: a synthesized bed plus random events (birds, crickets, waves,
//   seagulls...) for each environment.
//
// The AudioContext is created on the first user gesture (browser autoplay rules).

// Replace null with e.g. 'assets/audio/coin.mp3' to use a recorded sound.
export const SOUND_FILES = {
  click: null, jump: null, land: null, coin: null, throw: null, hit: null, poof: null,
  karen: null, ninja: null, crash: null, gameover: null, powerup: null, shieldBreak: null,
  ramp: null, grindStart: null, trick: null, whoosh: null, splat: null, beep: null, go: null,
  mission: null, buy: null, bump: null, pop: null, chest: null, slide: null, combo: null,
  error: null, enemyThrow: null, fall: null, nearMiss: null, bear: null, yeti: null,
};

// Browsers can't list a folder, so the songs are named here.
export const MUSIC_TRACKS = Array.from({ length: 10 }, (_, i) => `assets/music/Song${String(i + 1).padStart(2, '0')}.mp3`);

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.buffers = new Map();
    this.songIndex = -1;
    this.songFails = 0;
    this.musicWanted = false;
    this.ambience = null;
    this.ambTimer = 1;
    this.duck = 1;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.build();
      this.loadOverrides();
      if (this.musicWanted) this.startMusic();
      if (this.pendingAmbience) this.setAmbience(this.pendingAmbience);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
  }

  build() {
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Rolling wheels
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 300;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.loopNoise(this.rollFilter);
    this.rollFilter.connect(this.rollGain).connect(this.sfx);

    // Hoverboard hum: two detuned oscillators with a wobble.
    this.hoverGain = ctx.createGain();
    this.hoverGain.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 900;
    this.hoverOscs = [ctx.createOscillator(), ctx.createOscillator()];
    this.hoverOscs[0].type = 'sawtooth';
    this.hoverOscs[1].type = 'sine';
    for (const o of this.hoverOscs) {
      o.frequency.value = 110;
      o.connect(hf);
      o.start();
    }
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(trem.gain);
    lfo.start();
    hf.connect(trem).connect(this.hoverGain).connect(this.sfx);

    // Grind: scrapey band-passed noise plus a metallic buzz.
    this.grindGain = ctx.createGain();
    this.grindGain.gain.value = 0;
    const gf = ctx.createBiquadFilter();
    gf.type = 'bandpass';
    gf.frequency.value = 2600;
    gf.Q.value = 1.6;
    this.loopNoise(gf);
    gf.connect(this.grindGain);
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 98;
    const bg = ctx.createGain();
    bg.gain.value = 0.1;
    buzz.connect(bg).connect(this.grindGain);
    buzz.start();
    this.grindGain.connect(this.sfx);

    // Wind rush at speed.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.loopNoise(this.windFilter);
    this.windFilter.connect(this.windGain).connect(this.sfx);

    this.applyVolumes();
  }

  loopNoise(dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random();
    src.connect(dest);
    src.start(0, Math.random());
    return src;
  }

  async loadOverrides() {
    for (const [name, path] of Object.entries(SOUND_FILES)) {
      if (!path) continue;
      try {
        const res = await fetch(path);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
      } catch {
        // Missing or unreadable file: keep the synthesized sound.
      }
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime((s.sfx / 100) * 0.9, t, 0.03);
    this.musicBus.gain.setTargetAtTime((s.music / 100) * 0.55 * this.duck, t, 0.08);
    this.ambBus.gain.setTargetAtTime(s.ambience ? (s.sfx / 100) * 0.7 : 0, t, 0.2);
  }

  setDuck(level) {
    this.duck = level;
    this.applyVolumes();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    if (this.musicEl && !this.musicEl.paused) {
      this.musicEl.pause();
      this.musicPausedByHide = true;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicEl && this.musicPausedByHide) {
      this.musicPausedByHide = false;
      this.musicEl.play().catch(() => {});
    }
  }

  // --------------------------------------------------------------- music

  startMusic() {
    this.musicWanted = true;
    if (!this.ctx) return;
    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.preload = 'auto';
      this.musicEl.addEventListener('ended', () => this.nextSong());
      this.musicEl.addEventListener('error', () => {
        // Skip a missing song; give up after trying them all.
        if (++this.songFails < MUSIC_TRACKS.length) this.nextSong();
      });
      this.musicEl.addEventListener('playing', () => { this.songFails = 0; });
      try {
        this.ctx.createMediaElementSource(this.musicEl).connect(this.musicBus);
      } catch {
        // Fall back to the element's own output.
      }
      this.nextSong();
    } else if (this.musicEl.paused) {
      this.musicEl.play().catch(() => {});
    }
  }

  nextSong() {
    let i;
    do i = Math.floor(Math.random() * MUSIC_TRACKS.length);
    while (MUSIC_TRACKS.length > 1 && i === this.songIndex);
    this.songIndex = i;
    this.musicEl.src = MUSIC_TRACKS[i];
    this.musicEl.play().catch(() => {});
  }

  // -------------------------------------------------------------- loops

  // board: 'longboard' | 'hoverboard'; level 0..1 overall (0 when not riding).
  setLoops({ board, speed, grounded, grinding, level }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.min(1, speed / 40);
    const roll = board === 'longboard' && grounded && !grinding ? (0.05 + sp * 0.09) * level : 0;
    this.rollGain.gain.setTargetAtTime(roll, t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(180 + sp * 600, t, 0.1);
    const hover = board === 'hoverboard' ? (grounded ? 0.05 : 0.035) * level : 0;
    this.hoverGain.gain.setTargetAtTime(hover, t, 0.08);
    this.hoverOscs[0].frequency.setTargetAtTime(80 + sp * 70, t, 0.1);
    this.hoverOscs[1].frequency.setTargetAtTime(161 + sp * 140, t, 0.1);
    this.grindGain.gain.setTargetAtTime(grinding ? 0.16 * level : 0, t, 0.03);
    this.windGain.gain.setTargetAtTime(sp * sp * 0.07 * level, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(350 + sp * 900, t, 0.2);
  }

  // ---------------------------------------------------------- one-shots

  tone({ type = 'sine', freq = 440, end = null, dur = 0.15, gain = 0.2, attack = 0.005, delay = 0, filter = null, dest = null, vibrato = 0 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (end) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    if (vibrato) {
      const l = ctx.createOscillator();
      l.frequency.value = 6;
      const lg = ctx.createGain();
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t0);
      l.stop(t0 + dur + 0.05);
    }
    node.connect(g).connect(dest || this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.2, type = 'bandpass', freq = 1000, end = null, q = 1, attack = 0.004, delay = 0, dest = null }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (end) f.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  play(name, arg = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(name);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfx);
      src.start();
      return;
    }
    const fn = SYNTH[name];
    if (fn) fn(this, arg);
  }

  // ----------------------------------------------------------- ambience

  setAmbience(type) {
    if (!this.ctx) {
      this.pendingAmbience = type;
      return;
    }
    if (this.ambience === type) return;
    if (this.ambNodes) {
      const t = this.ctx.currentTime;
      for (const n of this.ambNodes) {
        try { n.stop(t + 0.5); } catch { /* already stopped */ }
      }
    }
    this.ambience = type;
    this.ambNodes = [];
    const ctx = this.ctx;
    const bed = (filterType, freq, q, gain, lfoRate = 0, lfoDepth = 0) => {
      const src = this.loopNoise(ctx.createGain());
      src.disconnect();
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.ambBus);
      this.ambNodes.push(src);
      if (lfoRate) {
        const l = ctx.createOscillator();
        l.frequency.value = lfoRate;
        const lg = ctx.createGain();
        lg.gain.value = lfoDepth;
        l.connect(lg).connect(g.gain);
        l.start();
        this.ambNodes.push(l);
      }
    };
    switch (type) {
      case 'evening': bed('lowpass', 420, 0.7, 0.05, 0.08, 0.03); break;
      case 'birds': bed('lowpass', 600, 0.5, 0.03, 0.1, 0.015); break;
      case 'crickets': bed('lowpass', 300, 0.5, 0.025); break;
      case 'wind': bed('bandpass', 650, 1.4, 0.09, 0.13, 0.06); break;
      case 'waves': bed('lowpass', 750, 0.6, 0.1, 0.11, 0.09); break;
      case 'forest': bed('bandpass', 1500, 0.6, 0.025, 0.2, 0.015); break;
      default: break;
    }
    this.ambTimer = 1;
  }

  updateAmbience(dt) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.ambience || !this.settings.ambience) return;
    this.ambTimer -= dt;
    if (this.ambTimer > 0) return;
    const r = Math.random();
    const A = this.ambBus;
    switch (this.ambience) {
      case 'birds':
      case 'forest': {
        const base = 2200 + Math.random() * 1800;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone({ freq: base, end: base * 1.5, dur: 0.07, gain: 0.05, delay: i * 0.1, dest: A });
        if (this.ambience === 'forest' && r < 0.2) {
          for (let i = 0; i < 10; i++) this.noise({ dur: 0.025, gain: 0.07, freq: 1800, q: 4, delay: 0.5 + i * 0.065, dest: A });
        }
        this.ambTimer = this.ambience === 'forest' ? 2 + Math.random() * 4 : 1 + Math.random() * 2.5;
        break;
      }
      case 'crickets':
        for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) this.tone({ freq: 4300 + k * 300, dur: 0.03, gain: 0.03, delay: k * 0.35 + i * 0.05, dest: A });
        this.ambTimer = 0.7 + Math.random() * 0.7;
        break;
      case 'waves': {
        // Seagull: a couple of "kyow"s.
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
          this.tone({ type: 'sawtooth', freq: 1500, end: 950, dur: 0.22, gain: 0.025, delay: i * 0.3, filter: { type: 'bandpass', freq: 1300, q: 3 }, dest: A });
        }
        this.ambTimer = 5 + Math.random() * 7;
        break;
      }
      case 'evening':
        if (r < 0.5) this.tone({ freq: 2100, end: 1300, dur: 0.7, gain: 0.03, vibrato: 20, dest: A });
        else this.tone({ type: 'square', freq: 4800, dur: 1.4, gain: 0.006, vibrato: 400, dest: A });
        this.ambTimer = 6 + Math.random() * 8;
        break;
      case 'wind':
        this.noise({ dur: 2.4, gain: 0.06, type: 'bandpass', freq: 400, end: 1100, q: 2, attack: 0.9, dest: A });
        this.ambTimer = 5 + Math.random() * 6;
        break;
      default:
        this.ambTimer = 5;
    }
  }
}

// Synthesized sound effects. arg is an optional per-call value (pitch step etc).
const SYNTH = {
  click: (a) => a.tone({ type: 'square', freq: 660, end: 990, dur: 0.06, gain: 0.08 }),
  error: (a) => {
    a.tone({ type: 'square', freq: 220, dur: 0.1, gain: 0.08 });
    a.tone({ type: 'square', freq: 180, dur: 0.14, gain: 0.08, delay: 0.11 });
  },
  jump: (a) => {
    a.tone({ type: 'triangle', freq: 320, end: 760, dur: 0.15, gain: 0.16 });
    a.noise({ dur: 0.08, gain: 0.08, type: 'highpass', freq: 2000 });
  },
  land: (a, hard) => {
    a.noise({ dur: 0.14, gain: 0.18 + (hard ? 0.12 : 0), type: 'lowpass', freq: 500 });
    a.tone({ freq: 130, end: 55, dur: 0.12, gain: 0.18 });
  },
  slide: (a) => a.noise({ dur: 0.35, gain: 0.12, type: 'lowpass', freq: 1200, end: 400 }),
  whoosh: (a) => a.noise({ dur: 0.14, gain: 0.07, type: 'bandpass', freq: 600, end: 1600, q: 1.5 }),
  coin: (a, step = 0) => {
    const k = Math.pow(2, Math.min(step, 12) / 24);
    a.tone({ type: 'square', freq: 988 * k, dur: 0.05, gain: 0.06 });
    a.tone({ type: 'square', freq: 1319 * k, dur: 0.12, gain: 0.06, delay: 0.05 });
  },
  throw: (a) => {
    a.noise({ dur: 0.14, gain: 0.14, type: 'bandpass', freq: 2200, end: 6000, q: 2 });
    a.tone({ type: 'triangle', freq: 1800, end: 2900, dur: 0.07, gain: 0.04 });
  },
  hit: (a) => {
    a.noise({ dur: 0.06, gain: 0.2, freq: 1600, q: 2 });
    a.tone({ type: 'square', freq: 240, end: 110, dur: 0.09, gain: 0.1 });
  },
  poof: (a) => {
    a.noise({ dur: 0.4, gain: 0.25, type: 'lowpass', freq: 1500, end: 180 });
    a.tone({ freq: 500, end: 1300, dur: 0.14, gain: 0.12 });
    for (let i = 0; i < 4; i++) a.tone({ type: 'triangle', freq: 1800 + i * 420, dur: 0.06, gain: 0.04, delay: 0.08 + i * 0.05 });
  },
  pop: (a) => {
    a.tone({ freq: 1000, end: 260, dur: 0.09, gain: 0.18 });
    a.noise({ dur: 0.05, gain: 0.15, type: 'highpass', freq: 1500 });
  },
  karen: (a) => {
    // An outraged "waaAAH?!" from a formant-filtered sawtooth.
    const f = 300 + Math.random() * 90;
    a.tone({ type: 'sawtooth', freq: f, end: f * 1.35, dur: 0.22, gain: 0.07, filter: { type: 'bandpass', freq: 1000, q: 4 }, vibrato: 12 });
    a.tone({ type: 'sawtooth', freq: f * 1.35, end: f * 0.8, dur: 0.38, gain: 0.07, delay: 0.2, filter: { type: 'bandpass', freq: 850, q: 4 }, vibrato: 18 });
  },
  ninja: (a) => {
    a.noise({ dur: 0.08, gain: 0.12, freq: 1300, q: 3 });
    a.tone({ type: 'sawtooth', freq: 280, end: 170, dur: 0.22, gain: 0.06, delay: 0.04, filter: { type: 'bandpass', freq: 800, q: 3 } });
  },
  bear: (a) => {
    // A deep, rumbling growl.
    a.noise({ dur: 0.6, gain: 0.2, type: 'lowpass', freq: 500, end: 150 });
    a.tone({ type: 'sawtooth', freq: 120, end: 75, dur: 0.6, gain: 0.09, filter: { type: 'lowpass', freq: 600 }, vibrato: 25 });
  },
  yeti: (a) => {
    // A long howling roar that rises then falls.
    a.noise({ dur: 0.7, gain: 0.14, type: 'bandpass', freq: 700, end: 300, q: 2 });
    a.tone({ type: 'sawtooth', freq: 160, end: 260, dur: 0.3, gain: 0.08, filter: { type: 'bandpass', freq: 700, q: 3 }, vibrato: 20 });
    a.tone({ type: 'sawtooth', freq: 260, end: 110, dur: 0.5, gain: 0.08, delay: 0.28, filter: { type: 'bandpass', freq: 600, q: 3 }, vibrato: 30 });
  },
  enemyThrow: (a) => a.tone({ freq: 1300, end: 600, dur: 0.3, gain: 0.04 }),
  splat: (a) => {
    a.noise({ dur: 0.22, gain: 0.25, type: 'lowpass', freq: 900, end: 200 });
    a.tone({ freq: 220, end: 70, dur: 0.12, gain: 0.12 });
  },
  bump: (a) => {
    a.tone({ type: 'square', freq: 170, end: 85, dur: 0.14, gain: 0.12 });
    a.noise({ dur: 0.1, gain: 0.15, type: 'lowpass', freq: 700 });
  },
  crash: (a) => {
    a.noise({ dur: 0.7, gain: 0.45, type: 'lowpass', freq: 3200, end: 160 });
    a.tone({ type: 'square', freq: 160, end: 40, dur: 0.5, gain: 0.16 });
    for (const f of [523, 787, 1210]) a.tone({ type: 'triangle', freq: f, dur: 0.45, gain: 0.05 });
  },
  fall: (a) => a.tone({ type: 'triangle', freq: 900, end: 120, dur: 0.9, gain: 0.12, vibrato: 20 }),
  gameover: (a) => {
    // Sad trombone.
    const notes = [392, 370, 349, 330];
    notes.forEach((f, i) => a.tone({ type: 'sawtooth', freq: f, end: i === 3 ? f * 0.94 : null, dur: i === 3 ? 0.9 : 0.32, gain: 0.07, delay: i * 0.34, filter: { freq: 900 }, vibrato: i === 3 ? 9 : 3 }));
  },
  powerup: (a) => [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone({ type: 'square', freq: f, dur: 0.08, gain: 0.06, delay: i * 0.055 })),
  shieldBreak: (a) => {
    a.noise({ dur: 0.3, gain: 0.2, type: 'highpass', freq: 3500 });
    for (const f of [2100, 2650, 3150]) a.tone({ type: 'triangle', freq: f, dur: 0.25, gain: 0.04 });
  },
  ramp: (a) => {
    a.tone({ type: 'sawtooth', freq: 180, end: 620, dur: 0.32, gain: 0.07, filter: { freq: 1500 } });
    a.noise({ dur: 0.3, gain: 0.08, type: 'bandpass', freq: 800, end: 2400 });
  },
  grindStart: (a) => a.noise({ dur: 0.12, gain: 0.15, freq: 3200, q: 2 }),
  trick: (a) => {
    a.tone({ freq: 700, end: 1500, dur: 0.14, gain: 0.1 });
    a.tone({ type: 'triangle', freq: 1500, dur: 0.18, gain: 0.08, delay: 0.12 });
  },
  nearMiss: (a) => a.noise({ dur: 0.25, gain: 0.12, type: 'bandpass', freq: 3000, end: 700, q: 1.2 }),
  combo: (a, level = 1) => a.tone({ type: 'triangle', freq: 440 * Math.pow(2, level / 6), dur: 0.16, gain: 0.08 }),
  beep: (a) => a.tone({ type: 'square', freq: 660, dur: 0.12, gain: 0.08 }),
  go: (a) => {
    a.tone({ type: 'square', freq: 1320, dur: 0.35, gain: 0.08 });
    a.tone({ type: 'square', freq: 990, dur: 0.35, gain: 0.05 });
  },
  mission: (a) => {
    [523, 659, 784].forEach((f, i) => a.tone({ type: 'square', freq: f, dur: 0.1, gain: 0.06, delay: i * 0.1 }));
    a.tone({ type: 'triangle', freq: 1047, dur: 0.5, gain: 0.09, delay: 0.3 });
    a.tone({ type: 'triangle', freq: 784, dur: 0.5, gain: 0.06, delay: 0.3 });
  },
  buy: (a) => [1319, 1568, 2093].forEach((f, i) => a.tone({ type: 'square', freq: f, dur: 0.08, gain: 0.06, delay: i * 0.07 })),
  chest: (a) => {
    for (let i = 0; i < 6; i++) a.tone({ type: 'square', freq: 988 * Math.pow(2, i / 6), dur: 0.08, gain: 0.05, delay: i * 0.06 });
    a.tone({ type: 'triangle', freq: 1568, dur: 0.4, gain: 0.07, delay: 0.38 });
  },
};
