# Skateboard Ninjas

A 60-second, side-scrolling skateboarding arcade game for desktop and mobile
browsers. Your ninja skates on their own: you ollie, flip, grab, grind rails, and
dodge angry Karens to score as much as you can before time runs out.

Plain HTML, CSS, and JavaScript (ES modules) on Canvas 2D. No build step, no
dependencies, no external services. All art is drawn with code, and all sound
is synthesized with the Web Audio API.

## Running it

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
# from the repo root (any static server works)
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:8000/Skate/SkateboardNinjas/` (port depends on
the server). VS Code's Live Server extension also works.

**GitHub Pages:** nothing extra to do. The game uses only relative paths, so
it works at `https://<user>.github.io/<repo>/Skate/SkateboardNinjas/` once the
repo is published from `main` / root.

## Controls

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Ollie (also pops off a rail) | **OLLIE** button, or tap the left half of the screen | Space |
| Flip trick | **FLIP** stick: flick a direction | Arrow keys |
| Grab trick | **GRAB** stick: flick, hold to keep grabbing | W A S D (hold to keep grabbing) |
| Pause / resume | ❚❚ button | Esc or P |
| Start / play again | buttons | Enter |
| Mute all | SFX / MUSIC toggles | M |

The sticks fire **once** when pushed past the activation ring, then have to
come back to the centre before they fire again, so holding a stick never
repeats a trick. Both sticks track separate fingers and work at the same time.
On a keyboard, press two arrows (or two WASD keys) together for a diagonal.

| Direction | Flip stick | Grab stick |
| --- | --- | --- |
| ↑ | Kickflip | Indy Grab |
| ↓ | Heelflip | Tail Grab |
| ← | Pop Shove-it | Melon Grab |
| → | 360 Shove-it | Nose Grab |
| ↗ / ↖ / ↙ / ↘ | 360 Flip / Varial Kickflip / Varial Heelflip / Hardflip | Stalefish / Method / Japan Air / Shadow Air |

## How it plays

- **Movement:** speed rises from 330 to 430 units/s over the run. The skater
  stays at a fixed spot on screen while the street scrolls.
- **Ramps** launch you automatically. Ollie on the ramp, or within 0.12 s after the lip, for extra height.
- **Grinding** is automatic: come down onto a rail, bench, or ledge and you
  lock on. Grind points tick up every second. Ollie to pop off, or ride off the end, for the exit bonus.
- **Tricks** only work in the air. You can do a flip and a grab in the same
  jump. If you ask for one while the other is still animating, it waits its turn.
- **Landing:** land with a flip under 65% complete and you **bail**. Land
  mid-flip after that, or mid-grab, and the landing is **sketchy**. Otherwise it's **clean**.
- **Crashing** into a cone, trash can, hydrant, barrier, Karen, or shopping
  cart, or falling into a gap, is a wipeout. You lose the unbanked combo and
  some speed, then blink (invulnerable) for 1.2 s.
- **Karens** always warn you first. The *blocker* stands and wags her finger. The *stepper*
  waits at the back of the sidewalk, shows a "!", then steps in. The *charger*
  storms toward you. The *cart* Karen shoves a shopping cart into your lane.
  Moving ones adjust their speed so they arrive at a spot the level generator kept
  clear, which makes every encounter fair.
- **Time's up:** new tricks stop. If you're in the air you get to land first.
  Your combo banks, the skater rolls to a stop, and the results screen appears.

### Scoring

Every action goes into the current **combo**:

| Action | Points |
| --- | --- |
| Ollie / ramp launch | 50 |
| Kickflip, heelflip, grabs | 100 |
| Pop shove-it | 125 |
| 360 shove-it | 150 |
| Diagonal flips | 175–200 |
| Diagonal grabs | 150 |
| Flip + grab in one jump | +250 |
| Holding a grab | 120 / s |
| Grinding | 50 / s |
| Grind exit | 150 |
| Clean landing (after a trick) | 100 |
| Big air (over 1.1 s) | 100 |
| Near miss (under 28 units of clearance) | 100 |
| Karen dodge | 150 |

- **Multiplier** depends on how many *different* actions are in the combo:
  ×1, ×1.5 at 2, ×2 at 3, ×3 at 4, then +0.25 for every two more, up to ×4.
