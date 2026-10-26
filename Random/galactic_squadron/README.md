# Galactic Squadron

An arcade space shooter for desktop and mobile browsers. Squadrons fly in on curved paths, lock into formation, then peel off to dive at you. Every seventh stage a capital ship arrives with multi-phase attacks.

Built with HTML5 Canvas 2D and vanilla JavaScript (ES modules). There are no dependencies, no build step and no downloaded assets: every ship, effect, sound and music track is generated in code.

## Running locally

ES modules don't load from `file://`, so serve the folder over HTTP. Any static server works:

```bash
# from the repository root (or from this folder)
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000/Random/galactic_squadron/` (or `http://localhost:8000/` if you served this folder).

## Deploying to GitHub Pages

1. Commit the `galactic_squadron` folder to your repository.
2. On GitHub, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick your branch and `/ (root)`.
3. After the deploy finishes, the game is at `https://<user>.github.io/<repo>/Random/galactic_squadron/`.

All paths are relative, so the folder works at any URL depth.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → or A D | Drag anywhere (playfield or the drag pad) |
| Fire | Space (hold), also ↑ / W | Hold **FIRE** |
| Shield (2.6 s, 16 s cooldown) | Shift, S or ↓ | Tap **SHIELD** |
| Pause / resume | P or Esc | Pause button (top right) |
| Mute | M | Speaker button |
| Confirm (start, resume, play again) | Enter | — |

Touch movement is a relative drag, so your finger never covers the ship. In portrait the controls sit in a bar under the playfield, and in landscape they sit in the side margins, so they never cover the action. The game pauses itself when the tab is hidden.

## Gameplay

| Enemy | Behaviour | Points |
| --- | --- | --- |
| Crescent Interceptor | Fast, fragile, flies in packs, swooping dives | 100 |
| Bulwark Heavy Fighter | 3 hits, slow plasma shots, loops back to formation | 200 |
| Talon Dive Bomber | Long sweeping dives, spread shots | 300 |
| Phantom Elite Ace | Fast zig-zag or boomerang dives, burst fire, brings wingmen | 500 |
| Capital ship (boss) | 3 damage phases: fans, aimed bursts, bullet rain, rings, a tracking laser, fighter launches | 2,500 + 5,000 bonus |

- **Scoring:** ships destroyed mid-dive are worth ×2. Chaining kills builds a streak that raises a multiplier from ×1 up to ×4. Finishing a stage without losing a ship earns a no-damage bonus. You get an extra life every 30,000 points.
- **Fair-play rules:** a ship shakes before it dives. Enemies don't fire from point-blank range. Bullets near your respawn point are cleared, and you're invulnerable for a short time after respawning.
- **Boss tips:** the glowing reactor core takes double damage. The laser is telegraphed by a dashed line and side markers for about a second before it fires.
- **Power-ups:** Rapid Fire (10 s), Spread Shot (12 s), Shield (8 s), Extra Life, Score Bonus. Each has its own shape and colour, and the timers show at the bottom right.

## Settings

Master, music and effects volume; mute; difficulty (Easy / Normal / Hard); starting lives (1–5); movement (*Direct* or *Inertia*); auto-fire; reduced screen shake; reduced effects. Settings and the high score are saved in `localStorage`. If storage is blocked, the game still runs and simply doesn't remember anything.

If the frame rate stays below ~40 FPS for a few seconds, the game switches to reduced effects automatically.

## Project structure

