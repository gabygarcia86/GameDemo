// Street props: obstacles, ramps, rails, benches, ledges, gaps, the street
// itself and sidewalk decoration. World space with y = 0 at the street
// surface and y DOWN positive (heights are drawn at negative y).

import { hash } from '../rng.js';
import { rampHeight } from '../World.js';

const TAU = Math.PI * 2;
const OUT = '#1b1030';

function outline(ctx, w = 2.4) {
  ctx.lineWidth = w;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

// ------------------------------------------------------------ obstacles

export function drawObstacle(ctx, o, time) {
  ctx.save();
  ctx.translate(o.x + o.kx, -o.ky);
  if (o.knocked) ctx.rotate(o.krot);
  switch (o.kind) {
    case 'cone': cone(ctx); break;
    case 'hydrant': hydrant(ctx); break;
    case 'trash': trash(ctx); break;
    case 'barrier': barrier(ctx, time); break;
  }
  ctx.restore();
}

function cone(ctx) {
  ctx.fillStyle = '#d9480f';
  ctx.beginPath();
  ctx.rect(-13, -4, 26, 4);
  ctx.fill();
  outline(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(-3, -34);
  ctx.lineTo(3, -34);
  ctx.lineTo(9, -4);
  ctx.closePath();
  ctx.fillStyle = '#ff7a1a';
  ctx.fill();
  outline(ctx, 2.2);
  ctx.fillStyle = '#fff';
  const band = (y0, y1) => {
    const w0 = 9 - (6 * (y0 - 4)) / 30;
    const w1 = 9 - (6 * (y1 - 4)) / 30;
    ctx.beginPath();
    ctx.moveTo(-w0, -y0); ctx.lineTo(w0, -y0); ctx.lineTo(w1, -y1); ctx.lineTo(-w1, -y1);
    ctx.closePath();
    ctx.fill();
  };
  band(12, 16);
  band(22, 25);
}

function hydrant(ctx) {
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.rect(-11, -5, 22, 5);
  ctx.fill();
  outline(ctx, 2);
  ctx.beginPath();
  ctx.rect(-8, -30, 16, 25);
  ctx.fill();
  outline(ctx, 2.2);
  ctx.beginPath();
  ctx.rect(-13, -23, 26, 7);
  ctx.fill();
  outline(ctx, 2);
  ctx.beginPath();
  ctx.arc(0, -30, 8, Math.PI, TAU);
  ctx.fill();
  outline(ctx, 2.2);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.rect(-2.5, -41, 5, 4);
  ctx.fill();
  outline(ctx, 1.6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-5, -28, 3, 20);
}

function trash(ctx) {
  ctx.fillStyle = '#2e9e6b';
  ctx.beginPath();
  ctx.moveTo(-15, -44);
  ctx.lineTo(15, -44);
  ctx.lineTo(13, 0);
  ctx.lineTo(-13, 0);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = '#1f7a51';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const x of [-8, 0, 8]) { ctx.moveTo(x, -40); ctx.lineTo(x * 0.9, -4); }
  ctx.stroke();
  ctx.fillStyle = '#3cc489';
  ctx.beginPath();
  ctx.rect(-18, -50, 36, 7);
  ctx.fill();
  outline(ctx, 2.2);
  ctx.beginPath();
  ctx.rect(-5, -54, 10, 4);
  ctx.fill();
  outline(ctx, 1.8);
  // a banana peel, for comedy
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(10, -52, 5, 2, -0.5, 0, TAU);
  ctx.fill();
}

function barrier(ctx, time) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-26, 0); ctx.lineTo(-19, -46);
  ctx.moveTo(26, 0); ctx.lineTo(19, -46);
  ctx.stroke();
  ctx.strokeStyle = '#8c8fa8';
  ctx.lineWidth = 3;
  ctx.stroke();
  stripedBoard(ctx, -30, -50, 60, 11);
  stripedBoard(ctx, -26, -30, 52, 8);
  const on = Math.floor(time * 3) % 2 === 0;
  ctx.beginPath();
  ctx.arc(-22, -53, 3.5, 0, TAU);
  ctx.fillStyle = on ? '#ffb703' : '#7a5a10';
  ctx.fill();
  outline(ctx, 1.6);
}

function stripedBoard(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#e63946';
  for (let i = -h; i < w; i += 14) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + 7, y + h);
    ctx.lineTo(x + i + 7 + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  outline(ctx, 2);
}

// ------------------------------------------------------------ ramps

function rampPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(r.x, 0);
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    ctx.lineTo(r.x + r.len * t, -rampHeight(r, t));
  }
}

