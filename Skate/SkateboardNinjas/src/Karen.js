// Angry-pedestrian hazards. These are comedic obstacles with readable
// tells, not enemies: each one telegraphs (shout, "!", stepping in) before it
// becomes dangerous, and moving ones steer to meet the skater at a spot the
// level generator reserved, so encounters are always fair.
//
//   blocker  stands in the lane wagging a finger
//   stepper  waits on the back of the sidewalk, then steps into the lane
//   charger  storms toward the skater
//   ninja    an evil ninja crouched at the back of the sidewalk: laughs, then
//            leaps into the lane at the reserved spot

import { CONFIG } from './config.js';
import { clamp, lerp } from './Physics.js';

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

export const NINJA_QUOTES = [
  'MWAHAHAHA!',
  'YOU CANNOT ESCAPE!',
  'FOOLISH SKATER!',
  'THE SHADOWS HUNGER!',
  'YOUR BOARD IS MINE!',
  'NOWHERE TO RUN!',
  'CHAN-LEE YOUR SOUL IS MINE!',
  'GAMEOVER TOOSHU!',
];

export const NINJA_HIT_QUOTES = ['TOO SLOW! MWAHAHA!', 'PATHETIC!', 'BOW BEFORE ME!', 'HA HA HA HA!'];

export function initKaren(k, kind, x, rng, meetX) {
  k.kind = kind;
  k.x = x;
  k.prevX = x;
  k.meetX = meetX;
  k.w = K.width;
  k.h = K.height;
  k.laneT = kind === 'stepper' || kind === 'ninja' ? 1 : 0; // 1 = back of the sidewalk
  k.state = 'wait';
  k.timer = 0;
  k.vx = 0;
  k.anim = rng.range(0, 10);
  k.shout = 0;
  k.quote = rng.pick(kind === 'ninja' ? NINJA_QUOTES : KAREN_QUOTES);
  k.leapFromX = x;
  k.hop = 0; // height above the sidewalk mid-leap
  k.triggered = false;
  k.hit = false;
  k.passed = false;
  k.minClear = Infinity;
  k.collidable = kind === 'blocker' || kind === 'charger';
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

      case 'ninja':
        if (k.state === 'wait' && px > k.meetX - K.ninjaTrigger) {
          k.state = 'warn';
          k.timer = K.ninjaWarnTime;
          shout(k);
        } else if (k.state === 'warn') {
          k.timer -= dt;
          if (k.timer <= 0) { k.state = 'leap'; k.timer = 0; }
        } else if (k.state === 'leap') {
          // timer is leap progress 0..1: arc from the back of the sidewalk onto meetX.
          k.timer = Math.min(1, k.timer + dt / K.ninjaLeapTime);
          k.x = lerp(k.leapFromX, k.meetX, k.timer);
          k.laneT = 1 - k.timer;
          k.hop = Math.sin(Math.PI * k.timer) * K.ninjaLeapHeight;
          if (k.timer === 1) { k.state = 'active'; k.hop = 0; }
        }
        break;
    }
  }

  // A leaping ninja only becomes solid as he touches down.
  k.collidable = !k.hit && k.laneT < 0.35 && k.hop < 12;
}

export function hitKaren(k, rng) {
  k.hit = true;
  if (k.kind === 'ninja') {
    k.vx = 0; // stands his ground and gloats
    shout(k, rng.pick(NINJA_HIT_QUOTES));
  } else {
    k.vx = -60; // stumbles backward (to the right)
    shout(k, rng.pick(KAREN_HIT_QUOTES));
  }
}
