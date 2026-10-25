// DOM side of the UI: the in-run HUD, combo meter, trick announcements, and
// the title / countdown / pause / results screens. Text is only written when
// it changes to avoid layout work every frame.

import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtMult = (m) => (m % 1 === 0 ? m.toFixed(1) : String(Number(m.toFixed(2))));

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'),
      controls: $('controls'),
      starBtn: $('star-btn'),
      time: $('hud-time'),
      timeBox: $('hud-time-box'),
      score: $('hud-score'),
      best: $('hud-best'),
      combo: $('combo'),
      chain: $('combo-chain'),
      points: $('combo-points'),
      mult: $('combo-mult'),
      bar: $('combo-bar-fill'),
      announce: $('announce'),
      title: $('title-screen'),
      countdown: $('countdown-screen'),
      countdownNum: $('countdown-num'),
      pause: $('pause-screen'),
      results: $('results-screen'),
      titleBest: $('title-best'),
      titleDaily: $('title-daily'),
      newBest: $('new-best'),
    };
    this.announceName = this.el.announce.querySelector('.announce-name');
    this.announcePts = this.el.announce.querySelector('.announce-pts');
    this.last = { time: '', score: -1, best: -1, comboVersion: -1, state: '', hurry: false, bar: -1, starReady: true };
    this.comboFlash = 0;
    this.comboFlashState = '';
    if (window.matchMedia('(min-width: 900px) and (min-height: 600px)').matches) $('howto').open = true;
  }

  bind(handlers) {
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    on('play-btn', handlers.play);
    on('daily-btn', handlers.daily);
    on('resume-btn', handlers.resume);
    on('restart-btn', handlers.restart);
    on('pause-title-btn', handlers.title);
    on('again-btn', handlers.again);
    on('results-title-btn', handlers.title);
    on('fullscreen-btn', handlers.fullscreen);
    $('pause-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); handlers.pause(); });
    for (const id of ['sfx-toggle', 'pause-sfx-toggle']) on(id, handlers.toggleSfx);
    for (const id of ['music-toggle', 'pause-music-toggle']) on(id, handlers.toggleMusic);
  }

  // Height of the bottom control strip in CSS px (used to keep the skating
  // lane above the joysticks).
  controlsHeight() {
    const r = document.querySelector('#flip-stick').getBoundingClientRect();
    return Math.max(0, window.innerHeight - r.top);
  }

  showScreen(name) {
    for (const key of ['title', 'countdown', 'pause', 'results']) {
      this.el[key].classList.toggle('off', key !== name);
    }
  }

  // Dims the star button (and spins its star) while a throw cools down.
  setStarReady(ready) {
    if (ready === this.last.starReady) return;
    this.last.starReady = ready;
    this.el.starBtn.classList.toggle('cooling', !ready);
  }

  setPlaying(on) {
    this.el.hud.classList.toggle('off', !on);
    this.el.controls.classList.toggle('off', !on);
  }

  setToggles(sfx, music) {
    for (const id of ['sfx-toggle', 'pause-sfx-toggle']) {
      const b = $(id);
      b.textContent = sfx ? 'SFX ON' : 'SFX OFF';
      b.setAttribute('aria-pressed', String(sfx));
    }
    for (const id of ['music-toggle', 'pause-music-toggle']) {
      const b = $(id);
      b.textContent = music ? 'MUSIC ON' : 'MUSIC OFF';
      b.setAttribute('aria-pressed', String(music));
    }
  }

  setTitleScores(best, daily) {
    this.el.titleBest.textContent = fmt(best);
    this.el.titleDaily.textContent = daily > 0 ? fmt(daily) : '—';
  }

  countdown(n) {
    const text = n > 0 ? String(n) : 'GO!';
    if (this.el.countdownNum.textContent === text) return;
    this.el.countdownNum.textContent = text;
    this.el.countdownNum.animate(
      [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(0.9)', opacity: 1 }],
      { duration: 900, easing: 'ease-out' },
    );
  }

  // kind: '' | 'good' | 'bad' | 'big'
  announce(name, pts = '', kind = '') {
    const el = this.el.announce;
    this.announceName.textContent = name;
    this.announcePts.textContent = pts;
    el.className = `announce ${kind}`;
    for (const a of el.getAnimations()) a.cancel();
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5) rotate(-4deg)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%, -55%) scale(1) rotate(-2deg)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, -65%) scale(0.95) rotate(-2deg)' },
      ],
      { duration: 1100, easing: 'ease-out', fill: 'forwards' },
    );
  }

  flashCombo(state) {
    this.comboFlash = 0.8;
    this.comboFlashState = state;
  }

  update(game, dt) {
    const L = this.last;
    const remaining = Math.max(0, CONFIG.run.duration - game.elapsed);
    const time = remaining >= 10 ? `00:${String(Math.ceil(remaining)).padStart(2, '0')}` : remaining.toFixed(1);
    if (time !== L.time) {
      this.el.time.textContent = remaining >= 60 ? '01:00' : time;
      L.time = time;
    }
    const hurry = remaining <= 10 && game.state === 'playing';
    if (hurry !== L.hurry) {
      this.el.timeBox.classList.toggle('hurry', hurry);
      L.hurry = hurry;
    }

    const s = game.scoring;
    if (s.score !== L.score) {
      this.el.score.textContent = fmt(s.score);
      L.score = s.score;
    }
    if (game.best !== L.best) {
      this.el.best.textContent = fmt(game.best);
      L.best = game.best;
    }

    // Combo meter
    const c = s.combo;
    let state = 'idle';
    if (this.comboFlash > 0) {
      this.comboFlash -= dt;
      state = this.comboFlashState;
    } else if (c.active) {
      state = c.linking ? 'linking' : 'air';
    }
    if (state !== L.state) {
      this.el.combo.dataset.state = state;
      L.state = state;
    }
    if (c.active && c.version !== L.comboVersion) {
      L.comboVersion = c.version;
      this.el.chain.textContent = (c.length > c.chain.length ? '… + ' : '') + c.chain.join(' + ');
      this.el.points.textContent = fmt(c.base);
      this.el.mult.textContent = fmtMult(s.multiplier);
    }
    if (c.linking) {
      const k = Math.max(0, c.linkTimer / CONFIG.scoring.linkWindow);
      const q = Math.round(k * 100);
      if (q !== L.bar) {
        this.el.bar.style.transform = `scaleX(${k})`;
        L.bar = q;
      }
    }
  }

  // Freeze the combo meter showing a final value (banked or lost).
  showComboResult(total, state) {
    this.el.points.textContent = fmt(total);
    this.flashCombo(state);
    this.last.comboVersion = -1;
  }

  showResults(r) {
    $('res-score').textContent = fmt(r.score);
    $('res-combo').textContent = fmt(r.bestCombo);
    $('res-mult').textContent = `×${fmtMult(r.highestMultiplier)}`;
    $('res-distance').textContent = `${fmt(r.distance)} m`;
    $('res-tricks').textContent = fmt(r.tricks);
    $('res-grind').textContent = `${r.grindTime.toFixed(1)} s`;
    $('res-karens').textContent = fmt(r.karensDodged);
    $('res-near').textContent = fmt(r.nearMisses);
    $('res-wipeouts').textContent = fmt(r.wipeouts);
    $('res-seed').textContent = r.mode === 'daily' ? `Daily challenge ${r.dayKey} • seed ${r.seed}` : `Seed ${r.seed} (replay with ?seed=${r.seed})`;
    this.el.newBest.hidden = !r.newBest;
  }
}
