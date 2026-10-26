/**
 * Procedural artwork. Every ship, bullet and pickup is drawn once with vector
 * paths into an offscreen canvas (glow baked in), then blitted each frame.
 * Ships are authored nose-up (toward -y); enemies are rotated to face down.
 */
import { TAU, lerp, mulberry32, hexToRgba } from './utils.js';

const SS = 2; // supersampling factor for crisp sprites on high-DPI screens

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SS);
  c.height = Math.ceil(h * SS);
  const g = c.getContext('2d');
  g.setTransform(SS, 0, 0, SS, (w * SS) / 2, (h * SS) / 2);
  return { c, g };
}

/** Builds a centered sprite plus a white silhouette used for hit flashes. */
function makeSprite(w, h, draw) {
  const { c, g } = layer(w, h);
  draw(g);
  const f = document.createElement('canvas');
  f.width = c.width;
  f.height = c.height;
  const fg = f.getContext('2d');
  fg.drawImage(c, 0, 0);
  fg.globalCompositeOperation = 'source-in';
  fg.fillStyle = '#ffffff';
  fg.fillRect(0, 0, f.width, f.height);
  return { canvas: c, flash: f, w, h };
}

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function linear(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** Runs `fn` twice: once as authored, once mirrored across the y axis. */
function mirrored(g, fn) {
  fn();
  g.save();
  g.scale(-1, 1);
  fn();
  g.restore();
}

/** Burn marks with glowing cracks, clipped to `outline`. */
function scorch(g, outline, spots, glow = '#ff7a2a') {
  g.save();
  poly(g, outline);
  g.clip();
  for (const [x, y, r] of spots) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(8,6,6,0.9)');
    gr.addColorStop(1, 'rgba(8,6,6,0)');
    g.fillStyle = gr;
    circle(g, x, y, r);
    g.fill();
    g.strokeStyle = glow;
    g.lineWidth = Math.max(0.8, r * 0.08);
    g.shadowColor = glow;
    g.shadowBlur = 4;
    g.beginPath();
    g.moveTo(x - r * 0.5, y - r * 0.2);
    g.lineTo(x, y + r * 0.15);
    g.lineTo(x + r * 0.45, y - r * 0.3);
    g.stroke();
    g.shadowBlur = 0;
  }
  g.restore();
}

/* ------------------------------------------------------------------ ships */

const PLAYER_HULL = [0, -27, 5, -15, 6, -4, 22, 8, 24, 17, 9, 14, 6, 22, -6, 22, -9, 14, -24, 17, -22, 8, -6, -4, -5, -15];

