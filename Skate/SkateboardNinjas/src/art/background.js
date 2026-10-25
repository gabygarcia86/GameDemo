// Parallax city: sunset sky, synthwave sun, clouds, a far skyline, mid-rise
// buildings and street-level shopfronts. Buildings are pre-rendered into a
// small set of cached offscreen canvases and laid out in shuffled blocks, so
// the scenery is endless but cheap to draw and never repeats side by side.

import { hash } from '../rng.js';

const TAU = Math.PI * 2;
const MID_COLORS = ['#6c5ce7', '#4b7bec', '#e8566c', '#f39c4a', '#2bb3a3', '#d65db1', '#5b5fa8', '#3fa4d8'];
const SHOP_COLORS = ['#ff7f50', '#ffd23f', '#4dd4ac', '#7b8cff', '#ff6fae', '#b57bff', '#5ad1ff'];
const SIGNS = ['DOCKING BAY 97', 'NEKO-DO DOJO', 'PIZZA PLANET', 'SKATE SHOP', 'FLYNN\'S ARCADE', 'FLIPPER\'S ARCADE', 'CITY SUSHI', 'BLOCKBUSTER', 'AA UNIFORM', 'DANDY DONUTS', 'CULVER\'S', 'BENNIGAN\'S', 'TCBY YORGURT', 'NABGAB87 STUDIO','TATE\'S COMICS'];
const MID_VARIANTS = 10;
const SHOP_VARIANTS = SIGNS.length; // one shopfront per sign
const FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif';

export class Background {
  constructor() {
    this.cache = new Map();
    this.orders = new Map(); // shuffled slot blocks, see slotVariant()
    this.px = 1;
    this.sky = null;
    this.skyKey = '';
  }

  // Called on resize: cached sprites are rendered at the current resolution.
  invalidate(pxPerUnit) {
    this.cache.clear();
    this.px = Math.min(pxPerUnit, 1.6);
    this.sky = null;
  }

  draw(ctx, camX, camY, viewW, viewH, groundY, time) {
    const horizon = groundY - 34;
    this.drawSky(ctx, viewW, viewH, groundY);
    this.drawSun(ctx, viewW, horizon, camY);
    this.drawClouds(ctx, camX, viewW, horizon, camY, time);
    this.drawFar(ctx, camX * 0.12, viewW, horizon + camY * 0.12);
    this.drawLayer(ctx, 'mid', camX * 0.35, viewW, horizon + camY * 0.35, 200, MID_VARIANTS);
    this.drawLayer(ctx, 'shop', camX * 0.7, viewW, horizon + camY * 0.7, 270, SHOP_VARIANTS);
  }

