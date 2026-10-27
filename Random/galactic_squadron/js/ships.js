/**
 * Player ship roster for the hangar (CHOOSE YOUR SHIP). Ships are cosmetic:
 * they all share the stats in CONFIG.player. Each one is drawn with vector
 * paths like the rest of the art, authored nose-up in sprite pixels with the
 * origin at the sprite center.
 *
 *  engines — [x, y, width] of each exhaust, relative to the ship center
 *  flame   — key into getSprites().flames
 */
import { makeSprite, poly, circle, rrect, linear, mirrored, drawPlayer } from './sprites.js';

const OUTLINE = '#1c232e';

/* ---------------------------------------------------------------- helpers */

function ink(g, lw = 0.8) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.strokeStyle = OUTLINE;
}

function fillStroke(g, fill) {
  g.fillStyle = fill;
  g.fill();
  g.stroke();
}

/** Filled, outlined polygon with an optional soft glow behind it. */
function shape(g, pts, fill, glow) {
  poly(g, pts);
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 8;
  }
  g.fillStyle = fill;
  g.fill();
  g.shadowBlur = 0;
  g.stroke();
}

function box(g, x, y, w, h, r, fill) {
  rrect(g, x, y, w, h, r);
  fillStroke(g, fill);
}

function ring(g, x, y, r, fill) {
  circle(g, x, y, r);
  fillStroke(g, fill);
}

function oval(g, x, y, rx, ry, fill) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  fillStroke(g, fill);
}

/** Paints inside `pts` only (stripes, panels, weathering). */
function clipped(g, pts, paint) {
  g.save();
  poly(g, pts);
  g.clip();
  paint();
  g.restore();
}

function lines(g, segs, lw, color) {
  g.save();
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.beginPath();
  for (const [x0, y0, x1, y1] of segs) {
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
  }
  g.stroke();
  g.restore();
}

/** Thick bar with an outline: drawn as an outline stroke, then a fill stroke. */
function rod(g, x0, y0, x1, y1, w, color) {
  lines(g, [[x0, y0, x1, y1]], w + 1.4, OUTLINE);
  lines(g, [[x0, y0, x1, y1]], w, color);
}

const hGrad = (g, x0, x1, stops) => linear(g, x0, 0, x1, 0, stops.map((c, i) => [i / (stops.length - 1), c]));
const vGrad = (g, y0, y1, stops) => linear(g, 0, y0, 0, y1, stops.map((c, i) => [i / (stops.length - 1), c]));

/* ------------------------------------------------------------------ ships */

/* A-Ship: cream wedge with a rust-red spine, wingtip cannons and twin engines. */
const A_HULL = [-7, -33, 7, -33, 24, 6, 25, 14, -25, 14, -24, 6];
const A_CREAM = '#e6e0cc';
const A_RUST = '#9a3d30';

function drawAShip(g) {
  ink(g);
  mirrored(g, () => {
    box(g, -22, 10, 12, 20, 3, hGrad(g, -22, -10, ['#6a261e', '#a5483a', '#6a261e']));
    lines(g, [[-21.5, 15, -10.5, 15], [-21.5, 20, -10.5, 20], [-21.5, 25, -10.5, 25]], 0.6, OUTLINE);
    box(g, -23, 28, 14, 4, 2, '#c9c4b4');
    box(g, -28.5, -6, 3, 20, 1, '#2a2d33');
    box(g, -28.5, -11, 3, 6, 1.5, '#8a3a2c');
  });
  box(g, -6, 12, 12, 13, 3, '#b9b6aa');

  shape(g, A_HULL, A_CREAM, 'rgba(255,190,150,0.45)');
  clipped(g, A_HULL, () => {
    g.fillStyle = A_RUST;
    poly(g, [-8, -34, 8, -34, 10, 15, -10, 15]);
    g.fill();
    g.fillStyle = 'rgba(120,120,110,0.35)';
    poly(g, [-22, 4, -14, -14, -12, -12, -18, 6]);
    g.fill();
    poly(g, [22, 4, 14, -14, 12, -12, 18, 6]);
    g.fill();
    g.fillStyle = A_RUST;
    poly(g, [-14, -18, -11, -26, -9, -24, -12, -16]);
    g.fill();
  });
  poly(g, A_HULL);
  g.stroke();
  lines(g, [[0, -33, 0, -24], [-6, -26, -6, -18], [6, -26, 6, -18], [-16, 6, -8, 6], [8, 6, 16, 6]], 0.5, 'rgba(28,35,46,0.6)');

  // canopy
  g.beginPath();
  g.moveTo(0, -15);
  g.quadraticCurveTo(5, -13, 5, -3);
  g.lineTo(5, 6);
  g.lineTo(-5, 6);
  g.lineTo(-5, -3);
  g.quadraticCurveTo(-5, -13, 0, -15);
  g.closePath();
  fillStroke(g, vGrad(g, -15, 6, ['#3f4d5e', '#151b24']));
  lines(g, [[-5, -1, 5, -1]], 0.8, '#0c1016');
  g.fillStyle = 'rgba(200,225,255,0.35)';
  poly(g, [-3.5, -10, -1.5, -12, -2, -3, -3.5, -2]);
  g.fill();

  mirrored(g, () => box(g, -14.5, 12, 2.5, 22, 1, A_CREAM));
}

