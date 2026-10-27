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

function drawPlayer(g) {
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
    interceptor: makeSprite(46, 52, drawInterceptor),
    heavy: makeSprite(48, 56, (g) => drawHeavy(g, false)),
    heavyDamaged: makeSprite(48, 56, (g) => drawHeavy(g, true)),
    bomber: makeSprite(54, 46, drawBomber),
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
