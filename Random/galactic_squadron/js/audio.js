/**
 * Procedural audio with the Web Audio API: synthesized sound effects
 * (oscillators + filtered noise) and a small step-sequenced soundtrack.
 * Nothing is downloaded. If Web Audio is missing, every call is a no-op.
 */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SONGS = {
  normal: {
    bpm: 118,
    roots: [45, 41, 48, 43],          // Am  F  C  G
    minor: [true, false, false, false],
    bass: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    wave: 'triangle',
    kick: [0, 4, 8, 12],
    snare: [4, 12],
  },
  boss: {
    bpm: 136,
    roots: [38, 46, 43, 45],          // Dm  Bb  Gm  A
    minor: [true, false, true, false],
    bass: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
    wave: 'sawtooth',
    kick: [0, 3, 4, 8, 11, 12],
    snare: [4, 12],
  },
};

const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.last = Object.create(null);
    this.voices = 0;
    this.musicTimer = null;
    this.musicMode = null;
    this.wantMusic = null;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(comp).connect(ctx.destination);

      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.applySettings();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (this.wantMusic) this.startMusic(this.wantMusic);
    } catch {
      this.ctx = null;
    }
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02);
    this.musicGain.gain.setTargetAtTime(s.music * 0.55, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(s.sfx, t, 0.02);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /* ------------------------------------------------------------ synthesis */

  tone(o) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    const attack = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(o.dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    this.track(osc);
  }

  noiseBurst(o) {
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + o.dur);
    if (o.q) f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.dest || this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
    this.track(src);
  }

  track(node) {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
  }

  notes(freqs, step, o) {
    freqs.forEach((f, i) => this.tone({ ...o, freq: f, delay: (o.delay || 0) + i * step }));
  }

  /** Plays a named effect. Rate-limited per sound and globally capped to avoid mush. */
  play(name) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const gap = { shoot: 0.045, allyShoot: 0.06, enemyShoot: 0.06, hit: 0.04, coreHit: 0.05, explode: 0.03, dive: 0.25, shieldHit: 0.06, bossShoot: 0.08 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    const important = name === 'playerHit' || name === 'bossDefeat' || name === 'gameOver' || name === 'extraLife';
    if (this.voices > 40 && !important) return;
    this.last[name] = now;

    switch (name) {
      case 'shoot':
        this.tone({ type: 'square', freq: 1180, to: 520, dur: 0.07, vol: 0.05, filter: 3500 });
        this.tone({ type: 'sine', freq: 2200, to: 900, dur: 0.05, vol: 0.025 });
        break;
      case 'allyShoot':
        this.tone({ type: 'sawtooth', freq: 820, to: 260, dur: 0.09, vol: 0.035, filter: 2600 });
        break;
      case 'falcon':
        this.noiseBurst({ freq: 400, to: 4000, dur: 0.6, vol: 0.12, ftype: 'bandpass', q: 2 });
        this.notes([midi(67), midi(72), midi(76), midi(79), midi(84)], 0.09, { type: 'square', dur: 0.22, vol: 0.06, filter: 3500, delay: 0.3 });
        break;
      case 'enemyShoot':
        this.tone({ type: 'triangle', freq: 620, to: 240, dur: 0.12, vol: 0.05 });
        break;
      case 'bossShoot':
        this.tone({ type: 'sawtooth', freq: 300, to: 120, dur: 0.18, vol: 0.06, filter: 1600 });
        break;
      case 'hit':
        this.tone({ type: 'square', freq: 1600, to: 1100, dur: 0.04, vol: 0.035, filter: 4000 });
        break;
      case 'coreHit':
        this.tone({ type: 'square', freq: 900, to: 1800, dur: 0.06, vol: 0.05, filter: 5000 });
        break;
      case 'explode':
        this.noiseBurst({ freq: 2600, to: 280, dur: 0.38, vol: 0.28 });
        this.tone({ type: 'sine', freq: 150, to: 40, dur: 0.3, vol: 0.22 });
        break;
      case 'explodeBig':
        this.noiseBurst({ freq: 1800, to: 120, dur: 1.0, vol: 0.4 });
        this.tone({ type: 'sine', freq: 95, to: 28, dur: 0.9, vol: 0.4 });
        break;
      case 'playerHit':
        this.noiseBurst({ freq: 3200, to: 150, dur: 0.9, vol: 0.45 });
        this.tone({ type: 'sawtooth', freq: 440, to: 50, dur: 0.75, vol: 0.14, filter: 2000 });
        break;
      case 'shield':
        this.tone({ type: 'sine', freq: 300, to: 950, dur: 0.35, vol: 0.12, attack: 0.02 });
        this.tone({ type: 'sine', freq: 450, to: 1400, dur: 0.35, vol: 0.06, attack: 0.02 });
        break;
      case 'shieldHit':
        this.tone({ type: 'triangle', freq: 950, to: 600, dur: 0.1, vol: 0.08 });
        break;
      case 'denied':
        this.tone({ type: 'square', freq: 180, dur: 0.08, vol: 0.04, filter: 1200 });
        break;
      case 'powerup':
        this.notes([midi(72), midi(76), midi(79), midi(84)], 0.055, { type: 'square', dur: 0.09, vol: 0.05, filter: 4000 });
        break;
      case 'powerDown':
        this.notes([midi(79), midi(72)], 0.07, { type: 'triangle', dur: 0.1, vol: 0.05 });
        break;
      case 'extraLife':
        this.notes([midi(79), midi(83), midi(86), midi(91)], 0.09, { type: 'square', dur: 0.16, vol: 0.06, filter: 4000 });
        break;
      case 'waveStart':
        this.notes([midi(67), midi(72), midi(76), midi(79)], 0.08, { type: 'triangle', dur: 0.18, vol: 0.09 });
        break;
      case 'stageClear':
        this.notes([midi(72), midi(76), midi(79), midi(84), midi(88)], 0.07, { type: 'square', dur: 0.2, vol: 0.05, filter: 3000 });
        break;
      case 'dive':
        this.tone({ type: 'sine', freq: 1500, to: 480, dur: 0.35, vol: 0.03 });
        break;
      case 'launch':
        this.noiseBurst({ freq: 600, to: 3000, dur: 0.25, vol: 0.08, ftype: 'bandpass', q: 3 });
        break;
      case 'bossAlarm':
        for (let i = 0; i < 4; i++) {
          this.tone({ type: 'sawtooth', freq: 660, dur: 0.28, vol: 0.07, filter: 1800, delay: i * 0.6 });
          this.tone({ type: 'sawtooth', freq: 440, dur: 0.28, vol: 0.07, filter: 1800, delay: i * 0.6 + 0.3 });
        }
        break;
      case 'bossPhase':
        this.noiseBurst({ freq: 1500, to: 200, dur: 0.7, vol: 0.35 });
        this.tone({ type: 'sawtooth', freq: 220, to: 110, dur: 0.6, vol: 0.08, filter: 1200 });
        break;
      case 'laserCharge':
        this.tone({ type: 'sawtooth', freq: 90, to: 520, dur: 1.1, vol: 0.06, attack: 0.3, filter: 2500 });
        break;
      case 'laserFire':
        this.noiseBurst({ freq: 1200, dur: 1.1, vol: 0.18, ftype: 'bandpass', q: 1.5, attack: 0.02 });
        this.tone({ type: 'sawtooth', freq: 70, to: 60, dur: 1.1, vol: 0.1, filter: 900 });
        break;
      case 'bossDefeat':
        this.play('explodeBig');
        this.notes([midi(72), midi(76), midi(79), midi(84)], 0.12, { type: 'triangle', dur: 0.5, vol: 0.1, delay: 0.6 });
        break;
      case 'gameOver':
        this.notes([midi(72), midi(70), midi(68), midi(65), midi(60)], 0.2, { type: 'triangle', dur: 0.35, vol: 0.1 });
        break;
      case 'click':
        this.tone({ type: 'square', freq: 880, to: 1320, dur: 0.05, vol: 0.03, filter: 4000 });
        break;
    }
  }

  /* ---------------------------------------------------------------- music */

  startMusic(mode) {
    this.wantMusic = mode;
    if (!this.ctx) return;
    if (this.musicMode !== mode) {
      this.musicMode = mode;
      this.step = 0;
    }
    if (this.musicTimer) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = this.step || 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic() {
    this.wantMusic = null;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const song = SONGS[this.musicMode] || SONGS.normal;
    const stepDur = 60 / song.bpm / 4;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(song, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(song, step, t, stepDur) {
    const ctx = this.ctx;
    const out = this.musicGain;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = song.roots[bar];
    const chord = song.minor[bar] ? [0, 3, 7, 12] : [0, 4, 7, 12];

    const voice = (type, freq, dur, vol, filter) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        osc.connect(f);
        node = f;
      }
      node.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };

    if (song.bass[s]) voice(song.wave, midi(root + (s % 8 === 6 ? 12 : 0)), stepDur * 0.9, 0.16, 700);
    voice('triangle', midi(root + 24 + chord[ARP[s % 8]]), stepDur * 0.8, 0.045);
    if (s === 0) {
      for (const iv of chord.slice(0, 3)) voice('sawtooth', midi(root + 12 + iv), stepDur * 14, 0.025, 900);
    }

    if (song.kick.includes(s)) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    const hat = s % 2 === 1;
    const snare = song.snare.includes(s);
    if (hat || snare) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = snare ? 'bandpass' : 'highpass';
      f.frequency.value = snare ? 1800 : 7000;
      const g = ctx.createGain();
      const dur = snare ? 0.14 : 0.035;
      g.gain.setValueAtTime(snare ? 0.14 : 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }
  }
}
