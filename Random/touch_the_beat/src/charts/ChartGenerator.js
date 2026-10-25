// Turns an audio analysis into a playable chart for one difficulty.
//
// 1. candidates  = detected onsets (+ implied pulses on tracked beats)
// 2. prioritise by onset strength (global + local), grid level and section energy
// 3. greedy selection under a minimum-spacing rule until the target density
// 4. fill audible gaps that are too long for the difficulty
// 5. hold notes where loudness stays steady through a long gap
// 6. chords on the strongest on-grid accents
// 7. lane assignment: spectral brightness preference (mirrored per phrase),
//    movement patterns, lane balancing, anti-monotony, seeded variation
// 8. validation / repair (ChartValidator)
//
// Output is deterministic for identical analysis + settings.

import { createRng, hashString, hashFloat } from './Random.js';
import { createBeatMap, LANE_COUNT } from './BeatMap.js';
import { validateChart } from './ChartValidator.js';
import { ANALYZER_VERSION, loudnessBetween, loudnessVariation } from '../audio/AudioAnalyzer.js';

export const GENERATOR_NAME = 'touch-the-beat-chartgen';
export const GENERATOR_VERSION = '1.0.0';

const SILENCE = 0.1;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function brightnessOf(bands) {
  const s = bands[0] + bands[1] + bands[2] + bands[3];
  if (s <= 1e-9) return 0.5;
  return (bands[1] + 2 * bands[2] + 3 * bands[3]) / (3 * s);
}

function lowerBound(arr, t, key = (x) => x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Merge onsets and beat pulses into one sorted candidate list. */
export function buildCandidates(analysis) {
  const { beats, beatStrength, beatBands, beatsPerBar, downbeatPhase, onsets } = analysis;
  const cands = onsets
    .map((o) => ({
      time: o.snapped ? o.gridTime : o.time,
      level: o.level,
      strength: o.strength,
      brightness: o.brightness ?? brightnessOf(o.bands),
      onset: true,
      snapped: o.snapped,
      beat: false,
    }))
    .sort((a, b) => a.time - b.time);

  const extra = [];
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i];
    const level = ((i - downbeatPhase) % beatsPerBar + beatsPerBar) % beatsPerBar === 0 ? 0 : 1;
    const k = lowerBound(cands, t - 0.03, (c) => c.time);
    let near = null;
    for (let j = k; j < cands.length && cands[j].time <= t + 0.03; j++) {
      if (!near || Math.abs(cands[j].time - t) < Math.abs(near.time - t)) near = cands[j];
    }
    if (near) {
      near.level = Math.min(near.level, level);
      near.beat = true;
      near.time = t;
      near.snapped = true;
    } else {
      extra.push({
        time: t,
        level,
        strength: (beatStrength[i] || 0) * 0.6,
        brightness: brightnessOf(beatBands[i] || [1, 1, 1, 1]),
        onset: false,
        snapped: true,
        beat: true,
      });
    }
  }
  const all = cands.concat(extra).sort((a, b) => a.time - b.time || a.level - b.level);

  // merge near-duplicates (within 15 ms)
  const merged = [];
  for (const c of all) {
    const last = merged[merged.length - 1];
    if (last && c.time - last.time < 0.015) {
      if (c.strength > last.strength) {
        last.strength = c.strength;
        last.brightness = c.brightness;
      }
      last.level = Math.min(last.level, c.level);
      last.beat = last.beat || c.beat;
      last.onset = last.onset || c.onset;
    } else {
      merged.push({ ...c });
    }
  }

  // rank-normalise brightness so lane preference spreads evenly in every song
  const order = merged.map((_, i) => i).sort((a, b) => merged[a].brightness - merged[b].brightness || a - b);
  order.forEach((idx, rank) => {
    merged[idx].brightness = merged.length > 1 ? rank / (merged.length - 1) : 0.5;
  });

  // local strength relative to the loudest event within ±4 s
  for (let i = 0, lo = 0, hi = 0; i < merged.length; i++) {
    while (merged[lo].time < merged[i].time - 4) lo++;
    while (hi < merged.length - 1 && merged[hi + 1].time <= merged[i].time + 4) hi++;
    let m = 1e-6;
    for (let j = lo; j <= hi; j++) m = Math.max(m, merged[j].strength);
    merged[i].local = merged[i].strength / m;
  }
  return merged;
}

function sectionEnergy(sections, t) {
  for (const s of sections) if (t >= s.start && t < s.end) return s.energy;
  return 0.5;
}

/**
 * @param {object} analysis  result of analyzeAudio()
 * @param {{id:string,title:string,artist?:string}} song
 * @param {string} difficulty
 * @param {object} profile   DIFFICULTY_PROFILES entry
 * @param {object} settings  normalised compile settings
 */
