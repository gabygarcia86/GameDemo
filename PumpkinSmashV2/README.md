# Pumpkin Smash! 🎃

A mobile-friendly Halloween AR hunt built with HTML, CSS, JavaScript, and Three.js. Players explore their surroundings to find five pumpkins and tap each one to smash it while bats fly overhead, zombies rise from the ground, skeletons dance, ghosts drift by, and a full moon glows in the sky.

## AR behavior

The game prefers **tracked WebXR immersive AR**. On compatible devices/browsers it uses the phone's AR camera passthrough and positional tracking, then places five pumpkin models at different distances and directions around the player. Some are off to the side or behind the starting view, so players need to turn and move through a safe area to find them. Targets have no rings, arrows, or outlines.

If tracked WebXR AR is unavailable, the game falls back to a live camera overlay with device-orientation controls when the browser allows them. That fallback lets players turn the phone and search in 360 degrees, but it does **not** track the phone's physical walking position, so it is not the same as true world-locked AR. Demo mode is available without camera or motion-sensor permission.

## Play locally

For camera mode, serve the folder through HTTPS or localhost; browsers require a secure context and permission for camera access. The easiest local test is VS Code's Live Server extension, or Python's built-in server:

```bash
cd pumpkin-smash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser. For best testing of tracked AR, open the published HTTPS site directly in a phone browser that supports `immersive-ar`, `local-floor`, and `dom-overlay`. WebXR AR support varies by browser and device. The **Try Demo Mode** button does not need camera permission.

## Publish inside a GitHub Pages site

1. Copy the entire `pumpkin-smash` folder into the repository used by your GitHub Pages site.
2. Commit and push the files.
3. Make sure GitHub Pages is enabled for the repository (Settings → Pages).
4. Open the folder URL. For a project site it usually looks like `https://USERNAME.github.io/REPOSITORY/pumpkin-smash/`. For a user/organization site, it usually looks like `https://USERNAME.github.io/pumpkin-smash/`.
5. Open the link directly on your phone and approve camera/motion permissions if prompted.

Keep `index.html`, `styles.css`, `game.js`, and this README together. Three.js is loaded from jsDelivr, so a network connection is needed to load the 3D engine. The orientation fallback is implemented locally because current Three.js versions no longer ship DeviceOrientationControls.

## Controls

- Tap **Play in AR**. Compatible devices enter tracked WebXR AR; otherwise the game tries camera-overlay fallback.
- In tracked AR, turn and walk around a clear, safe area to find the five pumpkins. Tap each pumpkin itself to smash it.
- Use the music-note button to enable or disable synthesized sound effects.
- **Camera** switches back to demo mode. **Reset** restores all five pumpkins in their current locations.
- The layout works in portrait and landscape.

## Safety

Play in a clear area away from roads, stairs, furniture, and other hazards. Keep awareness of your surroundings, and stop walking before tapping the screen. Never play while driving or near traffic.

## Project structure

```text
pumpkin-smash/
├── index.html
├── styles.css
├── game.js
└── README.md
```

## Troubleshooting

- If the game reports that the 3D engine could not load, check your internet connection and whether jsDelivr is blocked, then reload.
- If a camera prompt does not appear, allow camera access in the browser's site settings.
- Tracked AR requires HTTPS and compatible WebXR browser/device support. If the browser falls back to camera-overlay mode, moving the phone changes the view direction, but physical position is not tracked.
- If camera mode fails, Demo Mode still lets you test the game.
- Three.js is loaded from a CDN; an internet connection is needed to load the 3D library.