/* Boba-Ship: rounded green hull with a rust skirt and white wing pods on arms. */
function bobaBody(g) {
  g.beginPath();
  g.moveTo(-10, -16);
  g.lineTo(10, -16);
  g.quadraticCurveTo(23, -10, 23, 6);
  g.quadraticCurveTo(20, 24, 0, 26);
  g.quadraticCurveTo(-20, 24, -23, 6);
  g.quadraticCurveTo(-23, -10, -10, -16);
  g.closePath();
}

function drawBobaShip(g) {
  ink(g);
  mirrored(g, () => {
    rod(g, -12, 0, -26, 2, 2.6, '#b9bcb4');
    box(g, -36, -8, 12, 24, 2, hGrad(g, -36, -24, ['#c9c6bb', '#f1efe6']));
    lines(g, [[-35.5, -2, -24.5, -2], [-35.5, 6, -24.5, 6], [-30, 6, -30, 15.5]], 0.5, 'rgba(28,35,46,0.55)');
    box(g, -33, -12, 3, 5, 1, '#d9b77a');
    box(g, -29, -12, 3, 5, 1, '#d9b77a');
    box(g, -35, 15, 10, 4, 1, '#bdbab0');
  });

  bobaBody(g);
  g.shadowColor = 'rgba(160,220,140,0.4)';
  g.shadowBlur = 8;
  g.fillStyle = vGrad(g, -16, 26, ['#86a07a', '#4f6648']);
  g.fill();
  g.shadowBlur = 0;
  g.save();
  bobaBody(g);
  g.clip();
  g.fillStyle = '#8a4a3a';
  g.beginPath();
  g.moveTo(-24, 6);
  g.quadraticCurveTo(0, 11, 24, 6);
  g.lineTo(24, 30);
  g.lineTo(-24, 30);
  g.fill();
  g.fillStyle = '#5d7555';
  poly(g, [-5, 8, 5, 8, 7, 30, -7, 30]);
  g.fill();
  g.fillStyle = 'rgba(205,220,190,0.35)';
  for (const [x, y, r] of [[-14, 14, 3], [12, 17, 2.5], [17, -2, 2], [-17, -4, 2.2]]) {
    circle(g, x, y, r);
    g.fill();
  }
  g.restore();
  bobaBody(g);
  g.stroke();
  g.beginPath();
  g.moveTo(-23, 6);
  g.quadraticCurveTo(0, 11, 23, 6);
  g.stroke();

  // cockpit hood and canopy
  box(g, -9, -28, 18, 30, 7, vGrad(g, -28, 2, ['#8aa47e', '#5f7a56']));
  g.fillStyle = 'rgba(215,228,200,0.4)';
  poly(g, [-6, -6, 0, -8, 4, -3, -3, -1]);
  g.fill();
  g.beginPath();
  g.moveTo(-6, -12);
  g.lineTo(-6, -19);
  g.quadraticCurveTo(0, -27, 6, -19);
  g.lineTo(6, -12);
  g.closePath();
  fillStroke(g, '#1e2622');
  g.fillStyle = 'rgba(200,230,210,0.3)';
  poly(g, [-4, -14, -4, -18, -1, -22, -2, -15]);
  g.fill();
}

/* Gauntlet-Ship: grey fuselage flanked by two tall blade wings with dark panels. */
const GT_WING = [-21, -35, -15, -6, -14, 20, -15, 31, -33, 31, -34, 16, -26, -10];
const GT_PANEL = [-21, -28, -17, -6, -17, 10, -27, 6, -24, -10];
const GT_BODY = [-3, -35, 3, -35, 8, -20, 9, 8, 7, 28, -7, 28, -9, 8, -8, -20];

