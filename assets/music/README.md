# Music

No music track ships with this repository.

- **With `audio.music: "default"`:** the renderer looks for `assets/music/default.mp3`. If the file is missing, videos render without a music bed. Voice and sound effects are unaffected.
- **With `audio.music: "path/to/track.mp3"`:** the renderer uses that file. It is looped, faded, and ducked under the narration.
- **With `audio.music: null`:** the video has no music.

Use only tracks you are licensed to use in videos. `default.mp3` is ignored by git, so a local track is never committed by accident.
