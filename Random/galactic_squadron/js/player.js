/** The player's starfighter: movement, firing, shield and respawn handling. */
import { CONFIG, WORLD } from './config.js';
import { getSprites, getGlow } from './sprites.js';
import { getShip, getShipSprite } from './ships.js';
import { TAU, clamp } from './utils.js';

const { W } = WORLD;
const P = CONFIG.player;

export class Player {
  constructor(game) {
    this.game = game;
    this.sprites = getSprites();
    this.reset();
  }

  reset() {
    this.x = W / 2;
    this.y = P.y;
    this.vx = 0;
    this.bank = 0;
    this.alive = true;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.shieldTime = 0;
    this.shieldMax = 1;
    this.shieldCooldown = 0;
    this.respawnTimer = 0;
    this.muzzle = 0;
    this.t = 0;
  }

  get shielded() {
    return this.alive && this.shieldTime > 0;
  }

  activateShield(duration) {
    if (this.shieldTime < duration) {
      this.shieldTime = duration;
      this.shieldMax = duration;
    }
    this.game.audio.play('shield');
    this.game.particles.ring(this.x, this.y, '#4fc3ff', 10, 140, 0.35);
  }

  /** Shield ability on a cooldown (Shift / S / Down, or the SHIELD touch button). */
  tryAbilityShield() {
    if (!this.alive || this.shieldCooldown > 0) {
      if (this.alive) this.game.audio.play('denied');
      return false;
    }
    this.activateShield(P.shieldAbility.duration);
    this.shieldCooldown = P.shieldAbility.cooldown;
    return true;
  }

  die() {
    this.alive = false;
    this.shieldTime = 0;
    this.vx = 0;
  }

  respawn() {
    this.alive = true;
    this.x = W / 2;
    this.vx = 0;
    this.bank = 0;
    this.invuln = P.invulnTime;
    this.fireCooldown = 0.3;
    this.game.onPlayerRespawn();
  }

  update(dt, canFire) {
    this.t += dt;
    if (this.shieldCooldown > 0) this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);

    if (!this.alive) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
      }
      return;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.shieldTime > 0) this.shieldTime = Math.max(0, this.shieldTime - dt);
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;

    const input = this.game.input;
    const settings = this.game.settings;
    const target = input.touchTargetX;
    const lo = P.margin;
    const hi = W - P.margin;

    if (target !== null) {
      const dx = clamp(target, lo, hi) - this.x;
      const step = clamp(dx, -P.touchFollowSpeed * dt, P.touchFollowSpeed * dt);
      this.x += step;
      this.vx = step / dt;
    } else {
      const ax = input.axis;
      if (settings.movement === 'inertia') {
        if (ax) {
          // turning around brakes harder so inertia never feels sluggish
          const braking = Math.sign(this.vx) !== ax && this.vx !== 0 ? 1.8 : 1;
          this.vx += ax * P.accel * braking * dt;
        } else {
          this.vx *= Math.exp(-P.drag * dt);
          if (Math.abs(this.vx) < 4) this.vx = 0;
        }
        this.vx = clamp(this.vx, -P.maxSpeed, P.maxSpeed);
      } else {
        this.vx = ax * P.maxSpeed;
      }
      this.x += this.vx * dt;
    }

    if (this.x < lo || this.x > hi) {
      this.x = clamp(this.x, lo, hi);
      this.vx = 0;
    }
    this.bank += (clamp(this.vx / P.maxSpeed, -1, 1) - this.bank) * Math.min(1, dt * 10);

    const wantFire = canFire && (input.fireHeld || settings.autoFire);
    if (wantFire && this.fireCooldown <= 0) {
      this.shoot();
      this.fireCooldown = this.game.powerups.isActive('rapid') ? P.rapidFireInterval : P.fireInterval;
    }
  }

  shoot() {
    const game = this.game;
    const pr = game.projectiles;
    const ny = this.y - 24;
    if (game.powerups.isActive('spread')) {
      pr.firePlayer(this.x, ny, 0);
      pr.firePlayer(this.x - 8, ny + 6, -P.spreadAngle);
      pr.firePlayer(this.x + 8, ny + 6, P.spreadAngle);
      game.stageShots += 3;
    } else {
      pr.firePlayer(this.x, ny, 0);
      game.stageShots += 1;
    }
    this.muzzle = 0.06;
    game.audio.play('shoot');
  }

  draw(ctx) {
    if (!this.alive) return;
    const ship = getShip(this.game.settings.ship);
    const s = getShipSprite(ship.id);
    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    if (blink) ctx.globalAlpha = 0.35;

    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.85 + 0.15 * Math.sin(this.t * 41) + 0.1 * Math.sin(this.t * 67);
    const flame = this.sprites.flames[ship.flame];
    for (const [ex, ey, ew] of ship.engines) ctx.drawImage(flame, ex - ew / 2, ey, ew, ew * 2 * fl);
    if (this.muzzle > 0) ctx.drawImage(getGlow('#4fe3ff'), -10, -36, 20, 20);
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(this.bank * 0.1);
    ctx.scale(1 - Math.abs(this.bank) * 0.16, 1);
    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();

    if (this.shieldTime > 0) this.drawShield(ctx);
  }

  drawShield(ctx) {
    const remaining = this.shieldTime;
    if (remaining < 1.5 && Math.floor(remaining * 10) % 2 === 0) return; // warn before it drops
    const r = P.shieldRadius;
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 8);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
    g.addColorStop(0, 'rgba(79,195,255,0)');
    g.addColorStop(0.85, `rgba(79,195,255,${0.18 * pulse})`);
    g.addColorStop(1, `rgba(160,230,255,${0.5 * pulse})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(160,230,255,${0.7 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.rotate(this.t * 1.5);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU;
      ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.arc(0, 0, r, a0, a0 + 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }
}
