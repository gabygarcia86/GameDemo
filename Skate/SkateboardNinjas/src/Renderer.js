// Draws one frame. The world uses a logical view ~540 units tall (taller in
// portrait) scaled to the canvas; the skater stays at a fixed horizontal
// anchor while the street scrolls, and the camera lifts when they fly high.
// Positions are interpolated between fixed physics steps for smoothness.

import { CONFIG } from './config.js';
import { lerp, clamp } from './Physics.js';
import { Background } from './art/background.js';
import { NinjaAnimator, drawBoard, drawShuriken } from './art/ninja.js';
import { drawKaren, drawEvilNinja, drawWarning } from './art/karen.js';
import { drawObstacle, drawRamp, drawRail, drawStreet, drawSidewalkDecor } from './art/props.js';

const FONT = '"Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif';
const BASE_VIEW_H = 540;
const MIN_VIEW_W = 620;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.viewW = 960;
    this.viewH = BASE_VIEW_H;
    this.groundY = 420;
    this.px = 1;
    this.camX = 0;
    this.camY = 0;
    this.anchor = CONFIG.player.screenAnchor;
    this.shake = 0;
    this.time = 0;
    this.bg = new Background();
    this.ninja = new NinjaAnimator();
  }

  // cssW/cssH: canvas size in CSS pixels; controlsCss: height of the touch controls.
  resize(cssW, cssH, controlsCss) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    const aspect = cssW / Math.max(1, cssH);
    let viewH = BASE_VIEW_H;
    let viewW = viewH * aspect;
    if (viewW < MIN_VIEW_W) {
      viewW = MIN_VIEW_W;
      viewH = viewW / aspect;
    }
    this.viewW = viewW;
    this.viewH = viewH;
    this.anchor = viewW < 900 ? CONFIG.player.narrowAnchor : CONFIG.player.screenAnchor;
    this.px = this.canvas.width / viewW;
    const unitsPerCss = viewW / cssW;
    this.groundY = viewH - clamp(controlsCss * unitsPerCss + 10, 105, viewH * 0.42);
    this.bg.invalidate(this.px);
  }

  addShake(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  // Convert a world point to screen (view-unit) coordinates.
  toScreenX(x) { return x - this.camX; }
  toScreenY(y) { return this.groundY + this.camY - y; }

  render(game, alpha, dt) {
    const ctx = this.ctx;
    const p = game.player;
    this.time += dt;
    const t = this.time;

    const px = lerp(p.prevX, p.x, alpha);
    const py = lerp(p.prevY, p.y, alpha);
    this.camX = px - this.viewW * this.anchor;
    const camTarget = Math.max(0, py + 150 - (this.groundY - 40));
    this.camY += (camTarget - this.camY) * Math.min(1, dt * 5);

    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 40);
    }

    ctx.setTransform(this.px, 0, 0, this.px, 0, 0);
    this.bg.draw(ctx, this.camX, this.camY, this.viewW, this.viewH, this.groundY, t);

    ctx.save();
    ctx.translate(-this.camX + sx, this.groundY + this.camY + sy);
    const left = this.camX - 60;
    const right = this.camX + this.viewW + 60;
    const bottom = this.viewH - this.groundY + 40;
    const w = game.world;

    drawSidewalkDecor(ctx, left, right, t);

    // Karens waiting at the back of the sidewalk
    for (const k of w.karens) {
      if (k.dead || k.x < left - 40 || k.x > right + 40) continue;
      if (k.laneT > 0.001) this.drawKarenAt(ctx, k, alpha, t);
    }

    drawStreet(ctx, left, right, bottom, w.gaps);
    for (const r of w.ramps) if (r.x + r.len > left && r.x < right) drawRamp(ctx, r);
    for (const r of w.rails) if (r.x + r.len > left && r.x < right) drawRail(ctx, r, w);
    for (const o of w.obstacles) if (o.x + o.kx > left && o.x + o.kx < right) drawObstacle(ctx, o, t);
    for (const k of w.karens) {
      if (!k.dead && k.laneT <= 0.001 && k.x > left - 40 && k.x < right + 40) this.drawKarenAt(ctx, k, alpha, t);
    }
    for (const s of game.stars.items) {
      if (s.active) drawShuriken(ctx, lerp(s.prevX, s.x, alpha), -s.y, s.spin);
    }

    // Skater
    if (p.state === 'wipeout') {
      const b = p.board;
      ctx.save();
      ctx.translate(b.x, -b.y - 13);
      ctx.rotate(-b.rot);
      drawBoard(ctx, 0, 0);
      ctx.restore();
    }
    this.ninja.update(dt, p, game.tricks, t);
    const speedNorm = clamp((p.speed - 200) / 250, 0, 1);
    this.ninja.draw(ctx, p, px, py, t, speedNorm);

    game.particles.draw(ctx);
    if (CONFIG.debug) this.drawDebug(ctx, game, px, py);
    ctx.restore();

    this.drawOverlays(ctx, game, alpha, t);
    game.particles.drawTexts(ctx, FONT);
  }

  drawKarenAt(ctx, k, alpha, t) {
    const x = lerp(k.prevX, k.x, alpha);
    const lane = k.laneT;
    ctx.save();
    ctx.translate(x, -lane * 22 - k.hop);
    const s = 1 - 0.14 * lane;
    ctx.scale(s, s);
    if (k.kind === 'ninja') drawEvilNinja(ctx, k, t);
    else drawKaren(ctx, k, t);
    ctx.restore();
  }

  // Screen-space: speech bubbles and warning markers over the world.
  drawOverlays(ctx, game, alpha, t) {
    for (const k of game.world.karens) {
      if (k.dead) continue;
      const kx = this.toScreenX(lerp(k.prevX, k.x, alpha));
      const headY = this.toScreenY(100 + k.laneT * 10 + k.hop);
      const onScreen = kx > -40 && kx < this.viewW + 40;

      const dangerSoon = !k.hit && (
        (k.kind === 'stepper' && (k.state === 'warn' || k.state === 'step')) ||
        (k.kind === 'charger' && k.state === 'run') ||
        (k.kind === 'ninja' && (k.state === 'warn' || k.state === 'leap'))
      );
      if (dangerSoon && onScreen) drawWarning(ctx, kx, headY - 30, Math.sin(t * 18) * 0.5 + 0.5);

      // Off-screen charger: pulse an arrow at the right edge.
      if (!k.hit && k.state === 'run' && kx > this.viewW - 10) {
        const ey = this.toScreenY(50);
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(t * 18) * 0.4;
        drawWarning(ctx, this.viewW - 22, ey, 0);
        ctx.restore();
      }

      if (k.shout > 0 && onScreen) this.drawBubble(ctx, kx, headY - (dangerSoon ? 50 : 18), k.quote, Math.min(1, k.shout * 3));
    }
  }

  drawBubble(ctx, x, y, text, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `900 12px ${FONT}`;
    const w = ctx.measureText(text).width + 18;
    const h = 24;
    const bx = Math.min(this.viewW - w - 6, Math.max(6, x - w * 0.7));
    const by = y - h;
    ctx.beginPath();
    ctx.moveTo(bx + 8, by);
    ctx.lineTo(bx + w - 8, by);
    ctx.quadraticCurveTo(bx + w, by, bx + w, by + 8);
    ctx.lineTo(bx + w, by + h - 8);
    ctx.quadraticCurveTo(bx + w, by + h, bx + w - 8, by + h);
    ctx.lineTo(x + 2, by + h);
    ctx.lineTo(x - 2, by + h + 9);
    ctx.lineTo(x - 10, by + h);
    ctx.lineTo(bx + 8, by + h);
    ctx.quadraticCurveTo(bx, by + h, bx, by + h - 8);
    ctx.lineTo(bx, by + 8);
    ctx.quadraticCurveTo(bx, by, bx + 8, by);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1b1030';
    ctx.stroke();
    ctx.fillStyle = '#d61f4f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 9, by + h / 2 + 1);
    ctx.restore();
  }

  // ?debug=1: hitboxes, rail entry lines and the generator's hazard spans.
  drawDebug(ctx, game, px, py) {
    const P = CONFIG.player;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#00ff88';
    const top = game.player.hitTop() - game.player.y;
    ctx.strokeRect(px - P.halfWidth, -py - top, P.halfWidth * 2, top - P.footOffset);
    ctx.strokeStyle = '#ff0055';
    for (const o of game.world.obstacles) if (!o.knocked) ctx.strokeRect(o.x - o.w / 2, -o.h, o.w, o.h);
    for (const k of game.world.karens) {
      if (k.collidable) ctx.strokeRect(k.x - k.w / 2, -k.h, k.w, k.h);
      ctx.beginPath();
      ctx.moveTo(k.meetX, 0);
      ctx.lineTo(k.meetX, 20);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3de1ff';
    for (const r of game.world.rails) {
      ctx.beginPath();
      ctx.moveTo(r.x, -r.h);
      ctx.lineTo(r.x + r.len, -r.h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,0,85,0.25)';
    for (const [a, b] of game.level.hazards) ctx.fillRect(a, 4, b - a, 8);
  }
}
