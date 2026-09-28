---
name: how-it-works
description: Compile verified product content from a storyboard and the real product — step-by-step guides with annotated screenshots and GIFs, narrated tutorial videos (16:9 and 9:16), feature-release notes and social cuts, and animated architecture/workflow explainers built on Archify diagrams. Every UI step is performed on the live product and asserted; every named UI label is checked against the captured DOM; videos pass loudness, caption-speed, and black-frame gates before delivery. Use when the user asks for a product guide, how-to, tutorial video, onboarding walkthrough, release announcement video, social clip of a feature, or a video that explains how a system or workflow works.
license: MIT
metadata:
  version: "1.0.0"
---

# How It Works

Write one small typed storyboard; the CLI captures the real product, renders, verifies, and delivers. You author intent and words, never pixels, coordinates, or timings.

CLI: `node <skill>/bin/hiw.mjs` (below: `hiw`). All commands accept `--json`.

## Fast path

1. Pick the content kind from the request (router below). Read `schemas/storyboard.schema.json` and the one matching file in `examples/`. Read nothing else yet: not `lib/`, not the references.
2. Artifact first: the next action writes the candidate storyboard next to the user's work (for example `content/<id>.storyboard.json`). Use new ids and the user's product facts; take only the shape from the example.
3. Validate after every edit:

   ```bash
   hiw validate <storyboard.json> --json
   ```

   Fix only the diagnosed `subject.path`, check `evidence`, pick from `supportedFixes`, and rerun. Stop when validation is clean.
4. Deliver once:

   ```bash
   hiw deliver <storyboard.json> <out-dir> --json
   ```

   It captures, renders, and runs every gate in a private work directory and replaces the artifacts in `<out-dir>` only when all gates pass. A non-zero exit is never success. A failed delivery keeps the previous output, so never review `<out-dir>` after a failure.
5. Review what was delivered:

   ```bash
   hiw review <out-dir>
   ```

   Open every printed contact sheet and the guide with an image reader. Record exactly one result: `hiw review <out-dir> --result passed|failed|skipped --rounds N --note "..."`.
6. Repair loop: at most two focused correction rounds. After each edit, run validate then deliver again. If two rounds do not reduce the failing gates, stop and report the remaining diagnostics truthfully.

Run `hiw doctor` first when a command fails for an environment reason. Do not edit `lib/` to work around a gate; a gate failure means the storyboard or the product is wrong.

## Kind router

| kind | Use for | Default formats | Needs |
|---|---|---|---|
| `task-tutorial` | "How do I…" in a product: onboarding, one task end to end | guide, video-16x9 | `product.url`, `ui` scenes |
| `feature-release` | Announce what shipped and show how to use it | release notes, video-16x9, video-9x16 | `release`, `ui` scenes, optional `title` scenes |
| `architecture-explainer` | How a system, pipeline, or workflow works | guide, video-16x9 | `diagrams` (Archify specs), `diagram` scenes |

Scene kinds: `ui` (real actions on the product), `diagram` (focus nodes and trace edges on one Archify diagram), `title` (a kinetic heading card). Kinds can be mixed; consecutive scenes on the same diagram share one continuous camera.

## Authoring invariants

- **One scene, one idea.** Narration is one or two short sentences, spoken in about 4 to 10 s. The caption gate fails above 20 chars/s. Aim for about 15.
- **Real before words.** Every `ui` scene has `expect` assertions that prove the product reached the state the narration claims. Write the narration to match what happens, never the reverse.
- **Targets are semantic.** Use role+name, placeholder, or testId. Never use CSS paths or coordinates. `{label}` in `guide.step` becomes the captured label of `focus`, in bold.
- **Bold means a real UI name.** Every `**term**` in a guide must exist in the captured page text, a focus label, a diagram node label, or be a key name (Enter, Esc, Tab). Otherwise the label gate fails. Do not bold ordinary words.
- **Callouts:** set `"callout": false` for scenes whose focus is decorative, such as a large heading. `fx: "celebrate"` adds a burst on completion clicks. `fx: "filter"` adds a whoosh on view changes.
- **Diagrams belong to Archify.** Author the diagram with the `archify` skill's own fast path and acceptance, which is showcase validation with 0 errors. Keep it at 12 nodes or fewer, with a clear main path and edge ids. A `diagram` scene lists `focus` node ids and optional `trace` edge ids, in narration order. A final scene whose focus is every node shows the whole picture.
- **Language:** English uses the Kokoro voice with word-level caption timing. For other languages, set `copy.intro`, `copy.outro`, and `copy.guide` strings, because the defaults are English. Set `tts.engine` to `say` or `none` and say that captions use estimated timing.
- **Music:** `audio.music: "default"` uses `assets/music/default.mp3` when present (none ships; see `assets/music/README.md`), `null` means no music, or pass a path to a licensed track. SFX are built in and generated procedurally, so they are license-clean.

Read `references/authoring-contract.md` only when you need a field that the schema and example do not make obvious: action types, expect forms, copy keys, or diagram scene timing.

## Delivery claims

Keep three claims separate, and never let one imply another:

1. **Product evidence:** `capture_evidence: passed` means every `ui` scene ran on the live product and its assertions held.
2. **Deterministic gates:** `gates N/N` covers labels, GIF coverage, composition check, spec, duration, black frames, loudness, caption speed, and Archify acceptance for diagrams.
3. **Perceptual review:** `visual_review` is recorded only after you looked at the contact sheets and guide images. Use `skipped` when no image reader exists. Never use `passed` without looking.

Read `references/delivery-contract.md` for the receipt fields, failure stages, and what to check visually.

## Output

Return to the user:

```text
kind: task-tutorial|feature-release|architecture-explainer
artifacts: <absolute paths from receipt.json>
gates: N/N passed
capture_evidence: passed|not-applicable
visual_review: passed|failed|skipped
correction_rounds: 0|1|2
```

Add one line for any known limitation: the placeholder voice, estimated caption timing, or custom music licensing. Do not claim success for a non-zero command or a review you did not perform.

## Setup

```bash
cd <skill> && npm install && npx playwright install chromium
python3.11 -m venv .venv-tts && .venv-tts/bin/pip install kokoro soundfile   # English voice
hiw doctor
hiw demo <out-dir>        # architecture explainer of this pipeline; needs Archify, no network
```

Diagram scenes need the [archify](https://github.com/tt-a1i/archify) skill at `~/.claude/skills/archify`, or set `ARCHIFY_HOME`.
