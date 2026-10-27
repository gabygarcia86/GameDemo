/**
 * Collision pass, run once per simulation step after everything has moved.
 * Circle-vs-circle tests with cheap vertical rejection first; at 120 Hz the
 * fastest bullet moves ~8px per step, so nothing tunnels through a hitbox.
 */
import { CONFIG } from './config.js';

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

export function handleCollisions(game) {
  const { player, projectiles, enemies, boss, powerups } = game;

  // player bolts vs enemies and boss
  const pool = projectiles.player;
  const pb = pool.active;
  for (let i = pb.length - 1; i >= 0; i--) {
    const b = pb[i];
    let hit = false;
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (!e.alive || !e.hittable) continue;
      const dy = b.y - e.y;
      if (dy > e.r + 12 || dy < -e.r - 12) continue;
      if (circlesOverlap(b.x, b.y, b.r, e.x, e.y, e.r)) {
        game.damageEnemy(e, b.damage, b.x, b.y);
        hit = true;
        break;
      }
    }
    if (!hit && boss && boss.solid) {
      const zone = boss.hitTest(b.x, b.y, b.r);
      if (zone) {
        boss.takeDamage(b.damage * zone, b.x, b.y);
        hit = true;
      }
    }
    if (hit) {
      if (!b.ally) game.stageHits++;
      pool.releaseAt(i);
    }
  }

  if (!player.alive) return;
  const P = CONFIG.player;

  // enemy bullets vs player (the shield bubble is larger and absorbs shots)
  const shielded = player.shielded;
  if (shielded || player.invuln <= 0) {
    const hitR = shielded ? P.shieldRadius : P.hitRadius;
    const ep = projectiles.enemy;
    const eb = ep.active;
    for (let i = eb.length - 1; i >= 0; i--) {
      const b = eb[i];
      if (circlesOverlap(b.x, b.y, b.r, player.x, player.y, hitR)) {
        ep.releaseAt(i);
        game.playerStruck(b.x, b.y);
        if (!player.alive) return;
      }
    }
  }

  // ships ramming the player
  for (let j = 0; j < enemies.length; j++) {
    const e = enemies[j];
    if (!e.alive || e.y < player.y - 60) continue;
    const r = shielded ? P.shieldRadius : P.bodyRadius * 0.75;
    if (circlesOverlap(e.x, e.y, e.r * 0.8, player.x, player.y, r)) {
      if (!shielded && player.invuln > 0) continue;
      game.killEnemy(e, true);
      game.playerStruck(e.x, e.y);
      if (!player.alive) return;
    }
  }

  // boss laser and hull
  if (boss && boss.solid && player.invuln <= 0 && !shielded) {
    if (boss.laserHits(player.x, player.y, P.hitRadius) || boss.hitTest(player.x, player.y, P.hitRadius)) {
      game.playerStruck(player.x, player.y);
      if (!player.alive) return;
    }
  }

  // pickups
  const items = powerups.items;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (circlesOverlap(it.x, it.y, CONFIG.powerups.radius, player.x, player.y, P.bodyRadius)) powerups.collect(i);
  }
}
