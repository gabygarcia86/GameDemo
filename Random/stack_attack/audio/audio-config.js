/**
 * Stack Attack — music and sound settings for every theme.
 *
 * THIS IS THE FILE TO EDIT to change how the game sounds.
 * Full guide with examples: audio/README.md
 *
 * Quick reference
 * ---------------
 * music.bpm          tempo (beats per minute)
 * music.key          'C', 'C#', 'Db', 'D' ... 'B'
 * music.scale        major, minor, dorian, phrygian, lydian, mixolydian,
 *                    harmonicMinor, phrygianDominant, majorPentatonic,
 *                    minorPentatonic, blues, hirajoshi, insen, wholeTone
 * music.progression  chord root for each bar, as scale degrees: [1, 6, 4, 5]
 * music.stepsPerBar  16 = 4/4 time in 16th notes (12 = waltz time)
 * music.swing        0 (straight) to ~0.3 (shuffle)
 * music.volume       loudness of this theme's music (1 = normal)
 *
 * music.parts.<any name> = {
 *   pattern  one character per step:  1-9 / A-F = note (scale step),
 *            '-' = keep holding the previous note, '.' = silence.
 *            Spaces and '|' are ignored, so use them to mark beats/bars.
 *   follow   'chord' (default): 1 = root of the current bar's chord
 *            'key': 1 = the key note (best for melodies)
 *   wave     'sine' | 'square' | 'sawtooth' | 'triangle' or a custom tone
 *            as harmonic strengths, e.g. [1, 0.5, 0.25]
 *   octave   4 = middle octave
 *   volume   0..1
 *   optional: chord (true = play a 3-note chord), pluck (true = fading
 *   note), attack, release (seconds), filter (Hz, lower = darker),
 *   vibrato (cents), vibratoRate (Hz), detune (cents), echo (0..1),
 *   gate (0..1 note length), slide (pitch multiplier over the note)
 * }
 *
 * music.drums = { kick, snare, hat, clap, tom, taiko, wood, bell, shaker }
 *   each a pattern string ('x' = hit, 'X' = loud hit, '.' = rest) or
 *   { pattern: '...', volume: 0.5, pitch: 1.2 }
 *
 * sfx = { wave, octave, volume, filter, overrides: { <event>: [notes] } }
 *   events: move rotate hold hardDrop lock clear1 clear2 clear3 clear4
 *           levelUp gameOver denied start pause select
 *   a note: { deg: 5 } or { freq: 440 }, plus at (s), dur (s), vol, wave,
 *           oct, slide, filter, vibrato; or { drum: 'wood' };
 *           or { noise: true, filter: 2000, filterType: 'bandpass' }
 *
 * files = { music: 'audio/files/my-song.mp3', clear4: 'audio/files/yay.wav' }
 *   Optional real audio files (paths relative to index.html). They replace
 *   the synthesized sound for that theme. fileVolume scales them (0..1).
 */