export function drawRamp(ctx, r) {
  const big = r.kind === 'launch';
  rampPath(ctx, r);
  ctx.lineTo(r.x + r.len, 0);
  ctx.closePath();
  ctx.fillStyle = big ? '#ff5d73' : '#e0a458';
  ctx.fill();
  outline(ctx, 3);

  // bracing
  ctx.save();
  rampPath(ctx, r);
  ctx.lineTo(r.x + r.len, 0);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = big ? 'rgba(80,0,40,0.35)' : 'rgba(110,60,20,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = r.x + 26; x < r.x + r.len; x += 26) { ctx.moveTo(x, 0); ctx.lineTo(x, -r.h); }
  ctx.moveTo(r.x + r.len * 0.35, 0);
  ctx.lineTo(r.x + r.len, -r.h * 0.9);
  ctx.stroke();
  if (big) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(r.x, -r.h * 0.42, r.len, 7);
    ctx.fillStyle = '#3de1ff';
    ctx.fillRect(r.x, -r.h * 0.42 + 9, r.len, 4);
  }
  ctx.restore();

  // riding surface + metal lip
  rampPath(ctx, r);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#3b2a4a';
  ctx.stroke();
  ctx.fillStyle = '#d7deef';
  ctx.beginPath();
  ctx.rect(r.x + r.len - 7, -r.h - 3, 9, 5);
  ctx.fill();
  outline(ctx, 1.5);
}

// ------------------------------------------------------------ grind surfaces

const RAIL_COLORS = { rail: '#ffd23f', high: '#3de1ff', combo: '#ff3d7f' };

export function drawRail(ctx, r, world) {
  if (r.kind === 'bench') return bench(ctx, r);
  if (r.kind === 'ledge') return ledge(ctx, r);
  const x0 = r.x, x1 = r.x + r.len, h = r.h;
  const posts = Math.max(2, Math.ceil(r.len / 120) + 1);
  for (let i = 0; i < posts; i++) {
    const px = x0 + 10 + ((r.len - 20) * i) / (posts - 1);
    if (world.isGap(px)) continue;
    ctx.fillStyle = '#3c3f58';
    ctx.beginPath();
    ctx.rect(px - 2.5, -h + 2, 5, h - 2);
    ctx.fill();
    outline(ctx, 1.4);
    ctx.fillStyle = '#5d6180';
    ctx.fillRect(px - 7, -3, 14, 3);
  }
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, -h + 3);
  ctx.lineTo(x1, -h + 3);
  ctx.lineWidth = 9;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = RAIL_COLORS[r.kind] || RAIL_COLORS.rail;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + 2, -h + 1.6);
  ctx.lineTo(x1 - 2, -h + 1.6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
}

function bench(ctx, r) {
  const x0 = r.x, x1 = r.x + r.len, h = r.h;
  ctx.fillStyle = '#3c3f58';
  for (const lx of [x0 + 14, x1 - 18]) {
    ctx.beginPath();
    ctx.rect(lx, -h + 6, 5, h - 6);
    ctx.fill();
    outline(ctx, 1.4);
  }
  ctx.beginPath();
  ctx.rect(x0, -h, r.len, 8);
  ctx.fillStyle = '#c0703f';
  ctx.fill();
  outline(ctx, 2.2);
  ctx.strokeStyle = '#8a4b26';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x0 + 3, -h + 4);
  ctx.lineTo(x1 - 3, -h + 4);
  ctx.stroke();
  ctx.fillStyle = '#dfe4f5';
  ctx.fillRect(x0, -h - 1, r.len, 2);
}

