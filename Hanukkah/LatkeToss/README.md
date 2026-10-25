# Latke Toss

A 60-second 3D Hanukkah arcade game. Toss potato latkes into a pot of hot oil and land as many as you can before the timer runs out.

Built with plain HTML, CSS, JavaScript ES modules and [Three.js](https://threejs.org/) (r186). Every model, texture, particle and sound effect is generated in code, so there are no image or model files. The only asset files are the background music tracks in `assets/music/`.

## How to play

1. Pick a difficulty on the title screen:
   - **Easy**: the pot sits still.
   - **Medium**: the pot slides side to side.
   - **Hard**: the pot floats and drifts left/right, up/down and toward/away from you. A glowing column and ring on the table show its height and position.
2. Press **Start Game**. After a short "Ready? Go!" the 60-second clock starts.
3. Press (or touch) the latke on the plate, **drag upward toward the pot** to aim, and **release** to toss.
   - The drag direction sets where the latke heads. The drag length sets how far it flies.
   - A dotted arc previews the throw. Medium and Hard show only part of the arc.
   - A tiny drag, or a drag pointing back toward you, cancels the throw.
4. Every latke you land lights one candle on the **menorah**. The shamash (center) lights first, then the candles from right to left. When all nine are lit, a **2x** badge appears on your score and every latke after that is worth **2 points** for the rest of the round. The candles go out again at the start of each round.
5. Hit any **dreidel** with a latke to knock it spinning and make about 10 gold coins (gelt) rain down onto the table. One dreidel sits in front of the pot and one behind it. Gelt is just for fun and doesn't change your score.
6. A latke scores only if it drops **through the pot opening**. Hitting the rim or the outside wall does not count. A clean entry without touching the rim shows "Swish!".
7. **Pause** with the ⏸ button, `Esc` or `P`. ↻ restarts the round and 🔊 toggles sound.

Best scores are saved separately for each difficulty in `localStorage`. If storage is blocked, they last for the current session only.

## Running locally

ES modules and import maps don't load from `file://` URLs. Browsers block module scripts on that origin for security (CORS), so double-clicking `index.html` shows a "scripts could not be loaded" message. Serve the folder over HTTP instead. Any static server works:

```bash
# From the repository root (or from this folder)
python -m http.server 8000
# then open http://localhost:8000/Hanukkah/LatkeToss/
```

```bash
npx serve .
```

You can also use the VS Code **Live Server** extension. Right-click `index.html` and choose *Open with Live Server*.

**Internet access is required.** Three.js loads from a pinned CDN build (`cdn.jsdelivr.net/npm/three@0.186.1`) through the import map in `index.html`. To play offline, download `three.module.js`, `three.core.js` and the `examples/jsm/` files it uses (`utils/BufferGeometryUtils.js`, `environments/RoomEnvironment.js`) into a local folder, and point the import map at them.

## Publishing on GitHub Pages

The game is fully static, so it runs on GitHub Pages as is.

1. Commit and push the project to your repository.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then **Save**.
4. After a minute or two, the game is live at `https://<user>.github.io/<repo>/Hanukkah/LatkeToss/`. For this repository that is `https://gabygarcia86.github.io/GameDemo/Hanukkah/LatkeToss/`.

Every path in the project is relative, so it works from any sub-folder.

## Tuning

All gameplay numbers live in [`js/config.js`](js/config.js).

| What | Where | Notes |
| --- | --- | --- |
| Round length | `ROUND.durationSeconds` | Default `60`. |
| Lead-in / respawn / game-over delay | `ROUND.readySeconds`, `respawnDelaySeconds`, `gameOverDelaySeconds` | Seconds. |
| Gravity | `PHYSICS.gravity` | World units/s². The aiming preview uses the same value, so it stays accurate. |
| Physics rate | `PHYSICS.fixedTimestep` | Default 1/120 s. Smaller steps make collisions more precise but cost more CPU. |
| Bounciness | `PHYSICS.tableRestitution`, `tableFriction`, `potRestitution` | Keep them low so misses settle quickly. |
| Launch power | `LAUNCH.minSpeed`, `LAUNCH.maxSpeed` | Speed at the shortest and longest drag. |
| Throw angle | `LAUNCH.elevationDegrees` | Fixed upward angle of every toss. |
| Sideways aim limit | `LAUNCH.maxYawDegrees` | |
| Drag sensitivity | `LAUNCH.fullPowerDragFraction` | Fraction of the screen height that gives full power. |
| Cancel threshold / grab size | `LAUNCH.cancelDragFraction`, `LAUNCH.grabRadiusPx` | |
| Flip speed | `LAUNCH.minFlipSpeed`, `maxFlipSpeed` | Radians/s around the latke's horizontal axis. |
| Pot movement | `DIFFICULTIES.<easy/medium/hard>` | `center` is the resting point, `amplitude` the movement range per axis, `speed` the angular speed (rad/s) per axis, and `phase` offsets the axes so they don't move in lockstep. |
| Arc preview length | `DIFFICULTIES.<…>.previewFraction` | `1` shows the full arc. |
| Opening size / forgiveness | `POT.openingRadius`, `POT.latkeOverhangAllowance` | Raise the allowance to make the rim more forgiving. |
| Splash size | `PARTICLES.splashDroplets`, `splashSparkles` | Droplets and sparkles per hit. |
| Splash duration | `PARTICLES.dropletLifeMin`, `dropletLifeMax`, `rippleSeconds` | Seconds. |
| Particle pools | `PARTICLES.dropletPoolSize`, `sparklePoolSize` | Upper limit on live particles. When a pool is full, the oldest particles are reused. |
| Menorah bonus | `MENORAH.candles`, `MENORAH.multiplier` | Candles needed and the points per latke once they're all lit. The menorah's position and size are `MENORAH_POSITION` and `MENORAH_SCALE` in `js/scene.js`. |
| Gelt shower | `GELT.coinsPerHit`, `spreadSeconds`, `lingerSeconds`, `poolSize` | Coins per dreidel hit, how spread out the shower is, how long coins stay on the table, and the most coins on screen at once. |
| Dreidel hit size | `DREIDEL.radius`, `DREIDEL.height` | Collision cylinder before each dreidel's scale. Dreidel positions and sizes are in `dreidelSpecs` in `js/scene.js`. |

Pot motion is a pure function of round time: `x(t) = center.x + amplitude.x · sin(speed.x · t + phase.x)`, and the same for y and z. That makes it smooth, deterministic and independent of frame rate. Restarting resets `t` to 0.

## Music

Background music lives in `assets/music/` and is set up in `MUSIC` at the top of [`js/audio.js`](js/audio.js):

- The title screen and the game-over screen loop `Music_Menu_01.mp3`.
- Each round loops one track picked at random from `MUSIC.gameplay` (`Music_Gameplay_01.mp3` or `Music_Gameplay_02.mp3`).

Tracks fade into each other over half a second. Music pauses with the game and follows the mute button. Because of browser autoplay rules, the menu music starts on your first click or tap. To add more round music, put the file in `assets/music/` and add its path to `MUSIC.gameplay`. `MUSIC.volume` sets the music level.

## Adding audio files

Sounds are synthesized with the Web Audio API, so no files are needed. To use your own recordings:

1. Create an `audio/` folder next to `index.html` and add your files (`.mp3`, `.ogg` or `.wav`).
2. In [`js/audio.js`](js/audio.js), fill in the paths in `AUDIO_FILES`, for example `splash: './audio/sizzle.mp3'`.

Files load after the first click or tap, because browsers only allow audio after a user gesture. Any sound whose file is missing or fails to decode falls back to its synthesized version. The available hooks are `launch`, `splash`, `miss`, `rim`, `click`, `tick`, `go`, `gameOver`, `newBest`, `dreidel`, `coin`, `candle` and `miracle`.

## Project structure

```
LatkeToss/
├── index.html        Page, HUD, menus, import map
├── css/style.css     Layout, HUD and responsive rules
├── js/
│   ├── main.js       Bootstraps renderer, scene, game; animation loop
│   ├── config.js     Every tunable number
│   ├── scene.js      Renderer, camera framing, lights, table, menorah, dreidels, sparkles
│   ├── latke.js      Procedural latke geometry, shared fried-surface textures, latke pool
│   ├── pot.js        Cast-iron pot, oil shader, bubbles, ripples, motion paths, depth cues
│   ├── physics.js    Latke rigid-body state, integrator, trajectory prediction, collisions
│   ├── particles.js  Pooled point-particle systems for oil splashes and sparkles
│   ├── gelt.js       Gelt coin model and the pooled coin shower from dreidel hits
│   ├── controls.js   Pointer Events drag-to-aim and perspective-correct launch mapping
│   ├── game.js       State machine (MENU/READY/PLAYING/PAUSED/GAME_OVER), scoring, round flow
│   ├── ui.js         DOM overlay helpers
│   └── audio.js      Web Audio synth effects, mute, optional sample loading
└── README.md
```

### How scoring works

Each physics step converts the latke's start and end positions into the pot's local frame, using the pot's position at the start and at the end of the step. When that segment crosses the opening plane moving downward, the crossing point is interpolated. The throw scores only if that point lies within `openingRadius − latkeRadius × (1 − latkeOverhangAllowance)`. Because the test uses relative motion between steps, fast throws and moving pots can't skip through the opening.

A slightly wider ring counts as the rim and knocks the latke back out. Below the rim, the pot acts as a solid wall. Each latke can score once: after it resolves, the throw is locked and a new latke appears on the plate. Scoring stops the moment the timer reaches zero. Latkes still in the air finish their flight, but can't score.

## Browser support

Works in current versions of Chrome, Edge, Firefox and Safari on desktop, Android and iOS. If WebGL is unavailable, or the scripts can't load, the page shows a message explaining why instead of a blank screen.