function drawGauntletShip(g) {
  ink(g);
  mirrored(g, () => {
    box(g, -16, 6, 8, 9, 1, '#6f7c8b');
    shape(g, GT_WING, hGrad(g, -34, -14, ['#6c7886', '#a3afbd']), 'rgba(120,170,255,0.4)');
    shape(g, GT_PANEL, '#1d2636');
    lines(g, [[-20, -24, -18, -8]], 0.6, '#3d4a60');
    ring(g, -24, 22, 5, '#7d8a98');
    ring(g, -24, 22, 2.4, '#3a4452');
    ring(g, -10, 16, 4, '#8794a2');
  });
  shape(g, GT_BODY, hGrad(g, -9, 9, ['#76828f', '#b0bac6', '#76828f']), 'rgba(120,170,255,0.4)');
  lines(g, [[0, -35, 0, -20], [-5, -18, -6, 2], [5, -18, 6, 2], [-8, 18, 8, 18]], 0.5, 'rgba(28,35,46,0.6)');

  // arched, gridded canopy
  g.beginPath();
  g.moveTo(-5, 12);
  g.lineTo(-5, 5);
  g.arc(0, 5, 5, Math.PI, 0);
  g.lineTo(5, 12);
  g.closePath();
  fillStroke(g, '#1a212c');
  lines(g, [[0, 0, 0, 12], [-2.5, 1, -2.5, 12], [2.5, 1, 2.5, 12], [-5, 7, 5, 7]], 0.5, '#5d6878');
  box(g, -5, 26, 10, 4, 1, '#5d6875');
}

/* G-Ship: pixel-art fighter, 15×16 cells. */
const G_ROWS = [
  '.......W.......',
  '.......W.......',
  '.......W.......',
  '......WWW......',
  '......WWW......',
  '...R..WWW..R...',
  '...R..WWW..R...',
  '...W.WWWWW.W...',
  'R..WBWWRWWBW..R',
  'R..BWWRRRWWB..R',
  'W..WWWRWRWWW..W',
  'W..WWWWWWWWW..W',
  'W.WWWRWWWRWWW.W',
  'WWWWRRWWWRRWWWW',
  'WWW.RR.W.RR.WWW',
  'WW.....W.....WW',
];
const G_COLORS = { W: '#f2f2f2', R: '#ff2a2a', B: '#2a6bff' };
const G_CELL = 4;

function drawGShip(g) {
  const x0 = (-G_ROWS[0].length * G_CELL) / 2;
  const y0 = (-G_ROWS.length * G_CELL) / 2;
  G_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = G_COLORS[row[c]];
      if (!color) continue;
      g.fillStyle = color;
      // slight overlap hides seams between cells
      g.fillRect(x0 + c * G_CELL, y0 + r * G_CELL, G_CELL + 0.05, G_CELL + 0.05);
    }
  });
}

/* J-Ship: grey arrowhead with yellow markings, astromech dome and rear canopy. */
const J_HULL = [0, -37, 24, 22, 15, 26, 9, 33, -9, 33, -15, 26, -24, 22];
const J_YELLOW = '#e8b42a';

function drawJShip(g) {
  ink(g);
  mirrored(g, () => box(g, -15, 20, 7, 9, 2, '#6d727a'));
  shape(g, J_HULL, hGrad(g, -24, 24, ['#6f757d', '#a3a9b1', '#6f757d']), 'rgba(255,210,90,0.4)');
  clipped(g, J_HULL, () => {
    g.fillStyle = J_YELLOW;
    poly(g, [0, -37, 4, -18, 6, 12, -6, 12, -4, -18]);
    g.fill();
    mirrored(g, () => {
      poly(g, [-6, -4, -17, 14, -13, 18, -5, 6]);
      g.fill();
      poly(g, [-9, -16, -12, -8, -10, -6, -8, -12]);
      g.fill();
    });
    g.fillStyle = 'rgba(70,60,40,0.25)';
    for (const [x, y, r] of [[-3, -22, 2], [10, 6, 2.5], [-12, 12, 2]]) {
      circle(g, x, y, r);
      g.fill();
    }
  });
  poly(g, J_HULL);
  g.stroke();
  lines(g, [[0, -34, -4, 12], [0, -34, 4, 12], [-14, 18, -6, 18], [6, 18, 14, 18]], 0.5, 'rgba(28,35,46,0.6)');

  ring(g, 13, 8, 2.6, '#f4f4f4');
  lines(g, [[11.5, 8, 14.5, 8], [13, 6.5, 13, 9.5]], 0.5, OUTLINE);
  ring(g, 0, 10, 3.6, '#e6e9ee');
  g.fillStyle = '#3a5fb0';
  circle(g, 0, 10, 2);
  g.fill();

  oval(g, 0, 22, 6.5, 10.5, vGrad(g, 12, 33, ['#7a3a30', '#3a1a16']));
  g.fillStyle = 'rgba(255,200,180,0.3)';
  poly(g, [-4, 16, -2, 13, -2, 22, -4, 24]);
  g.fill();
  ring(g, 0, 33, 2.4, J_YELLOW);
}

