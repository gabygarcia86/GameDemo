/**
 * Game core: state machine, fixed-timestep loop, scoring and the glue between
 * the player, waves, boss, projectiles, effects and UI.
 */
import { CONFIG, WORLD, getDifficulty } from './config.js';
import { storage } from './storage.js';
import { Background } from './background.js';
import { Particles } from './particles.js';
import { Projectiles } from './projectile.js';
import { PowerUps } from './powerups.js';
import { Player } from './player.js';
import { WaveManager } from './waveManager.js';
import { Boss } from './boss.js';
import { Falcon } from './falcon.js';
import { handleCollisions } from './collision.js';
import { getSprites } from './sprites.js';
import { clamp, rand } from './utils.js';

const { W, H } = WORLD;

export const STATE = Object.freeze({
  TITLE: 'TITLE_SCREEN',
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  CLEARED: 'WAVE_CLEARED',
  BOSS_INTRO: 'BOSS_INTRO',
  GAME_OVER: 'GAME_OVER',
});

/** Legal transitions. Anything else is ignored, which keeps double taps harmless. */
const TRANSITIONS = {
  TITLE_SCREEN: ['READY', 'BOSS_INTRO'],
  READY: ['PLAYING', 'PAUSED', 'GAME_OVER'],
  PLAYING: ['PAUSED', 'WAVE_CLEARED', 'GAME_OVER'],
  PAUSED: ['READY', 'BOSS_INTRO', 'TITLE_SCREEN'],
  WAVE_CLEARED: ['READY', 'BOSS_INTRO', 'PAUSED', 'GAME_OVER'],
  BOSS_INTRO: ['PLAYING', 'PAUSED', 'GAME_OVER'],
  GAME_OVER: ['READY', 'BOSS_INTRO', 'TITLE_SCREEN'],
};

const ACTIVE = new Set([STATE.READY, STATE.PLAYING, STATE.CLEARED, STATE.BOSS_INTRO]);

const EXPLOSIONS = {
  interceptor: { color: '#ff5a4a', size: 1 },
  heavy: { color: '#ff9a3c', size: 1.3, debris: '#6f7a72' },
  bomber: { color: '#c77dff', size: 1.1, debris: '#4b4672' },
  ace: { color: '#ffcf5a', size: 1.2, debris: '#8f1328' },
};

export class Game {
  constructor({ canvas, settings, audio, ui, input, startStage = 1 }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.settings = settings;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.startStage = startStage;

    this.background = new Background();
    this.particles = new Particles();
    this.projectiles = new Projectiles();
    this.powerups = new PowerUps(this);
    this.player = new Player(this);
    this.waves = new WaveManager(this);
    this.sprites = getSprites();
    this.enemies = [];
    this.boss = null;
    this.falcon = null;

    this.state = STATE.TITLE;
    this.stateTime = 0;
    this.resumeState = null;
    this.resumeStateTime = 0;
    this.actions = [];
    this.time = 0;
    this.viewScale = 1;
    this.acc = 0;
    this.lastTs = 0;
    this.shakeAmt = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.banner = null;
    this.perf = { ema: 1 / 60, slow: 0 };
    this.lowQuality = false;

    this.highScore = Number(storage.get('highScore', 0)) || 0;
    this.diffPreset = settings.difficulty;
    this.diff = getDifficulty(1, this.diffPreset);
    this.resetRun();

    this.frame = this.frame.bind(this);
  }

