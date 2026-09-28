# How It Works

**Tutorials that can't go stale.** How It Works is a Claude Code skill and CLI that turn one JSON storyboard into verified product content. It clicks through your real product, then delivers step-by-step guides with GIFs, narrated videos in 16:9 and 9:16, release notes, and animated architecture explainers.

Nothing is filmed or edited by hand. Each step runs on the live page, and each result passes quality gates before it ships.

## What you get

| Kind | Output |
|---|---|
| `task-tutorial` | A guide (`guide.md`) with annotated screenshots and GIFs, plus a narrated video |
| `feature-release` | Release notes plus wide and vertical launch videos |
| `architecture-explainer` | An animated tour of an [Archify](https://github.com/tt-a1i/archify) diagram, plus a guide |

## How it works

1. **Validate:** the storyboard is checked against a schema. Scene ids and diagram node and edge references are checked too.
2. **Capture:** a real Chromium browser performs each step and asserts each `expect`. Clicks, keystrokes, and target boxes are logged as evidence.
3. **Produce:** the pipeline adds narration (Kokoro TTS), word-timed captions, camera moves that follow logged boxes, and sound effects on real clicks. Videos are rendered with [HyperFrames](https://github.com/heygen-com/hyperframes).
4. **Verify:** gates check every output: UI labels in the guide must exist on the page, GIFs must cover each action, video spec, black frames, loudness (-14 LUFS ±2), and caption speed.
5. **Deliver:** outputs replace the previous delivery only when every gate passes. The run writes a `receipt.json` with SHA-256 hashes.

## Requirements

- Node.js 20 or later, and `ffmpeg` on your `PATH`
- Python 3.11, for Kokoro TTS (English voices)
- Optional: the [Archify](https://github.com/tt-a1i/archify) skill, for diagram scenes

## Install

To use it as a Claude Code skill:

```bash
git clone https://github.com/junixlabs/how-it-works ~/.claude/skills/how-it-works
cd ~/.claude/skills/how-it-works
npm install && npx playwright install chromium
python3.11 -m venv .venv-tts && .venv-tts/bin/pip install kokoro soundfile
node bin/hiw.mjs doctor
```

Then ask Claude Code for a tutorial, a release video, or a video that explains how a system works.

## CLI

```bash
hiw validate <storyboard.json> --json     # typed diagnostics with suggested fixes
hiw deliver  <storyboard.json> <out-dir>  # capture, render, gate, deliver atomically
hiw review   <out-dir>                    # contact sheets for a visual review
hiw examples                              # list bundled storyboards
hiw demo     <out-dir>                    # explainer of this pipeline (needs Archify)
```

`hiw` is `node bin/hiw.mjs`. Every command accepts `--json`. Start from the storyboards in [`examples/`](examples/) and the schema in [`schemas/storyboard.schema.json`](schemas/storyboard.schema.json).

## Music

No music track ships with this repo. Set `audio.music` to a track you are licensed to use. See [`assets/music/README.md`](assets/music/README.md). The sound effects are generated procedurally by `scripts/make-sfx.mjs`, so they carry no license restrictions.

## Tests

```bash
ARCHIFY_HOME=/path/to/archify/archify npm test
```

## Credits

- [Archify](https://github.com/tt-a1i/archify) (MIT): diagram rendering
- [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0): video rendering
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0): text-to-speech
- [Playwright](https://playwright.dev) (Apache-2.0): browser capture
- [GSAP](https://gsap.com): animation, loaded at render time

## License

[MIT](LICENSE)
