---
description: Install How It Works dependencies (npm packages, Chromium, Kokoro voice) and run the doctor
argument-hint: "[--no-tts]"
allowed-tools: Bash(node:*)
---

Run the How It Works setup script and report the result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" $ARGUMENTS
```

The script is safe to rerun. The Kokoro voice download is about 1 GB, and `--no-tts` skips it. If it stops on a missing system tool (ffmpeg, or Python 3.10 to 3.12), tell the user the exact install command it printed. Do not work around it. End with the doctor table.
