// Heuristic music analysis used to build beat maps automatically.
//
// Pipeline (identical in the browser and in the Node.js compiler):
//   1. mono signal, resampled to 22.05 kHz
//   2. STFT -> per-band log-magnitude spectral flux, RMS energy and chroma
//   3. onset detection function + adaptive-threshold peak picking
//   4. tempo estimate from ODF autocorrelation with a log-tempo prior
//   5. beat tracking with dynamic programming (Ellis 2007 style)
//   6. meter / downbeat estimate from bass accents + harmonic change
//   7. phrase/section energy profile
//   8. onset quantisation to a beat-relative grid (only when close enough)
//   9. confidence scores
//
// None of this "understands" music. It is a set of well-known heuristics that
// work well on music with clear percussion and less well on rubato ballads.
// Every stage reports confidence so the UI can tell the player when to tweak
// compile settings.

import { FFT, hannWindow } from './fft.js';

export const ANALYZER_VERSION = '1.0.0';
export const ANALYSIS_SAMPLE_RATE = 22050;

export const DEFAULT_ANALYSIS_SETTINGS = Object.freeze({
  sensitivity: 1, // > 1 detects more (quieter) onsets, < 1 fewer
  minBpm: 70,
  maxBpm: 185,
  bpmHint: 0, // 0 = automatic; otherwise search within ±4 % of this tempo
  beatsPerBar: 0, // 0 = automatic (chooses 4 or 3)
});

const FFT_SIZE = 1024;
const HOP = 256;
const BAND_EDGES_HZ = [30, 160, 600, 2500, 10000];
const BAND_WEIGHTS = [1.0, 1.0, 0.85, 0.65];
const LOG_COMPRESSION = 100;
const ENVELOPE_RATE = 20; // loudness envelope samples per second
const WAVEFORM_POINTS = 120;
// With centred Hann frames the rectified flux peaks slightly before the true
// attack. Measured with synthetic drum tracks in tools/selftest.js.
const ONSET_SHIFT = 0.0055;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------- utilities

export function mixToMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  const g = 1 / channels.length;
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] * g;
  return out;
}

/** Resample with a box pre-filter when downsampling (good enough for analysis). */
export function resample(x, fromRate, toRate) {
  if (fromRate === toRate) return x;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(x.length / ratio);
  const out = new Float32Array(outLen);
  if (ratio <= 1) {
    for (let i = 0; i < outLen; i++) {
      const p = i * ratio;
      const i0 = Math.floor(p);
      const f = p - i0;
      const a = x[i0];
      const b = i0 + 1 < x.length ? x[i0 + 1] : a;
      out[i] = a + (b - a) * f;
    }
    return out;
  }
  const half = ratio / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < outLen; i++) {
    const c = i * ratio;
    const a = Math.max(0, Math.floor(c - half));
    const b = Math.min(x.length, Math.floor(c + half) + 1);
    while (hi < b) sum += x[hi++];
    while (lo < a) sum -= x[lo++];
    out[i] = sum / (hi - lo || 1);
  }
  return out;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = Float64Array.from(arr).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

function median(arr) {
  return percentile(arr, 0.5);
}

function movingAverage(x, radius) {
  const n = x.length;
  const out = new Float32Array(n);
  let sum = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    while (hi < b) sum += x[hi++];
    while (lo < a) sum -= x[lo++];
    out[i] = sum / (hi - lo);
  }
  return out;
}

// ---------------------------------------------------------- feature stage

