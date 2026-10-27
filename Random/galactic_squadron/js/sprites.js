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
export function makeSprite(w, h, draw) {
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

export function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

export function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
}

export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function linear(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** Runs `fn` twice: once as authored, once mirrored across the y axis. */
export function mirrored(g, fn) {
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

/*
 * Player fighter: flat-style starfighter with wingtip cannons, twin engines and
 * a long nose. Authored in a 1200×1200 reference space (ship centered at 600,600)
 * and scaled down; the left half is drawn and mirrored.
 */
const PLAYER_SCALE = 0.055;
const P_OUTLINE = '#2c3e50';
const P_WHITE = '#ecf0f1';
const P_GREY = '#95a5a6';
const P_RED = '#e74c3c';
const P_YELLOW = '#f1c40f';
const P_WING = [205, 800, 500, 800, 500, 995, 390, 1000, 205, 925];
const P_BODY = [580, 102, 620, 102, 636, 128, 697, 715, 697, 995, 652, 1045, 548, 1045, 503, 995, 503, 715, 564, 128];
const P_GLOW = 'rgba(90,200,255,0.55)';

export function drawPlayer(g) {
  const o = (v) => v - 600;
  const path = (pts) => poly(g, pts.map(o));
  const box = (x0, y0, x1, y1, r) => rrect(g, o(x0), o(y0), x1 - x0, y1 - y0, r);
  const fillStroke = (fill) => {
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  };
  const dot = (x, y, r, fill) => {
    circle(g, o(x), o(y), r);
    fillStroke(fill);
  };

  g.save();
  g.scale(PLAYER_SCALE, PLAYER_SCALE);
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = P_OUTLINE;

  mirrored(g, () => {
    // wingtip cannon barrel with yellow band and collar
    // (drawn wider than the reference so the barrel still reads at sprite size)
    box(168, 395, 196, 760, 6);
    g.fillStyle = P_WHITE;
    g.fill();
    g.fillStyle = P_YELLOW;
    g.fillRect(o(168), o(570), 28, 65);
    g.lineWidth = 8;
    box(168, 395, 196, 760, 6);
    g.stroke();
    box(160, 472, 204, 492, 8);
    fillStroke(P_GREY);
    g.lineWidth = 12;

    // wing with red tip and yellow stripe
    g.shadowColor = P_GLOW;
    g.shadowBlur = 8;
    path(P_WING);
    fillStroke(P_WHITE);
    g.shadowBlur = 0;
    g.save();
    path(P_WING);
    g.clip();
    g.fillStyle = P_RED;
    path([205, 790, 258, 790, 258, 915, 292, 965, 205, 965]);
    g.fill();
    g.fillStyle = P_YELLOW;
    g.fillRect(o(258), o(800), 15, 115);
    g.restore();
    path(P_WING);
    g.stroke();

    // cannon mount
    box(158, 755, 205, 945, 4);
    fillStroke(P_WHITE);
    g.beginPath();
    g.moveTo(o(158), o(783));
    g.lineTo(o(205), o(783));
    g.stroke();
    box(152, 942, 211, 968, 10);
    fillStroke(P_GREY);

    // engine: exhaust pipe, nozzle, then the housing with its grey/red band
    box(392, 900, 448, 1062, 4);
    fillStroke(P_WHITE);
    box(384, 1057, 457, 1097, 12);
    fillStroke(P_GREY);
    box(372, 735, 469, 910, 16);
    g.fillStyle = P_WHITE;
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = P_GREY;
    g.fillRect(o(372), o(735), 97, 65);
    g.fillStyle = P_RED;
    g.fillRect(o(372), o(748), 97, 17);
    g.restore();
    box(372, 735, 469, 910, 16);
    g.stroke();
  });

  // fuselage: grey nose cone, red side stripes
  g.shadowColor = P_GLOW;
  g.shadowBlur = 8;
  path(P_BODY);
  fillStroke(P_WHITE);
  g.shadowBlur = 0;
  g.save();
  path(P_BODY);
  g.clip();
  g.fillStyle = P_GREY;
  g.beginPath();
  g.moveTo(o(540), o(80));
  g.lineTo(o(660), o(80));
  g.lineTo(o(660), o(245));
  g.quadraticCurveTo(o(600), o(232), o(540), o(245));
  g.closePath();
  g.fill();
  g.fillStyle = P_RED;
  path([553, 245, 570, 245, 534, 620, 512, 632]);
  g.fill();
  path([647, 245, 630, 245, 666, 620, 688, 632]);
  g.fill();
  g.restore();
  path(P_BODY);
  g.stroke();
  g.beginPath();
  g.moveTo(o(553), o(245));
  g.quadraticCurveTo(o(600), o(232), o(647), o(245));
  g.stroke();

  g.fillStyle = P_YELLOW;
  box(572, 420, 628, 442, 11);
  g.fill();

  path([575, 457, 625, 457, 636, 470, 651, 655, 635, 686, 565, 686, 549, 655, 564, 470]);
  fillStroke('#34495e');
  g.fillStyle = 'rgba(160,220,255,0.3)';
  path([572, 485, 588, 472, 574, 610, 561, 645]);
  g.fill();

  // astromech strip
  g.fillStyle = P_GREY;
  box(558, 760, 642, 1005, 40);
  g.fill();
  g.lineWidth = 10;
  dot(600, 770, 40, '#bdc3c7');
  dot(600, 770, 16, P_RED);
  dot(600, 850, 20, P_WHITE);
  dot(600, 905, 20, P_WHITE);
  box(580, 940, 620, 980, 2);
  fillStroke(P_WHITE);

  g.restore();
}

/*
 * Interceptor: ball cockpit with a hexagonal viewport, two struts and tall
 * wing panels. Authored in reference-image space (cockpit at 333,307), with
 * the twin guns at the image bottom; the y flip puts them at the nose (-y).
 */
const INT_SCALE = 0.085;
const INT_OUTLINE = '#14171c';
// (panels are wider than the reference so they stay visible at sprite size)
const INT_WING = [133, 50, 144, 55, 153, 300, 144, 558, 133, 564, 122, 558, 113, 300, 122, 55];
const INT_STRUT = [150, 288, 198, 276, 214, 262, 268, 262, 268, 352, 218, 352, 198, 332, 150, 322];

function drawInterceptor(g) {
  const ox = (x) => x - 333;
  const oy = (y) => y - 307;
  const path = (pts) => poly(g, pts.map((v, i) => (i % 2 ? oy(v) : ox(v))));

  g.save();
  g.scale(INT_SCALE, -INT_SCALE);
  g.lineJoin = 'round';
  g.strokeStyle = INT_OUTLINE;
  g.lineWidth = 6;

  mirrored(g, () => {
    // strut and wing-mount cylinder
    path(INT_STRUT);
    g.fillStyle = linear(g, 0, oy(262), 0, oy(352), [[0, '#a7acb4'], [0.5, '#7b8089'], [1, '#4f545c']]);
    g.fill();
    g.stroke();
    g.fillStyle = '#585d66';
    g.fillRect(ox(150), oy(283), 44, 40);
    g.strokeRect(ox(150), oy(283), 44, 40);
    g.beginPath();
    for (const x of [163, 176, 189]) {
      g.moveTo(ox(x), oy(285));
      g.lineTo(ox(x), oy(321));
    }
    g.moveTo(ox(222), oy(275));
    g.lineTo(ox(262), oy(275));
    g.moveTo(ox(222), oy(340));
    g.lineTo(ox(262), oy(340));
    g.lineWidth = 3;
    g.stroke();
    g.lineWidth = 6;

    // wing panel: dark solar panel with a light rim so it reads against space
    g.shadowColor = 'rgba(255,60,90,0.4)';
    g.shadowBlur = 5;
    path(INT_WING);
    g.fillStyle = linear(g, ox(113), 0, ox(153), 0, [[0, '#3a3f47'], [0.5, '#6b717b'], [1, '#3a3f47']]);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#8d939c';
    g.stroke();
    g.lineWidth = 4;
    g.strokeStyle = '#b4bac3';
    g.beginPath();
    g.moveTo(ox(133), oy(60));
    g.lineTo(ox(133), oy(554));
    g.stroke();
    g.strokeStyle = INT_OUTLINE;
    g.lineWidth = 6;
    g.fillStyle = '#6a707a';
    g.fillRect(ox(115), oy(288), 36, 34);
    g.strokeRect(ox(115), oy(288), 36, 34);
  });

  // cockpit ball
  const ball = g.createRadialGradient(ox(305), oy(260), 10, 0, 0, 80);
  ball.addColorStop(0, '#d4d7dc');
  ball.addColorStop(0.55, '#8e939b');
  ball.addColorStop(1, '#4c5058');
  g.fillStyle = ball;
  circle(g, ox(333), oy(300), 72);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(ox(333), oy(300), 62, Math.PI * 1.25, Math.PI * 1.75);
  g.lineWidth = 3;
  g.stroke();

  // hexagonal viewport with spokes
  const cx = ox(333);
  const cy = oy(308);
  g.lineWidth = 6;
  g.fillStyle = '#1b1e23';
  circle(g, cx, cy, 46);
  g.fill();
  g.stroke();
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    hex.push(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
  }
  g.strokeStyle = '#5d636d';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    g.moveTo(hex[i * 2], hex[i * 2 + 1]);
    g.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
  }
  g.stroke();
  poly(g, hex);
  g.fillStyle = '#2c3038';
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(190,210,255,0.18)';
  poly(g, [cx - 30, cy - 26, cx - 6, cy - 38, cx - 10, cy - 24, cx - 22, cy - 18]);
  g.fill();

  // twin guns (glow red)
  g.strokeStyle = INT_OUTLINE;
  g.lineWidth = 4;
  for (const gx of [310, 357]) {
    g.fillStyle = '#2a2d33';
    circle(g, ox(gx), oy(371), 9);
    g.fill();
    g.stroke();
    g.shadowColor = '#ff2a44';
    g.shadowBlur = 6;
    g.fillStyle = '#ff3a50';
    circle(g, ox(gx), oy(371), 4.5);
    g.fill();
    g.shadowBlur = 0;
  }

  g.restore();
}

/*
 * Heavy fighter: ball cockpit with a grated viewport, short struts and bent
 * wing panels that end in twin gun barrels. Authored in reference-image space
 * (cockpit at 500,360, barrels at the image bottom); the y flip points the
 * barrels at the nose (-y). Centered on the whole ship (y 567), not the
 * cockpit, so the long wings don't hang into the formation row below.
 */
const HEAVY_SCALE = 0.044;
const HEAVY_CENTER_Y = 567;
const HV_OUTLINE = '#15181d';
const HV_MESH = '#262a30';
const HV_WING = [72, 28, 238, 122, 244, 318, 236, 345, 104, 1040, 66, 1040, 64, 320, 70, 300];
const HV_MESH_UP = [92, 72, 206, 136, 210, 272, 92, 272];
const HV_MESH_LOW = [86, 368, 207, 368, 110, 880, 86, 880];
const HV_BACK_UP = [238, 160, 292, 190, 292, 300, 244, 300];
const HV_BACK_LOW = [244, 345, 292, 345, 162, 960, 120, 985];
const HV_BALL = [];
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * TAU;
  HV_BALL.push(500 + Math.cos(a) * 152, 360 + Math.sin(a) * 152);
}

