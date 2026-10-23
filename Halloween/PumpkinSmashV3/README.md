# Pumpkin Smash! 🎃

A mobile-first Halloween AR hunt built with HTML, CSS, JavaScript, and Three.js. Find five pumpkins while bats fly overhead, zombies rise from the ground, skeletons dance, ghosts drift past, and a full moon hangs in the sky.

## Persistent skeleton-to-pumpkin tracking

On a compatible mobile WebXR AR session, **AI SCAN** attempts to use both WebXR Raw Camera Access and CPU depth sensing. The scanner analyzes a pose-synchronized camera frame, samples real-world depth around the detected skeleton, converts that camera point into the tracked AR reference space, and creates a WebXR anchor there. After a pumpkin is anchored, moving the phone should change the view of the pumpkin naturally while the pumpkin stays at the same real-world point. Re-detecting the same 3D location will not intentionally spawn duplicate pumpkins; a different skeleton can reveal another one.

This path requires all of the following:

- A secure HTTPS page (GitHub Pages provides HTTPS).
- A browser/device that can launch `immersive-ar` WebXR.
- WebXR `camera-access` so the AI can inspect camera frames during the AR session.
- WebXR CPU depth sensing so the detector's 2D location can be converted into a 3D position.
- WebXR anchors where supported. If anchors are missing, the point falls back to the XR session's tracked reference space.

**If any required camera/depth capability is missing, the game explicitly falls back to camera-overlay AI scanning.** That fallback positions the pumpkin over the screen-space center of the detected skeleton, but cannot keep it at a stable physical-world location after the skeleton leaves the camera view. In the fallback mode, browser UI (such as the Chrome address bar) usually remains visible. A successful immersive WebXR session generally takes over the screen. Browser UI alone is only a clue, not a complete compatibility test.

WebXR raw camera access and depth sensing are experimental/limited-availability features and vary by browser, version, device, and AR runtime. The project never claims persistent anchoring when those APIs are unavailable.

## AI skeleton detector

- The detector uses Transformers.js and a quantized Grounding DINO model hosted on public CDNs.
- The first run downloads about 230 MB of model weights plus support files. Use reliable Wi-Fi and keep the page open while loading.
- The worker uses the short prompt `skeleton.` to avoid an ONNX `input_ids` dimension error.
- Model loading and inference run in `skeleton-worker.js`, separate from the UI thread so the game controls and animation can keep responding.
- Frames are analyzed locally in the browser; the game does not upload them to its own server.
- Skeleton detection is experimental. Results vary with lighting, camera distance, the shape/content of the skeleton, device performance, and model accuracy.
- In camera-overlay fallback, the pumpkin is centered over the detected skeleton and follows it while detections continue. It does not have physical-world anchoring in this mode.

## Surface placement, depth, and Halloween atmosphere

- The game requests a floor reference space and horizontal hit testing. Aim at a visible floor/table and press **PLACE WORLD** when the reticle appears.
- Soft contact shadows help ground virtual objects.
- Optional depth occlusion is used only where the AR runtime exposes suitable depth features.
- Bats fly overhead, zombies rise from the ground, skeletons dance, ghosts drift, and the moon sits high in the virtual sky.
- The hint pill stays near the top of the screen in portrait and landscape layouts.

## Run locally

Camera access requires HTTPS or localhost. With Python installed, run:

```bash
cd PumpkinSmashV3
python -m http.server 8000
```

Open `http://localhost:8000`. Demo Mode works without camera permission. For actual mobile AR, test the published HTTPS page on a compatible phone.

## Publish in a GitHub Pages repository

1. Keep `index.html`, `styles.css`, `game.js`, `skeleton-worker.js`, and `README.md` together inside the `pumpkin-smash` folder.
2. Upload/replace those files in your repository, keeping the folder's location the same.
3. Commit the changes and wait for GitHub Pages to publish them.
4. Open the folder URL on your phone and allow camera access when asked.
5. Refresh the page after deploying. If the old code still appears, open the URL in a private tab or clear the site's cache.

For example, a project site's URL usually resembles `https://USERNAME.github.io/REPOSITORY/pumpkin-smash/`.

## Controls

- **PLAY IN AR:** attempts immersive WebXR. If that cannot start, the game explicitly enters camera-overlay fallback.
- **PLACE WORLD:** in tracked AR, aim at a floor/table and tap to place the Halloween scene.
- **AI SCAN:** when camera access plus CPU depth are available in WebXR, tries persistent world-tracked skeleton anchoring. Otherwise it explains the fallback and uses screen-following recognition.
- **CAMERA:** toggles back to the non-AR/demo view.
- **RESET:** resets all five pumpkins and clears existing skeleton anchors.
- **Sound button:** enables or mutes synthesized sound effects.

## Troubleshooting

- **The screen still shows the browser address bar after PLAY IN AR:** the page is probably in camera-overlay fallback. Check that the device/browser supports immersive WebXR AR and that the device's AR runtime is installed/available. The UI now says explicitly when tracked AR did not start.
- **AI scan says depth/camera access is unavailable:** this browser session did not provide both raw camera frames and CPU depth, so persistent skeleton anchoring cannot be computed. The scanner offers camera-overlay mode, which only follows a visible skeleton on-screen.
- **The skeleton is detected but no pumpkin appears in tracked AR:** the session may not provide usable depth at the detected point. The game pauses the persistent scanner and explains when you should switch modes or try a compatible device.
- **AI scan reports `Got invalid dimensions for input: input_ids`:** ensure all files were replaced, especially `skeleton-worker.js`, and hard-refresh the site. The worker uses a single short prompt (`skeleton.`).
- **AI model is slow to load:** the model download is large. Keep the tab open on a reliable connection; older phones may run short on memory or processing power.
- **Pumpkin position is wrong in camera-overlay mode:** the box drawn by the detector may be inaccurate. Improve lighting, move closer, and keep most of the skeleton in view. Screen-overlay mode cannot provide persistent physical tracking.
- **No floor reticle:** WebXR hit testing may not be available, or the camera may not see a horizontal surface. Slowly aim across a well-lit floor or table.
- **No depth occlusion:** real-world occlusion requires compatible depth sensing. The game still works with contact shadows where available.

## Project files

```text
pumpkin-smash/
├── index.html
├── styles.css
├── game.js
├── skeleton-worker.js
└── README.md
```

## Safety

Use an open, obstacle-free area. Stop walking before tapping a pumpkin, and keep awareness of nearby furniture, stairs, traffic, and other people. Never play while driving or near traffic.
