# Assets

Right now the game draws every model in code (`src/models/`), synthesizes
every sound effect (`src/AudioManager.js`), and plays music from `music/`. This
folder is where your own files go if you want to replace any of that.

## Music (`music/`)

`Song01.mp3` to `Song10.mp3` play in random order, one after another, on the
menus and during runs. Browsers can't list a folder, so the files are named in
`MUSIC_TRACKS` in `src/AudioManager.js`:

```js
export const MUSIC_TRACKS = Array.from({ length: 10 }, (_, i) => `assets/music/Song${String(i + 1).padStart(2, '0')}.mp3`);
```

To add songs, name them `Song11.mp3` and up and raise `length`. Or replace
the line with your own list, e.g.
`['assets/music/intro.mp3', 'assets/music/boss.mp3']`. If a file is missing,
the player skips it.

## Sound effects (`audio/`)

Every sound effect has a name. To replace one, put your file in `audio/` and
set its path in `SOUND_FILES` at the top of `src/AudioManager.js`:

```js
export const SOUND_FILES = {
  coin: 'assets/audio/coin.mp3',   // now uses your file
  jump: null,                      // null = keep the synthesized sound
  ...
};
```

If a file is set but can't be loaded, the synthesized sound plays instead.
Short mono MP3 or OGG files work best. Keep levels similar to each other.

| Name | When it plays |
| --- | --- |
| click | Any menu button |
| jump, land, slide | Player movement (land is louder after big air) |
| whoosh | Lane change, trick start, paint ball miss |
| coin | Coin pickup (pitch rises with the streak) |
| throw | Ninja star thrown |
| hit, poof | A star hits; the enemy pops |
| karen, ninja | An enemy shouts (speech bubble) or gets popped |
| enemyThrow, splat | A ninja throws paint; it splats on screen |
| pop | Beach ball popped |
| bump | Side bump |
| crash, fall, gameover | Wipeout, falling into a gap, results screen |
| powerup, shieldBreak | Power-up collected; the shield absorbs a hit |
| ramp, grindStart, trick, nearMiss, combo | Score moments |
| beep, go | Countdown |
| mission, chest, buy, error | Mission complete, treasure, unlock bought, not allowed |

The rolling, hover, grind, wind and ambience loops are synthesized in
`AudioManager.build()` and `setAmbience()`. Replace those functions to use
looping files instead.

## Graphics

Every model is a builder function made of primitives:

- `src/models/props.js`: obstacles (`OBSTACLE_BUILDERS`), ramps, rails, gaps,
  ice, chests, coins, power-ups, and roadside scenery (`SCENERY_BUILDERS`).
- `src/models/ninja.js`, `karen.js`, `board.js`: the characters and boards.

To use your own models, load a glTF with Three.js's `GLTFLoader` (from the
Three.js repo's `examples/jsm/loaders/`; copy it next to `vendor/three.module.min.js`)
and return its scene from the builder. Things to keep the same:

- **Origin**: on the road surface, in the middle of the object. +Z faces the
  player.
- **Units**: metres. Lanes are 2.3 m apart. The ninja is about 1.8 m tall.
- **Collision sizes**: `OBSTACLE_INFO` in `props.js`. `top` and `bottom` are
  heights, `halfD` is half the depth along the road, and the width comes from
  the number of lanes covered.
- **Obstacle heights** have to read correctly:
  - Tall things (must go around) are about 2.2 m or more.
  - Jump things are knee high (at most 1 m).
  - Slide things have a clear gap underneath up to 1.2 m.

Textures drawn in code (the road, the comic words, speech bubbles) are in
`src/Track.js` (`makeRoadTextures`) and `src/gfx.js`. You can swap any of them
for an image loaded with `THREE.TextureLoader`.
