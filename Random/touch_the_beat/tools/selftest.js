#!/usr/bin/env node
// Self-test for the analysis + chart pipeline and the gameplay rules.
// Run with: npm test

import { analyzeAudio } from '../src/audio/AudioAnalyzer.js';
import { demoAnalysis, DEMO_SONG } from '../src/audio/DemoComposition.js';
import { parseBeatMap } from '../src/charts/BeatMap.js';
import { generateAllDifficulties, normalizeCompileSettings } from '../src/charts/DifficultyGenerator.js';
import { createRng } from '../src/charts/Random.js';
import { JudgementSystem } from '../src/game/JudgementSystem.js';
import { NoteManager } from '../src/game/NoteManager.js';
import { ScoreManager } from '../src/game/ScoreManager.js';

let failed = 0;
const check = (cond, label, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
  if (!cond) failed++;
};

/** Synthetic drum loop with known onset times. */
function synthTrack({ bpm, seconds, sr = 22050, swing = 0, seed = 1 }) {
  const rng = createRng(seed);
  const x = new Float32Array(Math.floor(seconds * sr));
  const beat = 60 / bpm;
  const truth = [];
  const start = 0.5;
  for (let k = 0; start + k * beat < seconds - 1; k++) {
    const t = start + k * beat;
    truth.push(t);
    // kick: pitch-dropping sine
    for (let i = 0; i < 0.18 * sr; i++) {
      const tt = i / sr;
      const f = 50 + 90 * Math.exp(-tt * 30);
      const idx = Math.floor(t * sr) + i;
      if (idx < x.length) x[idx] += 0.8 * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 18);
    }
    // snare on 2 and 4
    if (k % 2 === 1) {
      for (let i = 0; i < 0.12 * sr; i++) {
        const idx = Math.floor(t * sr) + i;
        if (idx < x.length) x[idx] += 0.35 * (rng() * 2 - 1) * Math.exp(-(i / sr) * 30);
      }
    }
    // offbeat hat
    const th = t + beat / 2 + swing;
    for (let i = 0; i < 0.03 * sr; i++) {
      const idx = Math.floor(th * sr) + i;
      if (idx < x.length) x[idx] += 0.12 * (rng() * 2 - 1) * Math.exp(-(i / sr) * 120);
    }
  }
  for (let i = 0; i < x.length; i++) x[i] += 0.003 * (rng() * 2 - 1);
  return { samples: x, sampleRate: sr, truth };
}

function nearestError(times, truth) {
  const errs = [];
  for (const t of truth) {
    let best = Infinity;
    for (const d of times) if (Math.abs(d - t) < Math.abs(best)) best = d - t;
    if (Math.abs(best) < 0.06) errs.push(best);
  }
  const mean = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / (errs.length || 1);
  return { found: errs.length / truth.length, mean, mae };
}

async function testAnalyzer() {
  console.log('Analyzer');
  for (const bpm of [92, 120, 150]) {
    const { samples, sampleRate, truth } = synthTrack({ bpm, seconds: 40, seed: bpm });
    const a = await analyzeAudio(samples, sampleRate);
    const ratio = a.bpm / bpm;
    const octaveOk = [0.5, 1, 2].some((m) => Math.abs(ratio - m) / m < 0.02);
    check(octaveOk, `tempo ${bpm} BPM`, `estimated ${a.bpm}`);
    const on = nearestError(a.onsets.map((o) => o.time), truth);
    check(on.found > 0.95 && Math.abs(on.mean) < 0.012 && on.mae < 0.015, `onset timing @${bpm}`,
      `found ${(on.found * 100).toFixed(0)}%, bias ${(on.mean * 1000).toFixed(1)} ms, mae ${(on.mae * 1000).toFixed(1)} ms`);
    // every detected beat must sit on a real beat (octave errors are allowed)
    const bt = nearestError(truth, a.beats);
    check(bt.found > 0.9 && bt.mae < 0.02, `beat tracking @${bpm}`, `${(bt.found * 100).toFixed(0)}% of beats on a true beat, mae ${(bt.mae * 1000).toFixed(1)} ms`);
  }
}

