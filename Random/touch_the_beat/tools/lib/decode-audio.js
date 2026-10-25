// Audio decoding for the offline compiler.
//
// - Any format ffmpeg understands (MP3, OGG, M4A/AAC, FLAC, Opus, WAV, ...)
//   is decoded through ffmpeg straight to 22.05 kHz mono float PCM.
// - If ffmpeg is not installed, plain PCM/float WAV files are still decoded
//   with the built-in parser below. Everything else needs ffmpeg (or the
//   in-browser importer, which uses the browser's own decoders).

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { ANALYSIS_SAMPLE_RATE } from '../../src/audio/AudioAnalyzer.js';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export async function hasFfmpeg() {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

export async function decodeAudioFile(path, { useFfmpeg = true } = {}) {
  if (useFfmpeg) {
    try {
      return await decodeWithFfmpeg(path);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  if (/\.wav$/i.test(path)) return decodeWav(await readFile(path));
  throw new Error(
    'ffmpeg was not found, so only .wav files can be decoded. Install ffmpeg (https://ffmpeg.org) ' +
      'and make sure it is on PATH, set FFMPEG_PATH, or import the song in the browser instead.',
  );
}

function decodeWithFfmpeg(path) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-nostdin', '-i', path, '-vn', '-ac', '1', '-ar', String(ANALYSIS_SAMPLE_RATE), '-f', 'f32le', 'pipe:1'];
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg could not decode the file (exit ${code}): ${stderr.trim() || 'unknown error'}`));
      const buf = Buffer.concat(chunks);
      const usable = buf.byteLength - (buf.byteLength % 4);
      const samples = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable));
      if (!samples.length) return reject(new Error('ffmpeg produced no audio samples'));
      resolve({ samples, sampleRate: ANALYSIS_SAMPLE_RATE });
    });
  });
}

/** Minimal RIFF/WAVE decoder: PCM 8/16/24/32-bit and IEEE float 32/64-bit. */
export function decodeWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= view.byteLength; ) {
    const id = tag(o);
    const size = view.getUint32(o + 4, true);
    if (id === 'fmt ') {
      let format = view.getUint16(o + 8, true);
      if (format === 0xfffe) format = view.getUint16(o + 32, true); // WAVE_FORMAT_EXTENSIBLE subformat
      fmt = {
        format,
        channels: view.getUint16(o + 10, true),
        sampleRate: view.getUint32(o + 12, true),
        bits: view.getUint16(o + 22, true),
      };
    } else if (id === 'data') {
      data = { offset: o + 8, size: Math.min(size, view.byteLength - o - 8) };
    }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV file is missing fmt or data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.size / (bytes * channels));
  const out = new Float32Array(frames);
  const read = (o) => {
    if (format === 3) return bits === 64 ? view.getFloat64(o, true) : view.getFloat32(o, true);
    if (format !== 1) throw new Error(`Unsupported WAV encoding (format ${format})`);
    switch (bits) {
      case 8: return (view.getUint8(o) - 128) / 128;
      case 16: return view.getInt16(o, true) / 32768;
      case 24: {
        const v = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getInt8(o + 2) << 16);
        return v / 8388608;
      }
      case 32: return view.getInt32(o, true) / 2147483648;
      default: throw new Error(`Unsupported WAV bit depth ${bits}`);
    }
  };
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += read(data.offset + (f * channels + c) * bytes);
    out[f] = s / channels;
  }
  return { samples: out, sampleRate };
}
