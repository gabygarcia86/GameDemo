// Tunable settings for Pumpkin Smash!. This file has no imports on purpose.

export const CONFIG = {
  // ---- Gameplay ----
  smashesToWin: 5,
  respawnDelayMs: 450,          // pause after a smash animation before the next pumpkin may appear

  // ---- Pumpkin placement (all relative to the tracked image) ----
  // Pumpkin diameter as a fraction of the image's SHORTER side. 0.20-0.30 is the intended range.
  pumpkinScale: 0.275,
  // Gap between the back of the pumpkin and the image plane, in image-width units (avoids z-fighting).
  surfaceGap: 0.004,

  // ---- Tapping ----
  hitProxyScale: 1.25,          // invisible hit sphere = pumpkin radius x this (3D ray test)
  minHitRadiusPx: 34,           // on-screen minimum tap radius (CSS px) so small/far pumpkins stay tappable
  tapMaxMovePx: 14,             // finger may move this far between down and up and still count as a tap
  tapMaxDurationMs: 700,
  maxTapMotionPxPerSec: 1400,   // ignore taps while the pumpkin is sweeping across the screen faster than this

  // ---- Tracking (MindAR controller). null = use the library default ----
  maxTrack: 1,                  // how many images may be tracked at once (1 is lightest on phones)
  filterMinCF: null,            // One-Euro filter cutoff (library default 0.001). Lower = smoother, laggier.
  filterBeta: null,             // One-Euro filter beta   (library default 1000). Higher = less lag when moving.
  warmupTolerance: null,        // frames of stable tracking before a target is reported (default 5)
  missTolerance: null,          // missed frames before a target is reported lost (default 5)

  // ---- Pumpkin steadiness (smoothing of the tracked pose, on top of MindAR's filter). null = raw tracker pose ----
  // Changes no bigger than the noise levels are treated as tracker jitter and eased in slowly (stillRate); bigger
  // changes are real camera motion and are followed quickly (moveRate), so the pumpkin stays steady without lagging.
  smoothing: {
    stillRate: 4,               // per second. Lower = steadier, but slower to settle after a small move.
    moveRate: 25,               // per second, used for real motion
    posNoise: 0.006,            // position jitter, as a fraction of the camera-to-photo distance
    angleNoiseDeg: 1.5,         // rotation jitter
  },

  // ---- Ambient creatures (placed around the player in the room; purely decorative, taps go through them) ----
  // The phone's motion sensors keep them in place as it turns (rotation only: browsers do not report position).
  creatures: {
    enabled: true,
    bats: 5,                    // circle overhead while scanning, fly up and away when a pumpkin appears
    ghosts: 3,                  // float at eye level all around, fading in and out; never in the middle of the view mid-play
  },

  // ---- Camera ----
  camera: {
    facingMode: 'environment',  // asked for as "ideal", so desktops with only a webcam still work
    idealWidth: 1280,
    idealHeight: 720,
    startTimeoutMs: 12000,
  },

  // ---- Files (relative to index.html, so GitHub Pages sub-folders work) ----
  urls: {
    mind: 'targets.mind',
    manifest: 'target-manifest.json',
  },

  // ---- Sound ----
  soundDefaultOn: true,
};