  start() {
    this.applySettings();
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------------ run state */

  resetRun() {
    this.diffPreset = this.settings.difficulty;
    this.score = 0;
    this.lives = clamp(Math.round(this.settings.startLives) || CONFIG.player.startLives, 1, CONFIG.player.maxLives);
    this.stage = 1;
    this.streak = 0;
    this.multiplier = 1;
    this.streakTimer = 0;
    this.nextLifeAt = CONFIG.scoring.extraLifeEvery;
    this.kills = 0;
    this.gameOverTimer = 0;
    this.stageShots = 0;
    this.stageHits = 0;
    this.stageLivesLost = 0;
    this.bossLines = null;
    this.clearWorld();
    this.player.reset();
    this.powerups.reset();
  }

  clearWorld() {
    this.enemies.length = 0;
    this.boss = null;
    this.falcon = null;
    this.projectiles.clear();
    this.particles.clear();
    this.powerups.items.length = 0;
    this.waves.reset();
    this.banner = null;
    this.shakeAmt = 0;
    this.flashAlpha = 0;
    this.background.warpTarget = 0;
  }

  isActivePlay() {
    return ACTIVE.has(this.state);
  }

  canEnemiesAttack() {
    return this.state === STATE.PLAYING;
  }

  setState(next) {
    if (next === this.state) return false;
    const allowed = TRANSITIONS[this.state];
    if (!allowed || !allowed.includes(next)) return false;
    this.state = next;
    this.stateTime = 0;
    this.ui.updateChrome();
    return true;
  }

  /** UI and keyboard requests are queued and handled at the start of the next frame. */
  requestAction(name) {
    if (this.actions.length < 4) this.actions.push(name);
  }

  processActions() {
    while (this.actions.length) {
      const a = this.actions.shift();
      const s = this.state;
      switch (a) {
        case 'start':
          if (s === STATE.TITLE) this.newGame();
          break;
        case 'restart':
          if (s === STATE.PAUSED || (s === STATE.GAME_OVER && this.stateTime > 0.6)) this.newGame();
          break;
        case 'resume':
          this.resume();
          break;
        case 'pause':
          this.pause();
          break;
        case 'title':
          this.quitToTitle();
          break;
        case 'shield':
          if (this.isActivePlay()) this.player.tryAbilityShield();
          break;
        case 'escape':
          if (this.ui.back()) break;
          if (this.isActivePlay()) this.pause();
          else if (s === STATE.PAUSED) this.resume();
          break;
        case 'confirm':
          if (this.ui.current === 'settings' || this.ui.current === 'help') break;
          if (s === STATE.TITLE) this.newGame();
          else if (s === STATE.GAME_OVER && this.stateTime > 1) this.newGame();
          else if (s === STATE.PAUSED) this.resume();
          break;
      }
    }
  }

  newGame() {
    this.resetRun();
    this.input.reset();
    this.ui.hideAll();
    this.audio.unlock();
    this.beginStage(this.startStage);
  }

  beginStage(stage) {
    this.stage = stage;
    this.diff = getDifficulty(stage, this.diffPreset);
    this.stageShots = 0;
    this.stageHits = 0;
    this.stageLivesLost = 0;
    this.waves.setupStage(stage);
    this.background.warpTarget = 0;

    if (this.waves.bossStage) {
      this.boss = new Boss(this, Math.round(stage / CONFIG.boss.every));
      if (!this.setState(STATE.BOSS_INTRO)) return;
      this.banner = { warning: true, sub: this.boss.name + ' INBOUND', t: 0, dur: CONFIG.boss.introTime - 0.2 };
      this.audio.play('bossAlarm');
      this.audio.startMusic('boss');
    } else {
      this.boss = null;
      if (!this.setState(STATE.READY)) return;
      this.banner = { title: 'STAGE ' + stage, sub: stage === 1 ? 'SQUADRON, LAUNCH!' : 'GET READY', t: 0, dur: 2.0 };
      this.audio.play('waveStart');
      this.audio.startMusic('normal');
    }
  }

  stageCleared() {
    if (!this.setState(STATE.CLEARED)) return;
    const S = CONFIG.scoring;
    const lines = this.bossLines || [];
    this.bossLines = null;
    const acc = this.stageShots ? Math.round((100 * this.stageHits) / this.stageShots) : 0;
    lines.push({ text: 'ACCURACY  ' + Math.min(100, acc) + '%', color: '#9fe8ff' });
    if (this.stageLivesLost === 0) {
      const bonus = S.perfectWaveBase + S.perfectWavePerStage * this.stage;
      this.addScore(bonus);
      lines.push({ text: 'NO-DAMAGE BONUS  +' + bonus.toLocaleString(), color: '#ffd23f' });
    }
    this.banner = { title: 'STAGE ' + this.stage + ' CLEAR', lines, t: 0, dur: 3.2, color: '#7fe9ff', size: 38, y: 400 };
    this.background.warpTarget = 1;
    this.fizzleEnemyBullets();
    this.audio.play('stageClear');
  }

  pause() {
    if (!this.isActivePlay()) return;
    this.resumeState = this.state;
    this.resumeStateTime = this.stateTime;
    if (!this.setState(STATE.PAUSED)) return;
    this.input.reset();
    this.audio.stopMusic();
    this.ui.showPause();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = this.resumeState;
    this.stateTime = this.resumeStateTime;
    this.input.reset();
    this.ui.hideAll();
    this.acc = 0;
    this.audio.startMusic(this.boss && this.boss.state !== 'dead' ? 'boss' : 'normal');
  }

  quitToTitle() {
    if (this.state !== STATE.PAUSED && this.state !== STATE.GAME_OVER) return;
    this.saveHighScore();
    if (!this.setState(STATE.TITLE)) return;
    this.clearWorld();
    this.player.reset();
    this.input.reset();
    this.audio.stopMusic();
    this.ui.showTitle();
  }

  gameOver() {
    this.gameOverTimer = 0;
    if (!this.setState(STATE.GAME_OVER)) return;
    const newBest = this.saveHighScore();
    if (this.falcon) this.falcon.leave();
    this.banner = null;
    this.background.warpTarget = 0;
    this.audio.stopMusic();
    this.audio.play('gameOver');
    this.ui.showGameOver({ score: this.score, best: this.highScore, stage: this.stage, kills: this.kills, newBest });
  }

  saveHighScore() {
    if (this.score <= this.highScore) return false;
    this.highScore = this.score;
    storage.set('highScore', this.highScore);
    return true;
  }

  resetHighScore() {
    this.highScore = 0;
    storage.set('highScore', 0);
    this.ui.updateHighScore(0);
  }

  /* -------------------------------------------------------------- settings */

  applySettings() {
    this.audio.applySettings();
    this.applyQuality();
    this.ui.updateMute();
    this.ui.layout();
  }

  applyQuality() {
    const reduced = this.settings.reducedEffects || this.lowQuality;
    this.particles.setReduced(reduced);
    this.background.low = reduced;
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.unlock();
    this.ui.saveSettings();
    this.ui.syncSettingsForm();
    this.audio.applySettings();
  }

  setView(scale) {
    this.viewScale = scale;
  }

  /* --------------------------------------------------------------- scoring */

  addScore(points) {
    this.score += points;
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += CONFIG.scoring.extraLifeEvery;
      if (this.lives < CONFIG.player.maxLives) {
        this.lives++;
        this.audio.play('extraLife');
        this.particles.text(W / 2, 520, 'EXTRA LIFE!', '#ff5c8a', 26, 1.8);
      }
    }
  }