async function testCharts() {
  console.log('Chart generation');
  const { samples, sampleRate } = synthTrack({ bpm: 128, seconds: 60, seed: 7 });
  const analysis = await analyzeAudio(samples, sampleRate);
  const song = { id: 'synthetic', title: 'Synthetic', artist: 'Test' };
  const settings = normalizeCompileSettings({});
  const a = generateAllDifficulties(analysis, song, settings);
  const b = generateAllDifficulties(analysis, song, settings);
  check(JSON.stringify(a) === JSON.stringify(b), 'deterministic output for identical settings');
  const c = generateAllDifficulties(analysis, song, normalizeCompileSettings({ seed: 5 }));
  check(JSON.stringify(a.hard.notes) !== JSON.stringify(c.hard.notes), 'seed changes lane patterns');
  check(a.easy.notes.length < a.normal.notes.length && a.normal.notes.length < a.hard.notes.length, 'density grows with difficulty',
    `${a.easy.notes.length}/${a.normal.notes.length}/${a.hard.notes.length}`);
  for (const [d, chart] of Object.entries(a)) {
    const parsed = parseBeatMap(JSON.parse(JSON.stringify(chart)));
    let ok = parsed.notes.length === chart.notes.length;
    const laneEnd = [-1, -1, -1, -1];
    for (const n of parsed.notes) {
      if (n.time < laneEnd[n.lane] + 0.079) ok = false;
      laneEnd[n.lane] = n.time + n.duration;
    }
    check(ok, `${d}: valid, no same-lane overlaps`, `${chart.stats.noteCount} notes, ${chart.stats.holdCount} holds, ${chart.stats.chordCount} chords`);
    const lanes = [0, 0, 0, 0];
    for (const n of chart.notes) lanes[n.lane]++;
    const minShare = Math.min(...lanes) / chart.notes.length;
    check(minShare > 0.12, `${d}: lanes are balanced`, lanes.join('/'));
  }
  const demo = generateAllDifficulties(demoAnalysis(), DEMO_SONG, settings);
  check(demo.easy.notes.length > 40 && demo.hard.notes.length > demo.easy.notes.length * 2, 'demo charts generated',
    `${demo.easy.notes.length}/${demo.normal.notes.length}/${demo.hard.notes.length}`);
}

function testJudgement() {
  console.log('Judgement & scoring');
  const chart = {
    notes: [
      { time: 1.0, lane: 0, type: 'tap', duration: 0 },
      { time: 1.0, lane: 2, type: 'tap', duration: 0 },
      { time: 1.5, lane: 1, type: 'tap', duration: 0 },
      { time: 2.0, lane: 3, type: 'hold', duration: 1.0 },
      { time: 3.5, lane: 0, type: 'tap', duration: 0 },
      { time: 4.0, lane: 1, type: 'hold', duration: 1.0 },
    ],
    offset: 0,
  };
  const notes = new NoteManager();
  notes.load(chart);
  const score = new ScoreManager();
  score.reset(notes.count);
  const events = [];
  const judge = new JudgementSystem(notes, score, { onJudge: (e) => events.push(e) });
  judge.reset();
  judge.laneDown(0, 1.02); // perfect (20 ms)
  judge.laneDown(2, 0.93); // great (70 ms early)
  judge.laneDown(2, 0.95); // no note left -> ignored
  judge.update(1.7); // lane 1 note passes -> miss
  judge.laneDown(3, 2.12); // good, hold starts
  judge.update(2.5);
  judge.laneUp(3, 3.0); // completes
  judge.update(3.0);
  judge.update(3.8); // lane 0 note at 3.5 missed
  judge.laneDown(1, 4.0);
  judge.laneUp(1, 4.3); // dropped early
  judge.update(6);
  const ratings = events.filter((e) => e.kind === 'judge').map((e) => e.rating);
  check(ratings.join(',') === 'perfect,great,miss,good,miss,perfect', 'ratings', ratings.join(','));
  check(events.some((e) => e.kind === 'holdComplete') && events.some((e) => e.kind === 'holdDrop'), 'hold complete + drop');
  check(notes.notes.every((n) => n.judged), 'every note judged exactly once');
  check(score.counts.perfect === 2 && score.counts.great === 1 && score.counts.good === 1 && score.counts.miss === 2, 'counts');
  check(score.maxCombo === 2, 'max combo', String(score.maxCombo));
  check(score.accuracy > 0 && score.accuracy < 100, 'accuracy', score.accuracy.toFixed(1));
}

await testAnalyzer();
await testCharts();
testJudgement();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exitCode = failed ? 1 : 0;