window.STACK_ATTACK_AUDIO = {
  defaults: {
    music: {
      bpm: 120,
      key: 'C',
      scale: 'major',
      stepsPerBar: 16,
      swing: 0,
      gate: 0.85,
      volume: 1,
      levelSpeedup: 0.015,      // tempo +1.5% per level (max +30%)
    },
    sfx: { wave: 'square', octave: 5, volume: 1 },
  },

  themes: {
    // ------------------------------------------------------------ Arcade eras

    retro70: {                              // disco funk
      music: {
        bpm: 112, key: 'D', scale: 'dorian', swing: 0.08,
        progression: [1, 4, 1, 5],
        parts: {
          bass: { wave: 'sawtooth', octave: 2, volume: 0.42, filter: 700, pluck: true,
            pattern: '1.8. 1.8. 1.8. 5.6.' },
          clav: { wave: 'square', octave: 4, volume: 0.09, filter: 2200, chord: true, pluck: true,
            pattern: '..1. ..1. ..1. .1.1' },
          lead: { follow: 'key', wave: 'triangle', octave: 5, volume: 0.16, vibrato: 15,
            pattern: '5.6. 8.6. 5-3. 1... | 3.5. 6.5. 3--- .... | 5.6. 8.A. 8-6. 5... | 6.5. 3.2. 1--- ....' },
        },
        drums: {
          kick: 'x...x...x...x...',
          snare: '....x.......x...',
          hat: '..x...x...x...x.',
          shaker: { pattern: 'x.x.x.x.x.x.x.x.', volume: 0.5 },
        },
      },
      sfx: { wave: 'triangle', octave: 5 },
    },

    arcade80: {                             // synthwave
      music: {
        bpm: 104, key: 'A', scale: 'minor',
        progression: [1, 6, 3, 7],
        parts: {
          bass: { wave: 'sawtooth', octave: 2, volume: 0.38, filter: 500, pluck: true,
            pattern: '1.1. 1.1. 1.1. 1.1.' },
          arp: { wave: 'square', octave: 4, volume: 0.08, echo: 0.3, pluck: true,
            pattern: '1358 1358 1358 1358' },
          pad: { wave: 'sawtooth', octave: 3, volume: 0.07, chord: true, filter: 1200, attack: 0.3,
            pattern: '1--- ---- ---- ----' },
          lead: { follow: 'key', wave: 'sawtooth', octave: 4, volume: 0.13, detune: 8, filter: 3000, echo: 0.25,
            pattern: '8--- 6--- 5--- 3-5- | 6--- 5--- 3--- .... | 5--- 6--- 8--- A--- | 9--- 8--- 7--- ....' },
        },
        drums: {
          kick: 'x...x...x...x...',
          snare: '....X.......X...',
          hat: '..x...x...x...x.',
        },
      },
      sfx: { wave: 'square', octave: 5 },
    },

    classic90: {                            // eurodance chiptune
      music: {
        bpm: 136, key: 'C', scale: 'major',
        progression: [6, 4, 1, 5],
        parts: {
          bass: { wave: 'square', octave: 2, volume: 0.28, filter: 900, pluck: true,
            pattern: '.1.1 .1.1 .1.1 .1.1' },
          stab: { wave: 'sawtooth', octave: 4, volume: 0.08, chord: true, filter: 2600, pluck: true,
            pattern: '1..1 ..1. ..1. 1...' },
          lead: { follow: 'key', wave: 'square', octave: 5, volume: 0.11,
            pattern: '6.8. 9.8. 6.5. 3... | 4.6. 8.6. 4.3. 1... | 1.3. 5.8. 9.8. 5.3. | 5.6. 5.3. 2--- ....' },
        },
        drums: {
          kick: 'x...x...x...x...',
          clap: '....x.......x...',
          hat: '..x...x...x...xx',
        },
      },
      sfx: { wave: 'square', octave: 6 },
    },

    neon: {                                 // trance
      music: {
        bpm: 128, key: 'E', scale: 'minor',
        progression: [1, 6, 7, 1],
        parts: {
          bass: { wave: 'sawtooth', octave: 2, volume: 0.36, filter: 600, pluck: true,
            pattern: '.111 .111 .111 .111' },
          arp: { wave: 'square', octave: 5, volume: 0.07, echo: 0.35, pluck: true,
            pattern: '1538 1538 1538 1538' },
          pad: { wave: 'sawtooth', octave: 3, volume: 0.07, chord: true, attack: 0.4, filter: 1500,
            pattern: '1--- ---- ---- ----' },
          lead: { follow: 'key', wave: 'sawtooth', octave: 4, volume: 0.12, detune: 10, echo: 0.3, filter: 3500,
            pattern: '5--- ..5- 6--- 5--- | 3--- ..3- 5--- 1--- | 5--- ..5- 6--- 8--- | 7--- 6--- 5--- ....' },
        },
        drums: {
          kick: 'x...x...x...x...',
          clap: '....x.......x...',
          hat: '..x...x...x...x.',
        },
      },
      sfx: { wave: 'sawtooth', octave: 5, filter: 3000 },
    },

    // ----------------------------------------------------------------- Worlds

    scifi: {                                // spacey and mysterious
      music: {
        bpm: 96, key: 'D', scale: 'lydian', volume: 0.55,
        progression: [1, 2, 1, 2],
        parts: {
          pad: { wave: 'sine', octave: 3, volume: 0.1, chord: true, attack: 0.6, release: 0.6,
            pattern: '1--- ---- ---- ----' },
          arp: { wave: 'triangle', octave: 5, volume: 0.09, echo: 0.45, pluck: true,
            pattern: '1.5. 8.5. 3.5. 8.A.' },
          bass: { wave: 'sine', octave: 2, volume: 0.42,
            pattern: '1--- --1- ---- 5---' },
          lead: { follow: 'key', wave: [1, 0, 0.3, 0, 0.15], octave: 5, volume: 0.1, vibrato: 12, echo: 0.4,
            pattern: '5--- ---- 4--- 3--- | 2--- ---- .... .... | 5--- 6--- 8--- 7--- | 6--- ---- .... ....' },
        },
        drums: {
          kick: 'x.......x.x.....',
          snare: { pattern: '....x.......x...', volume: 0.5 },
          hat: { pattern: '..x...x...x...x.', volume: 0.6 },
        },
      },
      sfx: {
        wave: 'sine', octave: 6,
        overrides: {
          move: [{ deg: 8, dur: 0.03, vol: 0.14, slide: 1.3 }],
          hardDrop: [{ freq: 1200, dur: 0.25, vol: 0.22, wave: 'sawtooth', slide: 0.1, filter: 2500 },
            { drum: 'kick' }],
        },
      },
    },

    matrix: {                               // dark techno
      music: {
        bpm: 130, key: 'E', scale: 'phrygian',
        progression: [1, 1, 2, 1],
        parts: {
          bass: { wave: 'sawtooth', octave: 2, volume: 0.38, filter: 450, q: 6, pluck: true,
            pattern: '1.11 .1.1 1.11 .1.2' },
          stab: { wave: 'square', octave: 4, volume: 0.06, filter: 1800, chord: true, pluck: true, echo: 0.3,
            pattern: '..1. .... ..1. ....' },
          lead: { follow: 'key', wave: 'square', octave: 5, volume: 0.07, filter: 2500, echo: 0.4, pluck: true,
            pattern: '1.2. 1... 5.4. 2... | 1.2. 3... 2.1. ....' },
        },
        drums: {
          kick: 'x...x...x...x...',
          hat: { pattern: 'xxxx xxxx xxxx xxxx', volume: 0.45 },
          clap: '....x.......x...',
        },
      },
      sfx: {
        wave: 'square', octave: 5, filter: 2600,
        overrides: {
          move: [{ freq: 1800, dur: 0.015, vol: 0.1, wave: 'square' }],
          rotate: [{ freq: 900, dur: 0.03, vol: 0.14, wave: 'square' },
            { freq: 1350, at: 0.03, dur: 0.03, vol: 0.14, wave: 'square' }],
        },
      },
    },

    ninjas: {                               // koto, flute and taiko
      music: {
        bpm: 100, key: 'D', scale: 'hirajoshi', volume: 0.6,
        progression: [1, 1, 4, 1],
        parts: {
          drone: { wave: 'triangle', octave: 2, volume: 0.32,
            pattern: '1--- ---- 1--- ----' },
          koto: { wave: [1, 0.6, 0.4, 0.25, 0.1], octave: 4, volume: 0.17, pluck: true, release: 0.3,
            pattern: '1.2. 3.5. 3.2. 1...' },
          flute: { follow: 'key', wave: 'sine', octave: 5, volume: 0.14, vibrato: 25, vibratoRate: 4.5, attack: 0.08,
            pattern: '3--- ---- 2--- 1--- | 2--- ---- .... .... | 4--- 5--- 6--- 5--- | 4--- 3--- 2--- ----' },
        },
        drums: {
          taiko: 'X.......x.x.....',
          tom: '....x.......x.x.',
          wood: { pattern: '..x...x...x...x.', volume: 0.5 },
        },
      },
      sfx: {
        wave: 'triangle', octave: 5,
        overrides: {
          hardDrop: [{ drum: 'taiko', vol: 1.1 }],
          lock: [{ drum: 'wood', vol: 0.6 }],
        },
      },
    },

    western: {                              // country shuffle
      music: {
        bpm: 120, key: 'G', scale: 'major', swing: 0.22, volume: 1.35,
        progression: [1, 4, 1, 5],
        parts: {
          bass: { wave: 'triangle', octave: 2, volume: 0.4, pluck: true,
            pattern: '1... 5... 1... 5...' },
          strum: { wave: 'sawtooth', octave: 3, volume: 0.06, chord: true, filter: 1800, pluck: true,
            pattern: '..1. ..1. ..1. ..1.' },
          harmonica: { follow: 'key', wave: 'sawtooth', octave: 5, volume: 0.09, filter: 2200, vibrato: 18,
            pattern: '5.6. 8--- 6.5. 3--- | 5.3. 2--- 1--- .... | 3.5. 6.8. 9.8. 6.5. | 3.2. 1--- ---- ....' },
        },
        drums: {
          wood: 'x.x. ..x. x.x. ..x.',
          snare: { pattern: '....x.......x...', volume: 0.5 },
        },
      },
      sfx: {
        wave: 'triangle', octave: 5,
        overrides: {
          move: [{ drum: 'wood', vol: 0.35 }],
          lock: [{ drum: 'wood', vol: 0.6, pitch: 0.7 }],
        },
      },
    },

    // --------------------------------------------------------------- Holidays

    america: {                              // brass-band march
      music: {
        bpm: 116, key: 'Bb', scale: 'major',
        progression: [1, 4, 5, 1],
        parts: {
          tuba: { wave: 'triangle', octave: 2, volume: 0.45, pluck: true,
            pattern: '1... 5... 1... 5...' },
          brass: { wave: 'sawtooth', octave: 3, volume: 0.07, chord: true, filter: 1600, attack: 0.02,
            pattern: '..1. ..1. ..1. ..1.' },
          trumpet: { follow: 'key', wave: 'sawtooth', octave: 4, volume: 0.12, filter: 2400, vibrato: 8,
            pattern: '5--5 8--- 8.8. A--- | 9--- 8--- 6--- 5--- | 5--5 6--- 8.8. A--- | C--- A--- 8--- ----' },
        },
        drums: {
          snare: { pattern: 'x..x x.x. x..x xxxx', volume: 0.6 },
          kick: 'x... .... x... ....',
        },
      },
      sfx: {
        wave: 'sawtooth', octave: 5, filter: 2800,
        overrides: {
          levelUp: [{ deg: 5, dur: 0.1, vol: 0.25 }, { deg: 8, at: 0.12, dur: 0.1, vol: 0.25 },
            { deg: 8, at: 0.24, dur: 0.08, vol: 0.25 }, { deg: 10, at: 0.34, dur: 0.4, vol: 0.28, pluck: false }],
        },
      },
    },

    halloween: {                            // organ and theremin
      music: {
        bpm: 92, key: 'D', scale: 'harmonicMinor', volume: 0.8,
        progression: [1, 6, 4, 5],
        parts: {
          organ: { wave: [1, 0.8, 0.6, 0, 0.4, 0, 0.2], octave: 3, volume: 0.07, chord: true, attack: 0.05,
            pattern: '1--- ---- 1--- ----' },
          bass: { wave: 'square', octave: 2, volume: 0.24, filter: 500,
            pattern: '1..1 ..1. 1..1 ..5.' },
          theremin: { follow: 'key', wave: 'sine', octave: 5, volume: 0.14, vibrato: 40, vibratoRate: 6, attack: 0.06,
            pattern: '5--- ---- 6--- 5--- | 4--- 3--- 2--- ---- | 1--- 3--- 5--- 8--- | 7--- ---- ---- ----' },
        },
        drums: {
          tom: { pattern: 'x.......x...x...', volume: 0.7 },
          snare: { pattern: '....x.......x...', volume: 0.4 },
          hat: { pattern: '..x...x...x...x.', volume: 0.3 },
        },
      },
      sfx: {
        wave: 'sine', octave: 5,
        overrides: {
          lock: [{ freq: 220, dur: 0.12, vol: 0.2, wave: 'sine', slide: 0.5, vibrato: 50 }],
          hardDrop: [{ freq: 400, dur: 0.3, vol: 0.28, wave: 'sawtooth', slide: 0.2, filter: 900 }, { drum: 'tom' }],
        },
      },
    },

    thanksgiving: {                         // warm folk fiddle
      music: {
        bpm: 100, key: 'F', scale: 'major', swing: 0.1, volume: 1.25,
        progression: [1, 6, 4, 5],
        parts: {
          bass: { wave: 'triangle', octave: 2, volume: 0.4, pluck: true,
            pattern: '1... ..5. 1... 5...' },
          guitar: { wave: 'triangle', octave: 4, volume: 0.11, pluck: true,
            pattern: '1.3. 5.3. 8.5. 3.5.' },
          fiddle: { follow: 'key', wave: 'sawtooth', octave: 5, volume: 0.09, filter: 2600, vibrato: 15, attack: 0.03,
            pattern: '3--- 5.3. 2--- 1--- | 6--- 5.3. 5--- .... | 3--- 5.6. 8--- 6.5. | 3--- 2--- 1--- ....' },
        },
        drums: {
          kick: { pattern: 'x.......x.......', volume: 0.7 },
          shaker: '..x...x...x...x.',
        },
      },
      sfx: { wave: 'triangle', octave: 5 },
    },

    hanukkah: {                             // lively klezmer hora
      music: {
        bpm: 140, key: 'E', scale: 'phrygianDominant',
        progression: [1, 2, 4, 1],
        parts: {
          bass: { wave: 'triangle', octave: 2, volume: 0.4, pluck: true,
            pattern: '1... 5... 1... 5...' },
          oompah: { wave: 'square', octave: 3, volume: 0.05, chord: true, filter: 1600, pluck: true,
            pattern: '..1. ..1. ..1. ..1.' },
          clarinet: { follow: 'key', wave: [1, 0, 0.5, 0, 0.3, 0, 0.15], octave: 4, volume: 0.14, vibrato: 14,
            pattern: '8.9. A.9. 8--- 7... | 8.9. A.B. C--- .... | D.C. B.A. 9.A. 9.8. | 9--- 8--- ---- ....' },
        },
        drums: {
          kick: { pattern: 'x...x...x...x...', volume: 0.6 },
          snare: { pattern: '..x...x...x...x.', volume: 0.35 },
        },
      },
      sfx: { wave: 'triangle', octave: 5 },
    },

    christmas: {                            // sleigh-bell jingle
      music: {
        bpm: 132, key: 'D', scale: 'major',
        progression: [1, 6, 4, 5],
        parts: {
          bass: { wave: 'triangle', octave: 2, volume: 0.38, pluck: true,
            pattern: '1... 5... 1... 5...' },
          celesta: { wave: 'sine', octave: 5, volume: 0.09, pluck: true, release: 0.4, echo: 0.25,
            pattern: '1.3. 5.8. 5.3. 5.3.' },
          lead: { follow: 'key', wave: 'triangle', octave: 5, volume: 0.14, vibrato: 10,
            pattern: '5.5. 6.5. 8--- 7--- | 6.6. 8.6. 5--- 3--- | 5.5. 6.5. 8--- 9--- | 8--- 7--- 8--- ....' },
        },
        drums: {
          bell: { pattern: 'x.x.x.x.x.x.x.x.', volume: 0.7 },
          kick: { pattern: 'x.......x.......', volume: 0.6 },
          snare: { pattern: '....x.......x...', volume: 0.35 },
        },
      },
      sfx: {
        wave: 'sine', octave: 6,
        overrides: {
          lock: [{ drum: 'bell', vol: 0.6 }],
          move: [{ deg: 8, dur: 0.04, vol: 0.12, wave: 'sine' }],
        },
      },
    },

    easter: {                               // bouncy and light
      music: {
        bpm: 118, key: 'G', scale: 'major', swing: 0.15,
        progression: [1, 4, 1, 5],
        parts: {
          bass: { wave: 'triangle', octave: 2, volume: 0.35, pluck: true,
            pattern: '1... 5... 1... 5...' },
          marimba: { wave: 'sine', octave: 4, volume: 0.14, pluck: true, release: 0.15,
            pattern: '1.5. 3.5. 1.5. 3.5.' },
          flute: { follow: 'key', wave: 'sine', octave: 5, volume: 0.13, vibrato: 10,
            pattern: '3.5. 8.5. 6.5. 3... | 2.3. 5.3. 2.1. 2... | 3.5. 8.5. 6.8. A.8. | 9.8. 6.5. 8--- ....' },
        },
        drums: {
          kick: 'x.......x.......',
          clap: { pattern: '....x.......x...', volume: 0.5 },
          shaker: '..x...x...x...x.',
        },
      },
      sfx: {
        wave: 'sine', octave: 6,
        overrides: {
          hold: [{ deg: 5, dur: 0.05, vol: 0.2 }, { deg: 8, at: 0.05, dur: 0.08, vol: 0.2, slide: 1.06 }],
        },
      },
    },

    // ---------------------------------------------------------------- Seasons

    spring: {                               // harp and flute, birdsong effects
      music: {
        bpm: 108, key: 'A', scale: 'major',
        progression: [1, 5, 6, 4],
        parts: {
          pad: { wave: 'triangle', octave: 3, volume: 0.06, chord: true, attack: 0.3,
            pattern: '1--- ---- ---- ----' },
          harp: { wave: 'triangle', octave: 4, volume: 0.11, pluck: true, release: 0.3,
            pattern: '1358 A853 1358 A853' },
          flute: { follow: 'key', wave: 'sine', octave: 5, volume: 0.12, vibrato: 12, attack: 0.03,
            pattern: '8--- 6.5. 3--- 5--- | 6--- 5.3. 2--- .... | 3--- 5.6. 8--- 9.8. | 6--- 5--- 3--- ....' },
        },
        drums: {
          shaker: { pattern: '..x...x...x...x.', volume: 0.6 },
          kick: { pattern: 'x.......x.......', volume: 0.5 },
        },
      },
      sfx: {
        wave: 'sine', octave: 6,
        overrides: {
          move: [{ deg: 8, dur: 0.04, vol: 0.12, slide: 1.25 }],
          levelUp: [{ deg: 8, dur: 0.05, vol: 0.2, slide: 1.3 }, { deg: 10, at: 0.07, dur: 0.05, vol: 0.2, slide: 1.3 },
            { deg: 12, at: 0.14, dur: 0.12, vol: 0.22, slide: 1.3 }],
        },
      },
    },

    beach: {                                // calypso steel drums
      music: {
        bpm: 112, key: 'F', scale: 'major', swing: 0.1,
        progression: [1, 4, 5, 1],
        parts: {
          bass: { wave: 'sine', octave: 2, volume: 0.45, pluck: true,
            pattern: '1..1 ..5. 1..1 ..5.' },
          comp: { wave: [1, 0, 0.5, 0, 0.25, 0.3], octave: 4, volume: 0.05, chord: true, pluck: true,
            pattern: '..1. ..1. ..1. ..1.' },
          steel: { follow: 'key', wave: [1, 0, 0.5, 0, 0.25, 0.3], octave: 5, volume: 0.15, pluck: true, release: 0.25,
            pattern: '5.6. 5.3. 1.3. 5... | 6.5. 6.8. 9.8. 6... | 5.6. 5.3. 1.3. 5.8. | 6.5. 3.2. 1... ....' },
        },
        drums: {
          kick: { pattern: 'x...x...x...x...', volume: 0.6 },
          shaker: { pattern: 'xxxx xxxx xxxx xxxx', volume: 0.45 },
          wood: { pattern: '..x. .x.. ..x. .x..', volume: 0.4 },
        },
      },
      sfx: {
        wave: [1, 0, 0.5, 0, 0.25, 0.3], octave: 5,
        overrides: {
          lock: [{ noise: true, dur: 0.12, vol: 0.15, filter: 900, filterType: 'lowpass' }],
        },
      },
    },

    winter: {                               // music-box waltz (3/4 time)
      music: {
        bpm: 104, key: 'E', scale: 'minor', stepsPerBar: 12, volume: 1.4,
        progression: [1, 4, 6, 5],
        parts: {
          bass: { wave: 'sine', octave: 2, volume: 0.36, pluck: true, release: 0.3,
            pattern: '1... .... ....' },
          waltz: { wave: 'triangle', octave: 4, volume: 0.06, chord: true, pluck: true,
            pattern: '.... 1... 1...' },
          celesta: { follow: 'key', wave: 'sine', octave: 5, volume: 0.14, pluck: true, release: 0.5, echo: 0.35,
            pattern: '5--- 3--- 1--- | 2--- 3--- 5--- | 6--- 5--- 3--- | 2--- ---- ----' },
        },
        drums: {
          shaker: { pattern: '.... x... x...', volume: 0.3 },
        },
      },
      sfx: {
        wave: 'sine', octave: 6,
        overrides: {
          lock: [{ freq: 3000, dur: 0.08, vol: 0.1, wave: 'sine' },
            { noise: true, dur: 0.06, vol: 0.08, filter: 6000, filterType: 'highpass' }],
        },
      },
    },
  },
};
