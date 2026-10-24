// Automatic grinding: a rail is caught when the board's trucks pass down
// through the rail's top edge while the skater is over it. Rails are
// pass-through otherwise (they sit at the side of the lane), so missing one
// just means rolling past it.

import { CONFIG } from './config.js';

const CONTACT = CONFIG.physics.railContact;

export class GrindSystem {
  constructor(world) {
    this.world = world;
  }

  findEntry(player, now) {
    const contact = player.y + CONTACT;
    const prevContact = player.prevY + CONTACT;
    for (const r of this.world.rails) {
      if (r.x - 6 > player.x) break; // rails are generated in x order
      if (player.x > r.x + r.len - 12) continue;
      if (now < r.lockUntil) continue;
      if (prevContact >= r.h - 2 && contact <= r.h + 3) return r;
    }
    return null;
  }

  // Grind points accrue continuously while on the rail.
  update(player, dt, scoring) {
    if (player.state !== 'grinding') return;
    scoring.addGrind(dt);
  }
}
