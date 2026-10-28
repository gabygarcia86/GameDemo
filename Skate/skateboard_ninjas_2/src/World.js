// Everything on the course: obstacles, enemies, ramps, rails, gaps, ice,
// coins, power-ups, chests and projectiles. Handles spawning (called by the
// generator), pooled meshes, collisions and passes, and reports what happened
// as events for Game to score and react to.

import { THREE, prefabMesh, GeoBuilder, MATS, setOutlinesVisible } from './gfx.js';
import { CONFIG, laneX } from './config.js';
import {
  OBSTACLE_INFO, obstaclePrefab, piecePrefab, RAMP, RAIL, GAP, ICE, coinGeometry, powerupBuilder,
} from './models/props.js';
import { Karen, EvilNinja, Beast, enemyKoWord } from './Enemies.js';
import { lerp } from './utils.js';

const LANE = CONFIG.lanes.width;
const VIS_AHEAD = CONFIG.road.ahead - 6;
const VIS_BEHIND = 14;
const P = CONFIG.player;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

class MeshPool {
  constructor(parent) {
    this.parent = parent;
    this.free = new Map();
  }
  get(key, make) {
    const list = this.free.get(key);
    const obj = list && list.length ? list.pop() : make();
    if (!obj.parent) this.parent.add(obj);
    obj.visible = true;
    return obj;
  }
  release(key, obj) {
    obj.visible = false;
    if (!this.free.has(key)) this.free.set(key, []);
    this.free.get(key).push(obj);
  }
  clear() {
    for (const list of this.free.values()) for (const o of list) this.parent.remove(o);
    this.free.clear();
  }
}

