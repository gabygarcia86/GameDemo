// "Neon Drive" — the built-in procedural demo track.
//
// The composition is pure data so that both the browser (which synthesises
// the audio with Web Audio, see DemoSong.js) and the Node compiler (which
// writes the demo beat maps) derive everything from the same event list.
// Because the true onset times are known, the demo chart has exact timing,
// which also makes it a good track for latency calibration.

export const DEMO_SONG = Object.freeze({
  id: 'neon-drive',
  title: 'Neon Drive (Demo)',
  artist: 'Touch the Beat',
  bpm: 124,
  beatsPerBar: 4,
  bars: 36,
  startTime: 0.6, // seconds of silence before bar 0
  tail: 2.6,
});

export const BEAT = 60 / DEMO_SONG.bpm;
export const SIXTEENTH = BEAT / 4;
export const BAR = BEAT * DEMO_SONG.beatsPerBar;
export const DEMO_DURATION = DEMO_SONG.startTime + DEMO_SONG.bars * BAR + DEMO_SONG.tail;

// section map: [firstBar, lastBar, name, energy]
export const DEMO_SECTIONS = [
  [0, 3, 'intro', 0.35],
  [4, 11, 'verse', 0.7],
  [12, 19, 'chorus', 1.0],
  [20, 23, 'break', 0.55],
  [24, 31, 'finale', 1.0],
  [32, 35, 'outro', 0.5],
];

// Am - F - C - G
const CHORDS = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [53, 57, 60] },
  { bass: 48, tones: [60, 64, 67] },
  { bass: 43, tones: [55, 59, 62] },
];

export function sectionAt(bar) {
  for (const s of DEMO_SECTIONS) if (bar >= s[0] && bar <= s[1]) return s[2];
  return 'outro';
}

const at = (bar, sixteenth) => DEMO_SONG.startTime + bar * BAR + sixteenth * SIXTEENTH;