function drawPlayer(g) {
  g.shadowColor = 'rgba(90,200,255,0.6)';
  g.shadowBlur = 8;
  g.fillStyle = linear(g, -24, 0, 24, 0, [[0, '#6f7c96'], [0.5, '#eef3fb'], [1, '#6f7c96']]);
  poly(g, PLAYER_HULL);
  g.fill();
  g.shadowBlur = 0;

  g.save();
  poly(g, PLAYER_HULL);
  g.clip();
  g.fillStyle = linear(g, 0, -27, 0, 22, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(20,30,60,0.45)']]);
  g.fillRect(-25, -28, 50, 52);
  g.restore();

  g.lineWidth = 1.1;
  g.strokeStyle = '#18213d';
  poly(g, PLAYER_HULL);
  g.stroke();

  g.fillStyle = '#ff8a2a';
  mirrored(g, () => {
    poly(g, [11, 5, 20, 10, 21, 13, 12, 9]);
    g.fill();
  });

  mirrored(g, () => {
    g.fillStyle = '#2a3352';
    g.fillRect(17.5, -9, 3, 20);
    g.fillStyle = '#7ff3ff';
    g.fillRect(17.5, -11.5, 3, 2.5);
  });

  g.strokeStyle = 'rgba(24,33,61,0.55)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(0, -21); g.lineTo(0, -15);
  g.moveTo(-6, 6); g.lineTo(-6, 18);
  g.moveTo(6, 6); g.lineTo(6, 18);
  g.moveTo(-14, 8); g.lineTo(-8, 4);
  g.moveTo(14, 8); g.lineTo(8, 4);
  g.stroke();

  const cg = g.createRadialGradient(-1, -9, 0.5, 0, -6, 8);
  cg.addColorStop(0, '#e6fdff');
  cg.addColorStop(0.4, '#3fd2ff');
  cg.addColorStop(1, '#0b3a66');
  g.fillStyle = cg;
  g.beginPath();
  g.ellipse(0, -6, 3.6, 7.5, 0, 0, TAU);
  g.fill();
  g.strokeStyle = '#18213d';
  g.lineWidth = 0.8;
  g.stroke();

  g.fillStyle = '#39445f';
  g.fillRect(-7.5, 16, 5, 7);
  g.fillRect(2.5, 16, 5, 7);
}

function drawInterceptor(g) {
  g.shadowColor = 'rgba(255,60,90,0.45)';
  g.shadowBlur = 6;
  g.fillStyle = '#353c4c';
  g.fillRect(-13, -1, 26, 5);
  g.shadowBlur = 0;

  const wing = linear(g, -22, 0, -6, 0, [[0, '#4a5266'], [0.6, '#a3adc2'], [1, '#69728a']]);
  mirrored(g, () => {
    g.fillStyle = wing;
    g.beginPath();
    g.moveTo(-8, -15);
    g.quadraticCurveTo(-23, -6, -19, 13);
    g.lineTo(-13, 15);
    g.quadraticCurveTo(-15, -2, -6, -8);
    g.closePath();
    g.fill();
    g.strokeStyle = '#151a26';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#ff3d55';
    circle(g, -18.2, 12, 1.6);
    g.fill();
  });

  const pod = g.createRadialGradient(-2, -2, 1, 0, 1, 9);
  pod.addColorStop(0, '#8a93a8');
  pod.addColorStop(1, '#262c3a');
  g.fillStyle = pod;
  circle(g, 0, 1, 8);
  g.fill();
  g.strokeStyle = '#121620';
  g.lineWidth = 1;
  g.stroke();

  g.shadowColor = '#ff2a44';
  g.shadowBlur = 8;
  g.fillStyle = '#ff3a50';
  circle(g, 0, -2.5, 3);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#ffd0d6';
  circle(g, -0.8, -3.3, 1);
  g.fill();
}

const HEAVY_HULL = [0, -19, 13, -11, 15, 9, 8, 18, -8, 18, -15, 9, -13, -11];

function drawHeavy(g, damaged) {
  g.shadowColor = 'rgba(255,150,50,0.45)';
  g.shadowBlur = 6;
  g.fillStyle = linear(g, 0, -19, 0, 18, [[0, '#9aa59a'], [0.55, '#5c665e'], [1, '#30372f']]);
  poly(g, HEAVY_HULL);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#141814';
  g.lineWidth = 1.2;
  g.stroke();

  mirrored(g, () => {
    g.fillStyle = '#3c443d';
    g.fillRect(14, -4, 6, 8);
    g.fillStyle = linear(g, 18, 0, 27, 0, [[0, '#7b857c'], [1, '#3a423b']]);
    rrect(g, 18, -13, 9, 26, 3);
    g.fill();
    g.strokeStyle = '#141814';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#20251f';
    g.fillRect(21, -22, 3, 10);
    g.fillStyle = '#ffae4a';
    g.fillRect(21, -23.5, 3, 2);
  });

  g.strokeStyle = 'rgba(20,24,20,0.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-13, -1); g.lineTo(13, -1);
  g.moveTo(-10, 9); g.lineTo(10, 9);
  g.moveTo(0, -1); g.lineTo(0, 9);
  g.stroke();

  g.shadowColor = '#ff9a2e';
  g.shadowBlur = 6;
  g.fillStyle = '#ffa53a';
  g.fillRect(-6, -10, 12, 3);
  g.shadowBlur = 0;

  if (damaged) scorch(g, HEAVY_HULL, [[-6, 4, 8], [7, -7, 6], [3, 13, 5]]);
}

const BOMBER_HULL = [0, -21, 7, -6, 21, 15, 9, 11, 0, 18, -9, 11, -21, 15, -7, -6];

function drawBomber(g) {
  g.shadowColor = 'rgba(180,110,255,0.6)';
  g.shadowBlur = 8;
  g.fillStyle = linear(g, 0, -21, 0, 18, [[0, '#8a84b8'], [0.5, '#4b4672'], [1, '#26223d']]);
  poly(g, BOMBER_HULL);
  g.fill();
  g.shadowBlur = 0;

  g.fillStyle = 'rgba(255,255,255,0.12)';
  poly(g, [0, -21, 3, -6, 0, 12, -3, -6]);
  g.fill();
  g.strokeStyle = '#b97dff';
  g.lineWidth = 1.3;
  poly(g, BOMBER_HULL);
  g.stroke();

  mirrored(g, () => {
    g.fillStyle = '#2d2846';
    poly(g, [15, 10, 22, 2, 21, 15]);
    g.fill();
    g.strokeStyle = '#b97dff';
    g.lineWidth = 0.8;
    g.stroke();
  });

  g.fillStyle = '#16131f';
  g.fillRect(-4, 5, 8, 6);
  g.fillStyle = '#ff5ad9';
  g.fillRect(-3, 9, 6, 1.5);

  g.shadowColor = '#d9a6ff';
  g.shadowBlur = 6;
  g.fillStyle = '#ecd0ff';
  poly(g, [0, -12, 3, -5, 0, 1, -3, -5]);
  g.fill();
  g.shadowBlur = 0;
}

const ACE_WING = [-4, -4, -21, -17, -17, 3, -22, 19, -6, 10];
const ACE_FUSELAGE = [0, -24, 4, -9, 4, 15, 0, 20, -4, 15, -4, -9];

function drawAce(g, damaged) {
  g.shadowColor = 'rgba(255,70,60,0.75)';
  g.shadowBlur = 10;
  g.fillStyle = linear(g, -22, 0, -4, 0, [[0, '#2a0810'], [1, '#a3192f']]);
  mirrored(g, () => {
    poly(g, ACE_WING);
    g.fill();
  });
  g.shadowBlur = 0;
  g.strokeStyle = '#ffcf5a';
  g.lineWidth = 1.1;
  mirrored(g, () => {
    poly(g, ACE_WING);
    g.stroke();
  });
  if (damaged) {
    mirrored(g, () => scorch(g, ACE_WING, [[-13, 2, 7]], '#ffcf5a'));
  }

  g.fillStyle = linear(g, -4, 0, 4, 0, [[0, '#14141c'], [0.5, '#3a3a4a'], [1, '#14141c']]);
  poly(g, ACE_FUSELAGE);
  g.fill();
  g.strokeStyle = '#ffcf5a';
  g.lineWidth = 0.9;
  g.stroke();

  g.strokeStyle = 'rgba(255,207,90,0.7)';
  g.lineWidth = 1;
  mirrored(g, () => {
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(-17, -10);
    g.stroke();
  });

  g.shadowColor = '#ff4040';
  g.shadowBlur = 6;
  g.fillStyle = '#ff6a5a';
  g.beginPath();
  g.ellipse(0, -8, 2, 5, 0, 0, TAU);
  g.fill();
  g.shadowBlur = 0;
}

/* ------------------------------------------------------------------- boss */

export const BOSS_HULL = [-165, -72, -126, -96, 126, -96, 165, -72, 152, -30, 86, 66, 60, 108, 44, 102, 36, 32, -36, 32, -44, 102, -60, 108, -86, 66, -152, -30];

/** Capital ship, authored facing DOWN (toward the player). */
function drawBoss(g, accent, dmg) {
  for (const ex of [-112, -56, 56, 112]) {
    g.fillStyle = '#1a1f2c';
    rrect(g, ex - 15, -106, 30, 14, 3);
    g.fill();
    g.strokeStyle = '#0b0f19';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#8fb4ff';
    g.fillRect(ex - 11, -106, 22, 3);
  }

  g.shadowColor = hexToRgba(accent, 0.35);
  g.shadowBlur = 18;
  g.fillStyle = linear(g, 0, -100, 0, 110, [[0, '#6f7a90'], [0.45, '#3d4558'], [1, '#20253a']]);
  poly(g, BOSS_HULL);
  g.fill();
  g.shadowBlur = 0;

  g.save();
  poly(g, BOSS_HULL);
  g.clip();
  g.fillStyle = linear(g, -165, 0, 165, 0, [[0, 'rgba(0,0,0,0.4)'], [0.32, 'rgba(0,0,0,0)'], [0.68, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.4)']]);
  g.fillRect(-170, -110, 340, 230);
  const rng = mulberry32(1337);
  for (let i = 0; i < 90; i++) {
    const x = (rng() * 2 - 1) * 150;
    const y = -92 + rng() * 190;
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.28)';
    g.fillRect(x, y, 3 + rng() * 12, 2 + rng() * 5);
  }
  g.strokeStyle = 'rgba(10,14,24,0.8)';
  g.lineWidth = 1.2;
  g.beginPath();
  for (const sx of [-1, 1]) {
    g.moveTo(sx * 150, -62); g.lineTo(sx * 66, -62);
    g.moveTo(sx * 140, -42); g.lineTo(sx * 74, 26);
    g.moveTo(sx * 72, 40); g.lineTo(sx * 54, 98);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.beginPath();
  for (const sx of [-1, 1]) {
    g.moveTo(sx * 150, -28); g.lineTo(sx * 86, 64);
  }
  g.stroke();
  g.restore();

  if (dmg >= 1) scorch(g, BOSS_HULL, [[-112, -50, 26], [84, -74, 18], [-58, 58, 16], [122, -34, 14]]);
  if (dmg >= 2) scorch(g, BOSS_HULL, [[30, -60, 22], [-132, -74, 16], [66, 50, 18], [-20, -40, 12], [104, 6, 12]], '#ff4a2a');

  g.lineWidth = 2;
  g.strokeStyle = '#0b0f19';
  poly(g, BOSS_HULL);
  g.stroke();

  g.fillStyle = linear(g, 0, -96, 0, -56, [[0, '#68728a'], [1, '#3a4255']]);
  rrect(g, -62, -96, 124, 40, 6);
  g.fill();
  g.strokeStyle = '#0b0f19';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#323a4c';
  rrect(g, -48, -88, 96, 24, 4);
  g.fill();

  g.fillStyle = linear(g, 0, -114, 0, -86, [[0, '#8a94aa'], [1, '#4a5367']]);
  rrect(g, -26, -114, 52, 26, 5);
  g.fill();
  g.stroke();
  g.fillStyle = '#9fe8ff';
  for (let x = -20; x <= 16; x += 6) g.fillRect(x, -104, 3.5, 2.2);

  g.fillStyle = '#080b12';
  rrect(g, -30, 14, 60, 13, 3);
  g.fill();
  g.strokeStyle = '#0b0f19';
  g.stroke();
  g.fillStyle = '#ff9a3c';
  for (let x = -26; x <= 22; x += 8) g.fillRect(x, 23, 4, 1.6);

  for (const sx of [-1, 1]) {
    const tx = sx * 100;
    const ty = -30;
    g.fillStyle = '#20263a';
    g.fillRect(tx - 5, ty, 3, 17);
    g.fillRect(tx + 2, ty, 3, 17);
    g.fillStyle = linear(g, tx - 10, ty, tx + 10, ty, [[0, '#3a4256'], [0.5, '#7d889e'], [1, '#3a4256']]);
    circle(g, tx, ty, 10);
    g.fill();
    g.strokeStyle = '#0b0f19';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = accent;
    circle(g, tx, ty, 3);
    g.fill();

    const px = sx * 54;
    const py = 90;
    g.fillStyle = '#20263a';
    g.fillRect(px - 1.5, py, 3, 13);
    g.fillStyle = '#4a5368';
    circle(g, px, py, 6);
    g.fill();
    g.stroke();
  }

  g.fillStyle = '#121724';
  circle(g, 0, -12, 29);
  g.fill();
  g.strokeStyle = '#7d889e';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = hexToRgba(accent, 0.6);
  g.lineWidth = 1.5;
  circle(g, 0, -12, 23);
  g.stroke();
  g.strokeStyle = 'rgba(125,136,158,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.moveTo(Math.cos(a) * 30, -12 + Math.sin(a) * 30);
    g.lineTo(Math.cos(a) * 36, -12 + Math.sin(a) * 36);
  }
  g.stroke();

  g.fillStyle = accent;
  g.shadowColor = accent;
  g.shadowBlur = 6;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      circle(g, lerp(150, 88, t) * sx, lerp(-28, 62, t), 1.8);
      g.fill();
    }
  }
  g.shadowBlur = 0;
}