  drawSky(ctx, viewW, viewH, groundY) {
    const key = `${viewW}|${viewH}|${groundY}`;
    if (!this.sky || this.skyKey !== key) {
      const g = ctx.createLinearGradient(0, 0, 0, groundY);
      g.addColorStop(0, '#24154f');
      g.addColorStop(0.45, '#7a2f8f');
      g.addColorStop(0.78, '#ff6f91');
      g.addColorStop(1, '#ffc36b');
      this.sky = g;
      this.skyKey = key;
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  drawSun(ctx, viewW, horizon, camY) {
    const x = viewW * 0.7;
    const r = 86;
    const y = horizon - 150 + camY * 0.05;
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#fff3a3');
    g.addColorStop(1, '#ff5f8f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // retro stripes cut through the lower half
    ctx.fillStyle = '#ff7f9c';
    for (let i = 0; i < 5; i++) {
      const sy = y + 12 + i * 15;
      ctx.fillRect(x - r, sy, r * 2, 2 + i * 1.3);
    }
  }

  drawClouds(ctx, camX, viewW, horizon, camY, time) {
    const off = camX * 0.05 + time * 8;
    const slot = 320;
    ctx.fillStyle = 'rgba(255, 220, 240, 0.55)';
    for (let i = Math.floor(off / slot) - 1; i <= Math.floor((off + viewW) / slot) + 1; i++) {
      if (hash(i, 3) < 0.35) continue;
      const x = i * slot - off + hash(i, 4) * 120;
      const y = horizon - 230 - hash(i, 5) * 120 + camY * 0.06;
      const s = 0.7 + hash(i, 6) * 0.6;
      ctx.beginPath();
      ctx.ellipse(x, y, 46 * s, 14 * s, 0, 0, TAU);
      ctx.ellipse(x + 26 * s, y - 10 * s, 28 * s, 16 * s, 0, 0, TAU);
      ctx.ellipse(x - 22 * s, y - 6 * s, 22 * s, 12 * s, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Silhouette skyline with the occasional pagoda.
  drawFar(ctx, off, viewW, base) {
    const slot = 70;
    ctx.fillStyle = '#5b3a8c';
    for (let i = Math.floor(off / slot) - 1; i <= Math.floor((off + viewW) / slot) + 1; i++) {
      const x = i * slot - off;
      const r = hash(i, 9);
      if (r > 0.92) {
        // pagoda
        const h = 150;
        for (let tier = 0; tier < 4; tier++) {
          const ty = base - (tier + 1) * (h / 4);
          const tw = 60 - tier * 11;
          ctx.fillRect(x + 35 - tw * 0.3, ty, tw * 0.6, h / 4);
          ctx.beginPath();
          ctx.moveTo(x + 35 - tw / 2 - 8, ty + 6);
          ctx.quadraticCurveTo(x + 35, ty - 10, x + 35 + tw / 2 + 8, ty + 6);
          ctx.fill();
        }
        ctx.fillRect(x + 34, base - h - 22, 2, 22);
        continue;
      }
      const h = 70 + r * 170;
      const w = slot - 4 - hash(i, 10) * 18;
      ctx.fillRect(x, base - h, w, h);
      if (hash(i, 11) > 0.7) ctx.fillRect(x + w * 0.4, base - h - 24, 3, 24);
    }
  }

  drawLayer(ctx, layer, off, viewW, base, slot, variants) {
    for (let i = Math.floor(off / slot) - 1; i <= Math.floor((off + viewW) / slot) + 1; i++) {
      const v = this.variant(layer, this.slotVariant(layer, i, variants));
      const x = i * slot - off + (slot - v.w) * 0.5;
      ctx.drawImage(v.canvas, x, base - v.h, v.w, v.h);
    }
  }

  // Slots come in blocks of `variants`, each holding every variant once in a
  // shuffled order. If a block would start with the previous block's last
  // variant, its first two swap, so neighbours always differ.
  slotVariant(layer, i, variants) {
    const block = Math.floor(i / variants);
    const key = layer + block;
    let order = this.orders.get(key);
    if (!order) {
      const salt = layer === 'mid' ? 21 : 37;
      order = shuffledOrder(variants, block, salt);
      const prevLast = shuffledOrder(variants, block - 1, salt)[variants - 1];
      if (order[0] === prevLast) [order[0], order[1]] = [order[1], order[0]];
      if (this.orders.size > 16) this.orders.clear();
      this.orders.set(key, order);
    }
    return order[i - block * variants];
  }

  variant(layer, idx) {
    const key = layer + idx;
    let v = this.cache.get(key);
    if (v) return v;
    const r = (n) => hash(idx * 31 + n, layer === 'mid' ? 11 : 23);
    const w = layer === 'mid' ? 140 + r(1) * 52 : 230 + r(1) * 36;
    const h = layer === 'mid' ? 170 + r(2) * 170 : 112 + r(2) * 40;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * this.px));
    canvas.height = Math.max(1, Math.ceil(h * this.px));
    const g = canvas.getContext('2d');
    g.scale(this.px, this.px);
    if (layer === 'mid') paintTower(g, w, h, r, idx);
    else paintShop(g, w, h, r, idx);
    v = { canvas, w, h };
    this.cache.set(key, v);
    return v;
  }
}

// Fisher-Yates shuffle of 0..n-1, deterministic per block.
function shuffledOrder(n, block, salt) {
  const order = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = Math.floor(hash(block * 97 + k, salt) * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return order;
}

function paintTower(g, w, h, r, idx) {
  const color = MID_COLORS[Math.floor(r(3) * MID_COLORS.length)];
  const roof = 18;
  g.fillStyle = color;
  g.fillRect(0, roof, w, h - roof);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(w * 0.78, roof, w * 0.22, h - roof);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, roof, w, 6);
  // rooftop: water tower or AC units
  g.fillStyle = 'rgba(30,20,60,0.85)';
  if (r(4) > 0.5) {
    g.fillRect(w * 0.2, roof - 16, 26, 16);
    g.fillRect(w * 0.2 + 4, roof - 22, 18, 6);
  } else {
    g.fillRect(w * 0.55, roof - 10, 20, 10);
    g.fillRect(w * 0.3, roof - 7, 14, 7);
  }
  // windows
  const cols = Math.floor((w - 16) / 22);
  const rows = Math.floor((h - roof - 20) / 26);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lit = hash(row * 17 + col * 3 + Math.floor(r(5) * 1000), 2) > 0.45;
      g.fillStyle = lit ? '#ffe08a' : 'rgba(25,15,55,0.55)';
      g.fillRect(12 + col * 22, roof + 14 + row * 26, 12, 15);
    }
  }
  // vertical neon sign on some towers
  if (r(6) > 0.6) {
    const word = SIGNS[idx % SIGNS.length].slice(0, 4); // distinct per tower variant
    g.fillStyle = '#1a1033';
    g.fillRect(w - 26, roof + 20, 20, word.length * 18 + 10);
    g.font = `900 14px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = r(8) > 0.5 ? '#3de1ff' : '#ff3d7f';
    for (let i = 0; i < word.length; i++) g.fillText(word[i], w - 16, roof + 34 + i * 18);
  }
}

function paintShop(g, w, h, r, idx) {
  const color = SHOP_COLORS[Math.floor(r(3) * SHOP_COLORS.length)];
  const accent = SHOP_COLORS[(Math.floor(r(3) * SHOP_COLORS.length) + 3) % SHOP_COLORS.length];
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, h - 10, w, 10);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(0, 0, w, 5);

  // sign board
  const word = SIGNS[idx];
  g.fillStyle = '#1a1033';
  g.fillRect(16, 10, w - 32, 28);
  g.strokeStyle = accent;
  g.lineWidth = 3;
  g.strokeRect(18, 12, w - 36, 24);
  g.font = `900 18px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = accent;
  g.fillText(word, w / 2, 25);

  // striped awning
  const ay = 44;
  for (let x = 6, i = 0; x < w - 6; x += 18, i++) {
    g.fillStyle = i % 2 === 0 ? '#fff6ee' : accent;
    g.beginPath();
    g.moveTo(x, ay);
    g.lineTo(x + 18, ay);
    g.lineTo(x + 18, ay + 14);
    g.quadraticCurveTo(x + 9, ay + 20, x, ay + 14);
    g.closePath();
    g.fill();
  }

  // big window with reflections + door
  const wy = ay + 24;
  const wh = h - wy - 12;
  g.fillStyle = '#9fd8ff';
  g.fillRect(14, wy, w * 0.58, wh);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.moveTo(24, wy + wh);
  g.lineTo(44, wy);
  g.lineTo(56, wy);
  g.lineTo(36, wy + wh);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(40,20,80,0.35)';
  g.fillRect(14, wy + wh - 6, w * 0.58, 6);
  g.fillStyle = '#3b2a5a';
  g.fillRect(w * 0.7, wy - 4, w * 0.2, wh + 4);
  g.fillStyle = '#ffd23f';
  g.fillRect(w * 0.7 + 5, wy + wh / 2, 4, 4);
  g.strokeStyle = '#1a1033';
  g.lineWidth = 3;
  g.strokeRect(14, wy, w * 0.58, wh);
}