/** Every musical event in the track: { t, kind, midi?, dur?, vel } */
export function demoEvents() {
  const ev = [];
  const push = (t, kind, extra = {}) => ev.push({ t, kind, vel: 1, ...extra });
  for (let bar = 0; bar < DEMO_SONG.bars; bar++) {
    const sec = sectionAt(bar);
    const chord = CHORDS[bar % 4];
    const drums = sec === 'verse' || sec === 'chorus' || sec === 'finale';
    const full = sec === 'chorus' || sec === 'finale';

    push(at(bar, 0), 'pad', { midi: chord.tones, dur: BAR * 0.98, vel: sec === 'break' ? 0.9 : 0.6 });
    if (sec === 'outro' && bar === DEMO_SONG.bars - 1) {
      push(at(bar, 0), 'crash', { dur: 3 });
      push(at(bar, 0), 'kick');
      push(at(bar, 0), 'bass', { midi: chord.bass, dur: BAR * 1.2 });
      continue;
    }

    for (let s = 0; s < 16; s++) {
      const t = at(bar, s);
      const onBeat = s % 4 === 0;
      // kick
      if (drums && onBeat) push(t, 'kick');
      if ((sec === 'intro' && bar >= 2 && s === 0) || (sec === 'outro' && (s === 0 || s === 8))) push(t, 'kick');
      // snare / clap on 2 and 4
      if (drums && (s === 4 || s === 12) && (bar >= 8 || full)) {
        push(t, 'snare');
        if (sec === 'finale') push(t, 'clap');
      }
      // hats
      if (full) push(t, 'hat', { vel: onBeat ? 0.5 : s % 2 === 0 ? 0.8 : 0.45 });
      else if (sec === 'verse' && s % 4 === 2) push(t, 'hat', { vel: 0.8 });
      else if ((sec === 'intro' && bar >= 2 && s % 2 === 0) || (sec === 'outro' && s % 4 === 2)) push(t, 'hat', { vel: 0.5 });
      // bass
      if (drums && s % 2 === 0) push(t, 'bass', { midi: chord.bass + (s % 8 === 6 ? 12 : 0), dur: SIXTEENTH * 1.7 });
      if (sec === 'break' && s === 0) push(t, 'bass', { midi: chord.bass, dur: BAR * 0.96, vel: 0.8 });
      // arpeggio
      const arpNotes = [chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[0] + 12];
      const up = bar % 2 === 0;
      const step = up ? s % 4 : 3 - (s % 4);
      if (full) push(t, 'arp', { midi: arpNotes[step] + 12, dur: SIXTEENTH * 0.9, vel: 0.55 });
      if (sec === 'break' && s % 2 === 0) push(t, 'arp', { midi: arpNotes[(s / 2) % 4] + 12, dur: SIXTEENTH * 1.6, vel: 0.5 });
    }
    // crashes on section starts
    if ([12, 16, 24, 28, 32].includes(bar)) push(at(bar, 0), 'crash', { dur: 2 });
    // snare build at the end of the break
    if (bar === 23) for (let s = 8; s < 16; s++) push(at(bar, s), 'snare', { vel: 0.4 + (s - 8) * 0.07 });
  }
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

// how each instrument should influence charting
const CHART_WEIGHT = {
  kick: { s: 0.95, b: 0.05 },
  snare: { s: 0.85, b: 0.55 },
  clap: { s: 0.4, b: 0.6 },
  hat: { s: 0.28, b: 0.95 },
  bass: { s: 0.35, b: 0.2 },
  arp: { s: 0.42, b: 0.75 },
  crash: { s: 1.0, b: 0.85 },
  pad: { s: 0.55, b: 0.4 },
};

/**
 * Build an analysis-shaped object for the demo so it can go through the same
 * ChartGenerator as real songs, but with exact (known) onset times.
 */
export function demoAnalysis() {
  const events = demoEvents();
  const groups = [];
  for (const e of events) {
    const w = CHART_WEIGHT[e.kind];
    const s = w.s * e.vel;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.time - e.t) < 0.001) {
      last.inv *= 1 - s;
      last.bw += w.b * s;
      last.sw += s;
    } else {
      groups.push({ time: e.t, inv: 1 - s, bw: w.b * s, sw: s });
    }
  }
  const sixteenthIndex = (t) => Math.round((t - DEMO_SONG.startTime) / SIXTEENTH);
  const onsets = groups.map((g) => {
    const k = sixteenthIndex(g.time);
    const pos = ((k % 16) + 16) % 16;
    const level = pos === 0 ? 0 : pos % 4 === 0 ? 1 : pos % 2 === 0 ? 2 : 3;
    return {
      time: g.time,
      gridTime: g.time,
      snapped: true,
      level,
      strength: Math.min(1, 1 - g.inv),
      brightness: g.sw ? g.bw / g.sw : 0.5,
      bands: [1, 1, 1, 1],
    };
  });

  const beats = [];
  const beatStrength = [];
  const beatBands = [];
  for (let k = 0; k < DEMO_SONG.bars * DEMO_SONG.beatsPerBar; k++) {
    const t = DEMO_SONG.startTime + k * BEAT;
    beats.push(Math.round(t * 1000) / 1000);
    const o = onsets.find((x) => Math.abs(x.time - t) < 0.002);
    beatStrength.push(o ? o.strength : 0);
    beatBands.push([1, 1, 1, 1]);
  }

  const envelopeRate = 20;
  const envelope = new Float32Array(Math.ceil(DEMO_DURATION * envelopeRate));
  for (let i = 0; i < envelope.length; i++) {
    const t = i / envelopeRate;
    const bar = Math.floor((t - DEMO_SONG.startTime) / BAR);
    if (t < DEMO_SONG.startTime) envelope[i] = 0;
    else if (bar >= DEMO_SONG.bars) envelope[i] = Math.max(0, 0.5 * (1 - (t - (DEMO_DURATION - DEMO_SONG.tail)) / DEMO_SONG.tail));
    else envelope[i] = DEMO_SECTIONS.find((s) => bar >= s[0] && bar <= s[1])[3];
  }

  const sections = DEMO_SECTIONS.map(([a, b, , energy]) => ({
    start: Math.round(at(a, 0) * 1000) / 1000,
    end: Math.round(at(b + 1, 0) * 1000) / 1000,
    energy,
  }));
  const waveform = [];
  for (let i = 0; i < 120; i++) waveform.push(Math.round(envelope[Math.floor((i / 120) * envelope.length)] * 100) / 100);

  return {
    analyzerVersion: 'demo',
    duration: DEMO_DURATION,
    bpm: DEMO_SONG.bpm,
    period: BEAT,
    beats,
    beatStrength,
    beatBands,
    beatsPerBar: DEMO_SONG.beatsPerBar,
    downbeatPhase: 0,
    onsets,
    sections,
    phrases: sections.map((s) => s.start),
    envelope,
    envelopeRate,
    activeStart: DEMO_SONG.startTime,
    activeEnd: DEMO_SONG.startTime + DEMO_SONG.bars * BAR + 0.5,
    waveform,
    confidence: { overall: 1, tempo: 1, beat: 1, downbeat: 1, grid: 1 },
  };
}
