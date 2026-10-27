# Sounds and music: how to change them

Every theme in Stack Attack has its own music and sound effects. Nothing is downloaded: the game builds every note itself from a short description in **one file**:

```
audio/
├── audio-config.js   ← edit this: music and sounds for every theme
├── audio-engine.js   ← the synthesizer (no need to touch it)
├── README.md         ← this guide
└── files/            ← put your own .mp3 / .ogg / .wav files here (optional)
```

You can change the sound in two ways:

1. **Edit the built-in music.** Change tempo, notes, drums or instruments in `audio-config.js`. Small text edits, no audio software needed.
2. **Use your own audio files.** Drop an MP3 into `audio/files/` and add one line to the config.

After saving, reload the page. Browsers only play sound after you click or press a key, so click once to hear it.

> **Tip:** open the browser's developer console (F12). If you mistype something in `audio-config.js`, the game prints a plain-English warning there, such as `halloween.music.parts.bass: unknown pattern character(s) "x"`, and keeps running.

---

## Quick recipes

### Make a theme's music faster, slower, louder or quieter

Find the theme in `audio-config.js` and change `bpm` (tempo) or `volume`:

```js
western: {
  music: {
    bpm: 120,          // try 100 for slower, 140 for faster
    volume: 1.35,      // 1 = normal, 0.5 = half as loud
    ...
```

Players also have **Music volume**, **Sound effects volume** and a mute button (or the **M** key), so you only need `volume` to balance one theme against the others.

### Change the melody

Music is written as **patterns**: one character per step, 16 steps per bar (four beats, each split in four).

```js
lead: { follow: 'key', wave: 'triangle', octave: 5, volume: 0.16,
  pattern: '5.6. 8.6. 5-3. 1... | 3.5. 6.5. 3--- ....' },
```

| Character | Meaning |
| --------- | ------- |
| `1`–`9`   | Play a note. `1` is the home note, `2` the next note up the scale, and so on. `8` is the home note one octave up |
| `A`–`F`   | Even higher notes (10–15 steps up) |
| `-`       | Keep holding the previous note |
| `.`       | Silence |
| space, `\|` | Ignored. Use them to show beats and bars |

So `5-3. 1...` means: play note 5 for two steps, note 3 for one step, a rest, then note 1 followed by three steps of silence.

The notes always come from the theme's **key** and **scale**, so random digits still sound in tune. For example, `scale: 'minor'` sounds sad and `'major'` sounds happy. Experiment freely.

A pattern can be any length. A 64-step pattern spans four bars and then repeats.

### Change the drums

```js
drums: {
  kick:  'x...x...x...x...',   // x = hit, X = loud hit, . = rest
  snare: '....x.......x...',
  hat:   { pattern: '..x...x...x...x.', volume: 0.5, pitch: 1.2 },
},
```

Available drums: `kick`, `snare`, `hat`, `clap`, `tom`, `taiko` (big Japanese drum), `wood` (woodblock / clip-clop), `bell` (sleigh bells), `shaker`. Delete a line to remove that drum.

### Change one sound effect

Each theme can override any of the game's sound effects in `sfx.overrides`. A sound is a list of short notes:

```js
sfx: {
  wave: 'sine', octave: 6,
  overrides: {
    // a two-note "ding-dong" when a piece locks
    lock: [
      { deg: 5, dur: 0.08, vol: 0.3 },
      { deg: 1, at: 0.09, dur: 0.15, vol: 0.3 },
    ],
    // use a drum sound instead
    move: [{ drum: 'wood', vol: 0.4 }],
  },
},
```

Events you can override:

| Event | When it plays |
| ----- | ------------- |
| `move` | A piece moves left or right |
| `rotate` | A piece rotates |
| `hold` | The hold button swaps a piece |
| `hardDrop` | Hard drop (Space / DROP) |
| `lock` | A piece lands and locks |
| `clear1` `clear2` `clear3` `clear4` | 1, 2, 3 or 4 lines cleared |
| `levelUp` | Level increases |
| `gameOver` | The stack tops out |
| `denied` | Hold pressed when it isn't allowed |
| `start` | A new game starts |
| `pause` | Pause or resume |
| `select` | A theme is picked, or the effects volume is changed |

Any event a theme doesn't override uses a built-in sound in that theme's key and instrument.

Note options:

| Option | Meaning | Example |
| ------ | ------- | ------- |
| `deg` | Note as a scale step (like the pattern digits) | `deg: 5` |
| `freq` | Exact pitch in Hz instead of `deg` | `freq: 440` |
| `oct` | Shift octaves up or down | `oct: -1` |
| `at` | Start time in seconds | `at: 0.1` |
| `dur` | Length in seconds | `dur: 0.2` |
| `vol` | Loudness 0–1 | `vol: 0.3` |
| `wave` | Instrument tone (see below) | `wave: 'square'` |
| `slide` | Pitch bend over the note (2 = up an octave, 0.5 = down one) | `slide: 1.5` |
| `vibrato` | Wobble, in cents | `vibrato: 30` |
| `filter` | Darker sound (lower number = darker) | `filter: 1200` |
| `drum` | Play a drum instead of a note | `drum: 'taiko'` |
| `noise` | A burst of noise (whoosh, splash) | `noise: true, filter: 900, filterType: 'lowpass'` |

### Use your own music or sound files

