# Asset requirements

The game currently draws everything with canvas code (`src/art/`) and
synthesizes all sound (`src/AudioManager.js`), so this folder is empty on
purpose. This file lists what to provide to replace the code art with real
assets.

## General

- Format: PNG sprite sheets with transparent backgrounds. Use a uniform grid,
  one animation per row.
- Scale: draw at 2× the world units below. The game's view is about 540 units tall.
- Anchor: bottom-centre of each frame = the point that touches the ground.
  For the skater, that's where the wheels touch.
- Facing: the skater faces right and Karens face left.
- Licensing: original or properly licensed work only.

## Skater (`player/`)

Frame size 160×220 at 2×. The skater is about 95 units tall with the board.

| Animation | Frames | Notes |
| --- | --- | --- |
| roll | 6–8 | loop, slight pumping bob |
| ollie | 4 | tail snap (board nose up), then rising |
| air | 2–4 | knees tucked, arms out |
| land | 3 | squash |
| grind | 4 | arms out for balance, loop |
| wipeout | 6 | tumble without the board, loop |
| recover | 4 | smoke-puff reappear |

## Tricks (`tricks/`)

- Board-only frames for flips: 12 frames per full rotation of a kickflip
  (long axis) and a shove-it (vertical axis). The game layers them under the body.
- One body pose per grab (Indy, Tail, Melon, Nose, Stalefish, Method, Japan,
  Shadow). Each needs reach / hold / release frames.

## Obstacles (`obstacles/`)

Collision sizes (width × height, in units) must match `OBSTACLE_TYPES` in `src/World.js`:

| Prop | Size |
| --- | --- |
| cone | 24 × 34 |
| hydrant | 22 × 38 |
| trash can | 32 × 50 |
| barrier | 58 × 50 |
| shopping cart | 58 × 46 |

Also: kicker ramp (130 × 42), launch ramp (200 × 88), rail and post pieces
(they tile horizontally), bench (36 high), and planter ledge (48 high).

## Karens (`karens/`)

Hitbox is 30 × 84 units. Animations: idle finger-wag (loop), yell, step-in,
run (loop), shove cart, hit or furious. Readable, comedic, and clearly
telegraphed: the warning pose has to be visible before she becomes dangerous.

## Environment (`environment/`)

Parallax layers that tile horizontally: sky gradient, far skyline (×0.12),
mid-rise buildings (×0.35), shopfronts (×0.7), and sidewalk props at world
speed (lamps, trees, news boxes).

## Audio (`audio/`)

Short mono OGG/MP3: ollie pop, land, flip whoosh, grab whoosh, grind loop,
rolling loop, crash, Karen yell (3–4 variants), combo bank, countdown beeps,
time-up buzzer, results jingle, plus one 60–90 s music loop. Keep levels
consistent, around −14 LUFS.

## UI (`ui/`)

Optional: logo, button skins, joystick base and knob (they have to read on
top of the game at 84–140 px).
