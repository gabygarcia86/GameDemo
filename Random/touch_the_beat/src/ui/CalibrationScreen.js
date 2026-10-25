// Tap-along audio latency calibration screen.

import { KEY_TO_LANE } from '../config.js';
import { TimingCalibration } from '../audio/TimingCalibration.js';
import { $, el, toast } from '../util/dom.js';

const BEATS = 16;

export class CalibrationScreen {
  constructor(app) {
    this.app = app;
    this.cal = new TimingCalibration(app.audio, app.sfx);
    this.pad = $('#calib-pad');
    this.dots = $('#calib-dots');
    this.result = $('#calib-result');
    this.applyBtn = $('#btn-calib-apply');
    this.last = null;
    this.raf = 0;

    $('#btn-calib-start').addEventListener('click', () => this.start());
    this.applyBtn.addEventListener('click', () => {
      if (!this.last?.ok) return;
      const v = Math.max(-300, Math.min(300, this.last.offsetMs));
      app.settings.set('audioOffsetMs', v);
      toast(`Audio offset set to ${v > 0 ? '+' : ''}${v} ms.`);
      this.applyBtn.disabled = true;
    });
    this.pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tap(e.timeStamp);
    });
    window.addEventListener('keydown', (e) => {
      if (this.app.ui.current !== 'calibrate' || e.repeat) return;
      if (KEY_TO_LANE.has(e.code) || e.code === 'Space') {
        e.preventDefault();
        this.tap(e.timeStamp);
      }
    });
  }

  onShow() {
    this.result.textContent = `Current audio offset: ${this.app.settings.get('audioOffsetMs')} ms.`;
    this.applyBtn.disabled = true;
    this.dots.replaceChildren(...Array.from({ length: BEATS }, () => el('i')));
  }

  onHide() {
    this.cal.stop();
    cancelAnimationFrame(this.raf);
    this.pad.classList.remove('beat');
  }

  async start() {
    this.onShow();
    this.result.textContent = 'Listen… tap on every click.';
    $('#calib-pad-label').textContent = 'TAP';
    await this.cal.start({
      bpm: 100,
      beats: BEATS,
      onDone: (r) => this.finish(r),
    });
    const loop = () => {
      const { index, phase } = this.cal.phase();
      this.pad.classList.toggle('beat', index >= 0 && index < BEATS && phase < 0.18);
      const dots = this.dots.children;
      for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('done', i <= index && !dots[i].classList.contains('hit'));
      if (this.cal.running) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  tap(ms) {
    const d = this.cal.tap(ms);
    if (d === null) return;
    const idx = this.cal.taps.length - 1;
    const dot = this.dots.children[Math.min(BEATS - 1, idx)];
    dot?.classList.add('hit');
    $('#calib-pad-label').textContent = `${d > 0 ? '+' : ''}${Math.round(d * 1000)}`;
  }

  finish(r) {
    this.last = r;
    this.pad.classList.remove('beat');
    $('#calib-pad-label').textContent = 'TAP';
    if (!r.ok) {
      this.result.textContent = r.message;
      return;
    }
    this.result.textContent =
      `Measured ${r.rawMs} ms from click to tap (${r.samples} taps, spread ±${r.spreadMs} ms). ` +
      `Recommended audio offset: ${r.offsetMs > 0 ? '+' : ''}${r.offsetMs} ms.` +
      (r.steady ? '' : ' Taps were uneven — consider running it again.');
    this.applyBtn.disabled = false;
  }
}
