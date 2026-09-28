// Storyboard validation: JSON schema + semantic rules. Every problem is a diagnostic with
// { code, severity, message, subject, evidence, supportedFixes } so an agent can repair one subject at a time.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { archifyCli } from './diagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/storyboard.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const check = ajv.compile(schema);

export const diag = (code, message, subject = {}, evidence = {}, supportedFixes = [], severity = 'error') =>
  ({ code, severity, message, subject, evidence, supportedFixes });

export const DEFAULT_FORMATS = {
  'task-tutorial': ['guide', 'video-16x9'],
  'feature-release': ['guide', 'video-16x9', 'video-9x16'],
  'architecture-explainer': ['guide', 'video-16x9'],
};

function schemaDiagnostics(errors) {
  // Drop the generic "must match then schema" wrappers; the concrete error beneath is the actionable one.
  return errors.filter(e => e.keyword !== 'if').map(e => {
    const p = e.instancePath || '/';
    if (e.keyword === 'required') return diag('schema/required', `${p} is missing required field "${e.params.missingProperty}".`, { path: p }, { missing: e.params.missingProperty }, [`add "${e.params.missingProperty}" at ${p}`]);
    if (e.keyword === 'additionalProperties') return diag('schema/unknown-field', `${p} has unknown field "${e.params.additionalProperty}".`, { path: `${p}/${e.params.additionalProperty}` }, {}, [`remove ${p}/${e.params.additionalProperty}`, 'check the field name against schemas/storyboard.schema.json']);
    if (e.keyword === 'enum') return diag('schema/enum', `${p} must be one of ${e.params.allowedValues.join(', ')}.`, { path: p }, { allowed: e.params.allowedValues }, e.params.allowedValues.map(v => `set ${p} to "${v}"`));
    return diag(`schema/${e.keyword}`, `${p} ${e.message}.`, { path: p }, e.params, []);
  });
}

