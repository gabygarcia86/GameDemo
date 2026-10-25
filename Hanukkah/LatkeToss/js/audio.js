// Web Audio sound effects. Every sound is synthesized, so the game needs no audio files.
//
// To use recorded sounds instead, put files in an `audio/` folder and fill in the paths
// below (relative to index.html). Any entry with a path is loaded on first interaction
// and played in place of its synthesized version; entries left as null keep the synth.
export const AUDIO_FILES = {
  launch: null, // e.g. './audio/whoosh.mp3'
  splash: null,
  miss: null,
  rim: null,
  click: null,
  tick: null,
  go: null,
  gameOver: null,
  newBest: null,
  dreidel: null,
  coin: null,
  candle: null,
  miracle: null,
};

// Looping background music (paths relative to index.html). One gameplay track is picked at
// random each round.
export const MUSIC = {
  menu: './assets/music/Music_Menu_01.mp3',
  gameplay: ['./assets/music/Music_Gameplay_01.mp3', './assets/music/Music_Gameplay_02.mp3'],
  volume: 0.4,
  fadeSeconds: 0.5,
};

const MUTE_KEY = 'latkeToss.muted';

/**
 * Streams looping music through <audio> elements, with short fades between tracks.
 * Browsers block audible playback until a user gesture, so a requested track is
 * remembered and started by unlock().
 */
class MusicPlayer {
  constructor(muted) {
    this.elements = new Map();
    this.failed = new Set();
    this.current = null;
    this.muted = muted;
    this.unlocked = false;
    this.paused = false;
    document.addEventListener('visibilitychange', () => {
      if (!this.current) return;
      if (document.hidden) this.current.pause();
      else if (!this.paused) this._start(this.current);
    });
  }

  _element(url) {
    let element = this.elements.get(url);
    if (!element) {
      element = new Audio(url);
      element.loop = true;
      element.preload = 'auto';
      element.volume = 0;
      element.muted = this.muted;
      element.addEventListener('error', () => {
        this.failed.add(url);
        // A missing gameplay track falls back to another one.
        if (this.current === element && MUSIC.gameplay.includes(url)) this.playGameplay();
      });
      this.elements.set(url, element);
    }
    return element;
  }

  _fade(element, target, onDone) {
    clearInterval(element._fadeTimer);
    const start = element.volume;
    const startTime = performance.now();
    const duration = MUSIC.fadeSeconds * 1000;
    element._fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      element.volume = start + (target - start) * t;
      if (t >= 1) {
        clearInterval(element._fadeTimer);
        if (onDone) onDone();
      }
    }, 30);
  }

  _start(element) {
    if (!this.unlocked || this.paused || document.hidden) return;
    element.play().catch(() => {
      // Playback refused (no gesture yet) or the file is unavailable; stay silent.
    });
    this._fade(element, MUSIC.volume);
  }

  play(url) {
    // Asking for a track (e.g. restarting from the pause menu) also ends any pause.
    this.paused = false;
    const next = this._element(url);
    if (this.current === next) {
      if (next.paused) this._start(next);
      return;
    }
    const previous = this.current;
    if (previous) this._fade(previous, 0, () => previous.pause());
    this.current = next;
    next.currentTime = 0;
    next.volume = 0;
    this._start(next);
  }

  playMenu() {
    this.play(MUSIC.menu);
  }

  playGameplay() {
    const options = MUSIC.gameplay.filter((url) => !this.failed.has(url));
    if (options.length === 0) return;
    const url = options[Math.floor(Math.random() * options.length)];
    // Always restart from the top, even if the same track was chosen again.
    if (this.current && this.current === this.elements.get(url)) this.current.currentTime = 0;
    this.play(url);
  }

  pause() {
    this.paused = true;
    if (this.current) this.current.pause();
  }

  resume() {
    this.paused = false;
    if (this.current) this._start(this.current);
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.current) this._start(this.current);
  }

  setMuted(muted) {
    this.muted = muted;
    for (const element of this.elements.values()) element.muted = muted;
  }
}

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't persist.
  }
}

