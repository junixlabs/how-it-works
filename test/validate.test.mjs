// Validator contract: each broken storyboard yields the expected diagnostic code at the expected path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStoryboard } from '../lib/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = n => path.join(ROOT, 'examples', n);
const load = n => JSON.parse(fs.readFileSync(ex(n), 'utf8'));
const codes = r => r.diagnostics.map(d => `${d.code}@${d.subject.path}`);

test('all examples are valid', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.json'))) {
    const r = validateStoryboard(load(f), ex(f));
    assert.equal(r.ok, true, `${f}: ${codes(r).join(', ')}`);
  }
});

test('unknown field is reported with a removal fix', () => {
  const sb = load('task-tutorial.json');
  sb.scenes[0].colour = 'red';
  const r = validateStoryboard(sb, ex('task-tutorial.json'));
  assert.equal(r.ok, false);
  const d = r.diagnostics.find(x => x.code === 'schema/unknown-field');
  assert.equal(d.subject.path, '/scenes/0/colour');
  assert.ok(d.supportedFixes[0].startsWith('remove'));
});

test('ui scene without expect is rejected', () => {
  const sb = load('task-tutorial.json');
  delete sb.scenes[1].expect;
  const r = validateStoryboard(sb, ex('task-tutorial.json'));
  assert.ok(codes(r).includes('schema/required@/scenes/1'));
});

test('kind needs matching scenes', () => {
  const sb = load('task-tutorial.json');
  sb.kind = 'architecture-explainer';
  const r = validateStoryboard(sb, ex('task-tutorial.json'));
  assert.ok(r.diagnostics.some(d => d.code === 'storyboard/kind-mismatch'));
});

test('feature-release without release block is rejected', () => {
  const sb = load('feature-release.json');
  delete sb.release;
  const r = validateStoryboard(sb, ex('feature-release.json'));
  assert.ok(r.diagnostics.some(d => d.code === 'storyboard/missing-release'));
});

test('duplicate scene ids are rejected', () => {
  const sb = load('task-tutorial.json');
  sb.scenes[2].id = sb.scenes[1].id;
  const r = validateStoryboard(sb, ex('task-tutorial.json'));
  assert.ok(codes(r).includes('scene/duplicate-id@/scenes/2/id'));
});

test('unknown diagram node and edge list the real ids', () => {
  const sb = load('architecture-explainer.json');
  sb.scenes[0].focus[1] = 'validator';
  sb.scenes[0].trace = ['sb-to-validate'];
  const r = validateStoryboard(sb, ex('architecture-explainer.json'));
  const node = r.diagnostics.find(d => d.code === 'scene/unknown-node');
  const edge = r.diagnostics.find(d => d.code === 'scene/unknown-edge');
  assert.equal(node.subject.path, '/scenes/0/focus/1');
  assert.ok(node.evidence.availableNodeIds.includes('validate'));
  assert.equal(edge.subject.path, '/scenes/0/trace/0');
  assert.ok(edge.evidence.availableEdgeIds.includes('sb-validate'));
});

test('missing diagram spec file is reported', () => {
  const sb = load('architecture-explainer.json');
  sb.diagrams.pipeline.spec = 'diagrams/nope.json';
  const r = validateStoryboard(sb, ex('architecture-explainer.json'));
  assert.ok(r.diagnostics.some(d => d.code === 'diagram/spec-missing'));
});

test('kokoro with a non-English storyboard is rejected', () => {
  const sb = load('task-tutorial.json');
  sb.language = 'vi';
  sb.tts = { engine: 'kokoro' };
  const r = validateStoryboard(sb, ex('task-tutorial.json'));
  assert.ok(r.diagnostics.some(d => d.code === 'tts/language'));
});