async function spectralFeatures(x, sr, progress) {
  const n = x.length;
  const frames = Math.max(1, Math.ceil(n / HOP));
  const half = FFT_SIZE / 2;
  const fft = new FFT(FFT_SIZE);
  const win = hannWindow(FFT_SIZE);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const prev = new Float64Array(half + 1);
  const binHz = sr / FFT_SIZE;
  const nBands = BAND_EDGES_HZ.length - 1;

  const bandOf = new Int8Array(half + 1).fill(-1);
  const bandBins = new Float64Array(nBands);
  const pitchClassOf = new Int8Array(half + 1).fill(-1);
  for (let k = 1; k <= half; k++) {
    const f = k * binHz;
    for (let b = 0; b < nBands; b++) {
      if (f >= BAND_EDGES_HZ[b] && f < BAND_EDGES_HZ[b + 1]) {
        bandOf[k] = b;
        bandBins[b]++;
      }
    }
    if (f >= 80 && f <= 2000) {
      const midi = 69 + 12 * Math.log2(f / 440);
      pitchClassOf[k] = ((Math.round(midi) % 12) + 12) % 12;
    }
  }

  const flux = Array.from({ length: nBands }, () => new Float32Array(frames));
  const rms = new Float32Array(frames);
  const chroma = new Float32Array(frames * 12);
  const acc = new Float64Array(nBands);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP - half;
    let sumSq = 0;
    for (let j = 0; j < FFT_SIZE; j++) {
      const idx = start + j;
      const v = idx >= 0 && idx < n ? x[idx] : 0;
      re[j] = v * win[j];
      im[j] = 0;
      sumSq += v * v;
    }
    fft.transform(re, im);
    acc.fill(0);
    const cBase = f * 12;
    for (let k = 1; k <= half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / half;
      const L = Math.log1p(LOG_COMPRESSION * mag);
      const d = L - prev[k];
      prev[k] = L;
      const b = bandOf[k];
      if (b >= 0 && d > 0) acc[b] += d;
      const pc = pitchClassOf[k];
      if (pc >= 0) chroma[cBase + pc] += mag;
    }
    for (let b = 0; b < nBands; b++) flux[b][f] = acc[b] / bandBins[b];
    rms[f] = Math.sqrt(sumSq / FFT_SIZE);
    if ((f & 2047) === 2047) {
      progress(0.05 + 0.5 * (f / frames), 'Measuring spectrum');
      await tick();
    }
  }
  return { flux, rms, chroma, frames, fps: sr / HOP };
}

// --------------------------------------------------------- onset stage

function buildOdf(flux, frames) {
  const nBands = flux.length;
  const norm = flux.map((band) => percentile(band, 0.98) || 1e-9);
  const bandN = flux.map((band, b) => {
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) out[i] = band[i] / norm[b];
    return out;
  });
  const odf = new Float32Array(frames);
  const wSum = BAND_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let b = 0; b < nBands; b++) v += BAND_WEIGHTS[b] * bandN[b][i];
    odf[i] = v / wSum;
  }
  const scale = percentile(odf, 0.99) || 1;
  for (let i = 0; i < frames; i++) odf[i] /= scale;
  return { odf, bandN };
}

