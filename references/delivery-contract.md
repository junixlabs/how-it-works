# Delivery contract

## Deliver

`hiw deliver <storyboard> <out-dir> --json` runs in this order inside a private work directory `<out-dir>/.hiw-work-*`:

1. **validate:** schema and semantic rules. Diagram ids are checked against the rendered Archify SVG.
2. **capture:** runs every `ui` scene on the live product with a screencast, an event log, and assertions.
3. **diagram:** runs `archify deliver --quality showcase` for each diagram, then flattens the SVG and measures node and edge boxes.
4. **narration:** TTS per scene, with word timestamps when the engine provides them.
5. **guide:** stills, GIFs, and markdown, followed by the label gate and the GIF coverage gate.
6. **video, once per format:** compose, clips, audio master, `hyperframes check`, render, then the media gates.
7. **commit:** only if every gate passed, the artifacts replace the previous ones in `<out-dir>` and `receipt.json` is written.

On failure the JSON result carries `stage` and `diagnostics`. Nothing in `<out-dir>` changes. `--keep-work` keeps the work directory for inspection.

| stage | Typical codes | Repair |
|---|---|---|
| validate | `schema/*`, `scene/unknown-node`, `scene/unknown-edge`, `storyboard/kind-mismatch` | Edit the storyboard at `subject.path` |
| capture | `capture/target-not-found`, `capture/assertion-failed` (with `evidence.checks[].observed`) | Fix the action or expectation to match the live product |
| diagram | `diagram/archify-deliver` | Repair the Archify spec using Archify's own validate diagnostics |
| gates | `deliver/gates-failed`, plus `guide/unknown-ui-label` | See the failing gate's `detail` |

## Receipt (`<out-dir>/receipt.json`)

- `storyboard` gives the path, sha256, and bytes of the exact storyboard used.
- `artifacts[]` lists `kind`, `path`, `sha256`, `bytes`, plus `duration` and scene timings for each video.
- `gates` has the fields `passed`, `total`, and `items[]` (`name`, `ok`, `detail`).
- `capture_evidence` is `passed` or `not-applicable`.
- `diagrams[]` holds Archify's specification and artifact sha256 for each diagram.
- `visual_review` starts as `pending`. It is set only by `hiw review --result`, which refuses if any artifact changed since delivery.
- `correction_rounds` is set by `hiw review --rounds`.

## Perceptual review checklist

Open each `review/<format>.jpg` and the guide images. Check the following:

- The intro and outro text are fully visible and not clipped at 9:16.
- In every UI scene, the spotlight and tip sit on the element the narration names.
- In every diagram scene, the camera frames the focused nodes, dimming leaves them readable, and traced edges are visible.
- Captions do not overlap the frame, and the karaoke highlight is progressing.
- Guide stills show the right state, with the callout on the named element.

If anything fails, record `failed` with the concrete defect, fix the storyboard, deliver again, then review again. Use at most two rounds.