  multiplierFor(streak) {
    const t = CONFIG.scoring.multiplierThresholds;
    let m = 1;
    for (let i = 0; i < t.length; i++) if (streak >= t[i]) m = i + 1;
    return m;
  }

  /* ---------------------------------------------------------------- combat */

  damageEnemy(e, dmg, x, y) {
    e.hp -= dmg;
    if (e.hp <= 0) {
      this.killEnemy(e, true);
    } else {
      e.hitFlash = 0.08;
      this.particles.hitSpark(x, y);
      this.audio.play('hit');
    }
  }

  killEnemy(e, byPlayer) {
    if (!e.alive) return;
    e.alive = false;
    if (e.slot && e.slot.enemy === e) e.slot.enemy = null;
    if (e.wingmen) for (const w of e.wingmen) if (w.leader === e) w.abortPrep();
    e.wingmen = null;
    this.particles.explosion(e.x, e.y, EXPLOSIONS[e.type]);
    this.audio.play('explode');
    if (!byPlayer) return;

    this.kills++;
    this.streak++;
    this.streakTimer = CONFIG.scoring.streakWindow;
    if (this.streak % CONFIG.falcon.streakEvery === 0) this.callFalcon();
    const prevMult = this.multiplier;
    this.multiplier = this.multiplierFor(this.streak);
    const dive = e.diving && e.state !== 'entering' ? CONFIG.scoring.diveMultiplier : 1;
    const pts = e.def.score * dive * this.multiplier;
    this.addScore(pts);
    this.particles.text(e.x, e.y - 8, String(pts), dive > 1 ? '#ffb02e' : '#ffffff', dive > 1 ? 18 : 15);
    if (this.multiplier > prevMult) {
      this.particles.text(W / 2, 560, 'MULTIPLIER x' + this.multiplier, '#ffd23f', 22, 1.4);
    }
    this.powerups.maybeDrop(e);
  }

  /** Streak reward: the Falcon arrives (or stays for another full run if it's already here). */
  callFalcon() {
    if (this.falcon && !this.falcon.done) this.falcon.extend();
    else this.falcon = new Falcon(this);
    this.audio.play('falcon');
    this.particles.text(W / 2, 500, 'THE FALCON HAS ARRIVED!', '#ff9a3c', 24, 2.2);
  }