/* ------------------------------------------------------------ effect bits */

function makeFlame(color) {
  const w = 16;
  const h = 40;
  const c = document.createElement('canvas');
  c.width = w * SS;
  c.height = h * SS;
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.fillStyle = linear(g, 0, 0, 0, h, [[0, 'rgba(255,255,255,0.95)'], [0.22, color], [1, hexToRgba(color, 0)]]);
  g.beginPath();
  g.moveTo(1, 0);
  g.lineTo(15, 0);
  g.quadraticCurveTo(12, h * 0.5, 8, h);
  g.quadraticCurveTo(4, h * 0.5, 1, 0);
  g.fill();
  return c;
}

const glowCache = new Map();

/** Soft radial glow in `color`, used for particles, cores and auras. */
export function getGlow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, hexToRgba(color, 0.9));
  gr.addColorStop(0.5, hexToRgba(color, 0.3));
  gr.addColorStop(1, hexToRgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

function makeSmoke() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(70,74,90,0.9)');
  gr.addColorStop(0.6, 'rgba(40,44,58,0.4)');
  gr.addColorStop(1, 'rgba(30,34,46,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Bullet sprite pointing up: head near the top, glowing trail below. (ax, ay) is the head center. */
function makeBullet(w, h, ax, ay, draw) {
  const c = document.createElement('canvas');
  c.width = w * SS;
  c.height = h * SS;
  const g = c.getContext('2d');
  g.scale(SS, SS);
  draw(g);
  return { canvas: c, w, h, ax, ay };
}

function trail(g, x, y0, y1, width, color, alpha) {
  g.fillStyle = linear(g, 0, y0, 0, y1, [[0, hexToRgba(color, alpha)], [1, hexToRgba(color, 0)]]);
  g.fillRect(x - width / 2, y0, width, y1 - y0);
}

function orb(g, x, y, r, color) {
  g.shadowColor = color;
  g.shadowBlur = r * 1.4;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, '#ffffff');
  gr.addColorStop(0.7, color);
  gr.addColorStop(1, color);
  g.fillStyle = gr;
  circle(g, x, y, r);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(10,0,10,0.75)';
  g.lineWidth = 1.3;
  circle(g, x, y, r + 0.6);
  g.stroke();
}

function diamond(g, x, y, rx, ry, color) {
  g.shadowColor = color;
  g.shadowBlur = 6;
  g.fillStyle = color;
  poly(g, [x, y - ry, x + rx, y, x, y + ry, x - rx, y]);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(20,0,0,0.8)';
  g.lineWidth = 1.2;
  g.stroke();
  g.fillStyle = '#ffffff';
  poly(g, [x, y - ry * 0.5, x + rx * 0.45, y, x, y + ry * 0.5, x - rx * 0.45, y]);
  g.fill();
}

function makeBullets() {
  return {
    player: makeBullet(14, 42, 7, 12, (g) => {
      trail(g, 7, 18, 42, 3, '#4fe3ff', 0.55);
      g.shadowColor = '#4fe3ff';
      g.shadowBlur = 7;
      g.fillStyle = '#4fe3ff';
      rrect(g, 4, 3, 6, 19, 3);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      rrect(g, 5.8, 5, 2.4, 15, 1.2);
      g.fill();
    }),
    basic: makeBullet(18, 34, 9, 9, (g) => {
      trail(g, 9, 13, 34, 4, '#ff5a36', 0.6);
      diamond(g, 9, 9, 4.5, 7, '#ff5a36');
    }),
    aimed: makeBullet(22, 36, 11, 11, (g) => {
      trail(g, 11, 13, 36, 5, '#ff3df0', 0.55);
      orb(g, 11, 11, 5, '#ff3df0');
    }),
    heavy: makeBullet(32, 52, 16, 16, (g) => {
      trail(g, 16, 18, 52, 10, '#ffa024', 0.5);
      orb(g, 16, 16, 8.5, '#ff8a1a');
    }),
    spread: makeBullet(16, 28, 8, 8, (g) => {
      trail(g, 8, 11, 28, 3.5, '#c77dff', 0.55);
      diamond(g, 8, 8, 4, 5.5, '#c77dff');
    }),
    boss: makeBullet(24, 40, 12, 12, (g) => {
      trail(g, 12, 15, 40, 6, '#ff2e63', 0.55);
      orb(g, 12, 12, 6.5, '#ff2e63');
    }),
  };
}

/* --------------------------------------------------------------- pickups */

export const POWERUP_COLORS = {
  rapid: '#ffd23f',
  spread: '#3dffa8',
  shield: '#4fc3ff',
  life: '#ff5c8a',
  score: '#ffb02e',
};

/** Icon centered on the origin; `s` is roughly the half-size. Shape alone identifies the type. */
export function drawPowerIcon(g, type, s, color) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, s * 0.26);
  switch (type) {
    case 'rapid':
      g.beginPath();
      for (const oy of [-0.35, 0.35]) {
        g.moveTo(-s * 0.7, oy * s + s * 0.3);
        g.lineTo(0, oy * s - s * 0.35);
        g.lineTo(s * 0.7, oy * s + s * 0.3);
      }
      g.stroke();
      break;
    case 'spread':
      g.beginPath();
      g.moveTo(0, s * 0.8); g.lineTo(-s * 0.75, -s * 0.6);
      g.moveTo(0, s * 0.8); g.lineTo(0, -s * 0.85);
      g.moveTo(0, s * 0.8); g.lineTo(s * 0.75, -s * 0.6);
      g.stroke();
      for (const [x, y] of [[-s * 0.75, -s * 0.6], [0, -s * 0.85], [s * 0.75, -s * 0.6]]) {
        circle(g, x, y, s * 0.2);
        g.fill();
      }
      break;
    case 'shield':
      g.beginPath();
      g.moveTo(0, -s * 0.9);
      g.lineTo(s * 0.8, -s * 0.55);
      g.lineTo(s * 0.68, s * 0.25);
      g.quadraticCurveTo(s * 0.45, s * 0.7, 0, s * 0.92);
      g.quadraticCurveTo(-s * 0.45, s * 0.7, -s * 0.68, s * 0.25);
      g.lineTo(-s * 0.8, -s * 0.55);
      g.closePath();
      g.globalAlpha = 0.3;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
      break;
    case 'life':
      poly(g, [0, -s * 0.95, s * 0.28, -s * 0.25, s * 0.95, s * 0.45, s * 0.3, s * 0.4, s * 0.2, s * 0.8, -s * 0.2, s * 0.8, -s * 0.3, s * 0.4, -s * 0.95, s * 0.45, -s * 0.28, -s * 0.25]);
      g.fill();
      break;
    case 'score': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.95 : s * 0.42;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
  }
  g.restore();
}

