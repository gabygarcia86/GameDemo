# Test report: Pumpkin Smash!

Legend: **PASS-auto** = passed in an automated headless-Chromium run. **PASS-review** = checked by reading the code or
files only (not run in a browser). **FAIL** = tested and does not work. **NOT TESTED** = could not be tested here.

## How the tests were done (and what they cannot show)

* Chromium (headless, software WebGL) with a **fake webcam** that loops a video of a flat picture of your photos at known
  positions. For every clip the true position of the photo's centre is known, so the pumpkin's on-screen position is
  compared with ground truth.
* This proves the tracking, placement maths, game logic and error handling. It does **not** prove behaviour on a physical
  phone: real cameras add noise, glare, blur and auto-exposure, none of which are in the clips. Speeds (fps, time to first
  detection) from the software renderer say nothing about real devices.
* Total: builder 18/18, game 82/83. The single failure is image 2.

## Start of work: what was already in the folder

When your two library packages arrived, the project folder already contained a substantially complete implementation
(engine, game, builder, tests, a compiled `targets.mind`) that I did not write during this conversation and cannot account
for. I therefore treated all of it as unverified and checked it instead of trusting it:

* `vendor/three` and `vendor/mindar` are **byte-identical** to the `three-0.186.1.tgz` and `mind-ar-1.2.5.tgz` you sent (checked with `cmp`).
* `targets.mind` was **rebuilt from your three photos with the builder and is byte-identical** (same SHA-256 `42da8736…`).
* All source files were read in full before testing. Two small fixes were made (see "Defects found").

## Results by acceptance criterion

### Target assets
| Criterion | Result |
|---|---|
| All three supplied images included at the expected paths | PASS-auto (builder loads all three from `images/`; 1152x2048 each) |
| All three loaded into the database | PASS-auto (database holds 3 targets, verified by reading it back) |
| Target indexes map to the correct images | PASS-auto (clips of image 1/3 were hosted on target index 0/2) |
| Missing assets give a useful error | PASS-auto (missing `targets.mind` → TARGETS_MISSING; builder flags a 404 image on its own card) |

### Tracking
| Criterion | Result |
|---|---|
| Recognised image → pumpkin at the photo's centre | **PASS-auto for images 1 and 3.** Tracked centre within 0.7–5.2 px of truth (1280x720). **FAIL for image 2** (see below) |
| Pumpkin attached to target transform, not screen coordinates | PASS-review (anchor from MindAR pose, no viewport maths) + PASS-auto (follows rotated/tilted/moving clips) |
| Camera movement/rotation updates the pose | PASS-auto, on synthetic clips: 28° rotation 0.7 px error; perspective tilt 5.2 px; sweeping+swaying clip mean 2.8 px / worst 25 px off the true path in one run, 5.7 px / 40 px in a second run (run-to-run variation) |
| Losing the target hides the pumpkin | PASS-auto (pumpkin removed, banner and status updated, pumpkin returns when image reappears) |
| No pumpkin when no target is detected | PASS-auto (blank scene for 8 s, state stays "scanning") |
| Rotation/perspective does not cause arbitrary placement | PASS-auto (not at a screen corner; centre within tolerance) |
| Portrait phone layout maps correctly | PASS-auto: predicted centre (74.9, 438.9) vs tracked (75.4, 439.6) on a 390x844 screen |
| Dependency error taxonomy | PASS-auto for DEPENDENCY, CAMERA_DENIED, CAMERA_UNAVAILABLE, CAMERA_INIT, TARGETS_MISSING, TARGETS_INVALID. **TRACKER_INIT and GRAPHICS screens NOT TESTED** (hard to trigger) |

### Target builder
| Criterion | Result |
|---|---|
| Scrolls vertically on mobile and desktop | PASS-auto (390 px and 1100 px viewports, no horizontal overflow) |
| All three images preview | PASS-auto |
| Progress is real | PASS-auto (8, 28, 50, 67, 83, 100 seen) |
| Failed library request gives no false success | PASS-auto (blocked compiler → error shown, Build disabled, no results) |
| Successful build makes valid output | PASS-auto (non-empty file, re-read and verified, manifest matches) |
| Output destinations explained | PASS-review (on the page and in README) |

### Runtime and deployment
| Criterion | Result |
|---|---|
| No null import-map error | PASS-auto + PASS-review: there is no import map; libraries are relative ES-module imports |
| Relative paths work in a sub-folder | PASS-auto (served from `/pumpkin-smash/`) |
| Case-sensitive filenames | PASS-auto (served from a case-sensitive file system; mixed-case vendor filenames load) |
| Runs on the published GitHub Pages URL | **NOT TESTED** (this environment cannot publish) |
| No external requests / no upload | PASS-auto (14 requests in a full session, all same-origin) |
| Camera permission handling | PASS-auto for denied/none/busy (simulated errors); real prompt on a phone NOT TESTED |
| Portrait and landscape | PASS-auto for layout (both viewports); live orientation change on a device NOT TESTED |
| Restart does not create extra cameras or loops | PASS-auto (Play Again: 1 camera request, 1 canvas; Exit stops all tracks; Start after Exit: exactly 1 new request) |
| Camera stops when exiting | PASS-auto (0 live tracks after Exit) |
| Switching away from the page and back | **NOT TESTED** (implemented in `game.js`) |

### Gameplay
| Criterion | Result |
|---|---|
| No Demo Mode | PASS-review (searched: none) |
| Only a tap on the rendered pumpkin smashes it | PASS-auto (empty-space tap and tap beside pumpkin do nothing) |
| Score increments exactly once per smash | PASS-auto (double tap → 1 point) |
| Game ends after five smashes | PASS-auto |
| Restart works | PASS-auto (score resets to 0) |
| Next pumpkin waits for the animation | PASS-auto |
| Several images visible at once (deterministic choice) | **NOT TESTED** (logic reviewed: next visible index after the previous host; one tracked image at a time by default) |
| Sound | NOT TESTED (synthesised in code, audio output cannot be heard here) |
| Smash particle effect appearance | NOT TESTED visually (animation runs; no screenshot taken mid-burst) |

## FAIL: image 2 is not detected

Image 2 (play ball on a tile floor) was **never detected**: 0 detections in 120 s in the test run and in two 60–90 s probes,
at normal distance and with the camera held close so the ball fills the view. Images 1 and 3 lock on within seconds in the
same setup. The builder's feature heuristic rated image 2 "good", so that rating is not a reliable predictor.

Likely reason (not proven): the only distinctive content is the ball, about a tenth of the frame, in front of a plain wall and
repeating floor tiles. A **ball-only crop** of the same photo compiled and was detected (first detection ~7 s, 95/104 samples).
That drop-in was later removed from the project as no longer needed.

## Defects found and fixed during testing
1. A black rectangle (the idle `<video>`) showed at the top-left of the start screen. Fixed in `styles.css` / `engine.js`; verified by screenshot and a re-run of the restart tests (20/20).
2. The builder's label for image 2 described it wrongly; corrected (label text only; database unchanged).

## Not verified at all
Physical phones, Android Chrome, iOS Safari, a printed or on-screen photo under real lighting, real hand motion, GitHub
Pages itself, sound, and battery/thermal behaviour. Please test on your phone and tell me what you see.
