#!/usr/bin/env node
// How It Works CLI: doctor | examples | validate | deliver | review | demo
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStoryboard, resolveDefaults, diag } from '../lib/validate.mjs';
import { archifyCli, archifyHome, archifyDeliver, flattenDiagram } from '../lib/diagram.mjs';
import { capture } from '../lib/capture.mjs';
import { synthesize, KOKORO_PY } from '../lib/tts.mjs';
import { compose } from '../lib/compose.mjs';
import { writeProject, buildClips, mixAudio, checkComposition, renderVideo, HYPERFRAMES } from '../lib/produce.mjs';
import { buildGuide } from '../lib/guide.mjs';
import { videoGates, gifGates } from '../lib/qa.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--formats', '--result', '--note', '--rounds'].includes(args[i - 1])));
const JSON_OUT = flag('--json');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const log = (...m) => { if (!JSON_OUT) console.error(...m); };
const emit = (obj, code) => {
  if (JSON_OUT) console.log(JSON.stringify(obj, null, 2));
  else {
    for (const d of obj.diagnostics || []) console.log(`${d.severity === 'warning' ? 'WARN' : 'ERROR'} ${d.code}  ${d.message}${d.supportedFixes?.length ? `\n      fix: ${d.supportedFixes.slice(0, 3).join(' | ')}` : ''}`);
    for (const g of obj.gates?.items || []) console.log(`${g.ok ? 'PASS' : 'FAIL'}  ${g.name.padEnd(46)} ${g.detail}`);
    if (obj.summary) console.log(obj.summary);
  }
  process.exit(code);
};

const USAGE = `Usage:
  hiw doctor [--json]
  hiw examples
  hiw validate <storyboard.json> [--json]
  hiw deliver <storyboard.json> <out-dir> [--formats guide,video-16x9,video-9x16] [--keep-work] [--json]
  hiw review <out-dir> [--result passed|failed|skipped] [--note "..."] [--rounds 0|1|2] [--json]
  hiw demo <out-dir> [--json]`;

const cmd = positional[0];
if (!cmd || cmd === 'help' || flag('--help')) { console.log(USAGE); process.exit(0); }

// ---------------- doctor ----------------
if (cmd === 'doctor') {
  const checks = [];
  const has = (bin, a = ['-version']) => spawnSync(bin, a, { encoding: 'utf8' }).status === 0;
  const c = (name, ok, detail, needed) => checks.push({ name, ok, detail, neededFor: needed });
  c('node >= 20', +process.versions.node.split('.')[0] >= 20, process.versions.node, 'everything');
  c('ffmpeg + ffprobe', has('ffmpeg') && has('ffprobe'), has('ffmpeg') ? 'found' : 'missing: brew install ffmpeg', 'clips, audio, QA');
  const deps = fs.existsSync(path.join(ROOT, 'node_modules/playwright')) && fs.existsSync(path.join(ROOT, 'node_modules/ajv'));
  c('npm dependencies', deps, deps ? 'installed' : `run: cd ${ROOT} && npm install`, 'everything');
  let chrome = false;
  try { const { chromium } = await import('playwright'); const b = await chromium.launch(); await b.close(); chrome = true; } catch { /* reported below */ }
  c('playwright chromium', chrome, chrome ? 'launches' : 'run: npx playwright install chromium', 'capture, guide stills, diagrams');
  c('npx (HyperFrames)', has('npx', ['--version']), `${HYPERFRAMES} via npx`, 'video render');
  const acli = archifyCli();
  let aver = null;
  try { aver = JSON.parse(fs.readFileSync(path.join(archifyHome(), 'skill-release.json'), 'utf8')).version; } catch { /* none */ }
  c('archify', !!acli, acli ? `${archifyHome()} v${aver}` : 'install the archify skill or set ARCHIFY_HOME', 'diagram scenes only');
  const kok = fs.existsSync(KOKORO_PY) && spawnSync(KOKORO_PY, ['-c', 'import kokoro, soundfile'], { encoding: 'utf8' }).status === 0;
  c('kokoro TTS', kok, kok ? KOKORO_PY : `run: python3.11 -m venv ${ROOT}/.venv-tts && ${ROOT}/.venv-tts/bin/pip install kokoro soundfile`, 'tts.engine "kokoro"');
  c('macOS say', has('say', ['-v', '?']), 'placeholder voice', 'tts.engine "say"');
  c('built-in SFX', fs.existsSync(path.join(ROOT, 'assets/sfx/key.wav')), 'assets/sfx/*.wav (node scripts/make-sfx.mjs)', 'audio.sfx');
  const mus = fs.existsSync(path.join(ROOT, 'assets/music/default.mp3'));
  c('default music', mus, mus ? 'assets/music/default.mp3' : 'none: videos render without music unless audio.music points to a file', 'audio.music "default"');
  const required = checks.filter(x => ['everything', 'clips, audio, QA', 'capture, guide stills, diagrams', 'video render'].includes(x.neededFor));
  const ok = required.every(x => x.ok);
  if (!JSON_OUT) for (const x of checks) console.log(`${x.ok ? 'ok  ' : 'MISS'}  ${x.name.padEnd(22)} ${x.detail}  [${x.neededFor}]`);
  if (JSON_OUT) console.log(JSON.stringify({ schemaVersion: 1, command: 'doctor', ok, version: VERSION, checks }, null, 2));
  process.exit(ok ? 0 : 1);
}

