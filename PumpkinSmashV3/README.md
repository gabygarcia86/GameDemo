# Pumpkin Smash! 🎃

A mobile-friendly Halloween AR hunt built with HTML, CSS, JavaScript, and Three.js. Players search for five pumpkins to smash while bats fly overhead, zombies rise from the ground, skeletons dance, ghosts drift by, and a glowing full moon hangs high in the virtual sky.

## What's improved in this build

### Real surface placement (compatible WebXR devices)

The game requests immersive WebXR AR, horizontal hit-testing, and a floor reference space. Aim at a clear floor or table area. When the placement reticle appears, tap **PLACE WORLD** to put the Halloween scene there. The pumpkin group is then placed relative to that detected surface and follows the device's tracked movement instead of being drawn as a screen overlay. Persistent anchors are used when the runtime supports them.

The placement reticle only appears while selecting the initial surface. The pumpkins themselves do not have rings, outlines, arrows, or target markers.

### Real-world skeleton recognition (optional AI scan)

Tap **AI SCAN** to analyze the live camera image for a Halloween skeleton decoration, a skeleton model, or a person wearing a skeleton costume. When the detector recognizes one, a pumpkin appears near the bottom of its detected image region. While the skeleton stays in view, the pumpkin follows the detection; after the skeleton leaves view, the pumpkin stays at its last approximate position. Re-enter with a different skeleton to reveal another pumpkin.

The scanner downloads Transformers.js and a quantized Grounding DINO model from public CDNs on first use (the model weights are about 227 MB, plus support files). The detector uses the short prompt `skeleton.` because this exported ONNX model can reject longer prompts with an `input_ids` dimension error. A reliable internet connection and a modern phone are recommended. Frames are processed locally in the browser; this project does not send camera frames to its own server. The model is loaded and run in a dedicated Web Worker so model inference does not block the animation loop and touch controls. Detection is intentionally throttled to reduce device load. Recognition is experimental: it can miss skeletons or mistake other shapes for one, and performance depends on the phone, lighting, camera distance, and model loading.

**AR and AI limitation:** WebXR immersive AR does not expose pose-synchronized raw camera frames consistently across browsers. For that reason, tapping **AI SCAN** exits tracked WebXR and switches to the ordinary camera-overlay mode for recognition. In this mode, the pumpkin can be placed beside a skeleton in the camera image, but cannot be accurately anchored to a real floor or use WebXR depth occlusion. Physical walking-position tracking is not available in this fallback mode. You can return to tracked AR by restarting the AR session.

### Shadows and optional depth occlusion

The tracked AR scene includes soft contact shadows under the pumpkins and characters. The game requests WebXR depth sensing as an optional capability, and uses Three.js's depth-sensing mesh when exposed by the browser/runtime. If supported, physical surfaces can occlude virtual objects. Depth sensing is hardware/browser dependent; the game still runs without it, but only contact shadows remain.

### Halloween atmosphere

- Bats fly above the play area.
- Zombies repeatedly rise from and sink into the floor.
- Skeletons dance near ground level.
- Ghosts float through the scene at different heights.
- A large full moon and distant stars sit high above the scene.

## Play locally

Camera access requires HTTPS or localhost. The easiest local test is VS Code's Live Server extension, or Python's built-in server:

```bash
cd PumpkinSmashV3
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser. For tracked AR, test the published HTTPS site directly on a compatible phone browser. Demo Mode works without camera permission.

## Publish inside a GitHub Pages site

1. Copy the entire `pumpkin-smash` folder into your GitHub Pages repository.
2. Commit and push the files.
3. Make sure GitHub Pages is enabled for the repository (Settings → Pages).
4. Open the folder URL. For a project site it usually looks like `https://USERNAME.github.io/REPOSITORY/pumpkin-smash/`. For a user/organization site, it usually looks like `https://USERNAME.github.io/pumpkin-smash/`.
5. Open the link directly on your phone and approve camera permissions when prompted.

Keep `index.html`, `styles.css`, `game.js`, `skeleton-worker.js`, and this README together. The worker file must be uploaded alongside `game.js` or AI scan cannot start. Three.js is loaded from jsDelivr; the AI scanner also downloads Transformers.js and the detector model when first used.

## Controls

- **PLAY IN AR:** attempts tracked WebXR AR; falls back to a live camera overlay if immersive AR is unavailable.
- **PLACE WORLD:** in tracked AR, aim the reticle at a clear floor/table area and tap the button to anchor the scene.
- **AI SCAN:** turns on optional camera-based skeleton recognition. If you were in tracked AR, this changes to camera-overlay mode because raw frames aren't broadly available within WebXR.
- **CAMERA:** returns to demo mode.
- **RESET:** restores the five pumpkins. While AI scan is active, it resets the skeleton-trigger state too.
- **Sound button:** enables or mutes synthesized sound effects.

## Safety

Use a clear area, stay away from roads, stairs, and obstacles, and stop moving before tapping a pumpkin. Keep awareness of your surroundings. Never play while driving or near traffic.

## Project structure

```text
pumpkin-smash/
├── index.html
├── styles.css
├── game.js
├── skeleton-worker.js
└── README.md
```

## Troubleshooting

- **3D engine fails to load:** check the internet connection and whether jsDelivr is blocked, then reload.
- **Camera permission doesn't appear:** allow camera access in the browser's site settings.
- **No PLACE WORLD reticle:** the browser/device may not support WebXR hit testing, or the camera may not be aimed at a detectable horizontal surface. Try a slow sweep across a well-lit floor or table.
- **Tracked AR does not start:** WebXR immersive AR is not available in every browser or device. Use Demo Mode or camera-overlay fallback.
- **AI scan reports `Got invalid dimensions for input: input_ids`:** this build sends one short `skeleton.` prompt. Keep all project files together and use the current build. The first scan downloads a large model; keep the tab open on a reliable connection. Older phones may also run out of memory or processing capacity.
- **AI scan previously froze the game after saying it was ready:** this version moves model loading and each detection run into `skeleton-worker.js`, so the main render loop and touch controls do not wait for ONNX inference. Make sure you upload `skeleton-worker.js` alongside `game.js`, replace the other project files too, commit, and refresh the page. The HTML includes a cache-busting version on the main module so GitHub Pages is less likely to keep running the old scanner.
- **Depth occlusion isn't visible:** depth sensing requires compatible device/browser support. Contact shadows work as a fallback.
- **Pumpkin appears in the wrong corner:** update every project file and refresh the browser cache. This version converts normalized detection boxes into image pixels before positioning the pumpkin and keeps the pumpkin aligned with the detected skeleton as long as it is reacquired.

## Skeleton tracking limits

The AI-scan mode follows the real skeleton through successive camera detections and keeps the same pumpkin across short detection gaps. This is image-space tracking, not a guaranteed physical-world anchor: if the skeleton leaves view for a long time or the player moves around it, standard camera-overlay mode cannot know the skeleton's exact 3D position. Full world anchoring requires camera pose plus reliable depth/AR tracking support on the device.
