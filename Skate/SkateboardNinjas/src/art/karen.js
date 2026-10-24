// Angry pedestrian and shopping cart art. Origin at the feet, y down,
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

export function drawCart(ctx, c) {
  ctx.save();
  ctx.lineJoin = 'round';
  // wheels
  for (const wx of [-20, 18]) {
    ctx.save();
    ctx.translate(wx, -5);
    ctx.rotate(-c.spin);
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fillStyle = '#2b2b38';
    ctx.fill();
    ctx.fillStyle = '#9aa0b8';
    ctx.fillRect(-1, -4, 2, 8);
    ctx.restore();
  }
  // frame
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-20, -5); ctx.lineTo(-22, -16); ctx.moveTo(18, -5); ctx.lineTo(22, -16);
  ctx.moveTo(28, -46); ctx.lineTo(37, -55);
  ctx.stroke();
  // basket
  ctx.beginPath();
  ctx.moveTo(-29, -46);
  ctx.lineTo(29, -46);
  ctx.lineTo(23, -16);
  ctx.lineTo(-23, -16);
  ctx.closePath();
  ctx.fillStyle = 'rgba(190, 200, 225, 0.35)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c6cde3';
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = -29 + (58 * i) / 6;
    ctx.moveTo(x, -46);
    ctx.lineTo(x * 0.8, -16);
  }
  ctx.moveTo(-27, -36); ctx.lineTo(27, -36);
  ctx.moveTo(-25, -26); ctx.lineTo(25, -26);
  ctx.stroke();
  // handle
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ff3d7f';
  ctx.beginPath();
  ctx.moveTo(34, -52); ctx.lineTo(40, -58);
  ctx.stroke();
  // groceries poking out
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-14, -54, 8, 10);
  ctx.fillStyle = '#4dff9a';
  ctx.beginPath(); ctx.arc(4, -48, 6, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(12, -52, 6, 8);
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