- **Repeats** of the same action in one combo are worth half as much each time.
- **Banking:** after a clean landing, a gold **link bar** drains for 1 s. Ollie
  before it empties and the combo keeps growing. Otherwise it banks. A sketchy
  landing banks right away. A wipeout loses everything that hasn't banked yet.
  Banked points are never lost.

## Level generation

`src/LevelGenerator.js` builds the street from data-driven segments: flat
ground, obstacles, cone rows, gaps, kickers, kicker+gap, kicker+obstacle,
rails, benches, ledges, high rails, rail transfers, rail-over-gap, the big
launch-ramp combo, and four Karen encounters. Each segment has tier weights
for warm-up (0–20 s), build (20–40 s), and rush (40–60 s).

Fairness rules it enforces:

- Every hazard gets a clear run-up: reaction time × current speed (0.8 s, then 0.6 s, then 0.45 s).
- Every segment ends with a landing zone sized from real jump physics, so
  nothing is ever placed where you're forced to land.
- Gap widths, cone-row lengths, ramp-over-obstacle placement, and rail
  heights are checked against `Physics.js` (ballistic arcs) before they're placed.
- Karen encounters have a cooldown between them, and segments don't repeat back to back.
- It uses a seeded RNG (`?seed=123`). The **Daily Challenge** uses a seed made
  from today's date, so everyone gets the same street.

In testing, a perfect-timing bot finished 100 seeded runs with zero crashes,
which confirms every sequence it generated could be cleared.

## Configuration

All tuning values live in [`src/config.js`](src/config.js): physics (gravity,
jump impulse, speeds, buffers), trick timing, scoring values and multipliers,
input thresholds (dead zone, activation, release, lockout), level spacing,
and Karen behavior. Trick lists are in [`src/TrickSystem.js`](src/TrickSystem.js).

URL parameters:

- `?seed=12345`: replay a specific street. The results screen shows each run's seed.
- `?debug=1`: draws hitboxes, rail lines, Karen meeting points, and the generator's hazard spans, and warns in the console if spacing ever gets tight.

The game object is exposed as `window.skateboardNinjas` for console tinkering.

## Project structure

```
SkateboardNinjas/
├── index.html            screens, HUD, touch controls
├── styles.css
├── assets/README.md      requirements for swapping in real sprite / audio assets
└── src/
    ├── main.js           entry point
    ├── config.js         every tunable value
    ├── Game.js           states, fixed-timestep loop, rules glue
    ├── Player.js         movement state machine (grounded/airborne/grinding/wipeout/recovering)
    ├── Physics.js        ballistic helpers (also used by the generator)
    ├── InputManager.js   keyboard + multitouch sticks → event queue
    ├── TrickSystem.js    flip/grab definitions, animation timing, landing quality
    ├── GrindSystem.js    rail entry detection and grind scoring
    ├── CollisionSystem.js obstacle/Karen hits, near misses, dodges
    ├── ScoringSystem.js  combos, multipliers, banking, stats
    ├── LevelGenerator.js segment catalog + fairness rules
    ├── World.js          live level objects (pooled), ground queries
    ├── Karen.js          Karen behaviors
    ├── Particles.js      pooled particles + floating score text
    ├── HUD.js            DOM HUD and screens
    ├── AudioManager.js   synthesized SFX + music loop
    ├── Renderer.js       camera, layering, overlays, debug view
    ├── rng.js, storage.js
    └── art/              ninja (IK-posed puppet), Karen, props, parallax city
```

## Technical notes

- Physics runs at a fixed 60 Hz in an accumulator loop, and rendering
  interpolates between steps. The run timer adds up simulated time, so it
  doesn't drift with the frame rate and doesn't advance while paused or counting down.
- The game auto-pauses when the tab is hidden and suspends the audio context.
- Level objects and particles are pooled, so nothing is allocated per frame on the hot path.
- Canvas resolution is capped at 2× device pixel ratio. Background buildings are
  rendered once to cached offscreen canvases.
- Personal best and daily best go to `localStorage`. If storage is blocked, the game keeps running and just doesn't save them.

## Known limitations

- The art is procedural canvas drawing, not sprite sheets. See `assets/README.md` for how to swap in sprites.
- Portrait phones work, but the view is cramped. The title screen suggests rotating to landscape.
- Fullscreen is offered where the browser supports it (not iPhone Safari).
- There's no online leaderboard. The daily challenge compares against your own best only.