function ledge(ctx, r) {
  const x0 = r.x, h = r.h;
  // plants behind the coping
  for (let x = x0 + 12; x < x0 + r.len - 8; x += 22) {
    const s = hash(Math.floor(x), 5);
    ctx.fillStyle = s > 0.5 ? '#2bb37a' : '#3fd18e';
    ctx.beginPath();
    ctx.ellipse(x, -h - 6, 11, 9 + s * 4, 0, 0, TAU);
    ctx.fill();
    if (s > 0.6) {
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath();
      ctx.arc(x + 3, -h - 12 - s * 3, 2.6, 0, TAU);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.rect(x0, -h, r.len, h);
  ctx.fillStyle = '#9d91c7';
  ctx.fill();
  outline(ctx, 2.4);
  ctx.strokeStyle = 'rgba(40,20,80,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0 + 40; x < x0 + r.len; x += 40) { ctx.moveTo(x, -h + 4); ctx.lineTo(x, 0); }
  ctx.stroke();
  ctx.fillStyle = '#e4e8f7';
  ctx.beginPath();
  ctx.rect(x0 - 2, -h - 2, r.len + 4, 5);
  ctx.fill();
  outline(ctx, 1.6);
}

// ------------------------------------------------------------ street

// The sidewalk band (behind the lane), the curb face, and the road below.
export function drawStreet(ctx, left, right, bottom, gaps) {
  const w = right - left;
  ctx.fillStyle = '#d4cdea';
  ctx.fillRect(left, -34, w, 34);
  ctx.fillStyle = '#e8e2f8';
  ctx.fillRect(left, -34, w, 4);
  ctx.strokeStyle = 'rgba(80,60,130,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.floor(left / 90) * 90; x < right; x += 90) {
    ctx.moveTo(x, -34);
    ctx.lineTo(x - 14, 0);
  }
  ctx.stroke();
  ctx.fillStyle = '#9b92bd';
  ctx.fillRect(left, 0, w, 18);
  ctx.fillStyle = '#7d73a3';
  ctx.fillRect(left, 15, w, 3);
  ctx.fillStyle = '#3a3360';
  ctx.fillRect(left, 18, w, bottom - 18);
  ctx.fillStyle = '#ffd23f';
  for (let x = Math.floor(left / 140) * 140; x < right; x += 140) ctx.fillRect(x, 66, 70, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(left, 18, w, 6);

  for (const g of gaps) {
    if (g.x + g.w < left || g.x > right) continue;
    drawGap(ctx, g, bottom);
  }
}

function drawGap(ctx, g, bottom) {
  const grad = ctx.createLinearGradient(0, -34, 0, 140);
  grad.addColorStop(0, '#2a1d4d');
  grad.addColorStop(1, '#07040f');
  ctx.fillStyle = grad;
  ctx.fillRect(g.x, -34, g.w, bottom + 34);
  ctx.fillStyle = '#4b3a7a';
  ctx.fillRect(g.x, -34, 6, bottom + 34);
  ctx.fillStyle = '#1a1230';
  ctx.fillRect(g.x + g.w - 6, -34, 6, bottom + 34);
  // hazard stripes along both lips
  for (const ex of [g.x - 18, g.x + g.w]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex, -3, 18, 6);
    ctx.clip();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(ex, -3, 18, 6);
    ctx.fillStyle = '#140c2b';
    for (let i = 0; i < 4; i++) ctx.fillRect(ex + i * 6 - 2, -3, 3, 6);
    ctx.restore();
  }
  // murky water far below
  ctx.fillStyle = 'rgba(61,225,255,0.18)';
  ctx.fillRect(g.x + 6, 120, g.w - 12, 10);
}

// ------------------------------------------------------------ sidewalk decor

// Lamps, trees and boxes on the back edge of the sidewalk, chosen per slot by hash.
export function drawSidewalkDecor(ctx, left, right, time) {
  const slot = 340;
  for (let i = Math.floor(left / slot) - 1; i <= Math.floor(right / slot) + 1; i++) {
    const r = hash(i, 91);
    const x = i * slot + hash(i, 92) * 120;
    if (r < 0.42) lamp(ctx, x, time);
    else if (r < 0.7) tree(ctx, x, r);
    else if (r < 0.82) newsBox(ctx, x, r);
  }
}

function lamp(ctx, x) {
  const base = -26;
  ctx.fillStyle = '#2d2a4a';
  ctx.fillRect(x - 3, base - 150, 6, 150);
  ctx.fillRect(x - 7, base - 8, 14, 8);
  ctx.beginPath();
  ctx.moveTo(x, base - 150);
  ctx.quadraticCurveTo(x + 4, base - 162, x + 22, base - 160);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2d2a4a';
  ctx.stroke();
  ctx.fillStyle = '#ffe9a3';
  ctx.beginPath();
  ctx.ellipse(x + 24, base - 156, 9, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,233,163,0.15)';
  ctx.beginPath();
  ctx.moveTo(x + 16, base - 154);
  ctx.lineTo(x + 32, base - 154);
  ctx.lineTo(x + 52, base);
  ctx.lineTo(x - 4, base);
  ctx.closePath();
  ctx.fill();
  // a little banner
  ctx.fillStyle = '#ff3d7f';
  ctx.fillRect(x + 3, base - 128, 14, 26);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 7, base - 120, 6, 6);
}

function tree(ctx, x, r) {
  const base = -26;
  ctx.fillStyle = '#6b4a3a';
  ctx.fillRect(x - 4, base - 70, 8, 70);
  ctx.fillStyle = '#7a6aa8';
  ctx.fillRect(x - 16, base - 10, 32, 10);
  const greens = ['#24a46b', '#2fc27e', '#1d8a5a'];
  const blobs = [[-16, -86, 22], [14, -90, 24], [0, -108, 26], [-4, -80, 20]];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    ctx.fillStyle = greens[(i + Math.floor(r * 10)) % 3];
    ctx.beginPath();
    ctx.arc(x + b[0], base + b[1], b[2], 0, TAU);
    ctx.fill();
  }
  if (r > 0.6) {
    ctx.fillStyle = '#ff7eb6';
    for (const p of [[-12, -96], [10, -104], [18, -84], [-2, -118]]) {
      ctx.beginPath();
      ctx.arc(x + p[0], base + p[1], 3, 0, TAU);
      ctx.fill();
    }
  }
}

function newsBox(ctx, x, r) {
  const base = -26;
  ctx.fillStyle = r > 0.76 ? '#3d7bff' : '#ff3d7f';
  ctx.beginPath();
  ctx.rect(x - 12, base - 40, 24, 32);
  ctx.fill();
  outline(ctx, 2);
  ctx.fillStyle = '#dfe9ff';
  ctx.fillRect(x - 8, base - 34, 16, 10);
  ctx.fillStyle = '#2d2a4a';
  ctx.fillRect(x - 10, base - 8, 3, 8);
  ctx.fillRect(x + 7, base - 8, 3, 8);
}
