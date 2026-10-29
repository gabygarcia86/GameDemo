// Suit patterns and stickers, drawn on canvases. Patterns are painted over the
// suit colour (marks use the accent colour where it makes sense) and tile
// around the ninja's limbs. Stickers get a die-cut white border and an ink
// edge so they read on any suit.

import { THREE } from '../gfx.js';
import { makeRng } from '../utils.js';
import { STICKERS } from '../cosmetics.js';

const S = 256;
const INK = '#140c2b';
const TAU = Math.PI * 2;
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
const BOLD_FONT = '"Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif';
const CJK_FONT = '"Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "MS Gothic", sans-serif';

function newCanvas(size = S) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

const _c = new THREE.Color();
// k < 0 darkens, k > 0 lightens towards white.
function shade(hex, k) {
  _c.set(hex);
  if (k < 0) _c.multiplyScalar(1 + k);
  else _c.lerp(new THREE.Color('#ffffff'), k);
  return `#${_c.getHexString()}`;
}

// Draw fn at (x, y) and at its wrapped copies, so scattered marks tile.
function wrapped(x, y, r, fn) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      const px = x + dx, py = y + dy;
      if (px > -r && px < S + r && py > -r && py < S + r) fn(px, py);
    }
  }
}

function starPath(ctx, x, y, r, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function skull(ctx, x, y, r, fill = '#ffffff') {
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = INK;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.15, r, Math.PI * 0.8, Math.PI * 0.2);
  ctx.lineTo(x + r * 0.55, y + r * 0.85);
  ctx.lineTo(x - r * 0.55, y + r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.38, y - r * 0.1, r * 0.26, r * 0.3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.2);
  ctx.lineTo(x - r * 0.12, y + r * 0.42);
  ctx.lineTo(x + r * 0.12, y + r * 0.42);
  ctx.fill();
  for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * r * 0.22 - r * 0.04, y + r * 0.58, r * 0.08, r * 0.27);
}