1. Copy the file into `audio/files/`, for example `audio/files/spooky-loop.mp3`.
2. Add a `files` block to the theme in `audio-config.js`:

```js
halloween: {
  music: { ... },             // still used as a backup if the file is missing
  sfx: { ... },
  files: {
    music: 'audio/files/spooky-loop.mp3',   // loops during play
    clear4: 'audio/files/evil-laugh.wav',   // any event name from the table above
    gameOver: 'audio/files/scream.mp3',
  },
  fileVolume: 0.8,            // optional: scales all of this theme's files (0–1)
},
```

- Paths are relative to `index.html`.
- MP3 works everywhere. Make music loops seamless and keep effects short.
- If a file can't be found, the console says so and that sound falls back to the built-in synth. The game never goes silent because of a typo.
- Only use audio you made yourself or are licensed to use.

To go back to the built-in sound, delete the line (or the whole `files` block).

### Give a new theme its own music

1. Copy a whole theme entry in `audio-config.js` (for example `easter: { ... },`).
2. Rename it to the new theme's id, exactly as used in `game.js` and `themes.css` (see the main [README](../README.md#adding-a-theme)).
3. Change `key`, `scale`, `bpm`, the patterns and the drums.

A theme with no entry still works: it plays the default sound effects and no music, and the console mentions it.

---

## Reference

### Music settings

| Setting | Meaning | Default |
| ------- | ------- | ------- |
| `bpm` | Tempo in beats per minute | 120 |
| `key` | Home note: `C`, `C#`/`Db`, `D`, `D#`/`Eb`, `E`, `F`, `F#`/`Gb`, `G`, `G#`/`Ab`, `A`, `A#`/`Bb`, `B` | `C` |
| `scale` | Note set (see below) | `major` |
| `progression` | Chord for each bar, as scale steps. `[1, 6, 4, 5]` is a very common pop progression | `[1]` |
| `stepsPerBar` | 16 for normal 4/4 time, 12 for a waltz | 16 |
| `swing` | 0 = straight, 0.1–0.3 = bouncy shuffle | 0 |
| `gate` | How long notes last within their step (0–1) | 0.85 |
| `volume` | This theme's music loudness | 1 |
| `levelSpeedup` | Tempo increase per game level (0.015 = +1.5%, max +30%) | 0.015 |

### Scales

| Scale | Mood |
| ----- | ---- |
| `major` | Happy, bright |
| `minor` | Sad, dramatic |
| `dorian` | Funky, soulful |
| `mixolydian` | Bluesy rock |
| `lydian` | Dreamy, sci-fi |
| `phrygian` | Dark, tense |
| `harmonicMinor` | Spooky, classical |
| `phrygianDominant` | Middle-Eastern, klezmer |
| `majorPentatonic` | Folk, country, sunny |
| `minorPentatonic` | Rock, blues |
| `blues` | Blues |
| `hirajoshi`, `insen` | Japanese |
| `wholeTone` | Dreamlike, mysterious |

### Part (instrument) options

A theme can have any number of parts under `music.parts`. Name them whatever you like (`bass`, `lead`, `banjo`...).

| Option | Meaning |
| ------ | ------- |
| `pattern` | The notes (see "Change the melody") |
| `follow` | `'chord'` (default): `1` is the current bar's chord note, good for bass, chords and arpeggios. `'key'`: `1` is always the key's home note, best for melodies |
| `wave` | `'sine'` (soft, flute), `'triangle'` (mellow), `'square'` (retro game), `'sawtooth'` (buzzy, brass), or a custom tone like `[1, 0.5, 0.25]` (strength of each harmonic) |
| `octave` | 2 = bass, 3–4 = middle, 5–6 = high |
| `volume` | 0–1 (most parts sound good between 0.05 and 0.4) |
| `chord` | `true` plays a three-note chord on each note |
| `pluck` | `true` makes notes fade out like a guitar, harp or bell |
| `attack` / `release` | Fade-in / fade-out time in seconds (pads like `attack: 0.4`) |
| `filter` | Cuts brightness above this many Hz (e.g. 800 = muffled) |
| `q` | Filter resonance (1 = normal, 6 = squelchy) |
| `vibrato` / `vibratoRate` | Pitch wobble depth (cents) and speed (Hz) |
| `detune` | Adds a second slightly detuned copy for a thicker sound (cents) |
| `echo` | Amount sent to the echo effect (0–1) |
| `slide` | Pitch bend across each note |
| `gate` | Note length for this part only |

### Sound-effect settings (`sfx`)

| Setting | Meaning |
| ------- | ------- |
| `wave` | Default instrument for this theme's effects |
| `octave` | Default pitch range (5–6 works well) |
| `volume` | Loudness multiplier for all effects |
| `filter` | Darkens all effects |
| `key` / `scale` | Defaults to the music's key and scale |
| `overrides` | Custom recipes per event (see above) |

---

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| No sound at all | Click the page or press a key first (browser rule). Check the speaker button in the toolbar and the volume sliders in **Settings**. |
| My change does nothing | Reload the page (Ctrl+F5 to bypass the cache). Check the console for a warning. Make sure you edited the right theme id. |
| The game is silent after an edit | Most likely a JavaScript syntax error such as a missing comma or quote. The console shows the line number. |
| My audio file doesn't play | Check the console for "Could not load…". Check the path and file name (case matters on GitHub Pages). |
| A theme is too loud or quiet | Adjust that theme's `music.volume` or `sfx.volume`. |