function pickPeaks(odf, fps, sensitivity) {
  const n = odf.length;
  const wMax = 3;
  const wPre = Math.round(0.12 * fps);
  const wPost = Math.round(0.08 * fps);
  const minDist = Math.max(1, Math.round(0.045 * fps));
  const delta = 0.09 / sensitivity;
  const floor = 0.1 / sensitivity;
  const peaks = [];
  // running sum for the adaptive threshold
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + odf[i];
  for (let i = 1; i < n - 1; i++) {
    const v = odf[i];
    if (v < floor) continue;
    let isMax = true;
    for (let j = Math.max(0, i - wMax); j <= Math.min(n - 1, i + wMax); j++) {
      if (odf[j] > v || (j < i && odf[j] === v)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const a = Math.max(0, i - wPre);
    const b = Math.min(n, i + wPost + 1);
    const mean = (cum[b] - cum[a]) / (b - a);
    if (v < mean + delta) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < minDist) {
      if (v > odf[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

function interpolatePeak(arr, i) {
  if (i <= 0 || i >= arr.length - 1) return 0;
  const a = arr[i - 1];
  const b = arr[i];
  const c = arr[i + 1];
  const den = a - 2 * b + c;
  return den === 0 ? 0 : clamp((0.5 * (a - c)) / den, -0.5, 0.5);
}

// ----------------------------------------------------------- tempo stage

function estimateTempo(odf, fps, settings) {
  const n = odf.length;
  // high-pass the onset envelope so slow loudness changes don't dominate
  const local = movingAverage(odf, Math.round(fps * 0.4));
  const hp = new Float32Array(n);
  for (let i = 0; i < n; i++) hp[i] = Math.max(0, odf[i] - local[i]);
  // widen the peaks a little so periods that fall between integer lags
  // are not split across two autocorrelation bins
  const kernel = [1, 2, 3, 2, 1];
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < n) v += hp[j] * kernel[k + 2];
    }
    o[i] = v / 9;
  }

  let minBpm = settings.minBpm;
  let maxBpm = settings.maxBpm;
  const hinted = settings.bpmHint > 0;
  if (hinted) {
    minBpm = settings.bpmHint * 0.96;
    maxBpm = settings.bpmHint * 1.04;
  }
  const minLag = Math.max(2, Math.floor((60 * fps) / maxBpm));
  const maxLag = Math.ceil((60 * fps) / minBpm);
  const maxCalc = Math.min(n - 2, maxLag * 2 + 2);
  const ac = new Float64Array(maxCalc + 1);
  for (let l = 0; l <= maxCalc; l++) {
    let s = 0;
    for (let i = 0, m = n - l; i < m; i++) s += o[i] * o[i + l];
    ac[l] = s / (n - l);
  }
  const acAt = (lag) => {
    const i = Math.floor(lag);
    if (i + 1 > maxCalc) return 0;
    const f = lag - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };

  const scores = new Float64Array(maxLag + 2);
  let best = -1;
  let bestScore = -Infinity;
  for (let l = minLag; l <= maxLag; l++) {
    const bpm = (60 * fps) / l;
    const prior = hinted ? 1 : Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const s = (ac[l] + 0.5 * acAt(2 * l)) * prior;
    scores[l] = s;
    if (s > bestScore) {
      bestScore = s;
      best = l;
    }
  }
  let period = best;
  if (best > minLag && best < maxLag) {
    const a = scores[best - 1];
    const b = scores[best];
    const c = scores[best + 1];
    const den = a - 2 * b + c;
    if (den !== 0) period = best + clamp((0.5 * (a - c)) / den, -0.5, 0.5);
  }

  // confidence: how far the winning lag stands out from the typical lag
  const inRange = Array.from(ac.slice(minLag, maxLag + 1));
  const med = median(inRange);
  const peak = acAt(period);
  const tempoConfidence = clamp(((peak - med) / (ac[0] - med + 1e-12)) * 2.2, 0, 1);
  return { period, bpm: (60 * fps) / period, tempoConfidence };
}

// ------------------------------------------------------------ beat stage

function trackBeats(odf, period, fps) {
  const n = odf.length;
  // local score: ODF smoothed by a narrow gaussian, normalised by its std
  const sigma = Math.max(1, period / 32);
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  for (let k = -radius; k <= radius; k++) kernel.push(Math.exp(-0.5 * (k / sigma) ** 2));
  const ls = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += odf[j] * kernel[k + radius];
    }
    ls[i] = s;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += ls[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (ls[i] - mean) ** 2;
  const std = Math.sqrt(variance / n) || 1;
  for (let i = 0; i < n; i++) ls[i] /= std;

  const tightness = 100;
  const lo = Math.max(1, Math.round(period / 2));
  const hi = Math.round(period * 2);
  const txcost = new Float64Array(hi + 1);
  for (let d = lo; d <= hi; d++) txcost[d] = -tightness * Math.log(d / period) ** 2;

  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let arg = -1;
    for (let d = lo; d <= hi; d++) {
      const j = i - d;
      if (j < 0) break;
      const v = cum[j] + txcost[d];
      if (v > best) {
        best = v;
        arg = j;
      }
    }
    cum[i] = ls[i] + (arg >= 0 ? best : 0);
    back[i] = arg;
  }

  // last beat: final local maximum of the cumulative score above half the median
  const maxima = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(i);
  let last = n - 1;
  if (maxima.length) {
    const threshold = 0.5 * median(maxima.map((i) => cum[i]));
    for (let k = maxima.length - 1; k >= 0; k--) {
      if (cum[maxima[k]] >= threshold) {
        last = maxima[k];
        break;
      }
    }
  }
  const beats = [];
  for (let i = last; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();

  let beatMean = 0;
  for (const b of beats) beatMean += ls[b];
  beatMean /= beats.length || 1;
  const overallMean = mean / std;
  const ratio = beatMean / (overallMean || 1);
  const beatConfidence = clamp((ratio - 1) / 1.6, 0, 1);
  return { beatFrames: beats, beatConfidence };
}

// ------------------------------------------------- meter / downbeat stage

function harmonicChange(chroma, a0, a1, b0, b1) {
  const va = new Float64Array(12);
  const vb = new Float64Array(12);
  for (let f = a0; f < a1; f++) for (let c = 0; c < 12; c++) va[c] += chroma[f * 12 + c];
  for (let f = b0; f < b1; f++) for (let c = 0; c < 12; c++) vb[c] += chroma[f * 12 + c];
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let c = 0; c < 12; c++) {
    dot += va[c] * vb[c];
    na += va[c] * va[c];
    nb += vb[c] * vb[c];
  }
  if (na === 0 || nb === 0) return 0;
  return 1 - dot / Math.sqrt(na * nb);
}

function estimateMeter(beatFrames, bandN, odf, chroma, frames, forced) {
  const nb = beatFrames.length;
  if (nb < 8) return { beatsPerBar: forced || 4, phase: 0, confidence: 0 };
  const feat = new Float64Array(nb);
  const low = bandN[0];
  const hc = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    const f = beatFrames[i];
    let lowMax = 0;
    for (let j = Math.max(0, f - 2); j <= Math.min(frames - 1, f + 2); j++) lowMax = Math.max(lowMax, low[j]);
    const prev = i > 0 ? beatFrames[i - 1] : Math.max(0, f - (beatFrames[1] - beatFrames[0]));
    const next = i < nb - 1 ? beatFrames[i + 1] : Math.min(frames, f + (f - prev));
    hc[i] = harmonicChange(chroma, prev, f, f, next);
    feat[i] = lowMax;
  }
  const hcScale = percentile(hc, 0.9) || 1;
  const lowScale = percentile(feat, 0.9) || 1;
  for (let i = 0; i < nb; i++) feat[i] = 0.55 * (hc[i] / hcScale) + 0.45 * (feat[i] / lowScale);

  const evaluate = (m) => {
    const sums = new Float64Array(m);
    const counts = new Float64Array(m);
    for (let i = 0; i < nb; i++) {
      sums[i % m] += feat[i];
      counts[i % m]++;
    }
    let bestPhase = 0;
    let best = -Infinity;
    let total = 0;
    for (let p = 0; p < m; p++) {
      const v = sums[p] / counts[p];
      total += v;
      if (v > best) {
        best = v;
        bestPhase = p;
      }
    }
    const others = (total - best) / (m - 1);
    return { phase: bestPhase, contrast: best / (others || 1e-9) };
  };

  let beatsPerBar = forced || 4;
  let result = evaluate(beatsPerBar);
  if (!forced) {
    const r3 = evaluate(3);
    if (r3.contrast > result.contrast * 1.15) {
      beatsPerBar = 3;
      result = r3;
    }
  }
  return {
    beatsPerBar,
    phase: result.phase,
    confidence: clamp((result.contrast - 1) / 0.6, 0, 1),
  };
}

// -------------------------------------------------------- section stage

function buildEnvelope(rms, fps, duration) {
  const count = Math.max(1, Math.ceil(duration * ENVELOPE_RATE));
  const env = new Float32Array(count);
  const per = fps / ENVELOPE_RATE;
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * per);
    const b = Math.min(rms.length, Math.max(a + 1, Math.floor((i + 1) * per)));
    let s = 0;
    for (let j = a; j < b; j++) s += rms[j];
    env[i] = s / Math.max(1, b - a);
  }
  const ref = percentile(env, 0.95) || 1e-9;
  for (let i = 0; i < count; i++) env[i] = Math.min(1.5, env[i] / ref);
  return env;
}

