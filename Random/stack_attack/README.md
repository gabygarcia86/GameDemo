# Stack Attack

A retro falling-block puzzle game for desktop and mobile browsers. Pick a difficulty (7, 11 or 15 piece types) and one of 17 themes, each with its own look, music and sound effects. Then stack and clear lines while gravity speeds up.

Built with HTML5 Canvas, the Web Audio API and vanilla JavaScript. There are no dependencies, no build step and no downloaded assets: every block, background, note and drum is generated in code. You can optionally swap in your own audio files.

## Files

| File         | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `index.html` | Page structure: toolbar, HUD panels, overlays, dialogs, touch controls |
| `styles.css` | Layout (desktop / portrait / landscape), menus, the four Arcade-era themes |
| `themes.css` | The other 13 themes (colors, fonts, backgrounds, animated extras) |
| `game.js`    | Game, rendering, input and UI (see [Code layout](#code-layout)) |
| `audio/audio-config.js` | Music and sound effects for every theme. **Edit this to change the sound** |
| `audio/audio-engine.js` | The synthesizer and sequencer that plays the config |
| `audio/README.md` | Step-by-step guide to changing sounds and music, or using your own audio files |
| `audio/files/` | Optional folder for your own `.mp3` / `.ogg` / `.wav` files |

## Running locally

`game.js` is a classic script rather than an ES module, so the game runs straight from disk: open `index.html` in a browser.

To serve it over HTTP instead (closer to how GitHub Pages hosts it):

```bash
# from this folder
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000/`.

## Deploying to GitHub Pages

1. Commit the `stack_attack` folder to your repository.
2. On GitHub, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick your branch and `/ (root)`.
3. After the deploy finishes, the game is at `https://<user>.github.io/<repo>/Random/stack_attack/`.

All paths are relative, so the folder works at any URL depth.

## Controls

| Action                   | Keyboard          | Touch          |
| ------------------------ | ----------------- | -------------- |
| Move left / right        | ← → or A / D      | ◀ ▶ (hold to repeat) |
| Soft drop                | ↓ or S            | ▼ (hold)       |
| Hard drop                | Space             | DROP           |
| Rotate clockwise         | ↑ or X            | ↻ (large button) |
| Rotate counterclockwise  | Z                 | ↺              |
| Hold piece               | C or Shift        | HOLD           |
| Pause / resume           | P or Esc          | ❙❙ in toolbar  |
| Restart                  | R (asks first during a game) | ⟲ in toolbar |
| Mute / unmute            | M                 | speaker in toolbar |

Holding left/right uses DAS/ARR auto-repeat (delay and rate are adjustable in **Settings**). Keys and touch buttons are tracked per source, so releasing one of two held inputs never cancels the other, and all inputs are released when the window loses focus, the tab is hidden, a dialog opens or the game pauses.

Touch controls appear automatically on touch-only devices (or after the first touch). **Settings → Touch controls** can force them on or off.

## Difficulties and pieces

| Difficulty | Piece types | Gravity                                       | Lock delay          |
| ---------- | ----------- | --------------------------------------------- | ------------------- |
| Easy       | 7           | Standard curve, capped at curve level 15      | 500 ms              |
| Medium     | 11          | Curve level advances 1.2× per player level, cap 18 | 500 ms → 420 ms |
| Hard       | 15          | Starts at curve level 1.5, advances 1.4× per level, cap 20 (20G) | 480 ms → 280 ms |

The gravity curve is the guideline formula `(0.8 − (L−1)·0.007)^(L−1)` seconds per row. Approximate speeds (ms per row) at player levels 1 / 10 / 20: Easy 1000 / 64 / 7, Medium 1000 / 31 / 1.5, Hard 893 / 11 / 0.5.

**Classic (all difficulties):** I, O, T, S, Z, J, L. They use the standard SRS rotation and wall-kick tables.

**Medium adds** (marked ★, with a corner notch on each block):

```
Corner (C)   Rod (R)   Pillow (P)   Cup (U)
#.           ###       ###          #.#
##                     ##.          ###
```

**Hard adds** (marked ★★, with diagonal stripes on each block):

```
Cross (X)   Stairs (W)   Fork (Y)   Wedge (V)
.#.         #..          .#..       #..
###         ##.          ####       #..
.#.         .##                     ###
```

Every piece is defined once as a matrix in `PIECE_DEFS`. Its four rotation states, collision masks, spawn position and preview are derived from that matrix. Custom pieces use a generic kick list (in place, sideways, up one, and so on), mirrored for counterclockwise turns.

Pieces come from a shuffled bag containing one of each enabled type, so every type appears exactly once per bag (7, 11 or 15 pieces). The first piece of a game is always I, T, J or L.

Difficulty is never changed silently. Choosing a different difficulty during a game asks for confirmation and then starts a new game. The menu selector is ignored while a game is in progress.

## Scoring

All values live in the `SCORING` table at the top of `game.js`.

| Event                     | Points                          |
| ------------------------- | ------------------------------- |
| Single / Double / Triple / Quad | 100 / 300 / 500 / 800 × level |
| Combo (consecutive clearing locks) | 50 × combo count × level |
| Perfect clear (board emptied) | +2000 × level              |
| Soft drop                 | 1 per row the piece falls while soft-dropping |
| Hard drop                 | 2 per row dropped               |

Hold awards no points and can be used once per piece until that piece locks, so swapping can't be farmed. Level = 1 + lines ÷ 10 (max 30). Best scores are saved per difficulty. A run's score is recorded when it ends, whether by game over, restart, quitting to the menu, changing difficulty or closing the page.

The pieces in this game are at most 4 cells tall in any orientation, so a Quad is the largest clear. The table has a 5-line entry in case a taller piece is added.

## Themes

**THEME** in the toolbar (or on the main menu) opens a picker. Each card previews its theme, and while the picker is open the selected theme's music plays.

| Group | Theme | Look | Music |
| ----- | ----- | ---- | ----- |
| Arcade eras | 70s Retro | Cream and brown, rainbow arcs, film grain, glossy round blocks | Disco funk |
| | 80s Arcade | Perspective grid, beveled cabinet blocks | Synthwave |
| | 90s Classic | Purple geometric pattern, chunky outlined blocks | Eurodance chiptune |
| | Neon Future | Rotating aurora, glowing outline blocks | Trance |
| Worlds | Sci-Fi | Starfield and planet, riveted metal blocks | Spacey lydian pads and echoing arpeggios |
| | Matrix | Falling green code streaks, glowing green blocks | Dark phrygian techno |
| | Ninjas | Red sun, mountains and bamboo, ink-on-paper panels | Koto, bamboo flute and taiko drums |
| | Western | Desert sunset, parchment panels, wood blocks | Country shuffle with harmonica and clip-clop woodblock |
| Holidays | America | Stars on navy, waving stripes, red-white-blue | Brass-band march with snare |
| | Halloween | Full moon, orange glow, pumpkin colors | Organ and theremin in harmonic minor |
| | Thanksgiving | Harvest plaid, wood blocks | Warm folk fiddle |
| | Hanukkah | Blue with silver star pattern, metal blocks | Lively klezmer hora with clarinet |
| | Christmas | Falling snow, ornament blocks | Sleigh-bell jingle with celesta |
| | Easter | Pastel polka dots, light board, soft flat blocks | Bouncy marimba and flute |
| Seasons | Spring | Flowers on green hills | Harp and flute, birdsong-style effects |
| | Beach | Sun, sea and sand | Calypso steel drums |
| | Winter | Snowfall and drifts, ice blocks | Music-box waltz in 3/4 time |

All melodies are original compositions written as note patterns in `audio/audio-config.js`.

A theme changes appearance and sound only: CSS custom properties for the UI, a canvas palette and block style for the board, and music settings for the audio. Gameplay, scoring and piece definitions are never touched. The choice is saved in `localStorage` and applied by a small inline script before first paint, so there is no flash of the default theme.

## Sound and music

- The music changes with the theme and speeds up slightly as the level rises. It plays on the menu and during play, and stops while paused and on game over.
- Every game event has a sound: move, rotate, hold, hard drop, lock, 1–4 line clears, level up, game over, denied hold, start, pause.
- **Settings** has separate **Music volume** and **Sound effects volume** sliders. The toolbar speaker button (or **M**) mutes everything. All of these are remembered.
- Browsers block audio until the first click or key press, so the game starts its sound on your first interaction.

**To change any sound or melody, or to use your own audio files, see [audio/README.md](audio/README.md).** It walks through each change with copy-and-paste examples. Mistakes in the config show up as readable warnings in the browser console instead of breaking the game.

## Adding a theme

1. **Look:** copy a theme block in `themes.css` (for example `[data-theme="beach"] { ... }`), give it a new id and change the colors and background.
2. **Board:** copy an entry in the `THEMES` object in `game.js`, set the same `id`, a `label`, a `group`, a `block` style (`round`, `bevel`, `chunky`, `glow`, `metal`, `flat` or `wood`) and the 15 piece colors. Add the id to a group in `THEME_GROUPS` just below it.
3. **Sound:** copy a theme entry in `audio/audio-config.js` and rename it to the same id (see [audio/README.md](audio/README.md#give-a-new-theme-its-own-music)).
4. **No flash on load:** add the id to the `ids` list in the small script in `index.html`'s `<head>`.

## Code layout

`game.js` is one IIFE split into numbered sections:

1. **Config**: board size, `SCORING`, `DIFFICULTIES`, gravity and lock-delay curves
2. **Pieces and rotation**: `PIECE_DEFS`, derived rotation states, SRS and generic kick tables
3. **Themes**: canvas palettes and block styles
4. **Preferences**: `localStorage` with validation; storage failures are ignored
5. **Board**: grid, collision, placement, line detection
6. **Bag**: randomizer
7. **Game**: state machine (`menu`, `playing`, `paused`, `clearing`, `over`), gravity, DAS/ARR, lock delay with a 15-move reset limit, hold, scoring
8. **Renderer**: cached block sprites per theme (seven block styles), ghost piece, lock flash, hard-drop trails, line-clear flash and wipe, particles, previews, menu piece gallery
9. **InputManager**: keyboard and pointer input mapped to actions
10. **App**: DOM, overlays, dialogs, HUD, layout sizing, lifecycle (resize, orientation, visibility), music state
11. **Audio hookup**: creates the engine from `audio/`, checks the config and logs any problems, and falls back to silence if the audio files are missing

A single `requestAnimationFrame` loop drives everything. Listeners are attached once at boot, and a guard stops the app from booting twice.

## Accessibility

- Semantic buttons, a fieldset with radio buttons for difficulty, native `<dialog>` for modals (focus trap, Esc closes).
- A visible `:focus-visible` ring in every theme.
- Pieces are told apart by more than color: each block can show its letter (on by default), and Medium and Hard pieces carry tier markings.
- `prefers-reduced-motion` turns off CSS animations, particles and hard-drop trails, and shortens the line-clear animation.
- The hold and next canvases have live `aria-label`s that name the pieces.

## Manual test checklist

**Start and menu**
- [ ] The page loads with no console errors and the main menu shows a gallery of the selected difficulty's pieces.
- [ ] Switching Easy / Medium / Hard updates the gallery (7 / 11 / 15 pieces), the toolbar label and the BEST stat.
- [ ] PLAY starts a game. Five next pieces are shown and the first piece is I, T, J or L.

**Movement and rotation**
- [ ] ← / → (and A / D) move one cell per tap. Holding repeats after the DAS delay at the ARR rate.
- [ ] Holding ← then pressing → switches direction. Releasing → resumes moving left.
- [ ] ↓ / S soft-drops and adds 1 point per row. Space hard-drops, locks at once and shows a trail.
- [ ] ↑ / X rotate clockwise and Z counterclockwise. Rotating against a wall or the stack kicks the piece when there is room.
- [ ] A grounded piece can be slid and rotated briefly but locks after about 15 moves.

**Hold**
- [ ] C / Shift stores the piece. The first hold pulls the next piece from the queue.
- [ ] A second hold before the piece locks does nothing (the HOLD panel shakes and the held piece is dimmed).
- [ ] After a lock, hold swaps the held piece back in.

**Line clears and scoring**
- [ ] Completed rows flash and wipe before they disappear. A label shows Single / Double / Triple / Quad, any combo, and the points.
- [ ] Every 10 lines the level rises and pieces fall faster.
- [ ] Clearing every block awards a Perfect clear.

**Pause, restart, game over**
- [ ] P / Esc / the toolbar button pause. No input moves the piece while paused. P / Esc / Resume continue.
- [ ] Switching tabs or minimizing pauses the game automatically.
- [ ] R during a game asks for confirmation. Cancel keeps the paused game and Restart starts a new one.
- [ ] Topping out greys the stack and shows the game-over card with the final score and "New best!" when earned.
- [ ] R or Play Again on the game-over card starts a new game.
- [ ] Main Menu from the pause card asks for confirmation.

**Difficulty**
- [ ] Changing difficulty in the toolbar dialog during a game warns that the game will end and asks for confirmation.
- [ ] Cancelling at either step leaves the current game and its piece pool untouched.
- [ ] Medium spawns the 4 starred pieces and Hard spawns all 8 custom pieces.

**Themes and settings**
- [ ] The theme picker shows 17 themes in four groups. Each one restyles the background, board, blocks, HUD, buttons, dialogs and effects.
- [ ] Reloading keeps the theme and settings with no flash.
- [ ] Changing the theme mid-game doesn't change the score, level, speed or pieces.
- [ ] Ghost piece and piece letters toggle immediately. DAS / ARR / soft-drop speed take effect immediately.
- [ ] Defaults restores the input settings.

**Sound**
- [ ] After the first click or key press, menu music plays. It keeps playing into the game, stops when paused and resumes with the game.
- [ ] While the theme picker is open, choosing a theme switches to its music immediately.
- [ ] Moving, rotating, holding, dropping, locking, clearing lines, levelling up and game over each make a sound that fits the theme.
- [ ] The speaker button and **M** mute and unmute. The volume sliders change music and effects separately, and all three are remembered after reload.
- [ ] Switching to another tab silences the game. Coming back doesn't blast sound.
- [ ] Pointing a theme's `files.music` at a missing file logs a warning and plays the built-in music instead.
- [ ] The browser console shows no `[Stack Attack audio config]` warnings.

**Mobile**
- [ ] Portrait: the board is centered between narrow HOLD/stats and NEXT columns, with the controls below. Nothing scrolls.
- [ ] Landscape: the movement and action clusters sit on either side of the board.
- [ ] Holding ◀ / ▶ / ▼ repeats. A tap and hold with one finger while tapping rotate with another both work.
- [ ] Lifting a finger, or an interrupted touch (notification, gesture), releases the button.
- [ ] Rotating the device re-fits the board. Notched phones keep the controls inside the safe area.

## Known limitations

- Key bindings are fixed (only timing is configurable).
- T-spins are not detected or scored separately.
