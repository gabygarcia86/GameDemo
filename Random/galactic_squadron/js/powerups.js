/**
 * Power-up drops and the timers for the ones that are currently active.
 * Rapid Fire and Spread Shot are timed here; the shield timer lives on the player.
 */
import { CONFIG, WORLD } from './config.js';
import { getSprites, getGlow, POWERUP_COLORS } from './sprites.js';
import { weightedPick } from './utils.js';

const { H } = WORLD;
const PU = CONFIG.powerups;

export const POWERUP_INFO = {
  rapid: { name: 'RAPID FIRE', short: 'RAPID', color: POWERUP_COLORS.rapid },
  spread: { name: 'SPREAD SHOT', short: 'SPREAD', color: POWERUP_COLORS.spread },
  shield: { name: 'SHIELD', short: 'SHIELD', color: POWERUP_COLORS.shield },
  life: { name: 'EXTRA LIFE', short: '1UP', color: POWERUP_COLORS.life },
  score: { name: 'SCORE BONUS', short: 'BONUS', color: POWERUP_COLORS.score },
};

export class PowerUps {
  constructor(game) {
    this.game = game;
    this.sprites = getSprites().powerups;
    this.items = [];
    this.timers = { rapid: 0, spread: 0 };
    this.killsSinceDrop = 0;
  }

  reset() {
    this.items.length = 0;
    this.resetTimers();
    this.killsSinceDrop = 0;
  }

  resetTimers() {
    this.timers.rapid = 0;
    this.timers.spread = 0;
  }

  isActive(type) {
    return this.timers[type] > 0;
  }

  maybeDrop(enemy) {
    this.killsSinceDrop++;
    if (this.items.length >= PU.maxOnScreen || enemy.minion) return;
    const p = PU.dropChance + (PU.typeBonus[enemy.type] || 0);
    if (this.killsSinceDrop >= PU.pityKills || Math.random() < p) {
      this.spawn(this.chooseType(), enemy.x, enemy.y);
    }
  }

  chooseType() {
    const w = { ...PU.weights };
    if (this.game.lives >= CONFIG.player.maxLives) w.life = 0;
    if (this.game.player.shieldTime > 2) w.shield *= 0.3;
    return weightedPick(w);
  }

  spawn(type, x, y) {
    this.killsSinceDrop = 0;
    this.items.push({ type, x, y, baseX: x, t: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.y += PU.fallSpeed * dt;
      it.x = it.baseX + Math.sin(it.t * 2.2) * 14;
      if (it.y > H + 30) this.items.splice(i, 1);
    }
    for (const k in this.timers) {
      if (this.timers[k] > 0) {
        this.timers[k] -= dt;
        if (this.timers[k] <= 0) {
          this.timers[k] = 0;
          this.game.audio.play('powerDown');
        }
      }
    }
  }

  collect(index) {
    const it = this.items[index];
    this.items.splice(index, 1);
    const game = this.game;
    const info = POWERUP_INFO[it.type];
    let label = info.name;

    switch (it.type) {
      case 'rapid':
      case 'spread':
        this.timers[it.type] = PU.duration[it.type];
        break;
      case 'shield':
        game.player.activateShield(PU.duration.shield);
        break;
      case 'life':
        if (game.lives < CONFIG.player.maxLives) {
          game.lives++;
        } else {
          game.addScore(CONFIG.scoring.scoreBonus);
          label = '+' + CONFIG.scoring.scoreBonus;
        }
        break;
      case 'score': {
        const pts = CONFIG.scoring.scoreBonus * Math.min(4, 1 + Math.floor(game.stage / 7));
        game.addScore(pts);
        label = '+' + pts;
        break;
      }
    }
    game.audio.play(it.type === 'life' ? 'extraLife' : 'powerup');
    game.particles.ring(it.x, it.y, info.color, 10, 160, 0.4);
    game.particles.text(game.player.x, game.player.y - 50, label, info.color, 18, 1.2);
  }

  draw(ctx) {
    for (const it of this.items) {
      const s = this.sprites[it.type];
      const color = POWERUP_COLORS[it.type];
      const pulse = 1 + 0.08 * Math.sin(it.t * 6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(it.t * 6);
      ctx.drawImage(getGlow(color), it.x - 30, it.y - 30, 60, 60);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(Math.sin(it.t * 1.7) * 0.25);
      ctx.scale(pulse, pulse);
      ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
  }
}
