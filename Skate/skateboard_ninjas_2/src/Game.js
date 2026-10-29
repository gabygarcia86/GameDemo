// The game: owns every system, runs the main loop and the state machine.
//
//   menu ──► customize ──► intro (countdown) ──► playing ⇄ paused
//     ▲                                            │
//     └────────────── gameover ◄── crashing ◄──────┘
//
// stats and settings are overlays on top of menu (settings also on pause).

import { THREE, initSharedMaterials, POINT_SCALE, setOutlinesVisible } from './gfx.js';
import { CONFIG, speedAt, speedLevelAt } from './config.js';
import { SaveData } from './storage.js';
import { ENVIRONMENTS, pickEnvironment } from './environments.js';
import { randomLook } from './cosmetics.js';
import { Track } from './Track.js';
import { Particles } from './Particles.js';
import { World } from './World.js';
import { Generator } from './Generator.js';
import { Player } from './Player.js';
import { CameraRig } from './CameraRig.js';
import { FxOverlay } from './FxOverlay.js';
import { Input } from './Input.js';
import { AudioManager } from './AudioManager.js';
import { Scoring } from './Scoring.js';
import { Missions } from './Missions.js';
import { UI } from './UI.js';
import { damp, clamp, isTouchDevice, formatInt } from './utils.js';

const S = CONFIG.scoring;
const STEP = 1 / 60;
// Showroom camera angle: in front of the ninja, who stands facing +X on the board.
const MENU_ORBIT = 2.35;

