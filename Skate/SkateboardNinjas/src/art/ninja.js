// The ninja and their skateboard, drawn with canvas paths.
//
// The body is a jointed puppet: feet are pinned to the board and hands to
// pose targets (or to the board during grabs), and knees/elbows are solved
// with two-bone IK. Coordinates are local to the skater: origin at the wheels'
// contact point, x forward, y DOWN (canvas convention).

const TAU = Math.PI * 2;

const C = {
  out: '#0c0d1f',
  gi: '#2f3a7a',
  giFar: '#222a5c',
  giLight: '#4b58a8',
  skin: '#f6c59c',
  band: '#ff2e55',
  bandDark: '#b3123a',
  belt: '#ff2e55',
  beltDark: '#b3123a',
  wrap: '#e4e7f5',
  hand: '#e4e7f5',
  shoe: '#14162b',
  sole: '#f5f5f5',
  ply: '#ffb703',
  grip: '#25252f',
  truck: '#a3abc4',
  wheel: '#ffe066',
  pulse: '#3de1ff',
};

// Bottom of the deck: one colour or a two-colour fade, plus an optional
// sticker ('none', 'shuriken', or an emoji).
const BOTTOM = { mode: 'gradient', c1: '#00c2d1', c2: '#ff2e7e', sticker: 'shuriken' };
// 'skate' rolls on trucks and wheels; 'hover' floats on pulses of light.
let boardType = 'skate';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Mixes a #rrggbb colour toward white (amt > 0) or black (amt < 0).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255;
  const a = Math.abs(amt);
  const ch = (v) => Math.round(v + (target - v) * a);
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// Applies the player's chosen look (see Customizer.js). Shades for the far
// limbs, gi highlight and band undersides are derived from the picked colours.
export function setLook(look) {
  C.gi = look.gi;
  C.giFar = shade(look.gi, -0.28);
  C.giLight = shade(look.gi, 0.2);
  C.band = look.band;
  C.bandDark = shade(look.band, -0.3);
  C.belt = look.belt;
  C.beltDark = shade(look.belt, -0.3);
  C.shoe = look.shoe;
  C.hand = look.hand;
  C.wheel = look.wheel;
  C.pulse = look.pulse;
  boardType = look.boardType;
  C.ply = look.side;
  C.grip = look.top;
  BOTTOM.mode = look.bottomMode;
  BOTTOM.c1 = look.bottom1;
  BOTTOM.c2 = look.bottom2;
  BOTTOM.sticker = look.sticker;
}

const THIGH = 17, SHIN = 17, TORSO = 24, UPPER = 15, FORE = 14;
const BOARD_Y = -13; // board centre above the wheels' contact point

const J = { jx: 0, jy: 0, ex: 0, ey: 0 };

// Two-bone IK: from root (ax, ay) toward target (tx, ty). bend = ±1 picks the
// side the joint bulges to. Writes joint (jx, jy) and reached end (ex, ey).
function solveIK(ax, ay, tx, ty, l1, l2, bend, out) {
  let dx = tx - ax;
  let dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < 0.001) d = 0.001;
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = base + bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  out.jx = ax + Math.cos(a) * l1;
  out.jy = ay + Math.sin(a) * l1;
  out.ex = ax + dx;
  out.ey = ay + dy;
  return out;
}

function limb(ctx, ax, ay, bx, by, cx, cy, width, color) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = C.out;
  ctx.lineWidth = width + 3.5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = C.out;
  ctx.stroke();
}

function shoe(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(1.5, -1.5, 6.5, 3.6, 0, 0, TAU);
  ctx.fillStyle = C.shoe;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = C.out;
  ctx.stroke();
  ctx.fillStyle = C.sole;
  ctx.fillRect(-4.5, 1, 12, 1.4);
  ctx.restore();
}

function roundedBar(ctx, x0, x1, hh) {
  const r = Math.min(hh, 8);
  ctx.beginPath();
  ctx.moveTo(x0 + r, -hh);
  ctx.lineTo(x1 - r, -hh);
  ctx.quadraticCurveTo(x1, -hh, x1, -hh + r);
  ctx.lineTo(x1, hh - r);
  ctx.quadraticCurveTo(x1, hh, x1 - r, hh);
  ctx.lineTo(x0 + r, hh);
  ctx.quadraticCurveTo(x0, hh, x0, hh - r);
  ctx.lineTo(x0, -hh + r);
  ctx.quadraticCurveTo(x0, -hh, x0 + r, -hh);
  ctx.closePath();
}

