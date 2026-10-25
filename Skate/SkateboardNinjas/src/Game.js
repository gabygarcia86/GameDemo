// Ties the systems together: game states, the fixed-timestep loop, input
// routing, and the rules that connect movement to scoring, sound and UI.
//
// States: title (with a self-playing demo) → countdown → playing → ending
// (time's up, waiting for a safe landing) → results. Any active state can be
// paused.

import { CONFIG } from './config.js';
import { RNG, randomSeed, dailySeed, todayKey } from './rng.js';
import { Physics, lerp } from './Physics.js';
import { World } from './World.js';
import { LevelGenerator } from './LevelGenerator.js';
import { Player } from './Player.js';
import { TrickSystem, comboTrickName } from './TrickSystem.js';
import { GrindSystem } from './GrindSystem.js';
import { CollisionSystem } from './CollisionSystem.js';
import { ScoringSystem } from './ScoringSystem.js';
import { Particles } from './Particles.js';
import { Renderer } from './Renderer.js';
import { updateKaren, hitKaren, killKaren } from './Karen.js';
import { Shurikens } from './Shurikens.js';

const P = CONFIG.physics;
const S = CONFIG.scoring;
const RUN = CONFIG.run;
const STEP = P.step;
const START_X = 0;
const UNITS_PER_METER = 40;
const DIRS = ['up', 'down', 'left', 'right'];
const ACTIVE = new Set(['countdown', 'playing', 'ending']);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const KAREN_DEBRIS = ['#36c0ae', '#f4d35e', '#f7c6a3', '#a0522d'];
const NINJA_DEBRIS = ['#d62839', '#1c0c16', '#e9edf7', '#9c1a2b'];

export class Game {
  constructor({ canvas, hud, input, audio, storage }) {
    this.canvas = canvas;
    this.hud = hud;
    this.input = input;
    this.audio = audio;
    this.storage = storage;

    this.world = new World();
    this.level = new LevelGenerator(this.world);
    this.player = new Player();
    this.tricks = new TrickSystem();
    this.grind = new GrindSystem(this.world);
    this.collision = new CollisionSystem(this.world);
    this.scoring = new ScoringSystem();
    this.particles = new Particles();
    this.stars = new Shurikens();
    this.renderer = new Renderer(canvas);
    this.fx = new RNG(randomSeed()); // cosmetic randomness, separate from the level seed

    this.state = 'title';
    this.pausedFrom = null;
    this.mode = 'random';
    this.seed = 0;
    this.elapsed = 0;
    this.simTime = 0;
    this.countdown = 0;
    this.endTimer = 0;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.best = storage.get('best', 0);
    this.demoTrick = false;

    const params = new URLSearchParams(location.search);
    const seedParam = params.get('seed');
    this.urlSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : null;
    if (params.get('debug') === '1') CONFIG.debug = true;

    this.scoring.onBank = (total) => this.onBank(total);
    this.scoring.onDrop = (lost) => this.onDrop(lost);
    this.onStarHit = this.onStarHit.bind(this);
    this.frame = this.frame.bind(this);
    this.onInput = this.onInput.bind(this);
  }

