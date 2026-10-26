/**
 * Flight paths: entry curves that bring squadrons on screen, and attack runs
 * that enemies fly when they break formation. Paths are control points for a
 * Catmull-Rom spline (see utils.Path). Entry templates are authored for the
 * left side and mirrored for the right.
 */
import { WORLD } from './config.js';
import { Path, clamp, lerp, rand } from './utils.js';

const { W, H } = WORLD;

export const ENTRY_PATHS = {
  swoop:      [[-40, 140], [90, 230], [200, 400], [250, 560], [330, 620], [410, 540], [380, 420], [290, 380]],
  side:       [[-40, 640], [110, 570], [220, 450], [240, 320], [170, 250], [100, 320], [150, 420], [250, 420]],
  'top-loop': [[300, -40], [300, 180], [330, 380], [430, 470], [470, 360], [380, 290], [300, 330]],
  spiral:     [[230, -40], [230, 160], [320, 330], [260, 480], [130, 420], [140, 290], [250, 280]],
  cross:      [[120, -40], [170, 150], [300, 300], [440, 420], [470, 520], [380, 560], [300, 470]],
  top:        [[200, -40], [190, 120], [150, 260], [190, 380], [260, 360]],
};

export const ENTRY_NAMES = Object.keys(ENTRY_PATHS);

/** Builds one entry path; interior points get a little jitter so every wave looks alive. */
export function makeEntryPath(name, mirrored, jitter) {
  const base = ENTRY_PATHS[name] || ENTRY_PATHS.swoop;
  const last = base.length - 1;
  const pts = base.map(([x, y], i) => {
    const j = i > 0 && i < last ? jitter : 0;
    const px = x + rand(-j, j);
    return [mirrored ? W - px : px, y + rand(-j, j)];
  });
  return new Path(pts);
}

const cx = (x) => clamp(x, 34, W - 34);

/**
 * Attack run for an enemy leaving formation. Aims at where the player is now,
 * which makes dives readable and dodgeable.
 *   endMode 'wrap' — exits the bottom and re-enters from the top
 *   endMode 'home' — curls back up to its formation slot
 */
export function buildDive(kind, e, player) {
  const x = e.x;
  const y = e.y;
  const s = x < W / 2 ? -1 : 1; // peel away toward the nearer wall first
  const px = cx(player.x + rand(-50, 50));
  switch (kind) {
    case 'loop':
      return {
        endMode: 'home',
        points: [[x, y], [x + s * 34, y - 30], [x + s * 70, y + 20], [cx(px + s * 40), 520], [cx(px - s * 40), 650],
          [cx(px - s * 130), 600], [cx(px - s * 120), 470], [cx(lerp(x, px, 0.5)), y + 70]],
      };
    case 'sweep':
      return {
        endMode: 'wrap',
        points: [[x, y], [x + s * 30, y - 36], [x + s * 64, y + 8], [cx(W / 2 - s * 170), 430], [cx(px - s * 20), 640],
          [cx(px + s * 110), 800], [cx(px + s * 170), H + 70]],
      };
    case 'zigzag':
      return {
        endMode: 'wrap',
        points: [[x, y], [x + s * 28, y - 30], [x + s * 50, y + 14], [cx(px + 80), 400], [cx(px - 80), 520],
          [cx(px + 70), 640], [cx(px - 40), 760], [cx(px), H + 70]],
      };
    case 'boomerang':
      return {
        endMode: 'home',
        points: [[x, y], [x + s * 28, y - 30], [cx(px + s * 30), 420], [cx(px), 630], [cx(px - s * 120), 650],
          [cx(px - s * 170), 430], [cx(lerp(x, px, 0.3)), 200]],
      };
    case 'swoop':
    default:
      return {
        endMode: 'wrap',
        points: [[x, y], [x + s * 30, y - 34], [x + s * 62, y + 4], [cx(lerp(x, px, 0.5) + s * 20), 470], [px, 720],
          [cx(px - s * 70), 880], [cx(px - s * 120), H + 70]],
      };
  }
}

/** Fighter launched from the boss hangar: one pass at the player, then it leaves. */
export function buildMinionRun(x, y, player) {
  const s = Math.random() < 0.5 ? -1 : 1;
  const px = cx(player.x + rand(-40, 40));
  return [[x, y], [cx(x + s * 70), y + 110], [cx(lerp(x, px, 0.6) + s * 40), 470], [px, 680], [cx(px - s * 80), 830], [cx(px - s * 140), H + 70]];
}
