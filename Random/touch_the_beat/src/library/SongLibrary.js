// Song library: built-in songs (compiled by tools/compile-songs.js and listed
// in public/metadata/library.json), the procedural demo, and songs imported
// in this browser (IndexedDB). Audio is fetched and decoded only when a song
// is played, and only one decoded song is kept in memory at a time.

import { analyzeAudio } from '../audio/AudioAnalyzer.js';
import { DEMO_DURATION, DEMO_SONG, demoAnalysis } from '../audio/DemoComposition.js';
import { renderDemoSong } from '../audio/DemoSong.js';
import { parseBeatMap } from '../charts/BeatMap.js';
import {
  DIFFICULTIES,
  analysisOptionsFrom,
  generateAllDifficulties,
  normalizeCompileSettings,
} from '../charts/DifficultyGenerator.js';
import { decodeForAnalysis } from './BrowserSongImporter.js';
import { extensionOf, mimeFor } from './songMeta.js';

export const MANIFEST_URL = 'public/metadata/library.json';

function summarize(charts) {
  const out = {};
  for (const d of DIFFICULTIES) {
    const s = charts[d].stats;
    out[d] = { notes: s.noteCount, nps: s.nps, holds: s.holdCount, chords: s.chordCount };
  }
  return out;
}

function demoEntry() {
  const a = demoAnalysis();
  return {
    id: DEMO_SONG.id,
    title: DEMO_SONG.title,
    artist: DEMO_SONG.artist,
    source: 'procedural',
    procedural: DEMO_SONG.id,
    duration: DEMO_DURATION,
    bpm: DEMO_SONG.bpm,
    beatsPerBar: DEMO_SONG.beatsPerBar,
    confidence: a.confidence,
    waveform: a.waveform,
    charts: null,
    difficulties: null,
  };
}

export class SongLibrary {
  constructor(store, audio) {
    this.store = store;
    this.audio = audio;
    this.builtin = [];
    this.imported = [];
    this.overrides = new Map();
    this.chartCache = new Map();
    this.loaded = { id: null, buffer: null };
    this.manifestError = null;
    this.probe = typeof Audio !== 'undefined' ? new Audio() : null;
  }

