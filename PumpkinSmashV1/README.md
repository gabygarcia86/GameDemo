# Pumpkin Smash! 🎃

A mobile-friendly Halloween camera-overlay AR mini game built with HTML, CSS, JavaScript, and Three.js. Find five pumpkins and tap them to smash them while bats fly overhead, zombies rise from the ground, skeletons dance, ghosts drift by, and a full moon glows in the background.

## Play locally

For the camera mode, serve the folder through HTTPS or localhost; browsers require a secure context and user permission for camera access. The easiest local test is VS Code's Live Server extension, or Python's built-in server:

```bash
cd pumpkin-smash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser. Camera access behavior can vary by browser/device. On a phone, use the published HTTPS URL for best results. The **Try Demo Mode** button does not need camera permission.

## Publish inside a GitHub Pages site

1. Copy the entire `pumpkin-smash` folder into the repository used by your GitHub Pages site.
2. Commit and push the files.
3. Make sure GitHub Pages is enabled for the repository (Settings → Pages).
4. Open the folder's URL. For a project site it usually looks like `https://USERNAME.github.io/REPOSITORY/pumpkin-smash/`. For a user/organization site, it usually looks like `https://USERNAME.github.io/pumpkin-smash/`.
5. Open the link directly on a phone and approve camera access.

Keep `index.html`, `styles.css`, `game.js`, and this README together in the same folder. The Three.js module is loaded from jsDelivr, so a network connection is needed the first time the game loads.

## Controls

- Tap **Play in AR** and allow camera access.
- Tap each of the five glowing pumpkins to smash it.
- Use the music-note button to enable/disable synthesized sound effects.
- **Camera** switches between live camera and demo background.
- **Reset** puts all five pumpkins back.
- It responds to both portrait and landscape rotation.

## AR note

This version uses a live camera background with animated 3D objects composited over the view. The characters are screen-overlay objects; they are **not world-locked** to real floors, walls, or surfaces, and they won't stay anchored to a physical location when the phone moves. True spatial tracking/plane placement is a separate feature with additional browser/device compatibility considerations.

## Project structure

```text
pumpkin-smash/
├── index.html
├── styles.css
├── game.js
└── README.md
```

## Troubleshooting

- If the camera prompt does not appear, use the site's browser permission controls to allow camera access.
- Camera access needs HTTPS on the published site. Avoid opening the deployed page inside an in-app browser if it blocks camera permissions; try Safari or Chrome directly.
- If camera mode fails, Demo Mode keeps the gameplay testable.
- Three.js is loaded from a CDN; an internet connection is needed to load the 3D library.
