# Pumpkin Smash! — image-tracked AR

Pumpkin Smash! is a static, mobile-first Halloween game. MindAR Image Tracking 1.2.5 recognizes five supplied photographs and anchors a procedural Three.js pumpkin to the center of the recognized image. Each target can score only once; finish all five unique targets to win.

## Included project

- `index.html`, `game.js`, and `styles.css` — the game and its UI.
- `target-builder.html`, `target-builder.js`, and `target-builder.css` — a separate, vertically scrolling local browser compiler.
- `images/image1.jpg` through `images/image5.jpg` — the reference photos.
- `images/manifest.json` — the fixed source-image list.
- `vendor/` — local copies of Three.js 0.160.0 and MindAR 1.2.5, including their licenses. Three.js 0.160.0 is used because MindAR 1.2.5 imports `sRGBEncoding`; the provided Three.js 0.186.1 archive no longer exports that symbol and is not compatible with this MindAR build. The original `.tgz` archives are retained as supplied but are not loaded at runtime.

No runtime CDN, backend, API key, Node server, or image upload is used. The target compiler runs locally in the browser; the game uses the camera feed locally.

## Build or refresh targets

This project includes `targets.mind` compiled from all five reference photos. To regenerate the database after changing a source image:

1. Serve the folder through HTTPS or localhost (camera access and browser workers require a secure context). For example, with Python installed, open a terminal in this folder and run `python -m http.server 8000`; then visit `http://localhost:8000/target-builder.html`.
2. The builder automatically loads and previews all five files from `images/`, reports dimensions and individual loading errors, then enables **Build Image Database** only when all five are available.
3. Press **Build Image Database** and keep the page open until compilation completes. The success state is shown only after MindAR returns nonempty binary data and the matching target manifest has been generated.
4. The browser downloads `targets.mind` and `target-manifest.json`. Put both files in this project root beside `index.html`. Keep the source photographs in `images/`.
5. Replace both generated root files together. Target indexes follow the displayed order: image1 through image5.

Publish the full folder to GitHub Pages and open the game over HTTPS on a supported phone.

## Run the game

1. Open `index.html` through HTTPS (GitHub Pages) or localhost.
2. Tap **Start Game**, grant camera access, and slowly point the rear-facing camera at one of the exact source photos.
3. Tap the visible 3D pumpkin to score. The pumpkin appears only on a currently tracked target, inherits MindAR's target transform, and is centered at local target coordinates `(0, 0, 0)` with a small positive local-Z offset.
4. Each reference photo can be smashed only once. After each squash and particle burst completes, another pumpkin spawns on a visible, not-yet-smashed photo. The tracker and camera stop and the scanning overlay is hidden after the fifth unique smash.

## Replace or add reference photos

This build uses `image1.jpg` through `image5.jpg`. To replace one, preserve or update its filename in `images/manifest.json`, update `target-builder.js`'s `targetFiles` list if the filename changes, and rebuild. The five-smash game requires five distinct targets. Always preserve original images elsewhere before replacing them. A target binary and its manifest must be rebuilt together so indexes remain aligned.

## Troubleshooting and limitations

- **Builder image failed:** confirm the exact, case-sensitive filename and path in `images/`. The individual card displays its HTTP or image-decoding error.
- **Compiler missing:** check that `vendor/mind-ar/dist/` was published with the project and reload. The builder does not fall back to a CDN.
- **Camera error:** use HTTPS or localhost, allow camera permission, close other camera apps, and retry. Modern Chrome on Android and Safari on iOS are the primary targets; older browsers or embedded in-app browsers may not support camera or module features.
- **No pumpkin appears:** the game needs both generated `targets.mind` and its generated `target-manifest.json` in the project root. Keep the exact reference photo in view, sharp, and well lit.
- **Image2 tracking:** `image2.jpg` contains a detailed illustrated ball but also a large plain wall. The wall has little distinctive texture and may lower tracking reliability. Favor the ball's printed pattern.
- **Image5 tracking:** `image5.jpg` has relatively few distinctive features outside the blue object. Keep the object sharp, well lit, and fully visible.
- **Tracking scope:** this is planar photo tracking, not general object detection or persistent world mapping. The pumpkin follows the photo's pose and is removed when that target is genuinely lost. It will not recognize a similar 3D cabinet, ball, door, or decoration.
- **Privacy:** target compilation and camera processing run in the browser. This project does not send photos or camera frames to a server.

## Verification report

- Source assets and exact relative paths: verified in the project.
- Local dependency modules and import-map paths: verified against the supplied MindAR package; Three.js 0.160.0 is used to satisfy MindAR's `sRGBEncoding` import.
- Builder logic: implemented with image-load validation, per-image errors, compilation progress, nonempty binary validation, and two generated output downloads.
- Browser builder compilation: passed for all five source photos; generated and installed the matching MindAR database and target manifest.
- Local game load and five-target setup validation: passed.
- End-of-round camera shutdown and per-image one-score rule: implemented; physical-device win-flow test remains unverified.
- Mobile camera permissions, real-image pose tracking, and GitHub Pages deployment: not verified in this environment; these require a supported device / published HTTPS site.