function shuriken(ctx, s, color) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = i % 2 === 0 ? s : s * 0.35;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function sticker(ctx, glyph, size) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(glyph, 0, size * 0.06);
}

// Hoverboard underside: emitter pods where the trucks would be, a soft glow,
// and rings of light pulsing away from the bottom face. c is the kickflip
// cosine: 1 upright (rings go down), -1 upside down, ~0 seen face-on.
function hoverPulse(ctx, c, time) {
  const ac = Math.abs(c);
  const face = 1 - ac; // face-on, the rings ring the deck instead of covering it
  ctx.save();

  ctx.save();
  ctx.translate(0, c * 8);
  ctx.scale(1, 0.3 + face * 0.5);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
  glow.addColorStop(0, C.pulse);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = (0.5 + Math.sin(time * 9) * 0.12) * (0.25 + ac * 0.75);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = C.pulse;
  for (let i = 0; i < 3; i++) {
    const p = (time * 1.8 + i / 3) % 1;
    ctx.globalAlpha = (1 - p) * 0.9;
    ctx.lineWidth = 1.2 + (1 - p) * 2;
    ctx.beginPath();
    ctx.ellipse(0, c * (3 + p * 9), 14 + p * 20 + face * 12, 1.5 + p * 3 + face * (7 + p * 4), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  const podY = c * 3.4;
  const podH = 1.4 + ac * 1.4;
  for (const x of [-20, 20]) {
    ctx.beginPath();
    ctx.ellipse(x, podY, 6.5, podH + 0.6, 0, 0, TAU);
    ctx.fillStyle = C.out;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, podY, 4.6, podH * 0.6, 0, 0, TAU);
    ctx.globalAlpha = 0.75 + Math.sin(time * 18 + x) * 0.25;
    ctx.fillStyle = C.pulse;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Board in its own frame: centre of the deck, x toward the nose, y down.
// flipTurns rotates around the long axis (kickflip), shoveTurns around the
// vertical axis (shove-it); both are faked with scaling in 2D. time drives
// the hoverboard's pulse.
export function drawBoard(ctx, flipTurns = 0, shoveTurns = 0, time = 0) {
  const fa = flipTurns * TAU;
  let sx = Math.cos(shoveTurns * TAU);
  if (Math.abs(sx) < 0.08) sx = sx < 0 ? -0.08 : 0.08;
  const s = Math.sin(fa);
  const c = Math.cos(fa);
  const wheelY = 8.5 * c;
  const faceShown = Math.abs(s) > 0.3;
  const bottomShown = faceShown && s > 0;

  ctx.save();
  ctx.scale(sx, 1);

  const wheels = () => {
    if (boardType === 'hover') {
      hoverPulse(ctx, c, time);
      return;
    }
    ctx.fillStyle = C.truck;
    const top = Math.min(0, wheelY);
    const h = Math.abs(wheelY);
    ctx.fillRect(-23, top, 6, h);
    ctx.fillRect(17, top, 6, h);
    dot(ctx, -20, wheelY, 4.4, C.wheel);
    dot(ctx, 20, wheelY, 4.4, C.wheel);
  };

  if (!bottomShown) wheels();

  if (!faceShown && boardType === 'hover') {
    // Edge-on hoverboard: a flat slab with a light strip down its side.
    ctx.save();
    if (c < 0) ctx.scale(1, -1);
    roundedBar(ctx, -34, 34, 2.6);
    ctx.fillStyle = C.ply;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.out;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-31, -2.3);
    ctx.lineTo(31, -2.3);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = C.grip;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-25, 0.4);
    ctx.lineTo(25, 0.4);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = C.pulse;
    ctx.stroke();
    ctx.restore();
  } else if (!faceShown) {
    // Edge-on profile with kicked nose and tail (mirrored when upside down).
    ctx.save();
    if (c < 0) ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(-35, -5);
    ctx.quadraticCurveTo(-31, 1.2, -24, 1.6);
    ctx.lineTo(24, 1.6);
    ctx.quadraticCurveTo(31, 1.2, 35, -5);
    ctx.lineTo(33.5, -6.5);
    ctx.quadraticCurveTo(30, -1.8, 24, -1.6);
    ctx.lineTo(-24, -1.6);
    ctx.quadraticCurveTo(-30, -1.8, -33.5, -6.5);
    ctx.closePath();
    ctx.fillStyle = C.ply;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.out;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-32, -5.6);
    ctx.quadraticCurveTo(-29, -1.8, -24, -1.6);
    ctx.lineTo(24, -1.6);
    ctx.quadraticCurveTo(29, -1.8, 32, -5.6);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = C.grip;
    ctx.stroke();
    ctx.restore();
  } else {
    const hh = Math.max(2.5, 10 * Math.abs(s));
    roundedBar(ctx, -34, 34, hh);
    if (bottomShown && BOTTOM.mode === 'gradient') {
      const grad = ctx.createLinearGradient(-34, 0, 34, 0);
      grad.addColorStop(0, BOTTOM.c1);
      grad.addColorStop(1, BOTTOM.c2);
      ctx.fillStyle = grad;
    } else if (bottomShown) {
      ctx.fillStyle = BOTTOM.c1;
    } else {
      ctx.fillStyle = C.grip;
    }
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = C.out;
    ctx.stroke();
    if (bottomShown && BOTTOM.sticker !== 'none') {
      ctx.save();
      ctx.scale(1, Math.abs(s));
      if (BOTTOM.sticker === 'shuriken') shuriken(ctx, 8, '#ffe066');
      else sticker(ctx, BOTTOM.sticker, 15);
      ctx.restore();
    }
  }

  if (bottomShown) wheels();
  ctx.restore();
}

