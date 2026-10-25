// One play session: wires audio clock, input, judgement, scoring and effects.
//
// States: idle -> countdown -> playing -> (paused -> resuming -> playing) -> ended
//
// Pausing stops the buffer source and remembers the song position; resuming
// restarts it from that position after a short lead-in on the same
// AudioContext clock, so synchronisation is preserved without relying on
// context suspend/resume (which mobile browsers may refuse outside gestures).

import { COUNTDOWN_SECONDS, JUDGEMENT, approachTimeFor } from '../config.js';
import { LANE_COUNT } from '../charts/BeatMap.js';
import { JudgementSystem } from './JudgementSystem.js';
import { NoteManager } from './NoteManager.js';
import { ScoreManager } from './ScoreManager.js';

const RESUME_LEAD_IN = 1.6;

export class Game {
  constructor({ audio, sfx, renderer, input, settings, onEnd, onPauseChange }) {
    this.audio = audio;
    this.sfx = sfx;
    this.renderer = renderer;
    this.input = input;
    this.settings = settings;
    this.onEnd = onEnd;
    this.onPauseChange = onPauseChange;
    this.notes = new NoteManager();
    this.score = new ScoreManager();
    this.judge = new JudgementSystem(this.notes, this.score, { onJudge: (e) => this.handleJudge(e) });
    this.state = 'idle';
    this.song = null;
    this.chart = null;
    this.buffer = null;
    this.time = 0;
    this.renderTime = 0;
    this.lanePressed = new Uint8Array(LANE_COUNT);
    this.beats = [];
    this.beatCursor = 0;
    this.beatPos = 0;
    this.period = 0.5;
    this.lastCount = null;
    this.pausedAt = 0;
    this.inputFrom = -Infinity;
    this.applySettings();
    settings.onChange(() => this.applySettings());
  }

  get active() {
    return this.state !== 'idle' && this.state !== 'ended';
  }

  applySettings() {
    const s = this.settings;
    this.approach = approachTimeFor(s.get('noteSpeed'));
    this.judge.setWindowScale(JUDGEMENT.presets[s.get('timingWindows')] || 1);
    this.audioOffset = s.get('audioOffsetMs') / 1000;
    this.visualOffset = s.get('visualOffsetMs') / 1000;
  }

  load(song, chart, buffer) {
    this.song = song;
    this.chart = chart;
    this.buffer = buffer;
    this.notes.load(chart);
    const offset = chart.offset || 0;
    this.beats = (chart.beats || []).map((b) => b + offset);
    this.period = chart.bpm > 0 ? 60 / chart.bpm : 0.5;
    this.beatsPerBar = chart.beatsPerBar || 4;
    this.downbeat = chart.downbeat || 0;
    this.sections = chart.sections || [];
    this.duration = buffer.duration;
    this.endTime = Math.max(buffer.duration, this.notes.lastTime + 1) + 0.5;
  }

  start() {
    this.notes.reset();
    this.score.reset(this.notes.count);
    this.judge.reset();
    this.renderer.resetEffects();
    this.lanePressed.fill(0);
    this.beatCursor = 0;
    this.lastCount = null;
    this.inputFrom = -Infinity;
    this.audio.play(this.buffer, COUNTDOWN_SECONDS, 0);
    this.state = 'countdown';
    this.time = this.clock();
    this.input.enable({
      down: (lane, ms) => this.laneDown(lane, ms),
      up: (lane, ms) => this.laneUp(lane, ms),
      pause: () => (this.state === 'paused' ? this.resume() : this.pause()),
    });
  }

  clock() {
    return this.audio.songTime() - this.audioOffset;
  }

  /** Song time of the current frame for gameplay (judgement clock). */
  update(dt) {
    if (this.state === 'paused' || this.state === 'idle' || this.state === 'ended') {
      this.score.update(dt);
      return;
    }
    this.time = this.clock();
    this.renderTime = this.time - this.visualOffset;

    if (this.state === 'countdown') {
      const n = Math.ceil(-this.time);
      if (n !== this.lastCount && n <= COUNTDOWN_SECONDS) {
        this.lastCount = n;
        this.sfx.countdown(Math.max(0, n));
      }
      if (this.time >= 0) this.state = 'playing';
    } else if (this.state === 'resuming' && this.time >= this.pausedAt) {
      this.state = 'playing';
    }

    this.judge.update(this.time);
    this.score.update(dt);
    this.updateBeat();
    if (this.time >= this.endTime) this.finish();
  }