  init() {
    this.hud.bind({
      play: () => this.newRun('random'),
      daily: () => this.newRun('daily'),
      again: () => this.newRun(this.mode),
      resume: () => this.resume(),
      restart: () => this.newRun(this.mode),
      title: () => this.enterTitle(),
      pause: () => this.pause(),
      toggleSfx: () => this.toggleSfx(),
      toggleMusic: () => this.toggleMusic(),
      fullscreen: () => this.toggleFullscreen(),
    });
    this.input.attach({
      canvas: this.canvas,
      ollieButton: document.getElementById('ollie-btn'),
      backflipButton: document.getElementById('backflip-btn'),
      starButton: document.getElementById('star-btn'),
      flipStick: document.getElementById('flip-stick'),
      grabStick: document.getElementById('grab-stick'),
    });
    this.hud.setToggles(this.audio.sfxOn, this.audio.musicOn);

    const el = document.documentElement;
    if (!el.requestFullscreen && !el.webkitRequestFullscreen) document.getElementById('fullscreen-btn').hidden = true;

    // Audio can only start after a user gesture; unlock on the first one so the
    // menu music plays on the title screen without waiting for PLAY.
    const unlock = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    let pending = false;
    const onResize = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; this.resize(); });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.suspend();
      } else if (this.state !== 'paused') {
        this.audio.resume();
      }
    });

    this.resize();
    this.enterTitle();
    requestAnimationFrame(this.frame);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.resize(r.width || window.innerWidth, r.height || window.innerHeight, this.hud.controlsHeight());
  }

  // ------------------------------------------------------------ state changes

  setupWorld(seed, attract) {
    this.seed = seed;
    this.world.reset();
    this.level.reset(new RNG(seed), START_X, { attract });
    this.player.reset(START_X);
    this.tricks.resetAir();
    this.scoring.reset();
    this.scoring.enabled = !attract;
    this.particles.clear();
    this.stars.clear();
    this.elapsed = 0;
    this.simTime = 0;
    this.endTimer = 0;
    this.accumulator = 0;
    this.renderer.camY = 0;
    this.renderer.ninja.reset();
    this.level.update(START_X - this.renderer.viewW, this.renderer.viewW, START_X, P.baseSpeed, 0);
  }

  enterTitle() {
    this.state = 'title';
    this.input.gameplay = false;
    this.input.clear();
    this.audio.quiet = true;
    this.audio.setLoops(0, false);
    this.audio.stopSong();
    this.audio.resume();
    this.hud.setPlaying(false);
    this.hud.showScreen('title');
    this.hud.setTitleScores(this.best, this.storage.get(`daily.${todayKey()}`, 0));
    this.setupWorld(randomSeed(), true);
  }

  newRun(mode) {
    this.audio.unlock();
    this.audio.quiet = false;
    this.audio.playSong();
    this.mode = mode;
    const seed = mode === 'daily' ? dailySeed() : this.urlSeed !== null ? this.urlSeed : randomSeed();
    this.setupWorld(seed, false);
    this.state = 'countdown';
    this.countdown = RUN.countdown;
    this.input.gameplay = false;
    this.input.clear();
    this.hud.setPlaying(true);
    this.hud.showScreen('countdown');
    this.hud.countdown(RUN.countdown);
    this.audio.play('beep');
  }

  pause() {
    if (!ACTIVE.has(this.state)) return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.input.gameplay = false;
    this.input.clear();
    this.hud.showScreen('pause');
    this.audio.setLoops(0, false);
    this.audio.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom;
    this.input.gameplay = this.state === 'playing';
    this.accumulator = 0;
    this.hud.showScreen(this.state === 'countdown' ? 'countdown' : null);
    this.audio.resume();
  }

  beginEnding() {
    this.state = 'ending';
    this.input.gameplay = false;
    this.input.clear();
    this.endTimer = 0;
    this.hud.announce('TIME!', '', 'big');
    this.audio.play('timeUp');
    const p = this.player;
    if (p.state === 'grinding') p.exitRail();
    else if (p.grounded) this.scoring.bank();
  }

  updateEnding(dt) {
    this.endTimer += dt;
    const p = this.player;
    if (p.grounded && this.scoring.combo.active) this.scoring.bank();
    const settled = p.grounded && !this.scoring.combo.active;
    if ((settled && this.endTimer >= RUN.resultsDelay) || this.endTimer >= RUN.endGraceMax + RUN.resultsDelay) this.finish();
  }

  finish() {
    this.state = 'results';
    this.input.gameplay = false;
    this.input.clear();
    this.audio.setLoops(0, false);
    const s = this.scoring;
    const score = s.score;
    const newBest = score > 0 && score > this.best;
    if (newBest) {
      this.best = score;
      this.storage.set('best', score);
    }
    const dayKey = todayKey();
    if (this.mode === 'daily' && score > this.storage.get(`daily.${dayKey}`, 0)) this.storage.set(`daily.${dayKey}`, score);
    this.hud.setPlaying(false);
    this.hud.showResults({
      ...s.stats,
      score,
      distance: (this.player.x - START_X) / UNITS_PER_METER,
      newBest,
      mode: this.mode,
      seed: this.seed,
      dayKey,
    });
    this.hud.showScreen('results');
    this.audio.play('results');
    if (newBest) this.particles.confetti(this.player.x, this.player.y, 30);
  }

  // ------------------------------------------------------------ loop

  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;

    this.input.drain(this.onInput);

    const running = this.state === 'title' || ACTIVE.has(this.state);
    if (running) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < P.maxStepsPerFrame) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps >= P.maxStepsPerFrame) this.accumulator = 0; // device too slow: drop time rather than spiral
    }

    // Menu music on the title and results screens, once any run song has finished.
    const menu = this.state === 'title' || this.state === 'results';
    if (menu && !this.audio.songActive && !this.audio.music.playing) this.audio.startMusic();
    this.audio.update();
    this.renderer.render(this, running ? this.accumulator / STEP : 1, running ? dt : 0);
    if (this.state !== 'title') this.hud.update(this, dt);
  }

  update(dt) {
    switch (this.state) {
      case 'title':
        this.updateAttract(dt);
        break;
      case 'countdown': {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n !== before && n > 0) {
          this.hud.countdown(n);
          this.audio.play('beep');
        }
        if (this.countdown <= 0) {
          this.state = 'playing';
          this.input.gameplay = true;
          this.hud.showScreen(null);
          this.hud.announce('SKATE!', '', 'big');
          this.audio.play('go');
        }
        break;
      }
      case 'playing':
      case 'ending':
        this.updateRun(dt);
        break;
    }
  }

  updateRun(dt) {
    const p = this.player;
    const playing = this.state === 'playing';
    this.simTime += dt;
    if (playing) this.elapsed = Math.min(RUN.duration, this.elapsed + dt);

    // After time's up the skater rolls to a stop, braking short of any gap.
    const cruise = lerp(P.baseSpeed, P.maxSpeed, this.elapsed / RUN.duration);
    const target = playing || !p.grounded ? cruise : 0;
    if (!playing && p.grounded) {
      for (const g of this.world.gaps) {
        const d = g.x - p.x - 25;
        if (g.x + g.w < p.x) continue;
        p.speed = Math.min(p.speed, Math.sqrt(Math.max(0, 2 * 900 * d)));
        break;
      }
    }
    p.update(dt, this.world, this.grind, target, this.simTime);
    this.handlePlayerEvents();

    if (p.state === 'airborne') {
      const started = this.tricks.update(dt, this.input.grabHeld);
      if (started) this.onTrickStarted(started.kind, started.def);
      if (this.tricks.holdPoints > 0) this.scoring.addRaw(this.tricks.holdPoints);
      if ((this.tricks.flip.def || this.tricks.grabbing) && this.fx.chance(0.5)) this.particles.trail(p.x - 10, p.y + 62);
    } else if (p.state === 'grinding') {
      this.grind.update(p, dt, this.scoring);
      if (this.fx.chance(0.6)) this.particles.sparks(p.x - 18 + this.fx.range(0, 36), p.y + P.railContact, 1);
    }

    for (const k of this.world.karens) {
      if (k.dead) continue;
      updateKaren(k, dt, p);
      if (k.justShouted && Math.abs(k.x - p.x) < this.renderer.viewW) this.audio.play(k.kind === 'ninja' ? 'evilLaugh' : 'karen');
    }
    this.stars.update(dt, this.world.karens, this.onStarHit);
    this.hud.setStarReady(this.stars.ready);
    this.world.update(dt);

    if (playing && p.state !== 'wipeout') {
      const hit = this.collision.update(p);
      for (const e of this.collision.events) this.onAvoid(e);
      if (hit) this.onCrash(hit);
    }

    this.scoring.update(dt, p.grounded);
    this.particles.update(dt);
    this.level.update(p.x - this.renderer.viewW * this.renderer.anchor, this.renderer.viewW, p.x, p.speed, this.elapsed);
    this.audio.setLoops(p.grounded ? Math.min(1, p.speed / P.maxSpeed) : 0, p.state === 'grinding');

    if (playing && this.elapsed >= RUN.duration) this.beginEnding();
    if (this.state === 'ending') this.updateEnding(dt);
  }

  // Title-screen demo: the ninja skates a hazard-free street on autopilot.
  updateAttract(dt) {
    const p = this.player;
    this.simTime += dt;
    p.update(dt, this.world, this.grind, 300, this.simTime);
    for (const e of p.events) {
      if (e === 'ollie' || e === 'rampLaunch' || e === 'rampOllie' || e === 'railPop') {
        this.tricks.resetAir();
        this.demoTrick = this.fx.chance(0.8);
      } else if (e === 'land' || e === 'railEnter') {
        this.tricks.resetAir();
        this.particles.dust(p.x, p.y, 4);
      }
    }
    p.events.length = 0;

    if (p.grounded) {
      for (const r of this.world.rails) {
        if (r.kind === 'combo') continue;
        const t = Physics.descendTime(0, P.jumpImpulse, r.h - P.railContact, P.gravity);
        if (!t) continue;
        const jumpX = r.x + 30 - p.speed * t;
        if (p.x >= jumpX && p.x < jumpX + 12) p.requestOllie();
      }
    }
    if (p.airborne && this.demoTrick && p.airTime > 0.1 && p.vy > 0) {
      this.demoTrick = false;
      this.tricks.request(this.fx.chance(0.55) ? 'flip' : 'grab', this.fx.pick(DIRS));
    }
    if (p.airborne) this.tricks.update(dt, false);
    if (p.state === 'grinding' && this.fx.chance(0.5)) this.particles.sparks(p.x - 18 + this.fx.range(0, 36), p.y + P.railContact, 1);
    this.particles.update(dt);
    this.level.update(p.x - this.renderer.viewW * this.renderer.anchor, this.renderer.viewW, p.x, p.speed, 0);
  }

  // ------------------------------------------------------------ input

  onInput(e) {
    switch (e.type) {
      case 'ollie':
        if (this.state === 'playing') this.player.requestOllie();
        break;
      case 'flip':
      case 'grab':
      case 'backflip':
        if (this.state === 'playing' && this.player.airborne) {
          const def = this.tricks.request(e.type, e.dir);
          if (def) this.onTrickStarted(e.type, def);
        }
        break;
      case 'star':
        if (this.state === 'playing' && this.player.state !== 'wipeout') this.throwStar();
        break;
      case 'pause':
        if (this.state === 'paused') this.resume();
        else this.pause();
        break;
      case 'confirm':
        if (this.state === 'title') this.newRun('random');
        else if (this.state === 'results') this.newRun(this.mode);
        else if (this.state === 'paused') this.resume();
        break;
      case 'mute': {
        this.audio.unlock();
        const on = !(this.audio.sfxOn || this.audio.musicOn);
        this.audio.setSfx(on);
        this.audio.setMusic(on);
        this.hud.setToggles(this.audio.sfxOn, this.audio.musicOn);
        break;
      }
    }
  }

  toggleSfx() {
    this.audio.unlock();
    this.audio.setSfx(!this.audio.sfxOn);
    this.hud.setToggles(this.audio.sfxOn, this.audio.musicOn);
    this.audio.play('click');
  }

  toggleMusic() {
    this.audio.unlock();
    this.audio.setMusic(!this.audio.musicOn);
    this.hud.setToggles(this.audio.sfxOn, this.audio.musicOn);
  }

  toggleFullscreen() {
    const d = document;
    const el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        return;
      }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const result = req && req.call(el, { navigationUI: 'hide' });
      if (result && result.then) {
        result
          .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
          .catch(() => {});
      }
    } catch {
      // Fullscreen refused (iframe, iOS Safari): the game still works windowed.
    }
  }

  // ------------------------------------------------------------ rules

  handlePlayerEvents() {
    const p = this.player;
    for (const e of p.events) {
      switch (e) {
        case 'ollie':
          this.tricks.resetAir();
          this.scoring.addAction('ollie', 'Ollie', S.ollie, true, false);
          this.audio.play('ollie');
          this.particles.dust(p.x - 10, p.y, 5);
          break;
        case 'rampLaunch':
          this.tricks.resetAir();
          this.scoring.addAction('launch', 'Launch', S.launch, true, false);
          this.audio.play('ollie');
          break;
        case 'rampOllie':
          this.tricks.resetAir();
          this.scoring.addAction('launch', 'Launch', S.launch, true, false);
          this.scoring.addAction('ollie', 'Ollie', S.ollie, true, false);
          this.audio.play('ollie');
          break;
        case 'lateOllie':
          this.scoring.addAction('ollie', 'Ollie', S.ollie, true, false);
          this.audio.play('ollie');
          break;
        case 'railPop':
        case 'railExit':
          this.tricks.resetAir();
          this.scoring.addAction('grindExit', 'Clean Exit', S.grindExit, false, false);
          this.audio.play(e === 'railPop' ? 'ollie' : 'land');
          break;
        case 'railEnter':
          this.onRailEnter();
          break;
        case 'land':
          this.onLand();
          break;
        case 'fell':
          this.crash('fell');
          break;
        case 'recover':
          this.particles.smoke(p.x, p.y);
          this.audio.play('poof');
          break;
      }
    }
    p.events.length = 0;
  }

  onTrickStarted(kind, def) {
    const v = this.scoring.addAction(def.id, def.name, def.score, true, true);
    this.audio.play(kind);
    this.audio.play('action', this.scoring.combo.distinct);
    this.hud.announce(def.name.toUpperCase(), `+${v}`);
    if (this.tricks.takeComboBonus()) {
      const name = comboTrickName(this.tricks.airFlip, this.tricks.airGrab);
      const b = this.scoring.addAction('flipgrab', name, CONFIG.tricks.flipGrabBonus, true, false);
      this.hud.announce(`${name.toUpperCase()}!`, `+${b} COMBO`, 'big');
      this.audio.play('combo');
    }
  }

  onRailEnter() {
    const p = this.player;
    if (this.tricks.landingQuality() === 'bail') {
      p.wipeout(200);
      this.crash('bail');
      return;
    }
    this.tricks.resetAir();
    this.scoring.addAction(`grind:${p.rail.kind}`, p.rail.name, 0, true, true);
    this.hud.announce(p.rail.name.toUpperCase(), '+50/s');
    this.audio.play('grind');
    this.particles.sparks(p.x, p.y + P.railContact, 8);
  }

  onLand() {
    const p = this.player;
    const quality = this.tricks.landingQuality();
    if (quality === 'bail') {
      p.wipeout(250);
      this.crash('bail');
      return;
    }
    this.tricks.resetAir();
    this.audio.play('land');
    this.particles.dust(p.x, p.y, 8);
    if (!this.scoring.combo.active) return;

    if (quality === 'clean' && p.airTime >= S.bigAirTime) this.scoring.addAction('bigair', 'Big Air', S.bigAir, true, true);
    if (quality === 'sketchy') this.floatAtPlayer('SKETCHY', '#ffb3c1', 18);
    const bonus = this.scoring.land(quality === 'clean');
    if (bonus > 0) this.floatAtPlayer(`CLEAN +${bonus}`, '#3de1ff', 17);
    if (this.state === 'ending') this.scoring.bank();
  }

  // Near misses and dodges keep an open combo going; if the skater is already
  // rolling, the link window stays open so the combo still banks.
  onAvoid(e) {
    const c = this.scoring.combo;
    const wasLinking = c.linking;
    const timer = c.linkTimer;
    let v;
    if (e.type === 'nearMiss') {
      v = this.scoring.addAction('nearmiss', 'Near Miss', S.nearMiss, true, false);
      this.scoring.stats.nearMisses++;
      this.floatAtPlayer(`NEAR MISS +${v}`, '#ffd23f', 17);
      this.audio.play('nearMiss');
    } else if (e.target.kind === 'ninja') {
      v = this.scoring.addAction('ninja', 'Ninja Dodge', S.ninjaDodge, true, false);
      this.scoring.stats.karensDodged++;
      this.floatAtPlayer(`NINJA DODGED +${v}`, '#ff4d4d', 18);
      this.audio.play('nearMiss');
    } else {
      v = this.scoring.addAction('karen', 'Karen Dodge', S.karenDodge, true, false);
      this.scoring.stats.karensDodged++;
      this.floatAtPlayer(`KAREN DODGED +${v}`, '#ff3d7f', 18);
      this.audio.play('nearMiss');
    }
    if (this.player.grounded) {
      c.linking = true;
      c.linkTimer = wasLinking ? timer : S.linkWindow * 0.5;
    }
  }

  throwStar() {
    const p = this.player;
    if (!this.stars.throw(p.x + 24, p.y + 62, p.speed)) return;
    p.throwTimer = 0.22;
    this.audio.play('throw');
  }

  // A ninja star blew up a Karen or evil ninja. Scores like a dodge.
  onStarHit(k) {
    const ninja = k.kind === 'ninja';
    killKaren(k);
    this.particles.explode(k.x, k.laneT * 22 + k.hop + k.h / 2, ninja ? NINJA_DEBRIS : KAREN_DEBRIS);
    this.renderer.addShake(8);
    this.audio.play('explode');
    const c = this.scoring.combo;
    const wasLinking = c.linking;
    const timer = c.linkTimer;
    const v = this.scoring.addAction('takedown', ninja ? 'Ninja Takedown' : 'Karen Takedown', S.takedown, true, false);
    if (v > 0) this.floatAtPlayer(`${ninja ? 'NINJA' : 'KAREN'} DOWN +${v}`, '#ff9f1c', 18);
    if (this.player.grounded) {
      c.linking = true;
      c.linkTimer = wasLinking ? timer : S.linkWindow * 0.5;
    }
  }

  onCrash(hit) {
    const p = this.player;
    p.wipeout(hit.kind === 'karen' ? 380 : 300);
    if (hit.kind === 'obstacle') this.world.knock(hit.target, p.speed);
    else hitKaren(hit.karen, this.fx);
    this.crash(hit.kind === 'karen' && hit.karen.kind === 'ninja' ? 'ninja' : hit.kind);
  }

  // Consequences of a wipeout that has just started.
  crash(kind) {
    const p = this.player;
    this.tricks.resetAir();
    this.scoring.drop();
    this.scoring.stats.wipeouts++;
    this.audio.play('crash');
    if (kind === 'karen') this.audio.play('karen');
    if (kind === 'ninja') this.audio.play('evilLaugh');
    this.renderer.addShake(kind === 'fell' ? 6 : 10);
    this.particles.dust(p.x, p.y, 12, 1.4);
    const label = kind === 'fell' ? 'SPLASH!' : kind === 'bail' ? 'BAILED!' : kind === 'obstacle' ? 'WIPEOUT!' : kind === 'ninja' ? 'SLASHED!' : 'KAREN\'D!';
    this.hud.announce(label, '', 'bad');
  }

  onBank(total) {
    if (total <= 0) return;
    const p = this.player;
    this.audio.play('bank');
    this.hud.showComboResult(total, 'banked');
    this.floatAtPlayer(`+${fmt(total)}`, '#4dff9a', 26);
    if (total >= 1500) {
      this.particles.confetti(p.x, p.y);
      const praise = total >= 5000 ? 'NINJA LEGEND!' : total >= 3000 ? 'SICK COMBO!' : 'NICE COMBO!';
      this.hud.announce(praise, `+${fmt(total)}`, 'good');
    }
  }

  onDrop(lost) {
    this.hud.showComboResult(lost, 'lost');
    this.floatAtPlayer(`-${fmt(lost)}`, '#ff6b6b', 22);
    this.audio.play('lost');
  }

  floatAtPlayer(text, color, size) {
    const r = this.renderer;
    const p = this.player;
    this.particles.text(text, r.toScreenX(p.x), r.toScreenY(p.y + 115), color, size);
  }
}