/* Land-Ship: open-cockpit orange speeder with three engines (one silver). */
const LS_ORANGE = '#f0913a';
const LS_RED = '#c2352a';
const LS_CAP = '#6e2a22';
const LS_WING = [-26, 6, 26, 6, 23, 20, 6, 22, -6, 22, -23, 20];

function lsBody(g) {
  g.beginPath();
  g.moveTo(-15, 14);
  g.lineTo(-15, -20);
  g.arc(0, -20, 15, Math.PI, 0);
  g.lineTo(15, 14);
  g.closePath();
}

function lsEngine(g, x, y, h, silver) {
  rrect(g, x - 4.5, y, 9, h, 3.5);
  g.fillStyle = silver
    ? hGrad(g, x - 4.5, x + 4.5, ['#8f949c', '#eceef2', '#8f949c'])
    : hGrad(g, x - 4.5, x + 4.5, ['#d9762a', '#f8b063', '#d9762a']);
  g.fill();
  g.save();
  g.clip();
  if (silver) {
    lines(g, [[x - 3, y + 4, x + 3, y + 8], [x + 3, y + 5, x - 3, y + 11], [x - 3, y + 12, x + 3, y + 15]], 0.5, '#5a5f66');
  } else {
    g.fillStyle = LS_RED;
    poly(g, [x - 5, y + h * 0.4, x + 5, y + h * 0.25, x + 5, y + h * 0.42, x - 5, y + h * 0.57]);
    g.fill();
  }
  g.restore();
  rrect(g, x - 4.5, y, 9, h, 3.5);
  g.stroke();
  box(g, x - 4, y - 1.5, 8, 3, 1.5, LS_CAP);
  box(g, x - 3.5, y + h - 1.5, 7, 3, 1.5, LS_CAP);
}

function drawLandShip(g) {
  ink(g);
  box(g, -24, 3, 10, 6, 1, LS_RED);
  box(g, 14, 3, 10, 6, 1, LS_RED);
  lsEngine(g, -27, -2, 20, true);
  lsEngine(g, 27, -2, 20, false);
  lsEngine(g, 0, 18, 15, false);

  shape(g, LS_WING, LS_RED);
  clipped(g, LS_WING, () => {
    g.fillStyle = LS_ORANGE;
    poly(g, [-14, 6, 14, 6, 10, 22, -10, 22]);
    g.fill();
  });
  poly(g, LS_WING);
  g.stroke();

  lsBody(g);
  g.shadowColor = 'rgba(255,170,90,0.4)';
  g.shadowBlur = 8;
  g.fillStyle = hGrad(g, -15, 15, ['#d9762a', '#f8a85a', '#d9762a']);
  g.fill();
  g.shadowBlur = 0;
  g.save();
  lsBody(g);
  g.clip();
  g.strokeStyle = LS_RED;
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(0, -35);
  g.lineTo(0, -23);
  g.moveTo(-15, -22);
  g.quadraticCurveTo(0, -28, 15, -22);
  g.moveTo(-12, -16);
  g.lineTo(-12, 14);
  g.moveTo(12, -16);
  g.lineTo(12, 14);
  g.stroke();
  g.lineWidth = 0.6;
  g.strokeStyle = 'rgba(110,60,30,0.5)';
  g.beginPath();
  for (const x of [-9, -5, 4, 8, 11]) {
    g.moveTo(x, -33 + Math.abs(x) * 0.25);
    g.lineTo(x + 1, -28 + Math.abs(x) * 0.25);
  }
  g.stroke();
  g.restore();
  ink(g);
  lsBody(g);
  g.stroke();

  box(g, 5, -27, 4, 2.5, 1, LS_RED);
  ring(g, -6, -15, 1.6, '#e0823a');

  // open cockpit: seats, bench and windshield
  ring(g, 0, 2, 11, '#3a2420');
  box(g, -8, 2, 6, 5, 1, '#1d1617');
  box(g, 2, 2, 6, 5, 1, '#1d1617');
  box(g, -8, 8, 16, 2, 1, '#1d1617');
  box(g, -2, -6, 4, 3, 1, '#d98c7a');
  g.beginPath();
  g.arc(0, 2, 11, Math.PI * 1.05, Math.PI * 1.95);
  g.arc(0, 2, 7, Math.PI * 1.95, Math.PI * 1.05, true);
  g.closePath();
  fillStroke(g, 'rgba(255,170,150,0.55)');
  lines(g, [[11, -12, 11, 6]], 0.7, OUTLINE);
}