export function generateChart(analysis, song, difficulty, profile, settings) {
  const duration = analysis.duration;
  const beatDur = analysis.period || 60 / analysis.bpm;
  const minGap = Math.max(profile.minGapAbs, profile.minGapBeats * beatDur);
  const start = Math.max(analysis.activeStart, 0.6);
  const end = Math.min(analysis.activeEnd, duration - 0.4);
  const activeDur = Math.max(1, end - start);
  const tempoFactor = clamp(Math.sqrt(analysis.bpm / 120), 0.85, 1.2);
  const target = Math.max(8, Math.round(profile.nps * settings.density * tempoFactor * activeDur));
  const seedKey = `${song.id}|${difficulty}|${settings.seed}`;

  const cands = buildCandidates(analysis);
  for (const c of cands) {
    const w = profile.levelWeights[c.level] || 0;
    const audible = loudnessBetween(analysis, c.time - 0.05, c.time + 0.15) >= SILENCE;
    c.eligible = w > 0 && audible && c.time >= start && c.time <= end;
    c.score = 0.55 * c.strength + 0.45 * c.local;
    c.priority = c.score * w * (0.8 + 0.4 * sectionEnergy(analysis.sections, c.time)) + (c.beat ? 0.05 : 0);
  }

  // ---- greedy selection under the spacing rule
  const selected = []; // sorted by time
  const fits = (t) => {
    const k = lowerBound(selected, t, (c) => c.time);
    if (k > 0 && t - selected[k - 1].time < minGap) return -1;
    if (k < selected.length && selected[k].time - t < minGap) return -1;
    return k;
  };
  const order = cands
    .map((c, i) => i)
    .filter((i) => cands[i].eligible)
    .sort((a, b) => cands[b].priority - cands[a].priority || cands[a].time - cands[b].time);
  for (const idx of order) {
    if (selected.length >= target) break;
    const k = fits(cands[idx].time);
    if (k >= 0) selected.splice(k, 0, cands[idx]);
  }

  // ---- fill long gaps while the music is audible
  for (let guard = 0, i = -1; i < selected.length && guard < 5000; guard++) {
    const a = i < 0 ? start - minGap : selected[i].time;
    const b = i + 1 < selected.length ? selected[i + 1].time : end + minGap;
    if (b - a > profile.maxGap && loudnessBetween(analysis, a, b) >= SILENCE * 1.5) {
      let best = null;
      for (let j = lowerBound(cands, a + minGap, (c) => c.time); j < cands.length && cands[j].time <= b - minGap; j++) {
        const c = cands[j];
        if (c.level > profile.maxFillLevel || c.time < start || c.time > end) continue;
        if (loudnessBetween(analysis, c.time - 0.05, c.time + 0.15) < SILENCE) continue;
        const p = c.score * (profile.levelWeights[c.level] || 0.2);
        // prefer candidates near the middle of the gap
        const mid = 1 - Math.abs((c.time - a) / (b - a) - 0.5);
        if (!best || p * mid > best.p) best = { c, p: p * mid };
      }
      if (best) {
        selected.splice(i + 1, 0, best.c);
        continue; // re-examine the (now smaller) gap
      }
    }
    i++;
  }

  const events = selected.map((c) => ({
    time: c.time,
    level: c.level,
    strength: c.strength,
    score: c.score,
    brightness: c.brightness,
    onset: c.onset,
    snapped: c.snapped,
    hold: 0,
    size: 1,
    lanes: null,
  }));

  // ---- holds
  if (settings.holds) {
    const H = profile.holds;
    let used = 0;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const next = i + 1 < events.length ? events[i + 1].time : end;
      const gap = next - e.time;
      if (gap < H.minGap || e.level > 2) continue;
      if (i > 0 && events[i - 1].hold) continue;
      if (used >= H.ratio * (i + 1) + 1) continue;
      const step = beatDur / 2;
      let dur = Math.floor((gap - H.release) / step) * step;
      while (dur > H.maxDur) dur -= step;
      if (dur < H.minDur) continue;
      const L0 = loudnessBetween(analysis, e.time, e.time + 0.15);
      const Lmid = loudnessBetween(analysis, e.time + 0.15, e.time + dur);
      const variation = loudnessVariation(analysis, e.time + 0.1, e.time + dur);
      if (Lmid >= 0.3 && Lmid >= 0.55 * L0 && variation < 0.45) {
        e.hold = Math.round(dur * 1000) / 1000;
        used++;
      }
    }
  }

  // ---- chords
  if (settings.chords) {
    const C = profile.chord;
    let used = 0;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.hold) continue;
      const prevGap = i > 0 ? e.time - (events[i - 1].time + events[i - 1].hold) : Infinity;
      const nextGap = i + 1 < events.length ? events[i + 1].time - e.time : Infinity;
      if (Math.min(prevGap, nextGap) < C.minGap) continue;
      if (e.level > C.maxLevel || e.score < C.minStrength) continue;
      if (used >= C.ratio * (i + 1) + 1) continue;
      if (hashFloat(`${seedKey}|chord`, i) > 0.8) continue;
      e.size = 2;
      if (C.maxSize >= 3 && e.score >= C.tripleStrength && e.level === 0 && hashFloat(`${seedKey}|triple`, i) < 0.4) e.size = 3;
      used++;
    }
  }

  // ---- lanes
  const rng = createRng(hashString(seedKey));
  const phraseLen = analysis.beatsPerBar * 4 * beatDur;
  const firstDown = analysis.beats[analysis.downbeatPhase] ?? 0;
  const mirrorKey = `${song.id}|${settings.seed}|mirror`;
  const hist = [];
  const counts = new Array(LANE_COUNT).fill(0);
  const scores = new Float64Array(LANE_COUNT);
  const laneIdx = [0, 1, 2, 3];
  let lastLanes = [];
  let lastTime = -10;
  let dir = 1;
  for (const e of events) {
    const dt = e.time - lastTime;
    const phrase = Math.floor((e.time - firstDown) / phraseLen);
    let pref = e.brightness * (LANE_COUNT - 1);
    if (hashFloat(mirrorKey, phrase) < 0.5) pref = LANE_COUNT - 1 - pref;
    const mean = hist.length / LANE_COUNT;
    for (let l = 0; l < LANE_COUNT; l++) {
      let s = profile.prefWeight * (1 - Math.abs(l - pref) / (LANE_COUNT - 1));
      if (lastLanes.includes(l)) s -= dt < profile.jackMinGap ? 4 : dt < 0.6 ? 0.5 : 0.1;
      if (lastLanes.length === 1 && dt < 0.5) {
        const d = l - lastLanes[0];
        if (Math.abs(d) === 1) s += 0.3;
        if (Math.sign(d) === dir) s += 0.2;
        if (Math.abs(d) === 3 && dt < 0.25) s -= 0.6;
      }
      if (mean > 0) s -= (profile.balance * (counts[l] - mean)) / mean;
      const h = hist.length;
      if (h >= 4 && hist[h - 2] === l && hist[h - 4] === l && hist[h - 1] === hist[h - 3]) s -= 0.6;
      s += rng() * profile.noise;
      scores[l] = s;
    }
    const ranked = laneIdx.slice().sort((a, b) => scores[b] - scores[a] || a - b);
    const lanes = ranked.slice(0, e.size).sort((a, b) => a - b);
    if (lanes.length === 1 && lastLanes.length === 1 && lanes[0] !== lastLanes[0]) dir = Math.sign(lanes[0] - lastLanes[0]);
    if (lanes[0] === 0) dir = 1;
    if (lanes[lanes.length - 1] === LANE_COUNT - 1) dir = -1;
    for (const l of lanes) {
      hist.push(l);
      counts[l]++;
      if (hist.length > 12) counts[hist.shift()]--;
    }
    e.lanes = lanes;
    lastLanes = lanes;
    lastTime = e.time;
  }

  // ---- notes
  const overall = analysis.confidence?.overall ?? 0.5;
  const notes = [];
  for (const e of events) {
    const conf = clamp(0.3 + 0.45 * e.strength + (e.snapped ? 0.15 : 0) + (e.onset ? 0.1 : 0), 0, 1) * (0.6 + 0.4 * overall);
    for (const lane of e.lanes) {
      notes.push({
        time: Math.round(e.time * 1000) / 1000,
        lane,
        type: e.hold ? 'hold' : 'tap',
        duration: e.hold,
        confidence: Math.round(conf * 100) / 100,
      });
    }
  }

  const map = createBeatMap({
    songId: song.id,
    title: song.title,
    artist: song.artist,
    duration,
    bpm: analysis.bpm,
    offset: settings.offsetMs / 1000,
    difficulty,
    beatsPerBar: analysis.beatsPerBar,
    beats: analysis.beats,
    downbeat: analysis.downbeatPhase,
    sections: analysis.sections,
    notes,
    confidence: analysis.confidence,
    generator: {
      name: GENERATOR_NAME,
      version: GENERATOR_VERSION,
      analyzer: ANALYZER_VERSION,
      settings,
    },
  });
  const { chart, warnings } = validateChart(map);
  chart.warnings = warnings;
  return chart;
}