function flameTongues(ctx, x0, width, base, height, n, colors, rng) {
  for (const [ci, color] of colors.entries()) {
    const k = 1 - ci * 0.28;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * (width / n);
      const w = (width / n) * 0.75 * k;
      const h = height * k * (0.65 + rng() * 0.45);
      ctx.beginPath();
      ctx.moveTo(x - w, base);
      ctx.bezierCurveTo(x - w, base - h * 0.5, x + w * 0.4, base - h * 0.55, x + (rng() - 0.5) * w * 0.6, base - h);
      ctx.bezierCurveTo(x + w * 0.2, base - h * 0.5, x + w, base - h * 0.45, x + w, base);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ------------------------------------------------------------------ patterns

const PATTERN_DRAW = {
  stripes(ctx, base, accent) {
    for (const x of [44, 172]) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 3, 0, 46, S);
      ctx.fillStyle = accent;
      ctx.fillRect(x, 0, 40, S);
    }
  },
  polka(ctx, base, accent) {
    ctx.fillStyle = accent;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        wrapped(c * 64 + (r % 2) * 32 + 16, r * 64 + 16, 20, (x, y) => {
          ctx.beginPath();
          ctx.arc(x, y, 15, 0, TAU);
          ctx.fill();
        });
      }
    }
  },
  checker(ctx, base, accent) {
    ctx.fillStyle = accent;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2) ctx.fillRect(c * 32, r * 32, 32, 32);
  },
  stars(ctx, base, accent, rng) {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.6})`;
      ctx.fillRect(rng() * S, rng() * S, 2, 2);
    }
    for (let i = 0; i < 16; i++) {
      const r = 7 + rng() * 11;
      const col = rng() < 0.5 ? '#ffffff' : '#ffe066';
      wrapped(rng() * S, rng() * S, r, (x, y) => {
        starPath(ctx, x, y, r);
        ctx.fillStyle = col;
        ctx.fill();
      });
    }
  },
  camo(ctx, base, accent, rng) {
    const cols = [shade(base, -0.4), shade(base, 0.2), '#4a5a2a', shade(base, -0.15)];
    for (let i = 0; i < 46; i++) {
      const col = cols[i % cols.length];
      const rx = 16 + rng() * 26, ry = 10 + rng() * 18, rot = rng() * Math.PI;
      wrapped(rng() * S, rng() * S, rx, (x, y) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
        ctx.ellipse(x + rx * 0.5, y + ry * 0.4, rx * 0.6, ry * 0.7, rot + 0.6, 0, TAU);
        ctx.fill();
      });
    }
  },
  tiger(ctx, base, accent, rng) {
    // Black stripes, unless the suit is too dark for them to show.
    _c.set(base);
    ctx.fillStyle = _c.r + _c.g + _c.b < 0.25 ? accent : INK;
    for (let i = 0; i < 9; i++) {
      const y = (i + 0.5) * (S / 9) + (rng() - 0.5) * 8;
      for (const side of [0, 1]) {
        const len = 60 + rng() * 70;
        const x0 = side ? S : 0;
        const dir = side ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x0, y - 9);
        ctx.quadraticCurveTo(x0 + dir * len * 0.5, y - 12 + rng() * 6, x0 + dir * len, y + (rng() - 0.5) * 10);
        ctx.quadraticCurveTo(x0 + dir * len * 0.5, y + 8, x0, y + 9);
        ctx.fill();
      }
    }
  },
  lightning(ctx, base, accent, rng) {
    for (let i = 0; i < 5; i++) {
      const pts = [];
      let x = rng() * S, y = -20;
      while (y < S + 20) {
        pts.push([x, y]);
        x += (rng() - 0.5) * 60;
        y += 22 + rng() * 26;
      }
      for (const [w, col] of [[14, INK], [7, '#ffe066']]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
  },
  flames(ctx, base, accent, rng) {
    flameTongues(ctx, 0, S, S + 4, 190, 7, ['#ff2e00', '#ff8c1a', '#ffe066'], rng);
  },
  skulls(ctx, base, accent) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) skull(ctx, c * 64 + (r % 2) * 32 + 32, r * 64 + 30, 18);
    }
  },
  circuit(ctx, base, accent, rng) {
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 4;
    for (let i = 0; i < 22; i++) {
      let x = Math.round(rng() * 8) * 32, y = Math.round(rng() * 8) * 32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rng() * 2));
        else y += (rng() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rng() * 2));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
    }
  },
  scales(ctx, base) {
    const dark = shade(base, -0.25);
    const rim = shade(base, 0.35);
    for (let r = 9; r >= -1; r--) {
      for (let c = -1; c < 9; c++) {
        const x = c * 32 + (r % 2 ? 16 : 0) + 16;
        const y = r * 28;
        ctx.fillStyle = (r + c) % 3 ? base : dark;
        ctx.strokeStyle = rim;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  },
  galaxy(ctx, base, accent, rng) {
    ctx.fillStyle = shade(base, -0.65);
    ctx.fillRect(0, 0, S, S);
    for (const col of ['rgba(255,61,240,0.45)', 'rgba(61,225,255,0.4)', 'rgba(123,47,247,0.55)', 'rgba(255,61,240,0.3)']) {
      const r = 50 + rng() * 60;
      wrapped(rng() * S, rng() * S, r, (x, y) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + rng() * 0.6})`;
      ctx.fillRect(rng() * S, rng() * S, 1.5 + rng() * 1.5, 1.5 + rng() * 1.5);
    }
    for (let i = 0; i < 6; i++) {
      wrapped(rng() * S, rng() * S, 8, (x, y) => {
        starPath(ctx, x, y, 7, 4, 0.25);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      });
    }
  },
};

// Paint a pattern into a canvas over the suit colour. Rainbow suits paint over
// white instead, and the material colour then tints the whole thing.
function drawPattern(ctx, id, suit, accent) {
  const base = suit === 'rainbow' ? '#ffffff' : suit;
  const acc = accent === 'rainbow' ? '#ffffff' : accent;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  PATTERN_DRAW[id]?.(ctx, base, acc, makeRng(id.length * 977 + 13));
}

