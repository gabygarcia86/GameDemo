// Customization data: colour swatches (free and unlockable), the parts of the
// ninja and board that can be coloured, and the default look.

// Free swatches (the original Skateboard Ninjas palette plus a few extras).
export const FREE_SWATCHES = [
  '#2f3a7a', '#14162b', '#25252f', '#e4e7f5', '#ff2e55', '#ff2e7e', '#ff8c1a',
  '#ffb703', '#ffe066', '#2bb673', '#00c2d1', '#3de1ff', '#3d7bff', '#7b2ff7',
  '#8b5a2b', '#6b7280',
];

// Unlockable swatches, bought with coins. "rainbow" cycles hue every frame.
export const PREMIUM_SWATCHES = [
  { id: 'gold', name: 'Gold', color: '#ffcc33', cost: 250 },
  { id: 'lime', name: 'Neon Lime', color: '#a6ff00', cost: 200 },
  { id: 'magenta', name: 'Hot Magenta', color: '#ff00c8', cost: 200 },
  { id: 'chrome', name: 'Chrome', color: '#cfd8e6', cost: 300 },
  { id: 'galaxy', name: 'Galaxy', color: '#2a1257', cost: 350 },
  { id: 'lava', name: 'Lava', color: '#ff4a12', cost: 400 },
  { id: 'mint', name: 'Mint', color: '#7dffcf', cost: 150 },
  { id: 'rainbow', name: 'Rainbow', color: 'rainbow', cost: 1000 },
];

export const NINJA_PARTS = [
  { key: 'suit', label: 'Suit' },
  { key: 'mask', label: 'Mask' },
  { key: 'band', label: 'Headband' },
  { key: 'accent', label: 'Accent' },
];

// Which board parts exist depends on the board type.
export const BOARD_PARTS = {
  longboard: [
    { key: 'deck', label: 'Deck' },
    { key: 'wheels', label: 'Wheels' },
    { key: 'under', label: 'Underside' },
    { key: 'trim', label: 'Accent' },
  ],
  hoverboard: [
    { key: 'deck', label: 'Deck' },
    { key: 'wheels', label: 'Hover Pads' },
    { key: 'under', label: 'Underside' },
    { key: 'trim', label: 'Neon' },
  ],
};

export const COLOR_KEYS = ['suit', 'mask', 'band', 'accent', 'deck', 'wheels', 'under', 'trim'];

export const DEFAULT_LOOK = {
  suit: '#2f3a7a',
  mask: '#14162b',
  band: '#ff2e55',
  accent: '#ffb703',
  board: 'longboard',
  deck: '#25252f',
  wheels: '#ffe066',
  under: '#00c2d1',
  trim: '#ff2e7e',
  neon: true, // hoverboard neon lights
};

export const BOARD_TYPES = ['longboard', 'hoverboard'];

export function isValidSwatch(value) {
  return FREE_SWATCHES.includes(value) || PREMIUM_SWATCHES.some((p) => p.color === value);
}

export function premiumFor(value) {
  return PREMIUM_SWATCHES.find((p) => p.color === value) || null;
}

// A random look using only swatches the player owns.
export function randomLook(unlocked, current) {
  const owned = [...FREE_SWATCHES, ...PREMIUM_SWATCHES.filter((p) => unlocked.includes(p.id)).map((p) => p.color)];
  const pick = () => owned[Math.floor(Math.random() * owned.length)];
  const look = { ...current };
  for (const k of COLOR_KEYS) look[k] = pick();
  // Keep the mask readable against the suit most of the time.
  if (look.mask === look.suit) look.mask = '#14162b';
  return look;
}
