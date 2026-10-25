#!/usr/bin/env node
// Touch the Beat — offline song compiler.
//
// Scans the songs directory (default: assets/music), analyses every supported
// audio file, generates easy/normal/hard beat maps and writes:
//
//   public/charts/<songId>/{easy,normal,hard}.json
//   public/metadata/library.json        (song manifest loaded by the game)
//
// Unchanged songs are skipped (content + settings hash), so re-running after
// adding files only compiles the new ones. Run with --help for options.

import { createHash } from 'node:crypto';
import { existsSync, watch } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeAudio, ANALYZER_VERSION } from '../src/audio/AudioAnalyzer.js';
import { demoAnalysis, DEMO_SONG, DEMO_DURATION } from '../src/audio/DemoComposition.js';
import { GENERATOR_VERSION } from '../src/charts/ChartGenerator.js';
import {
  DIFFICULTIES,
  analysisOptionsFrom,
  generateAllDifficulties,
  normalizeCompileSettings,
} from '../src/charts/DifficultyGenerator.js';
import { extensionOf, isAudioFileName, mimeFor, parseSongFileName, songIdFor } from '../src/library/songMeta.js';
import { decodeAudioFile, hasFfmpeg } from './lib/decode-audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `
Touch the Beat song compiler

Usage: node tools/compile-songs.js [options]
       npm run compile -- [options]

Options
  --songs <dir>        Songs directory to scan (default: assets/music)
  --out <dir>          Output directory (default: public)
  --config <file>      Per-song overrides JSON (default: songs.config.json)
  --only <text>        Only (re)compile files whose name contains <text>
  --force              Recompile even if nothing changed
  --copy-audio         Copy audio into <out>/audio instead of referencing it
  --watch              Keep running and recompile when the songs folder changes
  --density <n>        Note density multiplier 0.5-1.6 (default 1)
  --sensitivity <n>    Onset sensitivity 0.5-2 (default 1)
  --bpm <n>            Tempo hint for every song (default: auto)
  --offset <ms>        Chart offset in milliseconds (default 0)
  --seed <n>           Lane pattern variation seed (default 0)
  --no-holds           Disable hold notes
  --no-chords          Disable chords
  --help               Show this help

Per-song overrides (songs.config.json), keyed by file name:
  { "Artist - Title.mp3": { "bpm": 98, "offsetMs": -20, "density": 0.9,
                            "sensitivity": 1.2, "seed": 3, "beatsPerBar": 3,
                            "title": "Display Title", "artist": "Display Artist" } }
