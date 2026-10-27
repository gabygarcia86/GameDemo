/**
 * Capital-ship boss. Descends dramatically, then cycles attack patterns that
 * grow harsher through three damage phases (100–67%, 67–33%, 33–0%).
 * The glowing reactor core takes double damage.
 */
import { CONFIG, WORLD } from './config.js';
import { getBossSprites, getSprites, getGlow } from './sprites.js';
import { Enemy } from './enemy.js';
import { buildMinionRun } from './paths.js';
import { Path, TAU, clamp, lerp, rand, pick, easeOutCubic, hexToRgba } from './utils.js';

const { W, H } = WORLD;

const NAMES = ['STAR SHIP', 'STAR DREADNOUGHT', 'SUPER STAR SHIP'];
const ACCENTS = ['#ff3b4e', '#b26bff', '#ff8a2a'];
const CORE_COLORS = ['#5ad1ff', '#ffb02e', '#ff3b4e'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// Positions relative to the ship center; they match the art in sprites.js drawBoss.
const CORE = { x: 0, y: 20, r: 22 };
const HULL = [
  [-28, -52, 24], [28, -52, 24],                 // command tower
  [0, -5, 40], [-55, 15, 22], [55, 15, 22],      // superstructure
  [0, 45, 34], [-70, 35, 26], [70, 35, 26],      // hull center
  [-115, 38, 18], [115, 38, 18], [-148, 39, 12], [148, 39, 12], // wings
];
const SIDE_GUNS = [[-87, 45], [87, 45]];         // muzzles of the deck turrets (centers 14 above)
const PRONG_GUNS = [[-129, 56], [129, 56]];      // muzzles of the wing-tip guns
const HANGAR = [0, 70];
const ENGINES = [[-145, 27], [-105, 19], [105, 19], [145, 27]]; // top of each engine bell
const DAMAGE_POINTS = {
  2: [[-90, 30], [70, 22], [-30, -12], [120, 38]],
  3: [[-90, 30], [70, 22], [-30, -12], [120, 38], [30, -50], [-135, 38], [45, 55], [-55, 5]],
};
const PATTERNS = {
  1: ['fan', 'aimed', 'rain'],
  2: ['fan', 'aimed', 'laser', 'launch', 'rain'],
  3: ['ring', 'laser', 'aimed', 'fan', 'launch'],
};
const LASER_CHARGE = 1.1;
const LASER_FIRE = 1.15;

export class Boss {
  constructor(game, encounter) {
    const B = CONFIG.boss;
    this.game = game;
    this.encounter = encounter;
    this.maxHp = Math.round((B.baseHp + B.hpPerEncounter * (encounter - 1)) * game.diff.bossHpMul);
    this.hp = this.maxHp;
    const variant = (encounter - 1) % NAMES.length;
    const mk = Math.floor((encounter - 1) / NAMES.length) + 1;
    this.name = NAMES[variant] + (mk > 1 ? ' MK ' + (ROMAN[mk] || mk) : '');
    this.accent = ACCENTS[variant];
    this.sprites = getBossSprites(this.accent);
    this.flame = getSprites().flames.blue;
    this.x = W / 2;
    this.y = -170;
    this.baseY = 215;
    this.state = 'intro';
    this.t = 0;
    this.phase = 1;
    this.swayT = 0;
    this.attackTimer = 1.4;
    this.pattern = null;
    this.lastPattern = '';
    this.laser = { state: 'off', t: 0 };
    this.hitFlash = 0;
    this.invuln = 0;
    this.nextBoom = 0;
    this.smokeTimer = 0;
  }

  /** Bullets collide with the hull only while fighting. */
  get solid() {
    return this.state === 'fight';
  }

  update(dt) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    switch (this.state) {
      case 'intro': {
        const k = clamp(this.t / CONFIG.boss.introTime, 0, 1);
        this.y = lerp(-170, this.baseY, easeOutCubic(k));
        if (Math.random() < 0.5) {
          const [ex, ey] = pick(ENGINES);
          this.game.particles.glow(this.x + ex, this.y + ey - 18, rand(6, 12), '#6f9bff', 0.4, 0, rand(-80, -40));
        }
        if (k >= 1) {
          this.state = 'fight';
          this.game.shake(5);
        }
        break;
      }
      case 'fight':
        this.move(dt);
        this.updateLaser(dt);
        this.updateAttacks(dt);
        this.emitDamage(dt);
        break;
      case 'dying':
        this.updateDeath(dt);
        break;
    }
  }

  move(dt) {
    const L = this.laser;
    const p = this.game.player;
    if (L.state === 'charge') {
      this.x += clamp(p.x - this.x, -95 * dt, 95 * dt);
    } else if (L.state !== 'fire') {
      this.swayT += dt * (0.45 + 0.12 * (this.phase - 1));
      const tx = W / 2 + Math.sin(this.swayT) * (85 + 15 * this.phase);
      this.x += (tx - this.x) * Math.min(1, dt * 1.8);
    }
    this.x = clamp(this.x, 120, W - 120);
    this.y = this.baseY + Math.sin(this.t * 0.9) * (8 + 6 * (this.phase - 1));
  }

  cooldown() {
    const base = [1.3, 1.0, 0.75][this.phase - 1];
    const enc = Math.max(0.6, 1 - 0.08 * (this.encounter - 1));
    const preset = CONFIG.difficultyPresets[this.game.diffPreset] || CONFIG.difficultyPresets.normal;
    return (base * enc) / preset.fire;
  }

  updateAttacks(dt) {
    const pt = this.pattern;
    if (pt) {
      pt.t += dt;
      while (pt.i < pt.ev.length && pt.ev[pt.i].at <= pt.t) pt.ev[pt.i++].fn();
      if (pt.t >= pt.dur) {
        this.pattern = null;
        this.attackTimer = this.cooldown();
      }
      return;
    }
    if (!this.game.player.alive) return;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0) this.pattern = this.makePattern(this.choosePattern());
  }

  minionCount() {
    let n = 0;
    for (const e of this.game.enemies) if (e.minion) n++;
    return n;
  }

  choosePattern() {
    const options = PATTERNS[this.phase].slice();
    if (this.encounter >= 2 && this.phase === 1) options.push('launch');
    const usable = options.filter((n) => n !== this.lastPattern && !(n === 'launch' && this.minionCount() >= CONFIG.boss.maxMinions));
    const name = pick(usable.length ? usable : ['aimed']);
    this.lastPattern = name;
    return name;
  }

  makePattern(name) {
    const ev = [];
    const at = (t, fn) => ev.push({ at: t, fn });
    const ph = this.phase;
    const enc = Math.min(3, this.encounter - 1);
    const audio = this.game.audio;
    let dur = 1;

    switch (name) {
      case 'fan': {
        const volleys = 2 + (ph >= 3 ? 1 : 0);
        const n = Math.min(13, 5 + 2 * (ph - 1) + Math.min(2, enc));
        const spread = 0.9 + 0.12 * ph;
        const step = spread / (n - 1);
        for (let v = 0; v < volleys; v++) {
          at(v * 0.55, () => {
            const [gx, gy] = PRONG_GUNS[v % 2];
            for (let i = 0; i < n; i++) this.fire(gx, gy, -spread / 2 + step * i + (v % 2 ? step / 2 : 0), 'boss', 0.95);
            audio.play('bossShoot');
          });
        }
        dur = volleys * 0.55 + 0.4;
        break;
      }
      case 'aimed': {
        const shots = 3 + ph + Math.min(2, enc);
        for (let i = 0; i < shots; i++) {
          at(i * 0.16, () => {
            for (const [gx, gy] of SIDE_GUNS) this.fireAimed(gx, gy, 'aimed', 1.15);
            audio.play('enemyShoot');
          });
        }
        dur = shots * 0.16 + 0.5;
        break;
      }
      case 'rain': {
        const n = 10 + 4 * ph + 2 * enc;
        for (let i = 0; i < n; i++) {
          at(i * 0.085, () => {
            this.fire(rand(-140, 140), rand(30, 55), rand(-0.12, 0.12), 'spread', 0.8);
            if (i % 3 === 0) audio.play('enemyShoot');
          });
        }
        dur = n * 0.085 + 0.6;
        break;
      }
      case 'ring': {
        const rings = 2 + (enc >= 1 ? 1 : 0);
        const n = 14 + 2 * enc;
        for (let r = 0; r < rings; r++) {
          at(r * 0.6, () => {
            const off = (r * 0.5 * TAU) / n + this.t * 0.7;
            for (let i = 0; i < n; i++) this.fire(CORE.x, CORE.y, off + (i * TAU) / n, 'boss', 0.7);
            audio.play('bossShoot');
          });
        }
        dur = rings * 0.6 + 0.5;
        break;
      }
      case 'laser':
        at(0, () => this.startLaser());
        dur = LASER_CHARGE + LASER_FIRE + 0.4;
        break;
      case 'launch': {
        const n = 2 + (ph >= 3 ? 1 : 0);
        for (let i = 0; i < n; i++) at(0.2 + i * 0.45, () => this.launchMinion());
        dur = 0.4 + n * 0.45;
        break;
      }
    }
    ev.sort((a, b) => a.at - b.at);
    return { name, t: 0, i: 0, ev, dur };
  }

  /** `theta` is measured from straight down; positive leans toward +x. */
  fire(lx, ly, theta, kind, speedMul = 1) {
    this.game.bossFire(this.x + lx, this.y + ly, theta, kind, speedMul);
  }

  fireAimed(lx, ly, kind, speedMul) {
    const p = this.game.player;
    const x = this.x + lx;
    const y = this.y + ly;
    this.game.bossFire(x, y, clamp(Math.atan2(p.x - x, p.y - y), -1, 1), kind, speedMul);
  }

  startLaser() {
    this.laser.state = 'charge';
    this.laser.t = 0;
    this.game.audio.play('laserCharge');
  }

  updateLaser(dt) {
    const L = this.laser;
    if (L.state === 'off') return;
    L.t += dt;
    if (L.state === 'charge' && L.t >= LASER_CHARGE) {
      L.state = 'fire';
      L.t = 0;
      this.game.audio.play('laserFire');
      this.game.shake(4);
    } else if (L.state === 'fire') {
      if (Math.random() < 0.6) this.game.particles.hitSpark(this.x + rand(-12, 12), H - rand(0, 20), this.accent);
      if (L.t >= LASER_FIRE) L.state = 'off';
    }
  }

  laserHits(px, py, r) {
    const L = this.laser;
    return this.state === 'fight' && L.state === 'fire' && L.t > 0.05 && L.t < LASER_FIRE - 0.1 && py > this.y && Math.abs(px - this.x) < 13 + r;
  }

  launchMinion() {
    const game = this.game;
    if (this.minionCount() >= CONFIG.boss.maxMinions || !game.player.alive) return;
    const hx = this.x + HANGAR[0];
    const hy = this.y + HANGAR[1];
    const e = new Enemy('interceptor');
    const path = new Path(buildMinionRun(hx, hy, game.player));
    e.follow(path, CONFIG.dive.speed * 1.05 * game.diff.enemySpeed, 'remove');
    e.state = 'diving';
    e.diving = true;
    e.minion = true;
    e.x = hx;
    e.y = hy;
    if (game.diff.diveShots > 0) e.fireMarks = [path.length * 0.35];
    game.enemies.push(e);
    game.particles.glow(hx, hy, 26, '#ff9a3c', 0.3);
    game.audio.play('launch');
  }

  emitDamage(dt) {
    if (this.phase < 2) return;
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = this.phase === 3 ? 0.08 : 0.16;
    const [dx, dy] = pick(DAMAGE_POINTS[this.phase]);
    this.game.particles.smokePuff(this.x + dx, this.y + dy, rand(6, 10));
    if (Math.random() < 0.4) this.game.particles.glow(this.x + dx, this.y + dy, 8, '#ff7a2a', 0.3, 0, -20);
  }

  /** 2 = core hit (double damage), 1 = hull hit, 0 = miss. */
  hitTest(bx, by, br) {
    const lx = bx - this.x;
    const ly = by - this.y;
    if (ly < -125 || ly > 120 || lx < -180 || lx > 180) return 0;
    let dx = lx - CORE.x;
    let dy = ly - CORE.y;
    let r = CORE.r + br;
    if (dx * dx + dy * dy < r * r) return 2;
    for (const [cx, cy, cr] of HULL) {
      dx = lx - cx;
      dy = ly - cy;
      r = cr + br;
      if (dx * dx + dy * dy < r * r) return 1;
    }
    return 0;
  }

  takeDamage(amount, bx, by) {
    if (this.state !== 'fight') return;
    const particles = this.game.particles;
    if (this.invuln > 0) {
      particles.hitSpark(bx, by, '#9aa4b8');
      return;
    }
    this.hp -= amount;
    this.hitFlash = 0.05;
    particles.hitSpark(bx, by, amount > 1 ? '#ffffff' : this.accent);
    this.game.audio.play(amount > 1 ? 'coreHit' : 'hit');
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    const ratio = this.hp / this.maxHp;
    const ph = ratio <= 1 / 3 ? 3 : ratio <= 2 / 3 ? 2 : 1;
    if (ph > this.phase) this.enterPhase(ph);
  }

  enterPhase(ph) {
    const game = this.game;
    this.phase = ph;
    this.invuln = 1.2;
    this.pattern = null;
    this.laser.state = 'off';
    this.attackTimer = 1.4;
    for (const [dx, dy] of DAMAGE_POINTS[ph].slice(0, 4)) {
      game.particles.explosion(this.x + dx, this.y + dy, { color: this.accent, size: 1.3 });
    }
    game.shake(10);
    game.flash('#ffffff', 0.3);
    game.audio.play('bossPhase');
    game.particles.text(this.x, this.y + 140, 'HULL BREACH', '#ffb02e', 22, 1.4);
  }

  die() {
    this.state = 'dying';
    this.t = 0;
    this.pattern = null;
    this.laser.state = 'off';
    this.nextBoom = 0;
    this.game.onBossDying(this);
  }

  updateDeath(dt) {
    const game = this.game;
    this.y += 10 * dt;
    this.nextBoom -= dt;
    if (this.nextBoom <= 0) {
      this.nextBoom = rand(0.08, 0.16);
      const a = rand(0, TAU);
      const r = Math.sqrt(Math.random());
      game.particles.explosion(this.x + Math.cos(a) * r * 140, this.y + Math.sin(a) * r * 80, {
        color: pick([this.accent, '#ff9a3c', '#ffd27a']),
        size: rand(0.8, 1.6),
      });
      game.audio.play('explode');
      game.shake(4);
    }
    if (this.t >= 2.8) {
      this.state = 'dead';
      game.particles.explosion(this.x, this.y, { color: '#ffd27a', size: 4 });
      for (let i = 0; i < 4; i++) {
        game.particles.explosion(this.x + rand(-120, 120), this.y + rand(-60, 60), { color: this.accent, size: 2 });
      }
      game.flash('#ffffff', 0.85);
      game.shake(18);
      game.audio.play('bossDefeat');
      game.onBossDestroyed(this);
    }
  }

  draw(ctx) {
    if (this.state === 'dead') return;
    const spr = this.sprites[this.phase - 1];
    const dying = this.state === 'dying';
    const x = this.x + (dying ? rand(-3, 3) : 0);
    const y = this.y + (dying ? rand(-2, 2) : 0);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1); // flames point backward, which is up for this ship
    ctx.globalCompositeOperation = 'lighter';
    const fl = 1 + 0.15 * Math.sin(this.t * 30) + (this.state === 'intro' ? 0.8 : 0);
    for (const [ex, ey] of ENGINES) ctx.drawImage(this.flame, ex - 8, -ey, 16, 28 * fl);
    ctx.restore();

    ctx.drawImage(spr.canvas, x - spr.w / 2, y - spr.h / 2, spr.w, spr.h);
    const invulnBlink = this.invuln > 0 && Math.sin(this.t * 40) > 0;
    if (this.hitFlash > 0 || invulnBlink || dying) {
      ctx.globalAlpha = this.hitFlash > 0 ? 0.3 : dying ? 0.2 + 0.2 * Math.sin(this.t * 30) : 0.3;
      ctx.drawImage(spr.flash, x - spr.w / 2, y - spr.h / 2, spr.w, spr.h);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';
    const L = this.laser;
    let core = 24 * (1 + 0.15 * Math.sin(this.t * (3 + this.phase * 2)));
    if (L.state === 'charge') core *= 1 + (L.t / LASER_CHARGE) * 0.9;
    if (L.state === 'fire') core *= 1.8;
    ctx.drawImage(getGlow(CORE_COLORS[this.phase - 1]), x + CORE.x - core, y + CORE.y - core, core * 2, core * 2);
    if (Math.sin(this.t * 5) > 0.3) {
      const glow = getGlow(this.accent);
      for (const [gx, gy] of SIDE_GUNS) ctx.drawImage(glow, x + gx - 8, y + gy - 22, 16, 16);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawLaser(ctx) {
    const L = this.laser;
    if (L.state === 'off' || this.state !== 'fight') return;
    const x = this.x;
    const y0 = this.y + CORE.y + 12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (L.state === 'charge') {
      const k = L.t / LASER_CHARGE;
      ctx.globalAlpha = 0.3 + 0.5 * k * (0.6 + 0.4 * Math.sin(L.t * 40));
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1.5 + 2.5 * k;
      ctx.setLineDash([12, 9]);
      ctx.lineDashOffset = -L.t * 120;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = this.accent;
      const py = CONFIG.player.y;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * 30, py - 12);
        ctx.lineTo(x + s * 18, py);
        ctx.lineTo(x + s * 30, py + 12);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const fadeIn = Math.min(1, L.t / 0.08);
      const fadeOut = L.t > LASER_FIRE - 0.15 ? Math.max(0, (LASER_FIRE - L.t) / 0.15) : 1;
      const w = (30 + Math.sin(L.t * 60) * 3) * fadeIn * fadeOut;
      if (w > 0.5) {
        const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, hexToRgba(this.accent, 0));
        g.addColorStop(0.28, hexToRgba(this.accent, 0.6));
        g.addColorStop(0.44, '#ffd6e0');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(0.56, '#ffd6e0');
        g.addColorStop(0.72, hexToRgba(this.accent, 0.6));
        g.addColorStop(1, hexToRgba(this.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - w, y0, w * 2, H - y0);
        ctx.drawImage(getGlow(this.accent), x - w * 2, H - w * 2, w * 4, w * 4);
      }
    }
    ctx.restore();
  }
}