// Smoothly blends between poses (rolling, air, grab, grind...) every frame.
// Thrown ninja star at (x, y) in canvas coords, with a short motion streak.
export function drawShuriken(ctx, x, y, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = C.wrap;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-30, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    const b = a + TAU / 8;
    ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
    ctx.lineTo(Math.cos(b) * 3.4, Math.sin(b) * 3.4);
  }
  ctx.closePath();
  ctx.fillStyle = '#cfd5e6';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = C.out;
  ctx.stroke();
  dot(ctx, 0, 0, 2.4, C.band);
  ctx.restore();
}

export class NinjaAnimator {
  constructor() {
    this.reset();
  }

  reset() {
    this.hipH = 32;
    this.lean = 0.16;
    this.lift = 0;
    this.tilt = 0;
    this.shift = 0;
    this.footLift = 0;
    this.hfx = 12; this.hfy = 22;
    this.hbx = -10; this.hby = 21;
    this.grabBlend = 0;
    this.grabHand = 'B';
    this.grabPoint = 0;
    this.flipTurns = 0;
    this.shoveTurns = 0;
    this.spinTurns = 0;
  }

  update(dt, player, tricks, time) {
    let hipH = 32, lean = 0.16, lift = 0, tilt = 0, shift = 0, footLift = 0;
    let hfx = 12, hfy = 22, hbx = -10, hby = 21, grab = 0;

    switch (player.state) {
      case 'grounded':
      case 'recovering':
        hipH = 32 + Math.sin(time * 5) * 1.2 - player.landSquash * 12;
        hfx = 13 + Math.sin(time * 5) * 2; hfy = 21;
        hbx = -11; hby = 20;
        break;
      case 'airborne':
        hipH = 25; lean = 0.1;
        hfx = 18; hfy = -4; hbx = -20; hby = 2;
        break;
      case 'grinding':
        hipH = 27 - player.landSquash * 8; lean = 0.06;
        hfx = 23 + Math.sin(time * 9) * 2; hfy = 1;
        hbx = -24; hby = -3 + Math.sin(time * 9 + 1) * 2;
        break;
    }

    if (player.popTimer > 0) tilt = -0.45 * (player.popTimer / 0.18);

    if (player.state === 'airborne') {
      if (tricks.flip.def) {
        footLift = Math.sin(tricks.flipProgress * Math.PI) * 12;
        hipH -= 2; hfy -= 6; hby -= 6;
      }
      const g = tricks.grab;
      if (g.phase !== 'none' && g.def) {
        lift = 18; hipH = 12;
        tilt = g.def.tilt;
        shift = g.def.shift;
        lean = g.def.lean;
        grab = g.phase === 'release' ? 0 : 1;
        this.grabHand = g.def.hand;
        this.grabPoint = g.def.point;
        if (g.def.hand === 'F') { hbx = -22; hby = -10; } else { hfx = 20; hfy = -12; }
      }
      // Backflip: tuck tight while the whole body turns.
      if (tricks.spin.def) {
        hipH = 18; lean = 0.55;
        hfx = 12; hfy = 12; hbx = -2; hby = 14;
      }
      const sp = tricks.spinProgress;
      this.spinTurns = tricks.spin.def ? sp * sp * (3 - 2 * sp) : 0;
      const fd = tricks.flip.def;
      const p = tricks.flipProgress;
      const eased = p * p * (3 - 2 * p);
      this.flipTurns = fd ? fd.flip * eased : 0;
      this.shoveTurns = fd ? fd.shove * eased : 0;
    } else {
      this.flipTurns = 0;
      this.shoveTurns = 0;
      this.spinTurns = 0;
    }

    // Star throw: front arm snaps straight forward.
    if (player.throwTimer > 0 && player.state !== 'wipeout') { hfx = 26; hfy = -4; }

    const k = 1 - Math.exp(-dt * 16);
    const kg = 1 - Math.exp(-dt * 26);
    this.hipH += (hipH - this.hipH) * k;
    this.lean += (lean - this.lean) * k;
    this.lift += (lift - this.lift) * kg;
    this.tilt += (tilt - this.tilt) * kg;
    this.shift += (shift - this.shift) * kg;
    this.footLift += (footLift - this.footLift) * kg;
    this.hfx += (hfx - this.hfx) * k; this.hfy += (hfy - this.hfy) * k;
    this.hbx += (hbx - this.hbx) * k; this.hby += (hby - this.hby) * k;
    this.grabBlend += (grab - this.grabBlend) * kg;
  }

