#!/usr/bin/env node
// One-shot setup, safe to rerun. Uses only Node built-ins so it runs before `npm install`.
// Installs npm deps and Playwright Chromium, and creates the Kokoro TTS venv in the shared cache
// (~/.cache/how-it-works/venv-tts) so it survives plugin updates. Flags: --no-tts (skip the ~1 GB voice).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_TTS = process.argv.includes('--no-tts');
const TTS_VENV = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'how-it-works', 'venv-tts');
const ok = (bin, args) => spawnSync(bin, args, { encoding: 'utf8' }).status === 0;
const run = (bin, args, opts = {}) => {
  console.log(`$ ${bin} ${args.join(' ')}`);
  const r = spawnSync(bin, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) { console.error(`\nsetup failed at: ${bin} ${args.join(' ')}`); process.exit(1); }
};
const step = m => console.log(`\n== ${m}`);

step('Node.js');
if (+process.versions.node.split('.')[0] < 20) { console.error(`Node ${process.versions.node} found; How It Works needs Node 20 or later.`); process.exit(1); }
console.log(`node ${process.versions.node}`);

step('ffmpeg');
if (!ok('ffmpeg', ['-version']) || !ok('ffprobe', ['-version'])) {
  console.error('ffmpeg and ffprobe are required. Install them (macOS: brew install ffmpeg, Debian/Ubuntu: sudo apt install ffmpeg) and rerun setup.');
  process.exit(1);
}
console.log('found');

step('npm dependencies');
if (fs.existsSync(path.join(ROOT, 'node_modules/playwright')) && fs.existsSync(path.join(ROOT, 'node_modules/ajv'))) console.log('installed');
else run('npm', [fs.existsSync(path.join(ROOT, 'package-lock.json')) ? 'ci' : 'install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT });

step('Playwright Chromium');
run('npx', ['playwright', 'install', 'chromium'], { cwd: ROOT });

step('Kokoro TTS (English voices)');
const devPy = path.join(ROOT, '.venv-tts/bin/python'), cachePy = path.join(TTS_VENV, 'bin/python');
const existing = [process.env.HIW_PYTHON, devPy, cachePy].filter(Boolean).find(p => fs.existsSync(p) && ok(p, ['-c', 'import kokoro, soundfile']));
if (existing) console.log(`ready: ${existing}`);
else if (NO_TTS) console.log('skipped (--no-tts). Storyboards can use tts.engine "say" (macOS) or "none".');
else {
  // Kokoro's dependencies build on Python 3.10 to 3.12.
  const py = ['python3.11', 'python3.12', 'python3.10'].find(p => ok(p, ['--version']));
  if (!py) {
    console.error('Kokoro needs Python 3.10 to 3.12 (3.11 recommended). Install it (macOS: brew install python@3.11) and rerun setup, or rerun with --no-tts.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(TTS_VENV), { recursive: true });
  run(py, ['-m', 'venv', TTS_VENV]);
  run(cachePy, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
  run(cachePy, ['-m', 'pip', 'install', 'kokoro', 'soundfile']);
}

step('Doctor');
const d = spawnSync(process.execPath, [path.join(ROOT, 'bin/hiw.mjs'), 'doctor'], { stdio: 'inherit' });
process.exit(d.status ?? 1);