export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.samples = {};
    this.muted = readMuted();
    this.music = new MusicPlayer(this.muted);
  }

  /**
   * Browsers only allow audio after a user gesture, so call this from a click/tap handler.
   * Safe to call repeatedly; it creates the context once and resumes it if suspended.
   */
  unlock() {
    this.music.unlock();
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        this.context = new AudioContextClass();
      } catch {
        return;
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.context.destination);
      this._createNoiseBuffer();
      this._loadSamples();
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    writeMuted(muted);
    this.music.setMuted(muted);
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.02);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _createNoiseBuffer() {
    const length = Math.floor(this.context.sampleRate * 1);
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  _loadSamples() {
    for (const [name, url] of Object.entries(AUDIO_FILES)) {
      if (!url) continue;
      fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.status))))
        .then((data) => this.context.decodeAudioData(data))
        .then((buffer) => {
          this.samples[name] = buffer;
        })
        .catch(() => {
          // Missing or undecodable file: keep using the synthesized sound.
        });
    }
  }

  get ready() {
    // A context that is still resuming will play scheduled sounds once it starts.
    return !!this.context && this.context.state !== 'closed' && !this.muted;
  }

  /** Plays a named effect. `detail` is passed to the synth (e.g. which candle was lit). */
  play(name, detail) {
    if (!this.ready) return;
    const sample = this.samples[name];
    if (sample) {
      const source = this.context.createBufferSource();
      source.buffer = sample;
      source.connect(this.master);
      source.start();
      return;
    }
    const synth = this[`_${name}`];
    if (synth) synth.call(this, this.context.currentTime, detail);
  }

  // ---- Synth building blocks ----

  _envelope(gainNode, start, attack, peak, decay) {
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(peak, start + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }

  _tone(start, { type = 'sine', from, to = from, duration, peak = 0.3, attack = 0.005 }) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    this._envelope(gain, start, attack, peak, duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + attack + duration + 0.05);
  }

  _noise(start, { duration, peak = 0.3, filter = 'bandpass', from = 1000, to = from, q = 1, attack = 0.005 }) {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = this.context.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, start);
    if (to !== from) biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = this.context.createGain();
    this._envelope(gain, start, attack, peak, duration);
    source.connect(biquad).connect(gain).connect(this.master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + attack + duration + 0.05);
  }

  // ---- Sound effects ----

  _click(t) {
    this._tone(t, { type: 'triangle', from: 1100, to: 700, duration: 0.05, peak: 0.18 });
  }

  _launch(t) {
    this._noise(t, { duration: 0.28, peak: 0.28, filter: 'bandpass', from: 450, to: 2200, q: 1.4, attack: 0.03 });
    this._tone(t, { type: 'sine', from: 220, to: 420, duration: 0.18, peak: 0.12 });
  }

  _splash(t) {
    // Sizzle + plop + a few bubbly pops.
    this._noise(t, { duration: 0.7, peak: 0.32, filter: 'highpass', from: 2500, to: 4200, q: 0.7 });
    this._tone(t, { type: 'sine', from: 260, to: 90, duration: 0.16, peak: 0.35 });
    for (let i = 0; i < 4; i++) {
      const start = t + 0.05 + i * 0.07 + Math.random() * 0.03;
      this._tone(start, { type: 'sine', from: 380 + Math.random() * 200, to: 900 + Math.random() * 300, duration: 0.05, peak: 0.12 });
    }
    // Bright little chime for the score.
    this._tone(t + 0.04, { type: 'triangle', from: 1318.5, duration: 0.25, peak: 0.12 });
    this._tone(t + 0.1, { type: 'triangle', from: 1760, duration: 0.3, peak: 0.1 });
  }

  _miss(t) {
    this._tone(t, { type: 'sine', from: 150, to: 55, duration: 0.2, peak: 0.4 });
    this._noise(t, { duration: 0.12, peak: 0.18, filter: 'lowpass', from: 700, q: 0.5 });
  }

  _rim(t) {
    this._tone(t, { type: 'triangle', from: 520, duration: 0.3, peak: 0.2 });
    this._tone(t, { type: 'triangle', from: 793, duration: 0.25, peak: 0.12 });
    this._noise(t, { duration: 0.05, peak: 0.15, filter: 'highpass', from: 3000 });
  }

  _dreidel(t) {
    // Wooden knock followed by a bright rising sparkle.
    this._tone(t, { type: 'sine', from: 420, to: 260, duration: 0.09, peak: 0.35 });
    this._noise(t, { duration: 0.05, peak: 0.2, filter: 'bandpass', from: 1800, q: 3 });
    [1318.5, 1568, 1975.5, 2637].forEach((frequency, i) => {
      this._tone(t + 0.06 + i * 0.06, { type: 'triangle', from: frequency, duration: 0.22, peak: 0.1 });
    });
  }

  _coin(t) {
    const base = 2200 + Math.random() * 900;
    this._tone(t, { type: 'triangle', from: base, duration: 0.09, peak: 0.08 });
    this._tone(t, { type: 'sine', from: base * 1.5, duration: 0.07, peak: 0.05 });
  }

  // Soft whoosh of a match plus a bell note that climbs with each candle lit (1..9).
  _candle(t, count = 1) {
    const scale = [587.3, 659.3, 698.5, 784, 880, 987.8, 1046.5, 1174.7, 1318.5];
    const frequency = scale[Math.min(scale.length, Math.max(1, count)) - 1];
    this._noise(t, { duration: 0.18, peak: 0.12, filter: 'lowpass', from: 1500, to: 400, q: 0.7, attack: 0.02 });
    this._tone(t + 0.05, { type: 'sine', from: frequency, duration: 0.45, peak: 0.16 });
    this._tone(t + 0.05, { type: 'triangle', from: frequency * 2, duration: 0.25, peak: 0.05 });
  }

  // Fanfare when the ninth candle is lit and double points begin.
  _miracle(t) {
    [587.3, 740, 880, 1174.7, 1480, 1760].forEach((frequency, i) => {
      this._tone(t + i * 0.08, { type: 'triangle', from: frequency, duration: 0.4, peak: 0.14 });
    });
    this._tone(t + 0.5, { type: 'sine', from: 587.3, duration: 1.1, peak: 0.14 });
    this._tone(t + 0.5, { type: 'sine', from: 880, duration: 1.1, peak: 0.1 });
    this._tone(t + 0.5, { type: 'sine', from: 1174.7, duration: 1.1, peak: 0.08 });
    for (let i = 0; i < 8; i++) {
      this._tone(t + 0.5 + i * 0.07, { type: 'sine', from: 2000 + Math.random() * 1500, duration: 0.12, peak: 0.04 });
    }
  }

  _tick(t) {
    this._tone(t, { type: 'sine', from: 1000, duration: 0.06, peak: 0.14 });
  }

  _go(t) {
    this._tone(t, { type: 'triangle', from: 587.3, duration: 0.12, peak: 0.2 });
    this._tone(t + 0.12, { type: 'triangle', from: 880, duration: 0.25, peak: 0.22 });
  }

  _gameOver(t) {
    // Short, original minor-key flourish.
    const notes = [587.3, 698.5, 880, 1174.7];
    notes.forEach((frequency, i) => {
      this._tone(t + i * 0.13, { type: 'triangle', from: frequency, duration: 0.35, peak: 0.18 });
    });
    this._tone(t + 0.55, { type: 'sine', from: 293.7, duration: 0.8, peak: 0.16 });
    this._tone(t + 0.55, { type: 'sine', from: 440, duration: 0.8, peak: 0.12 });
  }

  _newBest(t) {
    [1046.5, 1318.5, 1568, 2093].forEach((frequency, i) => {
      this._tone(t + i * 0.07, { type: 'sine', from: frequency, duration: 0.2, peak: 0.12 });
    });
  }
}
