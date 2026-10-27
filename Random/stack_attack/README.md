# Stack Attack

A retro falling-block puzzle game for desktop and mobile browsers. Pick a difficulty (7, 11 or 15 piece types) and one of four themes, then stack and clear lines while gravity speeds up.

Built with HTML5 Canvas and vanilla JavaScript. There are no dependencies, no build step and no downloaded assets.

## Files

| File         | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `index.html` | Page structure: toolbar, HUD panels, overlays, dialogs, touch controls |
| `styles.css` | Layout (desktop / portrait / landscape), the four themes, menus |
| `game.js`    | Everything else (see [Code layout](#code-layout))               |

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

**THEME** in the toolbar (or on the main menu) opens a picker with a live preview of each theme:

- **70s Retro**: cream and brown, rainbow arcs, film-grain texture, rounded glossy blocks.
- **80s Arcade**: deep blue and purple, scrolling perspective grid, beveled cabinet blocks, monospace type.
- **90s Classic**: purple geometric pattern, chunky black-outlined panels and blocks, bright primaries.
- **Neon Future**: near-black background, slowly rotating aurora, glowing outline blocks.

A theme changes appearance only: CSS custom properties for the UI and a canvas palette for the board. Gameplay, scoring and piece definitions are never touched. The choice is saved in `localStorage` and applied by a small inline script before first paint, so there is no flash of the default theme.

## Code layout

`game.js` is one IIFE split into numbered sections:

1. **Config**: board size, `SCORING`, `DIFFICULTIES`, gravity and lock-delay curves
2. **Pieces and rotation**: `PIECE_DEFS`, derived rotation states, SRS and generic kick tables
3. **Themes**: canvas palettes and block styles
4. **Preferences**: `localStorage` with validation; storage failures are ignored
5. **Board**: grid, collision, placement, line detection
6. **Bag**: randomizer
7. **Game**: state machine (`menu`, `playing`, `paused`, `clearing`, `over`), gravity, DAS/ARR, lock delay with a 15-move reset limit, hold, scoring
8. **Renderer**: cached block sprites per theme, ghost piece, lock flash, hard-drop trails, line-clear flash and wipe, particles, previews, menu piece gallery
9. **InputManager**: keyboard and pointer input mapped to actions
10. **App**: DOM, overlays, dialogs, HUD, layout sizing, lifecycle (resize, orientation, visibility)

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
- [ ] Each of the four themes restyles the background, board, blocks, HUD, buttons, dialogs and effects.
- [ ] Reloading keeps the theme and settings with no flash.
- [ ] Changing the theme mid-game doesn't change the score, level, speed or pieces.
- [ ] Ghost piece and piece letters toggle immediately. DAS / ARR / soft-drop speed take effect immediately.
- [ ] Defaults restores the input settings.

**Mobile**
- [ ] Portrait: the board is centered between narrow HOLD/stats and NEXT columns, with the controls below. Nothing scrolls.
- [ ] Landscape: the movement and action clusters sit on either side of the board.
- [ ] Holding ◀ / ▶ / ▼ repeats. A tap and hold with one finger while tapping rotate with another both work.
- [ ] Lifting a finger, or an interrupted touch (notification, gesture), releases the button.
- [ ] Rotating the device re-fits the board. Notched phones keep the controls inside the safe area.

## Known limitations

- No sound or music.
- Key bindings are fixed (only timing is configurable).
- T-spins are not detected or scored separately.
