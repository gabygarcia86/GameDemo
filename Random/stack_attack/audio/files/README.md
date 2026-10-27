# Your audio files go here

Put any music or sound effect files you want to use in this folder. Then point to them from `audio/audio-config.js`:

```js
halloween: {
  // ...existing music and sfx settings...
  files: {
    music: 'audio/files/halloween-theme.mp3',
    clear4: 'audio/files/evil-laugh.wav',
  },
},
```

- Paths are relative to `index.html`, so they always start with `audio/files/`.
- MP3 works in every browser. OGG and WAV work in most.
- Keep effects short (under 1 second) and music files small (a 1–2 minute loop at 128 kbps is plenty).
- Only use audio you made yourself or have a license to use.

The step-by-step guide is in [../README.md](../README.md).
