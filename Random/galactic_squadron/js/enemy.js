/**
 * Enemy ships. Each one is a small state machine:
 *   entering → homing → formation → prep (telegraph) → diving → homing → formation …
 * Minions launched by the boss go straight to diving and leave the screen.
 */
import { CONFIG } from './config.js';
import { getSprites, getGlow } from './sprites.js';
import { turnToward } from './utils.js';

const tmp = { x: 0, y: 0, dx: 0, dy: 1 };

const LOOK = {
  interceptor: { flame: 'red', flames: [[0, 3]], fw: 6, fl: 7 },
  heavy: { flame: 'orange', flames: [[0, 14]], fw: 7, fl: 7 },
  bomber: { flame: 'violet', flames: [[0, 17]], fw: 7, fl: 13 },
  ace: { flame: 'gold', flames: [[0, 19]], fw: 6, fl: 14 },
};

export class Enemy {
  constructor(type, hpBonus = 0) {
    const def = CONFIG.enemies[type];
    this.type = type;
    this.def = def;
    this.hp = def.hp + (type === 'heavy' || type === 'ace' ? hpBonus : 0);
    this.maxHp = this.hp;
    this.r = def.radius;
    this.x = -100;
    this.y = -100;
    this.angle = Math.PI;
    this.state = 'waiting';
    this.slot = null;
    this.path = null;
    this.pathDist = 0;
    this.pathSpeed = 0;
    this.offX = 0;
    this.offY = 0;
    this.endMode = 'home';
    this.homeSpeed = CONFIG.dive.returnSpeed;
    this.fireMarks = null;
    this.fireIndex = 0;
    this.burst = 0;
    this.burstTimer = 0;
    this.prepTimer = 0;
    this.diveKind = 'swoop';
    this.leader = null;
    this.wingmen = null;
    this.wingOffset = null;
    this.diving = false;
    this.alive = true;
    this.hitFlash = 0;
    this.anim = Math.random() * 10;
    this.trail = type === 'ace' ? [] : null;
    this.trailTimer = 0;
  }

  get hittable() {
    return this.alive && this.y > -10;
  }

  follow(path, speed, endMode, offX = 0, offY = 0) {
    this.path = path;
    this.pathDist = 0;
    this.pathSpeed = speed;
    this.endMode = endMode;
    this.offX = offX;
    this.offY = offY;
    this.fireMarks = null;
    this.fireIndex = 0;
  }

  /** Short wobble before diving so the player can see the attack coming. */
  prepareDive(kind, wingmen) {
    this.state = 'prep';
    this.prepTimer = CONFIG.dive.telegraph;
    this.diveKind = kind;
    this.diving = true;
    this.wingmen = wingmen;
  }

  prepareWing(leader, offX, offY) {
    this.state = 'prep';
    this.prepTimer = Infinity; // the leader launches its wingmen
    this.leader = leader;
    this.wingOffset = [offX, offY];
    this.diving = true;
  }

  /** Cancels a pending wing launch (e.g. the leader was shot down during its telegraph). */
  abortPrep() {
    if (this.state !== 'prep') return;
    this.state = 'formation';
    this.diving = false;
    this.leader = null;
  }

  update(dt, game) {
    this.anim += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    let target = this.angle;

    switch (this.state) {
      case 'entering':
      case 'diving': {
        this.pathDist += this.pathSpeed * dt;
        this.path.sample(this.pathDist, tmp);
        this.x = tmp.x + this.offX;
        this.y = tmp.y + this.offY;
        if (tmp.dx || tmp.dy) target = Math.atan2(tmp.dx, -tmp.dy);
        if (this.fireMarks && this.fireIndex < this.fireMarks.length && this.pathDist >= this.fireMarks[this.fireIndex]) {
          this.fireIndex++;
          game.enemyAttack(this, this.state === 'entering' ? 'entry' : 'dive');
        }
        if (this.pathDist >= this.path.length) this.finishPath();
        break;
      }
      case 'prep': {
        this.x = this.slot.x + Math.sin(this.anim * 50) * 1.6;
        this.y = this.slot.y;
        target = Math.PI;
        this.prepTimer -= dt;
        if (this.prepTimer <= 0) game.waves.launchDive(this);
        break;
      }
      case 'homing': {
        const dx = this.slot.x - this.x;
        const dy = this.slot.y - this.y;
        const d = Math.hypot(dx, dy);
        const sp = Math.min(this.homeSpeed, d * 5 + 40);
        if (d < 2 || d <= sp * dt) {
          this.x = this.slot.x;
          this.y = this.slot.y;
          this.state = 'formation';
          this.diving = false;
        } else {
          this.x += (dx / d) * sp * dt;
          this.y += (dy / d) * sp * dt;
          target = d > 30 ? Math.atan2(dx, -dy) : Math.PI;
        }
        break;
      }
      case 'formation':
        this.x = this.slot.x;
        this.y = this.slot.y;
        target = Math.PI;
        break;
    }

    this.angle = turnToward(this.angle, target, 9 * dt);

    if (this.burst > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burst--;
        this.burstTimer = 0.11;
        game.enemyFire(this, 'aimed');
      }
    }

    if (this.trail) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.035;
        if (this.state === 'diving' || this.state === 'entering') {
          this.trail.push(this.x, this.y, this.angle);
          if (this.trail.length > 12) this.trail.splice(0, 3);
        } else if (this.trail.length) {
          this.trail.splice(0, 3);
        }
      }
    }
  }

  finishPath() {
    this.path = null;
    this.fireMarks = null;
    switch (this.endMode) {
      case 'wrap':
        this.x = this.slot.x;
        this.y = -40;
        this.state = 'homing';
        break;
      case 'remove':
        this.alive = false;
        this.escaped = true;
        break;
      default:
        this.state = 'homing';
    }
  }

  draw(ctx, sprites = getSprites()) {
    const damaged = this.hp < this.maxHp;
    const s = (damaged && sprites[this.type + 'Damaged']) || sprites[this.type];
    const look = LOOK[this.type];

    if (this.trail && this.trail.length) {
      for (let i = 0; i < this.trail.length; i += 3) {
        ctx.save();
        ctx.globalAlpha = 0.08 + (i / this.trail.length) * 0.2;
        ctx.translate(this.trail[i], this.trail[i + 1]);
        ctx.rotate(this.trail[i + 2]);
        ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type === 'ace') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.anim * 6);
      ctx.drawImage(getGlow('#ff3a3a'), -26, -26, 52, 52);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.rotate(this.angle);

    const moving = this.state === 'diving' || this.state === 'entering' || this.state === 'homing';
    const flicker = 0.8 + 0.2 * Math.sin(this.anim * 37) + (moving ? 0.5 : 0);
    const flame = sprites.flames[look.flame];
    ctx.globalCompositeOperation = 'lighter';
    for (const [fx, fy] of look.flames) {
      ctx.drawImage(flame, fx - look.fw / 2, fy, look.fw, look.fl * flicker);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (this.state === 'formation') ctx.scale(1 + Math.sin(this.anim * 4) * 0.035, 1);
    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);

    let flash = this.hitFlash > 0 ? 1 : 0;
    if (this.state === 'prep' && Math.sin(this.anim * 40) > 0) flash = Math.max(flash, 0.45);
    if (flash) {
      ctx.globalAlpha = flash;
      ctx.drawImage(s.flash, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    ctx.restore();
  }
}