if (cmd === 'examples') {
  for (const f of fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.json'))) {
    const sb = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8'));
    console.log(`${path.join(ROOT, 'examples', f)}\n    kind=${sb.kind} scenes=${sb.scenes.length} formats=${(sb.formats || ['default']).join(',')}`);
  }
  process.exit(0);
}

// ---------------- validate ----------------
function load(file) {
  try { return { sb: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (e) { return { diagnostics: [diag('storyboard/unreadable', `Cannot read storyboard: ${e.message.split('\n')[0]}`, { file }, {}, ['fix the JSON syntax'])] }; }
}

if (cmd === 'validate') {
  const file = positional[1];
  if (!file) { console.log(USAGE); process.exit(2); }
  const { sb, diagnostics: d0 } = load(file);
  if (!sb) emit({ schemaVersion: 1, command: 'validate', ok: false, diagnostics: d0 }, 1);
  const r = validateStoryboard(sb, file);
  const errors = r.diagnostics.filter(d => d.severity === 'error').length, warnings = r.diagnostics.length - errors;
  emit({ schemaVersion: 1, command: 'validate', ok: r.ok, input: path.resolve(file), kind: sb.kind, summary: `${r.ok ? 'valid' : 'invalid'}: ${errors} error(s), ${warnings} warning(s)`, diagnostics: r.diagnostics }, r.ok ? 0 : 1);
}

// ---------------- deliver ----------------
async function deliver(file, outDir) {
  const t0 = Date.now();
  const receipt = { schemaVersion: 1, command: 'deliver', skill: 'how-it-works', version: VERSION, ok: false, diagnostics: [] };
  const fail = (diagnostics, extra = {}) => ({ ...receipt, ...extra, ok: false, diagnostics: [...receipt.diagnostics, ...diagnostics] });
  const { sb: raw, diagnostics: d0 } = load(file);
  if (!raw) return fail(d0);
  const v = validateStoryboard(raw, file);
  receipt.diagnostics.push(...v.diagnostics.filter(d => d.severity === 'warning'));
  if (!v.ok) return fail(v.diagnostics.filter(d => d.severity === 'error'), { stage: 'validate' });
  const sb = resolveDefaults(raw);
  if (opt('--formats')) sb.formats = opt('--formats').split(',');
  receipt.kind = sb.kind;
  receipt.storyboard = { path: path.resolve(file), sha256: sha(file), bytes: fs.statSync(file).size };

  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(path.resolve(outDir), '.hiw-work-'));
  const cleanup = () => { if (!flag('--keep-work')) fs.rmSync(work, { recursive: true, force: true }); };
  try {
    // 1. capture the real product
    let ev = null;
    const capDir = path.join(work, 'captures');
    if (sb.scenes.some(s => s.kind === 'ui')) {
      log('capture: driving', sb.product.url);
      ev = await capture(sb, capDir);
      const bad = ev.scenes.filter(s => !s.ok);
      receipt.capture_evidence = bad.length ? 'failed' : 'passed';
      if (bad.length) return fail(bad.map(s => s.error
        ? diag('capture/target-not-found', `Scene "${s.id}": action target not found on the real page.`, { scene: s.id }, { action: s.error.action }, ['check the target against the live page', 'add a goto action or an earlier step that reveals it'])
        : diag('capture/assertion-failed', `Scene "${s.id}": the product did not reach the expected state.`, { scene: s.id }, { checks: s.checks.filter(c => !c.ok) }, ['fix the action so the state is reached', 'or correct the expect entry to match the observed value'])), { stage: 'capture' });
    } else receipt.capture_evidence = 'not-applicable';

    // 2. diagrams through Archify's own acceptance gate
    const diagrams = {};
    receipt.diagrams = [];
    for (const [name, d] of Object.entries(sb.diagrams || {})) {
      const spec = path.resolve(path.dirname(path.resolve(file)), d.spec);
      const html = path.join(work, `diagram-${name}.html`);
      log('diagram:', name);
      const r = archifyDeliver(d.type, spec, html);
      if (!r.ok) return fail([diag('diagram/archify-deliver', `Archify rejected diagram "${name}": ${r.error}`, { diagram: name }, { archify: r.receipt?.diagnostics?.slice(0, 3) || [] }, [`run: node ${archifyCli()} validate ${d.type} ${spec} --quality showcase --json`, 'repair the Archify spec, then deliver again'])], { stage: 'diagram' });
      diagrams[name] = await flattenDiagram(html);
      receipt.diagrams.push({ name, type: d.type, specification_sha256: r.receipt?.specification?.sha256, artifact_sha256: r.receipt?.artifact?.sha256, validation: 'archify showcase pass' });
    }

    // 3. narration
    log('narration:', sb.tts.engine);
    const vo = synthesize(sb, path.join(work, 'vo'));

    // 4. guide
    const gates = [];
    const staged = [];
    if (sb.formats.includes('guide')) {
      log('guide');
      const g = await buildGuide({ sb, ev, capDir, diagrams, dir: path.join(work, 'guide') });
      gates.push({ name: 'guide: UI labels exist in product', ok: g.diagnostics.length === 0, detail: `${g.terms.length - g.diagnostics.length}/${g.terms.length} labels` });
      if (ev) gates.push(...gifGates(path.join(work, 'guide'), ev));
      receipt.diagnostics.push(...g.diagnostics);
      staged.push({ from: path.join(work, 'guide'), to: 'guide', kind: 'guide', main: g.file });
    }

    // 5. videos
    for (const fmt of sb.formats.filter(f => f.startsWith('video-'))) {
      log('video:', fmt);
      const c = compose({ sb, ev, diagrams, vo, format: fmt });
      const proj = path.join(work, `project-${fmt}`);
      writeProject(proj, c.html);
      if (ev) buildClips(proj, capDir, ev, c.scenes);
      mixAudio(proj, { cues: c.cues, vo, scenes: c.scenes, OUT0: c.OUT0, TOTAL: c.TOTAL, music: sb.audio.music, sfxOn: sb.audio.sfx });
      const chk = checkComposition(proj);
      gates.push({ name: `${fmt}: composition check`, ok: chk.ok, detail: chk.ok ? 'hyperframes check passed' : chk.output.split('\n').slice(-3).join(' / ') });
      if (!chk.ok) continue;
      log('render:', fmt);
      const mp4 = path.join(work, `${fmt}.mp4`);
      const rr = renderVideo(proj, mp4);
      gates.push({ name: `${fmt}: render`, ok: rr.ok, detail: rr.ok ? 'rendered' : rr.output });
      if (!rr.ok) continue;
      gates.push(...videoGates(mp4, { W: c.layout.W, H: c.layout.H, TOTAL: c.TOTAL, scenes: c.scenes, label: fmt }));
      staged.push({ from: mp4, to: `${fmt}.mp4`, kind: fmt, scenes: c.scenes, TOTAL: c.TOTAL });
    }

    receipt.gates = { passed: gates.filter(g => g.ok).length, total: gates.length, items: gates };
    if (gates.some(g => !g.ok)) return fail([diag('deliver/gates-failed', `${gates.filter(g => !g.ok).length} gate(s) failed; previous output kept.`, { outDir: path.resolve(outDir) }, { failed: gates.filter(g => !g.ok) }, ['repair the failing subject and deliver again'])], { stage: 'gates' });

    // 6. atomic commit: replace artifacts only after every gate passed
    receipt.artifacts = [];
    for (const s of staged) {
      const dest = path.join(outDir, s.to);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(s.from, dest);
      const main = s.kind === 'guide' ? path.join(dest, s.main) : dest;
      receipt.artifacts.push({ kind: s.kind, path: path.resolve(main), sha256: sha(main), bytes: fs.statSync(main).size, ...(s.scenes ? { duration: s.TOTAL, scenes: s.scenes.map(({ id, kind, start, dur }) => ({ id, kind, start, dur })) } : {}) });
    }
    receipt.ok = true;
    receipt.visual_review = 'pending';
    receipt.correction_rounds = null;
    receipt.seconds = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(path.join(outDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
    receipt.summary = `delivered ${receipt.artifacts.length} artifact(s), ${receipt.gates.passed}/${receipt.gates.total} gates, ${receipt.seconds}s -> ${path.resolve(outDir)}/receipt.json\nnext: hiw review ${outDir}`;
    return receipt;
  } catch (e) {
    return fail([diag('internal/exception', e.message.split('\n')[0], {}, { stack: e.stack.split('\n').slice(0, 4) }, ['rerun with --keep-work and inspect the work directory'])], { stage: 'exception' });
  } finally {
    cleanup();
  }
}

if (cmd === 'deliver' || cmd === 'demo') {
  const file = cmd === 'demo' ? path.join(ROOT, 'examples/architecture-explainer.json') : positional[1];
  const out = cmd === 'demo' ? positional[1] : positional[2];
  if (!file || !out) { console.log(USAGE); process.exit(2); }
  const r = await deliver(file, out);
  emit(r, r.ok ? 0 : 1);
}

// ---------------- review ----------------
if (cmd === 'review') {
  const out = positional[1];
  const rf = path.join(out || '', 'receipt.json');
  if (!out || !fs.existsSync(rf)) { console.log(USAGE); process.exit(2); }
  const receipt = JSON.parse(fs.readFileSync(rf, 'utf8'));
  const result = opt('--result');
  if (result) {
    if (!['passed', 'failed', 'skipped'].includes(result)) emit({ ok: false, diagnostics: [diag('review/result', 'result must be passed, failed or skipped', {}, {}, ['--result passed'])] }, 2);
    for (const a of receipt.artifacts) {
      if (sha(a.path) !== a.sha256) emit({ ok: false, diagnostics: [diag('review/stale-artifact', `${a.path} changed since delivery; the review would not describe the delivered bytes.`, { path: a.path }, {}, ['deliver again, then review'])] }, 1);
    }
    receipt.visual_review = result;
    receipt.review_note = opt('--note', '');
    receipt.correction_rounds = opt('--rounds') !== null ? +opt('--rounds') : receipt.correction_rounds;
    fs.writeFileSync(rf, JSON.stringify(receipt, null, 2));
    emit({ ok: true, command: 'review', visual_review: result, summary: `visual_review: ${result}` }, 0);
  }
  // Contact sheets: one frame per scene (mid-scene) plus intro and outro, for an image-capable reviewer.
  const dir = path.join(out, 'review');
  fs.mkdirSync(dir, { recursive: true });
  const sheets = [];
  for (const a of receipt.artifacts.filter(x => x.kind.startsWith('video-'))) {
    const times = [1.8, ...a.scenes.map(s => s.start + s.dur * 0.62), a.duration - 2.2];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hiw-review-'));
    times.forEach((t, k) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', a.path, '-frames:v', '1', '-vf', `scale=${a.kind === 'video-9x16' ? 360 : 640}:-1`, `${tmp}/${String(k).padStart(2, '0')}.png`]));
    const cols = a.kind === 'video-9x16' ? Math.min(times.length, 5) : 3;
    const sheet = path.join(dir, `${a.kind}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', `${tmp}/%02d.png`, '-vf', `tile=${cols}x${Math.ceil(times.length / cols)}`, '-frames:v', '1', sheet]);
    fs.rmSync(tmp, { recursive: true, force: true });
    sheets.push(path.resolve(sheet));
  }
  const g = receipt.artifacts.find(x => x.kind === 'guide');
  emit({ ok: true, command: 'review', contactSheets: sheets, guide: g?.path, visual_review: receipt.visual_review,
    summary: `contact sheets:\n  ${sheets.join('\n  ')}\nguide: ${g?.path || '-'}\nInspect them, then record: hiw review ${out} --result passed|failed --rounds N --note "..."` }, 0);
}

console.log(USAGE);
process.exit(2);
