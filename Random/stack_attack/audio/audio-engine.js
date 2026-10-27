/**
 * Stack Attack audio engine.
 *
 * Plays each theme's music and sound effects as described in
 * audio/audio-config.js. Everything is synthesized with the Web Audio API
 * (no downloads) unless a theme points to audio files in its `files` block.
 * You normally never need to edit this file: see audio/README.md.
 *
 * Exposes window.StackAttackAudio (a class). If Web Audio is unavailable,
 * every method is a harmless no-op.
 */
(() => {
  'use strict';

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
    majorPentatonic: [0, 2, 4, 7, 9],
    minorPentatonic: [0, 3, 5, 7, 10],
    blues: [0, 3, 5, 6, 7, 10],
    hirajoshi: [0, 2, 3, 7, 8],
    insen: [0, 1, 5, 7, 10],
    wholeTone: [0, 2, 4, 6, 8, 10],
  };

  const NOTE_INDEX = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };

  const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
  const DRUMS = ['kick', 'snare', 'hat', 'clap', 'tom', 'taiko', 'wood', 'bell', 'shaker'];
  const SFX_EVENTS = ['move', 'rotate', 'hold', 'hardDrop', 'lock', 'clear1', 'clear2', 'clear3',
    'clear4', 'levelUp', 'gameOver', 'denied', 'start', 'pause', 'select'];

  const arp = (degs, gap = 0.06, oct = 0) => degs.map((deg, i) => ({
    deg, oct, at: i * gap, dur: i === degs.length - 1 ? 0.25 : gap * 1.4, vol: 0.25,
  }));

  // Built-in sound effect recipes. Degrees follow the theme's key and scale,
  // so every theme sounds different without extra configuration.
  const DEFAULT_SFX = {
    move: [{ deg: 1, dur: 0.03, vol: 0.16 }],
    rotate: [{ deg: 5, dur: 0.05, vol: 0.2, slide: 1.15 }],
    hold: [{ deg: 3, dur: 0.05, vol: 0.22 }, { deg: 6, at: 0.05, dur: 0.07, vol: 0.22 }],
    hardDrop: [{ freq: 600, dur: 0.12, vol: 0.3, wave: 'sine', slide: 0.15 }, { drum: 'kick', vol: 0.8 }],
    lock: [{ freq: 160, dur: 0.06, vol: 0.28, wave: 'sine', slide: 0.6 },
      { noise: true, dur: 0.03, vol: 0.1, filter: 1800 }],
    clear1: arp([1, 3, 5]),
    clear2: arp([1, 3, 5, 8]),
    clear3: arp([1, 3, 5, 8, 10]),
    clear4: [...arp([1, 3, 5, 8, 10, 12], 0.06),
      { deg: 8, at: 0.4, dur: 0.5, vol: 0.18 }, { deg: 10, at: 0.4, dur: 0.5, vol: 0.18 },
      { deg: 12, at: 0.4, dur: 0.5, vol: 0.18 }],
    levelUp: arp([1, 2, 3, 5, 8, 10], 0.055, 1),
    gameOver: [{ deg: 8, oct: -1, dur: 0.2, vol: 0.28 }, { deg: 5, oct: -1, at: 0.22, dur: 0.2, vol: 0.28 },
      { deg: 3, oct: -1, at: 0.44, dur: 0.2, vol: 0.28 },
      { deg: 1, oct: -1, at: 0.66, dur: 0.7, vol: 0.3, slide: 0.94, pluck: false }],
    denied: [{ freq: 130, dur: 0.07, vol: 0.18, wave: 'square' },
      { freq: 110, at: 0.08, dur: 0.09, vol: 0.18, wave: 'square' }],
    start: arp([1, 5, 8], 0.08),
    pause: [{ deg: 5, dur: 0.06, vol: 0.2 }, { deg: 1, at: 0.07, dur: 0.09, vol: 0.2 }],
    select: [{ deg: 8, dur: 0.05, vol: 0.16 }],
  };

  const PART_DEFAULTS = { wave: 'triangle', octave: 4, volume: 0.2, follow: 'chord' };

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const cleanPattern = (p) => String(p || '').replace(/[\s|]/g, '');

  /** '1'-'9' → 1-9, 'A'-'F' → 10-15, anything else → null. */
  function degreeOf(ch) {
    if (ch >= '1' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'A' && ch <= 'F') return ch.charCodeAt(0) - 55;
    return null;
  }

  function noteFreq(key, scaleName, octave, idx) {
    const scale = SCALES[scaleName] || SCALES.major;
    const len = scale.length;
    const oct = Math.floor(idx / len);
    const semis = scale[((idx % len) + len) % len] + 12 * oct;
    const root = NOTE_INDEX[key] !== undefined ? NOTE_INDEX[key] : 0;
    return midiToFreq(12 * (octave + 1) + root + semis);
  }

  class StackAttackAudio {
    constructor(config) {
      this.config = config || { defaults: {}, themes: {} };
      this.ctx = null;
      this.themeId = null;
      this.theme = null;
      this.musicVol = 0.6;
      this.sfxVol = 0.8;
      this.muted = false;
      this.wantMusic = false;
      this.timer = 0;
      this.step = 0;
      this.tempo = 1;
      this.session = null;
      this.lastPlayed = {};
      this.files = new Map();
      this.musicEl = null;
      this.waves = new Map();
    }

    get unlocked() {
      return !!this.ctx;
    }

    /** Must be called from a user gesture (browsers block audio before one). */
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.attach(new AC());
      } catch (e) {
        this.ctx = null;
      }
    }

    /** Builds the mixer on a context (an OfflineAudioContext works too). */
    attach(ctx) {
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);

      // Shared echo for parts that ask for it.
      this.echoIn = ctx.createGain();
      this.delay = ctx.createDelay(2);
      this.feedback = ctx.createGain();
      this.feedback.gain.value = 0.35;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2800;
      this.echoIn.connect(this.delay);
      this.delay.connect(damp);
      damp.connect(this.feedback);
      this.feedback.connect(this.delay);
      damp.connect(this.musicBus);

      const len = Math.floor(ctx.sampleRate);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.applyVolumes();
      this.updateDelay();
      if (this.wantMusic) this.startMusic();
    }

    // ---- theme ----

    setTheme(id) {
      const changed = id !== this.themeId;
      this.themeId = id;
      this.theme = this.resolve(id);
      // Start loading any audio files now so a missing one is detected early.
      Object.values(this.theme.files).forEach((src) => this.file(src));
      this.applyVolumes();
      this.updateDelay();
      if (changed && this.wantMusic) {
        this.stopMusicNow();
        this.step = 0;
        this.startMusic();
      }
    }

    resolve(id) {
      const d = this.config.defaults || {};
      const themes = this.config.themes || {};
      const t = themes[id] || {};
      const music = { ...(d.music || {}), ...(t.music || {}) };
      const sfx = {
        key: music.key, scale: music.scale,
        ...(d.sfx || {}), ...(t.sfx || {}),
        overrides: { ...((d.sfx || {}).overrides || {}), ...((t.sfx || {}).overrides || {}) },
      };
      const parts = Object.entries(music.parts || {}).map(([name, p]) => ({
        name, p: { ...PART_DEFAULTS, ...p }, pat: cleanPattern(p && p.pattern),
      })).filter((x) => x.pat.length);
      const drums = Object.entries(music.drums || {})
        .filter(([kind]) => DRUMS.includes(kind))
        .map(([kind, v]) => {
          const o = typeof v === 'string' ? { pattern: v } : (v || {});
          return { kind, pat: cleanPattern(o.pattern), volume: o.volume ?? 1, pitch: o.pitch ?? 1 };
        })
        .filter((x) => x.pat.length);
      return { music, sfx, parts, drums, files: { ...(t.files || {}) }, fileVolume: t.fileVolume ?? 1 };
    }

    // ---- volume / transport ----

    setVolumes({ music, sfx, muted }) {
      if (music !== undefined) this.musicVol = clamp01(music);
      if (sfx !== undefined) this.sfxVol = clamp01(sfx);
      if (muted !== undefined) this.muted = !!muted;
      this.applyVolumes();
    }

    applyVolumes() {
      const themeVol = this.theme ? (this.theme.music.volume ?? 1) : 1;
      if (this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.02);
        this.musicBus.gain.setTargetAtTime(0.7 * this.musicVol * this.musicVol * themeVol, t, 0.02);
        this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.02);
      }
      if (this.musicEl) {
        this.musicEl.volume = this.muted ? 0 : clamp01(this.musicVol * (this.theme ? this.theme.fileVolume : 1));
      }
    }

    /** Music speeds up a little as the level rises (factor 1 = normal). */
    setTempo(factor) {
      if (Math.abs(factor - this.tempo) < 0.001) return;
      this.tempo = factor;
      this.updateDelay();
    }

    /** Tempo for a game level, using the theme's levelSpeedup. */
    setLevel(level) {
      const k = this.theme ? (this.theme.music.levelSpeedup ?? 0.015) : 0.015;
      this.setTempo(1 + Math.min(0.3, Math.max(0, level - 1) * k));
    }

    updateDelay() {
      if (this.ctx && this.theme) {
        this.delay.delayTime.setTargetAtTime(Math.min(1.9, this.stepDur() * 3), this.ctx.currentTime, 0.05);
      }
    }

    stepDur() {
      const bpm = ((this.theme && this.theme.music.bpm) || 120) * this.tempo;
      return 60 / bpm / 4;
    }

    playMusic() {
      this.wantMusic = true;
      this.startMusic();
    }

    stopMusic() {
      this.wantMusic = false;
      this.stopMusicNow();
    }

    /** Next playMusic() starts the song from the top. */
    rewindMusic() {
      this.step = 0;
      if (this.musicEl) {
        try {
          this.musicEl.currentTime = 0;
        } catch (e) {
          // not seekable yet
        }
      }
    }

    suspend() {
      if (this.ctx && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend();
      if (this.musicEl) this.musicEl.pause();
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      if (this.wantMusic && this.musicEl) this.musicEl.play().catch(() => {});
    }

    startMusic() {
      if (!this.ctx || !this.theme) return;
      const file = this.theme.files.music;
      if (file && !this.file(file).failed) {
        this.playMusicFile(file);
        return;
      }
      if (this.timer) return;
      this.session = this.ctx.createGain();
      this.session.connect(this.musicBus);
      this.nextTime = this.ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.pump(), 25);
      this.pump();
    }

    stopMusicNow() {
      clearInterval(this.timer);
      this.timer = 0;
      if (this.session && this.ctx) {
        const s = this.session;
        s.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
        setTimeout(() => s.disconnect(), 400);
        this.session = null;
      }
      if (this.musicEl) this.musicEl.pause();
    }

    pump() {
      const now = this.ctx.currentTime;
      if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;   // recover after a stall
      while (this.nextTime < now + 0.15) {
        this.scheduleStep(this.step, this.nextTime, this.session);
        this.nextTime += this.stepDur();
        this.step++;
      }
    }

    // ---- sequencer ----

    scheduleStep(step, t, out) {
      const m = this.theme.music;
      const sd = this.stepDur();
      const barLen = m.stepsPerBar || 16;
      const prog = m.progression && m.progression.length ? m.progression : [1];
      const chordRoot = prog[Math.floor(step / barLen) % prog.length];
      const tt = t + (step % 2 ? (m.swing || 0) * sd : 0);

      for (const part of this.theme.parts) {
        const pat = part.pat;
        const deg = degreeOf(pat[step % pat.length]);
        if (deg === null) continue;
        let ties = 0;
        while (ties < pat.length - 1 && pat[(step + 1 + ties) % pat.length] === '-') ties++;
        const dur = (1 + ties) * sd * (part.p.gate ?? m.gate ?? 0.85);
        const degs = part.p.chord ? [deg, deg + 2, deg + 4] : [deg];
        for (const d of degs) {
          const f = noteFreq(m.key, m.scale, part.p.octave, this.degreeIndex(d, part.p.follow, chordRoot));
          this.voice(tt, f, dur, part.p, out, 1 / Math.sqrt(degs.length));
        }
      }
      for (const d of this.theme.drums) {
        const ch = d.pat[step % d.pat.length];
        if (ch === 'x' || ch === 'X') this.drum(d.kind, tt, (ch === 'X' ? 1.3 : 1) * d.volume, d.pitch, out);
      }
    }

    /** Chord-following parts are built on the bar's chord root, kept within half an octave. */
    degreeIndex(d, follow, chordRoot) {
      if (follow === 'key') return d - 1;
      const len = (SCALES[this.theme.music.scale] || SCALES.major).length;
      let root = chordRoot - 1;
      if (root > len / 2) root -= len;
      return root + d - 1;
    }

    // ---- synthesis ----

    voice(t, freq, dur, p, out, scale = 1) {
      const ctx = this.ctx;
      const vol = (p.volume ?? 0.2) * scale;
      if (vol <= 0 || !out) return;
      const a = p.attack ?? 0.005;
      const r = p.release ?? 0.06;
      const hold = Math.max(a, dur);
      const end = t + hold + r + 0.05;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(vol, t + a);
      if (p.pluck) {
        env.gain.exponentialRampToValueAtTime(0.0001, t + hold + r);
      } else {
        env.gain.setValueAtTime(vol, t + hold);
        env.gain.exponentialRampToValueAtTime(0.0001, t + hold + r);
      }

      let node = env;
      if (p.filter) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = p.filter;
        f.Q.value = p.q ?? 0.8;
        env.connect(f);
        node = f;
      }
      node.connect(out);
      if (p.echo && out !== this.sfxBus) {
        const send = ctx.createGain();
        send.gain.value = p.echo;
        node.connect(send);
        send.connect(this.echoIn);
      }

      const oscs = [this.osc(p.wave, freq, t, end)];
      if (p.detune) {
        const o2 = this.osc(p.wave, freq, t, end);
        o2.detune.value = p.detune;
        oscs.push(o2);
      }
      for (const o of oscs) {
        if (p.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * p.slide), t + hold);
        o.connect(env);
      }
      if (p.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = p.vibratoRate || 5.5;
        const depth = ctx.createGain();
        depth.gain.value = freq * (Math.pow(2, p.vibrato / 1200) - 1);
        lfo.connect(depth);
        for (const o of oscs) depth.connect(o.frequency);
        lfo.start(t);
        lfo.stop(end);
      }
    }

    osc(wave, freq, t, end) {
      const o = this.ctx.createOscillator();
      if (Array.isArray(wave)) o.setPeriodicWave(this.periodic(wave));
      else o.type = WAVES.includes(wave) ? wave : 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.start(t);
      o.stop(end);
      return o;
    }

    /** Custom tone from harmonic strengths, e.g. [1, 0.5, 0.25]. */
    periodic(harmonics) {
      const key = harmonics.join(',');
      let w = this.waves.get(key);
      if (!w) {
        const real = new Float32Array(harmonics.length + 1);
        const imag = new Float32Array(harmonics.length + 1);
        harmonics.forEach((h, i) => { imag[i + 1] = h; });
        w = this.ctx.createPeriodicWave(real, imag);
        this.waves.set(key, w);
      }
      return w;
    }

    sweep(t, f0, f1, dur, vol, type, out) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    noiseHit(t, dur, vol, filterType, freq, out) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }

    drum(kind, t, vol = 1, pitch = 1, out = this.sfxBus) {
      if (!out) return;
      switch (kind) {
        case 'kick':
          this.sweep(t, 150 * pitch, 45 * pitch, 0.18, 0.9 * vol, 'sine', out);
          break;
        case 'snare':
          this.noiseHit(t, 0.16, 0.42 * vol, 'highpass', 1400 * pitch, out);
          this.sweep(t, 220 * pitch, 160 * pitch, 0.08, 0.3 * vol, 'triangle', out);
          break;
        case 'hat':
          this.noiseHit(t, 0.045, 0.2 * vol, 'highpass', 7500 * pitch, out);
          break;
        case 'clap':
          for (let i = 0; i < 3; i++) {
            this.noiseHit(t + i * 0.012, i === 2 ? 0.14 : 0.03, 0.32 * vol, 'bandpass', 1600 * pitch, out);
          }
          break;
        case 'tom':
          this.sweep(t, 180 * pitch, 90 * pitch, 0.22, 0.6 * vol, 'sine', out);
          break;
        case 'taiko':
          this.sweep(t, 95 * pitch, 50 * pitch, 0.45, 1 * vol, 'sine', out);
          this.noiseHit(t, 0.1, 0.3 * vol, 'lowpass', 900 * pitch, out);
          break;
        case 'wood':
          this.sweep(t, 1100 * pitch, 900 * pitch, 0.05, 0.35 * vol, 'sine', out);
          this.noiseHit(t, 0.02, 0.12 * vol, 'bandpass', 2500 * pitch, out);
          break;
        case 'bell':
          for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.018, 0.07, 0.14 * vol, 'bandpass', 8500 * pitch, out);
          this.sweep(t, 2637 * pitch, 2600 * pitch, 0.15, 0.05 * vol, 'sine', out);
          break;
        case 'shaker':
          this.noiseHit(t, 0.06, 0.16 * vol, 'bandpass', 5500 * pitch, out);
          break;
        default:
          break;
      }
    }

    // ---- sound effects ----

    play(name) {
      if (!this.ctx || !this.theme || this.muted || this.sfxVol <= 0) return;
      const ms = performance.now();
      if (ms - (this.lastPlayed[name] || 0) < 30) return;     // avoid machine-gun repeats
      this.lastPlayed[name] = ms;

      const file = this.theme.files[name];
      if (file && !this.file(file).failed) {
        this.playFile(file, this.sfxVol * this.theme.fileVolume);
        return;
      }
      const recipe = this.theme.sfx.overrides[name] || DEFAULT_SFX[name];
      if (!recipe) return;
      const s = this.theme.sfx;
      const t0 = this.ctx.currentTime + 0.005;
      for (const n of recipe) {
        const at = t0 + (n.at || 0);
        if (n.drum) {
          this.drum(n.drum, at, n.vol ?? 1, n.pitch ?? 1, this.sfxBus);
        } else if (n.noise) {
          this.noiseHit(at, n.dur || 0.05, n.vol ?? 0.3, n.filterType || 'bandpass', n.filter || 2000, this.sfxBus);
        } else {
          const freq = n.freq || noteFreq(s.key, s.scale, (s.octave ?? 5) + (n.oct || 0), (n.deg || 1) - 1);
          this.voice(at, freq, n.dur || 0.06, {
            wave: n.wave || s.wave || 'square',
            volume: (n.vol ?? 0.3) * (s.volume ?? 1),
            attack: 0.003,
            release: n.release ?? 0.05,
            slide: n.slide,
            pluck: n.pluck ?? true,
            filter: n.filter ?? s.filter,
            vibrato: n.vibrato,
          }, this.sfxBus);
        }
      }
    }

    // ---- audio files (optional overrides) ----

    file(src) {
      let entry = this.files.get(src);
      if (!entry) {
        const el = new Audio();
        el.preload = 'auto';
        entry = { el, failed: false };
        el.addEventListener('error', () => {
          entry.failed = true;
          console.warn(`[Stack Attack audio] Could not load "${src}". Using the built-in synth instead.`);
          if (this.musicEl === el) {
            this.musicEl = null;
            if (this.wantMusic) this.startMusic();
          }
        });
        el.src = src;
        this.files.set(src, entry);
      }
      return entry;
    }

    playFile(src, vol) {
      const el = this.file(src).el.cloneNode();
      el.volume = clamp01(vol);
      el.play().catch(() => {});
    }

    playMusicFile(src) {
      const el = this.file(src).el;
      if (this.musicEl && this.musicEl !== el) this.musicEl.pause();
      this.musicEl = el;
      el.loop = true;
      this.applyVolumes();
      el.play().catch(() => {});
    }

    // ---- config checking ----

    /** Returns human-readable problems in a config (also logged at startup). */
    static validate(config) {
      const out = [];
      const themes = (config && config.themes) || {};
      const checkPattern = (where, pat, allowed) => {
        const bad = [...cleanPattern(pat)].filter((c) => !allowed.test(c));
        if (bad.length) out.push(`${where}: unknown pattern character(s) "${[...new Set(bad)].join('')}"`);
      };
      for (const [id, t] of Object.entries(themes)) {
        const m = { ...((config.defaults || {}).music || {}), ...(t.music || {}) };
        if (m.scale && !SCALES[m.scale]) out.push(`${id}.music.scale: unknown scale "${m.scale}"`);
        if (m.key && NOTE_INDEX[m.key] === undefined) out.push(`${id}.music.key: unknown key "${m.key}"`);
        for (const [name, p] of Object.entries(m.parts || {})) {
          checkPattern(`${id}.music.parts.${name}`, p && p.pattern, /[1-9A-F.-]/);
          if (p && p.wave && !Array.isArray(p.wave) && !WAVES.includes(p.wave)) {
            out.push(`${id}.music.parts.${name}.wave: unknown wave "${p.wave}"`);
          }
        }
        for (const [kind, v] of Object.entries(m.drums || {})) {
          if (!DRUMS.includes(kind)) out.push(`${id}.music.drums: unknown drum "${kind}" (use ${DRUMS.join(', ')})`);
          checkPattern(`${id}.music.drums.${kind}`, typeof v === 'string' ? v : v && v.pattern, /[xX.]/);
        }
        for (const ev of Object.keys(((t.sfx || {}).overrides) || {})) {
          if (!SFX_EVENTS.includes(ev)) out.push(`${id}.sfx.overrides: unknown event "${ev}"`);
        }
        for (const ev of Object.keys(t.files || {})) {
          if (ev !== 'music' && !SFX_EVENTS.includes(ev)) out.push(`${id}.files: unknown event "${ev}"`);
        }
      }
      return out;
    }
  }

  StackAttackAudio.SCALES = SCALES;
  StackAttackAudio.DRUMS = DRUMS;
  StackAttackAudio.SFX_EVENTS = SFX_EVENTS;
  StackAttackAudio.DEFAULT_SFX = DEFAULT_SFX;
  window.StackAttackAudio = StackAttackAudio;
})();
