// The skater's movement state machine:
//
//   grounded ─ollie/ramp lip─▶ airborne ─lands on rail─▶ grinding
//      ▲                          │  └─lands on street─▶ grounded
//      └──── recovering ◀── wipeout ◀── crash / bail / fall
//
// Player.update() only moves the skater. Anything that scores, sounds or
// judges a landing is reported through `events`; Game handles and clears them.

import { CONFIG } from './config.js';
import { Physics } from './Physics.js';

const P = CONFIG.physics;
const G = { h: 0, slope: 0, ramp: null, gap: null };
const G2 = { h: 0, slope: 0, ramp: null, gap: null };

export class Player {
  constructor() {
    this.events = [];
    this.board = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0 };
    this.reset(0);
  }

  reset(x) {
    this.x = x; this.y = 0;
    this.prevX = x; this.prevY = 0;
    this.vy = 0;
    this.speed = 0;
    this.state = 'grounded';
    this.angle = 0;          // board pitch in radians, positive = nose up
    this.ramp = null;        // ramp currently being ridden
    this.rail = null;        // rail currently being ground
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.lateOllie = 0;
    this.airTime = 0;
    this.wipeTimer = 0;
    this.invuln = 0;
    this.landSquash = 0;
    this.popTimer = 0;
    this.tumble = 0;
    this.grindTime = 0;
    this.events.length = 0;
  }

  get grounded() { return this.state === 'grounded' || this.state === 'recovering'; }
  get airborne() { return this.state === 'airborne'; }
  get invulnerable() { return this.invuln > 0 || this.state === 'wipeout'; }

  hitTop() {
    return this.y + (this.state === 'airborne' ? CONFIG.player.airHeight : CONFIG.player.height);
  }

  requestOllie() {
    this.jumpBuffer = P.jumpBuffer;
  }

  update(dt, world, grind, targetSpeed, now) {
    this.prevX = this.x;
    this.prevY = this.y;

    const wiped = this.state === 'wipeout';
    this.speed = Physics.approach(this.speed, wiped ? P.wipeoutSpeed : targetSpeed, (wiped ? 900 : P.accel) * dt);
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.landSquash > 0) this.landSquash = Math.max(0, this.landSquash - dt * 5);
    if (this.popTimer > 0) this.popTimer -= dt;

    switch (this.state) {
      case 'grounded':
      case 'recovering': this.updateGround(dt, world); break;
      case 'airborne': this.updateAir(dt, world, grind, now); break;
      case 'grinding': this.updateGrind(dt, now); break;
      case 'wipeout': this.updateWipeout(dt, world); break;
    }
  }

  launch(vy, event) {
    this.state = 'airborne';
    this.vy = vy;
    this.airTime = 0;
    this.coyote = 0;
    this.ramp = null;
    this.popTimer = 0.18;
    this.events.push(event);
  }

  updateGround(dt, world) {
    if (this.state === 'recovering' && this.invuln <= 0) this.state = 'grounded';
    const riding = this.ramp;
    this.x += this.speed * dt;
    world.groundAt(this.x, G);

    // Rolled off a ramp's lip: arcade launch, bigger with an ollie.
    if (riding && G.ramp !== riding && this.x >= riding.x + riding.len) {
      this.y = riding.h;
      this.angle = Math.atan((riding.h / riding.len) * 1.45);
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        this.launch(riding.launch + P.rampOllieBonus, 'rampOllie');
      } else {
        this.lateOllie = P.lateOllieWindow;
        this.launch(riding.launch, 'rampLaunch');
      }
      return;
    }

    if (G.gap) {
      // Rolled into a gap: fall, but allow a last-moment ollie.
      this.state = 'airborne';
      this.vy = 0;
      this.airTime = 0;
      this.ramp = null;
      this.coyote = P.coyoteTime;
      return;
    }

    this.ramp = G.ramp;
    this.y = G.h;
    this.angle = Math.atan(G.slope);

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      if (this.ramp) this.launch(this.ramp.launch + P.rampOllieBonus, 'rampOllie');
      else this.launch(P.jumpImpulse, 'ollie');
    }
  }

  updateAir(dt, world, grind, now) {
    this.airTime += dt;
    if (this.coyote > 0) {
      this.coyote -= dt;
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        this.launch(P.jumpImpulse, 'ollie');
      }
    }
    if (this.lateOllie > 0) {
      this.lateOllie -= dt;
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        this.lateOllie = 0;
        this.vy += P.rampOllieBonus;
        this.popTimer = 0.18;
        this.events.push('lateOllie');
      }
    }

    this.vy -= P.gravity * dt;
    this.x += this.speed * dt;
    this.y += this.vy * dt;
    this.angle *= Math.exp(-dt * 3);

    if (this.vy <= 0) {
      const rail = grind.findEntry(this, now);
      if (rail) {
        this.enterRail(rail);
        return;
      }
    }

    world.groundAt(this.x, G);
    if (G.gap) {
      if (this.y < -110) this.fallIntoGap(G.gap);
      return;
    }
    if (this.y <= G.h) {
      // Came down from above = landing. Arrived from below street level
      // (inside a gap) = slammed into the far wall.
      world.groundAt(this.prevX, G2);
      const prevH = G2.gap ? 0 : G2.h;
      if (this.prevY >= prevH - 4) this.land(G);
      else this.fallIntoGap(G2.gap || G.gap);
    }
  }

  land(ground) {
    this.y = ground.h;
    this.vy = 0;
    this.ramp = ground.ramp;
    this.angle = Math.atan(ground.slope);
    this.state = this.invuln > 0 ? 'recovering' : 'grounded';
    this.landSquash = 1;
    this.events.push('land');
  }

  enterRail(rail) {
    this.state = 'grinding';
    this.rail = rail;
    this.y = rail.h - P.railContact;
    this.vy = 0;
    this.angle = 0;
    this.grindTime = 0;
    this.landSquash = 0.6;
    this.events.push('railEnter');
  }

  updateGrind(dt, now) {
    const r = this.rail;
    this.x += this.speed * dt;
    this.y = r.h - P.railContact;
    this.grindTime += dt;
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      r.lockUntil = now + 0.25; // no instant re-grab from collision jitter
      this.rail = null;
      this.launch(P.railPopImpulse, 'railPop');
      return;
    }
    if (this.x > r.x + r.len) this.exitRail();
  }

  exitRail() {
    if (!this.rail) return;
    this.rail = null;
    this.launch(P.railExitPop, 'railExit');
  }

  wipeout(popVy = 300) {
    if (this.state === 'wipeout') return;
    this.state = 'wipeout';
    this.wipeTimer = P.wipeoutDuration;
    this.vy = Math.max(this.vy, popVy);
    this.rail = null;
    this.ramp = null;
    this.tumble = 0;
    const b = this.board;
    b.x = this.x; b.y = this.y + 8;
    b.vx = this.speed * 0.9 + 60; b.vy = 520;
    b.rot = 0; b.vr = 12;
    this.events.push('wipeout');
  }

  fallIntoGap(gap) {
    // Respawn on the far side; the fall itself is the wipeout.
    const x = gap ? gap.x + gap.w + 40 : this.x + 40;
    const fresh = this.state !== 'wipeout';
    if (fresh) this.wipeout(0);
    this.x = x; this.prevX = x;
    this.y = 0; this.prevY = 0;
    this.vy = 0;
    this.wipeTimer = Math.max(this.wipeTimer, 0.7);
    this.board.x = x - 20; this.board.y = 30;
    if (fresh) this.events.push('fell');
  }

  updateWipeout(dt, world) {
    this.wipeTimer -= dt;
    this.x += this.speed * dt;
    this.vy -= P.gravity * dt;
    this.y += this.vy * dt;
    world.groundAt(this.x, G);
    let onGround = false;
    if (G.gap) {
      if (this.y < -110) this.fallIntoGap(G.gap);
    } else if (this.y <= G.h) {
      this.y = G.h;
      if (this.vy < -260) this.vy = -this.vy * 0.3;
      else { this.vy = 0; onGround = true; }
    }
    this.tumble += dt * (onGround ? 5 : 12);

    const b = this.board;
    b.vy -= P.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) > 200 ? -b.vy * 0.35 : 0; b.vx *= 0.8; b.vr *= 0.6; }

    if (this.wipeTimer <= 0 && onGround) {
      this.state = 'recovering';
      this.invuln = P.invulnTime;
      this.tumble = 0;
      this.ramp = G.ramp;
      this.angle = Math.atan(G.slope);
      this.events.push('recover');
    }
  }
}