function drawHeavy(g, damaged) {
  const shape = (pts, fill, stroke = true) => {
    poly(g, pts);
    g.fillStyle = fill;
    g.fill();
    if (stroke) g.stroke();
  };
  const mesh = (pts) => {
    shape(pts, HV_MESH, false);
    g.save();
    poly(g, pts);
    g.clip();
    g.strokeStyle = '#3b4149';
    g.lineWidth = 3;
    g.beginPath();
    for (let d = -1100; d < 1100; d += 22) {
      g.moveTo(0, d);
      g.lineTo(1000, d + 1000);
      g.moveTo(0, d + 1000);
      g.lineTo(1000, d);
    }
    g.stroke();
    g.restore();
  };
  // draws the left half, then mirrors it about x = 500
  const both = (fn) => {
    fn();
    g.save();
    g.translate(1000, 0);
    g.scale(-1, 1);
    fn();
    g.restore();
  };

  g.save();
  g.scale(HEAVY_SCALE, -HEAVY_SCALE);
  g.translate(-500, -HEAVY_CENTER_Y);
  g.lineJoin = 'round';
  g.strokeStyle = HV_OUTLINE;
  g.lineWidth = 7;

  both(() => {
    // twin gun barrels below the wing tip, with hot muzzles
    for (const [x, end] of [[78, 1112], [112, 1095]]) {
      g.fillStyle = '#7d858f';
      g.fillRect(x - 7, 930, 14, end - 930);
      g.strokeRect(x - 7, 930, 14, end - 930);
      g.shadowColor = '#ff9a2e';
      g.shadowBlur = 5;
      g.fillStyle = '#ffae4a';
      g.fillRect(x - 7, end - 16, 14, 16);
      g.shadowBlur = 0;
    }

    // rear faces of the wing, seen past the front panel
    shape(HV_BACK_UP, '#4b535c');
    shape(HV_BACK_LOW, '#4b535c');
    shape([256, 362, 280, 362, 160, 930, 138, 945], HV_MESH, false);

    // strut into the cockpit
    shape([244, 292, 362, 280, 362, 345, 244, 336], linear(g, 0, 280, 0, 345, [[0, '#a9b1ba'], [1, '#5b636c']]));
    g.fillStyle = '#646c76';
    g.fillRect(292, 290, 40, 46);
    g.strokeRect(292, 290, 40, 46);

    // front wing panel: light frame around dark solar mesh, fold band at the strut
    shape(HV_WING, linear(g, 64, 0, 244, 0, [[0, '#8b949e'], [0.5, '#b7c0c9'], [1, '#8b949e']]));
    mesh(HV_MESH_UP);
    mesh(HV_MESH_LOW);
    g.fillStyle = '#c3cbd3';
    g.fillRect(66, 292, 176, 56);
    g.beginPath();
    g.moveTo(66, 302);
    g.lineTo(242, 302);
    g.moveTo(66, 338);
    g.lineTo(242, 338);
    g.lineWidth = 4;
    g.stroke();
    g.lineWidth = 7;
    poly(g, HV_WING);
    g.stroke();
  });

  // cockpit ball
  const ball = g.createRadialGradient(450, 280, 20, 500, 360, 165);
  ball.addColorStop(0, '#c3cad2');
  ball.addColorStop(0.55, '#7d868f');
  ball.addColorStop(1, '#454c55');
  g.fillStyle = ball;
  circle(g, 500, 360, 152);
  g.fill();
  g.stroke();
  g.fillStyle = '#6d7680';
  g.fillRect(482, 196, 36, 22);
  g.strokeRect(482, 196, 36, 22);
  g.fillStyle = '#2a2f36';
  g.fillRect(405, 450, 190, 38);
  g.strokeStyle = '#8a939d';
  g.lineWidth = 5;
  g.beginPath();
  for (let x = 430; x <= 570; x += 35) {
    g.moveTo(x, 452);
    g.lineTo(x, 486);
  }
  g.stroke();

  // grated viewport: dark glass with slats above, vented panel below
  g.strokeStyle = HV_OUTLINE;
  g.lineWidth = 7;
  g.fillStyle = '#5f6872';
  circle(g, 500, 340, 98);
  g.fill();
  g.stroke();
  g.save();
  circle(g, 500, 340, 86);
  g.clip();
  g.fillStyle = '#14171c';
  g.fillRect(400, 250, 200, 110);
  g.fillStyle = 'rgba(255,150,50,0.22)';
  g.fillRect(400, 250, 200, 110);
  g.fillStyle = '#8a939d';
  g.fillRect(400, 360, 200, 70);
  for (const x of [440, 470, 530, 560]) g.fillRect(x - 5, 250, 10, 110);
  g.fillStyle = '#a3acb6';
  g.fillRect(486, 250, 28, 180);
  g.strokeStyle = '#2a2f36';
  g.lineWidth = 5;
  g.beginPath();
  for (const y of [380, 398, 416]) {
    g.moveTo(420, y);
    g.lineTo(478, y);
    g.moveTo(522, y);
    g.lineTo(580, y);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = HV_OUTLINE;
  g.lineWidth = 7;
  circle(g, 500, 340, 86);
  g.stroke();

  if (damaged) {
    scorch(g, HV_WING, [[150, 600, 64], [175, 200, 42]]);
    scorch(g, HV_BALL, [[420, 300, 50], [575, 430, 40]]);
  }
  g.restore();
}

/*
 * Dive bomber: cockpit pod and ordnance pod side by side on a cross strut,
 * between two angled wing panels. Authored in reference-image space
 * (260×222, center 130,111) with the rounded pod ends at the image bottom;
 * the y flip puts them at the nose (-y). Violet accents set it apart from the
 * grey interceptors.
 */
const BOMBER_SCALE = 0.17;
const BM_OUTLINE = '#15131d';
const BM_WING = [6, 16, 54, 28, 54, 194, 6, 208];
const BM_MESH = [12, 25, 48, 34, 48, 188, 12, 199];
const BM_COCKPIT_POD = [62, 40, 132, 178];
const BM_ORDNANCE_POD = [136, 38, 196, 178];

function drawBomber(g) {
  const pod = ([x0, y0, x1, y1], r) => {
    rrect(g, x0, y0, x1 - x0, y1 - y0, r);
    g.fillStyle = linear(g, x0, 0, x1, 0, [[0, '#6f7884'], [0.45, '#c3cbd4'], [1, '#6f7884']]);
    g.fill();
    g.stroke();
  };
  const lines = (segs, color, width) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    for (const [x0, y0, x1, y1] of segs) {
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
  };
  // draws the left wing, then mirrors it about x = 130
  const bothWings = (fn) => {
    fn();
    g.save();
    g.translate(260, 0);
    g.scale(-1, 1);
    fn();
    g.restore();
  };

  g.save();
  g.scale(BOMBER_SCALE, -BOMBER_SCALE);
  g.translate(-130, -111);
  g.lineJoin = 'round';
  g.strokeStyle = BM_OUTLINE;
  g.lineWidth = 1.8;

  // cross strut and wing hubs
  g.fillStyle = linear(g, 0, 117, 0, 135, [[0, '#c3cbd4'], [1, '#626b77']]);
  g.fillRect(40, 117, 180, 18);
  g.strokeRect(40, 117, 180, 18);

  bothWings(() => {
    g.shadowColor = 'rgba(180,110,255,0.7)';
    g.shadowBlur = 6;
    poly(g, BM_WING);
    g.fillStyle = '#aeb7c1';
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = BM_OUTLINE;
    g.lineWidth = 1.8;
    g.stroke();
    poly(g, BM_MESH);
    g.fillStyle = '#2b2740';
    g.fill();
    g.save();
    g.clip();
    const ribs = [];
    for (let x = 16; x < 48; x += 5) ribs.push([x, 20, x, 205]);
    lines(ribs, '#4a4466', 1.2);
    g.restore();
    lines([[12, 111, 48, 111]], '#aeb7c1', 3);
    g.fillStyle = '#7d8691';
    g.strokeStyle = BM_OUTLINE;
    g.lineWidth = 1.8;
    g.fillRect(52, 110, 14, 32);
    g.strokeRect(52, 110, 14, 32);
  });

  // cockpit pod (left) with viewport
  g.strokeStyle = BM_OUTLINE;
  g.lineWidth = 1.8;
  pod(BM_COCKPIT_POD, 18);
  g.fillStyle = '#4c5560';
  g.fillRect(82, 50, 30, 80);
  g.strokeRect(82, 50, 30, 80);
  lines([[86, 62, 108, 62], [86, 76, 108, 76], [86, 90, 108, 90], [97, 50, 97, 130]], '#2a3038', 1.2);
  g.strokeStyle = BM_OUTLINE;
  g.lineWidth = 1.8;
  g.shadowColor = '#c08bff';
  g.shadowBlur = 5;
  g.fillStyle = '#d9b8ff';
  circle(g, 97, 153, 11);
  g.fill();
  g.shadowBlur = 0;
  g.stroke();
  lines([[90, 146, 104, 160], [104, 146, 90, 160]], '#5b3a8c', 1.4);

  // ordnance pod (right) with bomb-bay hatch
  g.strokeStyle = BM_OUTLINE;
  g.lineWidth = 1.8;
  pod(BM_ORDNANCE_POD, 14);
  g.fillStyle = '#596270';
  g.fillRect(148, 52, 36, 66);
  g.strokeRect(148, 52, 36, 66);
  lines([[148, 70, 184, 70], [148, 88, 184, 88], [148, 104, 184, 104], [166, 52, 166, 118]], '#2a3038', 1.2);
  g.fillStyle = '#1c1a26';
  rrect(g, 150, 146, 32, 22, 6);
  g.fill();
  g.fillStyle = '#ff5ad9';
  g.fillRect(156, 162, 20, 3);

  // antenna stubs on the pod tops
  g.fillStyle = '#9aa3ae';
  g.strokeStyle = BM_OUTLINE;
  g.lineWidth = 1.4;
  for (const [x, w] of [[84, 8], [104, 6], [146, 6], [176, 8]]) {
    g.fillRect(x, 32, w, 9);
    g.strokeRect(x, 32, w, 9);
  }

  g.restore();
}

/*
 * Elite ace: probe droid with a domed sensor head, saucer body and jointed
 * claw legs. Authored in reference-image space (1080 wide, centered on the
 * saucer at 550,600) with the legs hanging toward the image bottom; the y flip
 * points them at the nose (-y). Legs are shortened from the reference so the
 * droid fits a formation slot.
 */
const ACE_SCALE = 0.034;
const ACE_OUTLINE = '#121417';
const ACE_SIDE = [55, 490, 1050, 490, 1040, 620, 990, 700, 120, 700, 70, 620];
const ACE_HEAD = [145, 300, 220, 150, 400, 85, 550, 75, 700, 85, 880, 150, 945, 300, 940, 380, 880, 400, 210, 400, 150, 380];
// [hipX, hipY, hipR, kneeX, kneeY, kneeR, footX, footY]
const ACE_LEGS = [
  [870, 785, 45, 915, 1120, 24, 950, 1330],
  [310, 800, 72, 455, 1170, 38, 405, 1470],
  [715, 790, 55, 690, 1110, 26, 640, 1430],
];

function drawAce(g, damaged) {
  const limb = (x0, y0, x1, y1, w) => {
    g.lineCap = 'round';
    g.strokeStyle = ACE_OUTLINE;
    g.lineWidth = w + 12;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = '#7d848c';
    g.lineWidth = w;
    g.stroke();
  };
  const disc = (x, y, r, fill) => {
    circle(g, x, y, r);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = ACE_OUTLINE;
    g.lineWidth = 9;
    g.stroke();
  };
  const claw = (x, y) => {
    g.strokeStyle = '#9aa1a9';
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 34, y + 50);
    g.moveTo(x, y);
    g.lineTo(x + 30, y + 52);
    g.stroke();
  };
  const sensor = (x, y, r, glass) => {
    disc(x, y, r, '#5b6168');
    disc(x, y, r * 0.72, glass);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    circle(g, x - r * 0.25, y - r * 0.28, r * 0.18);
    g.fill();
  };

  g.save();
  g.scale(ACE_SCALE, -ACE_SCALE);
  g.translate(-550, -600);
  g.lineJoin = 'round';

  // legs and claws (the back leg first so the front ones overlap it)
  for (const [hx, hy, hr, kx, ky, kr, fx, fy] of ACE_LEGS) {
    limb(hx, hy + hr * 0.4, kx, ky, 38);
    limb(kx, ky, fx, fy, 30);
    claw(fx, fy);
    disc(kx, ky, kr, '#8c939b');
  }
  limb(320, 1000, 215, 960, 22);
  claw(215, 960);

  // underside drum and leg hips
  g.fillStyle = '#34383e';
  g.fillRect(400, 690, 370, 95);
  g.strokeStyle = ACE_OUTLINE;
  g.lineWidth = 9;
  g.strokeRect(400, 690, 370, 95);
  for (const [hx, hy, hr] of ACE_LEGS) {
    const hub = g.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, 2, hx, hy, hr);
    hub.addColorStop(0, '#b3b9c0');
    hub.addColorStop(1, '#5b6168');
    disc(hx, hy, hr, hub);
  }

  // saucer: side band, then the top face
  g.shadowColor = 'rgba(255,70,60,0.6)';
  g.shadowBlur = 8;
  poly(g, ACE_SIDE);
  g.fillStyle = linear(g, 55, 0, 1050, 0, [[0, '#5b6168'], [0.4, '#9da4ac'], [1, '#575d64']]);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = ACE_OUTLINE;
  g.lineWidth = 9;
  g.stroke();
  g.strokeStyle = 'rgba(18,20,23,0.6)';
  g.lineWidth = 5;
  g.beginPath();
  for (const x of [190, 420, 610, 800, 940]) {
    g.moveTo(x, 535);
    g.lineTo(x + (x < 550 ? 10 : -10), 690);
  }
  g.stroke();
  for (const x of [235, 280, 325]) {
    g.fillStyle = '#9aa1a9';
    rrect(g, x - 17, 585, 34, 105, 16);
    g.fill();
    g.strokeStyle = ACE_OUTLINE;
    g.lineWidth = 6;
    g.stroke();
  }
  g.fillStyle = '#ff3a3a';
  circle(g, 280, 600, 12);
  g.fill();
  g.fillStyle = '#aab1b8';
  g.fillRect(475, 590, 34, 34);
  g.beginPath();
  g.ellipse(552, 490, 497, 52, 0, 0, TAU);
  g.fillStyle = linear(g, 0, 440, 0, 540, [[0, '#c3c9cf'], [1, '#7a8189']]);
  g.fill();
  g.strokeStyle = ACE_OUTLINE;
  g.lineWidth = 9;
  g.stroke();

  // neck and sensor head
  g.fillStyle = '#2c2f34';
  g.fillRect(410, 390, 310, 70);
  poly(g, ACE_HEAD);
  const head = g.createRadialGradient(420, 160, 30, 550, 260, 470);
  head.addColorStop(0, '#d0d5da');
  head.addColorStop(0.6, '#8a9199');
  head.addColorStop(1, '#4d5258');
  g.fillStyle = head;
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(18,20,23,0.55)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(230, 200);
  g.quadraticCurveTo(360, 230, 400, 395);
  g.moveTo(560, 80);
  g.quadraticCurveTo(540, 160, 600, 210);
  g.stroke();
  for (const x of [545, 700]) {
    g.fillStyle = '#7d848c';
    g.fillRect(x - 8, 10, 16, 75);
    g.strokeStyle = ACE_OUTLINE;
    g.lineWidth = 6;
    g.strokeRect(x - 8, 10, 16, 75);
  }

  sensor(160, 290, 50, '#1a1b1f');
  sensor(870, 215, 42, '#1a1b1f');
  sensor(450, 320, 58, '#26282d');
  disc(655, 300, 100, '#17181c');
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(615, 255, 36, 22, -0.6, 0, TAU);
  g.fill();

  // searchlight lamp and red indicator eyes
  disc(820, 320, 52, '#6a7078');
  g.shadowColor = '#ffe9a8';
  g.shadowBlur = 8;
  g.fillStyle = '#fff6d8';
  circle(g, 820, 320, 30);
  g.fill();
  g.shadowColor = '#ff2a2a';
  g.fillStyle = '#ff3a3a';
  for (const [x, y, r] of [[330, 175, 16], [245, 335, 12]]) {
    circle(g, x, y, r);
    g.fill();
  }
  g.shadowBlur = 0;

  if (damaged) {
    scorch(g, ACE_HEAD, [[300, 230, 70], [760, 160, 55]], '#ffcf5a');
    scorch(g, ACE_SIDE, [[800, 600, 70]], '#ffcf5a');
  }
  g.restore();
}

