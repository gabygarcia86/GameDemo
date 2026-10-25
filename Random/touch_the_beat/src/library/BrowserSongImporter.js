// In-browser song import: the player picks audio files, they are decoded with
// the browser's own decoders, analysed locally and stored in IndexedDB.
// Nothing is uploaded anywhere.

import { analyzeAudio, ANALYSIS_SAMPLE_RATE, mixToMono } from '../audio/AudioAnalyzer.js';
import { parseBeatMap } from '../charts/BeatMap.js';
import { DIFFICULTIES, analysisOptionsFrom, generateAllDifficulties, normalizeCompileSettings } from '../charts/DifficultyGenerator.js';
import { hashString } from '../charts/Random.js';
import { AUDIO_TYPES, extensionOf, isAudioFileName, mimeFor, parseSongFileName, songIdFor } from './songMeta.js';

const MAX_FILE_MB = 80;

function channelsOf(buffer) {
  const out = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) out.push(buffer.getChannelData(c));
  return out;
}

function decodeWith(ctx, data) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (b) => !settled && ((settled = true), resolve(b));
    const fail = (e) => !settled && ((settled = true), reject(e || new Error('decode failed')));
    try {
      const p = ctx.decodeAudioData(data, ok, fail);
      if (p && typeof p.then === 'function') p.then(ok, fail);
    } catch (err) {
      fail(err);
    }
  });
}

/**
 * Decode compressed audio into mono samples for analysis. Uses an
 * OfflineAudioContext at the analysis rate so the browser resamples natively;
 * falls back to the playback context if that rate is not supported.
 */
export async function decodeForAnalysis(arrayBuffer, audio) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OAC) {
    try {
      const offline = new OAC(1, 1, ANALYSIS_SAMPLE_RATE);
      const buf = await decodeWith(offline, arrayBuffer.slice(0));
      return { samples: mixToMono(channelsOf(buf)), sampleRate: buf.sampleRate, duration: buf.duration };
    } catch {
      /* fall through to the realtime context */
    }
  }
  const buf = await audio.decode(arrayBuffer.slice(0));
  return { samples: mixToMono(channelsOf(buf)), sampleRate: buf.sampleRate, duration: buf.duration };
}

export class BrowserSongImporter {
  constructor(library, audio) {
    this.library = library;
    this.audio = audio;
  }

  /** What this browser says it can play, for the import dialog. */
  supportReport() {
    const probe = new Audio();
    const seen = new Set();
    const rows = [];
    for (const [ext, mime] of Object.entries(AUDIO_TYPES)) {
      if (seen.has(mime)) continue;
      seen.add(mime);
      rows.push({ ext, mime, support: probe.canPlayType(mime) });
    }
    return rows;
  }

  /**
   * Import files (audio, plus optional exported chart bundles).
   * @param {File[]} files
   * @param {(info:{index:number,total:number,name:string,fraction:number,stage:string})=>void} onProgress
   */
  async importFiles(files, { settings = {}, onProgress = () => {}, isCancelled = () => false } = {}) {
    const s = normalizeCompileSettings(settings);
    const bundles = new Map();
    for (const f of files.filter((f) => /\.json$/i.test(f.name))) {
      try {
        const b = JSON.parse(await f.text());
        if (b.format === 'touch-the-beat-bundle' && b.song?.file) bundles.set(b.song.file, b);
      } catch {
        /* ignore unrelated json */
      }
    }
    const audioFiles = files.filter((f) => isAudioFileName(f.name) || (f.type || '').startsWith('audio/'));
    const imported = [];
    const failed = [];
    for (let i = 0; i < audioFiles.length; i++) {
      if (isCancelled()) break;
      const file = audioFiles[i];
      const report = (fraction, stage) => onProgress({ index: i, total: audioFiles.length, name: file.name, fraction, stage });
      try {
        report(0, 'Reading file');
        if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_FILE_MB} MB.`);
        const data = await file.arrayBuffer();
        const { artist, title } = parseSongFileName(file.name);
        const id = `local-${songIdFor(artist, title)}-${hashString(`${file.name}|${file.size}`).toString(36).slice(0, 5)}`;
        report(0.04, 'Decoding audio');
        let decoded;
        try {
          decoded = await decodeForAnalysis(data, this.audio);
        } catch (err) {
          const ext = extensionOf(file.name).toUpperCase() || 'this';
          const support = new Audio().canPlayType(file.type || mimeFor(file.name)) || 'no';
          throw new Error(`This browser cannot decode ${ext} audio (support: "${support}"). Convert it to MP3, AAC/M4A or WAV.`);
        }
        const song = { id, title, artist };
        const bundle = bundles.get(file.name);
        let charts;
        let analysisMeta;
        if (bundle) {
          report(0.6, 'Using exported charts');
          charts = {};
          for (const d of DIFFICULTIES) charts[d] = { ...parseBeatMap(bundle.charts[d]), songId: id };
          analysisMeta = { bpm: bundle.song.bpm, beatsPerBar: charts.normal.beatsPerBar, confidence: bundle.song.confidence, waveform: bundle.song.waveform || [] };
        } else {
          const analysis = await analyzeAudio(decoded.samples, decoded.sampleRate, analysisOptionsFrom(s), (f, stage) => report(0.05 + f * 0.9, stage));
          report(0.96, 'Generating charts');
          charts = generateAllDifficulties(analysis, song, s);
          analysisMeta = { bpm: analysis.bpm, beatsPerBar: analysis.beatsPerBar, confidence: analysis.confidence, waveform: analysis.waveform };
        }
        const difficulties = {};
        for (const d of DIFFICULTIES) {
          const st = charts[d].stats || {};
          difficulties[d] = { notes: charts[d].notes.length, nps: st.nps || 0, holds: st.holdCount || 0, chords: st.chordCount || 0 };
        }
        const record = {
          id,
          title,
          artist,
          source: 'imported',
          file: file.name,
          mime: file.type || mimeFor(file.name),
          size: file.size,
          duration: decoded.duration,
          ...analysisMeta,
          difficulties,
          warnings: [...new Set(DIFFICULTIES.flatMap((d) => charts[d].warnings || []))],
          settings: s,
          importedAt: Date.now(),
        };
        report(0.98, 'Saving on this device');
        await this.library.addImported(record, file, charts);
        imported.push(record);
      } catch (err) {
        console.warn('Import failed', file.name, err);
        failed.push({ name: file.name, error: err.message || String(err) });
      }
    }
    if (!audioFiles.length && bundles.size) {
      failed.push({ name: 'Chart bundle', error: 'Select the matching audio file together with the exported .json bundle.' });
    }
    return { imported, failed };
  }
}