function shurikenGeo() {
  const b = new GeoBuilder();
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 0.32 : 0.09;
    const a = (i / 8) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.translate(0, 0, -0.015);
  b.add(g, '#e4e7f5', { rot: [Math.PI / 2, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.08, 0.08, 0.045, 12), '#ff2e55', {});
  return b.build();
}

export class World {
  constructor(scene, track, particles) {
    this.scene = scene;
    this.track = track;
    this.fx = particles;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pool = new MeshPool(this.root);
    this.karenPool = [];
    this.ninjaPool = [];
    this.ninjaCount = 0;
    this.beastPools = { bear: [], yeti: [] };
    this.outlines = true;
    this.events = [];
    this._surf = { ramp: null, gap: false, ice: false, rail: null, railAhead: null };
    this._ramp = { h: 0, entity: null };

    // Coins: one instanced mesh pair for all of them.
    const cg = coinGeometry();
    this.coinMeshes = [new THREE.InstancedMesh(cg.lit, MATS.lit, 600), new THREE.InstancedMesh(cg.glow, MATS.glow, 600)];
    for (const m of this.coinMeshes) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    this.coinMeshes[0].castShadow = true;

    this.starGeo = shurikenGeo();
    this.paintMat = new THREE.MeshBasicMaterial({ color: '#c04dff' });
    this.paintGeo = new THREE.SphereGeometry(0.2, 12, 8);
    this.debugBoxes = [];
    this.reset();
  }

  setEnvironment(env) {
    this.env = env;
    // Prefabs depend on the environment, so drop pooled meshes from the old one.
    this.pool.clear();
  }

  reset() {
    for (const list of [this.obstacles, this.ramps, this.rails, this.gaps, this.ices, this.powerups, this.chests]) {
      if (list) for (const e of list) this.releaseMesh(e);
    }
    if (this.enemies) for (const e of this.enemies) this.releaseEnemy(e);
    if (this.stars) for (const s of this.stars) this.root.remove(s.mesh);
    if (this.paints) for (const p of this.paints) this.root.remove(p.mesh);
    this.obstacles = [];
    this.enemies = [];
    this.ramps = [];
    this.rails = [];
    this.gaps = [];
    this.ices = [];
    this.powerups = [];
    this.chests = [];
    this.coins = [];
    this.stars = [];
    this.paints = [];
    this.magnet = 0;
    this.events = [];
    for (const m of this.coinMeshes) m.count = 0;
  }

  releaseMesh(e) {
    if (e.mesh) {
      this.pool.release(e.key, e.mesh);
      e.mesh = null;
    }
    if (e.segs) {
      for (const s of e.segs) this.pool.release(e.key, s);
      e.segs = null;
    }
  }

  // ------------------------------------------------------------ spawning

  // lane = leftmost lane the obstacle covers.
  spawnObstacle(type, lane, span, dist, extra = {}) {
    const info = OBSTACLE_INFO[type];
    const x = span === 3 ? 0 : laneX(lane) + (span - 1) * LANE * 0.5;
    const e = {
      kind: 'obstacle', type, cat: info.cat, span, lane, x, baseX: x, dist, y: 0,
      halfW: info.halfW ?? span * LANE * 0.5 - 0.3,
      halfD: info.halfD, top: info.top, bottom: info.bottom ?? 0,
      moving: !!info.moving, poppable: !!info.poppable, alive: true, passed: false, hit: false,
      key: `o|${type}|${span}`, side: extra.side || 1, phase: Math.random() * 6, spin: 0,
    };
    this.obstacles.push(e);
    return e;
  }

  spawnEnemy(kind, behavior, lane, dist, extra = {}) {
    let enemy;
    if (kind === 'karen') {
      enemy = this.karenPool.pop() || new Karen(this.root, true);
      enemy.setup({ behavior, lane, dist, ...extra }, this.env);
    } else if (kind === 'ninja') {
      enemy = this.ninjaPool.pop() || new EvilNinja(this.root, true, this.ninjaCount++);
      enemy.setup({ behavior, lane, dist, ...extra });
    } else {
      enemy = this.beastPools[kind].pop() || new Beast(this.root, true, kind);
      enemy.setup({ behavior, lane, dist, ...extra });
    }
    setOutlinesVisible(enemy.group, this.outlines);
    this.enemies.push(enemy);
    return enemy;
  }

  releaseEnemy(e) {
    e.group.visible = false;
    e.alive = false;
    (e.kind === 'karen' ? this.karenPool : e.kind === 'ninja' ? this.ninjaPool : this.beastPools[e.kind]).push(e);
  }

  spawnCoin(x, y, dist) {
    this.coins.push({ x, y, d: dist, alive: true, pulled: false });
  }

  spawnRamp(lane, dist) {
    const e = { kind: 'ramp', lane, x: laneX(lane), dist, d0: dist - RAMP.length / 2, d1: dist + RAMP.length / 2, key: 'p|ramp' };
    this.ramps.push(e);
    return e;
  }

  spawnRail(lane, d0, length) {
    const n = Math.max(2, Math.round(length / RAIL.segment));
    const e = { kind: 'rail', lane, x: laneX(lane), d0, d1: d0 + n * RAIL.segment, n, key: 'p|rail', segs: null };
    this.rails.push(e);
    return e;
  }

  spawnGap(dist, span = 3, lane = 0) {
    const x = span === 3 ? 0 : laneX(lane) + (span - 1) * LANE * 0.5;
    const halfW = span === 3 ? CONFIG.road.halfWidth + 0.5 : span * LANE * 0.5;
    const e = { kind: 'gap', x, dist, d0: dist - GAP.length / 2, d1: dist + GAP.length / 2, halfW, span, key: `p|gap|${span}` };
    this.gaps.push(e);
    return e;
  }

  spawnIce(dist) {
    const e = { kind: 'ice', x: 0, dist, d0: dist - ICE.length / 2, d1: dist + ICE.length / 2, key: 'p|ice', counted: false };
    this.ices.push(e);
    return e;
  }

  spawnPowerup(kind, lane, dist) {
    const e = { kind: 'powerup', type: kind, lane, x: laneX(lane), dist, y: 1.0, alive: true, key: `u|${kind}` };
    this.powerups.push(e);
    return e;
  }

  spawnChest(lane, dist) {
    const e = { kind: 'chest', lane, x: laneX(lane), dist, alive: true, key: 'p|chest' };
    this.chests.push(e);
    return e;
  }

  makeMesh(e) {
    const env = this.env;
    switch (e.kind) {
      case 'obstacle':
        return this.pool.get(e.key, () => prefabMesh(obstaclePrefab(e.type, e.span, env)));
      case 'ramp':
        return this.pool.get(e.key, () => prefabMesh(piecePrefab('ramp', 1, env), { receive: true }));
      case 'gap':
        return this.pool.get(e.key, () => prefabMesh(piecePrefab('gap', e.span, env), { cast: false }));
      case 'ice':
        return this.pool.get(e.key, () => prefabMesh(piecePrefab('ice', 3, env), { cast: false }));
      case 'chest':
        return this.pool.get(e.key, () => prefabMesh(piecePrefab('chest', 1, env)));
      case 'powerup':
        return this.pool.get(e.key, () => {
          const g = prefabMesh(powerupBuilder(e.type), { cast: false });
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.62, 0.05, 6, 28),
            new THREE.MeshBasicMaterial({ color: e.type === 'magnet' ? '#ff2e55' : e.type === 'shield' ? '#3de1ff' : '#ffe066' }),
          );
          g.add(halo);
          return g;
        });
      default:
        return null;
    }
  }

  // --------------------------------------------------------- queries

  surfaceAt(x, dist, lane) {
    const s = this._surf;
    s.ramp = null;
    s.gap = false;
    s.ice = false;
    s.rail = null;
    s.railAhead = null;
    for (const r of this.ramps) {
      if (dist >= r.d0 && dist <= r.d1 && Math.abs(x - r.x) < RAMP.halfW + 0.15) {
        this._ramp.h = RAMP.height * (dist - r.d0) / RAMP.length;
        this._ramp.entity = r;
        s.ramp = this._ramp;
      }
    }
    for (const g of this.gaps) {
      if (dist > g.d0 + 0.35 && dist < g.d1 - 0.35 && Math.abs(x - g.x) < g.halfW - 0.15) s.gap = true;
    }
    for (const i of this.ices) if (dist >= i.d0 && dist <= i.d1) s.ice = true;
    for (const r of this.rails) {
      if (Math.abs(x - r.x) > 0.55) continue;
      if (dist >= r.d0 - 0.2 && dist <= r.d1) s.rail = r;
      else if (dist < r.d0 - 0.2 && dist > r.d0 - 2.6) s.railAhead = r;
    }
    return s;
  }

  railContains(rail, x, dist) {
    return Math.abs(x - rail.x) < 0.6 && dist >= rail.d0 - 0.5 && dist <= rail.d1;
  }

  // Ninja-star targeting: same lane first, then an adjacent lane within a
  // shorter radius. Beach balls count as targets too.
  findTarget(px, pDist) {
    const S = CONFIG.shuriken;
    let best = null;
    let bestScore = Infinity;
    const consider = (e, x, d) => {
      const dRem = d - pDist;
      if (dRem < 1.2 || dRem > S.range) return;
      const dx = Math.abs(x - px);
      let score;
      if (dx < LANE * 0.55) score = dRem;
      else if (dx < LANE * 1.55 && dRem < S.adjacentRange) score = dRem + 500 + dx;
      else return;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    };
    for (const e of this.enemies) if (e.alive && !e.dying && e.active && e.collidable && !e.targeted) consider(e, e.x, e.dist);
    for (const o of this.obstacles) if (o.poppable && o.alive && !o.targeted) consider(o, o.x, o.dist);
    return best;
  }

  // ------------------------------------------------------ projectiles

  throwStar(px, py, pDist) {
    const target = this.findTarget(px, pDist);
    if (target) target.targeted = true;
    const mesh = new THREE.Group();
    const m = new THREE.Mesh(this.starGeo.lit, MATS.lit);
    mesh.add(m);
    this.root.add(mesh);
    this.stars.push({ x: px + 0.3, y: py + 1.3, d: pDist + 0.6, target, life: 1.6, mesh, spin: 0 });
    return target;
  }

  enemyThrow(enemy) {
    const mesh = new THREE.Mesh(this.paintGeo, this.paintMat);
    this.root.add(mesh);
    this.paints.push({ sx: enemy.x, sy: enemy.y + 1.5, sd: enemy.dist, t: 0, dur: 0.75, mesh, tx: null, td: null });
    this.events.push({ type: 'enemyThrow', x: enemy.x, d: enemy.dist });
  }

  updateProjectiles(dt, player, pDist, speed) {
    const S = CONFIG.shuriken;
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.life -= dt;
      const v = (speed + S.speed) * dt;
      const t = s.target;
      let done = false;
      if (t && (t.alive !== false) && !t.dying && (t.kind !== 'obstacle' || t.alive)) {
        const ty = (t.kind === 'obstacle' ? (t.by || 0) + 0.5 : t.y + 1.1);
        const dx = t.x - s.x, dy = ty - s.y, dd = t.dist - s.d;
        const len = Math.hypot(dx, dy, dd);
        if (len <= v + 0.4) {
          this.defeat(t, 'star', speed);
          done = true;
        } else {
          s.x += (dx / len) * v;
          s.y += (dy / len) * v;
          s.d += (dd / len) * v;
        }
      } else {
        s.d += v;
        // Untargeted stars can still clip something in their path.
        for (const e of this.enemies) {
          if (e.alive && !e.dying && e.collidable && Math.abs(e.x - s.x) < 0.7 && Math.abs(e.dist - s.d) < 0.9 && s.y < e.y + e.top) {
            this.defeat(e, 'star', speed);
            done = true;
            break;
          }
        }
      }
      if (done || s.life <= 0) {
        if (!done) {
          this.events.push({ type: 'starMiss' });
          if (t) t.targeted = false;
        }
        this.root.remove(s.mesh);
        this.stars.splice(i, 1);
        continue;
      }
      s.spin += dt * 30;
      this.track.place(s.mesh, s.x, s.y, s.d);
      s.mesh.rotation.y += s.spin;
      if (Math.random() < 0.5) this.fx.glows.spawn(s.x, s.y, s.d, 0, 0, speed, 0.18, 0.12, '#ffffff', 0, 0);
    }

    for (let i = this.paints.length - 1; i >= 0; i--) {
      const p = this.paints[i];
      if (p.tx === null) {
        // Aim where the player will be when it lands.
        p.tx = player.x;
        p.td = pDist + speed * p.dur;
      }
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const x = lerp(p.sx, p.tx, k);
      const d = lerp(p.sd, p.td, k);
      const y = lerp(p.sy, 1.4, k) + Math.sin(k * Math.PI) * 1.2;
      this.track.place(p.mesh, x, y, d);
      if (Math.random() < 0.6) this.fx.glows.spawn(x, y, d, 0, 0, 0, 0.25, 0.16, '#c04dff', 0, 0);
      if (k >= 1) {
        const hit = !player.crashed && Math.abs(player.x - p.tx) < 1.1 && player.sliding <= 0;
        this.events.push({ type: hit ? 'splat' : 'paintMiss', x, d });
        if (!hit) this.fx.splash(x, 0.1, d, speed * 0.5, '#c04dff');
        this.root.remove(p.mesh);
        this.paints.splice(i, 1);
      }
    }
  }

  // Pop an enemy (or a beach ball) in a cartoon burst.
  defeat(e, by, speed) {
    if (e.kind === 'obstacle') {
      if (!e.alive) return;
      e.alive = false;
      this.fx.confetti(e.x, 0.5, e.dist, speed * 0.3, 30);
      this.fx.word('POP!', e.x, 1.6, e.dist, '#ffffff', '#ff2e55');
      this.events.push({ type: 'pop', entity: e, by });
      return;
    }
    if (!e.alive || e.dying) return;
    e.dying = 0.0001;
    e.bubble.visible = false;
    this.events.push({ type: 'ko', kind: e.kind, by, x: e.x, d: e.dist });
  }

  // ---------------------------------------------------------- update

  update(dt, player, pDist, speed) {
    const pY = player.y;
    const pH = player.height;
    const pX = player.x;
    const near = (d) => d > pDist - VIS_BEHIND && d < pDist + VIS_AHEAD;

    // Enemies.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dying) {
        if (e.updateDying(dt)) {
          const pal = e.kind === 'ninja' ? [e.palette.band, e.palette.accent, '#ffffff', '#140c2b', '#ffe066'] : e.poofColors;
          this.fx.poof(e.x, e.y, e.dist, speed * 0.4, pal);
          const [fill, ink] = e.koColors || (e.kind === 'karen' ? ['#ffe066', '#ff2e55'] : ['#ff2e55', '#ffffff']);
          this.fx.word(enemyKoWord(e.kind), e.x, 2.2, e.dist, fill, ink);
          this.enemies.splice(i, 1);
          this.releaseEnemy(e);
          continue;
        }
      } else if (!player.crashed) {
        e.update(dt, pDist, speed, this);
      } else {
        e.rig.animate?.(dt, 'angry', 1);
      }
      if (e.dist < pDist - VIS_BEHIND) {
        this.enemies.splice(i, 1);
        this.releaseEnemy(e);
        continue;
      }
      if (e.saidLine && !e.voiced) {
        e.voiced = true;
        this.events.push({ type: 'voice', kind: e.kind });
      }
      e.group.visible = near(e.dist) && (e.behavior !== 'chase' || e.active) && (e.behavior !== 'drop' || e.active);
      if (e.group.visible) this.track.place(e.group, e.x, e.y, e.dist, false, e.yaw);
      if (e.dying || !e.collidable || player.crashed) continue;
      if (Math.abs(e.dist - pDist) < e.halfD + P.halfD && Math.abs(e.x - pX) < e.halfW + P.halfW && pY < e.y + e.top && pY + pH > e.y) {
        this.hitSomething(e, player, speed);
      }
      if (!e.passed && e.dist + e.halfD < pDist - P.halfD) {
        e.passed = true;
        this.reportPass(e, player);
      }
    }

    // Obstacles.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.dist < pDist - VIS_BEHIND || !o.alive) {
        this.releaseMesh(o);
        this.obstacles.splice(i, 1);
        continue;
      }
      if (o.moving) this.moveObstacle(o, dt, pDist);
      if (near(o.dist)) {
        if (!o.mesh) o.mesh = this.makeMesh(o);
        this.track.place(o.mesh, o.x, o.by || 0, o.dist, false, o.yawExtra || 0);
        if (o.type === 'tumbleweed') o.mesh.rotation.z = o.spin;
        if (o.type === 'beachBall') o.mesh.rotation.x = o.spin;
        o.mesh.position.y += o.type === 'tumbleweed' || o.type === 'beachBall' ? 0.45 : 0;
      }
      if (player.crashed || o.hit) continue;
      if (Math.abs(o.dist - pDist) < o.halfD + P.halfD && Math.abs(o.x - pX) < o.halfW + P.halfW) {
        const by = o.by || 0;
        let hit;
        if (o.cat === 'low') hit = pY < by + o.top - 0.05;
        else if (o.cat === 'high') hit = pY + pH > o.bottom + 0.05 && pY < o.top;
        else hit = pY < o.top;
        if (hit) this.hitSomething(o, player, speed);
      }
      if (!o.passed && o.dist + o.halfD < pDist - P.halfD) {
        o.passed = true;
        if (!o.hit) this.reportPass(o, player);
      }
    }

    // Course pieces.
    for (const list of [this.ramps, this.gaps, this.ices, this.chests]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        const end = e.d1 ?? e.dist;
        if (end < pDist - VIS_BEHIND || e.alive === false) {
          this.releaseMesh(e);
          list.splice(i, 1);
          continue;
        }
        if (near(e.dist)) {
          if (!e.mesh) e.mesh = this.makeMesh(e);
          this.track.place(e.mesh, e.x, 0, e.dist, true);
        }
        if (e.kind === 'ice' && !e.counted && pDist > e.d1) {
          e.counted = true;
          this.events.push({ type: 'iceCrossed' });
        }
        if (e.kind === 'chest' && e.alive && !player.crashed && Math.abs(e.dist - pDist) < 0.9 && Math.abs(e.x - pX) < 0.9 && pY < 1.2) {
          e.alive = false;
          this.fx.confetti(e.x, 0.6, e.dist, speed, 50);
          this.events.push({ type: 'chest', x: e.x, d: e.dist });
        }
      }
    }
    for (let i = this.rails.length - 1; i >= 0; i--) {
      const r = this.rails[i];
      if (r.d1 < pDist - VIS_BEHIND) {
        this.releaseMesh(r);
        this.rails.splice(i, 1);
        continue;
      }
      if (r.d0 < pDist + VIS_AHEAD) {
        if (!r.segs) {
          r.segs = [];
          for (let k = 0; k < r.n; k++) r.segs.push(this.pool.get(r.key, () => prefabMesh(piecePrefab('rail', 1, this.env))));
        }
        for (let k = 0; k < r.n; k++) {
          const d = r.d0 + (k + 0.5) * RAIL.segment;
          r.segs[k].visible = near(d);
          if (r.segs[k].visible) this.track.place(r.segs[k], r.x, 0, d);
        }
      }
    }

    // Power-ups.
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      if (u.dist < pDist - VIS_BEHIND || !u.alive) {
        this.releaseMesh(u);
        this.powerups.splice(i, 1);
        continue;
      }
      if (near(u.dist)) {
        if (!u.mesh) u.mesh = this.makeMesh(u);
        const bob = Math.sin(this.track.time * 3 + u.dist) * 0.15;
        this.track.place(u.mesh, u.x, u.y + bob, u.dist, false, this.track.time * 2.2);
      }
      if (!player.crashed && Math.abs(u.dist - pDist) < 1.0 && Math.abs(u.x - pX) < 1.0 && pY < u.y + 0.9 && pY + pH > u.y - 0.6) {
        u.alive = false;
        this.fx.shatter(u.x, u.y - 1, u.dist, speed, u.type === 'magnet' ? '#ff2e55' : u.type === 'shield' ? '#3de1ff' : '#ffe066');
        this.events.push({ type: 'powerup', kind: u.type });
      }
    }

    this.updateCoins(dt, player, pDist, speed);
    this.updateProjectiles(dt, player, pDist, speed);
    if (CONFIG.debug) this.drawDebug(pDist);
  }

  moveObstacle(o, dt, pDist) {
    const dRem = o.dist - pDist;
    if (o.type === 'tumbleweed') {
      // Rolls across the road, timed to be in its lane as you arrive.
      o.x = o.baseX + o.side * dRem * 0.11;
      o.by = Math.abs(Math.sin(dRem * 0.35 + o.phase)) * 0.25;
      o.spin -= dt * 6 * o.side;
    } else if (o.type === 'beachBall') {
      o.by = Math.abs(Math.sin(this.track.time * 3.2 + o.phase)) * 0.3;
      o.spin += dt * 2;
    }
  }

  hitSomething(e, player, speed) {
    if (player.bumpCd > 0 && e === this.lastBumped) return;
    if (player.shield) {
      player.shield = false;
      player.bumpCd = 0.6;
      this.lastBumped = e;
      e.hit = true;
      this.fx.shatter(player.x, player.y, this.track.origin + 1, speed);
      if (e.kind === 'obstacle') {
        e.alive = false;
        this.fx.poof(e.x, 0, e.dist, speed * 0.4);
      } else {
        this.defeat(e, 'shield', speed);
      }
      this.events.push({ type: 'shieldBreak' });
      return;
    }
    // Clipping the side of something mid lane change: bounce back.
    const lateral = player.laneT < 1 && Math.abs(player.x - e.x) > e.halfW * 0.55 && player.prevLane !== player.lane;
    if (lateral) {
      this.lastBumped = e;
      player.bumpBack();
      this.events.push({ type: 'bump' });
      return;
    }
    e.hit = true;
    player.crash(e.kind === 'obstacle' ? e.type : e.kind);
    this.events.push({ type: 'hit', entity: e });
  }

  reportPass(e, player) {
    const sameLane = Math.abs(player.x - e.x) < e.halfW + P.halfW;
    let how = 'dodge';
    if (sameLane && e.cat === 'low') how = 'jump';
    else if (sameLane && e.cat === 'high') how = 'slide';
    else if (player.time - player.lastLaneChange < 0.45 && Math.abs(laneX(player.prevLane) - e.x) < e.halfW + P.halfW) how = 'near';
    this.events.push({ type: 'avoid', how, cat: e.cat, objType: e.type, kind: e.kind });
  }

  updateCoins(dt, player, pDist, speed) {
    const magnetR = CONFIG.powerups.magnetRadius;
    let n = 0;
    const t = this.track.time;
    const meshes = this.coinMeshes;
    const max = meshes[0].instanceMatrix.count;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.d < pDist - 4 || !c.alive) {
        this.coins.splice(i, 1);
        continue;
      }
      const dRem = c.d - pDist;
      if (this.magnet > 0 && !player.crashed && dRem < magnetR * 2.2 && dRem > -1 && Math.abs(c.x - player.x) < magnetR) c.pulled = true;
      if (c.pulled) {
        const k = Math.min(1, dt * 14);
        c.x = lerp(c.x, player.x, k);
        c.y = lerp(c.y, player.y + 1, k);
        c.d = lerp(c.d, pDist + 0.2, k) + speed * dt * 0.2;
      }
      if (!player.crashed && Math.abs(c.d - pDist) < 0.9 && Math.abs(c.x - player.x) < 0.85 && c.y > player.y - 0.4 && c.y < player.y + player.height + 0.4) {
        c.alive = false;
        this.fx.coin(c.x, c.y, c.d, speed);
        this.events.push({ type: 'coin' });
        this.coins.splice(i, 1);
        continue;
      }
      if (dRem > VIS_AHEAD || n >= max) continue;
      this.track.matrixAt(c.x, c.y, c.d, t * 3 + c.d * 0.2, 1, _m);
      meshes[0].setMatrixAt(n, _m);
      meshes[1].setMatrixAt(n, _m);
      n++;
    }
    for (const m of meshes) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  drawDebug(pDist) {
    for (const b of this.debugBoxes) b.visible = false;
    let k = 0;
    const box = () => {
      if (!this.debugBoxes[k]) {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#ff00ff' }));
        this.root.add(l);
        this.debugBoxes[k] = l;
      }
      return this.debugBoxes[k++];
    };
    const show = (x, y0, y1, d, hw, hd, color) => {
      const b = box();
      b.visible = true;
      b.material.color.set(color);
      this.track.place(b, x, (y0 + y1) / 2, d);
      b.scale.set(hw * 2, y1 - y0, hd * 2);
    };
    for (const o of this.obstacles) if (o.dist - pDist < 60 && o.dist > pDist - 5) {
      const by = o.by || 0;
      show(o.x, o.cat === 'high' ? o.bottom : by, by + o.top, o.dist, o.halfW, o.halfD, o.cat === 'low' ? '#ffff00' : o.cat === 'high' ? '#00ffff' : '#ff00ff');
    }
    for (const e of this.enemies) if (e.dist - pDist < 60 && e.dist > pDist - 5) show(e.x, e.y, e.y + e.top, e.dist, e.halfW, e.halfD, '#ff3333');
  }
}