function envelopeMean(env, t0, t1, rate = ENVELOPE_RATE) {
  const a = clamp(Math.floor(t0 * rate), 0, env.length - 1);
  const b = clamp(Math.ceil(t1 * rate), a + 1, env.length);
  let s = 0;
  for (let i = a; i < b; i++) s += env[i];
  return s / (b - a);
}

function buildSections(beats, beatsPerBar, phase, env, duration) {
  const downbeats = [];
  for (let i = phase; i < beats.length; i += beatsPerBar) downbeats.push(beats[i]);
  const phraseStarts = [0];
  for (let i = 0; i < downbeats.length; i += 4) if (downbeats[i] > 0.5) phraseStarts.push(downbeats[i]);
  phraseStarts.push(duration);
  const phrases = [];
  for (let i = 0; i < phraseStarts.length - 1; i++) {
    const start = phraseStarts[i];
    const end = phraseStarts[i + 1];
    if (end - start < 0.25) continue;
    phrases.push({ start, end, energy: envelopeMean(env, start, end) });
  }
  const maxE = Math.max(1e-9, ...phrases.map((p) => p.energy));
  for (const p of phrases) p.energy = Math.min(1, p.energy / maxE);
  const sections = [];
  for (const p of phrases) {
    const last = sections[sections.length - 1];
    if (last && Math.abs(last.energy - p.energy) < 0.15) {
      const w0 = last.end - last.start;
      const w1 = p.end - p.start;
      last.energy = (last.energy * w0 + p.energy * w1) / (w0 + w1);
      last.end = p.end;
    } else {
      sections.push({ ...p });
    }
  }
  return {
    sections: sections.map((s) => ({ start: round3(s.start), end: round3(s.end), energy: Math.round(s.energy * 100) / 100 })),
    phrases: phrases.map((p) => round3(p.start)),
  };
}