  playerStruck(x, y) {
    const p = this.player;
    if (!p.alive) return;
    if (p.shielded) {
      this.particles.shieldRipple(x, y);
      this.audio.play('shieldHit');
      return;
    }
    if (p.invuln > 0) return;

    p.die();
    this.particles.explosion(p.x, p.y, { color: '#4fe3ff', size: 2.2, debris: '#c8d2e6' });
    this.particles.explosion(p.x, p.y, { color: '#ff9a3c', size: 1.4 });
    this.shake(14);
    this.flash('#ff2e4a', 0.35);
    this.audio.play('playerHit');
    this.lives--;
    this.stageLivesLost++;
    this.streak = 0;
    this.multiplier = 1;
    this.streakTimer = 0;
    this.powerups.resetTimers();
    if (this.lives <= 0) {
      this.lives = 0;
      this.gameOverTimer = CONFIG.player.gameOverDelay;
    } else {
      p.respawnTimer = CONFIG.player.respawnDelay;
    }
  }

  /** Clears shots near the respawn point so the player never spawns into a bullet. */
  onPlayerRespawn() {
    const pool = this.projectiles.enemy;
    const a = pool.active;
    for (let i = a.length - 1; i >= 0; i--) {
      const b = a[i];
      if (Math.abs(b.x - this.player.x) < 170 && b.y > this.player.y - 260) {
        this.particles.glow(b.x, b.y, 8, '#ff9a3c', 0.25);
        pool.releaseAt(i);
      }
    }
  }

  fizzleEnemyBullets() {
    const a = this.projectiles.enemy.active;
    for (let i = 0; i < a.length && i < 60; i++) this.particles.glow(a[i].x, a[i].y, 8, '#ff9a3c', 0.3);
    this.projectiles.enemy.clear();
  }

  /** Decides how an enemy shoots based on its class and the stage difficulty. */
  enemyAttack(e, context) {
    const d = this.diff;
    switch (e.type) {
      case 'heavy':
        this.enemyFire(e, 'heavy');
        break;
      case 'bomber':
        this.enemyFire(e, d.spread && context !== 'formation' ? 'spread' : d.aimed ? 'aimed' : 'straight');
        break;
      case 'ace':
        if (context === 'formation') this.enemyFire(e, 'aimed');
        else {
          e.burst = d.spread ? 3 : 2;
          e.burstTimer = 0;
        }
        break;
      default:
        this.enemyFire(e, d.aimed && (context !== 'formation' || Math.random() < 0.5) ? 'aimed' : 'straight');
    }
  }

  enemyFire(e, mode) {
    const p = this.player;
    if (!p.alive || this.state !== STATE.PLAYING) return;
    if (this.projectiles.enemy.count >= this.diff.maxEnemyBullets) return;
    if (e.y < 10 || e.y > p.y - CONFIG.dive.safeFireGap) return;

    const kinds = CONFIG.projectiles.kinds;
    const base = CONFIG.projectiles.enemySpeed * this.diff.bulletSpeed;
    const aim = clamp(Math.atan2(p.x - e.x, p.y - e.y) + rand(-0.05, 0.05), -0.75, 0.75);
    const shot = (kind, theta) => {
      const sp = base * kinds[kind].speed;
      this.projectiles.fireEnemy(kind, e.x, e.y + 12, Math.sin(theta) * sp, Math.cos(theta) * sp);
    };
    switch (mode) {
      case 'aimed':
        shot('aimed', aim);
        break;
      case 'heavy':
        shot('heavy', this.diff.aimed ? aim : 0);
        break;
      case 'spread':
        for (const off of [-0.28, 0, 0.28]) shot('spread', aim + off);
        break;
      default:
        shot('basic', 0);
    }
    this.audio.play('enemyShoot');
  }

  bossFire(x, y, theta, kind, speedMul) {
    if (!this.player.alive || this.state !== STATE.PLAYING) return;
    if (this.projectiles.enemy.count >= this.diff.maxEnemyBullets + 60) return;
    const sp = CONFIG.projectiles.enemySpeed * this.diff.bulletSpeed * CONFIG.projectiles.kinds[kind].speed * speedMul;
    this.projectiles.fireEnemy(kind, x, y, Math.sin(theta) * sp, Math.cos(theta) * sp);
  }

  onBossDying() {
    this.fizzleEnemyBullets();
    for (const e of this.enemies) this.killEnemy(e, false);
  }

  onBossDestroyed(boss) {
    const B = CONFIG.boss;
    this.addScore(B.score);
    this.addScore(B.defeatBonus);
    this.kills++;
    this.particles.text(boss.x, boss.y, '+' + B.score.toLocaleString(), '#ffd23f', 28, 1.8);
    this.bossLines = [{ text: 'BOSS DEFEATED  +' + B.defeatBonus.toLocaleString(), color: '#ffb02e' }];
  }

