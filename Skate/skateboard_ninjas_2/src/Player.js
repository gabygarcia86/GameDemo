// The player's ninja: movement in lane space (lane switching, jumping, sliding,
// ramps, rails, gaps, ice), tricks, side bumps, the crash tumble, and all of
// the procedural riding animation. update() pushes gameplay events into
// this.events for Game to score, play sounds and spawn effects.

import { THREE, dotTexture, starTexture, setOutlinesVisible } from './gfx.js';
import { CONFIG, laneX } from './config.js';
import { NinjaRig } from './models/ninja.js';
import { Board } from './models/board.js';
import { RAIL } from './models/props.js';
import { clamp, lerp, damp, easeOutCubic } from './utils.js';

const P = CONFIG.player;
const TRICK_TIME = 0.5;
const TRICKS = [
  { name: 'KICKFLIP', kind: 'flip', dir: 1 },
  { name: 'HEELFLIP', kind: 'flip', dir: -1 },
  { name: '360 SHOVE-IT', kind: 'shove', dir: 1 },
  { name: 'IMPOSSIBLE', kind: 'impossible', dir: 1 },
  { name: 'NINJA SPIN', kind: 'spin', dir: 1 },
  { name: 'VARIAL FLIP', kind: 'varial', dir: 1 },
  { name: 'SHURIKEN TWIST', kind: 'spin', dir: -1 },
  { name: 'HARDFLIP', kind: 'varial', dir: -1 },
];

export class Player {
  constructor(scene, look, outlines = true) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.visual = new THREE.Group();
    this.group.add(this.visual);

    this.board = new Board(look.board, outlines);
    this.visual.add(this.board.root);

    this.rider = new THREE.Group();
    this.visual.add(this.rider);
    this.rig = new NinjaRig({ outline: outlines });
    this.rig.root.scale.setScalar(0.88);
    this.rig.root.rotation.y = Math.PI / 2; // sideways stance, nose to the left of the body
    this.rider.add(this.rig.root);

