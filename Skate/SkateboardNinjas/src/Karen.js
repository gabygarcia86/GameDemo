// Angry-pedestrian hazards. These are comedic obstacles with readable
// tells, not enemies: each one telegraphs (shout, "!", stepping in) before it
// becomes dangerous, and moving ones steer to meet the skater at a spot the
// level generator reserved, so encounters are always fair.
//
//   blocker  stands in the lane wagging a finger
//   stepper  waits on the back of the sidewalk, then steps into the lane
//   charger  storms toward the skater
//   cart     shoves a shopping cart into the lane (the cart is the hazard)

import { CONFIG } from './config.js';
import { clamp } from './Physics.js';

const K = CONFIG.karen;

export const KAREN_QUOTES = [
  'I NEED YOUR MANAGER!',
  'THIS IS A SIDEWALK!',
  "I'M CALLING THE HOA!",
  'SLOW DOWN!',
  'WHERE IS YOUR PERMIT?!',
  'I KNOW MY RIGHTS!',
  'NOT ON MY WATCH!',
  'EXCUSE ME?!',
  'ONE STAR!',
  'I WILL CALL SOMEONE!',
];

export const KAREN_HIT_QUOTES = ['UNBELIEVABLE!', 'HOW DARE YOU!', 'MY LATTE!', "I'M TELLING!"];

export function initKaren(k, kind, x, rng, meetX) {
  k.kind = kind;
  k.x = x;
  k.prevX = x;
  k.meetX = meetX;
  k.w = K.width;
  k.h = K.height;
  k.laneT = kind === 'stepper' || kind === 'cart' ? 1 : 0; // 1 = back of the sidewalk
  k.state = 'wait';
  k.timer = 0;
  k.vx = 0;
  k.anim = rng.range(0, 10);
  k.shout = 0;
  k.quote = rng.pick(KAREN_QUOTES);
  k.triggered = false;
  k.hit = false;
  k.passed = false;
  k.minClear = Infinity;
  k.collidable = kind === 'blocker' || kind === 'charger';
  if (kind === 'cart') {
    k.cart = k.cart || {};
    const c = k.cart;
    c.x = x - 14; c.prevX = c.x; c.vx = 0; c.laneT = 1; c.w = 58; c.h = 46;
    c.hit = false; c.passed = false; c.minClear = Infinity; c.collidable = false; c.spin = 0;
  } else {
    k.cart = null;
  }
}

function shout(k, quote) {
  if (quote) k.quote = quote;
  k.shout = 1.6;
  k.justShouted = true;
}

// Speed that makes a mover arrive at meetX at the same time as the skater.
function interceptSpeed(x, meetX, playerX, playerSpeed, current) {
  const lead = meetX - playerX;
  if (lead > 40) return clamp((playerSpeed * (x - meetX)) / lead, K.minRunSpeed, K.maxRunSpeed);
  return current;
}

export function updateKaren(k, dt, player) {
  k.anim += dt;
  k.prevX = k.x;
  k.justShouted = false;
  if (k.shout > 0) k.shout -= dt;
  const px = player.x;
  const c = k.cart;
  if (c) c.prevX = c.x;

  if (k.hit) {
    k.vx *= 0.9;
    k.x -= k.vx * dt;
  } else {
    switch (k.kind) {
      case 'blocker':
        if (!k.triggered && px > k.x - K.shoutDistance) { k.triggered = true; shout(k); }
        break;

      case 'stepper':
        if (k.state === 'wait' && px > k.x - K.stepTrigger) {
          k.state = 'warn';
          k.timer = K.warnTime;
          shout(k);
        } else if (k.state === 'warn') {
          k.timer -= dt;
          if (k.timer <= 0) k.state = 'step';
        } else if (k.state === 'step') {
          k.laneT = Math.max(0, k.laneT - dt / K.stepTime);
          if (k.laneT === 0) k.state = 'active';
        }
        break;

      case 'charger':
        if (k.state === 'wait' && px > k.meetX - K.chargeTrigger) { k.state = 'run'; shout(k); }
        if (k.state === 'run') {
          k.vx = interceptSpeed(k.x, k.meetX, px, player.speed, k.vx);
          k.x -= k.vx * dt;
        }
        break;

      case 'cart':
        if (k.state === 'wait' && px > k.meetX - K.chargeTrigger) { k.state = 'push'; shout(k); }
        if (k.state === 'push' && !c.hit) {
          c.vx = interceptSpeed(c.x, k.meetX, px, player.speed, c.vx);
          c.x -= c.vx * dt;
          c.laneT = Math.max(0, c.laneT - dt / K.cartMergeTime);
          c.spin += (c.vx * dt) / 5;
        }
        break;
    }
  }

  if (c && c.hit) {
    c.vx *= 0.92;
    c.x -= c.vx * dt;
  }

  k.collidable = !k.hit && k.laneT < 0.35;
  if (c) c.collidable = !c.hit && c.laneT < 0.35;
}

export function hitKaren(k, rng) {
  k.hit = true;
  k.vx = -60; // stumbles backward (to the right)
  shout(k, rng.pick(KAREN_HIT_QUOTES));
}

export function hitCart(k, rng) {
  k.cart.hit = true;
  k.cart.vx = -160;
  shout(k, rng.pick(KAREN_HIT_QUOTES));
}