/* N1-Ship / N1-Ship-Modified: needle-tailed fighter with wingtip engines. */
const N1_FRONT = [0, -35, 6, -30, 16, -24, 16, -20, 6, -16, -6, -16, -16, -20, -16, -24, -6, -30];
const N1_BODY = [-7, -17, 7, -17, 6, 4, 2.5, 18, 0, 32, -2.5, 18, -6, 4];

function drawN1(g, modified) {
  ink(g);
  const chrome = (x0, x1) => hGrad(g, x0, x1, ['#7f868f', '#eef1f5', '#9aa1aa']);
  const gold = (x0, x1) => hGrad(g, x0, x1, ['#b8860b', '#f6d04d', '#c99512']);
  const body = modified ? chrome : gold;

  mirrored(g, () => {
    box(g, -24, -24, 10, 5, 1.5, body(-24, -14));
    lines(g, [[-24, 14, -24, modified ? 32 : 27]], 1.2, modified ? '#15171a' : '#f4d26a');
    poly(g, [-28, -2, -20, -2, -24, 16]);
    fillStroke(g, body(-28, -20));
    box(g, -28, -24, 8, 24, 3, body(-28, -20));
    if (modified) {
      // exposed engine workings
      g.fillStyle = '#32373e';
      g.fillRect(-27, -15, 6, 7);
      g.fillStyle = '#c0392b';
      g.fillRect(-26, -14, 2, 2);
      g.fillRect(-23.5, -11, 1.5, 2);
      lines(g, [[-27, -5, -21, -5], [-27, -3, -21, -3]], 0.5, '#4a5058');
    } else {
      g.fillStyle = '#d4d9e0';
      g.fillRect(-27.5, -7, 7, 3);
    }
    poly(g, [-28, -24, -24, -35, -20, -24]);
    fillStroke(g, chrome(-28, -20));
  });

  shape(g, N1_FRONT, chrome(-16, 16), 'rgba(255,230,140,0.4)');
  if (modified) {
    lines(g, [[-14, -22, -8, -22], [8, -22, 14, -22]], 1, '#d9a520');
    lines(g, [[-3, -33, -3, -26], [3, -33, 3, -26]], 0.8, '#5a6068');
  }
  shape(g, N1_BODY, body(-7, 7), modified ? 'rgba(220,230,255,0.4)' : 'rgba(255,210,90,0.45)');
  if (modified) {
    lines(g, [[0, 30, 0, 37]], 1.2, '#9aa1aa');
    lines(g, [[-4, 6, -2, 18], [4, 6, 2, 18]], 0.6, '#d9a520');
    g.fillStyle = '#3a3f47';
    g.fillRect(-5.5, -14, 2.5, 6);
    g.fillRect(3, -14, 2.5, 6);
  } else {
    lines(g, [[0, -14, 0, 28]], 0.5, 'rgba(120,80,10,0.6)');
  }
  oval(g, 0, -6, 2.6, 5.5, vGrad(g, -11, -1, ['#4a5664', '#11161d']));
  ring(g, 0, 6, 2.6, chrome(-2.6, 2.6));
  g.fillStyle = modified ? '#c0392b' : '#3a5fb0';
  circle(g, 0, 6, 1.2);
  g.fill();
}

/* Pod-Ship: two long engines tethered to a small cockpit pod, energy arc between. */
const POD = [-12, 18, 12, 18, 10, 25, 5, 37, -5, 37, -10, 25];

