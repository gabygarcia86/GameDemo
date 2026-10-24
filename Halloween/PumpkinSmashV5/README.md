# Pumpkin Smash!

A camera-based Halloween game for phones and desktops. Point the camera at one of the 51 reference photographs and a 3D
pumpkin appears on the photo, locked to its position, rotation and perspective. Tap it to smash it. Smash five to win.

- Image tracking: [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 (image target tracker, runs in the browser)
- Rendering: [Three.js](https://threejs.org) r186
- Static site. No server, API key, database or build step at runtime. Nothing is uploaded: camera frames are processed on the device.
- Both libraries are stored **inside the project** (`vendor/`), so there is no CDN and no import map to break.

## What you need to know first

|                                  |                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What you point the camera at** | The reference photographs in `images/` themselves, shown on another screen or printed. The game recognises _those pictures_, not similar real-world scenes. |
| **Image 2 does not track**       | The full photo of the play ball on the tile floor is not detected (see "Known limitations"). Images 1 and 3 work.                                    |
| **Some photos need a straight view** | In simulated tests every photo except image 2 is found straight on; a few need the phone close and square-on (see `images/README.md`). |
| **Tested on a real phone?**      | **No.** Everything was tested in headless Chromium with a fake webcam. See `TEST-REPORT.md`.                                                         |

## Run it

Camera access needs **HTTPS** (or `localhost`). Opening `index.html` by double-clicking will not work.

Local test: from the folder _above_ `PumpkinSmashV5/`:

```
python -m http.server 8123
```

then open `http://localhost:8123/PumpkinSmashV5/index.html` (Windows: use `python`, or `py -m http.server 8123`).

## Publish on GitHub Pages

1. Create a GitHub repository and upload the **contents** of this folder (everything, including `vendor/`, `images/`, `targets.mind`, `target-manifest.json`).
2. Repository **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Wait about a minute, then open `https://<your-name>.github.io/<repo-name>/` on your phone.

All paths in the code are relative, so the repository sub-folder (`/<repo-name>/`) is fine. Filenames are case-sensitive on GitHub Pages; keep them exactly as they are.

## Files

```
index.html  styles.css  game.js  engine.js  pumpkin.js  config.js   the game
creatures.js  orientation.js                                        the bats and ghosts, kept in place by the motion sensors
targets.mind  target-manifest.json                                  the compiled image database (51 targets)
images/image1.jpg … image51.jpg  manifest.json                      your original photos + the target order
vendor/three, vendor/mindar                                         the libraries (checksums in vendor/CHECKSUMS.txt)
target-builder.html  builder.js  builder.css                        rebuilds the database in your browser
tests/                                                              automated browser tests
```

`targets.mind` and `target-manifest.json` **must always be uploaded together**. The game checks that they match and shows
"Image database is not usable" if they do not.

`imageN.jpg` is always target index N-1 (image 1 is index 0).

## Settings

`config.js` holds the tunables: `smashesToWin` (5), `pumpkinScale` (0.275 = pumpkin diameter is 27.5% of the photo's shorter side;
keep it between 0.20 and 0.30), `surfaceGap`, tap forgiveness, tracking filters, camera resolution, and:

- `smoothing`: how steady the pumpkin is. Small, jitter-sized pose changes are eased in slowly (`stillRate`); real camera
  motion is followed quickly (`moveRate`). Lower `stillRate` = steadier but slower to settle. Set `smoothing: null` for the raw tracker pose.
- `creatures`: the number of bats (5: they circle overhead while you scan, and fly up and away when a pumpkin appears) and
  ghosts (3: they float at eye level all around you, fading in and out), or `enabled: false` to turn them off. They are
  decoration only: taps go straight through them.

## How placement works

MindAR reports a 4x4 pose matrix for each detected photo. `engine.js` multiplies it by a fixed transform that moves the origin
from the photo's bottom-left corner to its **centre** and scales so 1 unit = the photo's width. The pumpkin is a child of that
anchor at local (0, 0, +radius), so it sits at the middle of the photo, just in front of it, and inherits every rotation and
perspective change. Nothing is positioned from screen coordinates. Each frame the drawn pose eases toward the tracker's
latest pose (see `smoothing` above), which removes most of the tracker's jitter. When the tracker reports the photo lost, the anchor is
hidden, the pumpkin is removed, and the player is told to find a photo.

The bats and ghosts are placed in the room around the player: bats circle 8–35° above the horizon (look up to see more of
them), ghosts float at about eye level in every direction. The phone's motion sensors (`orientation.js`) keep them in place
as the phone turns or tilts. Browsers only report the phone's rotation, not its position, so stepping around does not
change your angle to them; they are kept a few metres' worth away so this is hard to notice. On iOS the game asks for
motion-sensor permission when Start is tapped. Without sensors (desktop, or permission denied) they still fly, but the
view does not follow the phone.

## Add or replace reference photos

1. Put the photo in `images/` (any name, JPG/PNG).
2. Edit `images/manifest.json`: the **order of the list is the target index**.
3. Open `target-builder.html` through your web server (same URL scheme as the game). All photos preview; click **Build Image Database**.
4. When it says "Database built and verified", download both files and replace `targets.mind` and `target-manifest.json` in the **project root**. Upload both.
5. Hard-refresh the game (phones can cache the old database).

Photo advice: high contrast, lots of fine detail spread across the whole picture, no large blank or repeating areas, not
glossy/reflective. The builder prints a feature count and rating per photo, but the rating is only a rough guess (it rated image 2 "good" and it fails in practice), so always test.

## Troubleshooting

The game shows a different message for each failure and a Try Again button:

| Message (code)                                                                | Meaning / fix                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The game files did not load (`DEPENDENCY`)                                    | A script failed to download. Check the connection; if self-hosting, make sure `vendor/` was uploaded and filenames match exactly. |
| Camera access is blocked (`CAMERA_DENIED`)                                    | Allow the camera for the site in browser settings, then Try Again.                                                                |
| No usable camera (`CAMERA_UNAVAILABLE`)                                       | No camera, an unsupported browser, or the page is not HTTPS.                                                                      |
| The camera would not start (`CAMERA_INIT`)                                    | Another app or tab is using the camera.                                                                                           |
| Image database not found / not usable (`TARGETS_MISSING` / `TARGETS_INVALID`) | `targets.mind` and `target-manifest.json` are missing, damaged, out of sync, or cached. Re-upload both or rebuild.                |
| Image tracking could not start (`TRACKER_INIT`)                               | The device could not run the tracker (needs WebGL + Web Workers). Try recent Chrome (Android) or Safari (iOS).                    |

"Searching for a reference image…" means the camera works but no target is recognised. That is not an error. Hold the phone
steady, fill much of the screen with the photo, avoid glare, and make sure the room is lit.

Add `?debug=1` to the URL for a live status panel (tracking state, pumpkin screen position, fps).

## Known limitations

- **Image 2 (full photo) is not detected** by the tracker. Tested at normal distance and with the camera held close. A crop tightly around the ball was detected in a test, so a closer photo of the ball is the likely fix.
- **Image 1 is a "fair" target** (large flat dark areas): expect slower lock-on and occasional loss.
- **Planar tracking only.** It tracks flat pictures; it is not world mapping and will not recognise the real yard decorations, furniture or rooms.
- **Not tested on physical phones, iOS Safari, or with a printed photo.** Real cameras add noise, glare and motion blur that the test clips do not.
- A phone showing the photo on its own screen can have glare/moire; printing the photos (matte) usually tracks better.
- **First detection takes a moment** while the tracker warms up. Speed varies a lot by device.
- iOS requires Safari (or another browser using WebKit's camera access) and HTTPS.
- When the page goes into the background the game releases the camera and restarts it on return. This is implemented but **was not tested**.

## Re-running the tests

Requires Node 18+, Playwright with Chromium, Python 3 with Pillow and numpy, and ffmpeg.

```
python3 tests/make-test-videos.py images clips          # synthetic webcam clips with known geometry
node tests/builder.test.mjs --base=http://127.0.0.1:8123/pumpkin-smash
node tests/game.test.mjs   --base=http://127.0.0.1:8123/pumpkin-smash --clips=clips
node tests/game.test.mjs   --base=http://127.0.0.1:8123/pumpkin-smash --clips=clips --only=all --variant=straight
node tests/game.test.mjs   --base=http://127.0.0.1:8123/pumpkin-smash --clips=clips --only=all --variant=hard
```

The builder test reads `images/manifest.json` and checks every listed photo, and that a fresh build matches the committed
`targets.mind`. `--only=all` tries every photo in the manifest one at a time (`--images=4,9` for a subset): `straight` shows
the photo upright and centred, `hard` shows it smaller, rotated and tilted. Set `FFMPEG=<path>` if ffmpeg is not on PATH.

On Windows, Python's `http.server` can drop connections under the test load (`ERR_CONNECTION_RESET`, then a `DEPENDENCY`
error). Any other static server works.

## Licences

Three.js (MIT) and MindAR (MIT) are included unmodified under `vendor/` with their licences. The photographs are yours.