/* ------------------------------------------------------------------- ally */

/*
 * The Falcon: saucer freighter with forward mandibles, an offset cockpit,
 * a dorsal quad-laser turret and six engine grilles. Authored nose-up in
 * reference-image space (800×1050, centered at 400,526). The blue engine
 * strip along the rear rim is drawn live in falcon.js.
 */
const FALCON_SCALE = 0.085;
const FC_OUTLINE = '#2a2a2e';
const FC_MANDIBLES = [130, 480, 262, 22, 348, 22, 348, 185, 452, 185, 452, 22, 538, 22, 670, 480];
const FC_TUBE = [505, 575, 722, 372];
const FC_ENGINES = [[330, 790], [400, 800], [470, 790], [300, 870], [400, 880], [500, 870]];
const FC_RED = [[285, 255, 46, 30], [168, 455, 40, 26], [520, 440, 44, 26], [210, 660, 52, 20], [556, 690, 44, 30], [162, 940, 46, 22], [430, 1000, 44, 20], [580, 935, 40, 22]];

function drawFalcon(g) {
  const rng = mulberry32(77);
  const disc = () => circle(g, 400, 660, 360);
  const tube = (width) => {
    g.lineCap = 'butt';
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(FC_TUBE[0], FC_TUBE[1]);
    g.lineTo(FC_TUBE[2], FC_TUBE[3]);
    g.stroke();
  };
  const pods = () => {
    rrect(g, 30, 588, 265, 96, 30);
    rrect(g, 505, 588, 265, 96, 30);
  };

  g.save();
  g.scale(FALCON_SCALE, FALCON_SCALE);
  g.translate(-400, -526);
  g.lineJoin = 'round';

  // outline pass: everything stroked thick first, so the fill pass below
  // hides the inner seams and leaves one clean silhouette outline
  g.strokeStyle = FC_OUTLINE;
  g.lineWidth = 22;
  disc();
  g.stroke();
  poly(g, FC_MANDIBLES);
  g.stroke();
  pods();
  g.stroke();
  circle(g, 735, 345, 52);
  g.stroke();
  tube(86 + 22);

  // fill pass
  const hull = g.createRadialGradient(330, 430, 40, 400, 600, 560);
  hull.addColorStop(0, '#f0eee8');
  hull.addColorStop(1, '#aca89f');
  g.fillStyle = hull;
  disc();
  g.fill();
  poly(g, FC_MANDIBLES);
  g.fill();
  g.strokeStyle = '#d2cfc7';
  tube(86);
  g.fillStyle = '#d6d3cc';
  circle(g, 735, 345, 52);
  g.fill();
  g.fillStyle = '#cfccc5';
  pods();
  g.fill();

  // hull plating: concentric rings, radial seams and darker panels
  g.save();
  disc();
  g.clip();
  g.strokeStyle = 'rgba(90,86,80,0.45)';
  g.lineWidth = 4;
  for (const r of [170, 250, 320]) {
    circle(g, 400, 660, r);
    g.stroke();
  }
  g.beginPath();
  for (let a = 0; a < 360; a += 12) {
    const rad = (a * Math.PI) / 180;
    g.moveTo(400 + Math.cos(rad) * 110, 660 + Math.sin(rad) * 110);
    g.lineTo(400 + Math.cos(rad) * 360, 660 + Math.sin(rad) * 360);
  }
  g.stroke();
  for (let i = 0; i < 70; i++) {
    const a = rng() * TAU;
    const r = 120 + rng() * 220;
    g.fillStyle = rng() < 0.5 ? 'rgba(120,115,105,0.28)' : 'rgba(255,255,255,0.25)';
    g.fillRect(400 + Math.cos(a) * r, 660 + Math.sin(a) * r, 20 + rng() * 40, 14 + rng() * 26);
  }
  // rear exhaust housing (the glow is animated in falcon.js)
  g.strokeStyle = '#41464f';
  g.lineWidth = 26;
  g.beginPath();
  g.arc(400, 660, 342, Math.PI * 0.3, Math.PI * 0.7);
  g.stroke();
  g.restore();

  // mandible plating and gun ports
  g.strokeStyle = 'rgba(90,86,80,0.5)';
  g.lineWidth = 4;
  g.beginPath();
  for (const sx of [1, -1]) {
    const x = (v) => 400 + sx * (v - 400);
    g.moveTo(x(300), 60); g.lineTo(x(300), 380);
    g.moveTo(x(240), 160); g.lineTo(x(190), 420);
    g.moveTo(x(270), 120); g.lineTo(x(345), 120);
  }
  g.stroke();
  g.strokeStyle = FC_OUTLINE;
  g.lineWidth = 7;
  for (const [x, y, r] of [[275, 185, 26], [232, 270, 24], [525, 185, 26], [565, 270, 24]]) {
    g.fillStyle = '#4a4c50';
    circle(g, x, y, r);
    g.fill();
    g.stroke();
  }

  // forward cargo spine between the mandibles
  g.fillStyle = '#c4c0b8';
  g.fillRect(338, 180, 124, 350);
  g.strokeRect(338, 180, 124, 350);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(60,58,54,0.6)';
  g.strokeRect(360, 205, 80, 300);
  g.beginPath();
  g.moveTo(400, 205);
  g.lineTo(400, 505);
  for (let y = 240; y < 500; y += 45) {
    g.moveTo(360, y);
    g.lineTo(440, y);
  }
  g.stroke();

  // side pods with docking rings
  g.strokeStyle = FC_OUTLINE;
  g.lineWidth = 7;
  for (const [x, y] of [[110, 636], [185, 636], [262, 636], [630, 636], [700, 636]]) {
    g.fillStyle = '#4a4c50';
    circle(g, x, y, 18);
    g.fill();
    g.stroke();
  }

  // cockpit tube ribs and canopy
  const [ax, ay, bx, by] = FC_TUBE;
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  g.strokeStyle = 'rgba(80,78,72,0.6)';
  g.lineWidth = 5;
  g.beginPath();
  for (let t = 0.12; t < 0.9; t += 0.11) {
    const px = lerp(ax, bx, t);
    const py = lerp(ay, by, t);
    g.moveTo(px - nx * 42, py - ny * 42);
    g.lineTo(px + nx * 42, py + ny * 42);
  }
  g.stroke();
  g.fillStyle = '#26282d';
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI * 0.95 + i * 0.42;
    g.beginPath();
    g.moveTo(735 + Math.cos(a0 + 0.2) * 14, 345 + Math.sin(a0 + 0.2) * 14);
    g.arc(735, 345, 44, a0, a0 + 0.34);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = FC_OUTLINE;
  g.lineWidth = 7;
  circle(g, 735, 345, 14);
  g.stroke();

  // sensor dish on the port side
  g.fillStyle = '#9d9a93';
  g.fillRect(205, 392, 22, 52);
  g.strokeRect(205, 392, 22, 52);
  g.fillStyle = '#c9c6bf';
  g.beginPath();
  g.ellipse(216, 384, 60, 22, -0.15, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = '#4a4c50';
  circle(g, 216, 384, 9);
  g.fill();

  // engine block and the six grilles
  g.fillStyle = 'rgba(120,118,112,0.45)';
  rrect(g, 250, 740, 300, 190, 40);
  g.fill();
  for (const [x, y] of FC_ENGINES) {
    g.fillStyle = '#55585e';
    circle(g, x, y, 34);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = '#2c2e33';
    g.lineWidth = 4;
    g.beginPath();
    for (let yy = y - 28; yy <= y + 28; yy += 8) {
      g.moveTo(x - 34, yy);
      g.lineTo(x + 34, yy);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = FC_OUTLINE;
    g.lineWidth = 7;
    circle(g, x, y, 34);
    g.stroke();
  }

  // dorsal quad-laser turret
  g.fillStyle = '#e2dfd8';
  circle(g, 400, 635, 100);
  g.fill();
  g.lineWidth = 9;
  g.stroke();
  g.fillStyle = '#3c3e44';
  circle(g, 400, 635, 50);
  g.fill();
  g.stroke();
  g.fillStyle = '#2c2e33';
  g.fillRect(380, 545, 12, 72);
  g.fillRect(408, 545, 12, 72);
  g.fillStyle = '#6a6d73';
  g.fillRect(372, 608, 56, 40);
  g.strokeRect(372, 608, 56, 40);

  // red panels and weathering
  g.fillStyle = '#c8352b';
  for (const [x, y, w, h] of FC_RED) g.fillRect(x, y, w, h);
  for (const [x, y, r] of [[150, 470, 60], [320, 300, 45], [575, 830, 55], [120, 520, 30]]) {
    const smudge = g.createRadialGradient(x, y, 0, x, y, r);
    smudge.addColorStop(0, 'rgba(40,38,36,0.45)');
    smudge.addColorStop(1, 'rgba(40,38,36,0)');
    g.fillStyle = smudge;
    circle(g, x, y, r);
    g.fill();
  }

  g.restore();
}

/* ------------------------------------------------------------------- boss */

/*
 * Capital ship: wedge-hulled destroyer seen from the bow, with a stepped
 * superstructure, command tower and sensor globes. Hull and superstructure
 * are traced in reference-image space (1220 wide, centered at 610,310); the
 * weapons, reactor core, hangar and engine bells are then drawn in sprite
 * units at the positions boss.js fires and launches from (keep them in sync).
 */
const BOSS_ART_SCALE = 0.28;
const BOSS_OUTLINE = '#0b0f19';
const BOSS_DECK = [22, 442, 300, 385, 610, 330, 920, 385, 1200, 447, 610, 522];
const BOSS_BELLY = [22, 447, 610, 522, 1200, 452, 1188, 472, 622, 600, 36, 468];
const BOSS_TIERS = [
  [300, 398, 920, 398, 878, 335, 342, 335],
  [400, 335, 820, 335, 788, 285, 432, 285],
  [470, 285, 750, 285, 728, 238, 492, 238],
];
const BOSS_ENGINES = [[-145, 33], [-105, 25], [105, 25], [145, 33]];
const BOSS_TURRETS = [[-87, 31], [87, 31]];
const BOSS_PRONGS = [[-129, 45], [129, 45]];
const BOSS_CORE = [0, 20];
const BOSS_HANGAR = [0, 64];

function drawBoss(g, accent, dmg) {
  const rng = mulberry32(1337);
  const greeble = (outline, count, x0, x1, y0, y1) => {
    g.save();
    poly(g, outline);
    g.clip();
    for (let i = 0; i < count; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.22)';
      g.fillRect(lerp(x0, x1, rng()), lerp(y0, y1, rng()), 8 + rng() * 40, 5 + rng() * 14);
    }
    g.restore();
  };
  const windows = (x0, x1, y, n) => {
    g.fillStyle = '#ffd27a';
    for (let i = 0; i < n; i++) {
      if (rng() < 0.35) continue;
      g.fillRect(lerp(x0, x1, (i + rng() * 0.5) / n), y + rng() * 6, 7, 5);
    }
  };
  const face = (pts, top, bottom) => {
    poly(g, pts);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) {
      minY = Math.min(minY, pts[i]);
      maxY = Math.max(maxY, pts[i]);
    }
    g.fillStyle = linear(g, 0, minY, 0, maxY, [[0, top], [1, bottom]]);
    g.fill();
    g.stroke();
  };

  /* ---- hull and superstructure, in reference-image units */
  g.save();
  g.scale(BOSS_ART_SCALE, BOSS_ART_SCALE);
  g.translate(-610, -310);
  g.lineJoin = 'round';
  g.strokeStyle = BOSS_OUTLINE;
  g.lineWidth = 6;

  g.shadowColor = hexToRgba(accent, 0.4);
  g.shadowBlur = 18;
  face(BOSS_BELLY, '#5d6678', '#232835');
  g.shadowBlur = 0;
  poly(g, BOSS_DECK);
  g.fillStyle = linear(g, 22, 0, 1200, 0, [[0, '#cfd5dd'], [0.5, '#9fa8b6'], [1, '#78818f']]);
  g.fill();
  g.stroke();
  greeble(BOSS_DECK, 260, 40, 1180, 330, 520);
  greeble(BOSS_BELLY, 120, 60, 1160, 450, 590);

  // deck seams converging on the bow
  g.strokeStyle = 'rgba(30,36,48,0.55)';
  g.lineWidth = 4;
  g.beginPath();
  for (const [x, y] of [[160, 414], [300, 385], [450, 362], [770, 362], [920, 385], [1060, 416]]) {
    g.moveTo(x, y);
    g.lineTo(610, 522);
  }
  g.stroke();

  // equator trench with lit ports
  g.strokeStyle = '#272c39';
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(40, 450);
  g.lineTo(610, 524);
  g.lineTo(1185, 455);
  g.stroke();
  g.fillStyle = '#ffd27a';
  for (let i = 1; i < 26; i++) {
    if (rng() < 0.4) continue;
    const t = i / 26;
    const x = lerp(40, 1185, t);
    const y = t < 0.5 ? lerp(450, 524, t * 2) : lerp(524, 455, t * 2 - 1);
    g.fillRect(x, y - 2, 8, 4);
  }

  // stepped superstructure
  g.strokeStyle = BOSS_OUTLINE;
  g.lineWidth = 6;
  BOSS_TIERS.forEach((tier, i) => {
    face(tier, ['#b9c0ca', '#a7afbb', '#9aa3af'][i], ['#6b7483', '#636c7b', '#5b6472'][i]);
    windows(tier[0] + 20, tier[2] - 30, tier[5] + 10, 18 - i * 4);
  });
  g.fillStyle = '#5d6678';
  g.fillRect(588, 160, 44, 80);
  g.strokeRect(588, 160, 44, 80);

  // command tower
  face([440, 98, 780, 98, 762, 80, 458, 80], '#d3d9e0', '#aeb6c1');
  face([430, 98, 790, 98, 790, 168, 430, 168], '#a9b1bc', '#6a7381');
  face([430, 168, 790, 168, 762, 184, 458, 184], '#4c5463', '#363c48');
  windows(445, 770, 112, 22);
  windows(445, 770, 140, 22);

  // shield-generator globes and antenna mast
  for (const gx of [470, 745]) {
    g.fillStyle = '#6a7381';
    g.fillRect(gx - 6, 62, 12, 38);
    g.strokeRect(gx - 6, 62, 12, 38);
    const globe = g.createRadialGradient(gx - 10, 40, 4, gx, 52, 30);
    globe.addColorStop(0, '#e7ebf0');
    globe.addColorStop(1, '#7c8593');
    g.fillStyle = globe;
    circle(g, gx, 52, 27);
    g.fill();
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(gx, 52, 27, 9, 0, 0, TAU);
    g.moveTo(gx, 25);
    g.lineTo(gx, 79);
    g.stroke();
    g.lineWidth = 6;
  }
  g.fillStyle = '#7c8593';
  g.fillRect(600, 16, 20, 66);
  g.strokeRect(600, 16, 20, 66);
  g.fillRect(546, 22, 128, 12);
  g.strokeRect(546, 22, 128, 12);

  if (dmg >= 1) {
    scorch(g, BOSS_DECK, [[260, 420, 70], [880, 405, 55], [470, 470, 45]]);
    scorch(g, BOSS_TIERS[0], [[420, 370, 42]]);
  }
  if (dmg >= 2) {
    scorch(g, BOSS_DECK, [[1060, 440, 52], [130, 444, 42], [740, 470, 46]], '#ff4a2a');
    scorch(g, BOSS_BELLY, [[420, 520, 55], [860, 520, 50]], '#ff4a2a');
    scorch(g, BOSS_TIERS[1], [[700, 310, 40]], '#ff4a2a');
  }
  g.restore();

  /* ---- functional details, in sprite units */
  g.lineJoin = 'round';
  g.strokeStyle = BOSS_OUTLINE;

  for (const [ex, ey] of BOSS_ENGINES) {
    g.fillStyle = '#1a1f2c';
    rrect(g, ex - 8, ey - 6, 16, 9, 2);
    g.fill();
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#8fb4ff';
    g.fillRect(ex - 6, ey - 6, 12, 2.5);
  }

  for (const [tx, ty] of BOSS_TURRETS) {
    g.fillStyle = '#20263a';
    g.fillRect(tx - 4.5, ty, 3, 14);
    g.fillRect(tx + 1.5, ty, 3, 14);
    g.fillStyle = linear(g, tx - 8, ty, tx + 8, ty, [[0, '#3a4256'], [0.5, '#8a95ab'], [1, '#3a4256']]);
    circle(g, tx, ty, 8);
    g.fill();
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = accent;
    circle(g, tx, ty, 2.5);
    g.fill();
  }

  for (const [px, py] of BOSS_PRONGS) {
    g.fillStyle = '#20263a';
    g.fillRect(px - 1.5, py, 3, 11);
    g.fillStyle = '#4a5368';
    circle(g, px, py, 5.5);
    g.fill();
    g.lineWidth = 1.3;
    g.stroke();
  }

  const [hx, hy] = BOSS_HANGAR;
  g.fillStyle = '#080b12';
  rrect(g, hx - 22, hy - 5, 44, 11, 3);
  g.fill();
  g.lineWidth = 1.3;
  g.stroke();
  g.fillStyle = '#ff9a3c';
  for (let x = -18; x <= 14; x += 8) g.fillRect(hx + x, hy + 2, 4, 1.6);

  // reactor core housing (the glow itself is drawn live by boss.js)
  const [cx, cy] = BOSS_CORE;
  g.fillStyle = '#121724';
  circle(g, cx, cy, 20);
  g.fill();
  g.strokeStyle = '#7d889e';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = hexToRgba(accent, 0.6);
  g.lineWidth = 1.5;
  circle(g, cx, cy, 15);
  g.stroke();
  g.strokeStyle = 'rgba(125,136,158,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.moveTo(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21);
    g.lineTo(cx + Math.cos(a) * 25, cy + Math.sin(a) * 25);
  }
  g.stroke();

  // running lights along the equator trench
  g.fillStyle = accent;
  g.shadowColor = accent;
  g.shadowBlur = 6;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 7;
      circle(g, sx * lerp(156, 26, t), lerp(39.5, 56, t), 1.8);
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
    // the Falcon's laser: same capsule as the player's bolt, in red
    ally: makeBullet(14, 42, 7, 12, (g) => {
      trail(g, 7, 18, 42, 3, '#ff5a3a', 0.55);
      g.shadowColor = '#ff5a3a';
      g.shadowBlur = 7;
      g.fillStyle = '#ff5a3a';
      rrect(g, 4, 3, 6, 19, 3);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffe2d6';
      rrect(g, 5.8, 5, 2.4, 15, 1.2);
      g.fill();
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
    interceptor: makeSprite(46, 52, drawInterceptor),
    heavy: makeSprite(48, 56, (g) => drawHeavy(g, false)),
    heavyDamaged: makeSprite(48, 56, (g) => drawHeavy(g, true)),
    bomber: makeSprite(54, 46, drawBomber),
    falcon: makeSprite(72, 98, drawFalcon),
    ace: makeSprite(44, 70, (g) => drawAce(g, false)),
    aceDamaged: makeSprite(44, 70, (g) => drawAce(g, true)),
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
    s = [0, 1, 2].map((dmg) => makeSprite(350, 200, (g) => drawBoss(g, accent, dmg)));
    bossCache.set(accent, s);
  }
  return s;
}