// Node and edge ids that exist in the rendered Archify SVG (render only, no browser).
export function diagramIds(type, specPath) {
  const cli = archifyCli();
  if (!cli) return null;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hiw-ids-')), 'd.html');
  const r = spawnSync(process.execPath, [cli, 'render', type, specPath, out], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) return { error: (r.stderr || r.stdout).trim().split('\n')[0] };
  const html = fs.readFileSync(out, 'utf8');
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return {
    nodes: [...new Set([...html.matchAll(/<g[^>]*data-node-id="([^"]+)"/g)].map(m => m[1]))],
    edges: [...new Set([...html.matchAll(/data-edge-id="([^"]+)"/g)].map(m => m[1]))],
  };
}

export function validateStoryboard(sb, sbPath) {
  const diagnostics = [];
  if (!check(sb)) return { ok: false, diagnostics: schemaDiagnostics(check.errors) };
  const dir = path.dirname(path.resolve(sbPath));
  const kinds = sb.scenes.map(s => s.kind);

  const seen = new Set();
  sb.scenes.forEach((s, i) => {
    if (seen.has(s.id)) diagnostics.push(diag('scene/duplicate-id', `Scene id "${s.id}" is used twice.`, { path: `/scenes/${i}/id`, scene: s.id }, {}, [`rename /scenes/${i}/id to "${s.id}-2"`]));
    seen.add(s.id);
  });

  const need = { 'task-tutorial': 'ui', 'feature-release': 'ui', 'architecture-explainer': 'diagram' }[sb.kind];
  if (!kinds.includes(need)) diagnostics.push(diag('storyboard/kind-mismatch', `A ${sb.kind} needs at least one "${need}" scene.`, { path: '/scenes' }, { sceneKinds: kinds }, [`add a scene with kind "${need}"`, 'or change /kind']));
  if (sb.kind === 'feature-release' && !sb.release) diagnostics.push(diag('storyboard/missing-release', 'A feature-release needs /release with version and highlights.', { path: '/release' }, {}, ['add /release { "version": "...", "highlights": ["..."] }']));
  if (kinds.includes('ui') && !sb.product) diagnostics.push(diag('storyboard/missing-product', 'UI scenes need /product.url to capture the real product.', { path: '/product' }, {}, ['add /product { "url": "https://..." }']));

  const ids = {};
  for (const [name, d] of Object.entries(sb.diagrams || {})) {
    const spec = path.resolve(dir, d.spec);
    if (!fs.existsSync(spec)) { diagnostics.push(diag('diagram/spec-missing', `Diagram "${name}" spec not found: ${d.spec}.`, { path: `/diagrams/${name}/spec` }, { resolved: spec }, ['fix the path; it is relative to the storyboard file'])); continue; }
    const got = diagramIds(d.type, spec);
    if (!got) { diagnostics.push(diag('env/archify-missing', 'Archify is not installed; diagram scenes cannot be rendered.', { path: `/diagrams/${name}` }, {}, ['install the archify skill or set ARCHIFY_HOME'])); continue; }
    if (got.error) { diagnostics.push(diag('diagram/archify-render', `Archify could not render "${name}": ${got.error}`, { path: `/diagrams/${name}` }, {}, [`run: node <archify>/bin/archify.mjs validate ${d.type} ${d.spec} --json`, 'fix the Archify spec first'])); continue; }
    ids[name] = got;
  }

  sb.scenes.forEach((s, i) => {
    const at = `/scenes/${i}`;
    if (s.kind !== 'diagram') return;
    if (!sb.diagrams?.[s.diagram]) { diagnostics.push(diag('scene/unknown-diagram', `Scene "${s.id}" uses unknown diagram "${s.diagram}".`, { path: `${at}/diagram`, scene: s.id }, { available: Object.keys(sb.diagrams || {}) }, Object.keys(sb.diagrams || {}).map(n => `set ${at}/diagram to "${n}"`))); return; }
    const got = ids[s.diagram];
    if (!got) return;
    s.focus.forEach((n, k) => { if (!got.nodes.includes(n)) diagnostics.push(diag('scene/unknown-node', `Scene "${s.id}" focuses unknown node "${n}".`, { path: `${at}/focus/${k}`, scene: s.id }, { availableNodeIds: got.nodes }, got.nodes.slice(0, 6).map(v => `set ${at}/focus/${k} to "${v}"`))); });
    (s.trace || []).forEach((e, k) => { if (!got.edges.includes(e)) diagnostics.push(diag('scene/unknown-edge', `Scene "${s.id}" traces unknown edge "${e}".`, { path: `${at}/trace/${k}`, scene: s.id }, { availableEdgeIds: got.edges }, got.edges.slice(0, 6).map(v => `set ${at}/trace/${k} to "${v}"`))); });
  });

  // Reading speed is checked before any audio exists: ~15 chars/s is the spoken target.
  sb.scenes.forEach((s, i) => {
    if (s.narration && s.narration.length > 200) diagnostics.push(diag('scene/narration-long', `Scene "${s.id}" narration is ${s.narration.length} chars; keep one scene under ~12 s of speech.`, { path: `/scenes/${i}/narration`, scene: s.id }, { chars: s.narration.length }, ['split the scene in two', 'shorten the narration'], 'warning'));
  });

  if (sb.tts?.engine === 'kokoro' && sb.language !== 'en') diagnostics.push(diag('tts/language', `Kokoro voices here are English; language is "${sb.language}".`, { path: '/tts/engine' }, {}, ['set /tts/engine to "say" or "none"']));

  return { ok: !diagnostics.some(d => d.severity === 'error'), diagnostics, diagramIds: ids };
}

export function resolveDefaults(sb) {
  return {
    ...sb,
    formats: sb.formats || DEFAULT_FORMATS[sb.kind],
    tts: sb.tts || (sb.language === 'en' ? { engine: 'kokoro', voice: 'af_heart', speed: 1 } : { engine: 'say' }),
    audio: { music: 'default', sfx: true, ...(sb.audio || {}) },
    product: sb.product ? { viewport: { width: 1280, height: 720 }, ...sb.product } : undefined,
  };
}
