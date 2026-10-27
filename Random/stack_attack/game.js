/**
 * Stack Attack — a retro falling-block puzzle game.
 *
 * One classic script (no modules, so it also runs from file://). The code is
 * split into clearly separated sections:
 *   1. Config: board, scoring, gravity, difficulties
 *   2. Piece definitions and rotation (SRS kicks + generic kicks)
 *   3. Themes (canvas palettes; UI colors live in styles.css)
 *   4. Preferences (localStorage)
 *   5. Board and collision
 *   6. Randomizer (bag)
 *   7. Game engine (state machine, gravity, locking, scoring)
 *   8. Renderer (canvas)
 *   9. Input manager (keyboard + pointer, DAS/ARR is handled by the engine)
 *  10. App / UI controller
 */
(() => {
  'use strict';

  // ===========================================================================
  // 1. Config
  // ===========================================================================

  const COLS = 10;
  const ROWS = 20;                 // visible rows
  const BUFFER = 4;                // hidden spawn rows above the visible field
  const TOTAL_ROWS = ROWS + BUFFER;
  const NEXT_COUNT = 5;

  const SCORING = {
    lines: [0, 100, 300, 500, 800, 1200],   // × level, index = rows cleared
    lineNames: ['', 'Single', 'Double', 'Triple', 'Quad', 'Penta'],
    softDrop: 1,                            // per row the player soft-drops
    hardDrop: 2,                            // per row of hard-drop distance
    combo: 50,                              // × combo count × level
    perfectClear: 2000,                     // × level, board emptied
    linesPerLevel: 10,
    maxLevel: 30,
  };

  const LOCK_RESET_LIMIT = 15;
  const CLEAR_ANIM_MS = 320;
  const CLEAR_ANIM_REDUCED_MS = 120;

  // Gravity follows the guideline curve: seconds per row = (0.8 - (L-1)*0.007)^(L-1).
  // Each difficulty maps the player's level onto that curve differently.
  const DIFFICULTIES = {
    easy: {
      id: 'easy', label: 'Easy', blurb: '7 classic pieces',
      speedStart: 1, speedStep: 1, speedCap: 15,
      lockDelay: { start: 500, step: 0, min: 500 },
    },
    medium: {
      id: 'medium', label: 'Medium', blurb: '11 pieces · faster',
      speedStart: 1, speedStep: 1.2, speedCap: 18,
      lockDelay: { start: 500, step: 5, min: 420 },
    },
    hard: {
      id: 'hard', label: 'Hard', blurb: '15 pieces · fastest',
      speedStart: 1.5, speedStep: 1.4, speedCap: 20,
      lockDelay: { start: 480, step: 15, min: 280 },
    },
  };
  const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

  function gravityInterval(diff, level) {
    const L = Math.min(diff.speedCap, diff.speedStart + (level - 1) * diff.speedStep);
    return 1000 * Math.pow(0.8 - (L - 1) * 0.007, L - 1);
  }

  function lockDelayFor(diff, level) {
    const d = diff.lockDelay;
    return Math.max(d.min, d.start - (level - 1) * d.step);
  }

  // ===========================================================================
  // 2. Piece definitions and rotation
  // ===========================================================================

  // Shapes are square matrices in spawn orientation ('#' = filled). Rotation
  // states are derived by rotating the matrix inside its box, which for the
  // classic pieces reproduces the standard rotation system exactly.
  const PIECE_DEFS = [
    { id: 'I', name: 'I', tier: 'classic', kicks: 'I', rows: ['....', '####', '....', '....'] },
    { id: 'O', name: 'O', tier: 'classic', kicks: 'O', rows: ['##', '##'] },
    { id: 'T', name: 'T', tier: 'classic', kicks: 'SRS', rows: ['.#.', '###', '...'] },
    { id: 'S', name: 'S', tier: 'classic', kicks: 'SRS', rows: ['.##', '##.', '...'] },
    { id: 'Z', name: 'Z', tier: 'classic', kicks: 'SRS', rows: ['##.', '.##', '...'] },
    { id: 'J', name: 'J', tier: 'classic', kicks: 'SRS', rows: ['#..', '###', '...'] },
    { id: 'L', name: 'L', tier: 'classic', kicks: 'SRS', rows: ['..#', '###', '...'] },
    // Medium additions: two trominoes and two pentominoes
    { id: 'C', name: 'Corner', tier: 'medium', kicks: 'GEN', rows: ['#.', '##'] },
    { id: 'R', name: 'Rod', tier: 'medium', kicks: 'GEN', rows: ['...', '###', '...'] },
    { id: 'P', name: 'Pillow', tier: 'medium', kicks: 'GEN', rows: ['###', '##.', '...'] },
    { id: 'U', name: 'Cup', tier: 'medium', kicks: 'GEN', rows: ['#.#', '###', '...'] },
    // Hard additions: awkward pentominoes
    { id: 'X', name: 'Cross', tier: 'hard', kicks: 'GEN', rows: ['.#.', '###', '.#.'] },
    { id: 'W', name: 'Stairs', tier: 'hard', kicks: 'GEN', rows: ['#..', '##.', '.##'] },
    { id: 'Y', name: 'Fork', tier: 'hard', kicks: 'GEN', rows: ['.#..', '####', '....', '....'] },
    { id: 'V', name: 'Wedge', tier: 'hard', kicks: 'GEN', rows: ['#..', '#..', '###'] },
  ];

  function rotateCW(cells, n) {
    return cells.map(([x, y]) => [n - 1 - y, x]);
  }

  function boundsOf(cells) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of cells) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  const PIECES = {};
  for (const def of PIECE_DEFS) {
    const n = def.rows.length;
    const base = [];
    def.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => { if (ch === '#') base.push([x, y]); });
    });
    const rotations = [base];
    for (let r = 1; r < 4; r++) rotations.push(rotateCW(rotations[r - 1], n));
    PIECES[def.id] = { ...def, size: n, rotations, bounds: rotations.map(boundsOf) };
  }

  const CLASSIC_IDS = PIECE_DEFS.filter((d) => d.tier === 'classic').map((d) => d.id);
  const MEDIUM_IDS = PIECE_DEFS.filter((d) => d.tier === 'medium').map((d) => d.id);
  const HARD_IDS = PIECE_DEFS.filter((d) => d.tier === 'hard').map((d) => d.id);
  DIFFICULTIES.easy.pieces = [...CLASSIC_IDS];
  DIFFICULTIES.medium.pieces = [...CLASSIC_IDS, ...MEDIUM_IDS];
  DIFFICULTIES.hard.pieces = [...CLASSIC_IDS, ...MEDIUM_IDS, ...HARD_IDS];

  // Kick tables are written y-up (as usually published) and converted to the
  // board's y-down coordinates below. Keys are "<from><to>" rotation states.
  const yDown = (table) => Object.fromEntries(
    Object.entries(table).map(([k, list]) => [k, list.map(([x, y]) => [x, -y])]));

  const KICKS_SRS = yDown({
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  });

  const KICKS_I = yDown({
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  });

  // Custom pieces: try in place, then sideways, then up (y-down: negative),
  // preferring the rotation direction's side first.
  const KICKS_GENERIC_CW = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1],
    [0, 1], [-2, 0], [2, 0], [0, -2]];
  const KICKS_GENERIC_CCW = KICKS_GENERIC_CW.map(([x, y]) => [-x, y]);

  function kicksFor(piece, from, to, dir) {
    switch (piece.kicks) {
      case 'O': return [[0, 0]];
      case 'I': return KICKS_I[`${from}${to}`];
      case 'SRS': return KICKS_SRS[`${from}${to}`];
      default: return dir > 0 ? KICKS_GENERIC_CW : KICKS_GENERIC_CCW;
    }
  }

  // ===========================================================================
  // 3. Themes (canvas side). Appearance only — nothing here touches gameplay.
  // ===========================================================================

  const THEMES = {
    retro70: {
      id: 'retro70', label: '70s Retro', blurb: 'Warm, groovy and round', group: 'Arcade eras',
      block: 'round',
      boardBg: ['#3e2c1f', '#2a1d14'],
      grid: 'rgba(243, 227, 195, 0.07)',
      flash: '#fff4dc',
      dead: '#7a6a58',
      letter: 'rgba(40, 20, 8, 0.5)',
      particles: true,
      colors: {
        I: '#3f9a8f', O: '#e0b23a', T: '#8a557a', S: '#8a9a3b', Z: '#c4512b',
        J: '#4f6d8f', L: '#e8772e',
        C: '#e58f6f', R: '#c9a36b', P: '#a3c48f', U: '#b5651d',
        X: '#f1dcb0', W: '#6b4a73', Y: '#d4c24a', V: '#9a6646',
      },
    },
    arcade80: {
      id: 'arcade80', label: '80s Arcade', blurb: 'Cabinet glow and grids', group: 'Arcade eras',
      block: 'bevel',
      boardBg: ['#140b45', '#06031c'],
      grid: 'rgba(0, 229, 255, 0.12)',
      flash: '#ffffff',
      dead: '#433a73',
      letter: 'rgba(0, 0, 0, 0.5)',
      particles: true,
      colors: {
        I: '#00e5ff', O: '#ffe14d', T: '#b14dff', S: '#39ff88', Z: '#ff3864',
        J: '#3d6bff', L: '#ff8a1f',
        C: '#ff4dd8', R: '#9ff6ff', P: '#c3ff3d', U: '#ff9ecf',
        X: '#ffffff', W: '#8f7bff', Y: '#ffb86b', V: '#00b3a4',
      },
    },
    classic90: {
      id: 'classic90', label: '90s Classic', blurb: 'Chunky primary colors', group: 'Arcade eras',
      block: 'chunky',
      boardBg: ['#1c1c48', '#10102a'],
      grid: 'rgba(255, 255, 255, 0.08)',
      flash: '#ffffff',
      dead: '#5c5c66',
      letter: 'rgba(0, 0, 0, 0.5)',
      particles: true,
      colors: {
        I: '#00b7ff', O: '#ffd400', T: '#9b3dff', S: '#2ecc40', Z: '#ff2a2a',
        J: '#1f4fff', L: '#ff8c00',
        C: '#ff5fb8', R: '#7fe9f5', P: '#a3e635', U: '#e11d74',
        X: '#e5e7eb', W: '#0d9488', Y: '#fde047', V: '#a0522d',
      },
    },
    neon: {
      id: 'neon', label: 'Neon Future', blurb: 'Glowing lines in the dark', group: 'Arcade eras',
      block: 'glow',
      boardBg: ['#08081c', '#03030b'],
      grid: 'rgba(0, 240, 255, 0.07)',
      flash: '#e6ffff',
      dead: '#2c2c4a',
      letter: null,             // drawn in the piece color
      particles: true,
      colors: {
        I: '#00f0ff', O: '#f5ff3d', T: '#c04dff', S: '#3dff7a', Z: '#ff2e88',
        J: '#2e6bff', L: '#ff9a2e',
        C: '#ff5ce1', R: '#5cfff2', P: '#b6ff3d', U: '#ff6b6b',
        X: '#ffffff', W: '#8a7dff', Y: '#ffd36b', V: '#2effc0',
      },
    },
    scifi: {
      id: 'scifi', label: 'Sci-Fi', blurb: 'Starship hull plating', group: 'Worlds',
      block: 'metal',
      boardBg: ['#0f1a2b', '#060b14'],
      grid: 'rgba(79, 195, 247, 0.10)',
      flash: '#e0f7ff',
      dead: '#3a4556',
      letter: 'rgba(0, 0, 0, 0.5)',
      particles: true,
      colors: {
        I: '#4fc3f7', O: '#ffd166', T: '#b388ff', S: '#69f0ae', Z: '#ff5252',
        J: '#448aff', L: '#ff9f1c',
        C: '#f06292', R: '#80deea', P: '#c6ff00', U: '#ff8a65',
        X: '#eceff1', W: '#7c4dff', Y: '#ffe57f', V: '#26a69a',
      },
    },
    matrix: {
      id: 'matrix', label: 'Matrix', blurb: 'Green code in the dark', group: 'Worlds',
      block: 'glow',
      boardBg: ['#001a08', '#000000'],
      grid: 'rgba(0, 255, 65, 0.08)',
      flash: '#d4ffd9',
      dead: '#0f3318',
      letter: null,
      particles: true,
      colors: {
        I: '#00ff41', O: '#b6ff00', T: '#39ff14', S: '#00e676', Z: '#76ff03',
        J: '#00ffa3', L: '#c6ff00',
        C: '#64ffda', R: '#1de9b6', P: '#aeea00', U: '#00c853',
        X: '#e0ffe0', W: '#69f0ae', Y: '#f4ff81', V: '#00bfa5',
      },
    },
    ninjas: {
      id: 'ninjas', label: 'Ninjas', blurb: 'Ink, paper and a red sun', group: 'Worlds',
      block: 'chunky',
      boardBg: ['#1d1a22', '#0e0c12'],
      grid: 'rgba(255, 255, 255, 0.06)',
      flash: '#fff5e6',
      dead: '#4a4450',
      letter: 'rgba(0, 0, 0, 0.5)',
      particles: true,
      colors: {
        I: '#3fa7d6', O: '#f2c14e', T: '#7b2d8b', S: '#5c946e', Z: '#c8102e',
        J: '#2e4a7d', L: '#e07a1f',
        C: '#f28fad', R: '#9cc5a1', P: '#b5a642', U: '#8c1c13',
        X: '#f2ead8', W: '#4a6670', Y: '#e9b44c', V: '#6b4226',
      },
    },
    western: {
      id: 'western', label: 'Western', blurb: 'Sunset saloon wood', group: 'Worlds',
      block: 'wood',
      boardBg: ['#4a2c17', '#2b190c'],
      grid: 'rgba(255, 210, 150, 0.07)',
      flash: '#fff0d0',
      dead: '#6e5c4c',
      letter: 'rgba(30, 15, 5, 0.55)',
      particles: true,
      colors: {
        I: '#4f86c6', O: '#e0a526', T: '#8b3a62', S: '#6b8e23', Z: '#b7410e',
        J: '#2f4f6f', L: '#d2691e',
        C: '#e9967a', R: '#87ceeb', P: '#9acd32', U: '#a52a2a',
        X: '#f5deb3', W: '#708090', Y: '#daa520', V: '#8b5a2b',
      },
    },
    america: {
      id: 'america', label: 'America', blurb: 'Stars and stripes', group: 'Holidays',
      block: 'bevel',
      boardBg: ['#0b2552', '#061633'],
      grid: 'rgba(255, 255, 255, 0.08)',
      flash: '#ffffff',
      dead: '#5a6478',
      letter: 'rgba(0, 0, 0, 0.45)',
      particles: true,
      colors: {
        I: '#4a90e2', O: '#f5f5f5', T: '#b22234', S: '#1d3c78', Z: '#ff4d5a',
        J: '#7fa7e0', L: '#f2c14e',
        C: '#ffb3c1', R: '#bde0fe', P: '#2a9d8f', U: '#8b0000',
        X: '#ffd700', W: '#5e60ce', Y: '#c0c0c0', V: '#0077b6',
      },
    },
    halloween: {
      id: 'halloween', label: 'Halloween', blurb: 'Pumpkins under a full moon', group: 'Holidays',
      block: 'round',
      boardBg: ['#1e0b26', '#0b0410'],
      grid: 'rgba(255, 117, 24, 0.08)',
      flash: '#fff1d6',
      dead: '#3d3340',
      letter: 'rgba(20, 0, 20, 0.55)',
      particles: true,
      colors: {
        I: '#7cff4f', O: '#ff7518', T: '#8e44ad', S: '#2ecc71', Z: '#e74c3c',
        J: '#5b2c6f', L: '#ffb347',
        C: '#f8f8ff', R: '#a3e635', P: '#d35400', U: '#c0392b',
        X: '#fdf5e6', W: '#6c3483', Y: '#f1c40f', V: '#566573',
      },
    },
    thanksgiving: {
      id: 'thanksgiving', label: 'Thanksgiving', blurb: 'Harvest plaid and wood', group: 'Holidays',
      block: 'wood',
      boardBg: ['#3b2414', '#24150b'],
      grid: 'rgba(255, 220, 170, 0.07)',
      flash: '#fff3dc',
      dead: '#6d5a4a',
      letter: 'rgba(40, 20, 5, 0.5)',
      particles: true,
      colors: {
        I: '#c0392b', O: '#e9a23b', T: '#8e5a2b', S: '#7a8b2c', Z: '#d35400',
        J: '#5d4037', L: '#f39c12',
        C: '#e6b88a', R: '#b7950b', P: '#a04000', U: '#7b241c',
        X: '#f5deb3', W: '#556b2f', Y: '#ffcf40', V: '#8d6e63',
      },
    },
    hanukkah: {
      id: 'hanukkah', label: 'Hanukkah', blurb: 'Blue, silver and candlelight', group: 'Holidays',
      block: 'metal',
      boardBg: ['#0d2c74', '#06163d'],
      grid: 'rgba(200, 215, 240, 0.10)',
      flash: '#ffffff',
      dead: '#4a5878',
      letter: 'rgba(0, 0, 0, 0.45)',
      particles: true,
      colors: {
        I: '#4f8ef7', O: '#ffd36b', T: '#c9d3e6', S: '#2a5bd7', Z: '#89b4ff',
        J: '#1b3a8a', L: '#f5b041',
        C: '#e8eef9', R: '#6fa8dc', P: '#b0bec5', U: '#3d6fd1',
        X: '#fff3b0', W: '#7986cb', Y: '#d4af37', V: '#90caf9',
      },
    },
    christmas: {
      id: 'christmas', label: 'Christmas', blurb: 'Ornaments and falling snow', group: 'Holidays',
      block: 'round',
      boardBg: ['#0d3b23', '#062214'],
      grid: 'rgba(255, 255, 255, 0.06)',
      flash: '#fffaf0',
      dead: '#4b5a50',
      letter: 'rgba(0, 0, 0, 0.45)',
      particles: true,
      colors: {
        I: '#2ecc71', O: '#ffd700', T: '#9b59b6', S: '#27ae60', Z: '#e3121b',
        J: '#3498db', L: '#ff8c1a',
        C: '#ff9eb5', R: '#c0e8ff', P: '#a5d610', U: '#b3141f',
        X: '#ffffff', W: '#1abc9c', Y: '#f7dc6f', V: '#c0c0c0',
      },
    },
    easter: {
      id: 'easter', label: 'Easter', blurb: 'Pastel eggs and polka dots', group: 'Holidays',
      block: 'flat',
      boardBg: ['#fff6fb', '#f1e6f7'],
      grid: 'rgba(120, 80, 160, 0.10)',
      flash: '#ffffff',
      dead: '#c9c0cf',
      letter: 'rgba(60, 30, 80, 0.55)',
      particles: true,
      colors: {
        I: '#7ec8e3', O: '#ffe066', T: '#c39bd3', S: '#90e0a0', Z: '#ff8fab',
        J: '#8fa8ff', L: '#ffb870',
        C: '#ffc8dd', R: '#a0f0e0', P: '#d4f08c', U: '#f4978e',
        X: '#fff1c1', W: '#b8a1e8', Y: '#f9d56e', V: '#9ad1d4',
      },
    },
    spring: {
      id: 'spring', label: 'Spring', blurb: 'Blossoms on green hills', group: 'Seasons',
      block: 'round',
      boardBg: ['#24452a', '#142a18'],
      grid: 'rgba(255, 255, 255, 0.07)',
      flash: '#fffde7',
      dead: '#55655a',
      letter: 'rgba(0, 0, 0, 0.45)',
      particles: true,
      colors: {
        I: '#4fc3f7', O: '#ffeb3b', T: '#ce93d8', S: '#66bb6a', Z: '#f06292',
        J: '#7986cb', L: '#ffa726',
        C: '#f8bbd0', R: '#b2dfdb', P: '#d4e157', U: '#ef5350',
        X: '#fffde7', W: '#9575cd', Y: '#ffd54f', V: '#a1887f',
      },
    },
    beach: {
      id: 'beach', label: 'Beach', blurb: 'Sun, sea and sand', group: 'Seasons',
      block: 'flat',
      boardBg: ['#0e7490', '#0b4f63'],
      grid: 'rgba(255, 255, 255, 0.08)',
      flash: '#fffbe6',
      dead: '#5f7f88',
      letter: 'rgba(0, 0, 0, 0.4)',
      particles: true,
      colors: {
        I: '#38bdf8', O: '#fde047', T: '#f472b6', S: '#4ade80', Z: '#fb7185',
        J: '#3b82f6', L: '#fb923c',
        C: '#f9a8d4', R: '#a5f3fc', P: '#bef264', U: '#f87171',
        X: '#fef3c7', W: '#2dd4bf', Y: '#facc15', V: '#d6a76c',
      },
    },
    winter: {
      id: 'winter', label: 'Winter', blurb: 'Ice blocks and snowfall', group: 'Seasons',
      block: 'bevel',
      boardBg: ['#1c3550', '#0e1d2e'],
      grid: 'rgba(200, 230, 255, 0.10)',
      flash: '#ffffff',
      dead: '#5b6b7b',
      letter: 'rgba(0, 0, 0, 0.4)',
      particles: true,
      colors: {
        I: '#9be7ff', O: '#e3f2fd', T: '#b39ddb', S: '#80cbc4', Z: '#ef9a9a',
        J: '#64b5f6', L: '#ffcc80',
        C: '#f8bbd0', R: '#b2ebf2', P: '#c5e1a5', U: '#90a4ae',
        X: '#ffffff', W: '#7986cb', Y: '#fff59d', V: '#4dd0e1',
      },
    },
  };
  const THEME_GROUPS = [
    ['Arcade eras', ['retro70', 'arcade80', 'classic90', 'neon']],
    ['Worlds', ['scifi', 'matrix', 'ninjas', 'western']],
    ['Holidays', ['america', 'halloween', 'thanksgiving', 'hanukkah', 'christmas', 'easter']],
    ['Seasons', ['spring', 'beach', 'winter']],
  ];
  const THEME_ORDER = THEME_GROUPS.flatMap(([, ids]) => ids);

  // ===========================================================================
  // 4. Preferences (localStorage, failure-tolerant)
  // ===========================================================================

  const STORAGE_KEY = 'stackAttack.v1';
  // Bumped when a default changes in a way saved settings should pick up.
  const PREF_VERSION = 2;
  const PREF_DEFAULTS = {
    version: PREF_VERSION,
    theme: 'neon',
    difficulty: 'easy',
    das: 167,
    arr: 33,
    sdf: 20,
    ghost: true,
    letters: false,
    touch: 'auto',
    musicVol: 60,
    sfxVol: 80,
    muted: false,
    best: { easy: 0, medium: 0, hard: 0 },
  };
  const SETTINGS_DEFAULTS = {
    das: 167, arr: 33, sdf: 20, ghost: true, letters: false, touch: 'auto', musicVol: 60, sfxVol: 80,
  };

  class Preferences {
    constructor() {
      this.data = structuredCloneSafe(PREF_DEFAULTS);
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch (e) {
        saved = null;
      }
      if (saved && typeof saved === 'object') this.merge(saved);
    }

    merge(s) {
      const d = this.data;
      if (THEMES[s.theme]) d.theme = s.theme;
      if (DIFFICULTIES[s.difficulty]) d.difficulty = s.difficulty;
      if (Number.isFinite(s.das)) d.das = clamp(Math.round(s.das), 50, 300);
      if (Number.isFinite(s.arr)) d.arr = clamp(Math.round(s.arr), 0, 100);
      if ([10, 20, 40, 1000].includes(s.sdf)) d.sdf = s.sdf;
      if (typeof s.ghost === 'boolean') d.ghost = s.ghost;
      // Letters used to default to on; older saves get the new default (off).
      if (typeof s.letters === 'boolean' && s.version >= 2) d.letters = s.letters;
      if (['auto', 'on', 'off'].includes(s.touch)) d.touch = s.touch;
      if (Number.isFinite(s.musicVol)) d.musicVol = clamp(Math.round(s.musicVol), 0, 100);
      if (Number.isFinite(s.sfxVol)) d.sfxVol = clamp(Math.round(s.sfxVol), 0, 100);
      if (typeof s.muted === 'boolean') d.muted = s.muted;
      if (s.best && typeof s.best === 'object') {
        for (const id of DIFFICULTY_ORDER) {
          const v = s.best[id];
          if (Number.isFinite(v) && v >= 0) d.best[id] = Math.floor(v);
        }
      }
    }

    set(key, value) {
      this.data[key] = value;
      this.save();
    }

    setBest(diffId, score) {
      this.data.best[diffId] = score;
      this.save();
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) {
        // Storage can be unavailable (private mode, quota); the game still works.
      }
    }
  }

  function structuredCloneSafe(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // ===========================================================================
  // 5. Board and collision
  // ===========================================================================

  class Board {
    constructor() {
      this.reset();
    }

    reset() {
      this.cells = Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(null));
    }

    collides(piece, rot, px, py) {
      for (const [cx, cy] of piece.rotations[rot]) {
        const x = px + cx;
        const y = py + cy;
        if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return true;
        if (y >= 0 && this.cells[y][x]) return true;
      }
      return false;
    }

    /** Writes the piece into the grid and returns its absolute cells. */
    place(active) {
      const out = [];
      for (const [cx, cy] of active.piece.rotations[active.rot]) {
        const x = active.x + cx;
        const y = active.y + cy;
        if (y >= 0) this.cells[y][x] = active.id;
        out.push([x, y]);
      }
      return out;
    }

    fullRows() {
      const rows = [];
      for (let y = 0; y < TOTAL_ROWS; y++) {
        if (this.cells[y].every(Boolean)) rows.push(y);
      }
      return rows;
    }

    emptyApartFrom(rows) {
      for (let y = 0; y < TOTAL_ROWS; y++) {
        if (rows.includes(y)) continue;
        if (this.cells[y].some(Boolean)) return false;
      }
      return true;
    }

    clearRows(rows) {
      const keep = this.cells.filter((_, y) => !rows.includes(y));
      while (keep.length < TOTAL_ROWS) keep.unshift(new Array(COLS).fill(null));
      this.cells = keep;
    }
  }

  // ===========================================================================
  // 6. Randomizer: shuffled bag containing one of every enabled piece
  // ===========================================================================

  const FRIENDLY_OPENERS = ['I', 'T', 'J', 'L'];

  class Bag {
    constructor(ids) {
      this.ids = [...ids];
      this.pool = [];
      this.first = true;
    }

    next() {
      if (!this.pool.length) this.refill();
      return this.pool.pop();
    }

    refill() {
      const a = [...this.ids];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      if (this.first) {
        // The very first piece of a game is never an awkward one.
        const k = a.findIndex((id) => FRIENDLY_OPENERS.includes(id));
        [a[k], a[a.length - 1]] = [a[a.length - 1], a[k]];
        this.first = false;
      }
      this.pool = a;
    }
  }

  // ===========================================================================
  // 7. Game engine
  // ===========================================================================

  const State = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    CLEARING: 'clearing',
    OVER: 'over',
  };

  class Game {
    /**
     * @param {Preferences} prefs  input timing (DAS/ARR/soft drop) and best scores
     * @param {(type: string, payload?: any) => void} emit  notifications for the UI
     */
    constructor(prefs, emit) {
      this.prefs = prefs;
      this.emit = emit;
      this.board = new Board();
      this.state = State.MENU;
      this.reduceMotion = false;
      this.diff = DIFFICULTIES.easy;
      this.held = { left: false, right: false, soft: false };
      this.hDir = 0;
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.resetRun();
    }

    resetRun() {
      this.board.reset();
      this.queue = [];
      this.active = null;
      this.holdId = null;
      this.holdUsed = false;
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.combo = -1;
      this.clearing = null;
      this.gravityAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = 0;
      this.overT = 0;
      this.isNewBest = false;
      this.resumeState = State.PLAYING;
    }

    get inRun() {
      return this.state === State.PLAYING || this.state === State.PAUSED
        || this.state === State.CLEARING;
    }

    start(diffId) {
      this.diff = DIFFICULTIES[diffId] || DIFFICULTIES.easy;
      this.resetRun();
      this.bag = new Bag(this.diff.pieces);
      this.fillQueue();
      this.state = State.PLAYING;
      this.emit('sound', 'start');
      this.spawn(this.takeNext());
      this.emit('state');
      this.emit('hud');
    }

    /** Ends the current run (restart / quit / difficulty change), keeping its best score. */
    abandon() {
      if (this.inRun) this.recordBest();
      this.resetRun();
      this.state = State.MENU;
      this.emit('state');
      this.emit('hud');
    }

    fillQueue() {
      while (this.queue.length < NEXT_COUNT) this.queue.push(this.bag.next());
    }

    takeNext() {
      const id = this.queue.shift();
      this.fillQueue();
      return id;
    }

    spawn(id) {
      const piece = PIECES[id];
      const b = piece.bounds[0];
      const x = Math.floor((COLS - b.w) / 2) - b.minX;
      let y = BUFFER - 1 - b.maxY;          // bottom row sits just above the field
      if (this.board.collides(piece, 0, x, y)) {
        this.active = null;
        this.gameOver();
        return false;
      }
      if (!this.board.collides(piece, 0, x, y + 1)) y += 1;   // drop into view
      this.active = { id, piece, rot: 0, x, y };
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = y;
      this.gravityAcc = 0;
      this.emit('hud');
      return true;
    }

    canControl() {
      return this.state === State.PLAYING && !!this.active;
    }

    // ---- input entry points (called by the input manager) ----

    press(action) {
      switch (action) {
        case 'left':
        case 'right': {
          const d = action === 'left' ? -1 : 1;
          this.held[action] = true;
          this.hDir = d;
          this.dasTimer = 0;
          this.arrTimer = 0;
          if (this.canControl() && this.tryMove(d, 0)) this.emit('sound', 'move');
          break;
        }
        case 'soft':
          this.held.soft = true;
          if (this.canControl()) {
            if (this.tryMove(0, 1)) this.addScore(SCORING.softDrop);
            this.gravityAcc = 0;
          }
          break;
        case 'cw':
        case 'ccw':
          if (this.canControl() && this.tryRotate(action === 'cw' ? 1 : -1)) this.emit('sound', 'rotate');
          break;
        case 'hard':
          if (this.canControl()) this.hardDrop();
          break;
        case 'hold':
          if (this.canControl()) this.holdPiece();
          break;
        default:
          break;
      }
    }

    release(action) {
      if (action === 'left' || action === 'right') {
        const d = action === 'left' ? -1 : 1;
        const other = action === 'left' ? 'right' : 'left';
        this.held[action] = false;
        if (this.hDir === d) {
          this.hDir = this.held[other] ? -d : 0;
          this.dasTimer = 0;
          this.arrTimer = 0;
        }
      } else if (action === 'soft') {
        this.held.soft = false;
      }
    }

    releaseAll() {
      this.held.left = this.held.right = this.held.soft = false;
      this.hDir = 0;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }

    // ---- piece manipulation ----

    tryMove(dx, dy) {
      const a = this.active;
      if (!a || this.board.collides(a.piece, a.rot, a.x + dx, a.y + dy)) return false;
      a.x += dx;
      a.y += dy;
      this.afterShift();
      return true;
    }

    tryRotate(dir) {
      const a = this.active;
      if (!a) return false;
      const to = (a.rot + (dir > 0 ? 1 : 3)) % 4;
      for (const [kx, ky] of kicksFor(a.piece, a.rot, to, dir)) {
        if (!this.board.collides(a.piece, to, a.x + kx, a.y + ky)) {
          a.x += kx;
          a.y += ky;
          a.rot = to;
          this.afterShift();
          return true;
        }
      }
      return false;
    }

    /**
     * Lock-delay bookkeeping. Reaching a new lowest row restores the reset
     * budget; any other successful move while grounded spends one reset, so a
     * piece cannot be stalled forever.
     */
    afterShift() {
      const a = this.active;
      if (a.y > this.lowestY) {
        this.lowestY = a.y;
        this.lockResets = 0;
        this.lockTimer = 0;
      } else if (this.lockTimer > 0 && this.lockResets < LOCK_RESET_LIMIT) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }

    ghostY() {
      const a = this.active;
      let y = a.y;
      while (!this.board.collides(a.piece, a.rot, a.x, y + 1)) y++;
      return y;
    }

    hardDrop() {
      const a = this.active;
      const gy = this.ghostY();
      const dist = gy - a.y;
      if (dist > 0) {
        const cols = new Map();
        for (const [cx, cy] of a.piece.rotations[a.rot]) {
          const x = a.x + cx;
          const top = a.y + cy;
          if (!cols.has(x) || cols.get(x) > top) cols.set(x, top);
        }
        this.emit('effect', {
          kind: 'trail', id: a.id,
          cols: [...cols].map(([x, top]) => ({ x, y0: top, y1: top + dist })),
        });
      }
      a.y = gy;
      this.addScore(dist * SCORING.hardDrop);
      this.emit('sound', 'hardDrop');
      this.lock();
    }

    holdPiece() {
      if (this.holdUsed) {
        this.emit('denied');
        return;
      }
      const current = this.active.id;
      const incoming = this.holdId || this.takeNext();
      this.holdId = current;
      this.holdUsed = true;
      this.emit('sound', 'hold');
      this.spawn(incoming);
      this.emit('hud');
    }

    lock() {
      const a = this.active;
      const cells = this.board.place(a);
      this.active = null;
      this.holdUsed = false;
      this.emit('effect', { kind: 'lock', id: a.id, cells });
      this.emit('sound', 'lock');

      // Lock out: the whole piece came to rest above the visible field.
      if (cells.every(([, y]) => y < BUFFER)) {
        this.gameOver();
        return;
      }

      const rows = this.board.fullRows();
      if (rows.length) {
        this.combo++;
        this.emit('sound', `clear${Math.min(4, rows.length)}`);
        this.awardLines(rows.length, this.board.emptyApartFrom(rows));
        this.clearing = {
          rows, t: 0,
          dur: this.reduceMotion ? CLEAR_ANIM_REDUCED_MS : CLEAR_ANIM_MS,
        };
        this.state = State.CLEARING;
        this.emit('effect', {
          kind: 'clear',
          cells: rows.flatMap((y) => this.board.cells[y].map((id, x) => ({ x, y, id }))),
        });
      } else {
        this.combo = -1;
        this.spawn(this.takeNext());
      }
      this.emit('hud');
    }

    awardLines(n, perfect) {
      const lv = this.level;
      const table = SCORING.lines;
      let pts = table[Math.min(n, table.length - 1)] * lv;
      const parts = [SCORING.lineNames[n] || `${n} lines`];
      if (this.combo > 0) {
        pts += SCORING.combo * this.combo * lv;
        parts.push(`Combo ×${this.combo}`);
      }
      if (perfect) {
        pts += SCORING.perfectClear * lv;
        parts.push('Perfect clear!');
      }
      this.addScore(pts);
      this.lines += n;
      const newLevel = Math.min(SCORING.maxLevel, 1 + Math.floor(this.lines / SCORING.linesPerLevel));
      if (newLevel > this.level) {
        this.level = newLevel;
        parts.push(`Level ${newLevel}`);
        this.emit('sound', 'levelUp');
      }
      this.emit('action', `${parts.join('\n')}\n+${pts.toLocaleString()}`);
    }

    finishClear() {
      this.board.clearRows(this.clearing.rows);
      this.clearing = null;
      this.state = State.PLAYING;
      this.spawn(this.takeNext());
    }

    addScore(n) {
      if (n > 0) {
        this.score += n;
        this.emit('hud');
      }
    }

    recordBest() {
      const best = this.prefs.data.best[this.diff.id] || 0;
      if (this.score > best) {
        this.prefs.setBest(this.diff.id, this.score);
        return true;
      }
      return false;
    }

    gameOver() {
      this.active = null;
      this.state = State.OVER;
      this.overT = 0;
      this.releaseAll();
      this.isNewBest = this.recordBest();
      this.emit('sound', 'gameOver');
      this.emit('state');
      this.emit('hud');
    }

    pause() {
      if (this.state !== State.PLAYING && this.state !== State.CLEARING) return false;
      this.resumeState = this.state;
      this.state = State.PAUSED;
      this.releaseAll();
      this.emit('state');
      return true;
    }

    resume() {
      if (this.state !== State.PAUSED) return;
      this.state = this.resumeState;
      this.emit('state');
    }

    // ---- per-frame update ----

    update(dt) {
      if (this.state === State.OVER) {
        this.overT += dt;
        return;
      }
      if (this.state === State.CLEARING) {
        this.updateShift(dt);
        this.clearing.t += dt;
        if (this.clearing.t >= this.clearing.dur) this.finishClear();
        return;
      }
      if (this.state !== State.PLAYING || !this.active) return;

      this.updateShift(dt);
      this.updateGravity(dt);
      if (!this.active) return;

      // The lock timer only runs while grounded and merely pauses while
      // airborne; it restarts via afterShift (budgeted) or a new lowest row.
      const a = this.active;
      if (this.board.collides(a.piece, a.rot, a.x, a.y + 1)) {
        this.lockTimer += dt;
        if (this.lockTimer >= lockDelayFor(this.diff, this.level)) this.lock();
      }
    }

    /** Delayed auto shift / auto repeat rate for held left/right. */
    updateShift(dt) {
      const d = this.hDir;
      if (!d) return;
      const { das, arr } = this.prefs.data;
      const before = this.dasTimer;
      this.dasTimer = Math.min(this.dasTimer + dt, das + 1000);
      if (this.dasTimer < das || !this.canControl()) return;
      const x0 = this.active.x;
      if (arr === 0) {
        while (this.tryMove(d, 0));
      } else {
        if (before < das) {
          this.arrTimer = this.dasTimer - das;
          this.tryMove(d, 0);
        } else {
          this.arrTimer += dt;
        }
        while (this.arrTimer >= arr) {
          this.arrTimer -= arr;
          if (!this.tryMove(d, 0)) {
            this.arrTimer = 0;
            break;
          }
        }
      }
      if (this.active && this.active.x !== x0) this.emit('sound', 'move');
    }

    updateGravity(dt) {
      const g = gravityInterval(this.diff, this.level);
      const soft = this.held.soft;
      const interval = soft ? Math.min(g, g / this.prefs.data.sdf) : g;
      this.gravityAcc += dt;
      let steps = 0;
      while (this.gravityAcc >= interval && steps < TOTAL_ROWS) {
        this.gravityAcc -= interval;
        if (!this.tryMove(0, 1)) {
          this.gravityAcc = 0;
          break;
        }
        steps++;
        if (soft) this.addScore(SCORING.softDrop);
      }
      if (steps >= TOTAL_ROWS) this.gravityAcc = 0;
    }
  }

  // ===========================================================================
  // 8. Renderer
  // ===========================================================================

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** amt > 0 mixes toward white, amt < 0 toward black. */
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const t = amt > 0 ? 255 : 0;
    const k = Math.abs(amt);
    const mix = (c) => Math.round(c + (t - c) * k);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }

  function withAlpha(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  class Renderer {
    constructor(boardCanvas, holdCanvas, nextCanvas) {
      this.board = boardCanvas;
      this.bctx = boardCanvas.getContext('2d');
      this.hold = holdCanvas;
      this.hctx = holdCanvas.getContext('2d');
      this.next = nextCanvas;
      this.nctx = nextCanvas.getContext('2d');
      this.theme = THEMES.neon;
      this.cell = 24;
      this.dpr = 1;
      this.showGhost = true;
      this.showLetters = true;
      this.reduceMotion = false;
      this.sprites = new Map();
      this.effects = [];
      this.particles = [];
    }

    setTheme(theme) {
      this.theme = theme;
      this.sprites.clear();
    }

    setOptions({ ghost, letters }) {
      this.showGhost = ghost;
      this.showLetters = letters;
      this.sprites.clear();
    }

    resizeBoard(cell) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.cell = cell;
      this.board.width = Math.round(cell * COLS * this.dpr);
      this.board.height = Math.round(cell * ROWS * this.dpr);
      this.sprites.clear();
    }

    /** Matches a preview canvas' backing store to its CSS size. */
    fitCanvas(canvas) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pw = Math.max(1, Math.round(w * this.dpr));
      const ph = Math.max(1, Math.round(h * this.dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      return { w, h };
    }

    // ---- block sprites ----

    sprite(id, size, variant) {
      const key = `${id}|${size.toFixed(2)}|${variant}|${this.dpr}`;
      let spr = this.sprites.get(key);
      if (spr) return spr;
      const glow = this.theme.block === 'glow' && variant !== 'dead';
      const pad = glow ? Math.ceil(size * 0.4) : 0;
      const canvas = document.createElement('canvas');
      const full = size + pad * 2;
      canvas.width = Math.max(1, Math.ceil(full * this.dpr));
      canvas.height = canvas.width;
      const ctx = canvas.getContext('2d');
      ctx.scale(this.dpr, this.dpr);
      ctx.translate(pad, pad);
      if (variant === 'ghost') this.paintGhost(ctx, size, this.theme.colors[id]);
      else if (variant === 'dead') this.paintBlock(ctx, size, this.theme.dead, null);
      else this.paintBlock(ctx, size, this.theme.colors[id], PIECES[id]);
      spr = { canvas, pad, full };
      this.sprites.set(key, spr);
      return spr;
    }

    blit(ctx, id, x, y, size, variant = 'normal') {
      const spr = this.sprite(id, size, variant);
      ctx.drawImage(spr.canvas, x - spr.pad, y - spr.pad, spr.full, spr.full);
    }

    paintBlock(ctx, s, color, piece) {
      const style = this.theme.block;
      if (style === 'round') {
        const i = s * 0.06;
        roundRectPath(ctx, i, i, s - i * 2, s - i * 2, s * 0.28);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(60, 30, 10, 0.2)';
        ctx.fillRect(0, s * 0.64, s, s);
        ctx.restore();
        ctx.fillStyle = 'rgba(255, 250, 235, 0.45)';
        ctx.beginPath();
        ctx.ellipse(s * 0.34, s * 0.28, s * 0.16, s * 0.09, -0.5, 0, Math.PI * 2);
        ctx.fill();
        roundRectPath(ctx, i, i, s - i * 2, s - i * 2, s * 0.28);
        ctx.strokeStyle = shade(color, -0.4);
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.stroke();
      } else if (style === 'bevel') {
        const b = s * 0.15;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, s, s);
        const tri = (pts, fill) => {
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
        };
        tri([0, 0, s, 0, s - b, b, b, b], shade(color, 0.5));
        tri([0, 0, b, b, b, s - b, 0, s], shade(color, 0.25));
        tri([s, 0, s, s, s - b, s - b, s - b, b], shade(color, -0.3));
        tri([0, s, b, s - b, s - b, s - b, s, s], shade(color, -0.5));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
      } else if (style === 'chunky') {
        const lw = Math.max(1.5, s * 0.09);
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = color;
        ctx.fillRect(lw, lw, s - lw * 2, s - lw * 2);
        ctx.fillStyle = shade(color, -0.3);
        ctx.fillRect(lw, s - lw - s * 0.16, s - lw * 2, s * 0.16);
        ctx.fillRect(s - lw - s * 0.16, lw, s * 0.16, s - lw * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(lw + s * 0.08, lw + s * 0.08, s * 0.18, s * 0.18);
      } else if (style === 'metal') {
        const g = ctx.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0, shade(color, 0.45));
        g.addColorStop(0.5, color);
        g.addColorStop(0.52, shade(color, -0.12));
        g.addColorStop(1, shade(color, -0.4));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = shade(color, -0.55);
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (const [rx, ry] of [[0.24, 0.24], [0.76, 0.76]]) {
          ctx.beginPath();
          ctx.arc(s * rx, s * ry, Math.max(0.8, s * 0.045), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (style === 'flat') {
        const i = s * 0.05;
        roundRectPath(ctx, i, i, s - i * 2, s - i * 2, s * 0.22);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = shade(color, -0.32);
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.stroke();
        roundRectPath(ctx, s * 0.17, s * 0.17, s * 0.66, s * 0.66, s * 0.14);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.stroke();
      } else if (style === 'wood') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = shade(color, -0.25);
        ctx.lineWidth = Math.max(1, s * 0.04);
        for (let k = 1; k <= 3; k++) {
          const y = (s * k) / 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(s * 0.3, y - s * 0.07, s * 0.6, y + s * 0.07, s, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(0, 0, s, s * 0.14);
        const lw = Math.max(1, s * 0.07);
        ctx.strokeStyle = shade(color, -0.5);
        ctx.lineWidth = lw;
        ctx.strokeRect(lw / 2, lw / 2, s - lw, s - lw);
      } else {
        const i = s * 0.1;
        roundRectPath(ctx, i, i, s - i * 2, s - i * 2, s * 0.14);
        ctx.fillStyle = withAlpha(color, 0.2);
        ctx.fill();
        ctx.shadowColor = color;
        ctx.shadowBlur = s * 0.45;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, s * 0.1);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.moveTo(s * 0.26, s * 0.24);
        ctx.lineTo(s * 0.6, s * 0.24);
        ctx.stroke();
      }
      if (piece) this.paintMarks(ctx, s, color, piece);
    }

    /** Tier markers and letters, so pieces never rely on color alone. */
    paintMarks(ctx, s, color, piece) {
      const neon = this.theme.block === 'glow';
      const mark = neon ? withAlpha(color, 0.7) : 'rgba(0, 0, 0, 0.32)';
      const i = s * 0.14;
      if (piece.tier === 'medium') {
        const k = s * 0.3;
        ctx.fillStyle = mark;
        ctx.beginPath();
        ctx.moveTo(s - i - k, i);
        ctx.lineTo(s - i, i);
        ctx.lineTo(s - i, i + k);
        ctx.closePath();
        ctx.fill();
      } else if (piece.tier === 'hard') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(i, i, s - i * 2, s - i * 2);
        ctx.clip();
        ctx.strokeStyle = mark;
        ctx.lineWidth = Math.max(1, s * 0.07);
        for (let d = -s; d < s * 2; d += s * 0.3) {
          ctx.beginPath();
          ctx.moveTo(d, s);
          ctx.lineTo(d + s, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (this.showLetters && s >= 11) {
        ctx.fillStyle = this.theme.letter || color;
        ctx.font = `800 ${Math.round(s * 0.44)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(piece.id, s / 2, s / 2 + s * 0.03);
      }
    }

    paintGhost(ctx, s, color) {
      const i = s * 0.1;
      const r = this.theme.block === 'round' || this.theme.block === 'flat' ? s * 0.26 : s * 0.1;
      roundRectPath(ctx, i, i, s - i * 2, s - i * 2, r);
      ctx.fillStyle = withAlpha(color, 0.16);
      ctx.fill();
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.setLineDash([s * 0.18, s * 0.1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- effects ----

    addEffect(e, now) {
      if (e.kind === 'clear') {
        if (this.reduceMotion || !this.theme.particles) return;
        for (const c of e.cells) {
          if (!c.id || this.particles.length > 320) continue;
          for (let k = 0; k < 2; k++) {
            this.particles.push({
              x: (c.x + 0.5) * this.cell,
              y: (c.y - BUFFER + 0.5) * this.cell,
              vx: (Math.random() - 0.5) * this.cell * 14,
              vy: (-Math.random() * 10 - 2) * this.cell,
              life: 0,
              max: 450 + Math.random() * 350,
              color: this.theme.colors[c.id],
              size: this.cell * (0.18 + Math.random() * 0.22),
            });
          }
        }
        return;
      }
      if (e.kind === 'trail' && this.reduceMotion) return;
      this.effects.push({ ...e, born: now, dur: e.kind === 'trail' ? 200 : 170 });
    }

    clearEffects() {
      this.effects.length = 0;
      this.particles.length = 0;
    }

    // ---- board ----

    drawBoard(game, now, dt) {
      const ctx = this.bctx;
      const s = this.cell;
      const t = this.theme;
      const W = s * COLS;
      const H = s * ROWS;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, t.boardBg[0]);
      bg.addColorStop(1, t.boardBg[1]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = t.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < COLS; x++) {
        ctx.moveTo(x * s + 0.5, 0);
        ctx.lineTo(x * s + 0.5, H);
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.moveTo(0, y * s + 0.5);
        ctx.lineTo(W, y * s + 0.5);
      }
      ctx.stroke();

      // Locked cells; on game over the stack greys out from the bottom up.
      const cells = game.board.cells;
      const greyRows = game.state === State.OVER
        ? (this.reduceMotion ? ROWS : Math.floor(game.overT / 30)) : 0;
      for (let y = BUFFER; y < TOTAL_ROWS; y++) {
        const dead = TOTAL_ROWS - 1 - y < greyRows;
        for (let x = 0; x < COLS; x++) {
          const id = cells[y][x];
          if (id) this.blit(ctx, id, x * s, (y - BUFFER) * s, s, dead ? 'dead' : 'normal');
        }
      }

      if (game.clearing) this.drawClearing(ctx, game.clearing, W);

      const a = game.active;
      if (a && (game.state === State.PLAYING || game.state === State.PAUSED)) {
        const shape = a.piece.rotations[a.rot];
        if (this.showGhost) {
          const gy = game.ghostY();
          if (gy !== a.y) {
            for (const [cx, cy] of shape) {
              this.blit(ctx, a.id, (a.x + cx) * s, (gy + cy - BUFFER) * s, s, 'ghost');
            }
          }
        }
        for (const [cx, cy] of shape) {
          this.blit(ctx, a.id, (a.x + cx) * s, (a.y + cy - BUFFER) * s, s);
        }
      }

      this.drawEffects(ctx, now, dt);
    }

    drawClearing(ctx, clearing, W) {
      const s = this.cell;
      const p = Math.min(1, clearing.t / clearing.dur);
      for (const y of clearing.rows) {
        const vy = (y - BUFFER) * s;
        ctx.globalAlpha = 0.85 * Math.min(1, p * 2.2);
        ctx.fillStyle = this.theme.flash;
        ctx.fillRect(0, vy, W, s);
        if (p > 0.4) {
          const w = W * ((p - 0.4) / 0.6);
          ctx.globalAlpha = 1;
          ctx.fillStyle = this.theme.boardBg[1];
          ctx.fillRect((W - w) / 2, vy, w, s);
        }
      }
      ctx.globalAlpha = 1;
    }

    drawEffects(ctx, now, dt) {
      const s = this.cell;
      this.effects = this.effects.filter((e) => now - e.born < e.dur);
      for (const e of this.effects) {
        const k = clamp(1 - (now - e.born) / e.dur, 0, 1);
        if (e.kind === 'lock') {
          ctx.globalAlpha = 0.55 * k;
          ctx.fillStyle = this.theme.flash;
          for (const [x, y] of e.cells) {
            if (y < BUFFER) continue;
            roundRectPath(ctx, x * s + 1, (y - BUFFER) * s + 1, s - 2, s - 2, s * 0.2);
            ctx.fill();
          }
        } else if (e.kind === 'trail') {
          const color = this.theme.colors[e.id];
          for (const c of e.cols) {
            const y0 = Math.max(0, (c.y0 - BUFFER) * s);
            const y1 = (c.y1 - BUFFER) * s;
            if (y1 <= y0) continue;
            const g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, withAlpha(color, 0));
            g.addColorStop(1, withAlpha(color, 0.45 * k));
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.fillRect(c.x * s + s * 0.15, y0, s * 0.7, y1 - y0);
          }
        }
      }
      ctx.globalAlpha = 1;

      if (!this.particles.length) return;
      const sec = dt / 1000;
      const grav = s * 40;
      this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
      for (const p of this.particles) {
        p.vy += grav * sec;
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    // ---- previews ----

    drawPiece(ctx, id, cx, cy, cs) {
      const piece = PIECES[id];
      const b = piece.bounds[0];
      const ox = cx - (b.w * cs) / 2 - b.minX * cs;
      const oy = cy - (b.h * cs) / 2 - b.minY * cs;
      for (const [x, y] of piece.rotations[0]) this.blit(ctx, id, ox + x * cs, oy + y * cs, cs);
    }

    drawHold(game) {
      const { w, h } = this.fitCanvas(this.hold);
      const ctx = this.hctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!game.holdId) return;
      ctx.globalAlpha = game.holdUsed ? 0.3 : 1;
      this.drawPiece(ctx, game.holdId, w / 2, h / 2, Math.min(w / 5, h / 3.4));
      ctx.globalAlpha = 1;
    }

    drawNext(game) {
      const { w, h } = this.fitCanvas(this.next);
      const ctx = this.nctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const unit = h / (NEXT_COUNT + 0.4);
      let y = 0;
      game.queue.slice(0, NEXT_COUNT).forEach((id, i) => {
        const slotH = i === 0 ? unit * 1.4 : unit;
        const cs = Math.min(w / (i === 0 ? 5 : 5.6), slotH / 3.4);
        this.drawPiece(ctx, id, w / 2, y + slotH / 2, cs);
        y += slotH;
      });
    }

    /** Menu showcase of every piece in a difficulty, with names. */
    drawGallery(canvas, ids) {
      const w = canvas.clientWidth;
      if (!w) return;
      const cols = ids.length <= 8 ? ids.length : Math.ceil(ids.length / 2);
      const rows = Math.ceil(ids.length / cols);
      const slotW = w / cols;
      const cs = Math.min(slotW / 4.6, 15);
      const labelH = 16;
      const slotH = cs * 3.4 + labelH;
      const h = Math.ceil(rows * slotH + 4);
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * this.dpr);
      canvas.height = Math.round(h * this.dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(canvas).color;
      ids.forEach((id, i) => {
        const cx = (i % cols + 0.5) * slotW;
        const top = Math.floor(i / cols) * slotH;
        this.drawPiece(ctx, id, cx, top + cs * 1.7, cs);
        const p = PIECES[id];
        ctx.fillStyle = color;
        ctx.font = `700 ${p.tier === 'classic' ? 11 : 10}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.tier === 'classic' ? p.name : `${p.name}${p.tier === 'hard' ? ' ★★' : ' ★'}`,
          cx, top + cs * 3.4 + labelH / 2, slotW - 2);
      });
    }
  }

  // ===========================================================================
  // 9. Input manager
  // ===========================================================================

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'soft', KeyS: 'soft',
    ArrowUp: 'cw', KeyX: 'cw',
    KeyZ: 'ccw',
    Space: 'hard',
    KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
    KeyP: 'pause', Escape: 'pause',
    KeyR: 'restart',
    KeyM: 'mute',
  };

  /**
   * Turns keys and touch buttons into abstract actions. Each action tracks the
   * set of sources holding it (a key code or a pointer id), so an action is
   * "pressed" when its first source goes down and "released" when its last
   * source goes up. Auto-repeat is ignored here; the engine runs DAS/ARR.
   */
  class InputManager {
    constructor({ onPress, onRelease, isBlocked, shouldCapture }) {
      this.onPress = onPress;
      this.onRelease = onRelease;
      this.isBlocked = isBlocked;
      this.shouldCapture = shouldCapture;
      this.held = new Map();
      this.buttons = [];
      window.addEventListener('keydown', (e) => this.keyDown(e));
      window.addEventListener('keyup', (e) => this.keyUp(e));
    }

    press(action, source) {
      let set = this.held.get(action);
      if (!set) {
        set = new Set();
        this.held.set(action, set);
      }
      if (set.has(source)) return;
      set.add(source);
      if (set.size === 1) this.onPress(action);
    }

    release(action, source) {
      const set = this.held.get(action);
      if (!set || !set.delete(source)) return;
      if (set.size === 0) this.onRelease(action);
    }

    releaseAll() {
      for (const [action, set] of this.held) {
        if (set.size) {
          set.clear();
          this.onRelease(action);
        }
      }
      for (const b of this.buttons) {
        b.pointers.clear();
        b.el.classList.remove('is-pressed');
      }
    }

    keyDown(e) {
      const action = KEYMAP[e.code];
      if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.isBlocked()) return;           // an open dialog owns the keyboard
      if (this.shouldCapture(action)) e.preventDefault();
      this.press(action, `k:${e.code}`);
    }

    keyUp(e) {
      const action = KEYMAP[e.code];
      if (action) this.release(action, `k:${e.code}`);
    }

    /** Wires on-screen buttons: hold-to-repeat via pointer capture. */
    bindButtons(root) {
      root.querySelectorAll('[data-action]').forEach((el) => {
        const action = el.dataset.action;
        const entry = { el, pointers: new Set() };
        this.buttons.push(entry);

        el.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.preventDefault();
          try {
            el.setPointerCapture(e.pointerId);
          } catch (err) {
            // Capture is best effort; release still arrives via pointerup.
          }
          entry.pointers.add(e.pointerId);
          el.classList.add('is-pressed');
          this.press(action, `p:${e.pointerId}`);
        });

        const end = (e) => {
          if (!entry.pointers.delete(e.pointerId)) return;
          if (!entry.pointers.size) el.classList.remove('is-pressed');
          this.release(action, `p:${e.pointerId}`);
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('lostpointercapture', end);
        el.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard activation of a focused on-screen button acts as a tap.
        el.addEventListener('click', (e) => {
          if (e.detail !== 0) return;
          this.press(action, 'click');
          this.release(action, 'click');
        });
      });
    }
  }

  // ===========================================================================
  // 10. App / UI controller
  // ===========================================================================

  const $ = (id) => document.getElementById(id);

  class App {
    constructor() {
      this.prefs = new Preferences();
      this.el = {
        playfield: $('playfield'),
        sideLeft: $('side-left'),
        sideRight: $('side-right'),
        boardFrame: $('board-frame'),
        touchBar: $('touch-bar'),
        touchMove: $('touch-move'),
        touchAct: $('touch-act'),
        actionText: $('action-text'),
        holdCanvas: $('hold-canvas'),
        nextCanvas: $('next-canvas'),
        gallery: $('gallery-canvas'),
        score: $('stat-score'),
        level: $('stat-level'),
        lines: $('stat-lines'),
        best: $('stat-best'),
        diffLabel: $('diff-label'),
        btnPause: $('btn-pause'),
        btnRestart: $('btn-restart'),
        menu: $('overlay-menu'),
        pause: $('overlay-pause'),
        over: $('overlay-gameover'),
        bestList: $('best-list'),
        dlgTheme: $('dlg-theme'),
        dlgDiff: $('dlg-difficulty'),
        dlgSettings: $('dlg-settings'),
        dlgConfirm: $('dlg-confirm'),
        themeGroups: $('theme-groups'),
        btnMute: $('btn-mute'),
        diffNote: $('diff-note'),
      };
      this.hudDirty = true;
      this.hudCache = {};
      this.last = null;
      this.raf = 0;
      this.sawTouch = false;
      this.actionTimer = 0;
      this.layoutQueued = false;
      this.lastState = null;
      this.previewing = false;
      this.audio = createAudio();

      this.reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.coarseMQ = window.matchMedia('(hover: none) and (pointer: coarse)');

      this.game = new Game(this.prefs, (type, payload) => this.onGameEvent(type, payload));
      this.renderer = new Renderer($('board-canvas'), this.el.holdCanvas, this.el.nextCanvas);
      this.input = new InputManager({
        onPress: (a) => this.onPress(a),
        onRelease: (a) => this.game.release(a),
        isBlocked: () => this.dialogOpen(),
        shouldCapture: () => this.game.state === State.PLAYING || this.game.state === State.CLEARING,
      });
      this.input.bindButtons(this.el.touchBar);

      this.applyReducedMotion();
      this.applyAudioPrefs();
      this.applyTheme(this.prefs.data.theme, false);
      this.renderer.setOptions(this.prefs.data);
      this.buildDifficultyOptions($('menu-diff-options'), 'menu-diff');
      this.buildDifficultyOptions($('dlg-diff-options'), 'dlg-diff');
      this.buildThemeGrid();
      this.bindUi();
      this.bindSettings();
      this.bindEnvironment();
      this.refreshDifficultyUi();
      this.layout();
      this.syncState();
      this.startLoop();
    }

    // ---- main loop (single instance) ----

    startLoop() {
      if (this.raf) return;
      const tick = (now) => {
        this.raf = requestAnimationFrame(tick);
        const dt = this.last === null ? 16 : Math.min(100, now - this.last);
        this.last = now;
        this.game.update(dt);
        // Effects are stamped with performance.now(), so draw on the same clock.
        this.renderer.drawBoard(this.game, performance.now(), dt);
        if (this.hudDirty) this.updateHud();
      };
      this.raf = requestAnimationFrame(tick);
    }

    // ---- game events ----

    onGameEvent(type, payload) {
      switch (type) {
        case 'state':
          this.syncState();
          break;
        case 'hud':
          this.hudDirty = true;
          break;
        case 'action':
          this.showAction(payload);
          break;
        case 'effect':
          this.renderer.addEffect(payload, performance.now());
          break;
        case 'denied':
          this.flashDenied();
          this.audio.play('denied');
          break;
        case 'sound':
          this.audio.play(payload);
          break;
        default:
          break;
      }
    }

    onPress(action) {
      if (action === 'pause') this.togglePause();
      else if (action === 'restart') this.requestRestart();
      else if (action === 'mute') this.toggleMute();
      else this.game.press(action);
    }

    syncState() {
      const s = this.game.state;
      const prev = this.lastState;
      this.lastState = s;
      const { menu, pause, over, btnPause, btnRestart } = this.el;

      menu.hidden = s !== State.MENU;
      pause.hidden = s !== State.PAUSED;
      over.hidden = s !== State.OVER;

      const live = s === State.PLAYING || s === State.CLEARING || s === State.PAUSED;
      btnPause.disabled = !live;
      btnRestart.disabled = !(live || s === State.OVER);
      const paused = s === State.PAUSED;
      btnPause.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      btnPause.querySelector('.tb-label').textContent = paused ? 'Resume' : 'Pause';
      btnPause.querySelector('path').setAttribute('d', paused ? 'M7 5l12 7-12 7z' : 'M8 5v14M16 5v14');

      if (s === State.MENU) {
        this.renderer.clearEffects();
        this.refreshDifficultyUi();
        if (prev !== State.MENU) this.focusSoon($('btn-play'));
      } else if (s === State.PAUSED) {
        this.focusSoon($('btn-resume'));
      } else if (s === State.OVER) {
        $('over-score').textContent = this.game.score.toLocaleString();
        $('over-level').textContent = this.game.level;
        $('over-lines').textContent = this.game.lines;
        $('over-best').textContent = (this.prefs.data.best[this.game.diff.id] || 0).toLocaleString();
        $('over-newbest').hidden = !this.game.isNewBest;
        this.updateBestList();
        // Delay focus so a key still held from play can't activate the button.
        this.focusSoon($('btn-again'), 400);
      } else if (prev === State.PAUSED || prev === State.MENU || prev === State.OVER || prev === null) {
        if (!this.dialogOpen()) this.el.boardFrame.focus({ preventScroll: true });
      }
      this.hudDirty = true;
      this.updateMusic();
    }

    focusSoon(el, delay = 0) {
      setTimeout(() => {
        if (!el.offsetParent || this.dialogOpen()) return;
        el.focus({ preventScroll: true });
      }, delay);
    }

    // ---- game flow ----

    startGame() {
      if (this.game.inRun) this.game.abandon();
      this.audio.stopMusic();
      this.audio.rewindMusic();
      this.renderer.clearEffects();
      this.game.start(this.prefs.data.difficulty);
    }

    togglePause() {
      const s = this.game.state;
      this.input.releaseAll();
      if (s === State.PAUSED) this.game.resume();
      else if (s === State.PLAYING || s === State.CLEARING) this.game.pause();
      else return;
      this.audio.play('pause');
    }

    // ---- audio ----

    /** Music plays on the menu, during play, and while previewing themes. */
    updateMusic() {
      const s = this.game.state;
      const on = this.previewing || s === State.MENU || s === State.PLAYING || s === State.CLEARING;
      if (on) this.audio.playMusic();
      else this.audio.stopMusic();
    }

    applyAudioPrefs() {
      const d = this.prefs.data;
      this.audio.setVolumes({ music: d.musicVol / 100, sfx: d.sfxVol / 100, muted: d.muted });
      const b = this.el.btnMute;
      b.setAttribute('aria-pressed', String(d.muted));
      b.setAttribute('aria-label', d.muted ? 'Unmute sound' : 'Mute sound');
    }

    toggleMute() {
      this.prefs.set('muted', !this.prefs.data.muted);
      this.applyAudioPrefs();
    }

    async requestRestart() {
      const s = this.game.state;
      if (s === State.MENU) return;
      if (s === State.OVER) {
        this.startGame();
        return;
      }
      this.game.pause();
      if (await this.confirm('Restart this game? Your current progress will be lost.', 'Restart')) {
        this.startGame();
      }
    }

    async quitToMenu() {
      if (this.game.state === State.OVER) {
        this.game.abandon();
        return;
      }
      if (await this.confirm('Quit to the main menu? This game will end.', 'Quit')) {
        this.game.abandon();
      }
    }

    // ---- HUD ----

    updateHud() {
      this.hudDirty = false;
      const g = this.game;
      const diffId = g.state === State.MENU ? this.prefs.data.difficulty : g.diff.id;
      const best = Math.max(this.prefs.data.best[diffId] || 0, g.state === State.MENU ? 0 : g.score);
      this.setText('score', g.score.toLocaleString());
      this.setText('level', String(g.level));
      this.setText('lines', String(g.lines));
      this.setText('best', best.toLocaleString());
      this.setText('diffLabel', DIFFICULTIES[diffId].label);
      $('btn-difficulty').setAttribute('aria-label', `Difficulty: ${DIFFICULTIES[diffId].label}`);
      this.audio.setLevel(g.state === State.MENU ? 1 : g.level);
      this.renderer.drawHold(g);
      this.renderer.drawNext(g);
      const name = (id) => (PIECES[id].tier === 'classic' ? `${id} piece` : PIECES[id].name);
      this.el.holdCanvas.setAttribute('aria-label',
        `Held piece: ${g.holdId ? name(g.holdId) : 'none'}`);
      this.el.nextCanvas.setAttribute('aria-label',
        g.queue.length ? `Next pieces: ${g.queue.map(name).join(', ')}` : 'Next pieces');
    }

    setText(key, value) {
      if (this.hudCache[key] === value) return;
      this.hudCache[key] = value;
      this.el[key].textContent = value;
    }

    showAction(text) {
      const el = this.el.actionText;
      el.textContent = text;
      el.classList.remove('show');
      void el.offsetWidth;            // restart the CSS animation
      el.classList.add('show');
      clearTimeout(this.actionTimer);
      this.actionTimer = setTimeout(() => el.classList.remove('show'), 1100);
    }

    flashDenied() {
      const panel = this.el.holdCanvas.parentElement;
      panel.classList.remove('deny');
      void panel.offsetWidth;
      panel.classList.add('deny');
    }

    updateBestList() {
      this.el.bestList.innerHTML = '';
      for (const id of DIFFICULTY_ORDER) {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = `Best · ${DIFFICULTIES[id].label}`;
        dd.textContent = (this.prefs.data.best[id] || 0).toLocaleString();
        wrap.append(dt, dd);
        this.el.bestList.append(wrap);
      }
    }

    // ---- difficulty ----

    buildDifficultyOptions(container, name) {
      for (const id of DIFFICULTY_ORDER) {
        const d = DIFFICULTIES[id];
        const label = document.createElement('label');
        label.className = 'diff-opt';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = id;
        const box = document.createElement('span');
        box.className = 'diff-box';
        const strong = document.createElement('strong');
        strong.textContent = d.label;
        const small = document.createElement('small');
        small.textContent = d.blurb;
        box.append(strong, small);
        label.append(input, box);
        container.append(label);
      }
      if (name === 'menu-diff') {
        container.addEventListener('change', (e) => {
          if (this.game.inRun) return;      // never change the pool mid-game
          this.prefs.set('difficulty', e.target.value);
          this.refreshDifficultyUi();
        });
      } else {
        container.addEventListener('change', () => this.updateDiffNote());
      }
    }

    refreshDifficultyUi() {
      const id = this.prefs.data.difficulty;
      document.querySelectorAll('input[name="menu-diff"]').forEach((r) => {
        r.checked = r.value === id;
      });
      this.updateBestList();
      this.drawGallery();
      this.hudDirty = true;
    }

    drawGallery() {
      if (this.el.menu.hidden) return;
      this.renderer.drawGallery(this.el.gallery, DIFFICULTIES[this.prefs.data.difficulty].pieces);
      const n = DIFFICULTIES[this.prefs.data.difficulty].pieces.length;
      this.el.gallery.setAttribute('aria-label', `${n} piece types in this difficulty`);
    }

    selectedDialogDifficulty() {
      const r = document.querySelector('input[name="dlg-diff"]:checked');
      return r ? r.value : this.prefs.data.difficulty;
    }

    updateDiffNote() {
      const chosen = this.selectedDialogDifficulty();
      const current = this.game.inRun ? this.game.diff.id : this.prefs.data.difficulty;
      this.el.diffNote.textContent = this.game.inRun && chosen !== current
        ? 'Applying will end this game and start a new one.'
        : `${DIFFICULTIES[chosen].pieces.length} piece types.`;
    }

    openDifficulty() {
      const current = this.game.inRun ? this.game.diff.id : this.prefs.data.difficulty;
      document.querySelectorAll('input[name="dlg-diff"]').forEach((r) => {
        r.checked = r.value === current;
      });
      this.updateDiffNote();
      this.openDialog(this.el.dlgDiff);
    }

    async applyDifficultyDialog() {
      if (this.el.dlgDiff.returnValue !== 'ok') return;
      const chosen = this.selectedDialogDifficulty();
      if (this.game.inRun) {
        if (chosen === this.game.diff.id) return;
        const ok = await this.confirm(
          `Start a new ${DIFFICULTIES[chosen].label} game? Your current progress will be lost.`,
          'New game');
        if (!ok) return;
        this.prefs.set('difficulty', chosen);
        this.startGame();
      } else {
        this.prefs.set('difficulty', chosen);
        this.refreshDifficultyUi();
      }
    }

    // ---- themes ----

    buildThemeGrid() {
      for (const [title, ids] of THEME_GROUPS) {
        const group = document.createElement('section');
        group.className = 'theme-group';
        const h = document.createElement('h3');
        h.className = 'theme-group-title';
        h.textContent = title;
        const grid = document.createElement('div');
        grid.className = 'theme-grid';
        for (const id of ids) grid.append(this.themeCard(THEMES[id]));
        group.append(h, grid);
        this.el.themeGroups.append(group);
      }
      this.markTheme();
    }

    themeCard(t) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-card';
      btn.dataset.theme = t.id;
      btn.setAttribute('aria-pressed', 'false');
      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = t.label;
      const sw = document.createElement('span');
      sw.className = 'theme-swatches';
      sw.setAttribute('aria-hidden', 'true');
      for (const p of ['I', 'O', 'T', 'Z', 'S']) {
        const i = document.createElement('i');
        i.style.background = t.colors[p];
        sw.append(i);
      }
      const blurb = document.createElement('span');
      blurb.className = 'sr-only';
      blurb.textContent = `: ${t.blurb}`;
      btn.append(name, blurb, sw);
      btn.addEventListener('click', () => {
        this.applyTheme(t.id, true);
        this.audio.play('select');
      });
      return btn;
    }

    applyTheme(id, persist) {
      const theme = THEMES[id] || THEMES.neon;
      document.documentElement.dataset.theme = theme.id;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme.boardBg[1]);
      this.renderer.setTheme(theme);
      if (persist) this.prefs.set('theme', theme.id);
      this.audio.setTheme(theme.id);
      this.markTheme();
      this.hudDirty = true;
      this.drawGallery();
    }

    markTheme() {
      const current = document.documentElement.dataset.theme;
      this.el.themeGroups.querySelectorAll('.theme-card').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.theme === current));
      });
    }

    // ---- dialogs ----

    dialogOpen() {
      return !!document.querySelector('dialog[open]');
    }

    openDialog(dlg) {
      if (dlg.open) return;
      this.game.pause();
      this.input.releaseAll();
      dlg.returnValue = '';
      dlg.showModal();
      if (dlg === this.el.dlgTheme) {
        this.previewing = true;
        this.updateMusic();
      }
    }

    confirm(message, okLabel) {
      const d = this.el.dlgConfirm;
      if (d.open) return Promise.resolve(false);
      $('confirm-msg').textContent = message;
      $('confirm-ok').textContent = okLabel;
      return new Promise((resolve) => {
        const onClose = () => {
          d.removeEventListener('close', onClose);
          resolve(d.returnValue === 'ok');
        };
        d.addEventListener('close', onClose);
        this.openDialog(d);
      });
    }

    // ---- wiring ----

    bindUi() {
      $('btn-play').addEventListener('click', () => this.startGame());
      $('btn-resume').addEventListener('click', () => this.game.resume());
      $('btn-pause-restart').addEventListener('click', () => this.requestRestart());
      $('btn-pause-menu').addEventListener('click', () => this.quitToMenu());
      $('btn-again').addEventListener('click', () => this.startGame());
      $('btn-over-menu').addEventListener('click', () => this.quitToMenu());

      this.el.btnPause.addEventListener('click', () => this.togglePause());
      this.el.btnRestart.addEventListener('click', () => this.requestRestart());
      $('btn-theme').addEventListener('click', () => this.openDialog(this.el.dlgTheme));
      $('btn-difficulty').addEventListener('click', () => this.openDifficulty());
      $('btn-settings').addEventListener('click', () => this.openDialog(this.el.dlgSettings));
      document.querySelectorAll('[data-open]').forEach((b) => {
        b.addEventListener('click', () => {
          this.openDialog(b.dataset.open === 'theme' ? this.el.dlgTheme : this.el.dlgSettings);
        });
      });
      this.el.dlgDiff.addEventListener('close', () => this.applyDifficultyDialog());
      this.el.dlgTheme.addEventListener('close', () => {
        this.previewing = false;
        this.updateMusic();
      });
      this.el.btnMute.addEventListener('click', () => this.toggleMute());
    }

    bindSettings() {
      const p = this.prefs;
      const das = $('set-das');
      const arr = $('set-arr');
      const sdf = $('set-sdf');
      const touch = $('set-touch');
      const ghost = $('set-ghost');
      const letters = $('set-letters');
      const music = $('set-music');
      const sfx = $('set-sfx');

      const sync = () => {
        das.value = p.data.das;
        arr.value = p.data.arr;
        sdf.value = String(p.data.sdf);
        touch.value = p.data.touch;
        ghost.checked = p.data.ghost;
        letters.checked = p.data.letters;
        music.value = p.data.musicVol;
        sfx.value = p.data.sfxVol;
        $('out-music').textContent = `${p.data.musicVol}%`;
        $('out-sfx').textContent = `${p.data.sfxVol}%`;
        $('out-das').textContent = `${p.data.das} ms`;
        $('out-arr').textContent = p.data.arr === 0 ? 'instant' : `${p.data.arr} ms`;
      };
      const visuals = () => {
        this.renderer.setOptions(p.data);
        this.hudDirty = true;
        this.drawGallery();
      };

      das.addEventListener('input', () => { p.set('das', Number(das.value)); sync(); });
      arr.addEventListener('input', () => { p.set('arr', Number(arr.value)); sync(); });
      sdf.addEventListener('change', () => p.set('sdf', Number(sdf.value)));
      touch.addEventListener('change', () => { p.set('touch', touch.value); this.layout(); });
      ghost.addEventListener('change', () => { p.set('ghost', ghost.checked); visuals(); });
      letters.addEventListener('change', () => { p.set('letters', letters.checked); visuals(); });
      music.addEventListener('input', () => { p.set('musicVol', Number(music.value)); sync(); this.applyAudioPrefs(); });
      sfx.addEventListener('input', () => { p.set('sfxVol', Number(sfx.value)); sync(); this.applyAudioPrefs(); });
      sfx.addEventListener('change', () => this.audio.play('select'));
      $('btn-settings-reset').addEventListener('click', () => {
        Object.assign(p.data, SETTINGS_DEFAULTS);
        p.save();
        sync();
        visuals();
        this.applyAudioPrefs();
        this.layout();
      });
      sync();
    }

    bindEnvironment() {
      const queueLayout = () => {
        if (this.layoutQueued) return;
        this.layoutQueued = true;
        requestAnimationFrame(() => {
          this.layoutQueued = false;
          this.layout();
        });
      };
      window.addEventListener('resize', queueLayout);
      window.addEventListener('orientationchange', queueLayout);
      if ('ResizeObserver' in window) new ResizeObserver(queueLayout).observe(this.el.playfield);
      this.coarseMQ.addEventListener?.('change', queueLayout);
      this.reduceMQ.addEventListener?.('change', () => this.applyReducedMotion());

      document.addEventListener('visibilitychange', () => {
        this.input.releaseAll();
        if (document.hidden) {
          this.game.pause();
          this.audio.suspend();
        } else {
          this.audio.resume();
        }
        this.last = null;
      });

      // Browsers only allow sound after a user gesture.
      const unlock = () => {
        const first = !this.audio.unlocked;
        this.audio.unlock();
        if (first && this.audio.unlocked) this.updateMusic();
      };
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
      window.addEventListener('blur', () => this.input.releaseAll());
      window.addEventListener('pagehide', () => {
        if (this.game.inRun) this.game.recordBest();
      });

      // First real touch switches automatic mode to on-screen controls.
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' && !this.sawTouch) {
          this.sawTouch = true;
          if (this.prefs.data.touch === 'auto') queueLayout();
        }
      }, { passive: true });

      // Stop the page from scrolling or bouncing during play.
      document.addEventListener('touchmove', (e) => {
        if (e.target.closest && e.target.closest('dialog, .overlay')) return;
        e.preventDefault();
      }, { passive: false });
    }

    applyReducedMotion() {
      const r = this.reduceMQ.matches;
      this.game.reduceMotion = r;
      this.renderer.reduceMotion = r;
    }

    touchEnabled() {
      const mode = this.prefs.data.touch;
      if (mode === 'on') return true;
      if (mode === 'off') return false;
      return this.coarseMQ.matches || this.sawTouch;
    }

    /** Sizes the board to the largest whole-pixel cell that fits the layout. */
    layout() {
      const body = document.body;
      const touch = this.touchEnabled();
      const mode = !touch ? 'desktop' : (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
      body.classList.toggle('touch-on', touch);
      for (const m of ['desktop', 'portrait', 'landscape']) body.classList.toggle(`layout-${m}`, m === mode);

      const pf = this.el.playfield;
      const cs = getComputedStyle(pf);
      const colGap = parseFloat(cs.columnGap) || 0;
      const rowGap = parseFloat(cs.rowGap) || 0;
      let w = pf.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        - this.el.sideLeft.offsetWidth - this.el.sideRight.offsetWidth - colGap * 2;
      let h = pf.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (mode === 'portrait') h -= this.el.touchBar.offsetHeight + rowGap;
      if (mode === 'landscape') w -= this.el.touchMove.offsetWidth + this.el.touchAct.offsetWidth + colGap * 2;
      const ring = mode === 'desktop' ? 12 : 6;     // room for the decorative frame
      const cell = Math.max(8, Math.floor(Math.min((w - ring * 2) / COLS, (h - ring * 2) / ROWS)));

      pf.style.setProperty('--board-w', `${cell * COLS}px`);
      pf.style.setProperty('--board-h', `${cell * ROWS}px`);
      this.renderer.resizeBoard(cell);
      this.hudDirty = true;
      this.drawGallery();
    }
  }

  // ===========================================================================
  // 11. Audio hookup (engine and settings live in the audio/ folder)
  // ===========================================================================

  const SILENT_AUDIO = {
    unlocked: false,
    unlock() {}, setTheme() {}, setVolumes() {}, setLevel() {}, playMusic() {}, stopMusic() {},
    rewindMusic() {}, suspend() {}, resume() {}, play() {},
  };

  function createAudio() {
    const Engine = window.StackAttackAudio;
    const config = window.STACK_ATTACK_AUDIO;
    if (!Engine || !config) {
      console.warn('[Stack Attack] audio/audio-engine.js or audio/audio-config.js is missing; playing silently.');
      return SILENT_AUDIO;
    }
    for (const problem of Engine.validate(config)) console.warn(`[Stack Attack audio config] ${problem}`);
    for (const id of THEME_ORDER) {
      if (!config.themes || !config.themes[id]) {
        console.warn(`[Stack Attack audio config] no entry for theme "${id}"; it uses the default sounds and no music.`);
      }
    }
    return new Engine(config);
  }

  function boot() {
    if (window.__stackAttack) return;     // never start twice
    window.__stackAttack = new App();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