function makePowerup(type) {
  const color = POWERUP_COLORS[type];
  return makeSprite(46, 46, (g) => {
    const hex = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      hex.push(Math.cos(a) * 16, Math.sin(a) * 16);
    }
    g.shadowColor = color;
    g.shadowBlur = 10;
    g.fillStyle = 'rgba(8,12,30,0.88)';
    poly(g, hex);
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2.5;
    g.strokeStyle = color;
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    poly(g, hex.map((v) => v * 0.8));
    g.stroke();
    drawPowerIcon(g, type, 8.5, color);
  });
}

/* ----------------------------------------------------------------- caches */

let cache = null;

export function getSprites() {
  if (cache) return cache;
  cache = {
    player: makeSprite(62, 66, drawPlayer),
    interceptor: makeSprite(48, 42, drawInterceptor),
    heavy: makeSprite(62, 56, (g) => drawHeavy(g, false)),
    heavyDamaged: makeSprite(62, 56, (g) => drawHeavy(g, true)),
    bomber: makeSprite(54, 52, drawBomber),
    ace: makeSprite(58, 60, (g) => drawAce(g, false)),
    aceDamaged: makeSprite(58, 60, (g) => drawAce(g, true)),
    flames: {
      cyan: makeFlame('#38d6ff'),
      red: makeFlame('#ff4a3a'),
      orange: makeFlame('#ff9a2e'),
      violet: makeFlame('#b26bff'),
      gold: makeFlame('#ffcf5a'),
      blue: makeFlame('#6f9bff'),
    },
    smoke: makeSmoke(),
    bullets: makeBullets(),
    powerups: {
      rapid: makePowerup('rapid'),
      spread: makePowerup('spread'),
      shield: makePowerup('shield'),
      life: makePowerup('life'),
      score: makePowerup('score'),
    },
  };
  return cache;
}

const bossCache = new Map();

/** Three damage stages of the capital ship for a given accent color. */
export function getBossSprites(accent) {
  let s = bossCache.get(accent);
  if (!s) {
    s = [0, 1, 2].map((dmg) => makeSprite(350, 250, (g) => drawBoss(g, accent, dmg)));
    bossCache.set(accent, s);
  }
  return s;
}
