// Renders the "Neon Drive" demo track with an OfflineAudioContext.
// Everything is synthesised: oscillators, filtered noise and envelopes.

import { demoEvents, DEMO_DURATION } from './DemoComposition.js';

const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export async function renderDemoSong(sampleRate = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext is not supported; the demo track cannot be generated.');
  const length = Math.ceil(DEMO_DURATION * sampleRate);
  const ctx = new OAC(2, length, sampleRate);

  // ---- buses (shared filters keep the node count low)
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.ratio.value = 4;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  master.connect(out).connect(ctx.destination);

  const bus = (gain, filterType, freq, q = 0.7) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (!filterType) {
      g.connect(master);
      return g;
    }
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    g.connect(f).connect(master);
    return g;
  };
  const drums = bus(1, null);
  const hatBus = bus(0.5, 'highpass', 7000);
  const snareBus = bus(0.8, 'bandpass', 1900, 0.6);
  const crashBus = bus(0.35, 'highpass', 4200);
  const bassBus = bus(0.55, 'lowpass', 520, 3);
  const arpBus = bus(0.3, 'lowpass', 3400, 2);
  const padBus = bus(0.32, 'lowpass', 1500, 0.4);

  // stereo widening for the arp, if supported
  let arpL = arpBus;
  let arpR = arpBus;
  if (ctx.createStereoPanner) {
    arpL = ctx.createStereoPanner();
    arpL.pan.value = -0.45;
    arpL.connect(arpBus);
    arpR = ctx.createStereoPanner();
    arpR.pan.value = 0.45;
    arpR.connect(arpBus);
  }

  const noise = ctx.createBuffer(1, sampleRate * 2, sampleRate);
  {
    const d = noise.getChannelData(0);
    let seed = 42;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  const env = (g, t, peak, attack, decay) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  const noiseHit = (dest, t, peak, decay, offset = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const g = ctx.createGain();
    env(g, t, peak, 0.002, decay);
    s.connect(g).connect(dest);
    s.start(t, offset % 1.5);
    s.stop(t + decay + 0.05);
  };
  const osc = (dest, type, freq, t, dur, peak, attack = 0.005, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, peak, attack, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  };

  let arpToggle = 0;
  for (const e of demoEvents()) {
    const t = e.t;
    switch (e.kind) {
      case 'kick': {
        const o = osc(drums, 'sine', 150, t, 0.32, 0.95, 0.002);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        noiseHit(drums, t, 0.12, 0.012, t * 3);
        break;
      }
      case 'snare':
        noiseHit(snareBus, t, 0.7 * e.vel, 0.16, t * 7);
        osc(drums, 'triangle', 190, t, 0.08, 0.25 * e.vel, 0.002);
        break;
      case 'clap':
        noiseHit(snareBus, t + 0.008, 0.35, 0.1, t * 11);
        break;
      case 'hat':
        noiseHit(hatBus, t, 0.55 * e.vel, 0.045, t * 13);
        break;
      case 'crash':
        noiseHit(crashBus, t, 0.6, e.dur || 1.5, t * 5);
        break;
      case 'bass':
        osc(bassBus, 'sawtooth', midiToHz(e.midi), t, e.dur, 0.6 * e.vel, 0.006);
        osc(bassBus, 'square', midiToHz(e.midi - 12), t, e.dur, 0.25 * e.vel, 0.006);
        break;
      case 'arp':
        osc(arpToggle++ % 2 ? arpR : arpL, 'square', midiToHz(e.midi), t, e.dur, 0.3 * e.vel, 0.003);
        break;
      case 'pad':
        for (const m of e.midi) {
          osc(padBus, 'sawtooth', midiToHz(m), t, e.dur, 0.12 * e.vel, 0.25, -8);
          osc(padBus, 'sawtooth', midiToHz(m), t, e.dur, 0.12 * e.vel, 0.25, 8);
        }
        break;
      default:
        break;
    }
  }
  return renderOffline(ctx);
}

function renderOffline(ctx) {
  return new Promise((resolve, reject) => {
    ctx.oncomplete = (e) => resolve(e.renderedBuffer);
    const p = ctx.startRendering();
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}
