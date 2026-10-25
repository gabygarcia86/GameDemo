# Touch the Beat

A mobile-first neon rhythm game for the browser. Notes slide down four glowing lanes
(cyan, magenta, purple, lime) and you tap each lane as its note crosses the pad.
Every chart is generated **automatically from the audio** by a built-in analysis
and chart compiler. You can compile charts offline with Node.js or import songs
directly in the browser.

All graphics are procedural (Canvas 2D, CSS gradients, glow sprites baked at runtime,
particles). There are no image assets. The demo track "Neon Drive" is synthesised
in the browser with Web Audio, so the game is playable without any music files.

- **Play online:** `https://gabygarcia86.github.io/GameDemo/Random/touch_the_beat/`
- **Controls:** tap or click a lane (multitouch supported). Keyboard: <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd>,
  <kbd>1</kbd>–<kbd>4</kbd> or the arrow keys. Pause: <kbd>Esc</kbd> / <kbd>Space</kbd>.

---

## Quick start (local)

Requirements: Node.js 18+ (no npm packages needed). [ffmpeg](https://ffmpeg.org) is needed to
compile MP3/OGG/M4A/FLAC files offline. Without ffmpeg the compiler only handles WAV files.

```bash
cd Random/touch_the_beat
npm run compile        # scan assets/music and (re)build charts + library
npm start              # dev server on http://localhost:8080 (prints a LAN URL for your phone)
npm test               # analyser, chart generator and judgement self-test
```

ES modules don't load from `file://`, so always open the game through a web server
(`npm start`, GitHub Pages, or any static server).

## Adding songs

### A. Offline compiler (recommended for the shipped library)

1. Drop audio files into **`assets/music/`** (sub-folders are fine). Name them
   `Artist - Title.mp3`; the part before ` - ` becomes the artist and the rest the title.
2. Run `npm run compile`. The compiler:
   - decodes each file (ffmpeg, or the built-in WAV decoder),
   - analyses it (see *Audio analysis* below),
   - writes `public/charts/<songId>/{easy,normal,hard}.json`,
   - writes the manifest `public/metadata/library.json` that the game loads.
3. Commit and push. Unchanged songs are skipped (content and settings hash), so re-running
   after adding files only compiles the new ones. Charts of removed files are deleted.

Useful options (`npm run compile -- --help` lists them all):

| Option | Meaning |
| --- | --- |
| `--force` | recompile everything |
| `--only "<text>"` | only songs whose file name contains the text |
| `--density 1.2` | more (or fewer, <1) notes |
| `--sensitivity 1.3` | detect quieter onsets |
| `--bpm 172` | tempo hint (searches ±4 % around it) |
| `--offset -20` | chart offset in ms |
| `--seed 3` | different (still deterministic) lane patterns |
| `--copy-audio` | copy audio into `public/audio/` instead of referencing `assets/music/` |
| `--watch` | stay running and recompile when the folder changes |
| `--songs <dir>` / `--out <dir>` | other input / output folders |

Per-song overrides go in `songs.config.json` (copy `songs.config.example.json`), keyed by file name:

```json
{ "NSYNC - Bye Bye Bye.mp3": { "bpm": 172, "density": 0.9, "offsetMs": -10 } }
```

### B. In-browser import (any device, no tools)

In the **Song Library** press **Import Songs** and pick one or more audio files.
They're decoded by the browser's own decoders, analysed locally, and saved in
**IndexedDB**. Nothing is uploaded. The import dialog shows which formats the
current browser reports it can play.

Imported songs only exist **on that device and browser**. To move them, use
**Export charts** (downloads a `.ttb.json` bundle). On the other device, select the
audio file *and* the bundle together in the import dialog, and the exported charts are
used as they are.

A browser page can't scan folders on your computer by itself. That's why the
folder workflow uses the Node compiler.

### Recompiling

**Recompile…** on any song re-runs the analysis in the browser with adjustable settings:
density, onset sensitivity, tempo hint (with ½× / 2× buttons), meter, chart offset, pattern
seed, holds and chords. The result is stored on the device. **Reset to default** restores the
shipped chart.

---

## Project structure

```
touch_the_beat/
  index.html                 screens + dialogs (DOM UI over a full-screen canvas)
  styles/main.css            neon UI, safe-area insets, transitions
  src/
    main.js                  app bootstrap and screen flow
    config.js                lanes, keys, judgement windows, scoring, grades, defaults
    game/       Game.js (session/state machine), GameLoop.js (rAF), InputManager.js
                (pointer/keyboard), NoteManager.js, JudgementSystem.js, ScoreManager.js
    audio/      AudioEngine.js (Web Audio clock/playback), AudioAnalyzer.js, fft.js,
                TimingCalibration.js, Sfx.js (synth SFX), DemoComposition.js + DemoSong.js
    charts/     BeatMap.js (format), ChartGenerator.js, DifficultyGenerator.js,
                ChartValidator.js, Random.js (seeded PRNG)
    library/    SongLibrary.js, BrowserSongImporter.js, IndexedDBStore.js, songMeta.js
    rendering/  NeonRenderer.js, ParticleSystem.js, BackgroundEffects.js
    ui/         UIManager, MainMenu, SongSelect, ResultsScreen, SettingsScreen,
                CalibrationScreen, PauseMenu, LoadingScreen
    util/       Settings.js (localStorage settings + best scores), dom.js
  tools/
    compile-songs.js         offline scanner/compiler
    lib/decode-audio.js      ffmpeg + WAV decoding
    serve.js                 static dev server with HTTP Range support
    selftest.js              npm test
  assets/music/              your songs (input of the compiler)
  public/charts/             generated beat maps
  public/metadata/library.json  generated song manifest
```

The analysis and chart modules are plain ES modules with no DOM access. The Node compiler
and the browser run the **same code**.

---

## Audio analysis

`src/audio/AudioAnalyzer.js` is a set of classic music-information-retrieval heuristics. It
doesn't "understand" music, and every stage reports a confidence score.

1. **Decode** and mix to mono for analysis (playback keeps the original audio), resampled to 22.05 kHz.
2. **STFT** (1024-point Hann, hop 256 ≈ 11.6 ms): log-magnitude **spectral flux** in four bands
   (30–160 Hz, 160–600 Hz, 600–2500 Hz, 2.5–10 kHz), RMS energy and a 12-bin chroma.
3. **Onset detection function**: band-normalised, weighted flux. Onsets are picked as local
   maxima above an adaptive moving-average threshold, refined with parabolic interpolation.
   The self-test measures ~1–2 ms mean error on synthetic drums.
4. **Tempo**: autocorrelation of the high-passed, smoothed onset envelope. Lags are scored with
   their double-period harmonic and a log-tempo prior centred at 120 BPM. Tempo *octave* errors
   (e.g. 86 vs 172 BPM) can happen and are mostly harmless for charting; use the ½× / 2× hint.
5. **Beat tracking**: dynamic programming over the onset envelope (Ellis 2007), with beats
   snapped to coincident strong onsets.
6. **Meter and downbeats**: bass accents plus harmonic change (chroma distance) per beat phase,
   choosing 4/4 or 3/4.
7. **Sections**: 4-bar phrase loudness, merged into sections of similar energy.
8. **Quantisation**: onsets snap to beat / ⅛ / 1/16 / triplet grid points only when they're within
   a tempo-relative tolerance (≤ 45 ms). Other onsets keep their real time (off-grid level).
9. **Confidence**: tempo peak salience, beat alignment, grid fit and downbeat contrast.

## Chart generation

`ChartGenerator.js` with rules from `DifficultyGenerator.js`:

- **Candidates** = onsets + implied pulses on tracked beats. Each one has a strength,
  grid level and spectral brightness.
- **Priority** = global/local strength × grid-level weight × section energy. A greedy pass
  enforces a tempo-aware **minimum spacing** until the difficulty's target density is reached.
  Long audible gaps are then filled.
- **Easy**: downbeats and beats, about 1.2 notes/s, rare 2-note chords.
  **Normal**: adds eighths, about 2.2 notes/s, occasional chords.
  **Hard**: sixteenths, triplets and strong off-grid accents, about 3.7 notes/s, up to 3-note chords.
- **Holds** appear only where the loudness envelope stays steady through a long gap.
  Their length is quantised to half beats.
- **Lanes**: spectral brightness sets a preferred lane region, mirrored per phrase so bass doesn't
  always land on lane 1. Movement patterns (stairs and steps), jack avoidance, lane balancing,
  anti-trill rules and seeded noise shape the rest. Output is deterministic for the same song and settings.
- **Validation** removes out-of-range notes, same-lane overlaps and chords above 3 notes, and
  reports statistics and warnings.

## Beat-map format (version 1)

```json
{
  "version": 1,
  "songId": "nsync-bye-bye-bye",
  "title": "Bye Bye Bye",
  "artist": "NSYNC",
  "duration": 200.43,
  "bpm": 86.33,
  "offset": 0.0,
  "difficulty": "normal",
  "beatsPerBar": 4,
  "beats": [0.41, 1.11, 1.80],
  "downbeat": 0,
  "sections": [{ "start": 0, "end": 22.6, "energy": 0.62 }],
  "notes": [
    { "time": 1.25, "lane": 0, "type": "tap",  "duration": 0,   "confidence": 0.92 },
    { "time": 1.75, "lane": 2, "type": "hold", "duration": 0.7, "confidence": 0.86 },
    { "time": 2.40, "lane": 1, "type": "tap",  "duration": 0,   "confidence": 0.9 },
    { "time": 2.40, "lane": 3, "type": "tap",  "duration": 0,   "confidence": 0.9 }
  ],
  "confidence": { "overall": 0.86, "tempo": 1, "beat": 0.53, "downbeat": 0.82, "grid": 1 },
  "generator": { "name": "touch-the-beat-chartgen", "version": "1.0.0", "settings": {} },
  "stats": { "noteCount": 395, "chordCount": 19, "holdCount": 22, "nps": 2.11 }
}
```

- All times are seconds from the start of the audio. `offset` is added to every note at load time.
- **Chords**: the canonical representation is *separate notes with an identical `time`* (rounded
  to the millisecond) in different lanes, like the two notes at 2.40 above.
- `lane` is 0–3 (cyan, magenta, purple, lime). `type` is `tap` or `hold`, and `duration` is the hold length in seconds.
- Notes are sorted by time, then lane.

---

## Timing model

- `AudioContext.currentTime` is the only rhythm clock. The song buffer is scheduled with
  `source.start(when)`. Song time = context time − start time − reported output latency −
  your *audio offset* setting. Between audio callbacks the clock is extrapolated with
  `performance.now()` (clamped and monotonic), so there's no `setInterval` and no drift build-up.
- Notes are drawn from their hit time: `progress = 1 − (noteTime − now) / approachTime`.
  The approach time comes from the note-speed setting.
- Taps are judged at the **event timestamp** (`PointerEvent.timeStamp`), not at frame time.
- **Pause** stops the source and remembers the position. **Resume** restarts from there after a
  1.6 s lead-in on the same clock, so the next notes approach again before play continues.
  The game auto-pauses when the tab is hidden.
- **Calibration** (Settings → *Calibrate with tap test*) plays a metronome and measures the median
  tap offset to recommend an audio offset. The *visual offset* only shifts rendering.

Judgement windows (configurable in `src/config.js`, with a Strict / Standard / Lenient preset in Settings):
PERFECT ±45 ms, GREAT ±90 ms, GOOD ±150 ms. Anything later is a MISS. Early taps outside the
window are ignored (no penalty). Each note is judged exactly once. Holds must be held to their
end (120 ms release tolerance), or they "DROP" and break the combo.

Scoring: 300 / 200 / 100 points × multiplier (×2 at 10 combo, ×3 at 25, ×4 at 50), plus hold
sustain points. Accuracy weights PERFECT 100 %, GREAT 70 %, GOOD 40 %. Grades are S+ (≥ 98 %
and full combo), S ≥ 95, A ≥ 90, B ≥ 80, C ≥ 70, D. All of this is in `SCORING` in `src/config.js`.

## Performance

- Glow is baked into sprites when the screen is resized, and `shadowBlur` is never used per note.
  Gradients and layout are cached, and particles use typed-array pools.
- Notes are allocated once per chart and reset in place on restart, and per-lane cursors keep
  lookups cheap.
- Only one decoded song is held in memory. The library is metadata only, previews stream through
  an `<audio>` element, and buffers are dropped when another song loads.
- **Quality**: High / Medium / Low, or Auto. Auto starts at Medium on touch devices and steps down
  if gameplay stays under ~47 fps. Low caps the pixel ratio at 1 and draws no glow,
  no stars and no additive blending. **Reduced motion** removes shake and softens flashes.

---

## Deploying to GitHub Pages

This folder lives inside the `GameDemo` repository, which is already published from the
repository root (Settings → Pages → *Deploy from a branch*, `main`, `/ (root)`).

1. `npm run compile` so `public/` matches `assets/music/`.
2. Commit `index.html`, `styles/`, `src/`, `public/` and `assets/music/`, then push.
3. After the Pages action finishes, the game is at
   `https://<user>.github.io/GameDemo/Random/touch_the_beat/`.

All paths are relative, so the folder also works on its own (its own repository or any static host).
GitHub rejects files over 100 MB, and a Pages site should stay under about 1 GB.
The current library is ~28 MB of audio plus ~2 MB of charts.

> **Music rights:** the files in `assets/music/` are commercial recordings. Publishing them on a
> public site is a copyright decision for the repository owner. For a public deployment,
> consider shipping only music you have rights to and letting players import their own songs
> in the browser.

## Testing

- `npm test` checks tempo and onset accuracy on synthetic drum loops, deterministic charts,
  density ordering, lane balance, no overlaps, the demo charts, and judgement/scoring rules
  (taps, chords, misses, hold complete/drop).
- Manual checklist: play the demo with the keyboard on desktop, then on a phone via the LAN URL
  from `npm start`. Try four-finger chords, holds, pause/resume, rotating the phone,
  switching apps mid-song, import, and recompile.
- Judgement windows are starting values. Tune them in `src/config.js` after testing on real devices.

## Troubleshooting

**"Built-in song list could not be loaded"** — the page was opened from `file://`, or
`public/metadata/library.json` is missing. Use `npm start`, and run `npm run compile`.

**Compiler: "ffmpeg was not found"** — install ffmpeg (Windows: `winget install ffmpeg`;
macOS: `brew install ffmpeg`; Linux: your package manager) or set `FFMPEG_PATH`. WAV files
work without it.

**Unsupported format / decoding failed** — browsers differ: MP3, AAC/M4A and WAV work almost
everywhere; OGG/Opus may fail on older iOS Safari; FLAC on some older browsers. The import
dialog lists what your browser reports. Songs the browser can't play get an *unsupported* tag.
Convert with `ffmpeg -i song.flac -b:a 192k song.mp3`. Damaged or DRM-protected files can't
be decoded.

**Notes feel twice as fast or slow** — a tempo octave error. Use *Recompile…* → ½× or 2×,
or `--bpm` / `songs.config.json` for the compiler.

**Notes consistently early or late** — run the calibration in Settings. Bluetooth headphones
often need +150–250 ms. If only one song is off, adjust its *chart offset* in *Recompile…*.
The results screen also tells you your average early/late error.

**Too many or too few notes, chart feels random** — lower or raise *density*. For quiet,
acoustic or ambient songs raise *sensitivity*. A low confidence score (shown in the library)
means the song has weak or irregular percussion, like rubato ballads, and automatic charts
will be less musical. Try a tempo hint and a different seed.

**Audio doesn't start on a phone** — mobile browsers only allow audio after a tap. Tap
*Play* again, and check the silent switch on iPhones.

**Stutter on older phones** — set *Visual effects quality* to Low and turn on Reduced motion.