  updateBeat() {
    const b = this.beats;
    const t = this.renderTime;
    if (!b.length) {
      this.beatPos = t / this.period;
      return;
    }
    while (this.beatCursor > 0 && b[this.beatCursor] > t) this.beatCursor--;
    while (this.beatCursor < b.length - 1 && b[this.beatCursor + 1] <= t) this.beatCursor++;
    const i = this.beatCursor;
    if (t < b[0]) this.beatPos = (t - b[0]) / this.period;
    else {
      const next = i + 1 < b.length ? b[i + 1] : b[i] + this.period;
      this.beatPos = i + (t - b[i]) / (next - b[i]);
    }
  }

  /** Countdown number to display (3,2,1,0 = GO) or null. */
  get countdown() {
    if (this.state === 'countdown') return Math.max(0, Math.ceil(-this.time));
    if (this.state === 'playing' && this.time < 0.6 && this.lastCount === 0) return 0;
    if (this.state === 'resuming') return Math.max(1, Math.ceil(this.pausedAt - this.time));
    return null;
  }

  laneDown(lane, ms) {
    if (this.state !== 'playing' && this.state !== 'countdown' && this.state !== 'resuming') return;
    this.lanePressed[lane] = 1;
    this.renderer.lanePress(lane);
    const t = this.audio.perfToSongTime(ms) - this.audioOffset;
    if (t < this.inputFrom) return; // during the resume rewind
    this.judge.laneDown(lane, t);
  }

  laneUp(lane, ms) {
    this.lanePressed[lane] = 0;
    this.renderer.laneRelease(lane);
    if (!this.active || this.state === 'paused') return;
    this.judge.laneUp(lane, this.audio.perfToSongTime(ms) - this.audioOffset);
  }

  handleJudge(e) {
    const r = this.renderer;
    if (e.kind === 'judge') {
      r.onJudge(e);
      if (e.rating === 'miss') this.sfx.miss();
      else this.sfx.hit(e.lane, e.rating);
      if (e.multiplierUp) r.pulse(e.lane, 0.55);
      if (e.milestone) {
        r.milestone(e.milestone);
        this.sfx.milestone();
      }
    } else if (e.kind === 'holdComplete') {
      r.holdComplete(e.note);
    } else if (e.kind === 'holdDrop') {
      r.holdDrop(e.note);
      this.sfx.holdBreak();
    }
  }

  pause() {
    if (!['playing', 'countdown', 'resuming'].includes(this.state)) return;
    const pos = this.state === 'resuming' ? this.pausedAt : Math.max(0, this.time);
    this.judge.settleHolds(this.time);
    this.pausedAt = pos;
    this.audio.stop();
    this.state = 'paused';
    this.lanePressed.fill(0);
    this.input.releaseAll();
    this.onPauseChange?.(true);
  }

  async resume() {
    if (this.state !== 'paused') return;
    await this.audio.unlock();
    // restart the source from the paused position after a short lead-in;
    // song time rewinds by the lead-in so the next notes approach again.
    // Sync holds for any start position because songStartCtx = when - from.
    this.audio.play(this.buffer, RESUME_LEAD_IN, Math.max(0, this.pausedAt));
    this.inputFrom = this.pausedAt - 0.05;
    this.state = this.pausedAt <= 0 ? 'countdown' : 'resuming';
    this.renderer.resetEffects(false);
    this.onPauseChange?.(false);
  }

  restart() {
    this.audio.stop();
    this.onPauseChange?.(false);
    this.start();
  }

  quit() {
    this.audio.stop();
    this.input.disable();
    this.state = 'idle';
    this.renderer.resetEffects();
  }

  finish() {
    if (this.state === 'ended') return;
    this.judge.settleHolds(this.time);
    this.state = 'ended';
    this.audio.stop();
    this.input.disable();
    this.onEnd?.(this.score.summary());
  }
}