`;

function parseArgs(argv) {
  const opts = { songs: 'assets/music', out: 'public', config: 'songs.config.json', settings: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--songs': opts.songs = next(); break;
      case '--out': opts.out = next(); break;
      case '--config': opts.config = next(); break;
      case '--only': opts.only = next().toLowerCase(); break;
      case '--force': opts.force = true; break;
      case '--copy-audio': opts.copyAudio = true; break;
      case '--watch': opts.watch = true; break;
      case '--density': opts.settings.density = Number(next()); break;
      case '--sensitivity': opts.settings.sensitivity = Number(next()); break;
      case '--bpm': opts.settings.bpmHint = Number(next()); break;
      case '--offset': opts.settings.offsetMs = Number(next()); break;
      case '--seed': opts.settings.seed = Number(next()); break;
      case '--no-holds': opts.settings.holds = false; break;
      case '--no-chords': opts.settings.chords = false; break;
      case '--help': case '-h': opts.help = true; break;
      default: throw new Error(`Unknown option ${a} (see --help)`);
    }
  }
  return opts;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && isAudioFileName(entry.name)) out.push(full);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

const toWebPath = (p) => p.split(path.sep).map(encodeURIComponent).join('/');
const relWeb = (file) => toWebPath(path.relative(ROOT, file));

async function writeCharts(outDir, songId, charts) {
  const dir = path.join(outDir, 'charts', songId);
  await mkdir(dir, { recursive: true });
  const paths = {};
  for (const d of DIFFICULTIES) {
    const file = path.join(dir, `${d}.json`);
    await writeFile(file, JSON.stringify(charts[d]) + '\n');
    paths[d] = relWeb(file);
  }
  return paths;
}

function difficultySummary(charts) {
  const out = {};
  for (const d of DIFFICULTIES) {
    const s = charts[d].stats;
    out[d] = { notes: s.noteCount, nps: s.nps, holds: s.holdCount, chords: s.chordCount };
  }
  return out;
}

async function compileDemo(outDir) {
  const analysis = demoAnalysis();
  const charts = generateAllDifficulties(analysis, DEMO_SONG, normalizeCompileSettings({}));
  const paths = await writeCharts(outDir, DEMO_SONG.id, charts);
  return {
    id: DEMO_SONG.id,
    title: DEMO_SONG.title,
    artist: DEMO_SONG.artist,
    source: 'procedural',
    procedural: DEMO_SONG.id,
    audio: null,
    duration: Math.round(DEMO_DURATION * 1000) / 1000,
    bpm: DEMO_SONG.bpm,
    beatsPerBar: DEMO_SONG.beatsPerBar,
    confidence: analysis.confidence,
    waveform: analysis.waveform,
    charts: paths,
    difficulties: difficultySummary(charts),
  };
}

async function compileSong(file, ctx) {
  const name = path.basename(file);
  const override = ctx.config[name] || {};
  const parsed = parseSongFileName(name);
  const artist = override.artist || parsed.artist;
  const title = override.title || parsed.title;
  const id = override.id || songIdFor(artist, title);
  const settings = normalizeCompileSettings({ ...ctx.settings, ...override });
  const content = await readFile(file);
  const hash = createHash('sha1')
    .update(content)
    .update(JSON.stringify(settings))
    .update(`${ANALYZER_VERSION}|${GENERATOR_VERSION}|${ctx.copyAudio ? 'copy' : 'ref'}`)
    .digest('hex')
    .slice(0, 16);

  const previous = ctx.previous.get(id);
  const chartsExist = DIFFICULTIES.every((d) => existsSync(path.join(ctx.outDir, 'charts', id, `${d}.json`)));
  const wanted = !ctx.only || name.toLowerCase().includes(ctx.only);
  if (previous && chartsExist && (!wanted || (!ctx.force && previous.sourceHash === hash))) {
    return { entry: previous, status: 'cached' };
  }
  if (!wanted) return { entry: null, status: 'skipped' };

  const started = Date.now();
  const { samples, sampleRate } = await decodeAudioFile(file, { useFfmpeg: ctx.ffmpeg });
  let lastPct = -1;
  const analysis = await analyzeAudio(samples, sampleRate, analysisOptionsFrom(settings), (f) => {
    const pct = Math.floor(f * 10);
    if (pct !== lastPct && process.stdout.isTTY) {
      lastPct = pct;
      process.stdout.write(`\r  analysing ${name.slice(0, 48).padEnd(48)} ${String(pct * 10).padStart(3)}%`);
    }
  });
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(70) + '\r');
  const song = { id, title, artist };
  const charts = generateAllDifficulties(analysis, song, settings);
  const chartPaths = await writeCharts(ctx.outDir, id, charts);

  let audioPath = relWeb(file);
  const ext = extensionOf(name);
  if (ctx.copyAudio) {
    const dest = path.join(ctx.outDir, 'audio', `${id}.${ext}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(file, dest);
    audioPath = relWeb(dest);
  }
  const fileStat = await stat(file);
  const entry = {
    id,
    title,
    artist,
    source: 'builtin',
    file: name,
    audio: audioPath,
    format: ext,
    mime: mimeFor(name),
    size: fileStat.size,
    duration: Math.round(analysis.duration * 1000) / 1000,
    bpm: analysis.bpm,
    beatsPerBar: analysis.beatsPerBar,
    confidence: analysis.confidence,
    waveform: analysis.waveform,
    charts: chartPaths,
    difficulties: difficultySummary(charts),
    warnings: [...new Set(DIFFICULTIES.flatMap((d) => charts[d].warnings))],
    settings,
    sourceHash: hash,
  };
  return { entry, status: 'compiled', seconds: (Date.now() - started) / 1000 };
}

