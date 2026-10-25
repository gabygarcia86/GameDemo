# Songs folder

Put audio files here, then run `npm run compile` from `Random/touch_the_beat/`.

- Name files `Artist - Title.ext`, e.g. `Taylor Swift - Style.mp3`.
- Sub-folders are fine. The compiler scans recursively.
- Supported: `.mp3 .wav .ogg .oga .opus .m4a .mp4 .aac .flac .webm`. Formats other than WAV
  need ffmpeg installed. Browser playback support varies by format (MP3 and M4A are the safest).
- Per-song tweaks (tempo hint, density, offset, title...) go in `../../songs.config.json`.
  See `songs.config.example.json`.

The compiler writes charts to `public/charts/` and the song list to `public/metadata/library.json`.
Files you delete here are removed from the library on the next compile.
