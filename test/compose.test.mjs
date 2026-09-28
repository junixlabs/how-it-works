// Composer contract: deterministic bytes (golden), and every timeline selector targets a real element.
// Update goldens deliberately with: UPDATE_GOLDEN=1 node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../lib/compose.mjs';
import { resolveDefaults } from '../lib/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(ROOT, 'test/fixtures');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// Tiny synthetic diagram: three nodes, two edges (no browser or Archify needed).
const DIAGRAM = {
  viewBox: { x: 0, y: 0, w: 600, h: 300 },
  nodes: { a: { x: 40, y: 120, w: 120, h: 50, label: 'Alpha' }, b: { x: 240, y: 120, w: 120, h: 50, label: 'Beta' }, c: { x: 440, y: 120, w: 120, h: 50, label: 'Gamma' } },
  edges: {
    'a-b': { x: 160, y: 145, w: 80, h: 1, from: 'a', to: 'b', label: '', length: 80, d: 'M 160 145 L 240 145' },
    'b-c': { x: 360, y: 145, w: 80, h: 1, from: 'b', to: 'c', label: '', length: 80, d: 'M 360 145 L 440 145' },
  },
  svg: '<svg viewBox="0 0 600 300" width="600" height="300"><g id="node-a" data-node-id="a"><rect x="40" y="120" width="120" height="50"/></g><g id="node-b" data-node-id="b"><rect x="240" y="120" width="120" height="50"/></g><g id="node-c" data-node-id="c"><rect x="440" y="120" width="120" height="50"/></g><path data-edge-id="a-b" data-edge-from="a" data-edge-to="b" d="M 160 145 L 240 145"/><path data-edge-id="b-c" data-edge-from="b" data-edge-to="c" d="M 360 145 L 440 145"/></svg>',
  fonts: '', background: 'rgb(2, 6, 23)',
};

const cases = {
  'task-tutorial-16x9': () => ({ sb: resolveDefaults(read(path.join(ROOT, 'examples/task-tutorial.json'))), ev: read(`${FX}/ui-evidence.json`), vo: read(`${FX}/ui-vo.json`), format: 'video-16x9' }),
  'task-tutorial-9x16': () => ({ sb: resolveDefaults(read(path.join(ROOT, 'examples/task-tutorial.json'))), ev: read(`${FX}/ui-evidence.json`), vo: read(`${FX}/ui-vo.json`), format: 'video-9x16' }),
  'explainer-mixed-16x9': () => ({
    sb: resolveDefaults({ schema_version: 1, kind: 'architecture-explainer', id: 'mini', title: 'Mini system', language: 'en', diagrams: { d: { type: 'workflow', spec: 'x.json' } },
      scenes: [
        { id: 'intro-card', kind: 'title', title: 'Overview', heading: 'Three parts', narration: 'Three parts work together.' },
        { id: 'first', kind: 'diagram', diagram: 'd', title: 'Start', focus: ['a', 'b'], trace: ['a-b'], narration: 'Alpha hands work to Beta.' },
        { id: 'all', kind: 'diagram', diagram: 'd', title: 'Everything', focus: ['a', 'b', 'c'], trace: ['b-c'], narration: 'Beta finishes with Gamma.' },
      ] }),
    ev: null, diagrams: { d: DIAGRAM }, vo: { 'intro-card': { dur: 2, words: null }, first: { dur: 2.4, words: null }, all: { dur: 2.2, words: null } }, format: 'video-16x9' }),
};

for (const [name, make] of Object.entries(cases)) {
  test(`golden ${name}`, () => {
    const { html } = compose(make());
    const golden = path.join(FX, `${name}.golden.html`);
    if (process.env.UPDATE_GOLDEN || !fs.existsSync(golden)) fs.writeFileSync(golden, html);
    assert.equal(html, fs.readFileSync(golden, 'utf8'), `${name} output changed; review, then UPDATE_GOLDEN=1`);
  });

  test(`selectors resolve ${name}`, () => {
    const { html } = compose(make());
    const script = html.slice(html.indexOf('const tl = gsap.timeline'));
    const body = html.slice(0, html.indexOf('<script>\n  window.__timelines'));
    const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    const dupes = [...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) !== i);
    assert.deepEqual(dupes, [], 'duplicate element ids');
    const refs = [...script.matchAll(/#([A-Za-z0-9_-]+)/g)].map(m => m[1]).filter(r => !/^[0-9a-f]{3,8}$/i.test(r));
    const missing = [...new Set(refs.filter(r => !ids.has(r)))];
    assert.deepEqual(missing, [], 'timeline targets ids that do not exist');
    for (const m of script.matchAll(/data-(?:node-id|trace|ring|edge-id)="([^"]+)"/g)) assert.ok(body.includes(`="${m[1]}"`), `attribute target ${m[1]} missing`);
  });
}