async function run(opts) {
  const songsDir = path.resolve(ROOT, opts.songs);
  const outDir = path.resolve(ROOT, opts.out);
  const metaFile = path.join(outDir, 'metadata', 'library.json');
  if (!existsSync(songsDir)) throw new Error(`Songs directory not found: ${songsDir}`);

  const ffmpeg = await hasFfmpeg();
  if (!ffmpeg) console.warn('! ffmpeg not found: only .wav files can be decoded. See README > Troubleshooting.');

  const library = await readJson(metaFile, { songs: [] });
  const previous = new Map((library.songs || []).map((s) => [s.id, s]));
  const config = await readJson(path.resolve(ROOT, opts.config), {});
  const ctx = { outDir, previous, config, settings: opts.settings, force: opts.force, only: opts.only, copyAudio: opts.copyAudio, ffmpeg };

  const files = await walk(songsDir);
  console.log(`Touch the Beat compiler — ${files.length} audio file(s) in ${path.relative(ROOT, songsDir) || '.'}`);

  const songs = [await compileDemo(outDir)];
  const failures = [];
  const seen = new Set([DEMO_SONG.id]);
  for (const file of files) {
    const name = path.basename(file);
    try {
      const { entry, status, seconds } = await compileSong(file, ctx);
      if (!entry) continue;
      if (seen.has(entry.id)) {
        console.warn(`! duplicate song id "${entry.id}" for ${name}; set a unique "id" in songs.config.json`);
        continue;
      }
      seen.add(entry.id);
      songs.push(entry);
      const d = entry.difficulties;
      const tag = status === 'cached' ? 'cached  ' : `${seconds.toFixed(1).padStart(5)}s  `;
      console.log(
        `  ${tag}${name.slice(0, 46).padEnd(46)} ${String(entry.bpm.toFixed(1)).padStart(6)} bpm  conf ${Math.round(entry.confidence.overall * 100)
          .toString()
          .padStart(3)}%  notes ${d.easy.notes}/${d.normal.notes}/${d.hard.notes}`,
      );
      for (const w of status === 'compiled' ? entry.warnings : []) console.log(`           ! ${w}`);
    } catch (err) {
      failures.push({ name, error: err.message });
      console.error(`  FAILED   ${name}: ${err.message}`);
    }
  }

  // remove charts of songs that no longer exist
  for (const id of previous.keys()) {
    if (seen.has(id)) continue;
    const dir = path.join(outDir, 'charts', id);
    if (path.dirname(dir) === path.join(outDir, 'charts') && existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      console.log(`  removed  charts for "${id}" (audio file no longer present)`);
    }
  }

  const demo = songs.shift();
  songs.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  songs.unshift(demo);
  const manifest = {
    version: 1,
    generator: { name: 'touch-the-beat-compiler', analyzer: ANALYZER_VERSION, chartgen: GENERATOR_VERSION },
    generatedAt: new Date().toISOString(),
    songs,
  };
  await mkdir(path.dirname(metaFile), { recursive: true });
  await writeFile(metaFile, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`Wrote ${path.relative(ROOT, metaFile)} with ${songs.length} song(s).${failures.length ? ` ${failures.length} failed.` : ''}`);
  return failures.length === 0;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }
  const ok = await run(opts).catch((err) => {
    console.error(`Error: ${err.message}`);
    return false;
  });
  if (!opts.watch) {
    process.exitCode = ok ? 0 : 1;
    return;
  }
  const songsDir = path.resolve(ROOT, opts.songs);
  console.log(`Watching ${path.relative(ROOT, songsDir)} for changes (Ctrl+C to stop)...`);
  let timer = null;
  let running = false;
  watch(songsDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      await run({ ...opts, force: false }).catch((err) => console.error(`Error: ${err.message}`));
      running = false;
    }, 1500);
  });
}

main();