  async init() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lib = await res.json();
      this.builtin = (lib.songs || []).map((s) => ({ ...s, source: s.source || 'builtin' }));
    } catch (err) {
      this.manifestError = err;
      console.warn('Song manifest could not be loaded:', err);
    }
    if (!this.builtin.some((s) => s.id === DEMO_SONG.id)) this.builtin.unshift(demoEntry());
    this.imported = (await this.store.getAll('songs').catch(() => [])).sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0));
    for (const o of await this.store.getAll('overrides').catch(() => [])) this.overrides.set(o.id, o);
  }

  /** "probably" | "maybe" | "" for the song's format in this browser. */
  canPlay(song) {
    if (song.source === 'procedural') return 'probably';
    const mime = song.mime || mimeFor(song.file || song.audio || '');
    if (!mime || !this.probe) return 'maybe';
    return this.probe.canPlayType(mime);
  }

  get songs() {
    return [...this.builtin, ...this.imported].map((s) => {
      const o = this.overrides.get(s.id);
      return o ? { ...s, ...o.meta, recompiled: true, compileSettings: o.settings } : { ...s, compileSettings: s.settings };
    });
  }

  find(id) {
    return this.songs.find((s) => s.id === id) || null;
  }

  async getChart(song, difficulty) {
    const key = `${song.id}/${difficulty}`;
    if (this.chartCache.has(key)) return this.chartCache.get(key);
    let raw = null;
    const stored = await this.store.get('charts', key).catch(() => null);
    if (stored) raw = stored.chart;
    else if (song.charts?.[difficulty]) {
      const res = await fetch(song.charts[difficulty]);
      if (!res.ok) throw new Error(`Chart file missing (${res.status}). Re-run the song compiler.`);
      raw = await res.json();
    } else if (song.source === 'procedural') {
      raw = generateAllDifficulties(demoAnalysis(), DEMO_SONG, normalizeCompileSettings({}))[difficulty];
    }
    if (!raw) throw new Error('No chart is available for this song. Try recompiling it.');
    const chart = parseBeatMap(raw);
    this.chartCache.set(key, chart);
    return chart;
  }

  async getAudioData(song) {
    if (song.source === 'imported') {
      const rec = await this.store.get('audio', song.id);
      if (!rec) throw new Error('The imported audio is no longer stored on this device. Import the file again.');
      if (rec.blob) return rec.blob.arrayBuffer ? rec.blob.arrayBuffer() : new Response(rec.blob).arrayBuffer();
      return rec.buffer.slice(0);
    }
    const res = await fetch(song.audio);
    if (!res.ok) throw new Error(`Could not load the audio file (HTTP ${res.status}).`);
    return res.arrayBuffer();
  }

  /** Decoded AudioBuffer for playback; caches only the most recent song. */
  async getAudioBuffer(song) {
    if (this.loaded.id === song.id && this.loaded.buffer) return this.loaded.buffer;
    this.releaseAudio();
    let buffer;
    if (song.source === 'procedural') {
      buffer = await renderDemoSong(this.audio.ensure().sampleRate);
    } else {
      const data = await this.getAudioData(song);
      try {
        buffer = await this.audio.decode(data);
      } catch (err) {
        const ext = extensionOf(song.file || song.audio || '').toUpperCase() || 'this';
        throw new Error(
          `This browser could not decode the ${ext} file (${err?.message || 'decode error'}). ` +
            `Format support reported: "${this.canPlay(song) || 'no'}". Convert it to MP3 or AAC (M4A) and try again.`,
        );
      }
    }
    this.loaded = { id: song.id, buffer };
    return buffer;
  }

  releaseAudio() {
    this.loaded = { id: null, buffer: null };
  }

  /** Re-run analysis + chart generation in the browser and store the result. */
  async recompile(song, settings, onProgress = () => {}) {
    const s = normalizeCompileSettings(settings);
    let analysis;
    if (song.source === 'procedural') {
      onProgress(0.1, 'Synthesising demo track');
      const buffer = await this.getAudioBuffer(song);
      const ch = buffer.numberOfChannels > 1 ? mix(buffer) : buffer.getChannelData(0);
      analysis = await analyzeAudio(ch, buffer.sampleRate, analysisOptionsFrom(s), (f, stage) => onProgress(0.15 + f * 0.8, stage));
    } else {
      onProgress(0.02, 'Loading audio');
      const data = await this.getAudioData(song);
      onProgress(0.08, 'Decoding audio');
      const decoded = await decodeForAnalysis(data, this.audio);
      analysis = await analyzeAudio(decoded.samples, decoded.sampleRate, analysisOptionsFrom(s), (f, stage) => onProgress(0.1 + f * 0.85, stage));
    }
    onProgress(0.96, 'Generating charts');
    const charts = generateAllDifficulties(analysis, song, s);
    const meta = {
      bpm: analysis.bpm,
      beatsPerBar: analysis.beatsPerBar,
      duration: analysis.duration,
      confidence: analysis.confidence,
      waveform: analysis.waveform,
      difficulties: summarize(charts),
      warnings: [...new Set(DIFFICULTIES.flatMap((d) => charts[d].warnings))],
    };
    await this.saveCharts(song.id, charts);
    if (song.source === 'imported') {
      const rec = this.imported.find((x) => x.id === song.id);
      Object.assign(rec, meta, { settings: s });
      await this.store.put('songs', rec);
    } else {
      const o = { id: song.id, settings: s, meta, compiledAt: Date.now() };
      await this.store.put('overrides', o);
      this.overrides.set(song.id, o);
    }
    onProgress(1, 'Done');
    return { analysis, charts, meta };
  }

  async saveCharts(songId, charts) {
    for (const d of DIFFICULTIES) {
      await this.store.put('charts', { key: `${songId}/${d}`, songId, chart: charts[d] });
      this.chartCache.delete(`${songId}/${d}`);
    }
  }

  /** Remove a browser recompile and go back to the shipped charts. */
  async resetOverride(song) {
    await this.store.deletePrefix('charts', `${song.id}/`);
    await this.store.delete('overrides', song.id);
    this.overrides.delete(song.id);
    for (const d of DIFFICULTIES) this.chartCache.delete(`${song.id}/${d}`);
  }

  async addImported(record, file, charts) {
    try {
      await this.store.put('audio', { id: record.id, blob: file, type: file.type });
    } catch {
      // some older WebKit builds cannot store Blobs; store raw bytes instead
      await this.store.put('audio', { id: record.id, buffer: await file.arrayBuffer(), type: file.type });
    }
    await this.saveCharts(record.id, charts);
    await this.store.put('songs', record);
    this.imported = this.imported.filter((s) => s.id !== record.id).concat(record);
  }

  async deleteImported(song) {
    await this.store.delete('songs', song.id);
    await this.store.delete('audio', song.id);
    await this.store.deletePrefix('charts', `${song.id}/`);
    this.imported = this.imported.filter((s) => s.id !== song.id);
    if (this.loaded.id === song.id) this.releaseAudio();
    for (const d of DIFFICULTIES) this.chartCache.delete(`${song.id}/${d}`);
  }

  async clearImported() {
    for (const s of [...this.imported]) await this.deleteImported(s);
  }

  /** Portable JSON bundle with metadata + all charts (no audio). */
  async exportBundle(song) {
    const charts = {};
    for (const d of DIFFICULTIES) charts[d] = await this.getChart(song, d);
    const { waveform, ...meta } = song;
    return {
      format: 'touch-the-beat-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      song: { id: meta.id, title: meta.title, artist: meta.artist, file: meta.file, duration: meta.duration, bpm: meta.bpm, confidence: meta.confidence, waveform },
      charts,
    };
  }
}

function mix(buffer) {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}