// ----------------------------------------------------- quantisation stage

function quantize(t, beats, period, isDownbeat) {
  const nb = beats.length;
  if (!nb) return { gridTime: t, level: 5, snapped: false };
  let i;
  if (t < beats[0]) {
    i = -1;
  } else {
    let lo = 0;
    let hi = nb - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    i = lo;
  }
  const b0 = i >= 0 ? beats[i] : beats[0] - period;
  const b1 = i + 1 < nb ? beats[i + 1] : b0 + period;
  const len = b1 - b0;
  const pos = (t - b0) / len;
  const k16 = Math.round(pos * 4);
  const g16 = b0 + (k16 / 4) * len;
  const k3 = Math.round(pos * 3);
  const g3 = b0 + (k3 / 3) * len;
  const tol = Math.min(0.045, 0.35 * (len / 4));
  if (Math.abs(t - g16) <= tol) {
    if (k16 % 4 === 0) {
      const beatIdx = k16 === 4 ? i + 1 : i;
      return { gridTime: g16, level: beatIdx >= 0 && isDownbeat(beatIdx) ? 0 : 1, snapped: true };
    }
    return { gridTime: g16, level: k16 % 2 === 0 ? 2 : 3, snapped: true };
  }
  if (Math.abs(t - g3) <= tol && k3 % 3 !== 0) return { gridTime: g3, level: 4, snapped: true };
  return { gridTime: t, level: 5, snapped: false };
}

// -------------------------------------------------------------- main API

/**
 * Analyse a mono PCM signal.
 * @param {Float32Array} samples mono samples in [-1, 1]
 * @param {number} sampleRate
 * @param {object} options see DEFAULT_ANALYSIS_SETTINGS
 * @param {(fraction:number, stage:string)=>void} onProgress
 */
