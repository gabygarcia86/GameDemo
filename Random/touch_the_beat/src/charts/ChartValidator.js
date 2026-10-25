// Playability and consistency checks applied to every generated chart.
// The validator repairs what it can (sorting, overlaps, out-of-range notes)
// and reports statistics plus human-readable warnings.

import { LANE_COUNT, chordGroups } from './BeatMap.js';

export const VALIDATION_RULES = Object.freeze({
  minTime: 0.25, // first playable moment (s)
  endMargin: 0.15, // notes must end this long before the audio ends
  minLaneGap: 0.08, // gap required between notes in the same lane (s)
  maxSimultaneous: 3, // physical limit for phone play
  maxHoldDuration: 8,
});

const r3 = (v) => Math.round(v * 1000) / 1000;

export function validateNotes(notes, duration, rules = VALIDATION_RULES) {
  const warnings = [];
  const sorted = notes
    .filter((n) => Number.isFinite(n.time) && n.lane >= 0 && n.lane < LANE_COUNT)
    .map((n) => ({ ...n, time: r3(n.time), duration: n.type === 'hold' ? r3(Math.min(n.duration, rules.maxHoldDuration)) : 0 }))
    .sort((a, b) => a.time - b.time || a.lane - b.lane);

  const out = [];
  const laneFree = new Array(LANE_COUNT).fill(-Infinity);
  let removed = 0;
  let i = 0;
  while (i < sorted.length) {
    // gather a chord group
    let j = i;
    while (j < sorted.length && sorted[j].time - sorted[i].time < 0.0015) j++;
    const group = [];
    const usedLanes = new Set();
    for (let k = i; k < j; k++) {
      const n = sorted[k];
      if (n.time < rules.minTime || n.time > duration - rules.endMargin) { removed++; continue; }
      if (usedLanes.has(n.lane)) { removed++; continue; }
      if (n.time < laneFree[n.lane] + rules.minLaneGap) { removed++; continue; }
      if (n.type === 'hold') {
        const end = Math.min(n.time + n.duration, duration - rules.endMargin);
        n.duration = r3(end - n.time);
        if (n.duration < 0.2) { n.type = 'tap'; n.duration = 0; }
      }
      if (group.length >= rules.maxSimultaneous) { removed++; continue; }
      group.push(n);
      usedLanes.add(n.lane);
    }
    // no other lane may still be holding when a chord of 3 lands
    for (const n of group) {
      laneFree[n.lane] = n.time + n.duration;
      out.push(n);
    }
    i = j;
  }
  if (removed) warnings.push(`${removed} overlapping or out-of-range notes were removed.`);
  return { notes: out, warnings };
}

export function chartStats(notes, duration) {
  const groups = chordGroups(notes);
  const chords = groups.filter((g) => g.length > 1).length;
  const holds = notes.filter((n) => n.type === 'hold').length;
  let longestGap = 0;
  for (let g = 1; g < groups.length; g++) {
    longestGap = Math.max(longestGap, notes[groups[g][0]].time - notes[groups[g - 1][0]].time);
  }
  const first = notes.length ? notes[0].time : 0;
  const last = notes.length ? notes[notes.length - 1].time : 0;
  const span = Math.max(1, last - first);
  // peak density over a 2 second sliding window
  let peak = 0;
  for (let a = 0, b = 0; b < notes.length; b++) {
    while (notes[b].time - notes[a].time > 2) a++;
    peak = Math.max(peak, (b - a + 1) / 2);
  }
  return {
    noteCount: notes.length,
    eventCount: groups.length,
    chordCount: chords,
    holdCount: holds,
    nps: Math.round((notes.length / span) * 100) / 100,
    peakNps: Math.round(peak * 100) / 100,
    firstNote: r3(first),
    lastNote: r3(last),
    longestGap: r3(longestGap),
    coverage: Math.round((span / Math.max(1, duration)) * 100) / 100,
  };
}

/** Validate a full beat map object; returns { chart, stats, warnings }. */
export function validateChart(chart, rules = VALIDATION_RULES) {
  const { notes, warnings } = validateNotes(chart.notes, chart.duration, rules);
  const stats = chartStats(notes, chart.duration);
  if (stats.noteCount < 20) warnings.push('Very few notes were generated. Try a higher density or sensitivity.');
  if (stats.coverage < 0.6) warnings.push('Notes cover less than 60 % of the song. The track may be quiet or ambient.');
  if (stats.longestGap > 12) warnings.push(`There is a ${stats.longestGap.toFixed(1)} s gap without notes.`);
  return { chart: { ...chart, notes, stats }, stats, warnings };
}
