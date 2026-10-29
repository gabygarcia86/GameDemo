# Skateboard Ninjas 2 – Downhill Jam

An endless 3D downhill runner for desktop and mobile browsers. Your ninja
bombs down a winding mountain road on a longboard or hoverboard: switch
lanes, jump, slide, grind rails, hit ramps, and throw ninja stars at Angry
Karens and rival ninjas. Every run picks one of thirteen environments at random.

Built with HTML, CSS, JavaScript ES modules and [Three.js](https://threejs.org)
r170, which is included in `vendor/`. There's no build step and nothing to
install. All 3D art is generated in code, all sound effects are synthesized,
and the music comes from `assets/music/`.

## Running it

ES modules don't load from `file://`, so serve the folder over HTTP. From the
repo root:

```sh
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000/Skate/skateboard_ninjas_2/`. The VS Code
Live Server extension also works.

## Deploying to GitHub Pages

The game uses only relative paths, so it works from any subfolder.

1. Commit and push the `Skate/skateboard_ninjas_2/` folder to `main`.
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**,
   branch `main`, folder `/ (root)`, then **Save**. This only needs doing once
   per repo.
3. Wait a minute or two. You can watch progress under the **Actions** tab.
4. Play at `https://<user>.github.io/<repo>/Skate/skateboard_ninjas_2/`. For
   this repo that's `https://gabygarcia86.github.io/GameDemo/Skate/skateboard_ninjas_2/`.

Keep the `.mp3` files under 100 MB each (GitHub's file limit). The current
songs are about 0.5 MB each.

## Controls

| Action                        | Keyboard / mouse            | Touch                      |
| ----------------------------- | --------------------------- | -------------------------- |
| Change lanes                  | A / D or ← / →              | Swipe left / right         |
| Jump                          | W, ↑ or Space               | Swipe up                   |
| Air trick                     | Jump again while in the air | Swipe up again in the air  |
| Slide (in the air: slam down) | S or ↓                      | Swipe down                 |
| Throw a ninja star            | J (or E / K), or left click | Star button (bottom right) |
| Backflip (land it or crash)   | F or Q                      | FLIP button (above star)   |
| Pause                         | Esc or P, or the ❚❚ button  | ❚❚ button                  |
| Mute                          | M                           | Settings                   |
| Start / restart               | Enter                       | Buttons                    |

Controls are forgiving:

- A jump pressed just before landing still fires.
- Lane changes work mid-air, and a second press mid-change goes straight on
  to the next lane.
- Swipes fire as soon as your finger moves far enough, without waiting for
  release. One swipe moves one lane, and you can chain directions in one stroke.
- The game pauses itself if you switch tabs or the window loses focus.

## How it plays

- **Speed** starts at 17 m/s and climbs toward 40 m/s the further you go.
  Obstacle rows also get closer together.
- **Obstacles** come in three readable types:
  - **Tall** (barriers, crate stacks, boulders, snowmen…): change lanes.
  - **Knee-high** (cones, logs, hay bales, carts, snowdrifts…): jump.
  - **Overhead bars** (road signs, branches, neon signs, surf racks…): slide under.
- **Gaps** cut across the whole road: jump them, or take the ramp in front of
  some of them.
- **Ramps** launch you high enough to clear tall obstacles. Press jump while on
  a ramp for a Mega Launch.
- **Rails**: jump onto one to grind. Roll into a rail without jumping and you
  crash (a shield hops you up onto it instead). The rail lane is always safe if
  you jump on.
- **Side bumps**: clip the side of something mid lane change and you bounce back
  into your old lane (your combo breaks). Hit something head-on and the run ends.
- **Angry Karens** stand in your lane, push shopping carts, walk across the road,
  or sprint up from behind you to cut you off. Sometimes they show up in groups.
  They yell things.
- **Evil ninjas** guard lanes and treasure chests, hop between lanes, drop out of
  the sky, and throw paint balls. The paint just splats on your screen; it can't
  hurt you, and sliding dodges it.
- **Ninja stars** lock on to the nearest enemy in your lane, or one in the next
  lane over if yours is clear. You carry 5 stars, and they recharge one every
  2.4 s. Popped enemies vanish in a cartoon burst and are worth points plus
  2 coins.
- **Power-ups**:
  - **Coin magnet**: 9 s.
  - **Shield**: survives one hit, and bounces you over a gap.
  - **Star frenzy**: unlimited stars for 7 s.

**Fairness rules**, enforced in `src/Generator.js`:

- No row of obstacles ever blocks all three lanes.
- Rows are spaced by the time you need to react at the speed you'll actually be
  going there.
- Rows that need a jump or slide get extra recovery room after them.
- Moving enemies are timed by distance, not by time, so the lane they finish in
  is always the one the generator kept for them.

### Scoring

- **Distance**: 1 point per metre.
- **Actions** build a combo: knockouts, near misses, jumping over or sliding
  under things, tricks, ramps, grinds, power-ups, and every 10 coins in a streak.
- **Combo multiplier**: +0.5 every 5 actions, up to ×10. It applies to action and
  coin points, and drops if you go 3.5 s without an action.
- **Coins**: everything you collect is banked at the end of a run. You also get
  a score bonus (1 coin per 2,500 points) and any mission and challenge rewards.

### Environments

| Environment                      | Gimmick                                    | Local enemy                | Challenge                |
| -------------------------------- | ------------------------------------------ | -------------------------- | ------------------------ |
| Sunset (Sunset Ridge)            | Tumbleweeds roll across the road           | Street crowd*              | Jump 6 tumbleweeds       |
| Daytime (Sunny Hills)            | Hay bales                                  | Street crowd*              | Hop 8 hay bales          |
| Nighttime (Midnight Descent)     | Glowing road, neon signs, street lamps     | Street crowd*              | Knock out 5 enemies      |
| Snowy Mountains (Frostbite Pass) | Icy patches make lane changes slippery     | Yeti (leaps off the bank)  | Cross 6 icy patches      |
| Beach (Coconut Coast)            | Bouncing beach balls (pop them with stars) | Street crowd*              | Pop 4 beach balls        |
| Forest (Whispering Woods)        | Fallen branches, sunbeams                  | Bear (wanders out, charges), Bigfoot (strides across, glancing at you) | Slide under 5 branches   |
| The Moon (Tranquility Drop)      | Craters, Earth in the sky, crashed satellites | Moon rock alien (bursts out of the ground), astronaut (moon-bounces in), space fighter (swoops down) | Slide under 5 satellites |
| Mars (Red Planet Rush)           | Red dunes, two moons, runaway rovers       | Green alien (beams down from a UFO), UFO (swoops down and hovers) | Jump 5 rovers   |
| Volcano (Magma Mountain)         | Lava river, embers, fireballs crash into lanes (a glowing ring marks the spot) | Lava monster (bursts out of the ground or lumbers in) | Dodge 8 fireballs |
| Downtown (Rush Hour Run)         | Skyscrapers, taxis, dumpsters, scaffolding | Street crowd* | Slide under 5 scaffolds |
| Saturn (Ring Runner)             | Riding the icy rings, Saturn in the sky, asteroids crash into lanes (a glowing ring marks the spot) | Green alien (beams down from a UFO or leaps in), UFO (swoops down and hovers) | Dodge 8 falling asteroids |
| Rainbow Road (Prism Highway)     | A colour-flowing rainbow road hanging in space, floating asteroids, star posts, drifting asteroids to jump | Astronaut, space fighter, green alien, UFO | Jump 6 drifting asteroids |
| Trench Run (Battle Station Trench) | A narrow metal trench, laser bolts streak up the lanes at you, laser tripwires and beams | Twin-wing fighter (screams up the trench or dives in, firing harmless laser shots) | Dodge 10 laser blasts |

Each environment has its own sky, lighting, fog, terrain, roadside props,
weather particles, obstacle set and ambient soundscape. The same environment
never comes up twice in a row.

\*Street crowd: a scooter rider (weaves through lanes or zips across), a
parking officer, a mime and a hot-dog vendor (they stroll or push their cart
into your lane) and a pigeon swarm (swoops in off the sidewalk).

Every 1000 m the speed steps up and evil ninjas turn up more often, more of
them in pairs. Local enemies only appear in their own
environment and go down to a single ninja star like everyone else.

### Missions

Three missions are always active, such as "Grind rails for 10 seconds in one
run" or "Knock out 50 enemies in total". When you finish one, a new and slightly
harder one replaces it at the end of the run.

## Customization

**Customize** (from the menu or the game-over screen) gives you a live 3D
preview; drag it to spin your ninja.

- **Ninja**: suit, mask, headband and accent (belt, gloves and wraps).
- **Board**: longboard or hoverboard, plus deck, wheels or hover pads,
  underside, and accent/neon colours. The hoverboard floats, leaves a glowing
  trail, and can have its neon lights switched on or off.
- 16 colours are free. 8 premium colours cost coins: Gold, Neon Lime, Hot
  Magenta, Chrome, Galaxy, Lava, Mint, and an animated Rainbow. Once unlocked, a
  colour works on every part.
- **Suit patterns** (150 to 600 coins), painted in your suit and accent colours:
  Racing Stripes, Polka Dots, Checkerboard, Starry Night, Camo, Tiger Stripes,
  Lightning, Flames, Skulls, Cyber Circuit, Dragon Scales and Galaxy.
- **Stickers** for the chest and the back (free to 400 coins): emoji like Too
  Cool, LOL, Pizza, Taco, Poop, Unicorn, Shark, Dragon and Crown, plus drawn
  badges: BOSS, Shuriken, Yin Yang, Shinobi (忍), Crossed Katanas and Flaming
  Skull. Buy a sticker once and it works on either spot.
- **Effect: Fart Cloud** (10,000 coins): every couple of seconds a burst of
  green gas puffs out of your ninja's backside, with sound on the customize
  screen. Switch it off any time with the empty tile.
- **Randomize** only picks from colours, patterns, stickers and effects you own.

## Settings

- **Music, sound effects, ambience**.
- **Graphics**:
  - **Low**: 1× resolution, no outlines, fewer particles and props.
  - **Medium**: outlines and blob shadows.
  - **High**: real-time shadows and full detail.
  - **Auto**: High on desktop, Medium on phones and tablets. Anti-aliasing is
    picked when the page loads, so after switching to or from Low, reload the
    page for the full effect.
- **Camera shake** and **speed lines**.
- **Touch buttons**: Auto shows them on touch screens; you can also force them
  on or off.
- **FPS counter**.
- **Reset progress**.

Everything is saved in `localStorage` under the key `skateboardNinjas2.save`:
coins, unlocks, your look, settings, stats, missions and the last environment.
Old or hand-edited saves are validated, and anything invalid falls back to its
default.

## Project structure

```
skateboard_ninjas_2/
├── index.html            all screens, HUD and overlays
├── styles.css
├── icon/                 favicons
├── vendor/
│   ├── three.module.min.js   Three.js r170 (MIT, see LICENSE-three.txt)
│   └── LICENSE-three.txt
├── assets/
│   ├── music/            Song01–Song11.mp3, shuffled during play
│   ├── audio/            optional sound-effect overrides (see its README)
│   └── README.md         how to add your own art and sound
└── src/
    ├── main.js           entry point (WebGL check)
    ├── Game.js           state machine, main loop, scoring events, saving
    ├── config.js         every tuning number (speeds, physics, scoring…)
    ├── environments.js   the thirteen environments
    ├── cosmetics.js      colour swatches, patterns, stickers, unlock costs, default look
    ├── storage.js        save data + validation
    ├── Track.js          road, terrain, sky, mountains, scenery, weather, the road bend
    ├── World.js          obstacles, enemies, coins, power-ups, collisions, projectiles
    ├── Generator.js      procedural, always-fair course patterns
    ├── Enemies.js        Karen, evil ninja and local beast behaviours
    ├── Player.js         movement, tricks, crash, procedural animation
    ├── CameraRig.js      chase cam, showroom orbit, intro swoop, crash cam
    ├── Particles.js      bursts, sparks, trails, comic words
    ├── FxOverlay.js      speed lines, paint splats, flashes
    ├── AudioManager.js   music playlist, synthesized SFX, loops, ambience
    ├── Scoring.js        score, combo, per-run stats
    ├── Missions.js       missions + environment challenges
    ├── Input.js          keyboard, mouse, touch swipes
    ├── UI.js             DOM screens and HUD
    ├── gfx.js            toon materials, geometry merging, outlines, canvas textures
    ├── utils.js          maths, seeded random, noise
    └── models/
        ├── ninja.js      the ninja rig (player + rivals)
        ├── board.js      longboard + hoverboard
        ├── karen.js      the Karen rig
        └── props.js      every obstacle, course piece and scenery prop
```

### How the world works

Gameplay happens in straight "lane space": three lanes, a height and a
distance down the road. Collisions and the generator only ever see that
straight road. `Track.toWorld()` then bends lane space for display, curving it
left and right and over hills, always downhill. The bend grows with the square
of the distance ahead, so the road under you is always straight. That means
the curves can never make something unfair. Everything is placed relative to
the player, which keeps numbers small on very long runs.

## Configuring

- **Difficulty and feel**: `src/config.js`. Change speeds (`speed.start`,
  `speed.max`, `speed.stepEvery`, `speed.stepGain`), jump height (`player.jumpVel`,
  `player.gravity`), row spacing (`generator.gapTimeEasy` / `gapTimeHard`), the
  star supply (`shuriken`), scoring values and the combo window.
- **Which patterns appear and how often**: the `CHUNKS` table at the top of
  `src/Generator.js`. Each row is a name, the distance it unlocks at, and a
  weight that can depend on difficulty.
- **Environments**: `src/environments.js`. Colours, fog, light, terrain shape,
  scenery lists, obstacle lists, weather, ambience, and the challenge.
- **Colours and prices**: `src/cosmetics.js`.

### Testing helpers

- `?env=snow` (or `sunset`, `daytime`, `night`, `beach`, `forest`, `moon`,
  `mars`, `volcano`, `downtown`, `saturn`, `rainbow`, `trench`) forces that
  environment for every run.
- `?debug=1` draws collision boxes: yellow = jump, cyan = slide, magenta = go
  around, red = enemies.

Example: `http://localhost:8000/Skate/skateboard_ninjas_2/?env=beach&debug=1`

## Custom audio and graphics

See `assets/README.md`. In short:

- **Sound effects**: put a file in `assets/audio/` and set its path in
  `SOUND_FILES` at the top of `src/AudioManager.js`. `play('coin')` then uses
  your file instead of the synthesized sound; nothing else changes.
- **Music**: songs are listed in `MUSIC_TRACKS` in `src/AudioManager.js`. Add or
  rename files in `assets/music/` and update that list.
- **3D art**: every model is a builder function, in `src/models/props.js` for
  props and in `ninja.js` / `karen.js` / `board.js` for characters. Replace a
  builder with one that loads your own model, and keep the collision sizes in
  `OBSTACLE_INFO` the same.

## Browser support

Any current Chrome, Edge, Firefox or Safari with WebGL, on desktop, iOS or
Android. If WebGL is turned off, the loading screen says so.

## Credits

Game code and generated art are original to this project. Three.js is MIT
licensed (`vendor/LICENSE-three.txt`). Music is from `assets/music/`.

## TODO

- Make the Treasure boxes shiny and look more special and rotate, with some sparkles coming out of it and shining light.
- Fix on mobile, Mobile is auto jumping on rails instead of crashing.
- When you purchase a color for a category, dont unlock that color for all categories, make it so the player has to individually purchase that color for each category. 
- In the customizable section, add a new section for hat accessories that can be added to players ninja, Make a bunch fun hats that you can purchase and add on the character, include wizard hats, top hats, space helmets and about 15 others.
- When restarting a new game, be sure that it always plays a new level. Try to avoid repeating a level until all levels have been played.