function drawPodShip(g) {
  ink(g);
  mirrored(g, () => {
    rod(g, -15, 4, -7, 21, 2, '#8a6a4a');
    lines(g, [[-12, 2, -4, 21]], 0.7, '#111');
    poly(g, [-25, 4, -13, 4, -19, 16]);
    fillStroke(g, '#c9a77c');
    poly(g, [-27, -26, -25, -24, -25, -8, -28, -10]);
    fillStroke(g, '#a9845c');
    box(g, -25, -30, 12, 36, 2, hGrad(g, -25, -13, ['#c8b494', '#f2e8d4', '#c8b494']));
    g.fillStyle = '#7a5536';
    g.fillRect(-24.6, -19, 11.2, 2);
    g.fillRect(-24.6, -2, 11.2, 2);
    g.fillStyle = '#3a6fd0';
    g.fillRect(-22, -14, 6, 2);
    g.fillRect(-22, -9, 6, 2);
    box(g, -24, -38, 10, 9, 2, '#f2b548');
    lines(g, [[-21, -35, -17, -32], [-17, -35, -21, -32]], 0.6, '#3a6fd0');
  });

  // energy binder
  const zig = [-13, -14, -8, -17, -4, -12, 0, -16, 4, -11, 8, -15, 13, -14];
  g.save();
  g.beginPath();
  g.moveTo(zig[0], zig[1]);
  for (let i = 2; i < zig.length; i += 2) g.lineTo(zig[i], zig[i + 1]);
  g.shadowColor = '#7fdcff';
  g.shadowBlur = 8;
  g.strokeStyle = '#7fdcff';
  g.lineWidth = 1.6;
  g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 0.6;
  g.stroke();
  g.restore();

  shape(g, POD, '#e9dcc4', 'rgba(140,200,255,0.4)');
  clipped(g, POD, () => {
    g.fillStyle = '#3a6fd0';
    for (const y of [26, 30, 34]) g.fillRect(-12, y, 24, 2);
    g.fillStyle = '#d8c4a0';
    poly(g, [-12, 18, 12, 18, 10, 24, -10, 24]);
    g.fill();
  });
  poly(g, POD);
  g.stroke();
  box(g, -3, 19.5, 6, 4, 1, '#2a2a30');
}

/* Razor-Ship: weathered silver gunship with two big side engines. */
const RC_BODY = [-3.5, -35, 3.5, -35, 8, -22, 11, -8, 12, 12, 9, 26, 7, 37, -7, 37, -9, 26, -12, 12, -11, -8, -8, -22];

function drawRazorShip(g) {
  ink(g);
  mirrored(g, () => {
    lines(g, [[-3, -35, -3, -39]], 1.4, '#3a3e44');
    shape(g, [-10, 14, -18, 26, -16, 30, -9, 28], '#8d9299');
    shape(g, [-8, -12, -20, -8, -20, 10, -10, 12], hGrad(g, -20, -8, ['#7f848b', '#a7abb1']));
    poly(g, [-31, 14, -19, 14, -21, 22, -29, 22]);
    fillStroke(g, '#55595f');
    box(g, -33, -16, 16, 31, 5, hGrad(g, -33, -17, ['#70747b', '#c8ccd1', '#7c8087']));
    lines(g, [[-32.5, -10, -17.5, -10], [-32.5, 5, -17.5, 5]], 0.6, 'rgba(28,35,46,0.7)');
    box(g, -30, -3, 10, 5, 1, '#5d6168');
  });
  shape(g, RC_BODY, hGrad(g, -12, 12, ['#868a90', '#c4c8cd', '#868a90']), 'rgba(200,220,255,0.35)');
  clipped(g, RC_BODY, () => {
    g.fillStyle = 'rgba(40,40,40,0.18)';
    for (const [x, y, r] of [[-6, 16, 3], [5, -12, 2.5], [2, 28, 2.5]]) {
      circle(g, x, y, r);
      g.fill();
    }
  });
  lines(g, [[-11, 16, 11, 16], [-8, 27, 8, 27], [0, 8, 0, 37]], 0.5, 'rgba(28,35,46,0.6)');
  box(g, -3.5, -31, 7, 4, 1.5, '#2a3038');
  mirrored(g, () => {
    g.fillStyle = '#e3b62b';
    poly(g, [-8.5, -22, -5, -19, -8.5, -16, -9.5, -17, -7, -19, -9.5, -21]);
    g.fill();
  });
  box(g, -3.5, -6, 7, 13, 3, '#7a7e85');
  oval(g, 0, 0.5, 2, 4.5, '#3a3e45');
}

/* Snow-Ship: white wedge with orange stripes, twin cannons over the engines. */
const SS_HULL = [-10, -28, 0, -22, 10, -28, 33, 18, 29, 27, -29, 27, -33, 18];
const SS_ORANGE = '#e8622c';

