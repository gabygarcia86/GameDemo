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

// Suit patterns, painted over the suit colour (drawn in models/decals.js).
export const PATTERNS = [
  { id: 'none', name: 'Plain', cost: 0 },
  { id: 'stripes', name: 'Racing Stripes', cost: 150 },
  { id: 'polka', name: 'Polka Dots', cost: 150 },
  { id: 'checker', name: 'Checkerboard', cost: 200 },
  { id: 'stars', name: 'Starry Night', cost: 200 },
  { id: 'camo', name: 'Camo', cost: 250 },
  { id: 'tiger', name: 'Tiger Stripes', cost: 350 },
  { id: 'lightning', name: 'Lightning', cost: 350 },
  { id: 'flames', name: 'Flames', cost: 400 },
  { id: 'skulls', name: 'Skulls', cost: 450 },
  { id: 'circuit', name: 'Cyber Circuit', cost: 450 },
  { id: 'scales', name: 'Dragon Scales', cost: 500 },
  { id: 'galaxy', name: 'Galaxy', cost: 600 },
];

// Stickers for the chest and back: emoji, plus hand-drawn badges.
export const STICKERS = [
  { id: 'none', name: 'None', cost: 0 },
  { id: 'smile', name: 'Smiley', cost: 0 },
  { id: 'star', name: 'Gold Star', emoji: '⭐', cost: 0 },
  { id: 'cool', name: 'Too Cool', emoji: '😎', cost: 100 },
  { id: 'lol', name: 'LOL', emoji: '😂', cost: 100 },
  { id: 'donut', name: 'Donut', emoji: '🍩', cost: 100 },
  { id: 'pizza', name: 'Pizza', emoji: '🍕', cost: 120 },
  { id: 'taco', name: 'Taco', emoji: '🌮', cost: 120 },
  { id: 'cat', name: 'Cat', emoji: '🐱', cost: 120 },
  { id: 'bolt', name: 'Bolt', emoji: '⚡', cost: 120 },
  { id: 'fire', name: 'Fire', emoji: '🔥', cost: 150 },
  { id: 'poop', name: 'Poop', emoji: '💩', cost: 150 },
  { id: 'alien', name: 'Alien', emoji: '👽', cost: 150 },
  { id: 'boss', name: 'BOSS', cost: 150 },
  { id: 'robot', name: 'Robot', emoji: '🤖', cost: 180 },
  { id: 'rock', name: 'Rock On', emoji: '🤘', cost: 180 },
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', cost: 200 },
  { id: 'shark', name: 'Shark', emoji: '🦈', cost: 200 },
  { id: 'skull', name: 'Skull', emoji: '💀', cost: 200 },
  { id: 'shuriken', name: 'Shuriken', cost: 200 },
  { id: 'yinyang', name: 'Yin Yang', cost: 200 },
  { id: 'crown', name: 'Crown', emoji: '👑', cost: 250 },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', cost: 300 },
  { id: 'kanji', name: 'Shinobi', cost: 300 },
  { id: 'katanas', name: 'Crossed Katanas', cost: 350 },
  { id: 'flamingSkull', name: 'Flaming Skull', cost: 400 },
];

// Special effects. The fart cloud puffs green gas from the ninja's backside.
export const EFFECTS = [
  { id: 'none', name: 'None', cost: 0 },
  { id: 'fart', name: 'Fart Cloud', cost: 10000 },
];

// Keys in the look that hold a pattern, sticker or effect id, and what they pick from.
export const DECAL_KEYS = { pattern: PATTERNS, stickerFront: STICKERS, stickerBack: STICKERS, trail: EFFECTS };
// Unlock ids live in save.unlocked next to the colour ids.
export const unlockIdFor = (key, id) => `${key === 'pattern' ? 'pat' : key === 'trail' ? 'fx' : 'stk'}:${id}`;
export const ALL_UNLOCK_IDS = [
  ...PREMIUM_SWATCHES.map((p) => p.id),
  ...PATTERNS.filter((p) => p.cost).map((p) => unlockIdFor('pattern', p.id)),
  ...STICKERS.filter((p) => p.cost).map((p) => unlockIdFor('sticker', p.id)),
  ...EFFECTS.filter((p) => p.cost).map((p) => unlockIdFor('trail', p.id)),
];
export function ownsDecal(unlocked, key, id) {
  const item = DECAL_KEYS[key]?.find((p) => p.id === id);
  return !!item && (!item.cost || unlocked.includes(unlockIdFor(key, id)));
}

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
  pattern: 'none',
  stickerFront: 'none',
  stickerBack: 'none',
  trail: 'none',
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
  // Owned patterns and stickers (plain/none just as likely as any one of them).
  for (const [key, list] of Object.entries(DECAL_KEYS)) {
    const mine = list.filter((p) => ownsDecal(unlocked, key, p.id));
    look[key] = Math.random() < 0.35 ? 'none' : mine[Math.floor(Math.random() * mine.length)].id;
  }
  return look;
}
