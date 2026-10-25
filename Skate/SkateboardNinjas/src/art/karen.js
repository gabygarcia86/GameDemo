// Angry pedestrian and evil ninja art. Origin at the feet, y down,
// facing left (toward the oncoming skater).

const TAU = Math.PI * 2;
const OUT = '#1b1030';

function stroke2(ctx, width, color) {
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

export function drawKaren(ctx, k, time) {
  const t = k.anim;
  const running = k.state === 'run' && !k.hit;
  const stepping = k.state === 'step' || k.state === 'warn';
  const mad = k.hit;

  ctx.save();
  if (running) ctx.rotate(-0.14);
  if (mad) ctx.rotate(Math.sin(t * 30) * 0.05);

  // Legs
  const swing = running ? Math.sin(t * 16) * 9 : stepping ? Math.sin(t * 10) * 5 : 0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3, -36);
  ctx.lineTo(4 - swing, -1);
  stroke2(ctx, 6, '#bfa274');
  ctx.beginPath();
  ctx.moveTo(-3, -36);
  ctx.lineTo(-4 + swing, -1);
  stroke2(ctx, 6, '#d3b886');
  ctx.fillStyle = '#7a3b2e';
  ctx.beginPath(); ctx.ellipse(2 - swing, -1.5, 6, 3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-6 + swing, -1.5, 6, 3, 0, 0, TAU); ctx.fill();

  // Purse (back)
  ctx.fillStyle = '#a0522d';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(8, -46, 12, 10, 2) : ctx.rect(8, -46, 12, 10);
  ctx.fill();
  ctx.stroke();

  // Cardigan body
  ctx.beginPath();
  ctx.moveTo(-13, -34);
  ctx.lineTo(-11, -62);
  ctx.quadraticCurveTo(0, -67, 11, -62);
  ctx.lineTo(13, -34);
  ctx.closePath();
  ctx.fillStyle = mad ? '#ff6b6b' : '#36c0ae';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, -63);
  ctx.lineTo(-1, -52);
  ctx.lineTo(3, -63);
  ctx.fillStyle = '#fff3e8';
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(-9, -48, 1.4, 0, TAU); ctx.arc(-9, -42, 1.4, 0, TAU); ctx.fill();

  // Back arm holding a phone up, recording
  ctx.beginPath();
  ctx.moveTo(6, -60);
  ctx.lineTo(4, -48);
  ctx.lineTo(-6, -54);
  stroke2(ctx, 5, '#2aa596');
  ctx.fillStyle = '#222';
  ctx.fillRect(-11, -61, 5, 9);
  ctx.fillStyle = '#7fd6ff';
  ctx.fillRect(-10, -60, 3, 6);

  // Head
  const hx = -2, hy = -75;
  ctx.beginPath();
  ctx.arc(hx, hy, 10, 0, TAU);
  ctx.fillStyle = mad ? '#ff9a8a' : '#f7c6a3';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // Nose
  ctx.beginPath();
  ctx.moveTo(-11.5, -77);
  ctx.lineTo(-14, -73);
  ctx.lineTo(-11, -72.5);
  ctx.fillStyle = '#f0b28c';
  ctx.fill();
  // Angry eye + brow (inner end low)
  ctx.fillStyle = OUT;
  ctx.beginPath(); ctx.arc(-7, -76, 1.5, 0, TAU); ctx.fill();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10.5, -78.5);
  ctx.lineTo(-3.5, -81.5);
  ctx.stroke();
  // Yelling mouth
  const open = 2 + Math.abs(Math.sin(t * (k.shout > 0 ? 14 : 3))) * 2.5;
  ctx.beginPath();
  ctx.ellipse(-8.5, -69, 3, open, 0, 0, TAU);
  ctx.fillStyle = '#5a1020';
  ctx.fill();
  // Earring
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(1, -69, 1.5, 0, TAU); ctx.fill();

  // The haircut: short stacked back, long angled front.
  ctx.beginPath();
  ctx.moveTo(-14, -66);
  ctx.quadraticCurveTo(-17, -80, -8, -87);
  ctx.quadraticCurveTo(2, -92, 10, -86);
  ctx.lineTo(17, -87);
  ctx.lineTo(12, -81);
  ctx.lineTo(18, -79);
  ctx.lineTo(11, -74);
  ctx.lineTo(15, -70);
  ctx.lineTo(6, -70);
  ctx.quadraticCurveTo(1, -77, -5, -79);
  ctx.quadraticCurveTo(-11, -77, -14, -66);
  ctx.closePath();
  ctx.fillStyle = '#f4d35e';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.strokeStyle = '#fff1a8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-9, -84);
  ctx.quadraticCurveTo(-2, -88, 6, -86);
  ctx.stroke();
  // Sunglasses parked on top
  ctx.fillStyle = '#20202a';
  ctx.beginPath();
  ctx.ellipse(-6, -88, 3.6, 2, -0.1, 0, TAU);
  ctx.ellipse(2, -89.5, 3.6, 2, -0.1, 0, TAU);
  ctx.fill();

  // Front arm: wagging finger (or both fists when mad)
  const wag = Math.sin(t * (k.shout > 0 ? 18 : 7)) * 4;
  const handX = running ? -20 : -21 + wag * 0.4;
  const handY = running ? -54 + Math.sin(t * 16) * 6 : -78 + Math.abs(wag) * 0.5;
  ctx.beginPath();
  ctx.moveTo(-8, -60);
  ctx.lineTo(-17, -62);
  ctx.lineTo(handX, handY);
  stroke2(ctx, 5, '#36c0ae');
  ctx.beginPath();
  ctx.arc(handX, handY, 3.2, 0, TAU);
  ctx.fillStyle = '#f7c6a3';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  if (!running) {
    ctx.beginPath();
    ctx.moveTo(handX, handY - 2);
    ctx.lineTo(handX + wag * 0.5, handY - 9);
    ctx.lineCap = 'round';
    stroke2(ctx, 2.2, '#f7c6a3');
  }

  // Steam when furious
  if (mad || k.shout > 0) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const p = (time * 1.6 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(8 + i * 3 + p * 6, -92 - p * 18, 2 + p * 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

const RED = {
  gi: '#d62839',
  giDark: '#9c1a2b',
  giLight: '#ff6170',
  hood: '#1c0c16',
  slit: '#3a1420',
  eye: '#ffe14d',
  blade: '#e9edf7',
  steel: '#8e97ad',
};

function ninjaLeg(ctx, hx, hy, kx, ky, fx, fy, color) {
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(kx, ky);
  ctx.lineTo(fx, fy);
  stroke2(ctx, 7, color);
  ctx.fillStyle = RED.hood;
  ctx.beginPath();
  ctx.ellipse(fx - 2, fy + 0.5, 6, 3, 0, 0, TAU);
  ctx.fill();
}

// Evil ninja: red gi, black hood, glowing eyes, three claws on the front hand.
// Crouched and flexing his claws while he waits, head thrown back while he
// laughs, claws thrust forward mid-leap.
export function drawEvilNinja(ctx, k, time) {
  const t = k.anim;
  const leaping = k.state === 'leap' && !k.hit;
  const laughing = (k.shout > 0 || k.hit) && !leaping;
  const flap = Math.sin(time * 9 + t) * 3;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (leaping) ctx.rotate(-0.3 * Math.sin(Math.PI * k.timer));

  // Legs: low wide stance, or tucked mid-leap
  if (leaping) {
    ninjaLeg(ctx, 4, -36, 12, -26, 4, -16, RED.giDark);
    ninjaLeg(ctx, -4, -36, -14, -32, -16, -18, RED.gi);
  } else {
    ninjaLeg(ctx, 4, -34, 13, -18, 15, -2, RED.giDark);
    ninjaLeg(ctx, -4, -34, -12, -19, -15, -2, RED.gi);
  }

  // Upper body shakes with laughter
  const bounce = laughing ? -Math.abs(Math.sin(t * 22)) * 2.5 : Math.sin(t * 3) * 0.8;
  ctx.translate(0, bounce);

  // Back arm: fist on the hip
  ctx.beginPath();
  ctx.moveTo(7, -58);
  ctx.lineTo(14, -48);
  ctx.lineTo(8, -40);
  stroke2(ctx, 5.5, RED.giDark);

  // Sash tails trailing behind
  ctx.beginPath();
  ctx.moveTo(8, -37);
  ctx.quadraticCurveTo(16, -36 + flap, 24, -30 + flap);
  stroke2(ctx, 3, RED.hood);

  // Torso
  ctx.beginPath();
  ctx.moveTo(-12, -62);
  ctx.lineTo(11, -62);
  ctx.lineTo(10, -34);
  ctx.lineTo(-10, -34);
  ctx.closePath();
  ctx.fillStyle = RED.gi;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, -61);
  ctx.lineTo(3, -42);
  ctx.lineWidth = 2;
  ctx.strokeStyle = RED.giDark;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-11, -58);
  ctx.lineTo(-10, -44);
  ctx.strokeStyle = RED.giLight;
  ctx.stroke();
  ctx.fillStyle = RED.hood;
  ctx.fillRect(-10.5, -40, 21, 5);

  // Head (thrown back while laughing)
  ctx.save();
  ctx.translate(-1, -73);
  if (laughing) ctx.rotate(0.25 + Math.sin(t * 22) * 0.05);
  // Hood tails
  ctx.beginPath();
  ctx.moveTo(8, -4);
  ctx.quadraticCurveTo(16, -6 + flap, 22, -2 + flap);
  stroke2(ctx, 3, RED.gi);
  ctx.beginPath();
  ctx.moveTo(8, -3);
  ctx.quadraticCurveTo(15, 1 + flap * 0.6, 20, 5 + flap * 0.6);
  stroke2(ctx, 3, RED.gi);
  // Hood
  ctx.beginPath();
  ctx.arc(0, 0, 10.5, 0, TAU);
  ctx.fillStyle = RED.hood;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // Red headband
  ctx.beginPath();
  ctx.moveTo(-9.5, -5.5);
  ctx.lineTo(9, -6.5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = RED.gi;
  ctx.stroke();
  // Eye slit and glowing eyes (squeezed into evil arcs while laughing)
  ctx.fillStyle = RED.slit;
  ctx.fillRect(-11, -2.5, 12, 5);
  ctx.save();
  ctx.shadowColor = RED.eye;
  ctx.shadowBlur = 6;
  if (laughing) {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = RED.eye;
    ctx.beginPath();
    ctx.moveTo(-10, 1); ctx.lineTo(-8, -1); ctx.lineTo(-6, 1);
    ctx.moveTo(-5, 0.5); ctx.lineTo(-3, -1.5); ctx.lineTo(-1, 0.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = RED.eye;
    ctx.beginPath();
    ctx.ellipse(-7.5, 0.3, 2.6, 1.3, 0.35, 0, TAU);
    ctx.ellipse(-2.8, -0.2, 2.2, 1.2, -0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // Brow ridge, angled down toward the nose
  ctx.beginPath();
  ctx.moveTo(-11, -4.5);
  ctx.lineTo(-5, -2.5);
  ctx.lineTo(1, -4);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // Cackling mouth
  if (laughing) {
    const open = 1.5 + Math.abs(Math.sin(t * 22)) * 2.5;
    ctx.beginPath();
    ctx.ellipse(-6.5, 6, 3.4, open, 0, 0, TAU);
    ctx.fillStyle = '#b8163a';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-9.5, 6 - open, 6, 1.4);
  }
  ctx.restore();

  // Front arm with the three-claw gauntlet
  let ex, ey, hx, hy, aim;
  if (leaping) {
    ex = -19; ey = -57; hx = -30; hy = -58; aim = Math.PI + 0.15;
  } else if (laughing) {
    ex = -19; ey = -66; hx = -21; hy = -81; aim = -Math.PI / 2 - 0.5;
  } else {
    const flex = Math.sin(t * 4) * 1.5;
    ex = -17; ey = -54; hx = -24; hy = -66 + flex; aim = Math.PI + 0.6;
  }
  ctx.beginPath();
  ctx.moveTo(-8, -59);
  ctx.lineTo(ex, ey);
  ctx.lineTo(hx, hy);
  stroke2(ctx, 5.5, RED.gi);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(aim);
  for (let i = -1; i <= 1; i++) {
    ctx.save();
    ctx.translate(0, i * 2.6);
    ctx.rotate(i * 0.16);
    ctx.beginPath();
    ctx.moveTo(2, -1.4);
    ctx.quadraticCurveTo(12, -2.4, 19, 1);
    ctx.lineTo(2, 1.4);
    ctx.closePath();
    ctx.fillStyle = RED.blade;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.restore();
  }
  // Gauntlet bar and fist
  ctx.fillStyle = RED.steel;
  ctx.fillRect(0.5, -5, 3, 10);
  ctx.beginPath();
  ctx.arc(-1, 0, 3.8, 0, TAU);
  ctx.fillStyle = RED.hood;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // Glint along the middle claw now and then
  if ((time * 1.3 + t) % 2 < 0.18) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(19, -3); ctx.lineTo(20, 0); ctx.lineTo(23, 1); ctx.lineTo(20, 2);
    ctx.lineTo(19, 5); ctx.lineTo(18, 2); ctx.lineTo(15, 1); ctx.lineTo(18, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// "!" warning badge
export function drawWarning(ctx, x, y, pulse) {
  const s = 1 + pulse * 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(12, 9);
  ctx.lineTo(-12, 9);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = OUT;
  ctx.fillRect(-1.6, -6, 3.2, 9);
  ctx.fillRect(-1.6, 4.5, 3.2, 3);
  ctx.restore();
}