const CRASH_REASONS = {
  karen: ['A Karen demanded to speak to your face.', 'Karen 1, Ninja 0.', 'She did ask for the manager...'],
  ninja: ['The rival ninja had the high ground.', 'Ambushed by a rival clan!', 'Ninja vs ninja: the other one won.'],
  bear: ['The bear did not want a hug.', 'Un-bear-ably close.', 'Only you can prevent bear crashes.'],
  yeti: ['Turns out the yeti is real.', 'Abominable driving.', 'The yeti got a selfie. And you.'],
  rockAlien: ['That rock had a face.', 'Moon rocks: harder than they look.', 'Houston, we have a problem.'],
  alien: ['Abducted at full speed.', 'Take me to your leader... ouch.', 'A close encounter of the painful kind.'],
  fireball: ['Toasted!', 'Well done. Extra crispy.', 'The floor is literally lava.'],
  parkingOfficer: ['Ticketed for reckless skating.', 'The fine is your whole run.', 'Should have fed the meter.'],
  mime: ['That invisible wall was very real.', '...', 'Trapped in the box with them.'],
  hotdog: ['Covered in mustard.', 'You got relished.', 'Hot dog stand: 1, Ninja: 0.'],
  pigeons: ['A face full of feathers.', 'The pigeons were here first.', 'Coo coo... crash.'],
  scooter: ['Hit-and-scoot.', 'They did say "on your left".', 'Scooter 1, Ninja 0.'],
  rail: ['You have to jump onto rails!', 'Rail 1, shins 0.', 'Ollie first, grind second.'],
  backflip: ['Didn\'t quite make it round.', 'Stick the landing next time!', 'Backflip 1, Ninja 0.'],
  gap: ['The road ended. You did not.', 'Mind the gap!', 'Into the abyss!'],
  default: ['Face, meet obstacle.', 'That one came out of nowhere.', 'Ouch. Right in the board.', 'Bonk.'],
};
const OBSTACLE_NAMES = {
  barrier: 'a road barrier', crates: 'a crate stack', crate: 'a crate', boulder: 'a boulder', boulderSnow: 'a snowy boulder',
  cactusBig: 'a cactus (ouch)', hayStack: 'a hay stack', vending: 'a vending machine', snowman: 'a snowman', surfStand: 'some surfboards',
  stump: 'a tree stump', cones: 'traffic cones', lowBar: 'a hurdle', rocks: 'some rocks', cart: 'a shopping cart', hay: 'a hay bale',
  log: 'a log', roots: 'tree roots', snowdrift: 'a snowdrift', sandcastle: 'a sandcastle', cooler: 'a cooler', tumbleweed: 'a tumbleweed',
  beachBall: 'a beach ball', sign: 'a road sign', pipeBar: 'a pipe', banner: 'a banner', branch: 'a branch', surfRack: 'a surf rack',
  snowArch: 'a snowy log', neonSign: 'a neon sign', satellite: 'a crashed satellite', rover: 'a runaway rover',
  taxi: 'a taxi', dumpster: 'a dumpster', trashBags: 'some trash bags', scaffold: 'scaffolding',
};
const KO_CALLOUTS = {
  karen: 'KAREN POPPED!', ninja: 'NINJA DOWN!', bear: 'BEAR DOWN!', yeti: 'YETI TAMED!', rockAlien: 'ROCK ALIEN SMASHED!', alien: 'ALIEN ZAPPED!', scooter: 'SCOOTER SCRAPPED!',
  parkingOfficer: 'TICKET VOIDED!', mime: 'MIME SILENCED!', hotdog: 'HOT DOG STAND DOWN!', pigeons: 'PIGEONS SCATTERED!',
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Game {
  constructor() {
    this.save = new SaveData();
    this.settings = this.save.settings;
    const params = new URLSearchParams(location.search);
    if (params.has('debug')) CONFIG.debug = true;
    // ?env=snow (or sunset, daytime, night, beach, forest) forces one environment.
    this.forcedEnv = params.get('env');
    this.ui = new UI();
    this.audio = new AudioManager(this.settings);
    this.ui.onClick = () => this.audio.play('click');
    this.missions = new Missions(this.save);
    this.scoring = new Scoring();
    this.touch = isTouchDevice();

    this.canvas = document.getElementById('game-canvas');
    this.quality = this.resolveQuality();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    initSharedMaterials();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fovMin, 1, 0.1, 2600);
    this.track = new Track(this.scene);
    this.particles = new Particles(this.scene);
    this.world = new World(this.scene, this.track, this.particles);
    this.generator = new Generator(this.world);
    this.player = new Player(this.scene, this.save.look);
    this.cam = new CameraRig(this.camera, this.track);
    this.fx = new FxOverlay(document.getElementById('fx-canvas'));
    this.input = new Input(this.canvas, (a, e) => this.onAction(a, e));

    this.state = 'menu';
    this.dist = 0;
    this.speed = 0;
    this.time = 0;
    this.stars = CONFIG.shuriken.max;
    this.starRecharge = 0;
    this.starCd = 0;
    this.power = { magnet: 0, frenzy: 0 };
    this.missionTimer = 0;
    this.fpsAcc = { t: 0, n: 0 };
    this.viewShift = { x: 0, y: 0 };
    this.drag = null;

    this.applyQuality(false);
    this.env = ENVIRONMENTS[this.forcedEnv] || pickEnvironment(this.save.data.lastEnv);
    this.setEnvironment(this.env);
    this.bindUi();
    this.bindWindow();
    this.resize();
    this.goMenu();
    this.ui.setLoading(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ----------------------------------------------------------- settings

  resolveQuality() {
    const q = this.settings.quality;
    if (q !== 'auto') return q;
    return this.touch ? 'medium' : 'high';
  }

  applyQuality(rebuild = true) {
    this.quality = this.resolveQuality();
    const q = this.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    // Real shadows only on High (they double the draw calls); blob shadows always.
    const shadows = q === 'high';
    this.track.setShadows(shadows, q === 'high' ? 2048 : 1024);
    this.renderer.shadowMap.enabled = shadows;
    this.particles.setQuality(q);
    const outlines = q !== 'low';
    this.player.setOutlines(outlines);
    this.world.outlines = outlines;
    for (const e of [...this.world.enemies, ...this.world.karenPool, ...this.world.ninjaPool, ...Object.values(this.world.beastPools).flat()]) setOutlinesVisible(e.group, outlines);
    if (rebuild) {
      this.track.setEnvironment(this.env, q);
      this.resize();
    }
    const touchOn = this.settings.touch === 'on' || (this.settings.touch === 'auto' && this.touch);
    this.ui.setTouchMode(touchOn);
  }

  onSettingChanged(key) {
    if (key === 'music' || key === 'sfx' || key === 'ambience') this.audio.applyVolumes();
    if (key === 'quality' || key === 'touch') this.applyQuality(key === 'quality');
    if (key === 'showFps' && !this.settings.showFps) this.ui.fps(null);
    this.save.save();
  }

  setEnvironment(env) {
    this.env = env;
    this.track.setEnvironment(env, this.quality);
    this.world.setEnvironment(env);
    this.audio.setAmbience(env.ambience);
  }

  // ------------------------------------------------------------- wiring

  bindUi() {
    const ui = this.ui;
    ui.button('play-btn', () => this.startRun());
    ui.button('customize-btn', () => this.goCustomize());
    ui.button('stats-btn', () => {
      ui.renderStats(this.save);
      ui.showScreen('stats');
    });
    ui.button('stats-back', () => this.goMenu());
    ui.button('settings-btn', () => this.openSettings('menu'));
    ui.button('settings-done', () => this.closeSettings());
    ui.button('reset-progress', async () => {
      const ok = await ui.confirm('Reset ALL progress? Coins, unlocks, stats, missions and your look will be wiped.', 'RESET');
      if (ok) {
        this.save.reset();
        location.reload();
      }
    });
    ui.button('pause-btn', () => this.pause());
    ui.button('resume-btn', () => this.resume());
    ui.button('restart-btn', () => this.startRun());
    ui.button('pause-settings-btn', () => this.openSettings('pause'));
    ui.button('pause-menu-btn', () => this.goMenu());
    ui.button('go-restart', () => this.startRun());
    ui.button('go-customize', () => this.goCustomize());
    ui.button('go-menu', () => this.goMenu());
    ui.button('cz-start', () => this.startRun());
    ui.button('cz-back', () => this.goMenu());
    ui.button('cz-random', () => {
      const look = randomLook(this.save.data.unlocked, this.save.look);
      if (Math.random() < 0.35) look.board = look.board === 'longboard' ? 'hoverboard' : 'longboard';
      this.setLook(look);
    });
    // The star button fires on pointerdown for zero latency.
    const star = document.getElementById('star-btn');
    star.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.throwStar();
    });
    document.getElementById('flip-btn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.state === 'playing') this.player.backflip();
    });
    ui.bindSettings(this.settings, (k) => this.onSettingChanged(k));

    // Drag to spin the ninja on the customize screen. The screen overlay sits
    // above the canvas, so listen on it, starting only from the open area
    // around the panel (the panel keeps its own taps and scrolling).
    const czScreen = document.getElementById('customize');
    czScreen.addEventListener('pointerdown', (e) => {
      if (this.state !== 'customize' || e.target.closest('.custom-panel')) return;
      this.drag = { x: e.clientX, id: e.pointerId };
      czScreen.setPointerCapture?.(e.pointerId);
      czScreen.classList.add('dragging');
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.cam.orbitTarget -= (e.clientX - this.drag.x) * 0.012;
      this.drag.x = e.clientX;
    });
    const endDrag = () => {
      this.drag = null;
      czScreen.classList.remove('dragging');
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // Any first interaction unlocks audio (browser autoplay rules).
    const unlock = () => {
      this.audio.unlock();
      this.audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  bindWindow() {
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing' || this.state === 'intro') this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
        this.last = performance.now();
      }
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.resize(w, h, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
  }

  onAction(action, e) {
    this.audio.unlock();
    if (this.ui.confirmOpen) return;
    // Outside a run, Enter/Space on a focused button already clicks it.
    if (this.state !== 'playing' && e?.target?.closest?.('button, a, summary, input') && action !== 'pause' && action !== 'mute') return;
    if (action === 'mute') {
      const on = this.settings.music > 0 || this.settings.sfx > 0;
      if (on) {
        this.muted = { music: this.settings.music, sfx: this.settings.sfx };
        this.settings.music = 0;
        this.settings.sfx = 0;
      } else if (this.muted) {
        Object.assign(this.settings, this.muted);
      } else {
        this.settings.music = 60;
        this.settings.sfx = 80;
      }
      this.audio.applyVolumes();
      this.save.save();
      if (this.state === 'playing') this.ui.toast(on ? 'MUTED (M)' : 'SOUND ON', 'info');
      return;
    }
    switch (this.state) {
      case 'playing': {
        const p = this.player;
        if (action === 'left' || action === 'right') {
          if (p.moveLane(action === 'left' ? -1 : 1)) this.audio.play('whoosh');
        } else if (action === 'jump') p.jump();
        else if (action === 'slide') p.slide();
        else if (action === 'throw') this.throwStar();
        else if (action === 'flip') p.backflip();
        else if (action === 'pause') this.pause();
        break;
      }
      case 'paused':
        if (action === 'pause' && this.ui.current === 'pause') this.resume();
        break;
      case 'menu':
        if (action === 'confirm' && this.ui.current === 'menu') this.startRun();
        if (action === 'pause' && this.ui.current !== 'menu') this.goMenu();
        break;
      case 'gameover':
        if (action === 'confirm' || action === 'jump') this.startRun();
        break;
      case 'customize':
        if (action === 'pause') this.goMenu();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- states

  goMenu() {
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'crashing' || this.state === 'intro') {
      this.endRunEarly();
    }
    this.state = 'menu';
    this.input.playing = false;
    this.ui.showHud(false);
    this.ui.hideIntro(false);
    this.ui.renderMenu(this.save, this.missions);
    this.ui.showScreen('menu');
    this.audio.setDuck(1);
    this.toShowroom(1.0);
    this.cam.orbitTarget = MENU_ORBIT;
  }

  goCustomize() {
    this.state = 'customize';
    this.input.playing = false;
    this.ui.showHud(false);
    this.ui.buildCustomize(this.save, {
      pick: (key, color) => this.setLook({ ...this.save.look, [key]: color }),
      board: (type) => this.setLook({ ...this.save.look, board: type }),
      neon: (on) => this.setLook({ ...this.save.look, neon: on }),
      buy: (premium, key) => this.buy(premium, key),
    });
    this.ui.showScreen('customize');
    this.toShowroom(0.82);
    this.cam.orbitTarget = 2.0;
  }

  // Reset the scene to an empty road with the ninja riding slowly.
  toShowroom(zoom) {
    if (this.state !== 'menu' && this.state !== 'customize') return;
    this.world.reset();
    this.particles.clear();
    this.fx.clear();
    this.player.reset();
    this.player.setLook(this.save.look);
    this.cam.zoom = zoom;
    this.cam.crashT = 0;
  }

  setLook(look) {
    this.save.data.look = look;
    this.player.setLook(look);
    this.save.save();
    if (this.state === 'customize') this.ui.refreshCustomize(this.save);
  }

  async buy(premium, key) {
    const coins = this.save.data.coins;
    if (coins < premium.cost) {
      this.audio.play('error');
      await this.ui.confirm(`${premium.name} costs ${formatInt(premium.cost)} coins. You have ${formatInt(coins)}. Go collect some more!`, 'OK');
      return;
    }
    const ok = await this.ui.confirm(`Unlock ${premium.name} for ${formatInt(premium.cost)} coins? You can use it on any part.`, 'UNLOCK');
    if (!ok) return;
    this.save.data.coins -= premium.cost;
    this.save.data.unlocked.push(premium.id);
    this.audio.play('buy');
    this.setLook({ ...this.save.look, [key]: premium.color });
  }

  openSettings(from) {
    this.settingsReturn = from;
    this.ui.showScreen('settings');
  }

  closeSettings() {
    this.save.save();
    if (this.settingsReturn === 'pause') this.ui.showScreen('pause');
    else this.goMenu();
  }

  startRun() {
    this.audio.unlock();
    this.audio.startMusic();
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'crashing') this.endRunEarly();
    const env = ENVIRONMENTS[this.forcedEnv] || pickEnvironment(this.save.data.lastEnv);
    this.save.data.lastEnv = env.id;
    this.save.save();
    if (env !== this.env) this.setEnvironment(env);
    else this.audio.setAmbience(env.ambience);

    this.world.reset();
    this.particles.clear();
    this.fx.clear();
    this.player.reset();
    this.player.setLook(this.save.look);
    this.scoring.reset();
    this.speedLevel = 0;
    this.missions.begin(env);
    this.generator.reset(env, (Math.random() * 2 ** 31) | 0);
    this.track.setBendInstant(0, 0);
    this.dist = 0;
    this.speed = CONFIG.speed.countdownRoll;
    this.stars = CONFIG.shuriken.max;
    this.starRecharge = 0;
    this.starCd = 0;
    this.power = { magnet: 0, frenzy: 0 };
    this.world.magnet = 0;
    this.runTime = 0;
    this.runBanked = false;
    this.crashTimer = 0;
    this.grindAcc = 0;
    this.cam.resetRun(this.player);
    this.cam.zoom = 1;

    this.state = 'intro';
    this.introT = 0;
    this.countStep = -1;
    this.input.playing = false;
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.ui.showIntro(env);
    this.audio.setDuck(1);
  }

  updateIntro(dt) {
    this.introT += dt;
    const marks = [0.9, 1.6, 2.3, 3.0];
    while (this.countStep + 1 < marks.length && this.introT >= marks[this.countStep + 1]) {
      this.countStep++;
      if (this.countStep < 3) {
        this.ui.countdown(String(3 - this.countStep));
        this.audio.play('beep');
      } else {
        this.ui.countdown('GO!');
        this.audio.play('go');
        this.ui.hideIntro();
        this.state = 'playing';
        this.input.playing = true;
      }
    }
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'intro') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.input.playing = false;
    this.ui.renderPauseMissions(this.missions.runStatus(this.scoring));
    this.ui.showScreen('pause');
    this.audio.setDuck(0.4);
    this.audio.setLoops({ board: this.player.look.board, speed: 0, grounded: false, grinding: false, level: 0 });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom || 'playing';
    this.input.playing = this.state === 'playing';
    this.ui.showScreen(null);
    this.audio.setDuck(1);
    this.last = performance.now();
  }

  // Leaving a run before it finished still counts toward the totals.
  endRunEarly() {
    if (this.runBanked || !this.runTime) return;
    this.bankRun(false);
  }

  // ---------------------------------------------------------- the run

  throwStar() {
    if (this.state !== 'playing' || this.player.crashed) return;
    if (this.starCd > 0) return;
    const frenzy = this.power.frenzy > 0;
    if (!frenzy && this.stars <= 0) {
      this.audio.play('error');
      return;
    }
    if (!frenzy) {
      if (this.stars === CONFIG.shuriken.max) this.starRecharge = 0;
      this.stars--;
    }
    this.starCd = frenzy ? CONFIG.shuriken.frenzyCooldown : CONFIG.shuriken.cooldown;
    this.world.throwStar(this.player.x, this.player.y, this.dist);
    this.player.throwStar();
    this.scoring.stats.starsThrown++;
    this.audio.play('throw');
  }

  award(points, label, cls = '') {
    const pts = this.scoring.action(points);
    if (label) this.ui.callout(`${label} <b>+${formatInt(pts)}</b>`, cls);
    if (this.scoring.combo % S.comboPerStep === 0 && this.scoring.mult > 1) {
      this.audio.play('combo', this.scoring.mult * 2);
      this.ui.callout(`COMBO <b>×${this.scoring.mult}</b>`, 'cyan');
    }
    return pts;
  }

  updatePlaying(dt) {
    this.runTime += dt;
    const target = speedAt(this.dist);
    this.speed = damp(this.speed, target, 1.6, dt);
    const level = speedLevelAt(this.dist);
    if (level > this.speedLevel) {
      this.speedLevel = level;
      if (speedAt(this.dist + CONFIG.speed.stepBlend) > speedAt(this.dist - 1)) {
        this.ui.callout(`${level * CONFIG.speed.stepEvery} M · SPEED UP!`, 'cyan');
        this.audio.play('whoosh');
      }
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps && this.state === 'playing'; i++) {
      const d = this.speed * h;
      this.dist += d;
      this.scoring.addDistance(d);
      this.player.update(h, this.world, this.dist, this.speed);
      this.generator.update(this.dist);
      this.track.origin = this.dist;
      this.world.update(h, this.player, this.dist, this.speed);
      this.handleEvents();
    }
    this.scoring.update(dt);

    // Ninja star supply.
    this.starCd = Math.max(0, this.starCd - dt);
    if (this.stars < CONFIG.shuriken.max) {
      this.starRecharge += dt / CONFIG.shuriken.recharge;
      if (this.starRecharge >= 1) {
        this.starRecharge = 0;
        this.stars++;
      }
    }
    // Power-ups.
    this.power.magnet = Math.max(0, this.power.magnet - dt);
    this.power.frenzy = Math.max(0, this.power.frenzy - dt);
    this.world.magnet = this.power.magnet;

    // Grinding pays out while you're on the rail.
    if (this.player.grind) {
      this.grindAcc += dt;
      this.scoring.stats.grind += dt;
      if (this.scoring.combo > 0) this.scoring.comboTimer = Math.max(this.scoring.comboTimer, 1);
      if (Math.random() < 0.9) this.particles.sparks(this.player.x, 0.82, this.dist, this.speed);
    }

    this.missionTimer -= dt;
    if (this.missionTimer <= 0) {
      this.missionTimer = 0.3;
      for (const done of this.missions.check(this.scoring)) {
        this.audio.play('mission');
        this.ui.toast(`${done.challenge ? 'CHALLENGE COMPLETE' : 'MISSION COMPLETE'}: ${done.text} <b>+${done.reward}</b>`, done.challenge ? 'challenge' : '');
      }
    }

    if (this.player.crashed) this.startCrash();
  }

  handleEvents() {
    const p = this.player;
    const sc = this.scoring;
    const st = sc.stats;
    const env = this.env;
    for (const e of p.events) {
      switch (e.type) {
        case 'jump':
          st.jumps++;
          this.audio.play('jump');
          break;
        case 'slide':
          st.slides++;
          this.audio.play('slide');
          break;
        case 'flipStart':
          this.audio.play('backflip');
          break;
        case 'trickStart':
          this.audio.play('whoosh');
          break;
        case 'land': {
          this.audio.play('land', e.air > 0.8);
          const dust = env.dust || (env.id === 'snow' ? '#ffffff' : env.id === 'beach' ? '#f3dc9e' : '#d8cfc4');
          if (!e.onRail) this.particles.landing(p.x, this.dist, this.speed, dust);
          if (e.air > 0.9 && this.settings.shake) this.cam.shake(0.18);
          if (e.trick?.backflip) {
            st.tricks++;
            st.backflips++;
            this.audio.play('trick');
            if (this.settings.shake) this.cam.shake(0.12);
            this.award(S.backflip * (e.fromRamp ? 1.5 : 1), e.fromRamp ? 'RAMP BACKFLIP!' : 'BACKFLIP!', 'good');
          } else if (e.trick) {
            if (e.trick.clean) {
              st.tricks++;
              this.audio.play('trick');
              this.award(S.trick * (e.fromRamp ? 1.5 : 1), `${e.trick.name}!`, 'good');
            } else {
              this.ui.callout('SKETCHY LANDING', 'bad');
            }
          } else if (e.fromRamp && e.air > 1.0) {
            this.award(S.ramp * 0.5, 'BIG AIR!');
          }
          break;
        }
        case 'ramp':
          st.ramps++;
          this.audio.play('ramp');
          this.award(S.ramp * (e.boosted ? 1.5 : 1), e.boosted ? 'MEGA LAUNCH!' : 'LAUNCH!', 'cyan');
          break;
        case 'grind':
          this.audio.play('grindStart');
          this.grindAcc = 0;
          this.ui.callout('GRIND!', 'cyan');
          break;
        case 'grindEnd':
          if (this.grindAcc > 0.3) this.award(S.grindPerSecond * this.grindAcc, `GRIND ${this.grindAcc.toFixed(1)}s`);
          this.grindAcc = 0;
          break;
        case 'ice':
          this.ui.callout('SLIPPERY!', 'cyan');
          break;
        case 'fall':
          this.audio.play('fall');
          break;
        case 'shieldHop':
          this.ui.callout('SHIELD HOP!', 'cyan');
          this.audio.play('jump');
          break;
        default:
          break;
      }
    }
    p.events.length = 0;

    for (const e of this.world.events) {
      switch (e.type) {
        case 'coin': {
          const streak = sc.coin();
          this.audio.play('coin', sc.coinStreak % 13);
          if (streak) this.ui.callout(`COIN STREAK ×${sc.coinStreak}`);
          break;
        }
        case 'avoid':
          st.avoided++;
          if (e.objType === 'fireball') st.fireballs++;
          if (e.how === 'jump') {
            st.jumpOvers++;
            if (e.objType === 'hay') st.hay++;
            if (e.objType === 'tumbleweed') st.tumbleweeds++;
            if (e.objType === 'rover') st.rovers++;
            this.award(S.jumpOver, null);
          } else if (e.how === 'slide') {
            st.slideUnders++;
            if (e.objType === 'branch') st.branches++;
            if (e.objType === 'satellite') st.satellites++;
            if (e.objType === 'scaffold') st.scaffolds++;
            this.award(S.slideUnder, null);
          } else if (e.how === 'near') {
            st.nearMisses++;
            this.audio.play('nearMiss');
            this.award(S.nearMiss, 'NEAR MISS!', 'good');
          }
          break;
        case 'bump':
          this.audio.play('bump');
          if (this.settings.shake) this.cam.shake(0.25);
          sc.breakCombo();
          this.ui.callout('BONK!', 'bad');
          break;
        case 'shieldBreak':
          this.audio.play('shieldBreak');
          this.fx.flash('#3de1ff', 0.35);
          if (this.settings.shake) this.cam.shake(0.3);
          this.ui.callout('SHIELD SAVED YOU!', 'cyan');
          break;
        case 'powerup':
          st.powerups++;
          this.audio.play('powerup');
          if (e.kind === 'magnet') this.power.magnet = CONFIG.powerups.magnet;
          else if (e.kind === 'frenzy') this.power.frenzy = CONFIG.powerups.frenzy;
          else p.shield = true;
          this.award(S.powerup, e.kind === 'magnet' ? 'COIN MAGNET!' : e.kind === 'frenzy' ? 'STAR FRENZY!' : 'SHIELD!', 'cyan');
          break;
        case 'chest':
          st.chests++;
          sc.bonusCoins += 25;
          this.audio.play('chest');
          this.award(150, 'TREASURE! +25 COINS', 'good');
          break;
        case 'ko':
          st.kos++;
          if (e.kind === 'karen') st.karens++;
          else if (e.kind === 'ninja') st.ninjas++;
          else st.beasts++;
          sc.bonusCoins += 2;
          this.audio.play('hit');
          this.audio.play('poof');
          this.audio.play(e.kind);
          if (this.settings.shake) this.cam.shake(0.08);
          this.award(S[e.kind], KO_CALLOUTS[e.kind], 'good');
          break;
        case 'pop':
          st.balls++;
          this.audio.play('pop');
          this.award(S.ball, 'BALL POPPED!');
          break;
        case 'voice':
          this.audio.play(e.kind);
          break;
        case 'enemyThrow':
          this.audio.play('enemyThrow');
          break;
        case 'impact':
          this.audio.play('impact');
          if (this.settings.shake) this.cam.shake(0.22);
          break;
        case 'splat':
          st.splats++;
          this.audio.play('splat');
          this.fx.splat(pick(['#c04dff', '#ff3df0', '#8cff3d']));
          this.ui.callout('SPLAT!', 'bad');
          break;
        case 'paintMiss':
          this.audio.play('whoosh');
          break;
        case 'iceCrossed':
          st.ice++;
          break;
        default:
          break;
      }
    }
    this.world.events.length = 0;
  }

  startCrash() {
    if (this.state !== 'playing') return;
    this.state = 'crashing';
    this.input.playing = false;
    this.crashTimer = 0;
    this.audio.play('crash');
    this.fx.flash('#ff2e55', 0.45);
    if (this.settings.shake) this.cam.shake(0.6);
    this.cam.crashT = 0;
    const cause = this.player.crashCause;
    this.crashReason = cause !== 'default' && CRASH_REASONS[cause]
      ? pick(CRASH_REASONS[cause])
      : `You hit ${OBSTACLE_NAMES[cause] || 'something'}. ${pick(CRASH_REASONS.default)}`;
    this.particles.poof(this.player.x, 0, this.dist + 1, this.speed * 0.2, ['#ffffff', '#ffe066', '#ff2e55']);
  }

  updateCrashing(dt) {
    this.crashTimer += dt;
    this.speed = damp(this.speed, 0, 3, dt);
    this.dist += this.speed * dt;
    this.track.origin = this.dist;
    this.world.update(dt, this.player, this.dist, this.speed);
    this.world.events.length = 0;
    this.player.update(dt, this.world, this.dist, this.speed);
    if (this.crashTimer >= CONFIG.player.crashToResults && this.state === 'crashing') this.finishRun();
  }

  // Bank coins and stats. finished=false when the player quit mid-run.
  bankRun(finished) {
    this.runBanked = true;
    const sc = this.scoring;
    const stats = this.save.stats;
    const env = this.env;
    const bonus = finished ? Math.floor(sc.score / S.scorePerBonusCoin) : 0;
    const m = finished ? this.missions.finish(sc) : { reward: 0, completed: [] };
    const rewards = [['Coins collected', sc.coins]];
    if (sc.bonusCoins) rewards.push(['KOs & treasure', sc.bonusCoins]);
    if (bonus) rewards.push(['Score bonus', bonus]);
    for (const c of m.completed) rewards.push([c.text, c.reward]);
    const total = sc.coins + sc.bonusCoins + bonus + m.reward;
    this.save.data.coins += total;

    const newBest = sc.score > stats.bestScore;
    stats.runs++;
    stats.bestScore = Math.max(stats.bestScore, Math.floor(sc.score));
    stats.bestDistance = Math.max(stats.bestDistance, Math.floor(sc.distance));
    stats.bestCoins = Math.max(stats.bestCoins, sc.coins);
    stats.bestCombo = Math.max(stats.bestCombo, sc.stats.bestCombo);
    stats.totalDistance += Math.floor(sc.distance);
    stats.totalCoins += sc.coins;
    stats.karens += sc.stats.karens;
    stats.ninjas += sc.stats.ninjas;
    stats.avoided += sc.stats.avoided;
    stats.jumps += sc.stats.jumps;
    stats.slides += sc.stats.slides;
    stats.tricks += sc.stats.tricks;
    stats.stars += sc.stats.starsThrown;
    stats.timePlayed += this.runTime;
    const pe = stats.perEnv[env.id];
    pe.runs++;
    pe.best = Math.max(pe.best, Math.floor(sc.distance));
    this.save.save();
    return { rewards: rewards.filter(([, v]) => v > 0), total, newBest };
  }

  finishRun() {
    this.state = 'gameover';
    const sc = this.scoring;
    const banked = this.bankRun(true);
    const stats = this.save.stats;
    this.ui.renderGameOver({
      title: pick(['WIPEOUT!', 'BAILED!', 'GAME OVER', 'OOF!']),
      reason: this.crashReason,
      newBest: banked.newBest,
      score: sc.score,
      distance: sc.distance,
      coins: sc.coins + sc.bonusCoins,
      stats: sc.stats,
      rewards: banked.rewards,
      rewardTotal: banked.total,
      bestScore: stats.bestScore,
      bestDistance: stats.bestDistance,
    });
    this.ui.showHud(false);
    this.ui.showScreen('gameover');
    this.audio.play('gameover');
    this.audio.setDuck(0.7);
  }

  // ------------------------------------------------------------ frame

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(err);
      if (!this.reportedError) {
        this.reportedError = true;
        this.ui.error(`Something went wrong: ${err.message}`);
      }
    }
  }

  tick(rawDt) {
    let dt = rawDt;
    if (this.state === 'crashing') dt *= this.crashTimer < 0.6 ? CONFIG.player.crashSlowMo : 1;
    const live = this.state === 'playing' || this.state === 'intro';
    const showroom = this.state === 'menu' || this.state === 'customize';
    this.track.advance(this.state === 'paused' ? 0 : dt, this.speed, live);

    switch (this.state) {
      case 'intro':
        this.speed = damp(this.speed, CONFIG.speed.countdownRoll, 2, dt);
        this.dist += this.speed * dt;
        this.updateIntro(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'crashing':
        this.updateCrashing(dt);
        break;
      case 'gameover':
        this.player.update(dt, this.world, this.dist, 0);
        break;
      case 'menu':
      case 'customize':
        this.speed = damp(this.speed, this.state === 'menu' ? 7 : 1.5, 2, dt);
        this.dist += this.speed * dt;
        break;
      default:
        break;
    }

    // World + visuals.
    const paused = this.state === 'paused';
    const vdt = paused ? 0 : dt;
    if (this.state === 'intro' || showroom || this.state === 'gameover') {
      this.track.origin = this.dist;
      this.world.update(vdt, this.player, this.dist, this.speed);
      this.world.events.length = 0;
    }
    this.track.update(vdt, this.dist, this.speed, this.camera);
    this.track.place(this.player.group, this.player.x, 0, this.dist);
    this.player.setGroundPitch(this.track.pitchAt(this.dist));
    if (showroom) this.player.animateShowroom(vdt);
    else this.player.animate(vdt, this.speed);
    this.particles.update(vdt, this.track, this.speed);

    // Hoverboard exhaust / snow spray.
    if (!paused && !this.player.crashed && (this.state === 'playing' || this.state === 'intro' || this.state === 'menu')) {
      const look = this.player.look;
      if (look.board === 'hoverboard' && Math.random() < 0.8) {
        // Sparks in both board colours (pads and neon trim), now and then white-hot.
        const pad = `#${this.player.board.mats.glowPad.color.getHexString()}`;
        const trim = `#${this.player.board.mats.glowTrim.color.getHexString()}`;
        const r = Math.random();
        const c = r < 0.12 ? '#ffffff' : look.neon && r < 0.56 ? trim : pad;
        this.particles.trail(this.player.x, this.player.y + 0.22, this.dist - 0.4, this.speed, c, true);
      } else if (look.board === 'longboard' && this.player.grounded && (this.env.id === 'snow' || this.env.id === 'beach') && Math.random() < 0.5) {
        this.particles.trail(this.player.x, 0.05, this.dist - 0.5, this.speed, this.env.id === 'snow' ? '#ffffff' : '#f3dc9e', false);
      }
    }

    // Camera.
    const mode = showroom ? 'showroom' : this.state === 'intro' ? 'intro' : this.state === 'crashing' || this.state === 'gameover' ? 'crash' : 'run';
    if (this.state === 'menu') this.cam.orbitTarget = MENU_ORBIT + Math.sin(this.time * 0.22) * 0.45;
    this.cam.update(paused ? 0.0001 : rawDt, { player: this.player, dist: this.dist, speed: this.speed, mode, shake: this.settings.shake });
    // Slide the picture so menu panels don't cover the ninja.
    const wide = this.width > this.height;
    const tx = showroom && wide ? (this.state === 'customize' ? 0.22 : 0.2) : 0;
    const ty = showroom && !wide ? (this.state === 'customize' ? -0.25 : -0.18) : 0;
    this.cam.viewShift = damp(this.cam.viewShift, tx, 5, rawDt);
    this.cam.viewShiftY = damp(this.cam.viewShiftY, ty, 5, rawDt);
    this.cam.applyViewShift(this.width, this.height);

    // Audio loops and ambience.
    const riding = this.state === 'playing' || this.state === 'intro' || this.state === 'menu';
    this.audio.setLoops({
      board: this.player.look.board,
      speed: this.speed,
      grounded: this.player.grounded,
      grinding: !!this.player.grind && this.state === 'playing',
      level: riding ? (this.state === 'menu' ? 0.35 : 1) : 0,
    });
    this.audio.updateAmbience(rawDt);

    // Screen effects + HUD.
    const speedFrac = clamp((this.speed - CONFIG.speed.start) / (CONFIG.speed.max - CONFIG.speed.start), 0, 1);
    this.fx.update(paused ? 0 : rawDt, {
      speedFrac: this.state === 'playing' ? speedFrac : 0,
      lines: this.settings.speedLines,
      boost: this.state === 'playing' && this.player.airborne && this.player.fromRamp ? 0.25 : 0,
    });
    if (this.state === 'playing' || this.state === 'intro' || this.state === 'paused') this.updateHud();

    POINT_SCALE.value = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.renderer.render(this.scene, this.camera);

    if (this.settings.showFps) {
      this.fpsAcc.t += rawDt;
      this.fpsAcc.n++;
      if (this.fpsAcc.t >= 0.5) {
        const info = this.renderer.info.render;
        this.ui.fps(`${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps · ${info.calls} calls · ${this.quality}`);
        this.fpsAcc.t = 0;
        this.fpsAcc.n = 0;
      }
    }
  }

  updateHud() {
    const sc = this.scoring;
    const powerups = [];
    if (this.power.magnet > 0) powerups.push({ kind: 'magnet', frac: this.power.magnet / CONFIG.powerups.magnet });
    if (this.player.shield) powerups.push({ kind: 'shield', frac: -1 });
    if (this.power.frenzy > 0) powerups.push({ kind: 'frenzy', frac: this.power.frenzy / CONFIG.powerups.frenzy });
    this.ui.updateHud({
      score: sc.score,
      distance: sc.distance,
      coins: sc.coins + sc.bonusCoins,
      combo: sc.combo,
      mult: sc.mult,
      comboFrac: sc.comboFraction,
      stars: this.stars,
      maxStars: CONFIG.shuriken.max,
      recharge: this.starRecharge,
      frenzy: this.power.frenzy > 0,
      powerups,
    });
  }
}
