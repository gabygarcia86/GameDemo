/**
 * Formation layouts. A formation is a set of slots (offsets from its center)
 * that sway side to side and "breathe" once every ship has arrived.
 */
import { CONFIG, WORLD } from './config.js';

const { W } = WORLD;

/** Turns a wave definition into slot offsets, ordered top row first. */
export function buildSlots(def) {
  const F = CONFIG.formation;
  const rows = def.rows;
  const maxCount = Math.max(...rows);
  const halfWidth = ((maxCount - 1) / 2) * F.spacingX;
  const rowGap = def.layout === 'staggered' ? F.spacingY * 0.9 : F.spacingY;
  const slots = [];

  rows.forEach((count, r) => {
    const type = def.types[Math.min(r, def.types.length - 1)];
    for (let c = 0; c < count; c++) {
      const ox = (c - (count - 1) / 2) * F.spacingX;
      let oy = r * rowGap;
      switch (def.layout) {
        case 'v':
          oy += (halfWidth - Math.abs(ox)) * 0.28; // tip of the V points at the player
          break;
        case 'arc':
          oy += ox * ox * 0.0012; // sweeping crescent
          break;
        case 'diamond':
          oy *= 0.92;
          break;
      }
      slots.push({ ox, oy, type, row: r, col: c, x: W / 2 + ox, y: 0, enemy: null });
    }
  });
  return slots;
}

export class Formation {
  constructor(def) {
    this.top = def.top ?? (def.boss ? CONFIG.formation.bossTop : CONFIG.formation.top);
    this.slots = buildSlots(def);
    this.t = 0;
    this.swayAmt = 0;
    this.breatheAmt = 0;
    this.update(0, false);
  }

  update(dt, settled) {
    const F = CONFIG.formation;
    this.t += dt;
    this.swayAmt = Math.min(1, this.swayAmt + dt * 0.5);
    this.breatheAmt += ((settled ? 1 : 0) - this.breatheAmt) * Math.min(1, dt * 1.5);
    const cx = W / 2 + Math.sin(this.t * F.swaySpeed) * F.sway * this.swayAmt;
    const b = Math.sin(this.t * F.breatheSpeed) * F.breathe * this.breatheAmt;
    const sx = 1 + b;
    const sy = 1 + b * 0.6;
    for (const s of this.slots) {
      s.x = cx + s.ox * sx;
      s.y = this.top + s.oy * sy;
    }
  }
}
