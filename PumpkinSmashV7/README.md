# Pumpkin Smash! V7 — image-tracked AR

Pumpkin Smash! is a static, mobile-first Halloween game. MindAR Image Tracking 1.2.5 recognizes the images listed in `images/manifest.json` and anchors a Three.js pumpkin to a detected image. The game currently includes 31 image targets. Each image can score only once in a round, and a round ends after five different images have been smashed.

## Project files

- `index.html`, `game.js`, and `styles.css` — the game.
- `target-builder.html`, `target-builder.js`, and `target-builder.css` — the local in-browser image database builder.
- `images/` — original reference images and `manifest.json`, the authoritative image list.
- `targets.mind` and `target-manifest.json` — compiled database and its ordered target-index metadata. These must be rebuilt together whenever the image list or any listed image changes.
- `vendor/` — local MindAR and compatible Three.js runtime and compiler dependencies.

The app does not use a runtime CDN, backend, API key, or photo upload. Build and camera processing run in the browser.

## Run the game

1. Ensure the root `targets.mind` and `target-manifest.json` were built from the current `images/manifest.json`.
2. Serve the folder over HTTPS or localhost. For example, run `python -m http.server 8000` from this folder and open `http://localhost:8000/`.
3. Tap **Start Game**, grant camera access, and point the rear-facing camera at one of the listed reference images.
4. Tap the pumpkin on a tracked image. That image cannot score again during this round. Find four other unsmashed images to complete the five-smash round.

The game database can include more than five targets; the round goal remains five unique images. The game requires at least five valid entries in `images/manifest.json`.

## Add or remove reference images

`images/manifest.json` is the one source-of-truth list the builder reads. You do not need to edit `target-builder.js` to add or remove an image.

### Add an image

1. Copy the original photo into the `images/` folder. Supported formats are JPG/JPEG, PNG, and WEBP.
2. Give it a unique filename containing only letters, numbers, periods, underscores, or hyphens. For example: `image32.jpg`. Keep the filename's capitalization exactly the same.
3. Open `images/manifest.json` in a code editor. Add the filename to the `"images"` array, including quotation marks and a comma after the previous entry. The final entry must not have a trailing comma. For example:

   ```json
   {
     "images": [
       "image1.jpg",
       "image2.jpg",
       "image32.jpg"
     ]
   }
   ```

4. Save the JSON and check that it remains valid. Each filename must be unique, and each file must exist in `images/`.
5. Rebuild the database using the steps below. The builder loads and previews every list entry and shows errors for missing or unreadable files.

### Remove an image

1. Open `images/manifest.json` and delete the unwanted filename and its adjacent comma as needed.
2. You may also delete the unused image file from `images/`; it is not included in tracking unless it remains in the JSON list.
3. Save the JSON and rebuild the database. Do not manually delete a target from `target-manifest.json`; target indexes are generated and must match the binary database exactly.
4. Keep at least five entries in the list unless you also change the game's five-smash goal in `game.js`.

### Replace an image but keep its filename

Replace the file in `images/` with the new photo, keeping its exact filename. Rebuild the target database so the compiled features match the new image. If you change the filename too, update the corresponding list entry in `images/manifest.json`.

### Rebuild and publish

1. From this folder, start a local web server (for example, `python -m http.server 8000`) and open `http://localhost:8000/target-builder.html`. A secure HTTPS site also works.
2. Confirm every image in the list has a preview, filename, and dimensions. The build button stays disabled if any image fails to load or the list contains fewer than five images.
3. Press **Build Image Database** and leave the page open. A 31-image database can take noticeably longer and use more memory than a small database.
4. Wait for the success message. The builder verifies that MindAR compiled the expected number of targets and returned a nonempty database, then downloads `targets.mind` and `target-manifest.json`.
5. Replace both files in this project's root together. Keep every listed original image under `images/`.
6. Publish the complete `PumpkinSmashV7` folder to GitHub Pages. Open the HTTPS game URL and grant camera permission.

Target indexes use the same order as the `"images"` array. Never reorder or change that array without rebuilding and replacing both generated files. If you update the source list but forget to rebuild, the game detects the mismatch and asks you to rebuild instead of silently using wrong indexes.

## Target quality and limitations

MindAR tracks the exact flat photos; it does not recognize similar real-world objects. Sharp images with distinctive, high-contrast details are generally easier to track. Keep the whole reference image visible, steady, and well lit. This is planar image tracking, not persistent world mapping; a pumpkin disappears when its image target is lost.

The game uses the first five distinct images encountered in a round; after a target is smashed, it will not spawn that target again. Although the database includes all images in the list, players can choose any five by scanning those images during a round.

## Troubleshooting

- **Builder image failed:** verify the exact filename, capitalization, format, and path in `images/manifest.json`. Every listed file must exist in `images/`.
- **Build button disabled:** wait for all listed photos to load successfully, confirm there are at least five entries, and verify that the local compiler files under `vendor/mind-ar/` are present.
- **Compilation takes a long time:** large target lists need more CPU, memory, and build time. Keep the page open; do not reload during compilation. If the browser runs out of memory, build a smaller image list.
- **Game says to rebuild:** the generated target list and `images/manifest.json` differ. Rebuild and upload both output files together.
- **Camera error:** use HTTPS or localhost, allow camera access, and close other apps using the camera. Modern Chrome on Android and Safari on iOS are the primary targets; embedded in-app browsers may not support the required APIs.
- **An image is not recognized:** verify it was included in the last build, then improve lighting, focus, and framing. Replace low-detail or repetitive artwork with a more distinctive target if needed.

## Validation report

- Confirmed that `images/manifest.json` lists 31 unique image files and all 31 files exist.
- Confirmed the builder reads the image list dynamically rather than using a hard-coded five-image array.
- The updated 31-image database has not yet been generated. Run the target builder and replace `targets.mind` and `target-manifest.json` before publishing or playing with all 31 targets.
- Physical-device camera tracking and GitHub Pages deployment have not been tested here.