export async function analyzeAudio(samples, sampleRate, options = {}, onProgress = () => {}) {
  const settings = { ...DEFAULT_ANALYSIS_SETTINGS, ...options };
  const duration = samples.length / sampleRate;
  if (duration < 5) throw new Error('Audio is shorter than 5 seconds; nothing to chart.');

  onProgress(0.01, 'Preparing audio');
  const x = resample(samples, sampleRate, ANALYSIS_SAMPLE_RATE);
  await tick();

  const feat = await spectralFeatures(x, ANALYSIS_SAMPLE_RATE, onProgress);
  const { fps, frames } = feat;
  onProgress(0.58, 'Detecting onsets');
  await tick();
  const { odf, bandN } = buildOdf(feat.flux, frames);
  const peakFrames = pickPeaks(odf, fps, settings.sensitivity);

  onProgress(0.66, 'Estimating tempo');
  await tick();
  const tempo = estimateTempo(odf, fps, settings);

  onProgress(0.74, 'Tracking beats');
  await tick();
  const { beatFrames, beatConfidence } = trackBeats(odf, tempo.period, fps);

  onProgress(0.82, 'Finding downbeats');
  await tick();
  const meter = estimateMeter(beatFrames, bandN, odf, feat.chroma, frames, settings.beatsPerBar);

  // onset objects with spectral features
  const frameTime = (f) => f / fps + ONSET_SHIFT;
  const onsets = peakFrames.map((f) => {
    const bands = bandN.map((band) => {
      let m = 0;
      for (let j = Math.max(0, f - 1); j <= Math.min(frames - 1, f + 1); j++) m = Math.max(m, band[j]);
      return m;
    });
    return {
      time: frameTime(f + interpolatePeak(odf, f)),
      strength: Math.min(1, odf[f]),
      bands,
    };
  });

  // beat times: snap to a coincident strong onset for sub-frame precision
  let oi = 0;
  const beats = beatFrames.map((bf) => {
    const t = frameTime(bf);
    while (oi < onsets.length && onsets[oi].time < t - 0.03) oi++;
    for (let k = oi; k < onsets.length && onsets[k].time <= t + 0.03; k++) {
      if (onsets[k].strength >= 0.25 && Math.abs(onsets[k].time - t) <= 1.5 / fps) return onsets[k].time;
    }
    return t;
  });
  for (let i = 1; i < beats.length; i++) if (beats[i] <= beats[i - 1]) beats[i] = beats[i - 1] + 0.01;

  const beatStrength = beatFrames.map((bf) => {
    let m = 0;
    for (let j = Math.max(0, bf - 1); j <= Math.min(frames - 1, bf + 1); j++) m = Math.max(m, odf[j]);
    return Math.round(Math.min(1, m) * 1000) / 1000;
  });
  const beatBands = beatFrames.map((bf) => bandN.map((band) => band[Math.min(frames - 1, bf)]));

  const periodSec = tempo.period / fps;
  const isDownbeat = (idx) => ((idx - meter.phase) % meter.beatsPerBar + meter.beatsPerBar) % meter.beatsPerBar === 0;
  let snappedWeight = 0;
  let totalWeight = 0;
  for (const o of onsets) {
    Object.assign(o, quantize(o.time, beats, periodSec, isDownbeat));
    totalWeight += o.strength;
    if (o.snapped && o.level <= 3) snappedWeight += o.strength;
  }

  onProgress(0.9, 'Mapping song structure');
  await tick();
  const envelope = buildEnvelope(feat.rms, fps, duration);
  const { sections, phrases } = buildSections(beats, meter.beatsPerBar, meter.phase, envelope, duration);

  const silence = 0.08;
  let activeStart = 0;
  while (activeStart < envelope.length - 1 && envelope[activeStart] < silence) activeStart++;
  let activeEnd = envelope.length - 1;
  while (activeEnd > 0 && envelope[activeEnd] < silence) activeEnd--;

  const waveform = [];
  const per = envelope.length / WAVEFORM_POINTS;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    let m = 0;
    for (let j = Math.floor(i * per); j < Math.min(envelope.length, Math.floor((i + 1) * per)); j++) m = Math.max(m, envelope[j]);
    waveform.push(Math.round(Math.min(1, m) * 100) / 100);
  }

  const snapRatio = totalWeight ? snappedWeight / totalWeight : 0;
  const snapConfidence = clamp((snapRatio - 0.35) / 0.55, 0, 1);
  const confidence = clamp(0.4 * tempo.tempoConfidence + 0.3 * beatConfidence + 0.3 * snapConfidence, 0, 1);

  onProgress(1, 'Analysis complete');
  return {
    analyzerVersion: ANALYZER_VERSION,
    settings,
    sampleRate,
    duration,
    bpm: Math.round(tempo.bpm * 100) / 100,
    period: periodSec,
    beats: beats.map(round3),
    beatStrength,
    beatBands,
    beatsPerBar: meter.beatsPerBar,
    downbeatPhase: meter.phase,
    onsets,
    sections,
    phrases,
    envelope,
    envelopeRate: ENVELOPE_RATE,
    activeStart: activeStart / ENVELOPE_RATE,
    activeEnd: (activeEnd + 1) / ENVELOPE_RATE,
    waveform,
    confidence: {
      overall: Math.round(confidence * 100) / 100,
      tempo: Math.round(tempo.tempoConfidence * 100) / 100,
      beat: Math.round(beatConfidence * 100) / 100,
      downbeat: Math.round(meter.confidence * 100) / 100,
      grid: Math.round(snapConfidence * 100) / 100,
    },
  };
}

/** Mean of the normalised loudness envelope between two times. */
export function loudnessBetween(analysis, t0, t1) {
  return envelopeMean(analysis.envelope, t0, t1, analysis.envelopeRate);
}

/** Coefficient of variation of the loudness envelope (0 = perfectly steady). */
export function loudnessVariation(analysis, t0, t1) {
  const env = analysis.envelope;
  const rate = analysis.envelopeRate;
  const a = clamp(Math.floor(t0 * rate), 0, env.length - 1);
  const b = clamp(Math.ceil(t1 * rate), a + 1, env.length);
  let s = 0;
  for (let i = a; i < b; i++) s += env[i];
  const mean = s / (b - a);
  let v = 0;
  for (let i = a; i < b; i++) v += (env[i] - mean) ** 2;
  return mean > 0 ? Math.sqrt(v / (b - a)) / mean : 1;
}
