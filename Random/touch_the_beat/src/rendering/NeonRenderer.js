// Canvas 2D renderer for menus and gameplay.
//
// Performance notes
//   - Glow is baked into sprites once per resize (shadowBlur is only used on
//     offscreen canvases), then drawn with drawImage each frame.
//   - Gradients, fonts and layout are cached on resize.
//   - Particles live in a typed-array pool (ParticleSystem).
//   - Quality presets cap the device-pixel-ratio, particle budget, stars and
//     additive blending; "low" draws no glow at all.

import { LANES } from '../config.js';
import { LANE_COUNT } from '../charts/BeatMap.js';
import { HOLD_ACTIVE, HOLD_DONE, HOLD_DROPPED } from '../game/NoteManager.js';
import { BackgroundEffects } from './BackgroundEffects.js';
import { ParticleSystem } from './ParticleSystem.js';

export const QUALITY_PRESETS = Object.freeze({
  low: { dprCap: 1, particles: 140, glow: false, additive: false },
  medium: { dprCap: 1.75, particles: 360, glow: true, additive: true },
  high: { dprCap: 2.5, particles: 720, glow: true, additive: true },
});

const FONT = '"Orbitron", "Rajdhani", "Segoe UI", system-ui, sans-serif';
const RATING_TEXT = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const RATING_COLOR = { perfect: '#ffffff', great: '#7df9ff', good: '#c9a6ff', miss: '#ff4d6d' };
const TOP_SCALE = 0.38; // 3D highway: width at the far end relative to the target line
const COLORS = LANES.map((l) => l.color).concat('#ffffff');
const WHITE = LANE_COUNT; // colour index for white particles

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class NeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.qualityName = 'high';
    this.q = QUALITY_PRESETS.high;
    this.reducedMotion = false;
    this.flat = false;
    this.showFps = false;
    this.particles = new ParticleSystem(this.q.particles);
    this.bg = new BackgroundEffects();
    this.laneFlash = new Float32Array(LANE_COUNT);
    this.padHit = new Float32Array(LANE_COUNT);
    this.pressed = new Uint8Array(LANE_COUNT);
    this.popups = Array.from({ length: LANE_COUNT }, () => ({ text: '', color: '#fff', age: 9, sub: '' }));
    this.flash = 0;
    this.flashRgb = '255,255,255';
    this.shake = 0;
    this.milestoneText = '';
    this.milestoneAge = 9;
    this.multBump = 0;
    this.lastMult = 1;
    this.scoreCache = { value: -1, text: '0' };
    this.L = {};
    this.time = 0;
    this.fps = 60;
  }

  configure({ quality, reducedMotion, highway, showFps }) {
    const qName = QUALITY_PRESETS[quality] ? quality : this.qualityName;
    const changed = qName !== this.qualityName || (highway === 'flat') !== this.flat;
    this.qualityName = qName;
    this.q = QUALITY_PRESETS[qName];
    this.reducedMotion = Boolean(reducedMotion);
    this.flat = highway === 'flat';
    this.showFps = Boolean(showFps);
    if (this.particles.max !== this.q.particles) this.particles.resize(this.q.particles);
    if (changed || !this.sprites) this.resize();
  }

  readSafeArea() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => parseFloat(cs.getPropertyValue(name)) || 0;
    return { top: v('--sat'), right: v('--sar'), bottom: v('--sab'), left: v('--sal') };
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.computeLayout(w, h);
    this.progressGrad = null;
    this.buildSprites();
    this.bg.resize(this.ctx, w, h, this.L.topY, this.L.cx, this.qualityName);
    this.menuBg = new BackgroundEffects();
    this.menuBg.resize(this.ctx, w, h, h * 0.6, w / 2, this.qualityName);
  }

  computeLayout(w, h) {
    const safe = this.readSafeArea();
    const portrait = h >= w;
    const usableW = w - safe.left - safe.right;
    let fieldW = portrait ? Math.min(usableW - 20, 560, h * 0.62) : Math.min(usableW * 0.5, h * 0.95, 620);
    fieldW = Math.max(220, fieldW);
    const laneW = fieldW / LANE_COUNT;
    const padR = Math.min(laneW * 0.36, 46);
    const cx = safe.left + usableW / 2;
    const targetY = h - safe.bottom - Math.max(padR * 1.7, 58);
    const hudH = 58;
    const topY = safe.top + hudH + (portrait ? 24 : 4);
    const horizonY = (topY - targetY * TOP_SCALE) / (1 - TOP_SCALE);
    const bottomScale = (h - horizonY) / (targetY - horizonY);
    this.L = {
      w, h, safe, portrait, fieldW, laneW, padR, cx, targetY, topY, horizonY, bottomScale,
      noteW: laneW * 0.78,
      noteH: Math.max(14, laneW * 0.27),
      left: cx - fieldW / 2,
    };
    this.fonts = {
      score: `700 ${portrait ? 22 : 24}px ${FONT}`,
      small: `600 12px ${FONT}`,
      hud: `600 15px ${FONT}`,
      mult: `800 15px ${FONT}`,
      combo: `800 ${Math.round(clamp(laneW * 0.62, 30, 68))}px ${FONT}`,
      comboLabel: `700 ${Math.round(clamp(laneW * 0.16, 10, 15))}px ${FONT}`,
      popup: `800 ${Math.round(clamp(laneW * 0.2, 12, 20))}px ${FONT}`,
      popupSub: `600 ${Math.round(clamp(laneW * 0.12, 9, 12))}px ${FONT}`,
      countdown: `900 ${Math.round(Math.min(w, h) * 0.24)}px ${FONT}`,
      milestone: `900 ${Math.round(clamp(fieldW * 0.11, 26, 54))}px ${FONT}`,
    };
  }

  // ---------------------------------------------------------- projection

  scaleAt(p) {
    return this.flat ? 1 : 1 / (1 + (1 - p) * (1 / TOP_SCALE - 1));
  }

  yAt(p) {
    const L = this.L;
    if (this.flat) return L.topY + p * (L.targetY - L.topY);
    return L.horizonY + (L.targetY - L.horizonY) * this.scaleAt(p);
  }

  laneX(lane, s) {
    return this.L.cx + (lane - 1.5) * this.L.laneW * s;
  }

  /** Lane under a screen x coordinate; outer lanes extend to the screen edges. */
  laneAt(x) {
    return clamp(Math.floor((x - this.L.left) / this.L.laneW), 0, LANE_COUNT - 1);
  }

  // -------------------------------------------------------------- sprites

  makeCanvas(wCss, hCss) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(wCss * this.dpr));
    c.height = Math.max(1, Math.ceil(hCss * this.dpr));
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    return { c, g };
  }

  buildSprites() {
    const L = this.L;
    const glow = this.q.glow;
    const pad = glow ? 14 : 2;
    this.sprites = { note: [], pad: [], padOn: [], dot: [], beam: [] };
    LANES.forEach((lane) => {
      // note gem
      const nw = L.noteW;
      const nh = L.noteH;
      const { c, g } = this.makeCanvas(nw + pad * 2, nh + pad * 2);
      if (glow) {
        g.shadowColor = lane.color;
        g.shadowBlur = 12;
      }
      const grad = g.createLinearGradient(0, pad, 0, pad + nh);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, lane.color);
      grad.addColorStop(1, `${lane.glow}0.75)`);
      g.fillStyle = grad;
      roundRect(g, pad, pad, nw, nh, nh * 0.45);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.5;
      roundRect(g, pad + 1, pad + 1, nw - 2, nh - 2, nh * 0.42);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.65)';
      roundRect(g, pad + nw * 0.18, pad + nh * 0.2, nw * 0.64, Math.max(2, nh * 0.16), nh * 0.08);
      g.fill();
      this.sprites.note.push({ c, w: nw + pad * 2, h: nh + pad * 2 });

      // target pad (idle + pressed)
      const R = L.padR;
      const size = (R + pad + 6) * 2;
      for (const on of [false, true]) {
        const s = this.makeCanvas(size, size);
        const m = size / 2;
        const gg = s.g;
        if (glow) {
          gg.shadowColor = lane.color;
          gg.shadowBlur = on ? 22 : 12;
        }
        const inner = gg.createRadialGradient(m, m, R * 0.1, m, m, R);
        inner.addColorStop(0, on ? '#ffffff' : 'rgba(10,10,30,0.9)');
        inner.addColorStop(on ? 0.4 : 0.7, on ? lane.color : 'rgba(20,16,50,0.85)');
        inner.addColorStop(1, on ? `${lane.glow}0.6)` : `${lane.glow}0.25)`);
        gg.fillStyle = inner;
        gg.beginPath();
        gg.arc(m, m, R, 0, Math.PI * 2);
        gg.fill();
        gg.lineWidth = on ? 4 : 3;
        gg.strokeStyle = lane.color;
        gg.beginPath();
        gg.arc(m, m, R, 0, Math.PI * 2);
        gg.stroke();
        gg.shadowBlur = 0;
        gg.lineWidth = 1.5;
        gg.strokeStyle = 'rgba(255,255,255,0.5)';
        gg.beginPath();
        gg.arc(m, m, R * 0.62, 0, Math.PI * 2);
        gg.stroke();
        (on ? this.sprites.padOn : this.sprites.pad).push({ c: s.c, size });
      }

      // particle glow dot
      const d = this.makeCanvas(16, 16);
      const rg = d.g.createRadialGradient(8, 8, 0, 8, 8, 8);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.3, lane.color);
      rg.addColorStop(1, `${lane.glow}0)`);
      d.g.fillStyle = rg;
      d.g.fillRect(0, 0, 16, 16);
      this.sprites.dot.push(d.c);
    });
    // white dot
    const d = this.makeCanvas(16, 16);
    const rg = d.g.createRadialGradient(8, 8, 0, 8, 8, 8);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    d.g.fillStyle = rg;
    d.g.fillRect(0, 0, 16, 16);
    this.sprites.dot.push(d.c);

    // beams and highway gradients (screen-space, cached)
    const ctx = this.ctx;
    const beamTop = this.yAt(0.35);
    this.beamGrad = LANES.map((lane) => {
      const gr = ctx.createLinearGradient(0, L.targetY, 0, beamTop);
      gr.addColorStop(0, `${lane.glow}0.55)`);
      gr.addColorStop(1, `${lane.glow}0)`);
      return gr;
    });
    const hw = ctx.createLinearGradient(0, L.topY, 0, L.h);
    hw.addColorStop(0, 'rgba(6,4,22,0.7)');
    hw.addColorStop(0.4, 'rgba(8,6,28,0.93)');
    hw.addColorStop(1, 'rgba(4,3,16,0.96)');
    this.highwayFill = hw;
    const fade = ctx.createLinearGradient(0, L.topY, 0, L.topY + (L.targetY - L.topY) * 0.18);
    fade.addColorStop(0, 'rgba(5,3,20,1)');
    fade.addColorStop(1, 'rgba(5,3,20,0)');
    this.topFade = fade;
  }

  // ------------------------------------------------------------- effects

  resetEffects(clearParticles = true) {
    if (clearParticles) this.particles.clear();
    this.laneFlash.fill(0);
    this.padHit.fill(0);
    this.pressed.fill(0);
    for (const p of this.popups) p.age = 9;
    this.flash = 0;
    this.shake = 0;
    this.milestoneAge = 9;
    this.lastMult = 1;
  }

  lanePress(lane) {
    this.pressed[lane] = 1;
    this.laneFlash[lane] = 1;
  }

  laneRelease(lane) {
    this.pressed[lane] = 0;
  }

  onJudge(e) {
    const L = this.L;
    const x = this.laneX(e.lane, 1);
    const y = L.targetY;
    const p = this.popups[e.lane];
    p.text = RATING_TEXT[e.rating];
    p.color = RATING_COLOR[e.rating];
    p.age = 0;
    p.sub = e.rating === 'great' || e.rating === 'good' ? (e.delta < 0 ? 'EARLY' : 'LATE') : '';
    if (e.rating === 'miss') return;
    const many = this.q.particles > 200;
    const count = e.rating === 'perfect' ? (many ? 26 : 10) : e.rating === 'great' ? (many ? 16 : 7) : many ? 9 : 4;
    this.particles.emit(x, y, e.lane, count, 520, { spread: Math.PI * 1.1, life: 0.55, size: 2.5, sizeVar: 2.5 });
    if (e.rating === 'perfect') {
      this.particles.emit(x, y, WHITE, many ? 8 : 3, 380, { spread: Math.PI * 1.4, life: 0.4, size: 2 });
      this.particles.ring(x, y, e.lane, L.padR, L.padR * 5, 0.42, 3);
      this.particles.ring(x, y, WHITE, L.padR * 0.8, L.padR * 3.2, 0.3, 2);
    } else if (e.rating === 'great') {
      this.particles.ring(x, y, e.lane, L.padR * 0.9, L.padR * 3, 0.3, 2);
    }
    this.padHit[e.lane] = 1;
  }

  holdComplete(note) {
    const x = this.laneX(note.lane, 1);
    this.particles.emit(x, this.L.targetY, note.lane, 14, 460, { spread: Math.PI, life: 0.5 });
    this.particles.ring(x, this.L.targetY, note.lane, this.L.padR, this.L.padR * 4, 0.35, 3);
    const p = this.popups[note.lane];
    p.text = 'HOLD!';
    p.color = LANES[note.lane].color;
    p.sub = '';
    p.age = 0;
  }

  holdDrop(note) {
    const p = this.popups[note.lane];
    p.text = 'DROP';
    p.color = RATING_COLOR.miss;
    p.sub = '';
    p.age = 0;
  }

  pulse(lane, amount) {
    this.flash = Math.max(this.flash, amount);
    const c = LANES[lane].rgb;
    this.flashRgb = `${c[0]},${c[1]},${c[2]}`;
    this.multBump = 1;
  }

  milestone(combo) {
    this.milestoneText = `${combo} COMBO!`;
    this.milestoneAge = 0;
    this.flash = Math.max(this.flash, 0.9);
    this.flashRgb = '255,255,255';
    if (!this.reducedMotion) this.shake = 1;
    const L = this.L;
    for (let l = 0; l < LANE_COUNT; l++) {
      this.particles.emit(this.laneX(l, 1), L.targetY, l, this.q.particles > 200 ? 12 : 4, 700, { spread: 0.9, life: 0.8 });
    }
  }

  // --------------------------------------------------------------- frames

  renderMenu(dt, vis) {
    const ctx = this.ctx;
    this.time += dt;
    this.menuBg.render(ctx, {
      dt,
      beatPos: vis.beatPos,
      energy: vis.energy,
      spectrum: null,
      pulse: this.reducedMotion ? vis.pulse * 0.3 : vis.pulse,
    });
    this.particles.update(dt, 0);
    if (this.showFps) this.drawFps();
  }

  renderGame(game, dt, spectrum) {
    const ctx = this.ctx;
    const L = this.L;
    this.time += dt;
    const rt = game.renderTime;
    const frac = game.beatPos - Math.floor(game.beatPos);
    const beatIdx = Math.floor(game.beatPos);
    const downbeat = ((beatIdx - game.downbeat) % game.beatsPerBar + game.beatsPerBar) % game.beatsPerBar === 0;
    const beatPulse = game.state === 'paused' ? 0 : Math.exp(-frac * 7) * (downbeat ? 1 : 0.6);
    let energy = 0;
    if (spectrum) {
      for (let i = 0; i < 6; i++) energy += spectrum[i];
      energy /= 6 * 255;
    }

    // decay effects
    const k = Math.exp(-dt * 7);
    for (let l = 0; l < LANE_COUNT; l++) {
      if (!this.pressed[l]) this.laneFlash[l] *= k;
      this.padHit[l] *= Math.exp(-dt * 6);
    }
    this.flash *= Math.exp(-dt * 5);
    this.shake *= Math.exp(-dt * 9);
    this.multBump *= Math.exp(-dt * 6);
    this.particles.update(dt);

    ctx.save();
    if (this.shake > 0.02) {
      const s = this.shake * 6;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.bg.render(ctx, {
      dt,
      beatPos: game.beatPos,
      energy,
      spectrum,
      pulse: this.reducedMotion ? beatPulse * 0.3 : beatPulse,
    });
    this.drawHighway(game, beatPulse);
    this.drawBeatLines(game, rt);
    this.drawNotes(game, rt);
    this.drawTargets();
    this.particles.render(ctx, COLORS, this.q.glow ? this.sprites.dot : null, this.q.additive);
    this.drawPopups(dt);
    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashRgb},${(this.flash * (this.reducedMotion ? 0.05 : 0.16)).toFixed(3)})`;
      ctx.fillRect(0, 0, L.w, L.h);
    }
    this.drawHud(game);
    this.drawCountdown(game);
    if (this.showFps) this.drawFps();
  }

  drawHighway(game, beatPulse) {
    const ctx = this.ctx;
    const L = this.L;
    const sTop = this.scaleAt(0);
    const sBot = this.flat ? 1 : L.bottomScale;
    const half = L.fieldW / 2;
    ctx.fillStyle = this.highwayFill;
    ctx.beginPath();
    ctx.moveTo(L.cx - half * sTop, L.topY);
    ctx.lineTo(L.cx + half * sTop, L.topY);
    ctx.lineTo(L.cx + half * sBot, L.h);
    ctx.lineTo(L.cx - half * sBot, L.h);
    ctx.closePath();
    ctx.fill();

    // lane press beams
    for (let l = 0; l < LANE_COUNT; l++) {
      const f = this.laneFlash[l];
      if (f < 0.02) continue;
      const pTop = 0.35;
      const s0 = this.scaleAt(pTop);
      const y0 = this.yAt(pTop);
      const x0 = L.cx + (l - 2) * L.laneW;
      ctx.globalAlpha = f;
      ctx.fillStyle = this.beamGrad[l];
      ctx.beginPath();
      ctx.moveTo(L.cx + (l - 2) * L.laneW * s0, y0);
      ctx.lineTo(L.cx + (l - 1) * L.laneW * s0, y0);
      ctx.lineTo(x0 + L.laneW, L.targetY);
      ctx.lineTo(x0, L.targetY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // lane dividers
    ctx.beginPath();
    for (let i = 1; i < LANE_COUNT; i++) {
      const u = (i - 2) * L.laneW;
      ctx.moveTo(L.cx + u * sTop, L.topY);
      ctx.lineTo(L.cx + u * sBot, L.h);
    }
    ctx.strokeStyle = 'rgba(180,160,255,0.13)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // glowing edges
    const edgeA = 0.55 + beatPulse * 0.4;
    for (const side of [-1, 1]) {
      const color = side < 0 ? LANES[0].glow : LANES[3].glow;
      ctx.beginPath();
      ctx.moveTo(L.cx + side * half * sTop, L.topY);
      ctx.lineTo(L.cx + side * half * sBot, L.h);
      if (this.q.glow) {
        ctx.strokeStyle = `${color}${(edgeA * 0.3).toFixed(3)})`;
        ctx.lineWidth = 7;
        ctx.stroke();
      }
      ctx.strokeStyle = `${color}${edgeA.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // judgement line
    ctx.fillStyle = `rgba(255,255,255,${(0.18 + beatPulse * 0.15).toFixed(3)})`;
    ctx.fillRect(L.cx - half, L.targetY - 1, L.fieldW, 2);

    // fade the far end into the background
    ctx.fillStyle = this.topFade;
    ctx.fillRect(L.cx - half * sTop - 4, L.topY - 1, L.fieldW * sTop + 8, (L.targetY - L.topY) * 0.18);
  }

  drawBeatLines(game, rt) {
    const beats = game.beats;
    if (!beats.length) return;
    const ctx = this.ctx;
    const L = this.L;
    const A = game.approach;
    const half = L.fieldW / 2;
    const first = Math.max(0, game.beatCursor - 1);
    // two passes (weak beats, then downbeats) so each is a single stroke
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = first; i < beats.length; i++) {
        const dtb = beats[i] - rt;
        if (dtb < 0) continue;
        if (dtb > A) break;
        const isDown = ((i - game.downbeat) % game.beatsPerBar + game.beatsPerBar) % game.beatsPerBar === 0;
        if (isDown !== (pass === 1)) continue;
        const p = 1 - dtb / A;
        const s = this.scaleAt(p);
        const y = this.yAt(p);
        ctx.moveTo(L.cx - half * s, y);
        ctx.lineTo(L.cx + half * s, y);
      }
      ctx.lineWidth = pass ? 2 : 1;
      ctx.strokeStyle = pass ? 'rgba(220,200,255,0.24)' : 'rgba(200,180,255,0.1)';
      ctx.stroke();
    }
  }

  drawNotes(game, rt) {
    const ctx = this.ctx;
    const L = this.L;
    const A = game.approach;
    const notes = game.notes.notes;
    const start = game.notes.updateRenderStart(rt, A * 0.25);
    let end = start;
    while (end < notes.length && notes[end].time - rt <= A) end++;

    // pass 1: hold bodies and chord connectors (under the gems)
    const bodyHalf = L.laneW * 0.2;
    for (let i = start; i < end; i++) {
      const n = notes[i];
      if (n.type === 'hold' && n.hold !== HOLD_DONE) {
        const active = n.hold === HOLD_ACTIVE;
        const dead = n.hold === HOLD_DROPPED || n.rating === 'miss';
        let pHead = active ? 1 : 1 - (n.time - rt) / A;
        const pTail = clamp(1 - (n.end - rt) / A, 0, 1.2);
        pHead = clamp(pHead, 0, 1.2);
        if (pTail < pHead) {
          const sh = this.scaleAt(pHead);
          const st = this.scaleAt(pTail);
          const yh = this.yAt(pHead);
          const yt = this.yAt(pTail);
          const xh = this.laneX(n.lane, sh);
          const xt = this.laneX(n.lane, st);
          ctx.beginPath();
          ctx.moveTo(xh - bodyHalf * sh, yh);
          ctx.lineTo(xt - bodyHalf * st, yt);
          ctx.lineTo(xt + bodyHalf * st, yt);
          ctx.lineTo(xh + bodyHalf * sh, yh);
          ctx.closePath();
          const lane = LANES[n.lane];
          ctx.fillStyle = dead ? 'rgba(110,110,140,0.22)' : `${lane.glow}${active ? 0.7 : 0.38})`;
          ctx.fill();
          if (!dead) {
            ctx.strokeStyle = active ? '#ffffff' : lane.color;
            ctx.lineWidth = active ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(xh, yh);
            ctx.lineTo(xt, yt);
            ctx.stroke();
            // tail cap
            ctx.fillStyle = lane.color;
            ctx.fillRect(xt - bodyHalf * st, yt - 2, bodyHalf * 2 * st, 4);
          }
          if (active && Math.random() < 0.5) {
            this.particles.emit(this.laneX(n.lane, 1), L.targetY, n.lane, 1, 260, { spread: 1.2, life: 0.35, size: 2 });
          }
        }
      }
      if (n.chordFirst && n.chord > 1 && !n.judged) {
        const p = 1 - (n.time - rt) / A;
        if (p >= 0 && p <= 1.1) {
          const s = this.scaleAt(p);
          const y = this.yAt(p);
          const last = notes[i + n.chord - 1];
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 2 * s;
          ctx.beginPath();
          ctx.moveTo(this.laneX(n.lane, s), y);
          ctx.lineTo(this.laneX(last.lane, s), y);
          ctx.stroke();
        }
      }
    }

    // pass 2: gems
    for (let i = start; i < end; i++) {
      const n = notes[i];
      const missed = n.rating === 'miss';
      if (n.judged && !missed && n.hold !== HOLD_ACTIVE) continue;
      let p = n.hold === HOLD_ACTIVE ? 1 : 1 - (n.time - rt) / A;
      if (p < -0.02 || p > 1.2) continue;
      p = Math.max(0, p);
      const s = this.scaleAt(p);
      const spr = this.sprites.note[n.lane];
      const w = spr.w * s;
      const h = spr.h * s;
      const x = this.laneX(n.lane, s);
      const y = this.yAt(p);
      ctx.globalAlpha = missed ? 0.25 : p < 0.08 ? p / 0.08 : 1;
      ctx.drawImage(spr.c, x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  drawTargets() {
    const ctx = this.ctx;
    const L = this.L;
    for (let l = 0; l < LANE_COUNT; l++) {
      const x = this.laneX(l, 1);
      const y = L.targetY;
      const f = Math.max(this.laneFlash[l] * (this.pressed[l] ? 1 : 0.7), this.padHit[l]);
      const press = this.pressed[l] ? 0.92 : 1;
      const idle = this.sprites.pad[l];
      const sz = idle.size * press;
      ctx.drawImage(idle.c, x - sz / 2, y - sz / 2, sz, sz);
      if (f > 0.02) {
        ctx.globalAlpha = Math.min(1, f);
        const on = this.sprites.padOn[l];
        ctx.drawImage(on.c, x - sz / 2, y - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
      }
      if (this.padHit[l] > 0.05 && this.q.glow) {
        const r = L.padR * (1.6 + (1 - this.padHit[l]) * 1.2);
        ctx.globalAlpha = this.padHit[l] * 0.8;
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.sprites.dot[l], x - r, y - r, r * 2, r * 2);
        ctx.globalCompositeOperation = prev;
        ctx.globalAlpha = 1;
      }
    }
  }

  drawPopups(dt) {
    const ctx = this.ctx;
    const L = this.L;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let l = 0; l < LANE_COUNT; l++) {
      const p = this.popups[l];
      if (p.age > 0.6) continue;
      p.age += dt;
      const t = p.age / 0.6;
      const scale = this.reducedMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - p.age / 0.09);
      const x = this.laneX(l, 1);
      const y = L.targetY - L.padR - 22 - t * 18;
      ctx.globalAlpha = 1 - t * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.font = this.fonts.popup;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      if (p.sub) {
        ctx.font = this.fonts.popupSub;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(p.sub, 0, 15);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (this.milestoneAge < 1.2) {
      this.milestoneAge += dt;
      const t = this.milestoneAge / 1.2;
      const s = this.reducedMotion ? 1 : 0.8 + 0.3 * Math.min(1, this.milestoneAge / 0.15);
      ctx.save();
      ctx.translate(L.cx, L.topY + (L.targetY - L.topY) * 0.22);
      ctx.scale(s, s);
      ctx.globalAlpha = 1 - t * t;
      ctx.font = this.fonts.milestone;
      ctx.fillStyle = '#ffffff';
      if (this.q.glow) {
        ctx.shadowColor = '#ff2bd6';
        ctx.shadowBlur = 18;
      }
      ctx.fillText(this.milestoneText, 0, 0);
      ctx.restore();
    }
  }

  drawHud(game) {
    const ctx = this.ctx;
    const L = this.L;
    const sc = game.score;
    const left = L.safe.left + 14;
    const right = L.w - L.safe.right - 66; // room for the pause button
    const top = L.safe.top;

    // progress bar
    const progress = clamp(game.time / Math.max(1, game.duration), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(left - 2, top + 6, L.w - L.safe.left - L.safe.right - 24, 3);
    const grad = this.progressGrad || (this.progressGrad = (() => {
      const g = ctx.createLinearGradient(left, 0, L.w - 12, 0);
      g.addColorStop(0, LANES[0].color);
      g.addColorStop(0.5, LANES[1].color);
      g.addColorStop(1, LANES[3].color);
      return g;
    })());
    ctx.fillStyle = grad;
    ctx.fillRect(left - 2, top + 6, (L.w - L.safe.left - L.safe.right - 24) * progress, 3);

    // score
    const value = Math.round(sc.displayScore);
    if (value !== this.scoreCache.value) {
      this.scoreCache.value = value;
      this.scoreCache.text = value.toLocaleString('en-US');
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = this.fonts.score;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.scoreCache.text, left, top + 36);

    const mult = sc.multiplier;
    if (mult !== this.lastMult) {
      if (mult > this.lastMult) this.multBump = 1;
      this.lastMult = mult;
    }
    ctx.font = this.fonts.mult;
    ctx.fillStyle = mult >= 4 ? LANES[3].color : mult === 3 ? LANES[1].color : mult === 2 ? LANES[0].color : 'rgba(255,255,255,0.55)';
    const ms = 1 + (this.reducedMotion ? 0 : this.multBump * 0.4);
    ctx.save();
    ctx.translate(left, top + 56);
    ctx.scale(ms, ms);
    ctx.fillText(`×${mult}`, 0, 0);
    ctx.restore();

    // accuracy + time remaining
    ctx.textAlign = 'right';
    ctx.font = this.fonts.hud;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${sc.accuracy.toFixed(1)}%`, right, top + 32);
    const remain = Math.max(0, game.duration - Math.max(0, game.time));
    const m = Math.floor(remain / 60);
    const s = Math.floor(remain % 60);
    ctx.font = this.fonts.small;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${m}:${s < 10 ? '0' : ''}${s}`, right, top + 50);

    // combo in the middle of the highway
    if (sc.combo >= 4) {
      const y = L.topY + (L.targetY - L.topY) * 0.4;
      const bump = this.reducedMotion ? 1 : 1 + sc.comboBump * 0.12;
      ctx.save();
      ctx.translate(L.cx, y);
      ctx.scale(bump, bump);
      ctx.textAlign = 'center';
      ctx.font = this.fonts.combo;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = mult >= 4 ? LANES[3].color : '#ffffff';
      if (this.q.glow && mult >= 2) {
        ctx.shadowColor = mult >= 4 ? LANES[3].color : LANES[1].color;
        ctx.shadowBlur = 14;
      }
      ctx.fillText(String(sc.combo), 0, 0);
      ctx.shadowBlur = 0;
      ctx.font = this.fonts.comboLabel;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('COMBO', 0, 20);
      ctx.restore();
    }
  }

  drawCountdown(game) {
    const n = game.countdown;
    if (n === null) return;
    const ctx = this.ctx;
    const L = this.L;
    const t = game.state === 'resuming' ? game.pausedAt - game.time : -game.time;
    const frac = n === 0 ? Math.min(1, game.time / 0.6) : 1 - (t - (n - 1));
    const scale = this.reducedMotion ? 1 : 1.25 - 0.25 * Math.min(1, frac * 3);
    ctx.save();
    ctx.translate(L.cx, L.h * 0.42);
    ctx.scale(scale, scale);
    ctx.globalAlpha = n === 0 ? 1 - frac : 0.5 + 0.5 * (1 - frac);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = this.fonts.countdown;
    ctx.fillStyle = '#ffffff';
    if (this.q.glow) {
      ctx.shadowColor = LANES[(n + 3) % 4].color;
      ctx.shadowBlur = 24;
    }
    ctx.fillText(n === 0 ? 'GO!' : String(n), 0, 0);
    ctx.restore();
    if (game.state === 'resuming') {
      ctx.textAlign = 'center';
      ctx.font = this.fonts.hud;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Get ready…', L.cx, L.h * 0.42 + Math.min(L.w, L.h) * 0.16);
    }
  }

  drawFps() {
    const ctx = this.ctx;
    const L = this.L;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = this.fonts.small;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${Math.round(this.fps)} fps · ${this.qualityName}`, L.safe.left + 10, L.h - L.safe.bottom - 8);
  }
}