```
galactic_squadron/
  index.html        page shell and DOM menus
  styles.css        layout, menus, touch controls
  js/
    main.js         bootstrap: settings, module wiring, visibility handling
    game.js         state machine, fixed-timestep loop, scoring, combat glue
    config.js       ALL tuning values, difficulty curve, wave definitions
    waveManager.js  stage setup, entry scheduling, dive/fire orchestration, generated waves
    formation.js    formation layouts (lines, staggered, V, diamond, arc) with sway and breathing
    paths.js        entry curves and dive attack paths (Catmull-Rom splines)
    enemy.js        enemy state machine and rendering
    boss.js         capital ship: phases, attack patterns, laser, defeat sequence
    player.js       movement modes, firing, shield, respawn
    projectile.js   pooled player/enemy bullets
    collision.js    per-step collision pass
    powerups.js     drops, pickups and active timers
    particles.js    pooled particles and floating score text
    background.js   nebula, parallax stars, planets, distant ships, warp effect
    sprites.js      procedural vector art pre-rendered to offscreen canvases
    audio.js        Web Audio synthesized effects and step-sequenced music
    input.js        keyboard, mouse and touch input
    ui.js           responsive layout, menus, canvas HUD and banners
    storage.js      localStorage wrapper that never throws
    utils.js        math helpers, object pool, spline path
```

State machine: `TITLE_SCREEN → READY → PLAYING → WAVE_CLEARED → READY …`, with `BOSS_INTRO` before boss stages, `PAUSED` from any active state, and `GAME_OVER`. UI requests are queued and only legal transitions are applied, so double taps can't trigger two transitions.

The simulation runs at a fixed 120 Hz step, rendered with `requestAnimationFrame`. Bullets and particles come from fixed-size pools.

## Configuration reference (`js/config.js`)

**Player (`CONFIG.player`)**: `startLives` (3), `maxLives` (7), `maxSpeed` (440 px/s), `accel` / `drag` (inertia mode), `touchFollowSpeed`, `touchSensitivity`, `fireInterval` (0.2 s), `rapidFireInterval` (0.1 s), `bulletSpeed`, `spreadAngle`, `hitRadius` (10, deliberately smaller than the sprite), `invulnTime` (2.4 s), `respawnDelay`, `shieldAbility.duration` / `cooldown`.

**Enemies (`CONFIG.enemies.<type>`)**: `hp`, `score`, `radius`, `speed` (multiplier), `diveWeight` (how often this type is chosen to dive).

**Formation / entry / dive**: `formation.top`, `spacingX`, `spacingY`, `sway`, `breathe`; `entry.speed`, `spacing`, `groupInterval`, `jitter`; `dive.speed`, `telegraph` (warning wobble), `safeFireGap` (no firing closer than this), `fewLeft` (attacks intensify when this many remain).

**Projectiles**: `maxPlayer`, `maxEnemy` (pool sizes), `enemySpeed`, and per-kind `radius` / `speed`.

**Boss (`CONFIG.boss`)**: `every` (7), `baseHp` (150), `hpPerEncounter` (+90), `score`, `defeatBonus`, `introTime`, `maxMinions`.

**Scoring (`CONFIG.scoring`)**: `diveMultiplier` (2), `streakWindow` (3.5 s), `multiplierThresholds` ([0, 10, 22, 38] for ×1–×4), `perfectWaveBase` / `perfectWavePerStage`, `extraLifeEvery` (30,000), `scoreBonus`.

**Power-ups (`CONFIG.powerups`)**: `dropChance` (7%), `typeBonus`, `pityKills` (guaranteed drop after 26 kills without one), `maxOnScreen`, `duration`, `weights`.

**Effects**: `maxParticles`, `maxParticlesLow` (reduced mode), `maxTexts`.

**Difficulty**: `getDifficulty(stage, preset)` scales enemy speed, bullet speed, formation fire rate, dive interval, simultaneous divers, dive shots, aimed and spread unlocks, enemy HP and the bullet cap per stage. Every value has a ceiling. `CONFIG.difficultyPresets` holds the Easy / Normal / Hard multipliers.

**Waves**: `WAVES` defines stages 1–7 (`layout`, `rows`, `types`, `entries`; prefix an entry with `dual-` for mirrored streams). Later stages are generated deterministically from the same building blocks.

## Testing aids

- `?stage=7` starts a new game at that stage (7 is the first boss).
- `?debug=1` exposes the running game as `window.galacticSquadron` in the console.