const patternCache = new Map();
export function patternTexture(id, suit, accent) {
  const key = `${id}|${suit}|${accent}`;
  if (!patternCache.has(key)) {
    const c = newCanvas();
    drawPattern(c.getContext('2d'), id, suit, accent);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, id === 'flames' ? 1 : 2);
    tex.anisotropy = 4;
    patternCache.set(key, tex);
  }
  return patternCache.get(key);
}

export function patternThumb(id, suit, accent) {
  const c = newCanvas(64);
  const ctx = c.getContext('2d');
  ctx.scale(64 / S, 64 / S);
  drawPattern(ctx, id, suit, accent);
  return c.toDataURL();
}

// ------------------------------------------------------------------ stickers

const STICKER_DRAW = {
  smile(ctx) {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, TAU);
    ctx.fill();
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(128 + s * 34, 104, 12, 20, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 128, 56, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  },
  boss(ctx) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#ffcc33';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(-104, -52, 208, 104, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `900 74px ${BOLD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BOSS', 0, 6);
    ctx.restore();
  },
  shuriken(ctx) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(0.3);
    starPath(ctx, 0, 0, 100, 4, 0.3);
    ctx.fillStyle = '#e4e7f5';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff2e55';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
  yinyang(ctx) {
    const r = 96;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(128, 128, r, -Math.PI / 2, Math.PI / 2);
    ctx.arc(128, 128 + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(128, 128 - r / 2, r / 2, Math.PI / 2, -Math.PI / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(128, 128 - r / 2, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128 + r / 2, 14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, TAU);
    ctx.stroke();
  },
  kanji(ctx) {
    ctx.fillStyle = '#ff2e55';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 98, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 132px ${CJK_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('忍', 128, 136);
  },
  katanas(ctx) {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate(s * 0.75);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      // Blade with a tip.
      ctx.fillStyle = '#e4e7f5';
      ctx.beginPath();
      ctx.moveTo(-9, 30);
      ctx.lineTo(-9, -96);
      ctx.lineTo(0, -114);
      ctx.lineTo(9, -98);
      ctx.lineTo(9, 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Guard and wrapped handle.
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath();
      ctx.ellipse(0, 34, 26, 9, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a1a3a';
      ctx.fillRect(-9, 42, 18, 70);
      ctx.strokeRect(-9, 42, 18, 70);
      ctx.fillStyle = '#ff2e55';
      for (let y = 50; y < 108; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(7, y + 7);
        ctx.lineTo(0, y + 14);
        ctx.lineTo(-7, y + 7);
        ctx.fill();
      }
      ctx.restore();
    }
  },
  flamingSkull(ctx) {
    flameTongues(ctx, 30, 196, 200, 190, 5, ['#ff2e00', '#ff8c1a', '#ffe066'], makeRng(7));
    skull(ctx, 128, 150, 62);
  },
};

function stamp(src, radius, color) {
  const c = newCanvas();
  const ctx = c.getContext('2d');
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.drawImage(src, Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  return c;
}

const stickerCache = new Map();
// The finished sticker canvas (transparent outside the die-cut border).
export function stickerCanvas(id) {
  if (stickerCache.has(id)) return stickerCache.get(id);
  const def = STICKERS.find((s) => s.id === id);
  const art = newCanvas();
  const a = art.getContext('2d');
  // Keep the art inside the border margin.
  a.translate(128, 128);
  a.scale(0.82, 0.82);
  a.translate(-128, -128);
  if (def?.emoji) {
    a.font = `170px ${EMOJI_FONT}`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.fillText(def.emoji, 128, 140);
  } else {
    STICKER_DRAW[id]?.(a);
  }
  const out = newCanvas();
  const o = out.getContext('2d');
  o.drawImage(stamp(art, 13, INK), 0, 0);
  o.drawImage(stamp(art, 9, '#ffffff'), 0, 0);
  o.drawImage(art, 0, 0);
  stickerCache.set(id, out);
  return out;
}

const stickerTexCache = new Map();
export function stickerTexture(id) {
  if (!stickerTexCache.has(id)) {
    const tex = new THREE.CanvasTexture(stickerCanvas(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    stickerTexCache.set(id, tex);
  }
  return stickerTexCache.get(id);
}

export function stickerThumb(id) {
  return stickerCanvas(id).toDataURL();
}
