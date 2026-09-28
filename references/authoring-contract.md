# Authoring contract

Read only when the schema and the matching example leave a field unclear. The schema is authoritative.

## Storyboard top level

| Field | Required | Notes |
|---|---|---|
| `schema_version` | yes | `1` |
| `kind` | yes | `task-tutorial`, `feature-release`, or `architecture-explainer` |
| `id` | yes | lowercase slug |
| `title` | yes | Becomes the guide H1 and, by default, the intro title words |
| `language` | yes | two-letter code; `locale` (for example `en-US`) sets the browser locale during capture |
| `audience`, `outcome` | no | One line each; used in the guide opening and intro subtitle |
| `formats` | no | Subset of `guide`, `video-16x9`, `video-9x16`; defaults per kind |
| `product` | for `ui` scenes | `url`, optional `name`, `viewport` (default 1280x720) |
| `diagrams` | for `diagram` scenes | `{ name: { type, spec } }`; `spec` path is relative to the storyboard |
| `release` | for `feature-release` | `version`, optional `date` (YYYY-MM-DD), 1-5 `highlights` |
| `tts` | no | `{ engine: kokoro|say|none, voice, speed (kokoro), rate (say) }`. Default: kokoro `af_heart` for English, `say` otherwise |
| `audio` | no | `{ music: "default"|null|path, sfx: true|false }` |
| `copy` | no | `intro { kicker, title[], with, product, sub }`, `outro { kicker, title, learned[] }`, `guide { ...strings }` |

Guide copy keys: `audience`, `outcome` (with `{audience}` or `{outcome}` placeholders), `steps`, `result`, `resultText`, `whatsNew`, `howTo`, `howItWorks`, `overview`, `altAction`, and `altResult` (the last two use a `{n}` placeholder). A `resultText` adds a closing Result section.

## `ui` scene

```json
{ "id": "add-task", "kind": "ui", "title": "Add a task",
  "actions": [ { "do": "click", "target": { "placeholder": "What needs to be done?" } },
               { "do": "type", "target": { "placeholder": "What needs to be done?" }, "text": "Buy milk" },
               { "do": "press", "target": { "placeholder": "What needs to be done?" }, "key": "Enter" } ],
  "focus": { "placeholder": "What needs to be done?" },
  "expect": [ { "visible": { "testId": "todo-title", "text": "Buy milk" } } ],
  "narration": "…", "guide": { "step": "Click the {label} box, type your task, then press **Enter**." } }
```

- Actions: `goto` (`path` relative to `product.url`), `click`, `check`, `type` (typed key by key with a human rhythm; each key is a sound cue), `press` (`key`).
- Targets: `role` + `name` (exact), `placeholder`, `testId`; refine with `text`/`hasText`; nest with `child`.
- Expect (one key each): `visible` (target), `text` `{ testId|role…, contains }`, `class` `{ …, contains }`, `count` `{ testId, equals }`, `url` `{ contains }`.
- The spotlight uses the focus box before the action when focus is the action target, and after the action otherwise.
- The browser state carries across scenes in order; a scene may rely on what earlier scenes did.

## `diagram` scene

```json
{ "id": "capture", "kind": "diagram", "diagram": "pipeline", "title": "Capture the product",
  "focus": ["capture", "evidence"], "trace": ["validate-capture", "capture-evidence"], "narration": "…" }
```

- The camera frames the union of focus nodes and traced edges. Other nodes and edges dim, focus nodes get a ring, and traced edges draw one after another across the spoken span.
- Every id must exist in the rendered Archify SVG; validation lists the available ids.
- Scene length follows the narration (about 1 s more than the voice, minimum 4.2 s).

## `title` scene

`{ "id": "whats-new", "kind": "title", "title": "What's new", "heading": "Less noise, more done", "sub": "…", "narration": "…" }`

The title becomes the kicker, and the heading animates word by word. Title scenes have no chip or caption. Their narration is still voiced.