function drawSnowShip(g) {
  ink(g);
  shape(g, SS_HULL, vGrad(g, -28, 27, ['#eef0f2', '#b9bfc6']), 'rgba(255,170,120,0.35)');
  clipped(g, SS_HULL, () => {
    g.fillStyle = SS_ORANGE;
    for (const [x0, x1] of [[-30, -22], [-19, -10], [10, 19], [22, 30]]) g.fillRect(x0, 15, x1 - x0, 5);
    g.fillRect(-2.5, -22, 5, 8);
    lines(g, [[-20, -6, -26, 14], [20, -6, 26, 14], [-8, 22, 8, 22]], 0.5, 'rgba(28,35,46,0.45)');
    g.fillStyle = 'rgba(40,40,40,0.25)';
    for (const [x, y, r] of [[-24, 8, 2], [25, 2, 1.8], [18, 22, 2]]) {
      circle(g, x, y, r);
      g.fill();
    }
  });
  poly(g, SS_HULL);
  g.stroke();

  shape(g, [-6, -16, 6, -16, 7, 8, -7, 8], '#9aa1a9');
  shape(g, [-4, -13, 4, -13, 4.5, -2, -4.5, -2], '#2a2a2e');
  ring(g, 0, -6, 1.6, SS_ORANGE);
  box(g, -4, 1, 8, 5, 1, '#d6dadf');

  mirrored(g, () => {
    box(g, -17, -4, 7, 14, 2, '#a8aeb5');
    lines(g, [[-16.5, 0, -10.5, 0], [-16.5, 3, -10.5, 3], [-16.5, 6, -10.5, 6]], 0.5, OUTLINE);
    box(g, -15, -33, 3, 30, 1.5, '#c9ced4');
    box(g, -16, -34, 5, 4, 1.5, '#9aa0a6');
    box(g, -14, 9, 8, 6, 1, '#cfd3d8');
  });
  const comb = [];
  for (let x = -10; x <= 10; x += 2.5) comb.push([x, 27, x, 31]);
  lines(g, comb, 0.8, '#2a2e34');
  lines(g, [[0, 27, 0, 33]], 1.5, '#1a1d22');
}

/* Yo-Ship: split-prong interceptor with hexagonal wings and a central pod. */
const YO_WING = [-2, -33, -9, -33, -12, -22, -12, -10, -29, -4, -29, 14, -19, 26, -6, 26, -2, -8];
const YO_RED = '#9c2f28';

function drawYoShip(g) {
  ink(g);
  mirrored(g, () => {
    shape(g, YO_WING, hGrad(g, -29, -2, ['#a8977a', '#d6c6a6']), 'rgba(255,120,90,0.4)');
    clipped(g, YO_WING, () => {
      g.fillStyle = YO_RED;
      poly(g, [-5, -33, -8, -33, -10, -10, -6, -10]);
      g.fill();
      poly(g, [-27, 0, -24, -1, -24, 13, -27, 13]);
      g.fill();
    });
    poly(g, YO_WING);
    g.stroke();
    shape(g, [-13, -5, -22, -1, -22, 11, -16, 19, -10, 18], '#b08a6a');
    lines(g, [[-21, 2, -11, -2], [-21, 8, -11, 6]], 0.5, 'rgba(28,35,46,0.5)');
    box(g, -11, -26, 2, 12, 1, '#6a6f76');
  });
  ring(g, -16, -8, 3, '#e8e8e8');
  g.fillStyle = YO_RED;
  circle(g, -16, -8, 1.7);
  g.fill();

  box(g, -7, -12, 14, 37, 7, hGrad(g, -7, 7, ['#8e949c', '#dde1e6', '#8e949c']));
  oval(g, 0, -1, 4.5, 8, vGrad(g, -9, 7, ['#4b5a6b', '#151b23']));
  g.fillStyle = 'rgba(200,225,255,0.35)';
  poly(g, [-3, -5, -1.5, -7, -1.5, 0, -3, 1]);
  g.fill();
  lines(g, [[-5, 14, 5, 14], [-5, 18, 5, 18]], 0.5, 'rgba(28,35,46,0.6)');
}

/* Y-Ship: striped cockpit, long neck, crossbar and two nacelles with rods. */
const Y_COCKPIT = [-6, -37, 6, -37, 10, -26, 10, -17, -10, -17, -10, -26];
const Y_CREAM = '#ece6d6';
const Y_YELLOW = '#e0a526';