    // Blob shadow (always on, even when real shadows are off).
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.7),
      new THREE.MeshBasicMaterial({ map: dotTexture(), color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.025;
    sh.renderOrder = 1;
    this.shadow = sh;
    this.group.add(sh);

    // Shield bubble: clear in the middle, glowing at the rim (fresnel).
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color('#3de1ff') } },
        vertexShader: `
          varying float vRim;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vec3 n = normalize(normalMatrix * normal);
            vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color;
          varying float vRim;
          void main() {
            gl_FragColor = vec4(color, pow(vRim, 2.5) * 0.9 + 0.04);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.bubble.position.y = 1.0;
    this.bubble.visible = false;
    this.group.add(this.bubble);

    // Dizzy stars after a crash.
    this.dizzy = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color: '#ffe066', depthWrite: false }));
      s.scale.setScalar(0.28);
      this.dizzy.add(s);
    }
    this.dizzy.visible = false;
    this.group.add(this.dizzy);

    this.setLook(look);
    this.reset();
  }

  setLook(look) {
    this.look = { ...look };
    this.rig.setColors(look);
    this.board.setLook(look);
    this.rider.position.y = this.board.deckTop;
  }

  setOutlines(on) {
    setOutlinesVisible(this.group, on);
  }

  reset() {
    this.lane = 1;
    this.prevLane = 1;
    this.x = 0;
    this.xFrom = 0;
    this.xTo = 0;
    this.laneT = 1;
    this.laneDur = P.laneSwitchTime;
    this.vx = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.airTime = 0;
    this.falling = false;
    this.fastFall = false;
    this.sliding = 0;
    this.slideQueued = false;
    this.jumpBuffer = 0;
    this.grind = null;
    this.grindTime = 0;
    this.onRamp = null;
    this.rampBoost = false;
    this.fromRamp = false;
    this.trick = null;
    this.flip = null;
    this.throwT = 0;
    this.stumbleT = 0;
    this.bumpCd = 0;
    this.onIce = false;
    this.crashed = false;
    this.crashT = 0;
    this.crashCause = null;
    this.time = 0;
    this.lastLaneChange = -10;
    this.lastJump = -10;
    this.lastSlide = -10;
    this.shield = false;
    this.events = [];
    this.lean = 0;
    this.trickVisual = { roll: 0, yaw: 0, pitch: 0, spin: 0 };
    this.rider.position.set(0, this.board.deckTop, 0);
    this.rider.rotation.set(0, 0, 0);
    this.board.root.position.set(0, 0, 0);
    this.board.root.rotation.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    this.dizzy.visible = false;
    this.rig.neutral();
  }

  get height() {
    return this.sliding > 0 ? P.slideHeight : P.height;
  }

  get airborne() {
    return !this.grounded && !this.grind;
  }

  // ------------------------------------------------------------- input

  moveLane(dir) {
    if (this.crashed) return false;
    const target = clamp(this.lane + dir, 0, CONFIG.lanes.count - 1);
    if (target === this.lane) {
      this.stumbleT = Math.max(this.stumbleT, 0.15);
      return false;
    }
    this.prevLane = this.lane;
    this.lane = target;
    this.xFrom = this.x;
    this.xTo = laneX(target);
    this.laneT = 0;
    this.laneDur = this.onIce ? P.iceSwitchTime : P.laneSwitchTime;
    this.lastLaneChange = this.time;
    if (this.grind) this.leaveRail(3);
    return true;
  }

  // Time until we land, from the current height and speed.
  timeToLand() {
    const g = P.gravity;
    const disc = this.vy * this.vy + 2 * g * Math.max(0, this.y);
    return (this.vy + Math.sqrt(disc)) / g;
  }

  jump() {
    if (this.crashed) return;
    if (this.grind) {
      this.events.push({ type: 'grindEnd', time: this.grindTime, jumped: true });
      this.grind = null;
      this.doJump(P.jumpVel);
      return;
    }
    if (this.grounded || this.coyote > 0) {
      if (this.onRamp) {
        this.rampBoost = true;
        return;
      }
      this.doJump(P.jumpVel);
      return;
    }
    // In the air: a trick, or a buffered jump if we're about to land.
    if (this.timeToLand() < 0.22) this.jumpBuffer = P.jumpBuffer;
    else if (!this.trick && !this.flip && !this.falling) {
      const def = TRICKS[Math.floor(Math.random() * TRICKS.length)];
      this.trick = { def, t: 0 };
      this.events.push({ type: 'trickStart', name: def.name });
    }
  }

  // Backflip: from the ground it launches a big jump with just enough air to
  // get round; in the air it starts from wherever you are. Touch down before
  // the rotation is finished (too late in a jump, slamming down, landing on a
  // rail early) and you crash.
  backflip() {
    if (this.crashed || this.flip || this.trick) return false;
    if (this.grind) {
      this.events.push({ type: 'grindEnd', time: this.grindTime, jumped: true });
      this.grind = null;
      this.doJump(P.flipVel);
    } else if (this.grounded || this.coyote > 0) {
      this.onRamp = null;
      this.doJump(P.flipVel);
    }
    this.flip = { t: 0 };
    this.jumpBuffer = 0;
    this.events.push({ type: 'flipStart' });
    return true;
  }

  doJump(v) {
    this.sliding = 0;
    this.grounded = false;
    this.coyote = 0;
    this.vy = v;
    this.airTime = 0;
    this.lastJump = this.time;
    this.events.push({ type: 'jump' });
  }

  slide() {
    if (this.crashed) return;
    // Nothing overhead is ever placed above a rail, so slide does nothing there.
    if (this.grind) return;
    if (!this.grounded) {
      this.fastFall = true;
      this.slideQueued = true;
      this.vy = Math.min(this.vy, -4);
      return;
    }
    if (this.sliding <= 0) this.events.push({ type: 'slide' });
    this.sliding = P.slideTime;
    this.lastSlide = this.time;
  }

  throwStar() {
    this.throwT = 0.28;
  }

  leaveRail(vy) {
    if (!this.grind) return;
    this.events.push({ type: 'grindEnd', time: this.grindTime });
    this.grind = null;
    this.grounded = false;
    this.vy = vy;
    this.airTime = 0;
    this.coyote = P.coyoteTime;
  }

  // Ran into the side of something while changing lanes: bounce back.
  bumpBack() {
    this.lane = this.prevLane;
    this.xFrom = this.x;
    this.xTo = laneX(this.lane);
    this.laneT = 0;
    this.laneDur = P.laneSwitchTime * 1.4;
    this.stumbleT = 0.5;
    this.bumpCd = P.bumpCooldown;
  }

  crash(cause) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashT = 0;
    this.crashCause = cause;
    this.sliding = 0;
    this.trick = null;
    this.flip = null;
    this.visual.position.z = 0;
    this.grind = null;
    this.crashStartY = this.y;
    this.events.push({ type: 'crash', cause });
  }

  // ------------------------------------------------------------ physics

  update(dt, world, dist, speed) {
    this.time += dt;
    if (this.crashed) {
      this.crashT += dt;
      return;
    }
    const prevX = this.x;
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / this.laneDur);
      const e = this.onIce ? this.laneT * this.laneT * (3 - 2 * this.laneT) : easeOutCubic(this.laneT);
      this.x = lerp(this.xFrom, this.xTo, e);
    }
    this.vx = (this.x - prevX) / Math.max(dt, 1e-4);

    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    if (this.sliding > 0) this.sliding = Math.max(0, this.sliding - dt);

    const surf = world.surfaceAt(this.x, dist, this.lane);
    const wasIce = this.onIce;
    this.onIce = surf.ice && (this.grounded || this.y < 0.2);
    if (this.onIce && !wasIce) this.events.push({ type: 'ice' });

    if (this.grind) {
      if (!world.railContains(this.grind, this.x, dist)) {
        this.leaveRail(2.5);
      } else {
        this.y = RAIL.top;
        this.grindTime += dt;
      }
    } else if (this.grounded) {
      if (surf.ramp) {
        this.y = surf.ramp.h;
        this.onRamp = surf.ramp.entity;
        this.sliding = 0;
      } else if (this.onRamp) {
        // Just rolled off the lip: launch.
        this.onRamp = null;
        this.grounded = false;
        this.vy = P.rampVel + (this.rampBoost ? P.rampJumpBonus : 0);
        this.airTime = 0;
        this.fromRamp = true;
        this.events.push({ type: 'ramp', boosted: this.rampBoost });
        this.rampBoost = false;
      } else {
        this.y = 0;
      }
      if (this.grounded && surf.rail && !this.falling) {
        // Rolled into a rail without jumping onto it. The shield bounces you
        // up onto it instead (like it does over gaps).
        if (this.shield) {
          this.doJump(7.4);
          this.events.pop(); // not a "real" jump for scoring
          this.sliding = 0;
          this.events.push({ type: 'shieldHop' });
        } else {
          this.crash('rail');
        }
      } else if (this.grounded && surf.gap && !this.shield) {
        this.grounded = false;
        this.falling = true;
        this.vy = 0;
        this.events.push({ type: 'fall' });
      } else if (this.grounded && surf.gap && this.shield) {
        // The shield bounces you over a gap instead.
        this.doJump(P.jumpVel * 1.1);
        this.events.push({ type: 'shieldHop' });
      }
    } else {
      const g = P.gravity + (this.fastFall ? P.fastFall : 0);
      this.vy -= g * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      let groundY = 0;
      let landRail = null;
      if (this.falling) groundY = -Infinity;
      else if (surf.rail && this.vy <= 0 && this.y >= RAIL.top - 0.3) {
        groundY = RAIL.top;
        landRail = surf.rail;
      } else if (surf.ramp) groundY = surf.ramp.h;
      else if (surf.gap) groundY = -Infinity;
      if (this.y <= groundY) this.land(groundY, landRail, surf);
      if (this.y < -0.9) this.crash('gap');
    }

    if (this.trick) this.trick.t += dt;
    if (this.flip) this.flip.t += dt;
  }

  land(groundY, rail, surf) {
    const air = this.airTime;
    this.y = groundY;
    this.vy = 0;
    this.grounded = !rail;
    this.fastFall = false;
    let trick = null;
    if (this.flip) {
      const done = this.flip.t >= P.flipTime * 0.9;
      this.flip = null;
      if (!done) {
        this.crash('backflip');
        return;
      }
      trick = { name: 'BACKFLIP', clean: true, backflip: true };
    }
    if (this.trick) {
      trick = { name: this.trick.def.name, clean: this.trick.t >= TRICK_TIME * 0.8 };
      this.trick = null;
    }
    this.events.push({ type: 'land', air, fromRamp: this.fromRamp, trick, onRail: !!rail });
    this.fromRamp = false;
    if (rail) {
      this.grind = rail;
      this.grindTime = 0;
      this.events.push({ type: 'grind' });
    } else if (surf.ramp) {
      this.onRamp = surf.ramp.entity;
    }
    if (this.slideQueued) {
      this.slideQueued = false;
      if (!rail) {
        this.sliding = P.slideTime;
        this.lastSlide = this.time;
        this.events.push({ type: 'slide' });
      }
    }
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      if (rail) {
        this.events.push({ type: 'grindEnd', time: 0, jumped: true });
        this.grind = null;
      }
      this.doJump(P.jumpVel);
    }
  }

  // ---------------------------------------------------------- animation

  animate(dt, speed, mode = 'run') {
    const rig = this.rig;
    const t = this.time;
    this.board.update(dt, this.crashed ? 0 : speed, this.airborne);
    rig.updateTails(dt, this.crashed ? 2 : speed);
    this.applyRainbow(t);

    if (this.crashed) {
      this.animateCrash(dt);
      return;
    }
    this.visual.position.y = this.y;

    // Lean into lane changes, wobble on stumbles and ice.
    const targetLean = clamp(-this.vx * 0.045, -0.42, 0.42);
    this.lean = damp(this.lean, targetLean, 14, dt);
    const wobble = this.stumbleT > 0 ? Math.sin(t * 34) * 0.3 * (this.stumbleT / 0.5) : 0;
    const ice = this.onIce ? Math.sin(t * 7) * 0.12 : 0;
    this.visual.rotation.set(0, this.lean * 0.4 + ice, this.lean + wobble, 'YXZ');

    // Trick rotations.
    const tv = this.trickVisual;
    if (this.trick) {
      const p = Math.min(1, this.trick.t / TRICK_TIME);
      const e = p * p * (3 - 2 * p);
      const k = this.trick.def.kind;
      const a = e * Math.PI * 2 * this.trick.def.dir;
      tv.roll = k === 'flip' || k === 'varial' ? a : 0;
      tv.yaw = k === 'shove' || k === 'varial' ? a : 0;
      tv.pitch = k === 'impossible' ? a : 0;
      tv.spin = k === 'spin' ? a : 0;
      tv.lift = Math.sin(p * Math.PI) * 0.35;
    } else {
      tv.roll = damp(tv.roll, 0, 20, dt);
      tv.yaw = damp(tv.yaw, this.grind ? Math.PI / 2 : 0, 18, dt);
      tv.pitch = damp(tv.pitch, 0, 20, dt);
      tv.spin = damp(tv.spin, 0, 20, dt);
      tv.lift = damp(tv.lift || 0, 0, 20, dt);
    }
    this.board.tilt.rotation.set(tv.pitch, tv.yaw, tv.roll + this.lean * 0.6);

    // Backflip: the whole ninja and board rotate backwards around the hips.
    if (this.flip) {
      const p = Math.min(1, this.flip.t / P.flipTime);
      const a = -p * p * (3 - 2 * p) * Math.PI * 2;
      const h = 0.9;
      this.visual.rotation.x = a;
      this.visual.position.y = this.y + h - h * Math.cos(a);
      this.visual.position.z = -h * Math.sin(a);
    } else {
      this.visual.position.z = 0;
    }
    this.visual.rotation.y += tv.spin;
    this.rider.position.y = this.board.deckTop + tv.lift;

    // Body pose.
    let hip = 0.56 - Math.min(0.08, speed * 0.002);
    let torsoX = 0.32;
    let torsoY = 0.35;
    let headY = 1.15;
    let armRaiseF = 1.05, armRaiseB = 0.85, armSwingF = 0.1, armSwingB = -0.1;
    const bob = Math.sin(t * 9) * 0.012;
    if (this.sliding > 0) {
      hip = 0.27;
      torsoX = 1.15;
      headY = 1.0;
      armRaiseF = 1.4;
      armRaiseB = 1.3;
      armSwingF = 0.6;
      armSwingB = -0.6;
    } else if (this.grind) {
      hip = 0.45;
      torsoX = 0.4;
      torsoY = 0.1;
      headY = 1.3;
      armRaiseF = 1.55 + Math.sin(t * 6) * 0.15;
      armRaiseB = 1.5 - Math.sin(t * 6) * 0.15;
    } else if (this.airborne) {
      const up = clamp(this.vy / 10, -1, 1);
      hip = 0.42 + up * 0.04;
      torsoX = 0.45;
      armRaiseF = 1.7 + up * 0.4;
      armRaiseB = 1.6 + up * 0.4;
      if (this.fromRamp && !this.trick) {
        // Grab the board on big airs.
        hip = 0.36;
        torsoX = 0.75;
        armRaiseF = 0.3;
        armSwingF = 0.9;
      }
    }
    rig.hips.position.y = hip + bob;
    rig.torso.rotation.set(torsoX, torsoY, 0);
    rig.head.rotation.set(-torsoX * 0.6, headY - torsoY, 0);
    const stance = 0.14;
    rig.setLeg(0, hip + bob, -stance);
    rig.setLeg(1, hip + bob, stance);
    const wob = Math.sin(t * 5.3) * 0.08;
    rig.setArm(1, armRaiseF + wob, armSwingF, 0.4);
    rig.setArm(0, armRaiseB - wob, armSwingB, 0.4);

    // Overhand shuriken throw with the front arm.
    if (this.throwT > 0) {
      const p = 1 - this.throwT / 0.28;
      const swing = p < 0.35 ? lerp(1.4, 2.9, p / 0.35) : lerp(2.9, 1.0, (p - 0.35) / 0.65);
      rig.setArm(1, swing, 0.4, 0.15);
      rig.torso.rotation.y = torsoY + Math.sin(p * Math.PI) * 0.5;
    }
    if (this.stumbleT > 0) {
      rig.setArm(0, 2.4 + Math.sin(t * 30) * 0.4, 0, 0.6);
      rig.setArm(1, 2.4 - Math.sin(t * 30) * 0.4, 0, 0.6);
    }

    // Shadow shrinks and fades as we go up.
    const h = Math.max(0, this.y - (this.grind ? RAIL.top : 0));
    const s = clamp(1 - h * 0.18, 0.4, 1);
    this.shadow.scale.set(s, s, 1);
    this.shadow.material.opacity = 0.42 * s;
    this.shadow.position.y = (this.grind ? RAIL.top : this.onRamp ? this.y : 0) + 0.025;
    this.shadow.visible = !this.falling;

    this.bubble.visible = this.shield;
    if (this.shield) {
      const p = 1 + Math.sin(t * 6) * 0.04;
      this.bubble.scale.set(p, p, p);
      this.bubble.position.y = this.y + 1.0;
    }
  }

  // Idle pose on the menu and customize screens.
  animateShowroom(dt) {
    this.time += dt;
    const t = this.time;
    const rig = this.rig;
    this.board.update(dt, 4, false);
    rig.updateTails(dt, 3);
    this.applyRainbow(t);
    this.visual.position.y = 0;
    this.visual.rotation.set(0, 0, Math.sin(t * 1.3) * 0.04);
    this.board.tilt.rotation.set(0, 0, Math.sin(t * 1.3) * 0.03);
    this.rider.position.y = this.board.deckTop;
    const hip = 0.58 + Math.sin(t * 2.2) * 0.02;
    rig.hips.position.y = hip;
    rig.torso.rotation.set(0.15, 0.6, 0);
    rig.head.rotation.set(-0.05, 0.4 + Math.sin(t * 0.7) * 0.25, 0);
    rig.setLeg(0, hip, -0.14);
    rig.setLeg(1, hip, 0.14);
    // A little wave every few seconds.
    const wave = (t % 5) < 1.4;
    rig.setArm(1, wave ? 2.7 : 0.5, wave ? 0.3 : 0.1, wave ? 0.6 + Math.sin(t * 14) * 0.5 : 0.4);
    rig.setArm(0, 0.45, -0.1, 0.5);
    this.shadow.visible = true;
    this.shadow.scale.set(1, 1, 1);
    this.shadow.material.opacity = 0.42;
    this.shadow.position.y = 0.025;
    this.bubble.visible = false;
    this.dizzy.visible = false;
  }

  animateCrash(dt) {
    const t = this.crashT;
    const rig = this.rig;
    if (this.crashCause === 'gap') {
      // Down the hole.
      this.visual.position.y = Math.max(-4, this.crashStartY - t * t * 10);
      this.shadow.visible = false;
      this.rider.rotation.x += dt * 4;
      return;
    }
    // Rider launches forward, tumbles, lands on their bottom; board flips away.
    const fly = Math.min(t, 0.75);
    const arc = Math.max(0, Math.sin((fly / 0.75) * Math.PI)) * 1.6;
    this.visual.position.y = Math.max(0, this.crashStartY * (1 - fly / 0.75));
    this.visual.rotation.set(0, 0, 0);
    this.rider.position.set(0, this.board.deckTop + arc, -fly * 3.2);
    this.rider.rotation.set(t < 0.75 ? -t * 9 : 0, 0, t < 0.75 ? Math.sin(t * 10) * 0.4 : 0);
    this.board.root.position.set(fly * 1.4, Math.max(0, Math.sin((fly / 0.75) * Math.PI) * 1.2), -fly * 1.8);
    this.board.root.rotation.set(fly * 7, fly * 5, fly * 9);
    if (t >= 0.75) {
      // Sitting, dazed.
      rig.hips.position.y = 0.2;
      rig.torso.rotation.set(-0.25, 0, Math.sin(t * 3) * 0.15);
      rig.head.rotation.set(0.1, 0.9 + Math.sin(t * 2.4) * 0.3, Math.sin(t * 3.1) * 0.2);
      rig.legs[0].thigh.rotation.set(-1.4, 0, -0.35);
      rig.legs[1].thigh.rotation.set(-1.4, 0, 0.35);
      rig.legs[0].knee.rotation.set(0.5, 0, 0);
      rig.legs[1].knee.rotation.set(0.5, 0, 0);
      rig.setArm(0, 0.6, -0.4, 0.3);
      rig.setArm(1, 0.6, -0.4, 0.3);
      this.rider.position.y = 0;
      this.board.root.position.y = 0.05;
      this.board.root.rotation.set(Math.PI, 0.7, 0.2);
      this.dizzy.visible = true;
      this.dizzy.position.set(0, 1.95, -2.4);
      this.dizzy.children.forEach((s, i) => {
        const a = t * 4 + (i / 5) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45);
      });
    } else {
      rig.setArm(0, 2.6, 0, 0.3);
      rig.setArm(1, 2.6, 0, 0.3);
      rig.hips.position.y = 0.5;
      rig.setLeg(0, 0.4, -0.2);
      rig.setLeg(1, 0.4, 0.2);
    }
    this.shadow.position.set(0, 0.025, -fly * 3.2);
  }

  applyRainbow(t) {
    const L = this.look;
    const hue = (t * 0.18) % 1;
    for (const k of ['suit', 'mask', 'band', 'accent']) if (L[k] === 'rainbow') this.rig.mats[k].color.setHSL((hue + k.length * 0.1) % 1, 0.9, 0.55);
    for (const k of ['deck', 'wheels', 'under', 'trim']) {
      if (L[k] !== 'rainbow') continue;
      const c = this.board.mats[k].color.setHSL((hue + k.length * 0.13) % 1, 0.9, 0.55);
      if (k === 'wheels') this.board.mats.glowPad.color.copy(c);
      if (k === 'trim') this.board.mats.glowTrim.color.copy(c);
    }
  }

  // Where the back of the board is, for trail particles.
  get boardTop() {
    return this.y + this.board.deckTop;
  }
}