  // Draws at world position (x, y up) with the skater's pitch angle.
  draw(ctx, player, x, y, time, speedNorm) {
    ctx.save();
    ctx.translate(x, -y);
    if (player.state === 'wipeout') {
      this.drawTumble(ctx, player.tumble, time);
      ctx.restore();
      return;
    }
    ctx.rotate(-player.angle);
    // Backflip: the whole skater turns backward around their middle.
    if (this.spinTurns) {
      ctx.translate(0, -40);
      ctx.rotate(-this.spinTurns * TAU);
      ctx.translate(0, 40);
    }
    if (player.invuln > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.45;

    const cosT = Math.cos(this.tilt);
    const sinT = Math.sin(this.tilt);
    const bx = this.shift;
    const by = BOARD_Y - this.lift;
    const toX = (lx, ly) => bx + lx * cosT - ly * sinT;
    const toY = (lx, ly) => by + lx * sinT + ly * cosT;

    // Feet sit on the deck (in board space), lifting off during flips.
    const fy = -4.5 - this.footLift;
    const fbX = toX(-15, fy), fbY = toY(-15, fy);
    const ffX = toX(13, fy), ffY = toY(13, fy);

    const hipX = -1;
    const hipY = by - 2 - this.hipH;
    const sl = Math.sin(this.lean), cl = Math.cos(this.lean);
    const neckX = hipX + sl * TORSO, neckY = hipY - cl * TORSO;
    const shX = hipX + sl * TORSO * 0.82, shY = hipY - cl * TORSO * 0.82;
    const headX = neckX + sl * 11 + 1, headY = neckY - cl * 11;

    // Hand targets, pulled onto the board when grabbing.
    let hfX = shX + this.hfx, hfY = shY + this.hfy;
    let hbX = shX + this.hbx, hbY = shY + this.hby;
    if (this.grabBlend > 0.01) {
      const gx = toX(this.grabPoint, -1), gy = toY(this.grabPoint, -1);
      if (this.grabHand === 'F') {
        hfX += (gx - hfX) * this.grabBlend; hfY += (gy - hfY) * this.grabBlend;
      } else {
        hbX += (gx - hbX) * this.grabBlend; hbY += (gy - hbY) * this.grabBlend;
      }
    }

    // Back arm (behind everything)
    solveIK(shX - 2, shY, hbX, hbY, UPPER, FORE, 1, J);
    limb(ctx, shX - 2, shY, J.jx, J.jy, J.ex, J.ey, 6, C.giFar);
    dot(ctx, J.ex, J.ey, 3.4, C.hand);

    // Board
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(this.tilt);
    drawBoard(ctx, this.flipTurns, this.shoveTurns, time);
    ctx.restore();

    // Back leg
    solveIK(hipX - 3, hipY, fbX, fbY, THIGH, SHIN, -1, J);
    limb(ctx, hipX - 3, hipY, J.jx, J.jy, J.ex, J.ey, 8, C.giFar);
    shoe(ctx, J.ex, J.ey, this.tilt);

    // Headband tails stream behind the head.
    const knotX = headX - 9, knotY = headY - 4;
    const wave = Math.sin(time * 16);
    const stretch = 18 + speedNorm * 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.band;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(knotX, knotY);
    ctx.quadraticCurveTo(knotX - stretch * 0.5, knotY + wave * 4, knotX - stretch, knotY + 3 + Math.sin(time * 16 + 1.4) * 5);
    ctx.stroke();
    ctx.strokeStyle = C.bandDark;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(knotX, knotY + 1);
    ctx.quadraticCurveTo(knotX - stretch * 0.4, knotY + 6 + wave * 3, knotX - stretch * 0.85, knotY + 9 + Math.sin(time * 16 + 2.6) * 4);
    ctx.stroke();

    // Torso with belt
    limb(ctx, hipX, hipY, (hipX + neckX) / 2, (hipY + neckY) / 2, neckX, neckY, 15, C.gi);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.giLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(neckX - 3, neckY + 2);
    ctx.lineTo(neckX + sl * -8 + 2, neckY + 9);
    ctx.stroke();
    ctx.save();
    ctx.translate(hipX + sl * 3, hipY - cl * 3);
    ctx.rotate(this.lean);
    ctx.fillStyle = C.belt;
    ctx.fillRect(-8.5, -2.4, 17, 4.8);
    ctx.fillStyle = C.beltDark;
    ctx.fillRect(-9.5, 1.5, 4, 5.5);
    ctx.restore();

    this.drawHead(ctx, headX, headY, this.lean * 0.4);

    // Front leg
    solveIK(hipX + 3, hipY, ffX, ffY, THIGH, SHIN, -1, J);
    limb(ctx, hipX + 3, hipY, J.jx, J.jy, J.ex, J.ey, 8, C.gi);
    shoe(ctx, J.ex, J.ey, this.tilt);

    // Front arm
    solveIK(shX + 2, shY, hfX, hfY, UPPER, FORE, 1, J);
    limb(ctx, shX + 2, shY, J.jx, J.jy, J.ex, J.ey, 6.5, C.gi);
    dot(ctx, J.ex, J.ey, 3.6, C.hand);

    ctx.restore();
  }

  drawHead(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // hood
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, TAU);
    ctx.fillStyle = C.gi;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.out;
    ctx.stroke();
    // eye slit
    ctx.beginPath();
    ctx.moveTo(-1, -4.2);
    ctx.lineTo(10.2, -4.2);
    ctx.quadraticCurveTo(11.4, -1, 10.2, 1.8);
    ctx.lineTo(-1, 1.8);
    ctx.closePath();
    ctx.fillStyle = C.skin;
    ctx.fill();
    // eye + determined brow
    ctx.beginPath();
    ctx.ellipse(6.3, -1.2, 2.5, 1.9, 0, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7.2, -1.1, 1.15, 0, TAU);
    ctx.fillStyle = C.out;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3.2, -4.6);
    ctx.lineTo(9.6, -3.2);
    ctx.stroke();
    // headband
    ctx.beginPath();
    ctx.arc(0, 0, 10.6, Math.PI * 1.08, Math.PI * 1.62);
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = C.band;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-9, -4, 2.6, 0, TAU);
    ctx.fillStyle = C.band;
    ctx.fill();
    ctx.restore();
  }

  // Wipeout: limbs flail while the body spins.
  drawTumble(ctx, spin, time) {
    ctx.save();
    ctx.translate(0, -26);
    ctx.rotate(-spin);
    const flail = Math.sin(time * 20) * 4;
    const hipX = 0, hipY = 6, neckX = 0, neckY = -18;
    solveIK(-2, -14, -20, -30 + flail, UPPER, FORE, 1, J);
    limb(ctx, -2, -14, J.jx, J.jy, J.ex, J.ey, 6, C.giFar);
    dot(ctx, J.ex, J.ey, 3.4, C.hand);
    solveIK(hipX - 3, hipY, -18, 26 - flail, THIGH, SHIN, -1, J);
    limb(ctx, hipX - 3, hipY, J.jx, J.jy, J.ex, J.ey, 8, C.giFar);
    shoe(ctx, J.ex, J.ey, 0.4);
    limb(ctx, hipX, hipY, 0, -6, neckX, neckY, 15, C.gi);
    ctx.fillStyle = C.belt;
    ctx.fillRect(-8.5, 1, 17, 4.8);
    this.drawHead(ctx, 1, -29, 0.3);
    solveIK(hipX + 3, hipY, 20, 22 + flail, THIGH, SHIN, -1, J);
    limb(ctx, hipX + 3, hipY, J.jx, J.jy, J.ex, J.ey, 8, C.gi);
    shoe(ctx, J.ex, J.ey, -0.3);
    solveIK(2, -14, 22, -28 - flail, UPPER, FORE, 1, J);
    limb(ctx, 2, -14, J.jx, J.jy, J.ex, J.ey, 6.5, C.gi);
    dot(ctx, J.ex, J.ey, 3.6, C.hand);
    ctx.restore();
  }
}