function drawYShip(g) {
  ink(g);
  mirrored(g, () => {
    rod(g, -27, 16, -27, 34, 1, '#9aa0a6');
    rod(g, -19, 16, -19, 34, 1, '#9aa0a6');
    box(g, -29, 33, 12, 3, 1, '#b5bac0');
    box(g, -28, -8, 10, 26, 2, hGrad(g, -28, -18, ['#878d94', '#c7ccd1', '#878d94']));
    lines(g, [[-27.5, 0, -18.5, 0], [-27.5, 10, -18.5, 10], [-23, 0, -23, 10]], 0.5, 'rgba(28,35,46,0.6)');
    g.beginPath();
    g.moveTo(-28, -6);
    g.lineTo(-28, -10);
    g.quadraticCurveTo(-23, -17, -18, -10);
    g.lineTo(-18, -6);
    g.closePath();
    fillStroke(g, Y_CREAM);
    g.fillStyle = Y_YELLOW;
    g.fillRect(-27.6, -8.5, 9.2, 1.6);
    box(g, -20, -2, 14, 6, 1, '#9ea4ab');
  });
  box(g, -5, -18, 10, 32, 1.5, hGrad(g, -5, 5, ['#7d838a', '#b2b7bd', '#7d838a']));
  g.fillStyle = '#4a4f56';
  for (const [x, y, w, h] of [[-3.5, -12, 3, 4], [1, -8, 3, 5], [-3, 0, 6, 2], [-2, 6, 4, 4]]) g.fillRect(x, y, w, h);

  shape(g, Y_COCKPIT, Y_CREAM, 'rgba(255,220,140,0.4)');
  clipped(g, Y_COCKPIT, () => {
    g.fillStyle = Y_YELLOW;
    g.fillRect(-6, -37, 12, 2.5);
    mirrored(g, () => {
      poly(g, [-10, -27, -7, -27, -5, -17, -10, -17]);
      g.fill();
    });
  });
  poly(g, Y_COCKPIT);
  g.stroke();
  shape(g, [-3, -33, 3, -33, 4.5, -22, -4.5, -22], '#7d8a99');
  lines(g, [[0, -32, 0, -23], [-3.5, -27, 3.5, -27]], 0.5, '#2a323c');
  lines(g, [[-2, -37, -2, -39], [2, -37, 2, -39]], 1, '#5a6068');
}

/* ----------------------------------------------------------------- roster */

export const SHIPS = [
  { id: 'x-ship', name: 'X-Ship', w: 62, h: 66, flame: 'cyan', engines: [[-10, 26, 8], [10, 26, 8]], draw: drawPlayer },
  { id: 'a-ship', name: 'A-Ship', w: 60, h: 70, flame: 'orange', engines: [[-16, 32, 9], [16, 32, 9]], draw: drawAShip },
  { id: 'boba-ship', name: 'Boba-Ship', w: 74, h: 58, flame: 'blue', engines: [[-8, 24, 6], [8, 24, 6]], draw: drawBobaShip },
  { id: 'gauntlet-ship', name: 'Gauntlet-Ship', w: 70, h: 72, flame: 'blue', engines: [[-24, 28, 7], [24, 28, 7], [0, 29, 6]], draw: drawGauntletShip },
  { id: 'g-ship', name: 'G-Ship', w: 62, h: 66, flame: 'red', engines: [[-26, 31, 6], [26, 31, 6]], draw: drawGShip },
  { id: 'j-ship', name: 'J-Ship', w: 50, h: 76, flame: 'blue', engines: [[-11.5, 28, 6], [11.5, 28, 6]], draw: drawJShip },
  { id: 'land-ship', name: 'Land-Ship', w: 66, h: 72, flame: 'orange', engines: [[-27, 18, 7], [27, 18, 7], [0, 33, 7]], draw: drawLandShip },
  { id: 'n1-ship', name: 'N1-Ship', w: 64, h: 76, flame: 'cyan', engines: [[-24, 12, 6], [24, 12, 6]], draw: (g) => drawN1(g, false) },
  { id: 'n1-ship-modified', name: 'N1-Ship-Modified', w: 64, h: 76, flame: 'blue', engines: [[-24, 12, 6], [24, 12, 6]], draw: (g) => drawN1(g, true) },
  { id: 'pod-ship', name: 'Pod-Ship', w: 62, h: 78, flame: 'orange', engines: [[-19, 14, 8], [19, 14, 8]], draw: drawPodShip },
  { id: 'razor-ship', name: 'Razor-Ship', w: 68, h: 78, flame: 'blue', engines: [[-25, 21, 9], [25, 21, 9]], draw: drawRazorShip },
  { id: 'snow-ship', name: 'Snow-Ship', w: 70, h: 68, flame: 'cyan', engines: [[-13, 26, 7], [13, 26, 7]], draw: drawSnowShip },
  { id: 'yo-ship', name: 'Yo-Ship', w: 62, h: 68, flame: 'blue', engines: [[-9, 25, 6], [9, 25, 6]], draw: drawYoShip },
  { id: 'y-ship', name: 'Y-Ship', w: 62, h: 78, flame: 'red', engines: [[-23, 17, 7], [23, 17, 7]], draw: drawYShip },
];

/** Looks up a ship by id, falling back to the default X-Ship. */
export function getShip(id) {
  return SHIPS.find((s) => s.id === id) || SHIPS[0];
}

const spriteCache = new Map();

export function getShipSprite(id) {
  const ship = getShip(id);
  let s = spriteCache.get(ship.id);
  if (!s) {
    s = makeSprite(ship.w, ship.h, ship.draw);
    spriteCache.set(ship.id, s);
  }
  return s;
}