  /* -------------------------------------------------------------------- fx */

  shake(amount) {
    const k = this.settings.reducedShake ? 0.2 : 1;
    this.shakeAmt = Math.max(this.shakeAmt, amount * k);
  }

  flash(color, alpha) {
    const k = this.settings.reducedEffects ? 0.5 : 1;
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha * k);
  }

  /* ------------------------------------------------------------------ loop */

  frame(ts) {
    requestAnimationFrame(this.frame);
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    dt = clamp(dt, 0, 0.1); // a long hitch (tab switch, debugger) never becomes one giant step

    this.processActions();
    this.trackPerformance(dt);

    if (this.state !== STATE.PAUSED) {
      const step = CONFIG.sim.step;
      this.acc += dt;
      let n = 0;
      while (this.acc >= step && n < CONFIG.sim.maxSteps) {
        this.update(step);
        this.acc -= step;
        n++;
      }
      if (n >= CONFIG.sim.maxSteps) this.acc = 0;
    }
    this.render();
  }

  /** Drops to reduced effects automatically if the device can't hold ~40 FPS. */
  trackPerformance(dt) {
    if (this.lowQuality || this.state !== STATE.PLAYING || dt <= 0) return;
    const p = this.perf;
    p.ema = p.ema * 0.95 + dt * 0.05;
    p.slow = p.ema > 1 / 40 ? p.slow + dt : Math.max(0, p.slow - dt);
    if (p.slow > 3) {
      this.lowQuality = true;
      this.applyQuality();
    }
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const s = this.state;
    this.background.update(dt);
    if (s === STATE.TITLE) {
      this.particles.update(dt);
      return;
    }
    const active = ACTIVE.has(s);

    if (active) this.player.update(dt, s === STATE.PLAYING);
    this.waves.update(dt);
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].update(dt, this);
    if (this.boss) this.boss.update(dt);
    if (this.falcon) {
      this.falcon.update(dt);
      if (this.falcon.done) this.falcon = null;
    }
    this.projectiles.update(dt);
    this.powerups.update(dt);
    if (active) handleCollisions(this);

    let j = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) this.enemies[j++] = e;
    }
    this.enemies.length = j;

    this.particles.update(dt);

    if (s === STATE.PLAYING && this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) {
        this.streak = 0;
        this.multiplier = 1;
      }
    }
    if (this.gameOverTimer > 0) {
      this.gameOverTimer -= dt;
      if (this.gameOverTimer <= 0) this.gameOver();
    }

    this.shakeAmt *= Math.exp(-dt * 7);
    if (this.shakeAmt < 0.2) this.shakeAmt = 0;
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }

    switch (this.state) {
      case STATE.READY:
        if (this.stateTime >= 2.0) {
          this.setState(STATE.PLAYING);
          this.waves.start();
        }
        break;
      case STATE.BOSS_INTRO:
        if (this.boss && this.boss.state === 'fight') {
          this.setState(STATE.PLAYING);
          this.waves.start();
        }
        break;
      case STATE.PLAYING:
        if (this.gameOverTimer <= 0 && this.player.alive && this.waves.isCleared()) this.stageCleared();
        break;
      case STATE.CLEARED:
        if (this.stateTime >= 2.6) this.background.warpTarget = 0;
        if (this.stateTime >= 3.4 && this.gameOverTimer <= 0) this.beginStage(this.stage + 1);
        break;
    }
  }

  render() {
    const ctx = this.ctx;
    const k = this.viewScale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.background.draw(ctx);

    const sx = this.shakeAmt ? rand(-1, 1) * this.shakeAmt : 0;
    const sy = this.shakeAmt ? rand(-1, 1) * this.shakeAmt : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    if (this.state !== STATE.TITLE) {
      if (this.boss) this.boss.draw(ctx);
      this.powerups.draw(ctx);
      for (let i = 0; i < this.enemies.length; i++) this.enemies[i].draw(ctx, this.sprites);
      if (this.falcon) this.falcon.draw(ctx);
      this.player.draw(ctx);
      this.projectiles.drawPlayer(ctx);
    }
    this.particles.draw(ctx);
    if (this.boss) this.boss.drawLaser(ctx);
    this.projectiles.drawEnemy(ctx);
    this.particles.drawTexts(ctx);

    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.state !== STATE.TITLE) this.ui.drawHUD(ctx, this);
    if (this.banner) this.ui.drawBanner(ctx, this.banner);
    if (this.flashAlpha > 0.01) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}
