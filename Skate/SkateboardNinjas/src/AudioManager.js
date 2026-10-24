// All sound is synthesized with the Web Audio API: no audio files to load or
// license. The context is created on the first user gesture (browser autoplay
// rules), and SFX and music can be toggled separately.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// A-minor-ish loop: A, F, G, E roots; bass offsets per 16th step.
const BASS_ROOTS = [45, 41, 43, 40];
const BASS_STEPS = [0, null, null, 0, null, null, 7, null, 12, null, null, 0, null, null, 10, null];
const KICK = new Set([0, 7, 10]);
const BPM = 100;

export class AudioManager {
  constructor(storage) {
    this.storage = storage;
    this.ctx = null;
    this.sfxOn = storage.get('sfx', true);
    this.musicOn = storage.get('music', true);
    this.quiet = false; // silences SFX during the title-screen demo
    this.music = { playing: false, next: 0, step: 0 };
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
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  build() {
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.4 : 0;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Continuous loops: wheels rolling and rail grinding.
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass';
    rollFilter.frequency.value = 320;
    this.loopNoise(rollFilter);
    rollFilter.connect(this.rollGain).connect(this.sfx);

    this.grindGain = ctx.createGain();
    this.grindGain.gain.value = 0;
    const grindFilter = ctx.createBiquadFilter();
    grindFilter.type = 'bandpass';
    grindFilter.frequency.value = 2400;
    grindFilter.Q.value = 1.4;
    this.loopNoise(grindFilter);
    grindFilter.connect(this.grindGain);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 96;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.12;
    hum.connect(humGain).connect(this.grindGain);
    hum.start();
    this.grindGain.connect(this.sfx);
  }

  loopNoise(dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.connect(dest);
    src.start();
  }

  setSfx(on) {
    this.sfxOn = on;
    this.storage.set('sfx', on);
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    this.storage.set('music', on);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.4 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // level: 0..1 rolling noise; grinding: on/off.
  setLoops(rollLevel, grinding) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const quiet = this.quiet ? 0 : 1;
    this.rollGain.gain.setTargetAtTime(0.09 * rollLevel * quiet, t, 0.05);
    this.grindGain.gain.setTargetAtTime(grinding ? 0.2 * quiet : 0, t, 0.03);
  }

  // ------------------------------------------------------------ one-shots

  play(name, arg = 0) {
    if (!this.ctx || !this.sfxOn || this.quiet || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'ollie':
        this.noise(t, 0.05, 0.5, 'highpass', 1800);
        this.tone(t, 'sine', 190, 60, 0.1, 0.6);
        break;
      case 'land':
        this.tone(t, 'sine', 120, 45, 0.14, 0.7);
        this.noise(t, 0.09, 0.35, 'lowpass', 900);
        break;
      case 'flip':
        this.noise(t, 0.2, 0.32, 'bandpass', 700, 3400);
        break;
      case 'grab':
        this.noise(t, 0.16, 0.28, 'bandpass', 400, 1500);
        break;
      case 'grind':
        this.noise(t, 0.08, 0.4, 'bandpass', 3200);
        this.tone(t, 'square', 950, 720, 0.06, 0.08);
        break;
      case 'crash':
        this.noise(t, 0.45, 0.7, 'lowpass', 1800, 180);
        this.tone(t, 'square', 230, 55, 0.35, 0.15);
        break;
      case 'karen':
        this.karenVoice(t);
        break;
      case 'bank':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.055, 'triangle', f, f, 0.14, 0.22));
        break;
      case 'action': {
        const f = 440 * Math.pow(2, Math.min(arg, 12) / 12);
        this.tone(t, 'triangle', f, f * 1.5, 0.09, 0.16);
        break;
      }
      case 'combo':
        [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.04, 'square', f, f, 0.08, 0.08));
        break;
      case 'nearMiss':
        this.noise(t, 0.14, 0.25, 'bandpass', 1200, 5000);
        this.tone(t, 'triangle', 880, 1760, 0.1, 0.12);
        break;
      case 'lost':
        this.tone(t, 'sawtooth', 300, 120, 0.3, 0.12);
        break;
      case 'beep':
        this.tone(t, 'square', 660, 660, 0.12, 0.15);
        break;
      case 'go':
        this.tone(t, 'square', 990, 990, 0.32, 0.17);
        break;
      case 'timeUp':
        this.tone(t, 'square', 440, 220, 0.5, 0.18);
        this.tone(t + 0.05, 'sawtooth', 330, 165, 0.5, 0.1);
        break;
      case 'results':
        [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.1, 'triangle', f, f, 0.18, 0.2));
        break;
      case 'poof':
        this.noise(t, 0.3, 0.3, 'lowpass', 2000, 300);
        break;
      case 'click':
        this.tone(t, 'square', 1200, 1200, 0.03, 0.08);
        break;
    }
  }

  env(gain, t, vol, dur) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(vol, t + 0.006);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(t, type, f0, f1, dur, vol, dest = this.sfx) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(t, dur, vol, type, f0, f1 = f0, dest = this.sfx) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
  }

  // A squawky "wah-WAH-wah!" complaint.
  karenVoice(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2.5;
    const g = ctx.createGain();
    const base = 300 + Math.random() * 60;
    const syllables = [1, 1.35, 0.85];
    g.gain.setValueAtTime(0.0001, t);
    syllables.forEach((m, i) => {
      const s = t + i * 0.13;
      o.frequency.setValueAtTime(base * m, s);
      o.frequency.linearRampToValueAtTime(base * m * 0.9, s + 0.11);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.03, s + 0.11);
    });
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.45);
  }

  // ------------------------------------------------------------ music

  startMusic() {
    if (!this.ctx) return;
    this.music.playing = true;
    this.music.next = this.ctx.currentTime + 0.08;
    this.music.step = 0;
  }

  stopMusic() {
    this.music.playing = false;
  }

  // Look-ahead scheduler; call every frame.
  update() {
    const m = this.music;
    if (!this.ctx || !m.playing || !this.musicOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (m.next < now - 0.1) m.next = now + 0.05; // recovered from a stall or suspend
    const stepLen = 60 / BPM / 4;
    while (m.next < now + 0.15) {
      this.scheduleStep(m.step, m.next);
      m.next += stepLen;
      m.step = (m.step + 1) % 64;
    }
  }

  scheduleStep(step, t) {
    const pos = step % 16;
    const bar = step >> 4;
    const bus = this.musicBus;
    if (KICK.has(pos)) this.tone(t, 'sine', 150, 42, 0.16, 0.9, bus);
    if (pos === 4 || pos === 12) {
      this.noise(t, 0.13, 0.45, 'highpass', 1400, 1400, bus);
      this.tone(t, 'triangle', 200, 150, 0.08, 0.25, bus);
    }
    if (pos % 2 === 0) this.noise(t, pos === 14 ? 0.12 : 0.03, 0.12, 'highpass', 7000, 7000, bus);
    const off = BASS_STEPS[pos];
    if (off !== null) {
      const f = midi(BASS_ROOTS[bar] + off - 12);
      this.tone(t, 'triangle', f, f, 0.2, 0.42, bus);
    }
    if (pos === 2 || pos === 10) {
      const root = BASS_ROOTS[bar] + 12;
      const third = bar === 3 ? 4 : 3; // E major on the turnaround
      for (const iv of [0, third, 7]) {
        const f = midi(root + iv);
        this.tone(t, 'square', f, f, 0.09, 0.035, bus);
      }
    }
  }
}
